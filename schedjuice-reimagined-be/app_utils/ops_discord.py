"""
Post short ops alerts to Discord via incoming webhook (DISCORD_WEBHOOK_URL).
No-op when the URL is unset so local/dev runs stay quiet.
"""

from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings

from app_utils.ops_discord_helpers import (
    resolve_discord_webhook_url,
    send_discord_webhook_message,
)

logger = logging.getLogger(__name__)

# Discord message content max is 2000; leave margin for formatting.
_DISCORD_CONTENT_MAX = 1900
_DISCORD_EMBED_FIELD_VALUE_MAX = 1024
_DISCORD_EMBED_DESCRIPTION_MAX = 4096
_DISCORD_EMBED_FOOTER_MAX = 2048

_SEVERITY_COLORS = {
    "missed": 0xE67E22,  # orange
    "stuck": 0xE74C3C,  # red
    "scheduler_down": 0x992D22,  # dark red
    "failed": 0xE74C3C,  # red
    "info": 0x3498DB,  # blue
}


def _embed_color_for_severity(severity: str) -> int:
    return _SEVERITY_COLORS.get((severity or "").lower(), _SEVERITY_COLORS["info"])


def _truncate(text: str, max_len: int, suffix: str = "…") -> str:
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    if max_len <= len(suffix):
        return suffix[:max_len]
    return text[: max_len - len(suffix)] + suffix


def _tenant_schema(tenant: Any) -> str:
    return str(getattr(tenant, "schema_name", None) or "")


def _discord_ops_footer(tenant: Any | None) -> str:
    """DEBUG flag plus tenant name / domains when an Organization-like object is passed."""
    debug = bool(getattr(settings, "DEBUG", False))
    lines = ["---", f"DEBUG={debug}"]
    if tenant is None:
        lines.append("tenant_context=multi-tenant or not attached (see message above)")
        return "\n".join(lines)
    name = getattr(tenant, "name", None) or ""
    schema = getattr(tenant, "schema_name", None) or ""
    domains = getattr(tenant, "available_domains", None) or []
    if not isinstance(domains, (list, tuple)):
        domains = []
    dom_parts = [str(d) for d in domains[:5]]
    dom_str = ", ".join(dom_parts) if dom_parts else "(none)"
    if len(domains) > 5:
        dom_str += f" …(+{len(domains) - 5})"
    lines.append(f"tenant_name={name!r}")
    lines.append(f"schema_name={schema}")
    lines.append(f"domains={dom_str}")
    return "\n".join(lines)


def _embed_footer_text(*, tenants: list[Any] | None = None, tenant: Any | None = None) -> str:
    debug = bool(getattr(settings, "DEBUG", False))
    if tenants:
        schemas = ", ".join(sorted(s for s in (_tenant_schema(t) for t in tenants) if s))
        if schemas:
            return _truncate(f"DEBUG={debug} · schemas: {schemas}", _DISCORD_EMBED_FOOTER_MAX)
        return f"DEBUG={debug}"
    if tenant is not None:
        name = getattr(tenant, "name", None) or ""
        schema = getattr(tenant, "schema_name", None) or ""
        return _truncate(f"DEBUG={debug} · {name!r} ({schema})", _DISCORD_EMBED_FOOTER_MAX)
    return f"DEBUG={debug}"


def build_ops_embed(
    title: str,
    fields: list[dict[str, str | bool]],
    *,
    color: int | None = None,
    severity: str = "info",
    footer_text: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Build a Discord embed dict with normalized field values."""
    embed: dict[str, Any] = {
        "title": _truncate(title, 256),
        "color": color if color is not None else _embed_color_for_severity(severity),
        "fields": [],
    }
    if description:
        embed["description"] = _truncate(description, _DISCORD_EMBED_DESCRIPTION_MAX)
    if footer_text:
        embed["footer"] = {"text": _truncate(footer_text, _DISCORD_EMBED_FOOTER_MAX)}
    for field in fields:
        embed["fields"].append(
            {
                "name": _truncate(str(field.get("name", "")), 256),
                "value": _truncate(str(field.get("value", "")), _DISCORD_EMBED_FIELD_VALUE_MAX),
                "inline": bool(field.get("inline", False)),
            }
        )
    return embed


def _post_discord_payload(*, content: str = "", embeds: list[dict] | None = None) -> None:
    url = resolve_discord_webhook_url()
    if not url:
        return
    try:
        send_discord_webhook_message(url, content, embeds=embeds)
    except requests.HTTPError as e:
        body_err = (e.response.text if e.response is not None else "")[:500]
        code = e.response.status_code if e.response is not None else "?"
        logger.warning("Discord webhook HTTPError %s: %s", code, body_err or e)
    except requests.RequestException:
        logger.exception("Discord webhook request failed")
    except RuntimeError as e:
        logger.warning("Discord webhook failed: %s", e)


def notify_discord_ops(content: str, *, tenant: Any | None = None) -> None:
    """
    POST ``content`` plus a footer (DEBUG, tenant name & domains when ``tenant`` is set)
    to the configured Discord webhook.
    """
    body = (content or "").strip()
    footer = _discord_ops_footer(tenant)
    reserved = len(footer) + 2  # newline between body and footer
    max_body = max(0, _DISCORD_CONTENT_MAX - reserved)
    if len(body) > max_body:
        if max_body > 24:
            body = body[: max_body - 24] + "\n…(truncated)"
        else:
            body = "…(truncated)"
    text = f"{body}\n{footer}" if body else footer
    if len(text) > _DISCORD_CONTENT_MAX:
        text = text[: _DISCORD_CONTENT_MAX - 12] + "\n…(truncated)"

    _post_discord_payload(content=text)


def notify_discord_ops_embed(
    title: str,
    fields: list[dict[str, str | bool]],
    *,
    severity: str = "info",
    tenants: list[Any] | None = None,
    tenant: Any | None = None,
    description: str | None = None,
) -> None:
    """POST a styled Discord embed to the configured ops webhook."""
    footer_text = _embed_footer_text(tenants=tenants, tenant=tenant)
    embed = build_ops_embed(
        title,
        fields,
        severity=severity,
        footer_text=footer_text,
        description=description,
    )
    _post_discord_payload(embeds=[embed])
