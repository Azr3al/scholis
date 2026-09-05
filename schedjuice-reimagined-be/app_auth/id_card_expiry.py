from __future__ import annotations

from collections import defaultdict
from typing import Sequence

from app_auth.models import User
from app_course.course_status import effective_status_q
from app_course.models import Course, UserCourse


def _is_course_id_card_expiry_enabled(tenant) -> bool:
    return bool(getattr(tenant, "is_course_id_card_expiry_enabled", False))


def resolve_id_card_expiry_dates(
    users: Sequence[User],
    *,
    course_id: int | None = None,
    tenant=None,
) -> dict[int, str | None]:
    """Batch resolve ID card expiry ISO dates for students. Keys are user pk."""
    result: dict[int, str | None] = {user.pk: None for user in users}
    if not users:
        return result

    if tenant is None:
        from django.db import connection

        tenant = getattr(connection, "tenant", None)

    if not _is_course_id_card_expiry_enabled(tenant):
        return result

    user_ids = [user.pk for user in users]
    active_planned_q = effective_status_q(
        Course.CourseStatus.ACTIVE,
        Course.CourseStatus.PLANNED,
    )
    active_course_ids = set(
        Course.objects.filter(active_planned_q).values_list("pk", flat=True)
    )
    if not active_course_ids:
        return result

    if course_id is not None:
        if course_id not in active_course_ids:
            return result
        for row in UserCourse.objects.filter(
            user_id__in=user_ids,
            assigned_as=UserCourse.AssignedAs.STUDENT,
            course_id=course_id,
        ).values("user_id", "course__id_card_expiry_date"):
            expiry = row["course__id_card_expiry_date"]
            if expiry is not None:
                result[row["user_id"]] = expiry.isoformat()
        return result

    expiry_by_user: dict[int, set[str]] = defaultdict(set)
    for row in UserCourse.objects.filter(
        user_id__in=user_ids,
        assigned_as=UserCourse.AssignedAs.STUDENT,
        course_id__in=active_course_ids,
        course__id_card_expiry_date__isnull=False,
    ).values("user_id", "course__id_card_expiry_date"):
        expiry = row["course__id_card_expiry_date"]
        if expiry is not None:
            expiry_by_user[row["user_id"]].add(expiry.isoformat())

    for user_id in user_ids:
        dates = expiry_by_user.get(user_id, set())
        if len(dates) == 1:
            result[user_id] = next(iter(dates))

    return result


def resolve_id_card_expiry_date(user: User, *, tenant=None) -> str | None:
    """Return ID card expiry ISO date for one student, or None."""
    return resolve_id_card_expiry_dates([user], tenant=tenant).get(user.pk)
