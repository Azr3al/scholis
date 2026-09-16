from __future__ import annotations

import logging
from typing import Any, Optional

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

SCHOOL_OVERVIEW_CACHE_TTL = getattr(settings, "SCHOOL_OVERVIEW_CACHE_TTL", 86400)


def school_overview_cache_key(schema_name: str, year: int, month: int) -> str:
    return f"school-overview:{schema_name}:{year:04d}-{month:02d}"


def get_school_overview_snapshot(
    schema_name: str, year: int, month: int
) -> Optional[dict[str, Any]]:
    key = school_overview_cache_key(schema_name, year, month)
    try:
        value = cache.get(key)
        return value if isinstance(value, dict) else None
    except Exception:
        logger.exception("school_overview_cache: get failed key=%s", key)
        return None


def set_school_overview_snapshot(
    schema_name: str, year: int, month: int, snapshot: dict[str, Any]
) -> None:
    key = school_overview_cache_key(schema_name, year, month)
    try:
        cache.set(key, snapshot, timeout=SCHOOL_OVERVIEW_CACHE_TTL)
    except Exception:
        logger.exception("school_overview_cache: set failed key=%s", key)


def invalidate_school_overview_cache(
    schema_name: str, year: int, month: int
) -> None:
    key = school_overview_cache_key(schema_name, year, month)
    try:
        cache.delete(key)
    except Exception:
        logger.exception("school_overview_cache: delete failed key=%s", key)
