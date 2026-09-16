from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.utils import timezone as django_tz
from rest_framework.exceptions import ValidationError

from app_attendance.leave_request_notifications import (
    notify_leave_approved,
    notify_leave_denied,
)
from app_attendance.leave_request_enrollment import enrolled_course_ids_for_student
from app_attendance.marking_services import _tenant_local_date, _tenant_timezone
from app_attendance.models import LeaveRequest, UserEvent
from app_auth.models import User
from app_course.models import Event

logger = logging.getLogger(__name__)

_PROTECTED_STATUSES = frozenset(
    {
        UserEvent.AttendanceStatus.PRESENT,
        UserEvent.AttendanceStatus.LATE,
    }
)


def _leave_note(leave_request_id: int) -> str:
    return f"Approved leave #{leave_request_id}"


def _resolve_attendance_note(
    existing_note: str | None, leave_request_id: int
) -> str:
    new_note = _leave_note(leave_request_id)
    if not existing_note:
        return new_note
    if new_note in existing_note:
        return existing_note
    return f"{existing_note}\n{new_note}"


def _assert_pending(leave_request: LeaveRequest) -> None:
    if leave_request.status != LeaveRequest.Status.PENDING:
        raise ValidationError("Only pending leave requests can be reviewed.")


def _iter_date_range(start_date: date, end_date: date):
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


def _events_on_local_day(course_ids: list[int], local_day: date, tenant) -> list[Event]:
    if not course_ids:
        return []

    tz = _tenant_timezone(tenant)
    local_start = datetime.combine(local_day, time.min, tzinfo=tz)
    local_end_exclusive = local_start + timedelta(days=1)
    wide_start = local_start.astimezone(django_tz.utc) - timedelta(days=1)
    wide_end = local_end_exclusive.astimezone(django_tz.utc) + timedelta(days=1)

    candidates = Event.objects.filter(
        course_id__in=course_ids,
        date__gte=wide_start,
        date__lt=wide_end,
    )
    return [
        event
        for event in candidates
        if _tenant_local_date(event.date, tenant) == local_day
    ]


def _mark_user_event_absent_for_leave(
    user_event: UserEvent, leave_request: LeaveRequest
) -> bool:
    if user_event.attendance_status in _PROTECTED_STATUSES:
        logger.debug(
            "Skipping leave attendance update for protected status user_event=%s status=%s",
            user_event.id,
            user_event.attendance_status,
        )
        return False

    user_event.attendance_status = UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE
    user_event.attendance_note = _resolve_attendance_note(
        user_event.attendance_note,
        leave_request.id,
    )
    user_event.save(update_fields=["attendance_status", "attendance_note"])
    return True


def apply_approved_leave_to_attendance(leave_request: LeaveRequest, tenant) -> int:
    course_ids = enrolled_course_ids_for_student(leave_request.student_id)
    updated_count = 0

    for day in _iter_date_range(leave_request.start_date, leave_request.end_date):
        for event in _events_on_local_day(course_ids, day, tenant):
            user_event, _ = UserEvent.objects.get_or_create(
                user_id=leave_request.student_id,
                event_id=event.id,
            )
            if _mark_user_event_absent_for_leave(user_event, leave_request):
                updated_count += 1

    return updated_count


def maybe_apply_approved_leave_for_user_event(
    user_event: UserEvent, tenant
) -> bool:
    if not user_event.event_id:
        return False
    event = Event.objects.filter(id=user_event.event_id).only("id", "date").first()
    if event is None:
        return False

    local_day = _tenant_local_date(event.date, tenant)
    leave_request = (
        LeaveRequest.objects.filter(
            student_id=user_event.user_id,
            status=LeaveRequest.Status.APPROVED,
            start_date__lte=local_day,
            end_date__gte=local_day,
        )
        .order_by("-reviewed_at", "-id")
        .first()
    )
    if leave_request is None:
        return False

    return _mark_user_event_absent_for_leave(user_event, leave_request)


@transaction.atomic
def approve_leave_request(
    leave_request: LeaveRequest,
    *,
    actor: User,
    tenant,
) -> LeaveRequest:
    _assert_pending(leave_request)

    leave_request.status = LeaveRequest.Status.APPROVED
    leave_request.reviewed_by = actor
    leave_request.reviewed_at = django_tz.now()
    leave_request.save(update_fields=["status", "reviewed_by", "reviewed_at"])

    apply_approved_leave_to_attendance(leave_request, tenant)

    notify_leave_approved(leave_request, tenant)

    return leave_request


@transaction.atomic
def deny_leave_request(
    leave_request: LeaveRequest,
    *,
    actor: User,
    denial_reason: str,
    tenant,
) -> LeaveRequest:
    _assert_pending(leave_request)

    normalized_reason = (denial_reason or "").strip()
    if not normalized_reason:
        raise ValidationError({"denial_reason": "Denial reason is required."})

    leave_request.status = LeaveRequest.Status.DENIED
    leave_request.denial_reason = normalized_reason
    leave_request.reviewed_by = actor
    leave_request.reviewed_at = django_tz.now()
    leave_request.save(
        update_fields=["status", "denial_reason", "reviewed_by", "reviewed_at"]
    )

    notify_leave_denied(leave_request, tenant)

    return leave_request
