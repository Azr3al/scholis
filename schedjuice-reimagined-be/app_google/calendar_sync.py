"""Sync Google Calendar changes back into consultation bookings."""

from __future__ import annotations

import logging

from django.db import connection
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_consultation.booking_service import cancel_booking
from app_consultation.models import ConsultationBooking
from app_google.calendar import GoogleCalendarError, list_calendar_event_changes
from app_google.calendar_channel import (
    get_push_channel_by_channel_id,
    maybe_renew_calendar_watch,
    save_push_channel_sync_token,
)
from utilitas.async_tasks import django_q_task

logger = logging.getLogger(__name__)


def _booking_id_from_event(event: dict) -> int | None:
    private = (event.get("extendedProperties") or {}).get("private") or {}
    raw = private.get("schedjuice_booking_id")
    if raw is None:
        return None
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return None


def _find_confirmed_booking(
    consultant: User,
    *,
    event_id: str,
    booking_id: int | None,
) -> ConsultationBooking | None:
    if event_id:
        booking = ConsultationBooking.objects.filter(
            consultant=consultant,
            google_calendar_event_id=event_id,
            status=ConsultationBooking.Status.CONFIRMED,
        ).first()
        if booking is not None:
            return booking

    if booking_id is not None:
        return ConsultationBooking.objects.filter(
            id=booking_id,
            consultant=consultant,
            status=ConsultationBooking.Status.CONFIRMED,
        ).first()
    return None


def _cancel_booking_for_removed_event(
    consultant: User,
    event: dict,
) -> ConsultationBooking | None:
    event_id = str(event.get("id") or "").strip()
    if not event_id:
        return None
    if str(event.get("status") or "").lower() != "cancelled":
        return None

    booking = _find_confirmed_booking(
        consultant,
        event_id=event_id,
        booking_id=_booking_id_from_event(event),
    )
    if booking is None:
        return None

    return cancel_booking(
        booking,
        cancelled_by=ConsultationBooking.CancelledBy.CONSULTANT,
    )


@django_q_task
def sync_calendar_changes_for_channel(channel_id: str) -> None:
    channel = get_push_channel_by_channel_id(channel_id)
    if channel is None:
        logger.warning("Google Calendar sync ignored unknown channel_id=%s", channel_id)
        return

    maybe_renew_calendar_watch(channel)

    with schema_context(channel.tenant_schema):
        consultant = User.objects.filter(id=channel.consultant_user_id).first()
        if consultant is None:
            logger.warning(
                "Google Calendar sync missing consultant user=%s schema=%s",
                channel.consultant_user_id,
                channel.tenant_schema,
            )
            return

        try:
            events, next_sync_token = list_calendar_event_changes(
                consultant,
                channel.sync_token or None,
            )
        except GoogleCalendarError:
            logger.exception(
                "Google Calendar sync failed user=%s schema=%s channel=%s",
                consultant.id,
                channel.tenant_schema,
                channel_id,
            )
            return

        for event in events:
            try:
                _cancel_booking_for_removed_event(consultant, event)
            except Exception:
                logger.exception(
                    "Google Calendar sync failed cancelling booking event=%s schema=%s",
                    event.get("id"),
                    channel.tenant_schema,
                )

    if next_sync_token:
        save_push_channel_sync_token(channel, next_sync_token)


def ensure_calendar_watch_for_current_consultant(consultant: User) -> None:
    schema_name = getattr(connection, "schema_name", None) or ""
    if not schema_name:
        return
    from app_google.calendar_channel import ensure_calendar_watch

    ensure_calendar_watch(consultant, schema_name)
