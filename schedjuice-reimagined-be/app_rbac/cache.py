# app_rbac/cache.py
from __future__ import annotations
import logging
from django.core.cache import cache

logger = logging.getLogger(__name__)
_GEN_KEY = "rbac:matrix_gen:v1:{schema}"
_LONG = 365 * 24 * 3600


def matrix_generation(schema: str) -> int:
    try:
        v = cache.get(_GEN_KEY.format(schema=schema))
        return int(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


def bump_matrix_generation(schema: str) -> int:
    key = _GEN_KEY.format(schema=schema)
    try:
        cur = cache.get(key)
        n = (int(cur) if cur is not None else 0) + 1
        cache.set(key, n, timeout=_LONG)
        return n
    except Exception:
        logger.exception("rbac: bump_matrix_generation failed schema=%s", schema)
        try:
            cache.set(key, 1, timeout=_LONG)
        except Exception:
            logger.exception("rbac: bump fallback failed")
        return 1
