from __future__ import annotations

from collections import defaultdict
from typing import Sequence

from django.db.models import Exists, OuterRef

from app_auth.models import User
from app_course.course_status import effective_status_q
from app_course.models import Course, ProgramLevel, UserCourse


def resolve_id_card_class_names(users: Sequence[User]) -> dict[int, str | None]:
    """Batch resolve class strings for ID card display. Keys are user pk."""
    result: dict[int, str | None] = {}
    auto_resolve_ids: list[int] = []

    for user in users:
        if user.id_card_class_name is not None:
            result[user.pk] = user.id_card_class_name or None
        else:
            auto_resolve_ids.append(user.pk)

    if not auto_resolve_ids:
        return result

    active_planned_q = effective_status_q(
        Course.CourseStatus.ACTIVE,
        Course.CourseStatus.PLANNED,
    )
    active_course_ids = list(
        Course.objects.filter(active_planned_q).values_list("pk", flat=True)
    )
    if not active_course_ids:
        for user_id in auto_resolve_ids:
            result[user_id] = None
        return result

    programs_with_levels = ProgramLevel.objects.filter(
        program_id=OuterRef("course__program_id"),
    )
    level_names_by_user: dict[int, list[str]] = defaultdict(list)
    for row in (
        UserCourse.objects.filter(
            user_id__in=auto_resolve_ids,
            assigned_as=UserCourse.AssignedAs.STUDENT,
            course__level_id__isnull=False,
            course_id__in=active_course_ids,
        )
        .filter(Exists(programs_with_levels))
        .values("user_id", "course__level__name")
    ):
        level_names_by_user[row["user_id"]].append(row["course__level__name"])

    for user_id in auto_resolve_ids:
        names = level_names_by_user.get(user_id, [])
        result[user_id] = names[0] if len(names) == 1 else None

    return result


def resolve_id_card_class_name(user: User) -> str | None:
    """Return class string for ID card display, or None to hide the row."""
    return resolve_id_card_class_names([user]).get(user.pk)
