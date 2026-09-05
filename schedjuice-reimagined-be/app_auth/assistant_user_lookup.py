"""Filters for AI assistant user search/resolution (Telegram and web)."""
from __future__ import annotations

from django.db.models import Exists, OuterRef, Q, QuerySet

from app_auth.models import User
from app_course.course_status import effective_status_q
from app_course.models import Course, UserCourse


def _alumni_student_q() -> Q:
    """Student-role users with enrollments but no planned or active course."""
    active_course_ids = Course.objects.filter(
        effective_status_q(
            Course.CourseStatus.PLANNED,
            Course.CourseStatus.ACTIVE,
        )
    ).values("id")
    active_course_exists = UserCourse.objects.filter(
        user_id=OuterRef("pk"),
        course_id__in=active_course_ids,
    )
    any_enrollment_exists = UserCourse.objects.filter(user_id=OuterRef("pk"))
    return Q(roles__contains=[User.UserRole.STUDENT]) & Exists(
        any_enrollment_exists
    ) & ~Exists(active_course_exists)


def exclude_alumni_students(qs: QuerySet[User]) -> QuerySet[User]:
    return qs.exclude(_alumni_student_q())


def apply_assistant_user_lookup_filters(qs: QuerySet[User]) -> QuerySet[User]:
    qs = qs.filter(is_active=True, resigned_at__isnull=True)
    return exclude_alumni_students(qs)


def is_assistant_user_lookup_eligible(user: User) -> bool:
    if not user.is_active or user.resigned_at is not None:
        return False
    if User.UserRole.STUDENT not in (user.roles or []):
        return True
    has_any_enrollment = UserCourse.objects.filter(user=user).exists()
    if not has_any_enrollment:
        return True
    active_course_ids = Course.objects.filter(
        effective_status_q(
            Course.CourseStatus.PLANNED,
            Course.CourseStatus.ACTIVE,
        )
    ).values("id")
    return UserCourse.objects.filter(
        user=user,
        course_id__in=active_course_ids,
    ).exists()
