from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone as dj_timezone

from app_course.event_overlap import event_local_date


def _event_start_utc(event, tenant) -> datetime:
    tz_obj = _tenant_tz(tenant)
    date_part = event_local_date(event, tz_obj)
    start_naive = datetime.combine(date_part, event.time_from)
    local = start_naive.replace(tzinfo=tz_obj)
    return local.astimezone(dj_timezone.utc)


def _tenant_tz(tenant):
    tz_name = getattr(tenant, "timezone", None) or "UTC"
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def get_checkin_window(*, event, tenant, now, grace_minutes: int) -> dict:
    from app_attendance.views import _get_event_end_utc

    start = _event_start_utc(event, tenant)
    end = _get_event_end_utc(event, tenant)
    opens_at = start - timedelta(minutes=max(grace_minutes, 0))
    if now < opens_at:
        return {
            "opens_at": opens_at,
            "closes_at": end,
            "allowed": False,
            "block_reason": "checkin_too_early",
        }
    if now > end:
        return {
            "opens_at": opens_at,
            "closes_at": end,
            "allowed": False,
            "block_reason": "checkin_after_event_end",
        }
    return {
        "opens_at": opens_at,
        "closes_at": end,
        "allowed": True,
        "block_reason": None,
    }


def select_next_checkin_user_event(
    *,
    unchecked_user_events,
    tenant,
    now,
    grace_minutes: int,
) -> tuple:
    """
    Pick the UserEvent to surface for check-in status or POST.

    Walks unchecked sessions in chronological order and skips any whose
    check-in window has closed. If every unchecked session has ended,
    returns the last ended session so the UI can show checkin_after_event_end.
    """
    last_ended_user_event = None
    last_ended_window = None

    for user_event in unchecked_user_events:
        window = get_checkin_window(
            event=user_event.event,
            tenant=tenant,
            now=now,
            grace_minutes=grace_minutes,
        )
        if window["block_reason"] == "checkin_after_event_end":
            last_ended_user_event = user_event
            last_ended_window = window
            continue
        return user_event, window

    if last_ended_user_event is not None:
        return last_ended_user_event, last_ended_window

    return None, None


def checkin_allowed_at(*, event, tenant, now, grace_minutes: int) -> tuple[bool, str]:
    window = get_checkin_window(
        event=event,
        tenant=tenant,
        now=now,
        grace_minutes=grace_minutes,
    )
    if window["allowed"]:
        return True, ""
    return False, window["block_reason"]


def format_checkin_blocked_message(
    *, block_reason: str, opens_at, tenant, grace_minutes: int, user=None
) -> str:
    if block_reason == "payroll_rate_missing":
        from app_attendance.payroll_snapshots import payroll_rate_missing_message

        return payroll_rate_missing_message(user)
    if block_reason == "checkin_too_early":
        tz_obj = _tenant_tz(tenant)
        local_time = opens_at.astimezone(tz_obj)
        time_str = local_time.strftime("%I:%M %p").lstrip("0")
        grace = max(grace_minutes, 0)
        return (
            f"Check-in opens at {time_str}. "
            f"You can check in up to {grace} minutes before the session starts."
        )
    if block_reason == "checkin_after_event_end":
        return "This session has ended. Check-in is no longer available."
    return "Check-in is not allowed at this time for this session."


def is_stale_open_session(user_event, tenant, now) -> bool:
    """True when checked in but not out, and the session is from a prior local day."""
    if not user_event.checkin_time or user_event.checkout_time:
        return False
    tz_name = getattr(tenant, "timezone", None) or "UTC"
    try:
        tz_obj = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz_obj = ZoneInfo("UTC")
    local_today = now.astimezone(tz_obj).date()
    event_dt = user_event.event.date
    event_local_date = (
        event_dt.astimezone(tz_obj).date()
        if hasattr(event_dt, "date")
        else event_dt
    )
    return event_local_date < local_today


def resolve_checkout_time(*, checkin_time, proposed_checkout, event, tenant):
    """
    Match live check-out PUT: floor at check-in, cap at session end.
    """
    from app_attendance.views import _get_event_end_utc

    event_end_utc = _get_event_end_utc(event, tenant)
    raw_checkout = proposed_checkout
    if checkin_time is not None:
        raw_checkout = max(raw_checkout, checkin_time)
    resolved = min(raw_checkout, event_end_utc)
    if checkin_time is not None and resolved < checkin_time:
        resolved = checkin_time
    return resolved


def validate_checkin_checkout_pair(
    *,
    checkin_time,
    checkout_time,
    event,
    tenant,
) -> tuple[bool, str]:
    if checkin_time and checkout_time and checkout_time < checkin_time:
        return False, "checkout_before_checkin"
    if checkout_time and event and tenant:
        from app_attendance.views import _get_event_end_utc

        end = _get_event_end_utc(event, tenant)
        if checkout_time > end:
            return False, "checkout_after_event_end"
    return True, ""


_CORRECTION_TIME_ERROR_MESSAGES = {
    "session_not_ended": "This session has not ended yet. Use live check-in instead.",
    "checkin_before_session_window": "Check-in time is before the allowed session window.",
    "checkout_after_event_end": "Checkout time cannot be after the session end.",
    "checkout_before_checkin": "Checkout time cannot be before check-in time.",
}


def validate_self_correction_times(
    *,
    checkin_time,
    checkout_time,
    event,
    tenant,
    now,
    grace_minutes: int,
) -> tuple[bool, str]:
    from app_attendance.views import _get_event_end_utc

    end = _get_event_end_utc(event, tenant)
    if now <= end:
        return False, "session_not_ended"

    opens_at = _event_start_utc(event, tenant) - timedelta(
        minutes=max(grace_minutes, 0)
    )
    if checkin_time and checkin_time < opens_at:
        return False, "checkin_before_session_window"

    ok, code = validate_checkin_checkout_pair(
        checkin_time=checkin_time,
        checkout_time=checkout_time,
        event=event,
        tenant=tenant,
    )
    if not ok:
        return False, code
    return True, ""


def self_correction_error_message(code: str) -> str:
    return _CORRECTION_TIME_ERROR_MESSAGES.get(code, code)
