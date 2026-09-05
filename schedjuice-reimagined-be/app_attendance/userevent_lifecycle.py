from __future__ import annotations

from django.db.models import QuerySet
from django.utils import timezone

from app_attendance.models import UserEvent


def soft_delete_userevents(qs: QuerySet[UserEvent]) -> int:
    """Soft-delete rows without check-in data. Rows with checkin_time are preserved."""
    return qs.filter(checkin_time__isnull=True, is_deleted=False).update(
        is_deleted=True,
        updated_at=timezone.now(),
    )


def restore_userevent(*, user_id: int, event_id: int) -> UserEvent | None:
    """Undelete a soft-deleted row on re-assignment."""
    updated = UserEvent.all_objects.filter(
        user_id=user_id,
        event_id=event_id,
        is_deleted=True,
    ).update(is_deleted=False, updated_at=timezone.now())
    if not updated:
        return None
    return UserEvent.objects.filter(user_id=user_id, event_id=event_id).first()


def restore_userevents_for_pairs(pairs: list[tuple[int, int]]) -> int:
    if not pairs:
        return 0
    user_ids = {uid for uid, _ in pairs}
    event_ids = {eid for _, eid in pairs}
    restored = 0
    for ue in UserEvent.all_objects.filter(
        user_id__in=user_ids,
        event_id__in=event_ids,
        is_deleted=True,
    ):
        if (ue.user_id, ue.event_id) in pairs:
            ue.is_deleted = False
            ue.save(update_fields=["is_deleted", "updated_at"])
            restored += 1
    return restored
