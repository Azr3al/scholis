from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Sequence

from django.utils import timezone

from app_course.models import CourseMembershipEvent


@dataclass(frozen=True)
class MembershipEventInput:
    course_id: int
    user_id: int
    event_type: str
    actor_id: int | None = None
    occurred_at: datetime | None = None
    source: str | None = None


def record_membership_event(
    *,
    course_id: int,
    user_id: int,
    event_type: str,
    actor_id: int | None = None,
    occurred_at: datetime | None = None,
    source: str | None = None,
) -> CourseMembershipEvent:
    return CourseMembershipEvent.objects.create(
        course_id=course_id,
        user_id=user_id,
        event_type=event_type,
        actor_id=actor_id,
        occurred_at=occurred_at or timezone.now(),
        source=source,
    )


def record_membership_events_bulk(
    events: Sequence[MembershipEventInput],
    *,
    batch_size: int = 1000,
) -> int:
    if not events:
        return 0
    rows = [
        CourseMembershipEvent(
            course_id=event.course_id,
            user_id=event.user_id,
            event_type=event.event_type,
            actor_id=event.actor_id,
            occurred_at=event.occurred_at or timezone.now(),
            source=event.source,
        )
        for event in events
    ]
    CourseMembershipEvent.objects.bulk_create(rows, batch_size=batch_size)
    return len(rows)
