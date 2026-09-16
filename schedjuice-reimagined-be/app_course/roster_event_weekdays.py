from __future__ import annotations

from datetime import datetime
from typing import Iterable
from zoneinfo import ZoneInfo


def event_weekday(event_date: datetime, tz_name: str) -> int:
    """Return 0=Sunday … 6=Saturday in org timezone (JS Date.getDay)."""
    tz = ZoneInfo(tz_name or "UTC")
    if event_date.tzinfo is None:
        local = event_date.replace(tzinfo=tz)
    else:
        local = event_date.astimezone(tz)
    return (local.weekday() + 1) % 7


def filter_events_for_weekdays(
    events: Iterable,
    *,
    weekdays: list[int] | None,
    tz_name: str,
) -> list:
    items = list(events)
    if not weekdays:
        return items
    allowed = {int(day) for day in weekdays}
    out = []
    for event in items:
        dt = event.date if hasattr(event, "date") else event["date"]
        if event_weekday(dt, tz_name) in allowed:
            out.append(event)
    return out


WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


def format_weekday_labels(weekdays: list[int] | None) -> list[str]:
    if not weekdays:
        return ["All sessions"]
    return [WEEKDAY_LABELS[int(day)] for day in sorted(set(weekdays))]
