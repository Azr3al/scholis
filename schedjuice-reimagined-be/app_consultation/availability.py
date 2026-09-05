from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from django.db import connection
from django.utils import timezone as dj_timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_consultation.exceptions import ConsultationAvailabilityError
from app_consultation.freebusy_cache import (
    get_cached_freebusy,
    invalidate_freebusy_cache,
    set_cached_freebusy,
)
from app_consultation.slot_generator import generate_consultation_slots, org_timezone
from app_google.calendar import BusyBlock, GoogleCalendarError, fetch_free_busy
from app_organization.models import Organization


def _organization_for_current_schema() -> Organization | None:
    schema_name = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema_name).first()


def _resolve_org_timezone(org_or_tz: Any | None) -> Any:
    if org_or_tz is not None:
        return org_or_tz
    organization = _organization_for_current_schema()
    return getattr(organization, "timezone", None) or "UTC"


def _tenant_schema() -> str:
    return connection.schema_name


def _busy_blocks_to_tuples(
    blocks: Iterable[BusyBlock | tuple[datetime, datetime]],
) -> list[tuple[datetime, datetime]]:
    tuples: list[tuple[datetime, datetime]] = []
    for block in blocks:
        if isinstance(block, tuple):
            tuples.append(block)
        else:
            tuples.append((block.start, block.end))
    return tuples


def _day_utc_bounds(target_date: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    day_start_local = datetime.combine(target_date, time.min, tzinfo=tz)
    day_end_local = datetime.combine(target_date + timedelta(days=1), time.min, tzinfo=tz)
    return (
        day_start_local.astimezone(dj_timezone.utc),
        day_end_local.astimezone(dj_timezone.utc),
    )


def _month_utc_bounds(year: int, month: int, tz: ZoneInfo) -> tuple[datetime, datetime]:
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])
    month_start_local = datetime.combine(first_day, time.min, tzinfo=tz)
    month_end_local = datetime.combine(
        last_day + timedelta(days=1),
        time.min,
        tzinfo=tz,
    )
    return (
        month_start_local.astimezone(dj_timezone.utc),
        month_end_local.astimezone(dj_timezone.utc),
    )


def _busy_blocks_for_date(
    blocks: Iterable[tuple[datetime, datetime]],
    target_date: date,
    tz: ZoneInfo,
) -> list[tuple[datetime, datetime]]:
    day_start_utc, day_end_utc = _day_utc_bounds(target_date, tz)
    filtered: list[tuple[datetime, datetime]] = []
    for block_start, block_end in blocks:
        if block_start < day_end_utc and block_end > day_start_utc:
            filtered.append((block_start, block_end))
    return filtered


def _fetch_free_busy(
    consultant,
    time_min: datetime,
    time_max: datetime,
) -> list[tuple[datetime, datetime]]:
    try:
        blocks = fetch_free_busy(consultant, time_min, time_max)
    except GoogleCalendarError as exc:
        raise ConsultationAvailabilityError(str(exc)) from exc
    return _busy_blocks_to_tuples(blocks)


def _get_freebusy_for_date(
    consultant,
    target_date: date,
    tz: ZoneInfo,
    *,
    use_cache: bool,
) -> list[tuple[datetime, datetime]]:
    tenant_schema = _tenant_schema()
    consultant_id = consultant.id

    if use_cache:
        cached = get_cached_freebusy(tenant_schema, consultant_id, target_date)
        if cached is not None:
            return cached

    time_min, time_max = _day_utc_bounds(target_date, tz)
    blocks = _fetch_free_busy(consultant, time_min, time_max)

    if use_cache:
        set_cached_freebusy(tenant_schema, consultant_id, target_date, blocks)

    return blocks


def invalidate_freebusy_cache_for_booking(consultant, scheduled_at: datetime) -> None:
    org_tz = org_timezone(_resolve_org_timezone(None))
    if dj_timezone.is_naive(scheduled_at):
        scheduled_at = dj_timezone.make_aware(scheduled_at, dj_timezone.utc)
    local_date = scheduled_at.astimezone(org_tz).date()
    invalidate_freebusy_cache(_tenant_schema(), consultant.id, local_date)


def get_open_slots(
    consultant,
    target_date: date,
    org_or_tz: Any | None = None,
    *,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    tz_name = _resolve_org_timezone(org_or_tz)
    busy_blocks = _get_freebusy_for_date(consultant, target_date, org_timezone(tz_name), use_cache=True)
    return generate_consultation_slots(
        target_date,
        consultant,
        tz_name,
        busy_blocks=busy_blocks,
        now=now,
    )


def get_dates_with_slots(
    consultant,
    month: date,
    org_or_tz: Any | None = None,
    *,
    now: datetime | None = None,
) -> list[date]:
    tz_name = _resolve_org_timezone(org_or_tz)
    tz = org_timezone(tz_name)
    year, month_num = month.year, month.month
    time_min, time_max = _month_utc_bounds(year, month_num, tz)
    month_busy = _fetch_free_busy(consultant, time_min, time_max)

    last_day = monthrange(year, month_num)[1]
    dates_with_slots: list[date] = []
    for day in range(1, last_day + 1):
        target_date = date(year, month_num, day)
        day_busy = _busy_blocks_for_date(month_busy, target_date, tz)
        slots = generate_consultation_slots(
            target_date,
            consultant,
            tz_name,
            busy_blocks=day_busy,
            now=now,
        )
        if slots:
            dates_with_slots.append(target_date)

    return dates_with_slots


def is_slot_available(
    consultant,
    scheduled_at: datetime,
    org_or_tz: Any | None = None,
    *,
    now: datetime | None = None,
) -> bool:
    tz_name = _resolve_org_timezone(org_or_tz)
    tz = org_timezone(tz_name)
    if dj_timezone.is_naive(scheduled_at):
        scheduled_at = dj_timezone.make_aware(scheduled_at, dj_timezone.utc)
    target_date = scheduled_at.astimezone(tz).date()
    busy_blocks = _get_freebusy_for_date(
        consultant,
        target_date,
        tz,
        use_cache=False,
    )
    slots = generate_consultation_slots(
        target_date,
        consultant,
        tz_name,
        busy_blocks=busy_blocks,
        now=now,
    )
    for slot in slots:
        slot_at = slot["scheduled_at"]
        if dj_timezone.is_naive(slot_at):
            slot_at = dj_timezone.make_aware(slot_at, dj_timezone.utc)
        if slot_at == scheduled_at:
            return True
    return False
