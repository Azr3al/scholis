"""Merge overlapping course sessions while preserving attendance data."""

from __future__ import annotations

from collections import defaultdict
from datetime import time
from typing import Any

from django.db import transaction
from django.utils import timezone

from app_attendance.models import UserEvent
from app_course.event_overlap import (
    event_local_date,
    find_overlap_clusters,
    org_timezone,
)
from app_course.models import Course, DailyNote, Event, UserCourse
from app_organization.models import Organization

MERGE_FIELDS = (
    "attendance_status",
    "attendance_note",
    "checkin_time",
    "checkout_time",
    "checkin_image",
    "hourly_rate_at_calculation",
    "student_bonus_rate_at_calculation",
    "student_count_in_course_at_calculation",
    "per_hour_price_at_calculation",
    "is_extra_class",
    "today_activities",
)


def _userevent_quality(ue: UserEvent | None) -> int:
    if ue is None:
        return 1
    if ue.checkin_time is not None:
        return 4
    if ue.attendance_status in (
        UserEvent.AttendanceStatus.PRESENT,
        UserEvent.AttendanceStatus.LATE,
    ):
        return 3
    if ue.attendance_status in (
        UserEvent.AttendanceStatus.ABSENT,
        UserEvent.AttendanceStatus.ABSENT_WITH_LEAVE,
    ):
        return 2
    return 1


def _student_user_ids(course_id: int) -> set[int]:
    return set(
        UserCourse.objects.filter(
            course_id=course_id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).values_list("user_id", flat=True)
    )


def _load_user_events_by_event(event_ids: list[int]) -> dict[int, list[UserEvent]]:
    by_event: dict[int, list[UserEvent]] = defaultdict(list)
    if not event_ids:
        return by_event
    for ue in UserEvent.all_objects.filter(event_id__in=event_ids):
        by_event[ue.event_id].append(ue)
    return by_event


def _event_attendance_stats(
    event: Event,
    user_events_by_event: dict[int, list[UserEvent]],
    student_user_ids: set[int],
) -> tuple[int, int]:
    rows = user_events_by_event.get(event.id, [])
    marked = sum(
        1
        for ue in rows
        if ue.user_id in student_user_ids
        and not ue.is_deleted
        and ue.attendance_status != UserEvent.AttendanceStatus.UNREGISTERED
    )
    checkins = sum(1 for ue in rows if not ue.is_deleted and ue.checkin_time is not None)
    return marked, checkins


def _pick_survivor(
    cluster: list[Event],
    user_events_by_event: dict[int, list[UserEvent]],
    student_user_ids: set[int],
) -> Event:
    def sort_key(ev: Event) -> tuple[int, int, int, int]:
        marked, checkins = _event_attendance_stats(ev, user_events_by_event, student_user_ids)
        tf = ev.time_from
        earliest_rank = -(tf.hour * 3600 + tf.minute * 60 + tf.second)
        return (marked, checkins, earliest_rank, -(ev.id or 0))

    return max(cluster, key=sort_key)


def _best_source_row(
    user_id: int,
    cluster: list[Event],
    user_events_by_event: dict[int, list[UserEvent]],
) -> UserEvent | None:
    candidates: list[tuple[tuple[int, time, int], UserEvent]] = []
    for ev in cluster:
        for ue in user_events_by_event.get(ev.id, []):
            if ue.user_id != user_id:
                continue
            candidates.append(
                (
                    (_userevent_quality(ue), ev.time_from, -(ev.id or 0)),
                    ue,
                )
            )
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[0])[1]


def _serialize_event_summary(
    event: Event,
    user_events_by_event: dict[int, list[UserEvent]],
    student_user_ids: set[int],
) -> dict[str, Any]:
    marked, checkins = _event_attendance_stats(event, user_events_by_event, student_user_ids)
    return {
        "event_id": event.id,
        "time_from": event.time_from.isoformat(),
        "time_to": event.time_to.isoformat(),
        "marked_student_count": marked,
        "checkin_count": checkins,
    }


def _count_users_to_merge(
    cluster: list[Event],
    survivor: Event,
    user_events_by_event: dict[int, list[UserEvent]],
) -> int:
    merged = 0
    user_ids: set[int] = set()
    for ev in cluster:
        for ue in user_events_by_event.get(ev.id, []):
            user_ids.add(ue.user_id)
    survivor_rows = {
        ue.user_id: ue for ue in user_events_by_event.get(survivor.id, []) if not ue.is_deleted
    }
    for user_id in user_ids:
        best = _best_source_row(user_id, cluster, user_events_by_event)
        if best is None:
            continue
        survivor_ue = survivor_rows.get(user_id)
        if survivor_ue is None or _userevent_quality(best) > _userevent_quality(survivor_ue):
            merged += 1
    return merged


