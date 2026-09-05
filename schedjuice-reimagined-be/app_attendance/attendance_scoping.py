"""RBAC helpers for attendance list/detail/mark endpoints."""
from __future__ import annotations

from django.db.models import QuerySet
from rest_framework.exceptions import PermissionDenied

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import UserCourse
from app_rbac import scoping
from app_rbac.resolution import effective_permissions


def acting_user(request) -> User | None:
    candidate = getattr(request, "user", None)
    if candidate is None or not getattr(candidate, "is_authenticated", False):
        return None
    if getattr(candidate, "roles", None):
        if candidate.pk:
            return candidate
    return User.get_user_from_request(request)


def assigned_course_ids(user: User):
    return UserCourse.objects.filter(user_id=user.id).values_list("course_id", flat=True)


def scope_userevents_for_user(user: User, queryset: QuerySet | None = None) -> QuerySet:
    qs = queryset if queryset is not None else UserEvent.objects.all()
    held = set(effective_permissions(user))
    return scoping.scope(
        "attendance",
        qs,
        held,
        lambda q: q.filter(event__course_id__in=assigned_course_ids(user)),
    )


def user_can_access_course_attendance(user: User, course_id: int) -> bool:
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("attendance", held):
        return True
    return UserCourse.objects.filter(user_id=user.id, course_id=course_id).exists()


def check_course_attendance_access(user: User, course_id: int) -> None:
    if not user_can_access_course_attendance(user, course_id):
        raise PermissionDenied("Not allowed for this course.")


def check_userevent_read(user: User, user_event: UserEvent) -> None:
    held = set(effective_permissions(user))
    course_id = user_event.event.course_id
    connected = UserCourse.objects.filter(user_id=user.id, course_id=course_id).exists()
    if scoping.has_read_breadth("attendance", held) or connected:
        return
    raise PermissionDenied("Not allowed for this attendance record.")


def check_userevent_write(user: User, user_event: UserEvent) -> None:
    held = set(effective_permissions(user))
    if "attendance.manage_all" in held:
        return
    course_id = user_event.event.course_id
    if "attendance.mark" not in held:
        raise PermissionDenied("Not allowed for this attendance record.")
    staff_on_course = UserCourse.objects.filter(
        user_id=user.id,
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).exists()
    if not staff_on_course:
        raise PermissionDenied("Not allowed for this attendance record.")


ATTENDANCE_MONTHLY_READ_CODES = frozenset(
    {
        "attendance.mark",
        "attendance.view_own",
        "attendance.view_all",
        "attendance.manage_all",
    }
)


def user_can_read_monthly_attendance(held: set[str]) -> bool:
    return bool(held & ATTENDANCE_MONTHLY_READ_CODES)


def user_needs_own_attendance_scope(held: set[str]) -> bool:
    if held & {"attendance.mark", "attendance.view_all", "attendance.manage_all"}:
        return False
    return "attendance.view_own" in held


def filter_monthly_report_for_user(
    table: list[list],
    students: list[dict],
    user_id: int,
) -> tuple[list[list], list[dict]]:
    if not table:
        return table, students
    idx = next((i for i, s in enumerate(students) if s["id"] == user_id), None)
    if idx is None:
        return [table[0]] if table else [], []
    return [table[0], table[idx + 1]], [students[idx]]


def require_teacher_checkin_history_correction_enabled(tenant) -> None:
    if tenant is None or not getattr(
        tenant, "allow_teacher_checkin_history_correction", False
    ):
        raise PermissionDenied(
            "Teacher check-in history correction is disabled for this school."
        )


def require_teacher_checkin_cancellation_enabled(tenant) -> None:
    if tenant is None or not getattr(
        tenant, "allow_teacher_checkin_cancellation", False
    ):
        raise PermissionDenied(
            "Teacher check-in cancellation is disabled for this school."
        )


def teacher_can_bootstrap_checkin_history(user: User, tenant) -> bool:
    held = set(effective_permissions(user))
    if "attendance.correct_own_checkin" in held:
        return True
    return "attendance.mark" in held
