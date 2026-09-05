from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone as dj_timezone

from app_consultation.constants import (
    SLOT_DURATION_MINUTES,
    WEEKDAY_KEYS,
    slot_blocking_statuses,
)
from app_consultation.models import ConsultationBooking, ConsultationWeeklyWhitelist

BusyBlock = tuple[datetime, datetime]


def org_timezone(org_or_tz: Any) -> ZoneInfo:
    if isinstance(org_or_tz, ZoneInfo):
        return org_or_tz
    tz_name = org_or_tz
    if hasattr(org_or_tz, "timezone"):
        tz_name = getattr(org_or_tz, "timezone", None) or "UTC"
    try:
        return ZoneInfo(tz_name or "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _weekday_key(target_date: date) -> str:
    return WEEKDAY_KEYS[target_date.weekday()]


def _parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def _iter_slot_starts(
    window_start: time, window_end: time, duration_minutes: int
) -> list[time]:
    cursor = datetime.combine(date.min, window_start)
    end = datetime.combine(date.min, window_end)
    duration = timedelta(minutes=duration_minutes)
    slots: list[time] = []
    while cursor + duration <= end:
        slots.append(cursor.time())
        cursor += duration
    return slots


def _local_slot_bounds(
    target_date: date, slot_start: time, tz: ZoneInfo
) -> tuple[datetime, datetime]:
    start_local = datetime.combine(target_date, slot_start, tzinfo=tz)
    end_local = start_local + timedelta(minutes=SLOT_DURATION_MINUTES)
    return start_local, end_local


def _overlaps(
    slot_start: datetime, slot_end: datetime, block_start: datetime, block_end: datetime
) -> bool:
    return slot_start < block_end and slot_end > block_start


def _format_slot_time(slot_start: time) -> str:
    return slot_start.strftime("%H:%M")


def generate_consultation_slots(
    target_date: date,
    consultant,
    org_or_tz: Any,
    *,
    busy_blocks: Iterable[BusyBlock] | None = None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    tz = org_timezone(org_or_tz)
    try:
        whitelist = ConsultationWeeklyWhitelist.objects.get(consultant=consultant)
    except ConsultationWeeklyWhitelist.DoesNotExist:
        return []

    day_config = (whitelist.schedule or {}).get(_weekday_key(target_date), {})
    if not day_config.get("enabled"):
        return []

    windows = day_config.get("windows") or []
    if not windows:
        return []

    now_utc = now or dj_timezone.now()
    if dj_timezone.is_naive(now_utc):
        now_utc = dj_timezone.make_aware(now_utc, dj_timezone.utc)
    now_local = now_utc.astimezone(tz)
    is_today = target_date == now_local.date()

    day_start_local = datetime.combine(target_date, time.min, tzinfo=tz)
    day_end_local = datetime.combine(target_date + timedelta(days=1), time.min, tzinfo=tz)
    day_start_utc = day_start_local.astimezone(dj_timezone.utc)
    day_end_utc = day_end_local.astimezone(dj_timezone.utc)

    blocking_bookings = ConsultationBooking.objects.filter(
        consultant=consultant,
        status__in=slot_blocking_statuses(),
        scheduled_at__gte=day_start_utc,
        scheduled_at__lt=day_end_utc,
    )
    booking_blocks: list[BusyBlock] = []
    for booking in blocking_bookings:
        start_utc = booking.scheduled_at
        if dj_timezone.is_naive(start_utc):
            start_utc = dj_timezone.make_aware(start_utc, dj_timezone.utc)
        end_utc = start_utc + timedelta(minutes=booking.duration_minutes)
        booking_blocks.append((start_utc, end_utc))

    external_busy = list(busy_blocks or [])
    all_busy = external_busy + booking_blocks

    slots: list[dict[str, Any]] = []
    for window in windows:
        window_start = _parse_hhmm(window["start"])
        window_end = _parse_hhmm(window["end"])
        for slot_start in _iter_slot_starts(
            window_start, window_end, SLOT_DURATION_MINUTES
        ):
            start_local, end_local = _local_slot_bounds(target_date, slot_start, tz)
            if is_today and start_local <= now_local:
                continue

            start_utc = start_local.astimezone(dj_timezone.utc)
            end_utc = end_local.astimezone(dj_timezone.utc)

            if any(
                _overlaps(start_utc, end_utc, block_start, block_end)
                for block_start, block_end in all_busy
            ):
                continue

            slots.append(
                {
                    "slot_time": _format_slot_time(slot_start),
                    "scheduled_at": start_utc,
                }
            )

    slots.sort(key=lambda row: row["scheduled_at"])
    return slots
