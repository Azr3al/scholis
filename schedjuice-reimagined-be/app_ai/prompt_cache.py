"""Prompt cache key derivation for the OpenAI Responses API."""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from django.conf import settings
from django.core.cache import cache

from app_ai.tenant_context import build_system_context
from app_organization.models import Organization

logger = logging.getLogger(__name__)

_VERSION_KEY_PREFIX = "ai_prompt_cache_version:"

# OpenAI only caches prefixes of at least this many tokens on GPT-5.6.
PROMPT_CACHE_MIN_PREFIX_TOKENS = 1024


def _org_cache_version(schema_name: str) -> int:
    return int(cache.get(f"{_VERSION_KEY_PREFIX}{schema_name}") or 0)


def _tool_declarations_signature(tool_declarations: list[dict[str, Any]]) -> str:
    normalized = sorted(
        (
            {
                "name": d.get("name"),
                "description": d.get("description"),
                "parameters": d.get("parameters"),
            }
            for d in tool_declarations
        ),
        key=lambda item: item["name"] or "",
    )
    raw = json.dumps(normalized, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def prompt_cache_signature(
    *, model_name: str, org: Organization, tool_declarations: list[dict[str, Any]]
) -> str:
    system_text = build_system_context(org)
    payload = "|".join(
        [
            model_name,
            org.schema_name,
            str(_org_cache_version(org.schema_name)),
            hashlib.sha256(system_text.encode()).hexdigest(),
            _tool_declarations_signature(tool_declarations),
        ]
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def build_prompt_cache_key(
    *, model_name: str, org: Organization | None, tool_declarations: list[dict[str, Any]]
) -> str | None:
    if not getattr(settings, "AI_PROMPT_CACHE_ENABLED", True):
        return None
    if org is None or not tool_declarations:
        return None
    signature = prompt_cache_signature(
        model_name=model_name, org=org, tool_declarations=tool_declarations
    )
    return f"sj:{org.schema_name}:{signature[:16]}"


def bump_org_prompt_cache_version(org: Organization) -> None:
    key = f"{_VERSION_KEY_PREFIX}{org.schema_name}"
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=None)
    logger.info(
        "ai_prompt_cache_version_bumped schema=%s version=%s",
        org.schema_name,
        cache.get(key),
    )
