"""Shared cron logic for utility notification push delivery."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import connection
from django.db.models import QuerySet
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_utility_notifications.push_helpers import (
    record_utility_push_sent,
    should_send_utility_push,
)
from app_utility_notifications.tenant_time import (
    _resolve_tz,
    get_tenant_today_ymd,
)
from app_utility_notifications.utility_notification_helpers import (
    utility_notifications_for_user,
)
from app_utils.push_helpers import enqueue_push_for_user_ids


def get_current_org() -> Organization | None:
    schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema).first()


def _aware_utc(now: dt.datetime) -> dt.datetime:
    if now.tzinfo is None:
        return now.replace(tzinfo=dt.timezone.utc)
    return now


def _local_dt(now: dt.datetime, tenant_tz: str) -> dt.datetime:
    return _aware_utc(now).astimezone(_resolve_tz(tenant_tz))


def _org_local_hour(now: dt.datetime, tenant_tz: str) -> int:
    return _local_dt(now, tenant_tz).hour


def _org_local_weekday(now: dt.datetime, tenant_tz: str) -> int:
    """Monday=0 through Sunday=6."""
    return _local_dt(now, tenant_tz).weekday()


def _tenant_today_date(now: dt.datetime, tenant_tz: str) -> dt.date:
    return dt.date.fromisoformat(get_tenant_today_ymd(tenant_tz, now))


def reference_id_from_notification_row(row: dict[str, Any]) -> str:
    """Dedupe key: entity segment of stable id, else primary param id."""
    stable_id = row.get("id")
    if stable_id:
        parts = str(stable_id).split(":", 2)
        if len(parts) >= 2 and parts[1]:
            return str(parts[1])

    params = row.get("params") or {}
    for key in ("id", "announcementId", "courseId"):
        if key in params and params[key] is not None:
            return str(params[key])

    return str(stable_id or row.get("kind", "unknown"))


def send_utility_pushes_for_users(
    *,
    users_qs: QuerySet[User],
    kinds_filter: set[str] | None,
    now: dt.datetime,
    tenant_tz: str,
    sent_on_date: dt.date,
) -> tuple[int, int]:
    """
    Evaluate utility notifications per user, dedupe, and enqueue Expo pushes.

    Returns (sent_count, skipped_dedupe_count).
    """
    sent = 0
    skipped = 0

    for user in users_qs.iterator():
        rows = utility_notifications_for_user(user, now=now, tenant_tz=tenant_tz)
        if kinds_filter is not None:
            rows = [row for row in rows if row["kind"] in kinds_filter]
        if not rows:
            continue

        for row in rows:
            kind = row["kind"]
            reference_id = reference_id_from_notification_row(row)
            if not should_send_utility_push(user, kind, reference_id, sent_on_date):
                skipped += 1
                continue

            enqueue_push_for_user_ids(
                [user.id],
                title=row["title"],
                body=row["body"],
                data={
                    "type": "utility",
                    "kind": kind,
                    "route": row["route"],
                    "params": row["params"],
                    "notification_id": row["id"],
                },
            )
            record_utility_push_sent(user, kind, reference_id, sent_on_date)
            sent += 1

    return sent, skipped


def send_utility_pushes_for_user_rows(
    *,
    user_rows: list[tuple[User, list[dict[str, Any]]]],
    sent_on_date: dt.date,
) -> tuple[int, int]:
    """
    Dedupe and enqueue Expo pushes for pre-built notification rows per user.

    Used by event-centric crons that avoid scanning the full utility catalog.
    """
    sent = 0
    skipped = 0

    for user, rows in user_rows:
        for row in rows:
            kind = row["kind"]
            reference_id = reference_id_from_notification_row(row)
            if not should_send_utility_push(user, kind, reference_id, sent_on_date):
                skipped += 1
                continue

            enqueue_push_for_user_ids(
                [user.id],
                title=row["title"],
                body=row["body"],
                data={
                    "type": "utility",
                    "kind": kind,
                    "route": row["route"],
                    "params": row["params"],
                    "notification_id": row["id"],
                },
            )
            record_utility_push_sent(user, kind, reference_id, sent_on_date)
            sent += 1

    return sent, skipped
