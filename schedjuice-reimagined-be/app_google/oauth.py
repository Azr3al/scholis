"""Google OAuth 2.0 authorization-code flow: signed state, token exchange."""

from __future__ import annotations

import json
from datetime import timedelta
from enum import Enum
from typing import Any
from urllib.parse import urlencode, urlparse

import requests
from decouple import config
from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_microsoft.oauth import OAuthReturnPathError, validate_return_path
from app_organization.models import Organization
from app_organization.tenant_resolution_cache import normalize_domain_for_tenant_lookup

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

_SALT = "app_google.oauth.state"


class OAuthStateError(ValueError):
    pass


class GoogleOAuthError(RuntimeError):
    pass


class OAuthReturnOriginError(ValueError):
    pass


class GoogleOAuthPurpose(str, Enum):
    LOGIN = "login"
    LINK = "link"
    CALENDAR_LINK = "calendar-link"


LOGIN_OAUTH_SCOPES = "openid email profile"
CALENDAR_LINK_OAUTH_SCOPES = (
    "openid email profile "
    "https://www.googleapis.com/auth/calendar.events "
    "https://www.googleapis.com/auth/calendar.readonly"
)


def build_state_token(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return TimestampSigner(salt=_SALT).sign(body)


def parse_state_token(token: str) -> dict[str, Any]:
    ttl = int(getattr(settings, "GOOGLE_OAUTH_STATE_TTL_SECONDS", 600))
    try:
        body = TimestampSigner(salt=_SALT).unsign(token, max_age=ttl)
    except SignatureExpired as exc:
        raise OAuthStateError("OAuth state expired; restart sign-in.") from exc
    except BadSignature as exc:
        raise OAuthStateError("OAuth state is invalid.") from exc
    try:
        out = json.loads(body)
    except json.JSONDecodeError as exc:
        raise OAuthStateError("OAuth state payload is corrupted.") from exc
    if not isinstance(out, dict):
        raise OAuthStateError("OAuth state must be a JSON object.")
    return out


def _oauth_client_id() -> str:
    return (getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "") or "").strip()


def _oauth_client_secret() -> str:
    return (getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "") or "").strip()


def _oauth_redirect_url() -> str:
    return (getattr(settings, "GOOGLE_OAUTH_REDIRECT_URL", "") or "").strip()


def assert_google_oauth_flow_configured() -> None:
    if not _oauth_client_id() or not _oauth_client_secret() or not _oauth_redirect_url():
        raise GoogleOAuthError(
            "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and "
            "GOOGLE_OAUTH_REDIRECT_URL must be configured."
        )


def build_authorize_url(
    state: str,
    *,
    scopes: str = LOGIN_OAUTH_SCOPES,
    access_type: str = "online",
    prompt: str = "select_account",
) -> str:
    assert_google_oauth_flow_configured()
    params = {
        "client_id": _oauth_client_id(),
        "response_type": "code",
        "redirect_uri": _oauth_redirect_url(),
        "scope": scopes,
        "state": state,
        "access_type": access_type,
        "prompt": prompt,
    }
    return f"{GOOGLE_AUTHORIZE_URL}?{urlencode(params)}"


def build_calendar_link_authorize_url(state: str) -> str:
    return build_authorize_url(
        state,
        scopes=CALENDAR_LINK_OAUTH_SCOPES,
        access_type="offline",
        prompt="consent",
    )


