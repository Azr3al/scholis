"""
Microsoft OAuth 2.0 (authorization_code): signed state, token exchange, MSAL cache refresh.

Tokens are stored as encrypted MSAL ``SerializableTokenCache`` blobs on
``app_organization.MicrosoftDelegatedAccount`` (org service account) or
``app_auth.UserMicrosoftOAuth`` (per-teacher).
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

import msal
from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.utils import timezone

from app_microsoft.graph_wrapper.base import (
    POSTER_SCOPES,
    SERVICE_ACCOUNT_SCOPES,
    get_msal_app,
)

_SALT = "app_microsoft.oauth.state"
GRAPH_OBO_SCOPES = ["https://graph.microsoft.com/.default"]
logger = logging.getLogger(__name__)


class OAuthStateError(ValueError):
    pass


class MicrosoftOAuthError(RuntimeError):
    pass


class OAuthReturnPathError(ValueError):
    pass


_MAX_RETURN_PATH_LEN = 512
PKCE_VERIFIER_STATE_KEY = "pkce_verifier"


def generate_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for OAuth PKCE (RFC 7636)."""
    verifier = secrets.token_urlsafe(96)[:128]
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .decode("ascii")
        .rstrip("=")
    )
    return verifier, challenge


def validate_return_path(value: str | None) -> str | None:
    """Return a safe in-app path for post-OAuth redirect, or None if empty."""
    if value is None:
        return None
    path = str(value).strip()
    if not path:
        return None
    if len(path) > _MAX_RETURN_PATH_LEN:
        raise OAuthReturnPathError("return_path is too long.")
    if not path.startswith("/"):
        raise OAuthReturnPathError("return_path must start with /.")
    if path.startswith("//"):
        raise OAuthReturnPathError("return_path must be a relative path.")
    if "://" in path:
        raise OAuthReturnPathError("return_path must not contain a scheme.")
    return path


