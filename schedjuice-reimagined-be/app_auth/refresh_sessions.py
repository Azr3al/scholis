"""
Server-backed refresh sessions for JWT refresh token rotation and revocation.

Canonical rules for session lifetime, rotation, and replay handling live here.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.mobile_device_policy import (
    enforce_single_mobile_device,
    register_mobile_device_for_session,
)
from app_auth.models import ClientType, MobileDevice, RefreshSession, User
from app_auth.session_revoked import SessionRevokedAuthenticationFailed

NORMAL_REFRESH_LIFETIME = timedelta(days=7)
REMEMBERED_REFRESH_LIFETIME = timedelta(days=90)


def refresh_lifetime_for_remembered(remembered: bool) -> timedelta:
    return REMEMBERED_REFRESH_LIFETIME if remembered else NORMAL_REFRESH_LIFETIME


def _parse_remembered(value) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("true", "1", "yes")


def _truncate_metadata(value, max_len: int) -> str | None:
    text = (value or "").strip()[:max_len]
    return text or None


def _client_metadata_from_request(request) -> dict:
    client_type = (request.data.get("client_type") or ClientType.WEB).strip().lower()
    if client_type not in (ClientType.WEB, ClientType.MOBILE_NATIVE):
        raise ValidationError({"client_type": "Invalid client_type."})

    installation_raw = request.data.get("device_installation_id")
    if client_type == ClientType.MOBILE_NATIVE and not installation_raw:
        raise ValidationError(
            {"device_installation_id": "Required for mobile_native."}
        )

    installation_id = None
    if installation_raw:
        try:
            installation_id = uuid.UUID(str(installation_raw).strip())
        except (ValueError, AttributeError):
            raise ValidationError(
                {"device_installation_id": "Must be a valid UUID."}
            )

    return {
        "client_type": client_type,
        "installation_id": installation_id,
        "user_agent": (request.META.get("HTTP_USER_AGENT") or "")[:512] or None,
        "display_name": _truncate_metadata(request.data.get("device_name"), 256),
        "device_model": _truncate_metadata(request.data.get("device_model"), 128),
        "os_name": _truncate_metadata(request.data.get("os_name"), 64),
        "os_version": _truncate_metadata(request.data.get("os_version"), 64),
        "app_version": _truncate_metadata(request.data.get("app_version"), 32),
    }


def _access_from_refresh(refresh_str: str, tenant_schema: str) -> str:
    access = RefreshToken(refresh_str).access_token
    access[JWT_TENANT_SCHEMA_CLAIM] = tenant_schema
    return str(access)


def _mint_refresh_token(
    user: User, lifetime: timedelta, tenant_schema: str
) -> tuple[str, str]:
    """Return (refresh_token_string, jti) bound to tenant_schema."""
    refresh = RefreshToken.for_user(user)
    refresh[JWT_TENANT_SCHEMA_CLAIM] = tenant_schema
    refresh.set_exp(lifetime=lifetime)
    return str(refresh), str(refresh["jti"])


def create_refresh_session(
    user: User,
    request,
    *,
    remembered: bool = False,
) -> dict:
    """
    Create a new refresh session and return auth payload fields for login responses.
    """
    remembered = _parse_remembered(
        remembered if remembered is not None else request.data.get("remember")
    )
    lifetime = refresh_lifetime_for_remembered(remembered)
    tenant_schema = request.tenant.schema_name
    refresh_str, jti = _mint_refresh_token(user, lifetime, tenant_schema)
    now = timezone.now()
    expires_at = now + lifetime
    meta = _client_metadata_from_request(request)
    session = RefreshSession.objects.create(
        user=user,
        session_id=uuid.uuid4(),
        refresh_jti=jti,
        schema_name=tenant_schema,
        remembered=remembered,
        expires_at=expires_at,
        user_agent=meta["user_agent"],
        device_name=meta["display_name"],
        client_type=meta["client_type"],
        last_seen_at=now,
    )
    org = request.tenant
    if meta["client_type"] == ClientType.MOBILE_NATIVE:
        mobile_device = register_mobile_device_for_session(user, session, meta, org)
        enforce_single_mobile_device(user, session, mobile_device, org)
    return {
        "access": _access_from_refresh(refresh_str, tenant_schema),
        "refresh": refresh_str,
        "session_id": str(session.session_id),
        "refresh_expires_at": expires_at.isoformat(),
        "remembered": remembered,
    }


def _optional_installation_id_from_request(request) -> uuid.UUID | None:
    """Parse optional device_installation_id; invalid values are ignored on refresh."""
    installation_raw = request.data.get("device_installation_id")
    if not installation_raw:
        return None
    try:
        return uuid.UUID(str(installation_raw).strip())
    except (ValueError, AttributeError):
        return None


def _touch_session_last_seen(session: RefreshSession, now) -> None:
    """Bump last_seen_at on the session and its linked mobile device, if any."""
    session.last_seen_at = now
    session.save(update_fields=["last_seen_at", "updated_at"])
    if session.mobile_device_id:
        MobileDevice.objects.filter(pk=session.mobile_device_id).update(
            last_seen_at=now
        )


def _get_refresh_jti(refresh_token: str) -> str:
    try:
        token = RefreshToken(refresh_token)
        return str(token["jti"])
    except TokenError as exc:
        raise AuthenticationFailed("Invalid refresh token.") from exc


def refresh_auth_tokens(refresh_token: str, session_id: str, request) -> dict:
    """
    Validate refresh session, rotate refresh JTI, and return new access/refresh credentials.
    """
    if not refresh_token or not session_id:
        raise AuthenticationFailed("refresh and session_id are required.")

    try:
        session_uuid = uuid.UUID(str(session_id))
    except ValueError as exc:
        raise AuthenticationFailed("Invalid session_id.") from exc

    incoming_jti = _get_refresh_jti(refresh_token)
    _optional_installation_id_from_request(request)

    try:
        session = RefreshSession.objects.select_related("user", "mobile_device").get(
            session_id=session_uuid
        )
    except RefreshSession.DoesNotExist as exc:
        raise AuthenticationFailed("Invalid refresh session.") from exc

    if session.schema_name != request.tenant.schema_name:
        raise AuthenticationFailed("Refresh session tenant mismatch.")

    now = timezone.now()
    if session.revoked_at is not None:
        raise SessionRevokedAuthenticationFailed(session.revoked_reason)
    if session.expires_at <= now:
        raise AuthenticationFailed("Refresh session has expired.")

    if session.refresh_jti != incoming_jti:
        # Possible refresh token replay after rotation — revoke the session.
        session.revoked_at = now
        session.save(update_fields=["revoked_at", "updated_at"])
        raise AuthenticationFailed("Refresh token reuse detected.")

    user = session.user
    if not user.is_active:
        session.revoked_at = now
        session.save(update_fields=["revoked_at", "updated_at"])
        raise AuthenticationFailed("User account is inactive.")

    lifetime = refresh_lifetime_for_remembered(session.remembered)
    tenant_schema = session.schema_name
    new_refresh_str, new_jti = _mint_refresh_token(user, lifetime, tenant_schema)
    expires_at = now + lifetime
    session.refresh_jti = new_jti
    session.expires_at = expires_at
    session.save(update_fields=["refresh_jti", "expires_at", "updated_at"])
    _touch_session_last_seen(session, now)

    return {
        "access": _access_from_refresh(new_refresh_str, tenant_schema),
        "refresh": new_refresh_str,
        "session_id": str(session.session_id),
        "refresh_expires_at": expires_at.isoformat(),
    }


def revoke_refresh_session(
    *,
    session_id: str | None = None,
    refresh_token: str | None = None,
    request,
    reason: str | None = None,
) -> bool:
    """Revoke a single session by session_id and/or matching refresh token JTI."""
    now = timezone.now()
    session = None

    if session_id:
        try:
            session_uuid = uuid.UUID(str(session_id))
            session = RefreshSession.objects.filter(session_id=session_uuid).first()
        except ValueError:
            return False

    if session is None and refresh_token:
        try:
            jti = _get_refresh_jti(refresh_token)
            session = RefreshSession.objects.filter(refresh_jti=jti).first()
        except AuthenticationFailed:
            return False

    if session is None:
        return False

    if session.schema_name != request.tenant.schema_name:
        return False

    if session.revoked_at is None:
        session.revoked_at = now
        update_fields = ["revoked_at", "updated_at"]
        if reason is not None:
            session.revoked_reason = reason
            update_fields.append("revoked_reason")
        session.save(update_fields=update_fields)
    return True


def revoke_all_refresh_sessions_for_user(
    user: User, request, *, reason: str | None = None
) -> int:
    """Revoke all active refresh sessions for the user in the current tenant."""
    now = timezone.now()
    qs = RefreshSession.objects.filter(
        user=user,
        schema_name=request.tenant.schema_name,
        revoked_at__isnull=True,
    )
    values = {"revoked_at": now}
    if reason is not None:
        values["revoked_reason"] = reason
    return qs.update(**values)
