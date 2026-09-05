from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone as dj_timezone
from rest_framework.exceptions import ValidationError

from app_attendance.checkin_policy import _event_start_utc
from app_attendance.models import UserEvent
from app_course.event_overlap import event_local_date
from app_course.models import UserCourse
from app_auth.shortcuts_availability_helpers import user_can_access_admin_shortcuts
from app_course.rate_utils import (
    get_hourly_rate_for_teacher_course,
    get_per_hour_price_snapshot_for_course,
    is_session_based_payroll,
)

PAYROLL_RATE_MISSING_MESSAGE_TEACHER = (
    "Hourly rate missing. Please inform your school admin to configure your hourly rate"
)

PAYROLL_RATE_MISSING_MESSAGE_ADMIN = (
    "Hourly rate missing. Configure your hourly rate in the teacher's profile or "
    "course assignment before checking in."
)


def payroll_rate_missing_message(user) -> str:
    if user is not None and user_can_access_admin_shortcuts(user):
        return PAYROLL_RATE_MISSING_MESSAGE_ADMIN
    return PAYROLL_RATE_MISSING_MESSAGE_TEACHER


class PayrollRateMissingError(ValidationError):
    def __init__(self, user=None):
        super().__init__(payroll_rate_missing_message(user))


def _tenant_tz(tenant):
    tz_name = getattr(tenant, "timezone", None) or "UTC"
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _event_end_utc(event, tenant) -> datetime:
    tz_obj = _tenant_tz(tenant)
    date_part = event_local_date(event, tz_obj)
    end_naive = datetime.combine(date_part, event.time_to)
    if event.time_to <= event.time_from:
        end_naive += timedelta(days=1)
    local = end_naive.replace(tzinfo=tz_obj)
    return local.astimezone(dj_timezone.utc)


def _event_bounds_utc(event, tenant) -> tuple[datetime, datetime]:
    return _event_start_utc(event, tenant), _event_end_utc(event, tenant)


def get_live_student_count_for_course(course_id: int) -> int:
    return UserCourse.objects.filter(
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).count()


def freeze_teacher_payroll_snapshots(
    user_event: UserEvent,
    tenant,
    *,
    require_rate: bool = False,
    message_user=None,
) -> dict:
    """Return field updates to freeze payroll snapshots on first teacher check-in."""
    if not user_event.user.is_teacher():
        return {}

    updates: dict = {}

    if (
        user_event.event_time_from_at_calculation is None
        or user_event.event_time_to_at_calculation is None
    ):
        start_utc, end_utc = _event_bounds_utc(user_event.event, tenant)
        updates["event_time_from_at_calculation"] = start_utc
        updates["event_time_to_at_calculation"] = end_utc

    if is_session_based_payroll(tenant):
        return updates

    course = user_event.event.course
    rate = get_hourly_rate_for_teacher_course(user_event.user, course, tenant)
    if rate is None:
        if require_rate:
            raise PayrollRateMissingError(message_user or user_event.user)
        return updates

    updates.update(
        {
            "hourly_rate_at_calculation": rate,
            "student_bonus_rate_at_calculation": user_event.user.student_bonus_hourly_rate,
            "student_count_in_course_at_calculation": get_live_student_count_for_course(
                user_event.event.course_id
            ),
        }
    )
    ph = get_per_hour_price_snapshot_for_course(course)
    if ph is not None:
        updates["per_hour_price_at_calculation"] = ph
    return updates
