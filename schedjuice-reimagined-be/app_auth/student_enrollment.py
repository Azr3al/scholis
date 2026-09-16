"""Shared queries for actively enrolled students (student data sheet definition)."""
from __future__ import annotations

from django.db.models import Exists, OuterRef, QuerySet

from app_auth.models import User
from app_course.course_status import effective_status_q
from app_course.models import Course, UserCourse


def effectively_active_courses_qs() -> QuerySet[Course]:
    return Course.objects.filter(effective_status_q(Course.CourseStatus.ACTIVE))


def active_student_enrollments_qs(
    active_courses: QuerySet[Course] | None = None,
) -> QuerySet[UserCourse]:
    if active_courses is None:
        active_courses = effectively_active_courses_qs()
    return (
        UserCourse.objects.filter(
            assigned_as=UserCourse.AssignedAs.STUDENT,
            course__in=active_courses,
        )
        .select_related("course")
        .order_by("course__title")
    )


def actively_enrolled_students_qs(
    *,
    include_inactive_users: bool = False,
) -> QuerySet[User]:
    """Student-role users with at least one non-dropped enrollment in an active course."""
    active_courses = effectively_active_courses_qs()
    active_enrollment_exists = UserCourse.objects.filter(
        user_id=OuterRef("pk"),
        assigned_as=UserCourse.AssignedAs.STUDENT,
        course__in=active_courses,
    )
    qs = User.objects.filter(
        roles__contains=[User.UserRole.STUDENT],
    ).filter(Exists(active_enrollment_exists))
    if not include_inactive_users:
        qs = qs.filter(is_active=True)
    return qs


def _student_role_users_qs(*, include_inactive_users: bool = False) -> QuerySet[User]:
    qs = User.objects.filter(roles__contains=[User.UserRole.STUDENT])
    if not include_inactive_users:
        qs = qs.filter(is_active=True)
    return qs


def students_without_any_course_enrollment_qs(
    *,
    include_inactive_users: bool = False,
) -> QuerySet[User]:
    """Student-role users with zero student UserCourse rows (never enrolled)."""
    student_enrollment_exists = UserCourse.objects.filter(
        user_id=OuterRef("pk"),
        assigned_as=UserCourse.AssignedAs.STUDENT,
    )
    return _student_role_users_qs(
        include_inactive_users=include_inactive_users,
    ).exclude(Exists(student_enrollment_exists))


def students_without_active_course_enrollment_qs(
    *,
    include_inactive_users: bool = False,
) -> QuerySet[User]:
    """Student-role users not actively enrolled (never enrolled or alumni only)."""
    active_courses = effectively_active_courses_qs()
    active_enrollment_exists = UserCourse.objects.filter(
        user_id=OuterRef("pk"),
        assigned_as=UserCourse.AssignedAs.STUDENT,
        course__in=active_courses,
    )
    return _student_role_users_qs(
        include_inactive_users=include_inactive_users,
    ).exclude(Exists(active_enrollment_exists))
