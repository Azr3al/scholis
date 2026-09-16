from __future__ import annotations

from collections.abc import Iterable

from app_course.models import UserCourse


def enrolled_courses_for_students(
    student_ids: Iterable[int],
) -> dict[int, list[dict[str, int | str]]]:
    """Return enrolled courses per student (STUDENT assignments), ordered by title."""
    unique_ids = list(dict.fromkeys(student_ids))
    if not unique_ids:
        return {}

    rows = (
        UserCourse.objects.filter(
            user_id__in=unique_ids,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .select_related("course")
        .order_by("course__title")
    )

    by_student: dict[int, list[dict[str, int | str]]] = {sid: [] for sid in unique_ids}
    for row in rows:
        if row.course_id is None:
            continue
        by_student[row.user_id].append(
            {"id": row.course_id, "title": row.course.title},
        )
    return by_student


def enrolled_course_ids_for_student(student_id: int) -> list[int]:
    courses = enrolled_courses_for_students([student_id]).get(student_id, [])
    return [course["id"] for course in courses]
