"""Google Calendar push channel registration and lazy renewal."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_google.calendar import (
    GoogleCalendarError,
    register_calendar_watch,
    stop_calendar_watch,
)
from app_organization.models import GoogleCalendarPushChannel

logger = logging.getLogger(__name__)

WATCH_RENEW_WITHIN = timedelta(hours=48)
WATCH_TTL = timedelta(days=6)


def calendar_webhook_notify_url() -> str:
    base = (getattr(settings, "GOOGLE_CALENDAR_WEBHOOK_BASE_URL", None) or "").strip()
    if not base:
        raise GoogleCalendarError("GOOGLE_CALENDAR_WEBHOOK_BASE_URL is not configured.")
    return f"{base.rstrip('/')}/notify/"


def _channel_expiration_ms() -> int:
    return int((timezone.now() + WATCH_TTL).timestamp() * 1000)


def _parse_watch_expiration(raw: str | int | None) -> datetime:
    if raw is None:
        return timezone.now() + WATCH_TTL
    try:
        ms = int(raw)
    except (TypeError, ValueError):
        return timezone.now() + WATCH_TTL
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def get_push_channel(
    tenant_schema: str,
    consultant_user_id: int,
) -> GoogleCalendarPushChannel | None:
    with schema_context(get_public_schema_name()):
        return GoogleCalendarPushChannel.objects.filter(
            tenant_schema=tenant_schema,
            consultant_user_id=consultant_user_id,
        ).first()


def channel_needs_renewal(channel: GoogleCalendarPushChannel | None) -> bool:
    if channel is None:
        return True
    return channel.expiration <= timezone.now() + WATCH_RENEW_WITHIN


def stop_push_channel(channel: GoogleCalendarPushChannel) -> None:
    with schema_context(channel.tenant_schema):
        user = User.objects.filter(id=channel.consultant_user_id).first()
        if user is None:
            return
        try:
            stop_calendar_watch(
                user,
                channel_id=channel.channel_id,
                resource_id=channel.resource_id,
            )
        except GoogleCalendarError:
            logger.exception(
                "Failed stopping Google Calendar watch channel=%s schema=%s user=%s",
                channel.channel_id,
                channel.tenant_schema,
                channel.consultant_user_id,
            )


def ensure_calendar_watch(
    consultant: User,
    tenant_schema: str,
    *,
    force_renew: bool = False,
) -> GoogleCalendarPushChannel | None:
    existing = get_push_channel(tenant_schema, consultant.id)
    if existing and not force_renew and not channel_needs_renewal(existing):
        return existing

    try:
        webhook_url = calendar_webhook_notify_url()
    except GoogleCalendarError:
        logger.warning(
            "Skipping Google Calendar watch registration for user=%s schema=%s: webhook URL unset",
            consultant.id,
            tenant_schema,
        )
        return existing

    if existing:
        stop_push_channel(existing)

    channel_id = uuid.uuid4().hex
    try:
        watch_data = register_calendar_watch(
            consultant,
            webhook_url=webhook_url,
            channel_id=channel_id,
            expiration_ms=_channel_expiration_ms(),
        )
    except GoogleCalendarError:
        logger.exception(
            "Failed registering Google Calendar watch user=%s schema=%s",
            consultant.id,
            tenant_schema,
        )
        return existing

    expiration = _parse_watch_expiration(watch_data.get("expiration"))
    resource_id = str(watch_data.get("resourceId") or "").strip()
    preserved_sync_token = existing.sync_token if existing else ""

    with schema_context(get_public_schema_name()):
        channel, _ = GoogleCalendarPushChannel.objects.update_or_create(
            tenant_schema=tenant_schema,
            consultant_user_id=consultant.id,
            defaults={
                "channel_id": channel_id,
                "resource_id": resource_id,
                "expiration": expiration,
                "sync_token": preserved_sync_token,
            },
        )
    return channel


def maybe_renew_calendar_watch(channel: GoogleCalendarPushChannel) -> None:
    if not channel_needs_renewal(channel):
        return
    with schema_context(channel.tenant_schema):
        consultant = User.objects.filter(id=channel.consultant_user_id).first()
        if consultant is None:
            return
        ensure_calendar_watch(
            consultant,
            channel.tenant_schema,
            force_renew=True,
        )


def get_push_channel_by_channel_id(channel_id: str) -> GoogleCalendarPushChannel | None:
    with schema_context(get_public_schema_name()):
        return GoogleCalendarPushChannel.objects.filter(channel_id=channel_id).first()


def save_push_channel_sync_token(channel: GoogleCalendarPushChannel, sync_token: str | None) -> None:
    token = (sync_token or "").strip()
    with schema_context(get_public_schema_name()):
        GoogleCalendarPushChannel.objects.filter(pk=channel.pk).update(
            sync_token=token,
            updated_at=timezone.now(),
        )
    channel.sync_token = token
