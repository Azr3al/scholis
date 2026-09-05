"""
Tenant-timezone day arithmetic for utility notifications.

Mirrors mobile `lib/shortcuts/shortcuts-time.ts`.
"""

from __future__ import annotations

import datetime as dt
from datetime import datetime
from zoneinfo import ZoneInfo

_TZ_NAME_ALIASES = {
    "Asia/Rangoon": "Asia/Yangon",
}


def _resolve_tz(tenant_tz: str) -> ZoneInfo:
    name = _TZ_NAME_ALIASES.get(tenant_tz, tenant_tz) or "UTC"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("UTC")


def get_tenant_today_ymd(tenant_tz: str, now: datetime) -> str:
    """Today's calendar date (YYYY-MM-DD) in the tenant timezone."""
    return datetime_to_tenant_ymd(now, tenant_tz)


def datetime_to_tenant_ymd(value: datetime, tenant_tz: str) -> str:
    """Format a UTC-aware datetime as YYYY-MM-DD in the tenant timezone."""
    tz = _resolve_tz(tenant_tz)
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(tz).strftime("%Y-%m-%d")


def get_tenant_day_boundaries(
    now: datetime,
    tenant_tz: str,
    ymd: str,
) -> tuple[datetime, datetime]:
    """UTC-aware datetimes bracketing one tenant calendar day (inclusive end)."""
    tz = _resolve_tz(tenant_tz)
    start_local = datetime.strptime(f"{ymd} 00:00:00", "%Y-%m-%d %H:%M:%S").replace(
        tzinfo=tz
    )
    end_local = datetime.strptime(f"{ymd} 23:59:59.999999", "%Y-%m-%d %H:%M:%S.%f").replace(
        tzinfo=tz
    )
    return start_local.astimezone(dt.timezone.utc), end_local.astimezone(dt.timezone.utc)


def add_calendar_days_to_tenant_ymd(ymd: str, tenant_tz: str, delta: int) -> str:
    """
    Shift a tenant calendar day by N days. Uses a noon wall-clock anchor so DST
    transitions don't bump us into the adjacent calendar day.
    """
    tz = _resolve_tz(tenant_tz)
    anchor_local = datetime.strptime(f"{ymd} 12:00:00", "%Y-%m-%d %H:%M:%S").replace(
        tzinfo=tz
    )
    shifted = anchor_local + dt.timedelta(days=delta)
    return shifted.astimezone(tz).strftime("%Y-%m-%d")


def event_instant_in_timezone(
    date_input: datetime | str,
    time_str: str | None,
    tenant_tz: str,
) -> datetime | None:
    """
    Interpret a tenant-local `date + time` pair as a UTC instant.
    Returns None when either input is empty/invalid.
    """
    if not time_str or not str(time_str).strip():
        return None

    date_str = ""
    if isinstance(date_input, str):
        date_str = date_input[:10]
    elif isinstance(date_input, datetime):
        if date_input.tzinfo is None:
            date_input = date_input.replace(tzinfo=dt.timezone.utc)
        local = date_input.astimezone(_resolve_tz(tenant_tz))
        date_str = local.strftime("%Y-%m-%d")

    if not date_str:
        return None

    trimmed = str(time_str).strip()
    with_seconds = trimmed if len(trimmed) > 5 else f"{trimmed}:00"

    try:
        tz = _resolve_tz(tenant_tz)
        local = datetime.strptime(
            f"{date_str} {with_seconds}",
            "%Y-%m-%d %H:%M:%S" if len(with_seconds) > 5 else "%Y-%m-%d %H:%M",
        ).replace(tzinfo=tz)
        return local.astimezone(dt.timezone.utc)
    except (ValueError, TypeError):
        return None
