"""Enroll students in courses during payment recording (payment.record scoped)."""
from __future__ import annotations

from django.db import transaction

from app_auth.models import User
from app_course.course_member_counts import refresh_course_member_counts_now
from app_course.membership_history import record_membership_event
from app_course.models import Course, CourseMembershipEvent, UserCourse
from app_course.roster_writes import _add_ms_member, _ensure_student_teams_ready
from app_finance.payment_scoping import check_payment_record
from rest_framework.exceptions import PermissionDenied


class PaymentEnrollmentError(Exception):
    def __init__(self, message: str, *, error_code: str = "validation_error"):
        self.message = message
        self.error_code = error_code
        super().__init__(message)


def ensure_student_enrolled_for_payment(
    *,
    actor: User,
    student: User,
    course: Course,
    tenant,
) -> UserCourse:
    """Create a student UserCourse when missing; idempotent when already enrolled."""
    check_payment_record(actor, course.id)
    if not student.is_student():
        raise PaymentEnrollmentError("User is not a student.")

    existing = UserCourse.objects.filter(
        user_id=student.id,
        course_id=course.id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).first()
    if existing is not None:
        return existing

    teams_error = _ensure_student_teams_ready(tenant=tenant, course=course, user=student)
    if teams_error:
        raise PaymentEnrollmentError(
            teams_error.get("message", "Teams enrollment requirements not met."),
            error_code=teams_error.get("error", "validation_error"),
        )
    from app_microsoft.team_provisioning_helpers import tenant_syncs_course_team_roster

    if tenant_syncs_course_team_roster(tenant):
        ms_error = _add_ms_member(
            tenant=tenant,
            course=course,
            user=student,
            role="members",
        )
        if ms_error:
            raise PaymentEnrollmentError(
                ms_error.get("message", "Could not add student to Microsoft team."),
                error_code=ms_error.get("error", "ms_gateway_error"),
            )

    with transaction.atomic():
        student.is_waiting_for_activation = False
        student.save(update_fields=["is_waiting_for_activation"])
        user_course, created = UserCourse.objects.get_or_create(
            user_id=student.id,
            course_id=course.id,
            defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
        )
        if created:
            record_membership_event(
                course_id=course.id,
                user_id=student.id,
                event_type=CourseMembershipEvent.EventType.JOINED,
                actor_id=actor.id,
                source=CourseMembershipEvent.Source.API,
            )
    refresh_course_member_counts_now([course.id])
    return user_course


__all__ = ["PaymentEnrollmentError", "ensure_student_enrolled_for_payment"]
