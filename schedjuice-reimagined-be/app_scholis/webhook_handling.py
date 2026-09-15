"""
Handling an inbound Scholis delivery.

Split into "record" and "act", in that order, and the split is the whole design.

Recording first means a delivery is never lost because this app did not
understand it. An event type Scholis adds next month is stored, visible and
countable here before anybody writes a handler for it -- which turns "where did
that mark go?" into a query rather than an investigation.

Acting second, and only for types recognised here, means an unhandled event
cannot half-do something. And because the record is unique on ``event_id``, a
retry -- which Scholis will send for anything it did not get a 2xx for -- is
recognised as a duplicate and does not write a student's marks twice.

Only ``attempt.released.v1`` triggers work. That is the moment a mark becomes
visible to this system at all: Scholis serves released results and nothing else,
so an unreleased attempt is not merely uninteresting, it is unfetchable.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Q

from app_scholis.errors import ScholisError
from app_scholis.models import ScholisConnection, ScholisWebhookEvent

logger = logging.getLogger(__name__)

#: Released marks exist for this attempt and may now be fetched.
EVENT_ATTEMPT_RELEASED = "attempt.released.v1"

#: Recorded and counted, but nothing to do: Scholis will not serve an unreleased
#: result, so pulling early would fetch nothing and look like a failure.
EVENTS_RECORDED_ONLY = frozenset(
    {
        "attempt.started.v1",
        "attempt.submitted.v1",
        "attempt.graded.v1",
        "test.published.v1",
    }
)


class MalformedDelivery(ScholisError):
    """The body was not the JSON Scholis sends. Raised before anything is stored."""


@dataclass(frozen=True)
class HandledDelivery:
    event: ScholisWebhookEvent
    duplicate: bool
    action: str


def parse_body(raw: bytes) -> dict[str, Any]:
    """
    Decode a delivery body.

    Takes the exact bytes that were signed. Parsing here and passing the dict
    onward is safe precisely because verification already happened against those
    bytes -- re-serialising afterwards would produce different text, but nothing
    downstream signs anything.
    """
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as e:
        raise MalformedDelivery(f"Delivery body is not valid JSON ({e}).") from e
    if not isinstance(body, dict):
        raise MalformedDelivery("Delivery body is not a JSON object.")
    return body


def handle_delivery(
    *, connection: ScholisConnection, raw_body: bytes, from_catch_up: bool = False
) -> HandledDelivery:
    """
    Record a delivery and act on it if it is one this app understands.

    Signature verification is the caller's job and must already have happened:
    this function trusts its input, and trusting it is only safe because the HMAC
    was checked against the exact bytes passed in here.
    """
    body = parse_body(raw_body)
    event = record_event(connection=connection, body=body, from_catch_up=from_catch_up)

    if event.duplicate:
        return HandledDelivery(event=event.event, duplicate=True, action="duplicate")

    action = act_on(event.event)
    return HandledDelivery(event=event.event, duplicate=False, action=action)


@dataclass(frozen=True)
class RecordResult:
    event: ScholisWebhookEvent
    duplicate: bool


def record_event(
    *, connection: ScholisConnection, body: dict[str, Any], from_catch_up: bool = False
) -> RecordResult:
    """
    Store an event, idempotently, and advance the catch-up cursor.

    A duplicate is detected by the unique constraint rather than by a prior
    lookup: two deliveries arriving at the same moment would both pass a
    SELECT-then-INSERT check and one would write marks twice.
    """
    event_id = body.get("id")
    event_type = str(body.get("type") or "")
    seq = _as_seq(body.get("seq"))

    if not event_id:
        raise MalformedDelivery(
            "Delivery has no event id, so it cannot be deduplicated."
        )

    try:
        with transaction.atomic():
            event = ScholisWebhookEvent.objects.create(
                connection=connection,
                event_id=str(event_id),
                seq=seq,
                type=event_type,
                subject_type=str(body.get("subjectType") or ""),
                subject_id=str(body.get("subjectId") or ""),
                payload=body.get("payload") or {},
                occurred_at=_occurred_at(body),
                from_catch_up=from_catch_up,
            )
    except IntegrityError:
        existing = ScholisWebhookEvent.objects.filter(event_id=str(event_id)).first()
        if existing is None:
            # The constraint fired on something else. Re-raised rather than
            # swallowed: a delivery we cannot account for is worse than a 500.
            raise
        logger.info("Scholis: duplicate delivery of event %s ignored", event_id)
        return RecordResult(event=existing, duplicate=True)

    if seq is not None:
        _advance_cursor(connection, seq)

    return RecordResult(event=event, duplicate=False)


def act_on(event: ScholisWebhookEvent) -> str:
    """
    Do the work an event implies. Returns a short label for logging and tests.

    Anything unrecognised is left alone on purpose. Storing an event this app has
    no handler for is not an error, and treating it as one would turn every
    Scholis release that adds an event type into an incident here.
    """
    if event.type == EVENT_ATTEMPT_RELEASED:
        _schedule_score_pull(event)
        return "score_pull_scheduled"

    if event.type in EVENTS_RECORDED_ONLY:
        return "recorded"

    logger.info("Scholis: no handler for event type %s (stored anyway)", event.type)
    return "unhandled"


def _schedule_score_pull(event: ScholisWebhookEvent) -> None:
    """
    Queue a score pull for the tenant that owns this event.

    Queued rather than run inline for two reasons. The receiver has to answer
    quickly, because Scholis treats a slow receiver as a failing one and retries
    -- and a retry storm during a release is exactly when the database is busiest.
    And a whole class released at once produces one event per attempt; a short
    delay collapses that into one pull, since pulling is idempotent and reads
    everything released.
    """
    schema = _schema_name()
    if not schema:
        logger.warning(
            "Scholis: cannot resolve a schema for event %s; score pull not queued",
            event.event_id,
        )
        return

    try:
        from app_scholis.tasks import pull_scores_for_tenant

        pull_scores_for_tenant.delay(schema)
    except Exception as e:  # noqa: BLE001 - no broker in dev, and the event is stored
        # Not fatal. The event is recorded and the cursor has advanced, so a
        # scheduled catch-up will pick the marks up. Failing the delivery here
        # would make Scholis retry a push we already handled.
        logger.warning("Scholis: could not queue score pull for %s: %s", schema, e)


def _advance_cursor(connection: ScholisConnection, seq: int) -> None:
    """
    Move the catch-up cursor forward, never backward.

    Filtered on "less than the new value" rather than read-then-written, so two
    deliveries processed concurrently cannot leave the cursor pointing at the
    older one. A cursor that goes backward replays events; one that stalls only
    re-reads a few, and re-reading is free because handling is idempotent.
    """
    ScholisConnection.objects.filter(
        Q(pk=connection.pk)
        & (Q(last_event_seq__lt=seq) | Q(last_event_seq__isnull=True))
    ).update(last_event_seq=seq)

    if connection.last_event_seq is None or seq > connection.last_event_seq:
        connection.last_event_seq = seq


def _as_seq(value: Any) -> int | None:
    """Scholis sends seq as a string; a number is accepted too."""
    if value is None or value == "":
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        logger.warning("Scholis: delivery carried a non-numeric seq %r", value)
        return None


def _occurred_at(body: dict[str, Any]):
    from app_scholis.times import parse_when

    return parse_when(body.get("occurredAt"))


def _schema_name() -> str:
    from app_scholis.provisioning import current_schema_name

    try:
        return current_schema_name()
    except ScholisError:
        return ""


__all__ = [
    "EVENT_ATTEMPT_RELEASED",
    "EVENTS_RECORDED_ONLY",
    "HandledDelivery",
    "MalformedDelivery",
    "act_on",
    "handle_delivery",
    "parse_body",
    "record_event",
]
