"""Resolve overlapping sessions from calendar draft state."""

from __future__ import annotations

from copy import copy
from datetime import date, datetime, time
from typing import Any

from dateutil import parser as date_parser
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from app_course.event_overlap import event_local_date, find_overlap_clusters, org_timezone
from app_course.models import Course, Event
from app_course.overlap_fix_services import (
    _load_user_events_by_event,
    _move_daily_note_if_needed,
    _pick_survivor,
    _student_user_ids,
    merge_cluster_user_events_batch,
)
from app_course.serializers import EventSerializer


def _is_draft_id(raw: Any) -> bool:
    return raw is not None and "new" in str(raw).lower()


def get_event_draft_id(event: Event) -> str | None:
    draft_id = getattr(event, "_draft_id", None)
    return str(draft_id) if draft_id is not None else None


def _parse_time(value: Any) -> time:
    if isinstance(value, time):
        return value
    text = str(value)
    parts = text.split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0
    second = int(parts[2]) if len(parts) > 2 else 0
    return time(hour, minute, second)


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = date_parser.parse(str(value))
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _apply_draft_to_event(event: Event, payload: dict[str, Any]) -> None:
    if "title" in payload:
        event.title = payload["title"]
    if "date" in payload and payload["date"] is not None:
        event.date = _parse_datetime(payload["date"])
    if "time_from" in payload and payload["time_from"] is not None:
        event.time_from = _parse_time(payload["time_from"])
    if "time_to" in payload and payload["time_to"] is not None:
        event.time_to = _parse_time(payload["time_to"])


def _event_from_draft_dict(payload: dict[str, Any], course_id: int) -> Event:
    event = Event(
        title=payload.get("title") or "Session",
        course_id=course_id,
        date=_parse_datetime(payload["date"]),
        time_from=_parse_time(payload["time_from"]),
        time_to=_parse_time(payload["time_to"]),
    )
    setattr(event, "_draft_id", str(payload["id"]))
    return event


def build_simulated_schedule_events(
    *,
    course_id: int,
    draft_events: list[dict[str, Any]],
) -> list[Event]:
    delete_ids: set[int] = set()
    updates: dict[int, dict[str, Any]] = {}
    creates: list[dict[str, Any]] = []

    for item in draft_events:
        raw_id = item.get("id")
        if item.get("is_deleted"):
            if raw_id is not None and not _is_draft_id(raw_id):
                delete_ids.add(int(raw_id))
            continue
        if _is_draft_id(raw_id):
            creates.append(item)
            continue
        if raw_id is not None:
            eid = int(raw_id)
            if item.get("is_edit") or any(
                key in item for key in ("date", "time_from", "time_to", "title")
            ):
                updates[eid] = item

    events_map = {
        event.id: copy(event)
        for event in Event.objects.filter(course_id=course_id)
        if event.id not in delete_ids
    }
    for event_id, payload in updates.items():
        if event_id in events_map:
            _apply_draft_to_event(events_map[event_id], payload)

    simulated = list(events_map.values())
    for item in creates:
        simulated.append(_event_from_draft_dict(item, course_id))
    return simulated


def _pick_cluster_survivor_auto(
    cluster: list[Event],
    user_events_by_event: dict[int, list],
    student_user_ids: set[int],
) -> Event:
    persisted = [event for event in cluster if event.id]
    if persisted:
        return _pick_survivor(persisted, user_events_by_event, student_user_ids)
    return min(cluster, key=lambda event: (event.time_from, get_event_draft_id(event) or ""))


def _cluster_matches_pin(
    cluster: list[Event],
    *,
    local_date: date,
    tz,
    survivor_draft_id: str | None,
    survivor_event_id: int | None,
    remove_event_ids: set[int],
    remove_draft_ids: set[str],
) -> Event | None:
    cluster_date = event_local_date(cluster[0], tz)
    if cluster_date != local_date:
        return None

    survivor: Event | None = None
    if survivor_event_id is not None:
        survivor = next((ev for ev in cluster if ev.id == survivor_event_id), None)
    elif survivor_draft_id is not None:
        survivor = next(
            (ev for ev in cluster if get_event_draft_id(ev) == survivor_draft_id),
            None,
        )
    if survivor is None:
        return None

    expected_removed_persisted = {
        ev.id for ev in cluster if ev.id and ev.id != survivor.id
    }
    expected_removed_draft = {
        get_event_draft_id(ev)
        for ev in cluster
        if not ev.id and get_event_draft_id(ev) and ev is not survivor
    }
    expected_removed_draft = {draft_id for draft_id in expected_removed_draft if draft_id}

    if expected_removed_persisted != remove_event_ids:
        return None
    if expected_removed_draft != remove_draft_ids:
        return None
    return survivor