def merge_cluster_user_events_batch(
    cluster: list[Event],
    survivor: Event,
    user_events_by_event: dict[int, list[UserEvent]],
) -> int:
    persisted_cluster = [ev for ev in cluster if ev.id]
    if not survivor.id or not persisted_cluster:
        return 0

    user_ids: set[int] = set()
    for ev in persisted_cluster:
        for ue in user_events_by_event.get(ev.id, []):
            user_ids.add(ue.user_id)
    if not user_ids:
        return 0

    survivor_rows = {
        ue.user_id: ue for ue in user_events_by_event.get(survivor.id, [])
    }
    to_create: list[UserEvent] = []
    to_update: list[UserEvent] = []
    merged = 0
    now = timezone.now()

    for user_id in user_ids:
        best = _best_source_row(user_id, persisted_cluster, user_events_by_event)
        if best is None:
            continue

        survivor_ue = survivor_rows.get(user_id)
        best_q = _userevent_quality(best)
        surv_q = _userevent_quality(
            survivor_ue if survivor_ue and not survivor_ue.is_deleted else None
        )
        should_write = survivor_ue is None or best_q > surv_q or (
            survivor_ue.is_deleted and best_q >= _userevent_quality(None)
        )
        if not should_write:
            continue

        if survivor_ue is None:
            survivor_ue = UserEvent(user_id=user_id, event_id=survivor.id, is_deleted=False)
            for field in MERGE_FIELDS:
                setattr(survivor_ue, field, getattr(best, field))
            survivor_ue.updated_at = now
            to_create.append(survivor_ue)
            survivor_rows[user_id] = survivor_ue
        else:
            for field in MERGE_FIELDS:
                setattr(survivor_ue, field, getattr(best, field))
            survivor_ue.is_deleted = False
            survivor_ue.updated_at = now
            to_update.append(survivor_ue)
        merged += 1

    if to_create:
        UserEvent.all_objects.bulk_create(to_create)
    if to_update:
        UserEvent.all_objects.bulk_update(
            to_update, fields=[*MERGE_FIELDS, "is_deleted", "updated_at"]
        )
    return merged


def _merge_cluster_user_events(
    cluster: list[Event],
    survivor: Event,
    user_events_by_event: dict[int, list[UserEvent]],
) -> int:
    return merge_cluster_user_events_batch(cluster, survivor, user_events_by_event)


def _move_daily_note_if_needed(survivor: Event, duplicates: list[Event]) -> bool:
    if DailyNote.objects.filter(event_id=survivor.id).exists():
        return False
    for duplicate in duplicates:
        note = DailyNote.objects.filter(event_id=duplicate.id).first()
        if note is not None:
            note.event_id = survivor.id
            note.save(update_fields=["event_id", "updated_at"])
            return True
    return False


def build_overlap_fix_preview(course: Course, org: Organization) -> dict[str, Any]:
    tz = org_timezone(org)
    events = list(
        Event.objects.filter(course_id=course.id).order_by("date", "time_from", "id")
    )
    clusters = find_overlap_clusters(events, tz)
    student_user_ids = _student_user_ids(course.id)

    cluster_payloads: list[dict[str, Any]] = []
    total_removed = 0
    total_merged = 0
    all_event_ids = [ev.id for cluster in clusters for ev in cluster]
    all_user_events_by_event = _load_user_events_by_event(all_event_ids)

    for cluster in clusters:
        event_ids = [ev.id for ev in cluster]
        user_events_by_event = {
            eid: all_user_events_by_event.get(eid, []) for eid in event_ids
        }
        survivor = _pick_survivor(cluster, user_events_by_event, student_user_ids)
        duplicates = [ev for ev in cluster if ev.id != survivor.id]
        users_merged = _count_users_to_merge(cluster, survivor, user_events_by_event)
        daily_note_moved = (
            not DailyNote.objects.filter(event_id=survivor.id).exists()
            and any(DailyNote.objects.filter(event_id=ev.id).exists() for ev in duplicates)
        )
        cluster_payloads.append(
            {
                "local_date": event_local_date(survivor, tz).isoformat(),
                "survivor": _serialize_event_summary(
                    survivor, user_events_by_event, student_user_ids
                ),
                "removed_events": [
                    _serialize_event_summary(ev, user_events_by_event, student_user_ids)
                    for ev in sorted(duplicates, key=lambda e: e.time_from)
                ],
                "users_merged_count": users_merged,
                "daily_note_moved": daily_note_moved,
            }
        )
        total_removed += len(duplicates)
        total_merged += users_merged

    return {
        "course_id": course.id,
        "course_title": course.title,
        "has_overlaps": bool(cluster_payloads),
        "clusters": cluster_payloads,
        "summary": {
            "clusters_count": len(cluster_payloads),
            "events_removed_count": total_removed,
            "users_merged_count": total_merged,
        },
    }


@transaction.atomic
def apply_overlap_fix(course: Course, org: Organization) -> dict[str, Any]:
    tz = org_timezone(org)
    events = list(
        Event.objects.filter(course_id=course.id).order_by("date", "time_from", "id")
    )
    clusters = find_overlap_clusters(events, tz)
    if not clusters:
        return {
            "applied": False,
            "clusters_fixed": 0,
            "events_removed": [],
            "events_kept": [],
            "users_merged_count": 0,
        }

    removed_ids: list[int] = []
    kept_ids: list[int] = []
    users_merged_total = 0
    all_event_ids = [ev.id for cluster in clusters for ev in cluster]
    all_user_events_by_event = _load_user_events_by_event(all_event_ids)

    for cluster in clusters:
        event_ids = [ev.id for ev in cluster]
        user_events_by_event = {
            eid: all_user_events_by_event.get(eid, []) for eid in event_ids
        }
        survivor = _pick_survivor(cluster, user_events_by_event, _student_user_ids(course.id))
        duplicates = [ev for ev in cluster if ev.id != survivor.id]

        users_merged_total += _merge_cluster_user_events(
            cluster, survivor, user_events_by_event
        )
        _move_daily_note_if_needed(survivor, duplicates)

        duplicate_ids = [ev.id for ev in duplicates]
        Event.objects.filter(id__in=duplicate_ids).delete()
        removed_ids.extend(duplicate_ids)
        kept_ids.append(survivor.id)

    return {
        "applied": True,
        "clusters_fixed": len(clusters),
        "events_removed": removed_ids,
        "events_kept": kept_ids,
        "users_merged_count": users_merged_total,
    }