def exchange_code(code: str, *, require_id_token: bool = True) -> dict[str, Any]:
    assert_google_oauth_flow_configured()
    redirect = _oauth_redirect_url()
    try:
        res = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": _oauth_client_id(),
                "client_secret": _oauth_client_secret(),
                "redirect_uri": redirect,
                "grant_type": "authorization_code",
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        raise GoogleOAuthError(f"Google token request failed: {exc}") from exc
    if res.status_code not in range(200, 300):
        raise GoogleOAuthError(
            f"Google token error {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        data = res.json() or {}
    except ValueError as exc:
        raise GoogleOAuthError("Google token response was not valid JSON.") from exc
    if require_id_token and not data.get("id_token"):
        raise GoogleOAuthError("Google token response did not include id_token.")
    return data


def refresh_access_token(credential) -> str:
    """Refresh tokens on ``UserGoogleCalendarOAuth``; returns new access token."""
    reconnect = credential.__class__.Status.NEEDS_RECONNECT
    rt = credential.refresh_token
    if not rt:
        credential.status = reconnect
        credential.save(update_fields=["status", "updated_at"])
        raise GoogleOAuthError("No refresh token stored for this Google Calendar connection.")

    try:
        res = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": _oauth_client_id(),
                "client_secret": _oauth_client_secret(),
                "refresh_token": rt,
                "grant_type": "refresh_token",
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        credential.status = reconnect
        credential.save(update_fields=["status", "updated_at"])
        raise GoogleOAuthError(f"Google token refresh failed: {exc}") from exc

    if res.status_code not in range(200, 300):
        credential.status = reconnect
        credential.save(update_fields=["status", "updated_at"])
        raise GoogleOAuthError(
            f"Google token refresh error {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        data = res.json() or {}
    except ValueError as exc:
        credential.status = reconnect
        credential.save(update_fields=["status", "updated_at"])
        raise GoogleOAuthError("Google refresh response was not valid JSON.") from exc

    new_access = data.get("access_token") or ""
    new_refresh = data.get("refresh_token") or rt
    expires_in = int(data.get("expires_in") or 3600)
    now = timezone.now()
    exp = now + timedelta(seconds=max(60, expires_in - 60))

    if not new_access:
        credential.status = reconnect
        credential.save(update_fields=["status", "updated_at"])
        raise GoogleOAuthError("Google returned no access_token on refresh.")

    credential.set_tokens(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_at=exp,
    )
    credential.status = credential.__class__.Status.ACTIVE
    credential.last_error = ""
    credential.save(update_fields=["status", "last_error", "updated_at"])
    return new_access


def get_valid_access_token(credential) -> str:
    """Return a usable OAuth access token for ``UserGoogleCalendarOAuth``."""
    now = timezone.now()
    buffer_seconds = 60
    exp = credential.expires_at
    if (
        credential.access_token
        and exp is not None
        and exp > now + timedelta(seconds=buffer_seconds)
    ):
        return credential.access_token
    return refresh_access_token(credential)


def normalize_return_origin(raw: str) -> str:
    origin = str(raw or "").strip().rstrip("/")
    if not origin:
        raise OAuthReturnOriginError("return_origin is required.")
    if not origin.startswith("http://") and not origin.startswith("https://"):
        raise OAuthReturnOriginError("return_origin must include http:// or https://.")
    parsed = urlparse(origin)
    if not parsed.scheme or not parsed.netloc:
        raise OAuthReturnOriginError("return_origin is not a valid origin.")
    return f"{parsed.scheme}://{parsed.netloc}"


def _hostname_from_origin(origin: str) -> str:
    return normalize_domain_for_tenant_lookup(urlparse(origin).netloc)


_LOCAL_DEV_HOSTS = frozenset({"localhost", "127.0.0.1"})


def _is_local_dev_host(host: str) -> bool:
    return host in _LOCAL_DEV_HOSTS


def _dev_return_origin_allowed() -> bool:
    return config("IS_DEV", False, cast=bool) or getattr(settings, "DEBUG", False)


def resolve_org_from_return_origin(return_origin: str) -> Organization:
    origin = normalize_return_origin(return_origin)
    host = _hostname_from_origin(origin)
    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(domain_url=host).first()
        if org:
            return org
        if _dev_return_origin_allowed() and _is_local_dev_host(host):
            dev_domain = normalize_domain_for_tenant_lookup(
                config("DEV_TENANT_DOMAIN", "schedjuice.thiha.net")
            )
            org = Organization.objects.filter(domain_url=dev_domain).first()
            if org:
                return org
    raise OAuthReturnOriginError("Unknown school for return_origin.")


def validate_return_origin_for_org(return_origin: str, org: Organization) -> str:
    origin = normalize_return_origin(return_origin)
    host = _hostname_from_origin(origin)
    expected = normalize_domain_for_tenant_lookup(org.domain_url or "")
    if host == expected:
        return origin
    if _dev_return_origin_allowed() and _is_local_dev_host(host):
        return origin
    raise OAuthReturnOriginError("return_origin does not match this school.")


def parse_return_path(raw: str | None, *, default: str = "/login") -> str:
    if raw is None or str(raw).strip() == "":
        return default
    try:
        path = validate_return_path(str(raw))
    except OAuthReturnPathError as exc:
        raise OAuthReturnOriginError(str(exc)) from exc
    return path or default