def _empty_resolve_response(*, events: list[Event] | None = None) -> dict[str, Any]:
    return {
        "client_deletes": [],
        "deferred_merges": [],
        "applied": {
            "events_removed": [],
            "events_kept": [],
            "users_merged_count": 0,
        },
        "events": EventSerializer(events or [], many=True).data,
    }


@transaction.atomic
def resolve_schedule_overlaps(
    *,
    course: Course,
    org,
    mode: str,
    draft_events: list[dict[str, Any]],
    pin: dict[str, Any] | None = None,
) -> dict[str, Any]:
    tz = org_timezone(org)
    simulated = build_simulated_schedule_events(
        course_id=course.id,
        draft_events=draft_events,
    )
    clusters = find_overlap_clusters(simulated, tz)
    if not clusters:
        persisted = list(
            Event.objects.filter(course_id=course.id).order_by("date", "time_from", "id")
        )
        return _empty_resolve_response(events=persisted)

    client_deletes: list[str] = []
    deferred_merges: list[dict[str, Any]] = []
    removed_ids: list[int] = []
    kept_ids: list[int] = []
    users_merged_total = 0

    persisted_ids = [ev.id for cluster in clusters for ev in cluster if ev.id]
    user_events_by_event = _load_user_events_by_event(persisted_ids)
    student_user_ids = _student_user_ids(course.id)

    pin_survivor: Event | None = None
    if mode == "pin_survivor":
        if not pin:
            raise ValidationError({"message": "pin_survivor requires pin payload."})
        survivor_payload = pin.get("survivor") or {}
        pin_survivor_draft_id = survivor_payload.get("draft_id")
        pin_survivor_event_id = survivor_payload.get("event_id")
        if pin_survivor_event_id is not None:
            pin_survivor_event_id = int(pin_survivor_event_id)
        remove_event_ids = {int(i) for i in (pin.get("remove_event_ids") or [])}
        remove_draft_ids = {str(i) for i in (pin.get("remove_draft_ids") or [])}
        try:
            pin_local_date = date.fromisoformat(str(pin.get("local_date")))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"message": "Invalid local_date."}) from exc

        for cluster in clusters:
            matched = _cluster_matches_pin(
                cluster,
                local_date=pin_local_date,
                tz=tz,
                survivor_draft_id=pin_survivor_draft_id,
                survivor_event_id=pin_survivor_event_id,
                remove_event_ids=remove_event_ids,
                remove_draft_ids=remove_draft_ids,
            )
            if matched is not None:
                pin_survivor = matched
                break
        if pin_survivor is None:
            raise ValidationError(
                {"message": "Pinned survivor plan does not match an overlap cluster."}
            )
        clusters_to_process = [
            cluster for cluster in clusters if pin_survivor in cluster
        ]
    else:
        clusters_to_process = clusters

    for cluster in clusters_to_process:
        if mode == "pin_survivor":
            survivor = pin_survivor
        else:
            survivor = _pick_cluster_survivor_auto(
                cluster, user_events_by_event, student_user_ids
            )

        duplicates = [ev for ev in cluster if ev is not survivor]
        if not duplicates:
            continue

        draft_duplicates = [ev for ev in duplicates if not ev.id]
        persisted_duplicates = [ev for ev in duplicates if ev.id]

        for dup in draft_duplicates:
            draft_id = get_event_draft_id(dup)
            if draft_id:
                client_deletes.append(draft_id)

        if survivor.id and persisted_duplicates:
            persisted_cluster = [ev for ev in cluster if ev.id]
            users_merged_total += merge_cluster_user_events_batch(
                persisted_cluster, survivor, user_events_by_event
            )
            _move_daily_note_if_needed(survivor, persisted_duplicates)
            dup_ids = [ev.id for ev in persisted_duplicates]
            Event.objects.filter(id__in=dup_ids).delete()
            removed_ids.extend(dup_ids)
            kept_ids.append(survivor.id)
        elif not survivor.id and persisted_duplicates:
            survivor_draft_id = get_event_draft_id(survivor)
            if survivor_draft_id:
                deferred_merges.append(
                    {
                        "survivor_draft_id": survivor_draft_id,
                        "source_event_ids": [ev.id for ev in persisted_duplicates],
                    }
                )

    refreshed = list(
        Event.objects.filter(course_id=course.id).order_by("date", "time_from", "id")
    )
    return {
        "client_deletes": client_deletes,
        "deferred_merges": deferred_merges,
        "applied": {
            "events_removed": removed_ids,
            "events_kept": kept_ids,
            "users_merged_count": users_merged_total,
        },
        "events": EventSerializer(refreshed, many=True).data,
    }
