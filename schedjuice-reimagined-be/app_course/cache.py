"""Redis-backed cache for course suggest (short TTL, schema-scoped keys)."""
from __future__ import annotations

from django.core.cache import cache

from utilitas.search import normalised_cache_key

SUGGEST_TTL = 60


def suggest_cache_key(q: str) -> str:
    return normalised_cache_key("coursesearch:suggest", q)


def cached_suggest(q: str, loader):
    q = (q or "").strip()
    if len(q) < 2:
        return loader()
    key = suggest_cache_key(q)
    hit = cache.get(key)
    if hit is not None:
        return hit
    result = loader()
    cache.set(key, result, SUGGEST_TTL)
    return result
