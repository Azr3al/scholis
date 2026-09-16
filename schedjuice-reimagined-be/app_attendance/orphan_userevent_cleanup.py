"""Find and delete student UserEvent rows with no active student UserCourse on the course."""
from __future__ import annotations

from collections import Counter
from typing import Any

from django.db.models import Exists, OuterRef, QuerySet

from app_attendance.models import UserEvent
from app_attendance.userevent_lifecycle import soft_delete_userevents
from app_auth.models import User
from app_course.models import UserCourse


def _active_student_enrollment():
    return UserCourse.objects.filter(
        user_id=OuterRef("user_id"),
        course_id=OuterRef("event__course_id"),
        assigned_as=UserCourse.AssignedAs.STUDENT,
    )


def orphan_student_userevents_qs(*, course_id: int | None = None) -> QuerySet[UserEvent]:
    qs = (
        UserEvent.objects.filter(is_deleted=False)
        .filter(user__roles__contained_by=[User.UserRole.STUDENT])
        .exclude(Exists(_active_student_enrollment()))
        .select_related("user", "event", "event__course")
    )
    if course_id is not None:
        qs = qs.filter(event__course_id=course_id)
    return qs.order_by("event__course_id", "event__date", "user__name", "id")


def garbage_soft_deleted_orphan_student_userevents_qs(
    *, course_id: int | None = None
) -> QuerySet[UserEvent]:
    qs = (
        UserEvent.all_objects.filter(is_deleted=True, checkin_time__isnull=True)
        .filter(user__roles__contained_by=[User.UserRole.STUDENT])
        .exclude(Exists(_active_student_enrollment()))
        .select_related("user", "event", "event__course")
    )
    if course_id is not None:
        qs = qs.filter(event__course_id=course_id)
    return qs.order_by("event__course_id", "event__date", "user__name", "id")


def summarize_orphans(qs: QuerySet[UserEvent], *, sample_limit: int = 20) -> dict[str, Any]:
    total_count = qs.count()
    per_course: Counter[int] = Counter()
    samples: list[dict[str, Any]] = []

    for ue in qs.iterator(chunk_size=500):
        per_course[ue.event.course_id] += 1
        if len(samples) < sample_limit:
            samples.append(
                {
                    "user_event_id": ue.id,
                    "user_id": ue.user_id,
                    "user_name": ue.user.name,
                    "user_email": ue.user.email,
                    "course_id": ue.event.course_id,
                    "course_title": ue.event.course.title,
                    "event_id": ue.event_id,
                    "event_date": ue.event.date.isoformat() if ue.event.date else None,
                    "attendance_status": ue.attendance_status,
                }
            )

    return {
        "total_count": total_count,
        "per_course": dict(per_course),
        "samples": samples,
    }


def delete_orphan_student_userevents(
    *,
    course_id: int | None = None,
    batch_size: int = 500,
) -> int:
    soft_delete_userevents(orphan_student_userevents_qs(course_id=course_id))

    qs = garbage_soft_deleted_orphan_student_userevents_qs(course_id=course_id)
    deleted = 0
    while True:
        batch_ids = list(qs.values_list("pk", flat=True)[:batch_size])
        if not batch_ids:
            break
        count, _ = UserEvent.all_objects.filter(pk__in=batch_ids).delete()
        deleted += count
    return deleted
