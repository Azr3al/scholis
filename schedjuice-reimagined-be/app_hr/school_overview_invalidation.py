from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Iterable, Optional

from dateutil import tz as dateutil_tz
from django.db import connection
from django.utils import timezone as dj_timezone

from app_hr.school_overview_cache import invalidate_school_overview_cache

logger = logging.getLogger(__name__)


def _schema_name() -> str:
    return getattr(connection, "schema_name", None) or "public"


def _timezone_code(explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit
    tenant = getattr(connection, "tenant", None)
    code = getattr(tenant, "timezone", None) if tenant is not None else None
    return (code or "UTC").strip() or "UTC"


def invalidate_school_overview_for_year_month(
    year: int,
    month: int,
    *,
    schema_name: Optional[str] = None,
) -> None:
    try:
        invalidate_school_overview_cache(schema_name or _schema_name(), year, month)
    except Exception:
        logger.exception(
            "school_overview_invalidation: failed year=%s month=%s", year, month
        )


def invalidate_school_overview_current_month(
    *,
    schema_name: Optional[str] = None,
    timezone_code: Optional[str] = None,
) -> None:
    try:
        tzinfo = dateutil_tz.gettz(_timezone_code(timezone_code))
        now = datetime.now(tzinfo)
        invalidate_school_overview_for_year_month(
            now.year, now.month, schema_name=schema_name
        )
    except Exception:
        logger.exception("school_overview_invalidation: current month failed")


def _local_year_month_from_event_date(
    event_date, timezone_code: Optional[str] = None
) -> Optional[tuple[int, int]]:
    if event_date is None:
        return None
    tzinfo = dateutil_tz.gettz(_timezone_code(timezone_code))
    if isinstance(event_date, datetime):
        dt = event_date
        if dj_timezone.is_naive(dt):
            dt = dj_timezone.make_aware(dt, dj_timezone.utc)
        local = dt.astimezone(tzinfo)
        return local.year, local.month
    if isinstance(event_date, date):
        return event_date.year, event_date.month
    return None


def invalidate_school_overview_for_event_date(
    event_date,
    *,
    schema_name: Optional[str] = None,
    timezone_code: Optional[str] = None,
) -> None:
    try:
        ym = _local_year_month_from_event_date(event_date, timezone_code)
        if ym is None:
            invalidate_school_overview_current_month(
                schema_name=schema_name, timezone_code=timezone_code
            )
            return
        invalidate_school_overview_for_year_month(
            ym[0], ym[1], schema_name=schema_name
        )
    except Exception:
        logger.exception("school_overview_invalidation: event_date failed")


def invalidate_school_overview_for_user_event(
    user_event,
    *,
    schema_name: Optional[str] = None,
    timezone_code: Optional[str] = None,
) -> None:
    try:
        event = getattr(user_event, "event", None)
        event_date = getattr(event, "date", None) if event is not None else None
        if event_date is None:
            event_id = getattr(user_event, "event_id", None)
            if event_id:
                from app_course.models import Event

                event_date = (
                    Event.objects.filter(id=event_id)
                    .values_list("date", flat=True)
                    .first()
                )
        invalidate_school_overview_for_event_date(
            event_date,
            schema_name=schema_name,
            timezone_code=timezone_code,
        )
    except Exception:
        logger.exception("school_overview_invalidation: user_event failed")


def invalidate_school_overview_for_user_event_ids(
    user_event_ids: Iterable[int],
    *,
    schema_name: Optional[str] = None,
    timezone_code: Optional[str] = None,
) -> None:
    ids = [int(i) for i in user_event_ids if i is not None]
    if not ids:
        return
    try:
        from app_attendance.models import UserEvent

        dates = (
            UserEvent.all_objects.filter(id__in=ids)
            .values_list("event__date", flat=True)
            .distinct()
        )
        months: set[tuple[int, int]] = set()
        for d in dates:
            ym = _local_year_month_from_event_date(d, timezone_code)
            if ym:
                months.add(ym)
        if not months:
            invalidate_school_overview_current_month(
                schema_name=schema_name, timezone_code=timezone_code
            )
            return
        for year, month in months:
            invalidate_school_overview_for_year_month(
                year, month, schema_name=schema_name
            )
    except Exception:
        logger.exception("school_overview_invalidation: user_event_ids failed")
