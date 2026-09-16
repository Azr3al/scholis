from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from django.core.cache import cache

logger = logging.getLogger(__name__)

FREEBUSY_CACHE_TTL_SECONDS = 60


def freebusy_cache_key(tenant_schema: str, consultant_id: int, target_date: date) -> str:
    return f"consultation:freebusy:{tenant_schema}:{consultant_id}:{target_date.isoformat()}"


def _serialize_busy_blocks(blocks: list[tuple[datetime, datetime]]) -> list[dict[str, str]]:
    return [
        {"start": start.isoformat(), "end": end.isoformat()}
        for start, end in blocks
    ]


def _deserialize_busy_blocks(payload: Any) -> list[tuple[datetime, datetime]] | None:
    if not isinstance(payload, list):
        return None
    blocks: list[tuple[datetime, datetime]] = []
    for item in payload:
        if not isinstance(item, dict):
            return None
        start_raw = item.get("start")
        end_raw = item.get("end")
        if not start_raw or not end_raw:
            return None
        blocks.append((datetime.fromisoformat(str(start_raw)), datetime.fromisoformat(str(end_raw))))
    return blocks


def get_cached_freebusy(
    tenant_schema: str,
    consultant_id: int,
    target_date: date,
) -> list[tuple[datetime, datetime]] | None:
    key = freebusy_cache_key(tenant_schema, consultant_id, target_date)
    try:
        payload = cache.get(key)
    except Exception:
        logger.exception("freebusy_cache: get failed key=%s", key)
        return None
    return _deserialize_busy_blocks(payload)


def set_cached_freebusy(
    tenant_schema: str,
    consultant_id: int,
    target_date: date,
    blocks: list[tuple[datetime, datetime]],
) -> None:
    key = freebusy_cache_key(tenant_schema, consultant_id, target_date)
    try:
        cache.set(
            key,
            _serialize_busy_blocks(blocks),
            timeout=FREEBUSY_CACHE_TTL_SECONDS,
        )
    except Exception:
        logger.exception("freebusy_cache: set failed key=%s", key)


def invalidate_freebusy_cache(
    tenant_schema: str,
    consultant_id: int,
    target_date: date,
) -> None:
    key = freebusy_cache_key(tenant_schema, consultant_id, target_date)
    try:
        cache.delete(key)
    except Exception:
        logger.exception("freebusy_cache: delete failed key=%s", key)
