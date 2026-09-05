"""Resolve billing cycle anchors for late-joining students."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.utils import timezone as django_timezone

from app_course.models import Event, UserCourse
from app_course.session_time import event_local_date


def _tenant_tz() -> ZoneInfo:
    tz = django_timezone.get_current_timezone()
    if isinstance(tz, ZoneInfo):
        return tz
    return ZoneInfo(str(tz))


def resolve_first_session_date(
    course_id: int,
    joined_at: datetime,
    *,
    tz: ZoneInfo | None = None,
) -> date | None:
    """Earliest non-reserve session on or after the enrollment local date."""
    tz = tz or _tenant_tz()
    enrollment_day = joined_at.astimezone(tz).date()
    events = (
        Event.objects.filter(course_id=course_id, is_substitution_reserve=False)
        .order_by("date", "time_from")
        .only("date", "time_from", "time_to")
    )
    for event in events:
        if event_local_date(event, tz) >= enrollment_day:
            return event_local_date(event, tz)
    return None


def resolve_course_first_session_date(
    course_id: int,
    *,
    tz: ZoneInfo | None = None,
) -> date | None:
    """Earliest non-reserve session scheduled for the course."""
    tz = tz or _tenant_tz()
    event = (
        Event.objects.filter(course_id=course_id, is_substitution_reserve=False)
        .order_by("date", "time_from")
        .only("date", "time_from", "time_to")
        .first()
    )
    if event is None:
        return None
    return event_local_date(event, tz)


def resolve_anchor_for_enrollment(
    user_course: UserCourse,
    *,
    tz: ZoneInfo | None = None,
) -> date | None:
    """
    Return a billing anchor only for genuinely late joiners.

    On-time joiners and legacy rows return None so course.start_date stays canonical.
    """
    if user_course.assigned_as != UserCourse.AssignedAs.STUDENT:
        return None

    joined_at = user_course.joined_at
    if joined_at is None:
        return None
    if django_timezone.is_naive(joined_at):
        joined_at = django_timezone.make_aware(
            joined_at, django_timezone.get_current_timezone()
        )

    course_id = user_course.course_id
    first_for_student = resolve_first_session_date(course_id, joined_at, tz=tz)
    if first_for_student is None:
        return None

    course_first = resolve_course_first_session_date(course_id, tz=tz)
    if course_first is None:
        return None

    if first_for_student <= course_first:
        return None

    return first_for_student


def effective_invoice_start_date(
    *,
    course_start_date: date,
    billing_cycle_anchor_date: date | None,
) -> date:
    """First calendar day used for the initial invoice window."""
    if billing_cycle_anchor_date is not None:
        return billing_cycle_anchor_date
    return course_start_date


def enrollment_applies_to_report_month(
    *,
    billing_cycle_anchor_date: date | None,
    report_year: int,
    report_month: int,
) -> bool:
    """False when the report month is entirely before the student's billing anchor."""
    if billing_cycle_anchor_date is None:
        return True
    from app_finance.payment_coverage import compare_month

    anchor_month = (billing_cycle_anchor_date.year, billing_cycle_anchor_date.month)
    report = (report_year, report_month)
    return compare_month(report, anchor_month) >= 0
