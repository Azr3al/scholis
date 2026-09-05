"""One-time session handoff codes for cross-domain Google login completion."""

from __future__ import annotations

import secrets
from typing import Any

from django.core.cache import cache

_CACHE_PREFIX = "google_oauth_handoff:"
_TTL_SECONDS = 60


class GoogleHandoffError(ValueError):
    pass


def create_handoff_code(payload: dict[str, Any]) -> str:
    code = secrets.token_urlsafe(32)
    cache.set(f"{_CACHE_PREFIX}{code}", payload, timeout=_TTL_SECONDS)
    return code


def consume_handoff_code(code: str) -> dict[str, Any]:
    trimmed = (code or "").strip()
    if not trimmed:
        raise GoogleHandoffError("Handoff code is required.")
    key = f"{_CACHE_PREFIX}{trimmed}"
    payload = cache.get(key)
    if not payload:
        raise GoogleHandoffError("Handoff code is invalid or expired.")
    cache.delete(key)
    if not isinstance(payload, dict):
        raise GoogleHandoffError("Handoff payload is invalid.")
    return payload
