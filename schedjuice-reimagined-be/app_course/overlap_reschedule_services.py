"""Reschedule overlapping future sessions to a shared time range (Data Health Fix)."""

from __future__ import annotations

from datetime import time
from typing import Any

from django.db import transaction
from rest_framework.exceptions import ValidationError

from app_course.event_overlap import (
    event_local_date,
    find_overlap_clusters,
    find_schedule_conflicts,
    org_timezone,
)
from app_course.models import Course, Event
from app_course.session_time import validate_session_time_range
from app_organization.models import Organization


def build_overlap_reschedule_preview(course: Course, org: Organization) -> dict[str, Any]:
    tz = org_timezone(org)
    events = list(
        Event.objects.filter(course_id=course.id).order_by("date", "time_from", "id")
    )
    clusters = find_overlap_clusters(events, tz)
    return {
        "course_id": course.id,
        "course_title": course.title,
        "has_overlaps": bool(clusters),
        "clusters": [
            {
                "local_date": event_local_date(cluster[0], tz).isoformat(),
                "events": [
                    {
                        "id": ev.id,
                        "time_from": ev.time_from.isoformat(),
                        "time_to": ev.time_to.isoformat(),
                    }
                    for ev in sorted(cluster, key=lambda e: e.time_from)
                ],
            }
            for cluster in clusters
        ],
        "summary": {
            "clusters_count": len(clusters),
            "events_count": sum(len(c) for c in clusters),
        },
    }


def _parse_time(value) -> time:
    if isinstance(value, time):
        return value
    if not isinstance(value, str) or not value.strip():
        raise ValidationError({"message": "time_from and time_to are required."})
    parts = value.strip().split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        second = int(parts[2]) if len(parts) > 2 else 0
    except (TypeError, ValueError) as exc:
        raise ValidationError({"message": "Invalid time format."}) from exc
    return time(hour, minute, second)


@transaction.atomic
def apply_overlap_reschedule(
    course: Course,
    org: Organization,
    *,
    event_ids: list[int],
    time_from,
    time_to,
) -> dict[str, Any]:
    parsed_from = _parse_time(time_from)
    parsed_to = _parse_time(time_to)
    validate_session_time_range(parsed_from, parsed_to)

    if not event_ids:
        raise ValidationError({"message": "event_ids is required."})

    unique_ids = list(dict.fromkeys(int(i) for i in event_ids))
    tz = org_timezone(org)
    targets = list(
        Event.objects.select_for_update()
        .filter(course_id=course.id, id__in=unique_ids)
        .order_by("id")
    )
    if len(targets) != len(unique_ids):
        raise ValidationError({"message": "One or more events were not found."})

    for ev in targets:
        ev.time_from = parsed_from
        ev.time_to = parsed_to

    all_events = {
        e.id: e for e in Event.objects.filter(course_id=course.id)
    }
    for ev in targets:
        all_events[ev.id] = ev

    conflicts = find_schedule_conflicts(list(all_events.values()), tz)
    if conflicts:
        raise ValidationError(
            {
                "message": "Sessions cannot overlap on the same day.",
                "conflicts": conflicts,
            }
        )

    Event.objects.bulk_update(targets, ["time_from", "time_to"])
    return {
        "applied": True,
        "updated_event_ids": [ev.id for ev in targets],
        "time_from": parsed_from.isoformat(),
        "time_to": parsed_to.isoformat(),
    }
