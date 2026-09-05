"""
Relay Expo EAS BUILD / SUBMIT webhooks to a dedicated Discord channel.

Verify `expo-signature` (HMAC-SHA1) per https://docs.expo.dev/eas/webhooks/
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache

from app_utils.ops_discord_helpers import send_discord_webhook_message

logger = logging.getLogger(__name__)

_STORE_BUILD_PROFILES = frozenset({"production", "teachersucenter", "sdec"})
_DEDUPE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days
_EXPO_GRAPHQL_URL = "https://api.expo.dev/graphql"
_EXPO_BUILD_LOOKUP_TIMEOUT_SECONDS = 10

_BUILD_BY_ID_QUERY = """
query BuildsByIdQuery($buildId: ID!) {
  builds {
    byId(buildId: $buildId) {
      id
      buildProfile
      appVersion
      appBuildVersion
      platform
      project {
        name
      }
    }
  }
}
"""

_STATUS_COLORS = {
    "finished": 0x2ECC71,
    "errored": 0xE74C3C,
    "canceled": 0x95A5A6,
}


def verify_expo_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header or not secret:
        return False
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha1).hexdigest()
    expected = f"sha1={digest}"
    return hmac.compare_digest(expected, header)


def should_notify_build(payload: dict[str, Any]) -> bool:
    metadata = payload.get("metadata") or {}
    profile = (metadata.get("buildProfile") or "").strip()
    return profile in _STORE_BUILD_PROFILES


def should_notify_submit(_payload: dict[str, Any]) -> bool:
    return True


def eas_webhook_dedupe_key(event: str, payload: dict[str, Any]) -> str | None:
    """Stable key for one terminal EAS notification (build/submit id + status)."""
    entity_id = (payload.get("id") or "").strip()
    status = (payload.get("status") or "").strip().lower()
    if not entity_id or not status:
        return None
    return f"eas-webhook:{event}:{entity_id}:{status}"


def claim_eas_webhook_delivery(event: str, payload: dict[str, Any]) -> bool:
    """
    Atomically claim delivery for this payload.

    Returns False when the same event was already claimed (duplicate webhook
    registration, Expo retry after success, or concurrent duplicate POST).
    """
    key = eas_webhook_dedupe_key(event, payload)
    if not key:
        return True
    return cache.add(key, 1, timeout=_DEDUPE_CACHE_TTL_SECONDS)


def release_eas_webhook_delivery(event: str, payload: dict[str, Any]) -> None:
    """Allow a retry after Discord delivery failed."""
    key = eas_webhook_dedupe_key(event, payload)
    if key:
        cache.delete(key)


def _truncate(text: str, max_len: int = 1024) -> str:
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


def _status_color(status: str) -> int:
    return _STATUS_COLORS.get((status or "").lower(), _STATUS_COLORS["errored"])


def fetch_eas_build_metadata(build_id: str) -> dict[str, Any] | None:
    """
    Look up EAS build metadata via Expo GraphQL (requires EXPO_TOKEN).

    Returns None when token is unset, build_id is empty, or lookup fails.
    """
    build_id = (build_id or "").strip()
    token = (getattr(settings, "EXPO_TOKEN", None) or "").strip()
    if not build_id or not token:
        return None

    try:
        response = requests.post(
            _EXPO_GRAPHQL_URL,
            json={"query": _BUILD_BY_ID_QUERY, "variables": {"buildId": build_id}},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=_EXPO_BUILD_LOOKUP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("EAS build lookup failed for %s: %s", build_id, exc)
        return None

    errors = body.get("errors")
    if errors:
        logger.warning("EAS build lookup GraphQL errors for %s: %s", build_id, errors)
        return None

    build = ((body.get("data") or {}).get("builds") or {}).get("byId")
    if not build:
        return None

    project = build.get("project") or {}
    return {
        "buildProfile": (build.get("buildProfile") or "").strip(),
        "appVersion": build.get("appVersion") or "",
        "appBuildVersion": build.get("appBuildVersion") or "",
        "platform": build.get("platform") or "",
        "appName": (project.get("name") or "").strip(),
    }


def format_build_discord_embed(payload: dict[str, Any]) -> dict[str, Any]:
    status = (payload.get("status") or "unknown").lower()
    platform = payload.get("platform") or "unknown"
    metadata = payload.get("metadata") or {}
    profile = metadata.get("buildProfile") or "unknown"
    app_name = metadata.get("appName") or metadata.get("appIdentifier") or "Schedjuice Mobile"
    app_version = metadata.get("appVersion") or "—"
    build_number = metadata.get("appBuildVersion") or "—"
    commit_message = metadata.get("gitCommitMessage") or ""
    details_url = payload.get("buildDetailsPageUrl") or ""
    artifact_url = (payload.get("artifacts") or {}).get("buildUrl") or ""

    status_label = status.capitalize()
    title = f"EAS Build {status_label}: {app_name} ({profile} / {platform})"

    fields: list[dict[str, Any]] = [
        {"name": "Profile", "value": profile, "inline": True},
        {"name": "Platform", "value": platform, "inline": True},
        {"name": "Status", "value": status_label, "inline": True},
        {"name": "Version", "value": f"{app_version} ({build_number})", "inline": True},
    ]

    if commit_message:
        fields.append(
            {
                "name": "Commit",
                "value": _truncate(commit_message, 256),
                "inline": False,
            }
        )
    if details_url:
        fields.append(
            {
                "name": "Expo dashboard",
                "value": details_url,
                "inline": False,
            }
        )
    if artifact_url and status == "finished":
        fields.append(
            {
                "name": "Artifact",
                "value": artifact_url,
                "inline": False,
            }
        )

    error = payload.get("error") or {}
    error_message = (error.get("message") or "").strip()
    if error_message:
        fields.append(
            {
                "name": "Error",
                "value": _truncate(error_message),
                "inline": False,
            }
        )

    embed: dict[str, Any] = {
        "title": title,
        "color": _status_color(status),
        "fields": fields,
    }
    if details_url:
        embed["url"] = details_url
    return embed


def format_submit_discord_embed(payload: dict[str, Any]) -> dict[str, Any]:
    status = (payload.get("status") or "unknown").lower()
    platform = payload.get("platform") or "unknown"
    details_url = payload.get("submissionDetailsPageUrl") or ""
    turtle_build_id = (payload.get("turtleBuildId") or "").strip()
    build_id = turtle_build_id or payload.get("id") or "—"

    build_meta = fetch_eas_build_metadata(turtle_build_id) if turtle_build_id else None
    profile = (build_meta or {}).get("buildProfile") or "—"
    app_name = (build_meta or {}).get("appName") or ""
    app_version = (build_meta or {}).get("appVersion") or ""
    build_number = (build_meta or {}).get("appBuildVersion") or ""

    status_label = status.capitalize()
    title_suffix = f"{profile} / {platform}" if profile != "—" else platform
    if app_name:
        title = f"EAS Submit {status_label}: {app_name} ({title_suffix})"
    else:
        title = f"EAS Submit {status_label}: {title_suffix}"

    fields: list[dict[str, Any]] = [
        {"name": "Profile", "value": profile, "inline": True},
        {"name": "Platform", "value": platform, "inline": True},
        {"name": "Status", "value": status_label, "inline": True},
    ]

    if app_version or build_number:
        version_label = app_version or "—"
        if build_number:
            version_label = f"{version_label} ({build_number})"
        fields.append({"name": "Version", "value": version_label, "inline": True})

    if turtle_build_id:
        fields.append({"name": "Build ID", "value": turtle_build_id, "inline": False})

    if details_url:
        fields.append(
            {
                "name": "Expo dashboard",
                "value": details_url,
                "inline": False,
            }
        )

    submission_info = payload.get("submissionInfo") or {}
    error = submission_info.get("error") or {}
    error_message = (error.get("message") or "").strip()
    if error_message:
        fields.append(
            {
                "name": "Error",
                "value": _truncate(error_message),
                "inline": False,
            }
        )

    embed: dict[str, Any] = {
        "title": title,
        "color": _status_color(status),
        "fields": fields,
    }
    if details_url:
        embed["url"] = details_url
    return embed


def notify_eas_discord(embeds: list[dict[str, Any]]) -> None:
    url = (getattr(settings, "EAS_DISCORD_WEBHOOK_URL", None) or "").strip()
    if not url:
        logger.info("EAS Discord webhook skipped: EAS_DISCORD_WEBHOOK_URL unset")
        return
    send_discord_webhook_message(url, embeds=embeds)


def parse_webhook_json(raw_body: bytes) -> dict[str, Any]:
    return json.loads(raw_body.decode("utf-8"))
