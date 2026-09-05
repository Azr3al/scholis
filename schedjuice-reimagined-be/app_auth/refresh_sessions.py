"""
Server-backed refresh sessions for JWT refresh token rotation and revocation.

Canonical rules for session lifetime, rotation, and replay handling live here.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM
from app_auth.models import RefreshSession, User

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


def _device_metadata_from_request(request) -> dict:
    return {
        "user_agent": (request.META.get("HTTP_USER_AGENT") or "")[:512] or None,
        "device_name": (request.data.get("device_name") or "")[:256] or None,
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
    meta = _device_metadata_from_request(request)
    session = RefreshSession.objects.create(
        user=user,
        session_id=uuid.uuid4(),
        refresh_jti=jti,
        schema_name=tenant_schema,
        remembered=remembered,
        expires_at=expires_at,
        user_agent=meta["user_agent"],
        device_name=meta["device_name"],
    )
    return {
        "access": _access_from_refresh(refresh_str, tenant_schema),
        "refresh": refresh_str,
        "session_id": str(session.session_id),
        "refresh_expires_at": expires_at.isoformat(),
        "remembered": remembered,
    }


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

    try:
        session = RefreshSession.objects.select_related("user").get(
            session_id=session_uuid
        )
    except RefreshSession.DoesNotExist as exc:
        raise AuthenticationFailed("Invalid refresh session.") from exc

    if session.schema_name != request.tenant.schema_name:
        raise AuthenticationFailed("Refresh session tenant mismatch.")

    now = timezone.now()
    if session.revoked_at is not None:
        raise AuthenticationFailed("Refresh session has been revoked.")
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
        session.save(update_fields=["revoked_at", "updated_at"])
    return True


def revoke_all_refresh_sessions_for_user(user: User, request) -> int:
    """Revoke all active refresh sessions for the user in the current tenant."""
    now = timezone.now()
    qs = RefreshSession.objects.filter(
        user=user,
        schema_name=request.tenant.schema_name,
        revoked_at__isnull=True,
    )
    return qs.update(revoked_at=now)
