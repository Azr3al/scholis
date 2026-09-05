"""
Redis/LocMem cache for resolving request inputs -> Organization pk (public schema).

See docs/superpowers/specs/2026-04-16-tenant-resolution-redis-cache-design.md
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

PUBLIC_CACHE_KEY = "tr:pub"


def schema_cache_key(schema_name: str) -> str:
    return f"tr:sch:{schema_name}"


def domain_cache_key(normalized_host: str) -> str:
    return f"tr:dom:{normalized_host}"


def normalize_domain_for_tenant_lookup(domain_name: str) -> str:
    """
    Match XHeaderTenantMiddleware host branch: strip scheme, port, apply aliases.
    Caller handles domain_name == \"public\" before lookup.
    """
    if domain_name == "public":
        return "public"
    if "//" in domain_name:
        domain_name = domain_name.split("//")[1]
    if ":" in domain_name:
        domain_name = domain_name.split(":")[0]
    if domain_name in ["news.teachersucenter.com", "suconnect.thiha.net"]:
        domain_name = "suconnect.teachersucenter.com"
    return domain_name


def _cache_get(key: str):
    try:
        return cache.get(key)
    except Exception:
        logger.exception("tenant_resolution_cache: get failed for key=%s", key)
        return None


def _cache_set(key: str, value: int, timeout: int) -> None:
    try:
        cache.set(key, value, timeout=timeout)
    except Exception:
        logger.exception("tenant_resolution_cache: set failed for key=%s", key)


def _cache_delete(key: str) -> None:
    try:
        cache.delete(key)
    except Exception:
        logger.exception("tenant_resolution_cache: delete failed for key=%s", key)


def load_with_cache(tenant_model, cache_key: str, fetch_uncached, timeout: int | None = None):
    """
    Return a tenant_model instance. On cache hit, hydrates via objects.get(pk=...).
    On stale pk, runs fetch_uncached and refreshes cache.
    """
    if timeout is None:
        timeout = getattr(settings, "TENANT_RESOLUTION_CACHE_TIMEOUT", 60)

    pk = _cache_get(cache_key)
    if pk is not None:
        try:
            return tenant_model.objects.get(pk=pk)
        except tenant_model.DoesNotExist:
            pass

    org = fetch_uncached()
    _cache_set(cache_key, org.pk, timeout)
    return org


def invalidate_organization_resolution_cache(
    *,
    schema_name: str,
    domain_url: str | None = None,
    is_public: bool = False,
) -> None:
    """Invalidate cache keys for one organization row (e.g. after save/delete)."""
    keys = [schema_cache_key(schema_name)]
    if domain_url:
        keys.append(domain_cache_key(normalize_domain_for_tenant_lookup(domain_url)))
    if is_public:
        keys.append(PUBLIC_CACHE_KEY)
    for k in keys:
        _cache_delete(k)
