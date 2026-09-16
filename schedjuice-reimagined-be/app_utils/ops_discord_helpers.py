from __future__ import annotations

import logging
import re

import certifi
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_DISCORD_WEBHOOK_PREFIXES = (
    "https://discord.com/api/webhooks/",
    "https://discordapp.com/api/webhooks/",
)


def validate_discord_webhook_url(url: str) -> None:
    u = (url or "").strip()
    if not u:
        return
    if not any(u.startswith(p) for p in _DISCORD_WEBHOOK_PREFIXES):
        raise ValueError(
            "Webhook URL must start with https://discord.com/api/webhooks/"
        )


def mask_discord_webhook_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    m = re.match(r"^(https://discord(?:app)?\.com/api/webhooks/\d+/)([^/?#]+)", u)
    if not m:
        return u[:40] + "…" if len(u) > 40 else u
    prefix, token = m.group(1), m.group(2)
    if len(token) <= 8:
        return prefix + "…"
    return f"{prefix}{token[:4]}…{token[-4:]}"


def _get_db_webhook_url() -> str:
    from app_organization.models import PlatformOpsSettings

    try:
        return PlatformOpsSettings.get_singleton().get_discord_webhook_url()
    except Exception:
        return ""


def resolve_discord_webhook_url() -> str:
    db_url = _get_db_webhook_url().strip()
    if db_url:
        return db_url
    return (getattr(settings, "DISCORD_WEBHOOK_URL", None) or "").strip()


def send_discord_webhook_message(
    url: str,
    content: str = "",
    *,
    embeds: list[dict] | None = None,
) -> None:
    """POST plain text content and/or embeds to a Discord incoming webhook URL."""
    payload: dict = {}
    text = (content or "").strip()
    if text:
        payload["content"] = text
    if embeds:
        payload["embeds"] = embeds
    if not payload:
        payload["content"] = ""
    resp = requests.post(
        url,
        json=payload,
        timeout=15,
        verify=certifi.where(),
    )
    if resp.status_code not in (200, 201, 202, 204):
        raise RuntimeError(
            f"Discord webhook returned HTTP {resp.status_code}: "
            f"{(resp.text or '')[:500]}"
        )


def discord_webhook_status() -> dict:
    db = _get_db_webhook_url().strip()
    env = (getattr(settings, "DISCORD_WEBHOOK_URL", None) or "").strip()
    if db:
        source = "db"
        url = db
    elif env:
        source = "env"
        url = env
    else:
        source = "none"
        url = ""
    return {
        "source": source,
        "configured": bool(url),
        "webhook_preview": mask_discord_webhook_url(url) if url else "",
    }
