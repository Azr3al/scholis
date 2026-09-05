"""
Classify a session into in_progress / upcoming / completed relative to `now`
in a given tenant timezone.

Mirrors mobile `lib/shortcuts/event-buckets.ts` (parity audits).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Protocol

from app_utility_notifications.tenant_time import event_instant_in_timezone


class EventBucket(str, Enum):
    IN_PROGRESS = "in_progress"
    UPCOMING = "upcoming"
    COMPLETED = "completed"


class EventLike(Protocol):
    date: datetime | str
    time_from: str | datetime
    time_to: str | datetime


def _time_to_str(value: str | datetime) -> str:
    if isinstance(value, datetime):
        return value.strftime("%H:%M:%S")
    return str(value)


def classify_event(
    ev: EventLike,
    now: datetime,
    tenant_tz: str,
) -> EventBucket | None:
    start = event_instant_in_timezone(ev.date, _time_to_str(ev.time_from), tenant_tz)
    end = event_instant_in_timezone(ev.date, _time_to_str(ev.time_to), tenant_tz)
    if not start or not end:
        return None
    if now >= start and now <= end:
        return EventBucket.IN_PROGRESS
    if now < start:
        return EventBucket.UPCOMING
    return EventBucket.COMPLETED
