"""
Resolve the Teams meeting organizer (Azure AD user) for a course.
Main teacher: AssignedAsRole.seniority MAIN_TEACHER, then ASSISTANT_TEACHER, then any teacher.
"""

from __future__ import annotations

from app_auth.models import User
from app_course.models import AssignedAsRole, Course, UserCourse


def _teacher_priority(uc: UserCourse) -> tuple[int, int]:
    s = None
    if uc.assigned_as_role_id and uc.assigned_as_role:
        s = uc.assigned_as_role.seniority
    if s == AssignedAsRole.Seniority.MAIN_TEACHER:
        return (0, uc.id)
    if s == AssignedAsRole.Seniority.ASSISTANT_TEACHER:
        return (1, uc.id)
    return (2, uc.id)


def pick_primary_teacher_user(
    teachers: list[UserCourse], *, require_microsoft: bool
) -> User | None:
    """
    Choose primary teacher from an in-memory list (e.g. prefetched user_courses).
    Same filters and ordering as get_course_primary_teacher_user.
    """
    filtered: list[UserCourse] = []
    for uc in teachers:
        if uc.assigned_as != UserCourse.AssignedAs.TEACHER:
            continue
        if require_microsoft:
            u = uc.user
            if u is None:
                continue
            mid = getattr(u, "microsoft_id", None)
            if mid is None or str(mid).strip() == "":
                continue
        filtered.append(uc)
    if not filtered:
        return None
    filtered.sort(key=_teacher_priority)
    return filtered[0].user


def get_course_primary_teacher_user(
    course: Course, *, require_microsoft: bool = False
) -> User | None:
    """
    Primary teacher for a course using the same ordering as Teams organizer.

    Priority: MAIN_TEACHER > ASSISTANT_TEACHER > any teacher (lowest UserCourse.id within tie).
    Only considers assigned_as=teacher, not dropped out.

    If require_microsoft is True, only teachers with a non-empty microsoft_id are considered
    (Teams meeting organizer). If False, all teachers are considered (e.g. UI display).
    """
    cached = getattr(course, "_prefetched_teacher_user_courses", None)
    if cached is not None:
        return pick_primary_teacher_user(list(cached), require_microsoft=require_microsoft)

    qs = UserCourse.objects.filter(
        course=course,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).select_related("user", "assigned_as_role")
    if require_microsoft:
        qs = qs.filter(user__microsoft_id__isnull=False).exclude(user__microsoft_id="")
    teachers = list(qs)
    if not teachers:
        return None
    teachers.sort(key=_teacher_priority)
    return teachers[0].user


def get_course_teams_organizer_user(course: Course) -> User | None:
    """
    Teacher with Microsoft identity to use as meeting organizer.
    Delegates to get_course_primary_teacher_user(require_microsoft=True).
    """
    return get_course_primary_teacher_user(course, require_microsoft=True)


def ensure_main_teacher_role_when_single_teacher(course: Course) -> None:
    """
    If the roster has exactly one active teacher and they are not MAIN_TEACHER,
    assign the tenant's MAIN_TEACHER AssignedAsRole so MT resolution matches product rules.

    No-op when there are zero or multiple teachers, or when MAIN_TEACHER is already set.
    """
    teachers = list(
        UserCourse.objects.filter(
            course=course,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).select_related("assigned_as_role")
    )
    if len(teachers) != 1:
        return
    uc = teachers[0]
    if uc.assigned_as_role_id and uc.assigned_as_role:
        if uc.assigned_as_role.seniority == AssignedAsRole.Seniority.MAIN_TEACHER:
            return
    main_role = AssignedAsRole.objects.filter(
        seniority=AssignedAsRole.Seniority.MAIN_TEACHER
    ).first()
    if not main_role:
        return
    uc.assigned_as_role = main_role
    uc.save(update_fields=["assigned_as_role"])
