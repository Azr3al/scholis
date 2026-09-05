from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.utils import timezone as django_tz

from app_course.models import Event

MAX_SESSION_MINUTES = 24 * 60
OVERNIGHT_CONFIRM_THRESHOLD_MINUTES = 120


def normalize_time(value: time | str) -> time:
    if isinstance(value, time):
        return value.replace(second=0, microsecond=0)
    parts = str(value).split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0
    return time(hour, minute)


def is_overnight(time_from: time, time_to: time) -> bool:
    tf = normalize_time(time_from)
    tt = normalize_time(time_to)
    return tt <= tf and tf != tt


def session_duration_minutes(time_from: time, time_to: time) -> int:
    tf = normalize_time(time_from)
    tt = normalize_time(time_to)
    start_m = tf.hour * 60 + tf.minute
    end_m = tt.hour * 60 + tt.minute
    if end_m > start_m:
        return end_m - start_m
    if end_m == start_m:
        return 0
    return (24 * 60 - start_m) + end_m


def validate_session_time_range(time_from: time, time_to: time) -> None:
    minutes = session_duration_minutes(time_from, time_to)
    if minutes <= 0:
        raise ValidationError(
            {"time_to": "Event ending time cannot be before the event starting time."}
        )
    if minutes > MAX_SESSION_MINUTES:
        raise ValidationError({"time_to": "Session cannot be longer than 24 hours."})


def event_local_date(event: Event, tz: ZoneInfo) -> date:
    dt = event.date
    if django_tz.is_naive(dt):
        dt = django_tz.make_aware(dt, django_tz.get_current_timezone())
    return dt.astimezone(tz).date()


def event_bounds_local(event: Event, tz: ZoneInfo) -> tuple[datetime, datetime]:
    local_day = event_local_date(event, tz)
    start = datetime.combine(local_day, normalize_time(event.time_from), tzinfo=tz)
    end_day = local_day
    end_time = normalize_time(event.time_to)
    if is_overnight(event.time_from, event.time_to):
        end_day = local_day + timedelta(days=1)
    end = datetime.combine(end_day, end_time, tzinfo=tz)
    return start, end


def events_overlap(a: Event, b: Event, tz: ZoneInfo) -> bool:
    a0, a1 = event_bounds_local(a, tz)
    b0, b1 = event_bounds_local(b, tz)
    return a0 < b1 and a1 > b0