def build_state_token(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return TimestampSigner(salt=_SALT).sign(body)


def parse_state_token(token: str) -> dict[str, Any]:
    ttl = int(getattr(settings, "MS_OAUTH_STATE_TTL_SECONDS", 600))
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


def build_authorize_url(
    tenant,
    state: str,
    scopes: list[str],
    *,
    code_challenge: str,
) -> str:
    redirect = (getattr(settings, "MS_OAUTH_REDIRECT_URL", "") or "").strip()
    if not redirect or not tenant.app_id:
        raise MicrosoftOAuthError(
            "MS_OAUTH_REDIRECT_URL and organization app_id must be configured."
        )
    params = {
        "client_id": tenant.app_id,
        "response_type": "code",
        "redirect_uri": redirect,
        "response_mode": "query",
        "scope": " ".join(["offline_access", *scopes]),
        "state": state,
        "prompt": "select_account",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    authority = (tenant.authority or "").rstrip("/")
    return f"{authority}/oauth2/v2.0/authorize?{urlencode(params)}"


def _cache_for(credential) -> msal.SerializableTokenCache:
    cache = msal.SerializableTokenCache()
    blob = credential.get_msal_cache_blob()
    if blob:
        cache.deserialize(blob)
    return cache


def _persist_cache(credential, cache: msal.SerializableTokenCache) -> None:
    if not cache.has_state_changed:
        return
    credential.set_msal_cache(cache.serialize())


def exchange_code(
    tenant,
    code: str,
    scopes: list[str],
    *,
    code_verifier: str,
) -> tuple[dict[str, Any], str]:
    cache = msal.SerializableTokenCache()
    app = get_msal_app(tenant, cache=cache)
    redirect = (settings.MS_OAUTH_REDIRECT_URL or "").strip()
    result = app.acquire_token_by_authorization_code(
        code,
        scopes=scopes,
        redirect_uri=redirect,
        data={"code_verifier": code_verifier},
    )
    if "access_token" not in result:
        raise MicrosoftOAuthError(
            f"{result.get('error', 'unknown')}: "
            f"{result.get('error_description', result)}"
        )
    return result, cache.serialize()


def get_valid_access_token(tenant, credential, scopes: list[str]) -> str:
    cache = _cache_for(credential)
    app = get_msal_app(tenant, cache=cache)
    accounts = app.get_accounts()
    result = (
        app.acquire_token_silent(scopes, account=accounts[0]) if accounts else None
    )
    _persist_cache(credential, cache)
    if not result or "access_token" not in result:
        status_cls = credential.__class__.Status
        credential.status = status_cls.NEEDS_RECONNECT
        credential.last_error = (
            f"{(result or {}).get('error', 'no_account_in_cache')}: "
            f"{(result or {}).get('error_description', 'silent token acquisition failed')}"
        )[:2000]
        credential.save(update_fields=["status", "last_error", "updated_at"])
        raise MicrosoftOAuthError(credential.last_error)
    expires_in = int(result.get("expires_in") or 3600)
    credential.expires_at = timezone.now() + timedelta(
        seconds=max(60, expires_in - 60)
    )
    credential.save(update_fields=["expires_at", "updated_at"])
    return result["access_token"]


def scopes_for_purpose(purpose: str) -> list[str]:
    if purpose in ("connect_personal", "reconnect_personal"):
        return list(POSTER_SCOPES)
    return list(SERVICE_ACCOUNT_SCOPES)


def apply_connection_from_result(credential, result: dict[str, Any], cache_blob: str) -> None:
    claims = result.get("id_token_claims") or {}
    credential.set_msal_cache(cache_blob)
    credential.authorized_upn = str(
        claims.get("preferred_username") or claims.get("upn") or ""
    )[:320]
    credential.authorized_display_name = str(claims.get("name") or "")[:256]
    oid = str(claims.get("oid") or claims.get("sub") or "")
    if hasattr(credential, "microsoft_object_id"):
        credential.microsoft_object_id = oid[:128]
    elif hasattr(credential, "authorized_object_id"):
        credential.authorized_object_id = oid[:128]
    expires_in = int(result.get("expires_in") or 3600)
    credential.expires_at = timezone.now() + timedelta(
        seconds=max(60, expires_in - 60)
    )
    credential.status = credential.__class__.Status.ACTIVE
    credential.last_error = ""
    credential.save()


def _teams_login_eligible(tenant, user) -> str | None:
    """Return a skip reason, or None when OBO should run."""
    if user is None:
        return "no_user"
    if user.is_student():
        return "student"
    if not getattr(tenant, "is_microsoft_on", False):
        return "microsoft_off"
    if getattr(tenant, "is_teams_creation_enabled", True) is False:
        return "teams_disabled"
    return None


def connect_personal_teams_from_login_token(
    tenant, user, *, obo_assertion: str | None = None
) -> tuple[bool, str | None]:
    """OBO exchange at MS login; persist UserMicrosoftOAuth.

    ``obo_assertion`` must be an access token for this app (e.g.
    ``api://{client-id}/access_as_user``), not a Microsoft Graph token.
  """
    skip = _teams_login_eligible(tenant, user)
    if skip:
        return False, skip
    assertion = (obo_assertion or "").strip()
    if not assertion:
        return False, "missing_obo_assertion"

    from app_auth.models_user_microsoft_oauth import UserMicrosoftOAuth

    try:
        cache = msal.SerializableTokenCache()
        app = get_msal_app(tenant, cache=cache)
    except Exception as exc:
        logger.warning(
            "Teams OBO at login could not load MSAL app for user_id=%s: %s",
            getattr(user, "id", None),
            exc,
        )
        return False, "ms_config_error"

    result = app.acquire_token_on_behalf_of(
        user_assertion=assertion,
        scopes=list(GRAPH_OBO_SCOPES),
    )
    if not result or "access_token" not in result:
        detail = str(
            (result or {}).get("error_description")
            or (result or {}).get("error")
            or "obo_failed"
        )[:500]
        logger.warning(
            "Teams OBO at login failed for user_id=%s: %s",
            getattr(user, "id", None),
            detail,
        )
        return False, detail

    if not result.get("id_token_claims"):
        result = {
            **result,
            "id_token_claims": {
                "oid": getattr(user, "microsoft_id", None) or "",
                "preferred_username": getattr(user, "email", None) or "",
                "name": getattr(user, "name", None) or "",
            },
        }

    cred, _ = UserMicrosoftOAuth.objects.get_or_create(user_id=user.id)
    apply_connection_from_result(cred, result, cache.serialize())
    return True, None
