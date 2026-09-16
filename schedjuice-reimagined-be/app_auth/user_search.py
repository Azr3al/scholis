"""Fuzzy and full-text user search helpers for User Hub and pickers."""
from __future__ import annotations

import logging

from django.conf import settings
from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Q, QuerySet
from django.db.models.functions import Greatest

from utilitas.search import (
    EntitySearchConfig,
    FullTextSearchService,
    apply_entity_search,
    get_search_q,
    register_search,
)

logger = logging.getLogger(__name__)

USER_SEARCH_KEY = "user"
STUDENT_DATA_SHEET_SEARCH_KEY = "student_data_sheet"
STAFF_DATA_SHEET_SEARCH_KEY = "staff_data_sheet"

FUZZY_FIELDS = (
    "name",
    "alternative_name",
    "email",
    "communication_email",
    "phone_number_digits",
    "emergency_contact_name",
    "emergency_contact_phone_number_digits",
    "emergency_contact_relationship",
)

ILIKE_FIELDS = (
    "name",
    "alternative_name",
    "email",
    "communication_email",
    "phone_number",
    "phone_number_digits",
    "emergency_contact_name",
    "emergency_contact_phone_number",
    "emergency_contact_phone_number_digits",
    "emergency_contact_relationship",
    "code",
)

FTS_TRIGRAM_FIELDS = (
    "name",
    "alternative_name",
    "email",
    "communication_email",
    "code",
)

_USER_FTS_CONFIG = EntitySearchConfig(
    vector_field="search_vector",
    trigram_fields=FTS_TRIGRAM_FIELDS,
    substring_field="name",
    default_fallback_threshold_setting="USER_SEARCH_TRIGRAM_THRESHOLD",
    default_fallback_min_results_setting="USER_SEARCH_FALLBACK_MIN_RESULTS",
)

register_search(USER_SEARCH_KEY, _USER_FTS_CONFIG)
register_search(STUDENT_DATA_SHEET_SEARCH_KEY, _USER_FTS_CONFIG)
register_search(STAFF_DATA_SHEET_SEARCH_KEY, _USER_FTS_CONFIG)


def strip_active_filters(filter_params: list | None) -> list:
    if not filter_params:
        return []
    return [fp for fp in filter_params if fp.get("field_name") != "is_active"]


def apply_fuzzy_q(queryset: QuerySet, q: str) -> QuerySet:
    """Trigram fuzzy match via TrigramSimilarity (same pattern as course search)."""
    threshold = settings.USER_SEARCH_TRIGRAM_THRESHOLD
    similarities = [TrigramSimilarity(field, q) for field in FUZZY_FIELDS]
    return (
        queryset.annotate(sim=Greatest(*similarities))
        .filter(sim__gte=threshold)
        .order_by("-sim", "name")
    )


def apply_multi_word_ilike_q(queryset: QuerySet, q: str) -> QuerySet:
    qs = queryset
    for word in q.split():
        if not word:
            continue
        word_q = Q()
        for field in ILIKE_FIELDS:
            word_q |= Q(**{f"{field}__icontains": word})
        qs = qs.filter(word_q)
    return qs.order_by("name")


def apply_user_search_q_with_meta(queryset: QuerySet, q: str) -> tuple[QuerySet, bool]:
    q = (q or "").strip()
    if not q:
        return queryset, False
    qs, meta = apply_entity_search(USER_SEARCH_KEY, queryset, q)
    if meta.used_fallback:
        logger.info(
            "user_search_fts_fallback q=%r fts_count=%s",
            q,
            meta.fts_count,
        )
    return qs, meta.used_fallback


def apply_user_search_q(queryset: QuerySet, q: str) -> QuerySet:
    qs, _ = apply_user_search_q_with_meta(queryset, q)
    return qs


def user_suggest_queryset(base_qs: QuerySet, q: str, limit: int = 8) -> QuerySet:
    q = (q or "").strip()
    if len(q) < 2:
        return base_qs.none()
    return FullTextSearchService(
        base_qs,
        vector_field="search_vector",
        trigram_fields=FTS_TRIGRAM_FIELDS[:4],
        substring_field="name",
        fallback_threshold=settings.USER_SEARCH_TRIGRAM_THRESHOLD,
        fallback_min_results=settings.USER_SEARCH_FALLBACK_MIN_RESULTS,
    ).suggest(q, limit=limit)


__all__ = [
    "USER_SEARCH_KEY",
    "STUDENT_DATA_SHEET_SEARCH_KEY",
    "STAFF_DATA_SHEET_SEARCH_KEY",
    "FTS_TRIGRAM_FIELDS",
    "FUZZY_FIELDS",
    "ILIKE_FIELDS",
    "apply_fuzzy_q",
    "apply_multi_word_ilike_q",
    "apply_user_search_q",
    "apply_user_search_q_with_meta",
    "get_search_q",
    "strip_active_filters",
    "user_suggest_queryset",
]
