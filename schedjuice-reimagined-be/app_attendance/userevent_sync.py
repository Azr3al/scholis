from __future__ import annotations

from app_attendance.models import UserEvent
from app_attendance.userevent_lifecycle import restore_userevents_for_pairs
from app_course.models import UserCourse


def teaching_user_ids_for_course(course_id: int) -> list[int]:
    return list(
        UserCourse.objects.filter(
            course_id=course_id,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).values_list("user_id", flat=True)
    )


def ensure_teacher_userevents_for_events(
    *,
    course_id: int,
    event_ids: list[int],
    user_ids: list[int] | None = None,
) -> int:
    if not event_ids:
        return 0
    teacher_ids = user_ids if user_ids is not None else teaching_user_ids_for_course(course_id)
    if not teacher_ids:
        return 0

    pairs = [(uid, eid) for uid in teacher_ids for eid in event_ids]
    restored = restore_userevents_for_pairs(pairs)

    existing = set(
        UserEvent.objects.filter(
            event_id__in=event_ids,
            user_id__in=teacher_ids,
        ).values_list("user_id", "event_id")
    )
    to_create = [
        UserEvent(user_id=uid, event_id=eid)
        for uid, eid in pairs
        if (uid, eid) not in existing
    ]
    if not to_create:
        return restored
    UserEvent.objects.bulk_create(to_create, ignore_conflicts=True)
    return restored + len(to_create)
