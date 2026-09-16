"""Shared session overlap detection for a course schedule."""

from __future__ import annotations

from copy import copy
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from rest_framework.exceptions import ValidationError

from app_course.models import Event
from app_course.session_time import (
    event_bounds_local,
    event_local_date,
    events_overlap,
)


def event_end_datetime(event: Event, tz: ZoneInfo) -> datetime:
    _, end = event_bounds_local(event, tz)
    return end


def is_past_event(
    event: Event, tz: ZoneInfo, *, now: datetime | None = None
) -> bool:
    from django.utils import timezone

    now_local = (now or timezone.now()).astimezone(tz)
    return event_end_datetime(event, tz) < now_local


def find_overlap_clusters(
    events: list[Event],
    tz: ZoneInfo,
    *,
    now: datetime | None = None,
    ignore_past: bool = True,
) -> list[list[Event]]:
    if ignore_past:
        events = [ev for ev in events if not is_past_event(ev, tz, now=now)]
    if len(events) < 2:
        return []

    ordered = sorted(
        events, key=lambda e: (event_bounds_local(e, tz)[0], e.id or 0)
    )
    clusters: list[list[Event]] = []
    for ev in ordered:
        touched = [
            cluster
            for cluster in clusters
            if any(events_overlap(ev, other, tz) for other in cluster)
        ]
        if not touched:
            clusters.append([ev])
        elif len(touched) == 1:
            touched[0].append(ev)
        else:
            merged: list[Event] = [ev]
            for cluster in touched:
                merged.extend(cluster)
                clusters.remove(cluster)
            clusters.append(merged)
    return [cluster for cluster in clusters if len(cluster) > 1]


def has_overlapping_events(
    events: list[Event],
    tz: ZoneInfo,
    *,
    now: datetime | None = None,
    ignore_past: bool = True,
) -> bool:
    return bool(find_overlap_clusters(events, tz, now=now, ignore_past=ignore_past))


def find_schedule_conflicts(
    events: list[Event],
    tz: ZoneInfo,
    *,
    now: datetime | None = None,
    ignore_past: bool = True,
) -> list[dict[str, Any]]:
    conflicts: list[dict[str, Any]] = []
    for cluster in find_overlap_clusters(events, tz, now=now, ignore_past=ignore_past):
        local_date = event_local_date(cluster[0], tz)
        conflicts.append(
            {
                "local_date": local_date.isoformat(),
                "events": [
                    {
                        "id": ev.id,
                        "time_from": ev.time_from.isoformat(),
                        "time_to": ev.time_to.isoformat(),
                    }
                    for ev in sorted(cluster, key=lambda e: e.time_from)
                ],
            }
        )
    return conflicts


def validate_no_overlapping_events(
    events: list[Event],
    tz: ZoneInfo,
    *,
    now: datetime | None = None,
    ignore_past: bool = True,
) -> None:
    conflicts = find_schedule_conflicts(events, tz, now=now, ignore_past=ignore_past)
    if not conflicts:
        return
    raise ValidationError(
        {
            "message": "Sessions cannot overlap on the same day.",
            "conflicts": conflicts,
        }
    )


def org_timezone(org) -> ZoneInfo:
    try:
        return ZoneInfo(org.timezone or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def validate_simulated_course_event_edit(
    *,
    course_id: int,
    delete_ids: list[int],
    update_payloads: list[dict],
    update_validated: list[dict],
    create_validated: list[dict],
    org,
) -> None:
    delete_id_set = {int(event_id) for event_id in delete_ids}
    events_map = {
        event.id: copy(event)
        for event in Event.objects.filter(course_id=course_id)
        if event.id not in delete_id_set
    }
    for payload, validated in zip(update_payloads, update_validated):
        event = events_map[payload["id"]]
        for key, value in validated.items():
            setattr(event, key, value)
    simulated = list(events_map.values()) + [Event(**data) for data in create_validated]
    validate_no_overlapping_events(simulated, org_timezone(org))
