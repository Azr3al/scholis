"""Event-centric push delivery for the send-class-starting-reminders cron."""

from __future__ import annotations

import datetime as dt

from app_utility_notifications.cron_helpers import (
    _tenant_today_date,
    send_utility_pushes_for_user_rows,
)
from app_utility_notifications.utility_notification_helpers import (
    class_starting_soon_push_targets_by_user,
)


def send_class_starting_soon_reminder_pushes(
    *,
    now: dt.datetime,
    tenant_tz: str,
) -> tuple[int, int]:
    """Find events starting in 15–60 minutes and enqueue pushes for roster members."""
    sent_on_date = _tenant_today_date(now, tenant_tz)
    targets = class_starting_soon_push_targets_by_user(
        now=now,
        tenant_tz=tenant_tz,
    )
    return send_utility_pushes_for_user_rows(
        user_rows=targets,
        sent_on_date=sent_on_date,
    )
