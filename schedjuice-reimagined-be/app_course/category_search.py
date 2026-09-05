"""Fuzzy and full-text category search helpers."""
from __future__ import annotations

import logging

from django.db.models import QuerySet

from utilitas.search import (
    EntitySearchConfig,
    FullTextSearchService,
    apply_entity_search,
    get_search_q,
    register_search,
)

logger = logging.getLogger(__name__)

CATEGORY_SEARCH_KEY = "category"

_CATEGORY_FTS_CONFIG = EntitySearchConfig(
    vector_field="search_vector",
    trigram_fields=("name", "description"),
    substring_field="name",
    default_fallback_threshold_setting="CATEGORY_SEARCH_TRIGRAM_THRESHOLD",
    default_fallback_min_results_setting="CATEGORY_SEARCH_FALLBACK_MIN_RESULTS",
)

register_search(CATEGORY_SEARCH_KEY, _CATEGORY_FTS_CONFIG)


def apply_category_search_q_with_meta(
    queryset: QuerySet, q: str
) -> tuple[QuerySet, bool]:
    q = (q or "").strip()
    if not q:
        return queryset, False
    qs, meta = apply_entity_search(CATEGORY_SEARCH_KEY, queryset, q)
    if meta.used_fallback:
        logger.info(
            "category_search_fts_fallback q=%r fts_count=%s",
            q,
            meta.fts_count,
        )
    return qs, meta.used_fallback


def apply_category_search_q(queryset: QuerySet, q: str) -> QuerySet:
    qs, _ = apply_category_search_q_with_meta(queryset, q)
    return qs


def category_suggest_queryset(base_qs: QuerySet, q: str, limit: int = 8) -> QuerySet:
    q = (q or "").strip()
    if len(q) < 2:
        return base_qs.none()
    return FullTextSearchService(
        base_qs,
        vector_field="search_vector",
        trigram_fields=("name", "description"),
        substring_field="name",
    ).suggest(q, limit=limit)


__all__ = [
    "CATEGORY_SEARCH_KEY",
    "apply_category_search_q",
    "apply_category_search_q_with_meta",
    "category_suggest_queryset",
    "get_search_q",
]
