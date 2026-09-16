"""
Background work for the Scholis integration.

Both tasks take ``schema_name`` first and run on ``TenantTask``, which wraps the
body in ``schema_context``. A Celery worker has no request and therefore no
``X-Tenant`` header, so without that wrapper these would read and write whichever
schema the connection happened to be left pointing at -- and in a multi-tenant
database that is how one school's marks arrive in another school's gradebook.

Retries are bounded and the work is idempotent, so a task that fails halfway can
be run again without duplicating anything: scores upsert on ``attempt_id`` and
events on ``event_id``.
"""
from __future__ import annotations

import logging
from typing import Any

from celery import shared_task

from app_utils.celery_tasks import TenantTask

logger = logging.getLogger(__name__)

# Catch-up is paged because Scholis caps a single page at 500 events, and a
# school that was disconnected over an exam period can have more than that
# waiting.
CATCH_UP_PAGE = 200
CATCH_UP_MAX_PAGES = 50


@shared_task(
    base=TenantTask,
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 4},
)
def pull_scores_for_tenant(self, schema_name: str) -> dict[str, Any]:
    """
    Pull released marks for one tenant and project them into its gradebook.

    Called from the webhook receiver when Scholis releases an attempt, and worth
    calling on a schedule as well: a delivery that never arrived is otherwise
    only noticed by a teacher asking where a mark is.
    """
    from app_scholis.errors import ScholisError
    from app_scholis.scores import pull_scores

    try:
        report = pull_scores()
    except ScholisError as e:
        logger.warning("Scholis: score pull failed for %s: %s", schema_name, e.message)
        raise

    result = {
        "schema": schema_name,
        "fetched": report.fetched,
        "stored": report.stored,
        "written_to_gradebook": report.written_to_gradebook,
        "unlinked_papers": report.unlinked_papers,
        "without_student": report.without_student,
        "errors": report.errors,
    }
    logger.info("Scholis: score pull for %s -> %s", schema_name, result)
    return result


@shared_task(base=TenantTask, bind=True)
def catch_up_events(self, schema_name: str) -> dict[str, Any]:
    """
    Replay events this tenant missed, oldest first.

    Scholis keeps an ordered event log per organisation and serves it from
    ``GET /events?since=<seq>``. Asking from the highest sequence already
    processed is what makes this safe to run at any time: it either finds nothing
    or finds exactly the gap.

    This is the recovery path for every way a delivery can be lost -- an outage
    here, a bad signature secret, a webhook URL that changed. Without it the only
    symptom is marks that never appear.
    """
    from app_scholis.errors import ScholisError
    from app_scholis.provisioning import get_active_connection, org_client
    from app_scholis.webhook_handling import handle_delivery

    connection = get_active_connection()
    if connection is None or not connection.has_credentials:
        logger.info("Scholis: %s is not connected; nothing to catch up", schema_name)
        return {
            "schema": schema_name,
            "seen": 0,
            "applied": 0,
            "skipped": "not_connected",
        }

    client = org_client(connection)
    seen = 0
    applied = 0
    duplicates = 0
    cursor = connection.last_event_seq

    for _page in range(CATCH_UP_MAX_PAGES):
        since = None if cursor is None else str(cursor)
        try:
            page = client.list_events(since=since, limit=CATCH_UP_PAGE)
        except ScholisError as e:
            logger.warning(
                "Scholis: catch-up failed for %s: %s", schema_name, e.message
            )
            raise

        events = page.get("events") or []
        if not events:
            break

        # Ordered by sequence before being applied. Scholis returns them in order,
        # but relying on a remote's ordering for something as load-bearing as a
        # catch-up cursor is the kind of trust that expires without notice.
        for event in sorted(events, key=_seq_of):
            seen += 1
            raw = _reencode(event)
            result = handle_delivery(
                connection=connection, raw_body=raw, from_catch_up=True
            )
            if result.duplicate:
                duplicates += 1
            else:
                applied += 1
            cursor = max(cursor or 0, _seq_of(event))

        if len(events) < CATCH_UP_PAGE:
            break

    logger.info(
        "Scholis: catch-up for %s saw %s, applied %s, %s already known",
        schema_name,
        seen,
        applied,
        duplicates,
    )
    return {
        "schema": schema_name,
        "seen": seen,
        "applied": applied,
        "duplicates": duplicates,
        "cursor": cursor,
    }


def _seq_of(event: dict[str, Any]) -> int:
    try:
        return int(str(event.get("seq") or 0))
    except (TypeError, ValueError):
        return 0


def _reencode(event: dict[str, Any]) -> bytes:
    """
    Turn a caught-up event back into the bytes a delivery would have carried.

    ``handle_delivery`` takes bytes because that is what the signature was
    computed over. On this path there is no signature to check -- the events were
    fetched over an authenticated API call, which is a stronger guarantee than an
    HMAC on a push -- so re-encoding is only about shape, and the separators match
    what Scholis sends so the stored payload is identical either way.
    """
    import json

    return json.dumps(event, separators=(",", ":"), sort_keys=False).encode("utf-8")


__all__ = ["catch_up_events", "pull_scores_for_tenant"]
