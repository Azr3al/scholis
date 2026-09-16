from __future__ import annotations

import datetime as dt

from app_utility_notifications.models import UtilityNotificationSentLog
from app_utility_notifications.utility_notification_kinds import UtilityNotificationKind


def _kind_value(kind: UtilityNotificationKind | str) -> str:
    if isinstance(kind, UtilityNotificationKind):
        return kind.value
    return kind


def _reference_id_str(reference_id: str | int) -> str:
    return str(reference_id)


def should_send_utility_push(
    user,
    kind: UtilityNotificationKind | str,
    reference_id: str | int,
    sent_on_date: dt.date,
) -> bool:
    return not UtilityNotificationSentLog.objects.filter(
        user=user,
        kind=_kind_value(kind),
        reference_id=_reference_id_str(reference_id),
        sent_on_date=sent_on_date,
    ).exists()


def record_utility_push_sent(
    user,
    kind: UtilityNotificationKind | str,
    reference_id: str | int,
    sent_on_date: dt.date,
) -> None:
    UtilityNotificationSentLog.objects.get_or_create(
        user=user,
        kind=_kind_value(kind),
        reference_id=_reference_id_str(reference_id),
        sent_on_date=sent_on_date,
    )
