from __future__ import annotations

from django.db import transaction

from app_attendance.userevent_sync import ensure_teacher_userevents_for_events
from app_course import models, serializers
from app_course.overlap_fix_services import (
    _load_user_events_by_event,
    _move_daily_note_if_needed,
    merge_cluster_user_events_batch,
)


@transaction.atomic
def apply_course_event_edit(
    *,
    course,
    course_serializer,
    serialized_events_to_be_created,
    create_draft_ids: list,
    overlap_merges: list,
    events_to_be_deleted: list,
    merge_source_ids: set[int],
    events_to_be_updated: list[dict],
    has_creates: bool,
) -> tuple[list, list]:
    """Persist course + event create/merge/delete/update. Caller must validate first."""
    course_serializer.save()

    merged_deleted_ids: set[int] = set()
    created_instances = []
    if has_creates:
        created_instances = serialized_events_to_be_created.save()
        if created_instances:
            ensure_teacher_userevents_for_events(
                course_id=course.id,
                event_ids=[obj.id for obj in created_instances],
            )

    if overlap_merges and created_instances:
        draft_to_event_id = {
            str(draft_id): instance.id
            for draft_id, instance in zip(create_draft_ids, created_instances)
            if draft_id is not None
        }
        for entry in overlap_merges:
            survivor_draft_id = str(entry.get("survivor_draft_id"))
            survivor_id = draft_to_event_id.get(survivor_draft_id)
            if not survivor_id:
                continue
            source_ids = [int(i) for i in entry.get("source_event_ids", [])]
            if not source_ids:
                continue
            survivor = models.Event.objects.get(id=survivor_id)
            sources = list(models.Event.objects.filter(id__in=source_ids))
            if not sources:
                continue
            ue_map = _load_user_events_by_event([survivor_id, *source_ids])
            merge_cluster_user_events_batch([survivor, *sources], survivor, ue_map)
            _move_daily_note_if_needed(survivor, sources)
            models.Event.objects.filter(id__in=source_ids).delete()
            merged_deleted_ids.update(source_ids)

    remaining_delete_ids = [
        event_id
        for event_id in events_to_be_deleted
        if int(event_id) not in merged_deleted_ids
        and int(event_id) not in merge_source_ids
    ]
    if remaining_delete_ids:
        models.Event.objects.filter(id__in=remaining_delete_ids).delete()

    updated_events: list = []
    if events_to_be_updated:
        x = []
        for i in events_to_be_updated:
            row = {k: v for k, v in i.items() if k not in ("course", "is_edit")}
            x.append(models.Event(**row))
        fields = [
            k
            for k in events_to_be_updated[0].keys()
            if k not in ("id", "course", "is_edit")
        ]
        models.Event.objects.bulk_update(x, fields)
        updated_events = serializers.EventSerializer(
            models.Event.objects.filter(
                id__in=[i["id"] for i in events_to_be_updated]
            ),
            many=True,
        ).data

    created_data = (
        list(serialized_events_to_be_created.data) if created_instances else []
    )
    return created_data, updated_events
