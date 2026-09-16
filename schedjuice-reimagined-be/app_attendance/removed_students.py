from __future__ import annotations

from rest_framework.exceptions import PermissionDenied

from app_course.models import CourseMembershipEvent, UserCourse
from app_rbac.resolution import effective_permissions


def parse_include_removed_students(request, user) -> bool:
    raw = request.query_params.get("include_removed_students")
    if raw not in ("true", "1", "yes"):
        return False
    if "attendance.view_removed_students" not in effective_permissions(user):
        raise PermissionDenied(
            "You don't have permission to view removed student attendance."
        )
    return True


def get_removed_course_student_ids(course_id: int) -> set[int]:
    active_ids = UserCourse.objects.filter(
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).values_list("user_id", flat=True)
    return set(
        CourseMembershipEvent.objects.filter(
            course_id=course_id,
            event_type=CourseMembershipEvent.EventType.REMOVED,
        )
        .exclude(user_id__in=active_ids)
        .values_list("user_id", flat=True)
        .distinct()
    )
