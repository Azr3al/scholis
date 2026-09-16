"""Teaching vs oversight on UserCourse — canonical predicate for payroll, collision, rosters."""
from __future__ import annotations

from app_course.models import AssignedAsRole, UserCourse

_TEACHING_SENIORITIES = frozenset(
    {
        AssignedAsRole.Seniority.MAIN_TEACHER,
        AssignedAsRole.Seniority.ASSISTANT_TEACHER,
    }
)


def is_teaching_assignment(uc: UserCourse) -> bool:
    """True when the user actively teaches or assists — not oversight or legacy dean-on-roster."""
    if uc.assigned_as != UserCourse.AssignedAs.TEACHER:
        return False
    role = uc.assigned_as_role
    if role is None:
        return False
    s = role.seniority
    if s is None or str(s).strip() == "":
        return False
    return s in _TEACHING_SENIORITIES


def teaching_seniority_filter_kwargs() -> dict:
    """Django ORM kwargs for UserCourse rows that are teaching assignments."""
    return {
        "assigned_as": UserCourse.AssignedAs.TEACHER,
        "assigned_as_role__seniority__in": list(_TEACHING_SENIORITIES),
    }


def user_has_teaching_assignment_on_course(user_id: int, course_id: int) -> bool:
    """True when the user is MAIN_TEACHER or ASSISTANT_TEACHER on the course roster."""
    return UserCourse.objects.filter(
        user_id=user_id,
        course_id=course_id,
        **teaching_seniority_filter_kwargs(),
    ).exists()
