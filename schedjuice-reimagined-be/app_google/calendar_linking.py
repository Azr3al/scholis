"""Google Calendar OAuth binding for consultant scheduling."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.db import connection
from django.utils import timezone

from app_auth.models import User
from app_auth.models_user_google_calendar_oauth import UserGoogleCalendarOAuth
from app_google.google_auth import GoogleTokenVerificationError, verify_google_id_token
from app_google.linking import assert_google_enabled, assert_google_oauth_configured
from app_organization.models import Organization


class GoogleCalendarLinkError(ValueError):
    pass


def link_google_calendar(
    user: User,
    token_data: dict[str, Any],
    *,
    org: Organization,
) -> UserGoogleCalendarOAuth:
    assert_google_enabled(org)
    assert_google_oauth_configured()

    refresh_token = str(token_data.get("refresh_token") or "").strip()
    if not refresh_token:
        raise GoogleCalendarLinkError(
            "Google did not return a refresh token; restart calendar connection."
        )

    access_token = str(token_data.get("access_token") or "").strip()
    expires_in = int(token_data.get("expires_in") or 3600)
    expires_at = timezone.now() + timedelta(seconds=max(60, expires_in - 60))

    authorized_email = ""
    authorized_display_name = ""
    id_token = token_data.get("id_token")
    if id_token:
        try:
            claims = verify_google_id_token(str(id_token))
        except GoogleTokenVerificationError as exc:
            raise GoogleCalendarLinkError(str(exc)) from exc
        if not claims.get("email_verified"):
            raise GoogleCalendarLinkError("Google account email is not verified.")
        authorized_email = str(claims.get("email") or "").strip()
        authorized_display_name = str(claims.get("name") or "").strip()

    oauth_row, _ = UserGoogleCalendarOAuth.objects.get_or_create(
        user=user,
        defaults={"status": UserGoogleCalendarOAuth.Status.ACTIVE},
    )
    oauth_row.set_tokens(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at,
    )
    oauth_row.authorized_email = authorized_email
    oauth_row.authorized_display_name = authorized_display_name
    oauth_row.status = UserGoogleCalendarOAuth.Status.ACTIVE
    oauth_row.last_error = ""
    oauth_row.save(
        update_fields=[
            "authorized_email",
            "authorized_display_name",
            "status",
            "last_error",
            "updated_at",
        ]
    )

    schema_name = getattr(connection, "schema_name", None) or ""
    if schema_name:
        from app_google.calendar_channel import ensure_calendar_watch

        ensure_calendar_watch(user, schema_name)

    return oauth_row


def clear_google_calendar_binding(user: User, *, tenant_schema: str) -> None:
    oauth_row = UserGoogleCalendarOAuth.objects.filter(user_id=user.id).first()
    if oauth_row is None or oauth_row.status != UserGoogleCalendarOAuth.Status.ACTIVE:
        raise GoogleCalendarLinkError(
            "Google Calendar is not connected for this account."
        )

    from app_google.calendar_channel import get_push_channel, stop_push_channel
    from app_organization.models import GoogleCalendarPushChannel
    from tenant_schemas.utils import get_public_schema_name, schema_context

    channel = get_push_channel(tenant_schema, user.id)
    if channel is not None:
        stop_push_channel(channel)
        with schema_context(get_public_schema_name()):
            GoogleCalendarPushChannel.objects.filter(pk=channel.pk).delete()

    oauth_row.access_token_ct = ""
    oauth_row.refresh_token_ct = ""
    oauth_row.expires_at = None
    oauth_row.authorized_email = ""
    oauth_row.authorized_display_name = ""
    oauth_row.status = UserGoogleCalendarOAuth.Status.DISCONNECTED
    oauth_row.last_error = ""
    oauth_row.save(
        update_fields=[
            "access_token_ct",
            "refresh_token_ct",
            "expires_at",
            "authorized_email",
            "authorized_display_name",
            "status",
            "last_error",
            "updated_at",
        ]
    )
