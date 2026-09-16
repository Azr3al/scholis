"""
Zoom OAuth 2.0 (authorization_code): signed state, token exchange, refresh.

Tokens are stored on ``app_organization.ZoomAccount`` (org-managed) or
``app_auth.UserZoomOAuth`` (personal teacher OAuth).
"""
from __future__ import annotations

import base64
import json
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.utils import timezone

ZOOM_AUTHORIZE_URL = "https://zoom.us/oauth/authorize"
ZOOM_TOKEN_URL = "https://zoom.us/oauth/token"

_SALT = "app_zoom.oauth.state"


class OAuthStateError(ValueError):
    pass


class ZoomOAuthError(RuntimeError):
    pass


def build_state_token(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return TimestampSigner(salt=_SALT).sign(body)


def parse_state_token(token: str) -> dict[str, Any]:
    ttl = int(getattr(settings, "ZOOM_OAUTH_STATE_TTL_SECONDS", 600))
    try:
        body = TimestampSigner(salt=_SALT).unsign(token, max_age=ttl)
    except SignatureExpired as e:
        raise OAuthStateError("OAuth state expired; restart the connection.") from e
    except BadSignature as e:
        raise OAuthStateError("OAuth state is invalid.") from e
    try:
        out = json.loads(body)
    except json.JSONDecodeError as e:
        raise OAuthStateError("OAuth state payload is corrupted.") from e
    if not isinstance(out, dict):
        raise OAuthStateError("OAuth state must be a JSON object.")
    return out


def build_authorize_url(state: str) -> str:
    cid = (getattr(settings, "ZOOM_OAUTH_CLIENT_ID", "") or "").strip()
    redirect = (getattr(settings, "ZOOM_OAUTH_REDIRECT_URL", "") or "").strip()
    if not cid or not redirect:
        raise ZoomOAuthError("ZOOM_OAUTH_CLIENT_ID and ZOOM_OAUTH_REDIRECT_URL must be set.")
    params = {
        "response_type": "code",
        "client_id": cid,
        "redirect_uri": redirect,
        "state": state,
    }
    return f"{ZOOM_AUTHORIZE_URL}?{urlencode(params)}"


def _basic_auth_header() -> str:
    cid = (settings.ZOOM_OAUTH_CLIENT_ID or "").strip()
    secret = (settings.ZOOM_OAUTH_CLIENT_SECRET or "").strip()
    if not cid or not secret:
        raise ZoomOAuthError("ZOOM_OAUTH_CLIENT_ID and ZOOM_OAUTH_CLIENT_SECRET must be set.")
    creds = f"{cid}:{secret}".encode()
    return "Basic " + base64.b64encode(creds).decode()


def _post_token(data: dict[str, str]) -> dict[str, Any]:
    try:
        res = requests.post(
            ZOOM_TOKEN_URL,
            headers={
                "Authorization": _basic_auth_header(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data=data,
            timeout=30,
        )
    except requests.RequestException as e:
        raise ZoomOAuthError(f"Zoom token request failed: {e}") from e
    if res.status_code not in range(200, 300):
        raise ZoomOAuthError(
            f"Zoom token error {res.status_code}: {(res.text or '')[:500]}"
        )
    try:
        return res.json() or {}
    except ValueError as e:
        raise ZoomOAuthError("Zoom token response was not valid JSON.") from e


def exchange_code(code: str) -> dict[str, Any]:
    redirect = (settings.ZOOM_OAUTH_REDIRECT_URL or "").strip()
    if not redirect:
        raise ZoomOAuthError("ZOOM_OAUTH_REDIRECT_URL must be set.")
    return _post_token(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect,
        }
    )


def refresh_access_token(credential) -> str:
    """Refresh tokens on ``ZoomAccount`` or ``UserZoomOAuth``; returns new access token."""
    reconnect = credential.__class__.Status.NEEDS_RECONNECT
    rt = credential.refresh_token
    if not rt:
        credential.status = reconnect
        credential.save(update_fields=["status", "updated_at"])
        raise ZoomOAuthError("No refresh token stored for this Zoom connection.")

    try:
        data = _post_token({"grant_type": "refresh_token", "refresh_token": rt})
    except ZoomOAuthError:
        credential.status = reconnect
        credential.save(update_fields=["status", "updated_at"])
        raise

    new_access = data.get("access_token") or ""
    new_refresh = data.get("refresh_token") or rt
    expires_in = int(data.get("expires_in") or 3600)
    now = timezone.now()
    exp = now + timedelta(seconds=max(60, expires_in - 60))

    if not new_access:
        credential.status = reconnect
        credential.save(update_fields=["status", "updated_at"])
        raise ZoomOAuthError("Zoom returned no access_token on refresh.")

    credential.set_tokens(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_at=exp,
    )
    return new_access


def get_valid_access_token(credential) -> str:
    """Return a usable OAuth access token for ``ZoomAccount`` or ``UserZoomOAuth``."""
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
