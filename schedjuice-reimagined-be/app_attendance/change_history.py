from __future__ import annotations

from datetime import datetime
from typing import Any

from django.utils import timezone

from app_attendance.models import AttendanceChangeEvent


def record_attendance_change_event(
    *,
    user_event_id: int,
    actor_id: int | None,
    event_type: str,
    payload: dict[str, Any],
    occurred_at: datetime | None = None,
    source: str | None = AttendanceChangeEvent.Source.WEB_COURSE_CHECKIN_HISTORY,
) -> AttendanceChangeEvent:
    return AttendanceChangeEvent.objects.create(
        user_event_id=user_event_id,
        actor_id=actor_id,
        event_type=event_type,
        occurred_at=occurred_at or timezone.now(),
        source=source,
        payload=payload,
    )
