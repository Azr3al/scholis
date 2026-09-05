"""Shared Postgres full-text search helpers (courses, users, future entities)."""
from __future__ import annotations

import hashlib
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Sequence

from django.conf import settings
from django.contrib.postgres.search import (
    SearchQuery,
    SearchRank,
    TrigramWordSimilarity,
)
from django.db import connection
from django.db.models import Case, F, IntegerField, QuerySet, Value, When
from django.db.models.functions import Greatest

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SearchQueryMeta:
    used_fallback: bool = False
    fts_count: int | None = None


@dataclass(frozen=True)
class EntitySearchConfig:
    """Declarative FTS configuration for a searchable entity or report."""

    vector_field: str = "search_vector"
    trigram_fields: tuple[str, ...] = ("title", "code")
    substring_field: str = "title"
    fallback_threshold: float | None = None
    fallback_min_results: int | None = None
    search_config: str = "simple"
    normalize_q: Callable[[str, dict[str, Any]], str] | None = None
    default_fallback_threshold_setting: str = field(
        default="COURSE_SEARCH_TRIGRAM_THRESHOLD"
    )
    default_fallback_min_results_setting: str = field(
        default="COURSE_SEARCH_FALLBACK_MIN_RESULTS"
    )


SEARCH_REGISTRY: dict[str, EntitySearchConfig] = {}


class UnknownSearchEntityError(KeyError):
    """Raised when apply_entity_search is called with an unregistered key."""


def register_search(key: str, config: EntitySearchConfig) -> None:
    SEARCH_REGISTRY[key] = config


def get_search_q(request) -> str:
    """Read fuzzy query from query string (preferred) or POST body."""
    if request is None:
        return ""
    query_params = getattr(request, "query_params", None)
    data = getattr(request, "data", None) or {}
    from_query = ""
    if query_params is not None:
        from_query = query_params.get("q") or ""
    from_body = data.get("q") or ""
    return (from_query or from_body or "").strip()


def _resolve_threshold(config: EntitySearchConfig) -> float:
    if config.fallback_threshold is not None:
        return config.fallback_threshold
    return getattr(
        settings,
        config.default_fallback_threshold_setting,
        getattr(settings, "COURSE_SEARCH_TRIGRAM_THRESHOLD", 0.25),
    )


def _resolve_min_results(config: EntitySearchConfig) -> int:
    if config.fallback_min_results is not None:
        return config.fallback_min_results
    return getattr(
        settings,
        config.default_fallback_min_results_setting,
        getattr(settings, "COURSE_SEARCH_FALLBACK_MIN_RESULTS", 1),
    )


def apply_entity_search(
    key: str,
    queryset: QuerySet,
    q: str,
    *,
    normalize_kwargs: dict[str, Any] | None = None,
) -> tuple[QuerySet, SearchQueryMeta]:
    """Apply registered FTS (+ optional trigram fallback) to a pre-scoped queryset."""
    try:
        config = SEARCH_REGISTRY[key]
    except KeyError as exc:
        raise UnknownSearchEntityError(
            f"No search config registered for {key!r}"
        ) from exc

    q = (q or "").strip()
    if not q:
        return queryset, SearchQueryMeta()

    if config.normalize_q is not None:
        q = config.normalize_q(q, normalize_kwargs or {})

    service = FullTextSearchService(
        queryset,
        vector_field=config.vector_field,
        trigram_fields=config.trigram_fields,
        substring_field=config.substring_field,
        fallback_threshold=_resolve_threshold(config),
        fallback_min_results=_resolve_min_results(config),
        search_config=config.search_config,
    )
    return service.search(q)


def build_prefix_tsquery(q: str) -> str | None:
    """Build a raw prefix tsquery string: each token becomes ``token:*`` joined by AND."""
    tokens = re.findall(r"\w+", q, flags=re.UNICODE)
    if not tokens:
        return None
    return " & ".join(f"{tok}:*" for tok in tokens)


def normalised_cache_key(prefix: str, q: str, **dims: str | int) -> str:
    """Build a cache key segment; includes current tenant schema when available."""
    normalised = (q or "").lower().strip()
    digest = hashlib.sha1(normalised.encode()).hexdigest()[:12]
    schema = getattr(connection, "schema_name", None) or "public"
    parts = [prefix, schema, digest]
    for key in sorted(dims):
        parts.append(f"{key}={dims[key]}")
    return ":".join(parts)


class FullTextSearchService:
    """Ranked FTS with optional trigram fallback on a pre-scoped queryset."""

    def __init__(
        self,
        base_qs: QuerySet,
        *,
        vector_field: str = "search_vector",
        trigram_fields: Sequence[str] = ("title", "code"),
        substring_field: str = "title",
        fallback_min_results: int | None = None,
        fallback_threshold: float | None = None,
        search_config: str = "simple",
    ):
        self.base_qs = base_qs
        self.vector_field = vector_field
        self.trigram_fields = tuple(trigram_fields)
        self.substring_field = substring_field
        self.fallback_min_results = (
            fallback_min_results
            if fallback_min_results is not None
            else getattr(settings, "COURSE_SEARCH_FALLBACK_MIN_RESULTS", 1)
        )
        self.fallback_threshold = (
            fallback_threshold
            if fallback_threshold is not None
            else getattr(settings, "COURSE_SEARCH_TRIGRAM_THRESHOLD", 0.25)
        )
        self.search_config = search_config

    def _search_query(self, q: str) -> SearchQuery | None:
        raw = build_prefix_tsquery(q)
        if not raw:
            return None
        return SearchQuery(raw, search_type="raw", config=self.search_config)

    def _fts_qs(self, q: str) -> QuerySet:
        query = self._search_query(q)
        if query is None:
            return self.base_qs.none()
        q_stripped = q.strip()
        return (
            self.base_qs.filter(**{self.vector_field: query})
            .annotate(
                rank=SearchRank(F(self.vector_field), query),
                exact_substring=Case(
                    When(
                        **{f"{self.substring_field}__icontains": q_stripped},
                        then=Value(1),
                    ),
                    default=Value(0),
                    output_field=IntegerField(),
                ),
            )
            .order_by("-exact_substring", "-rank", "-created_at")
        )

    def _trigram_qs(self, q: str) -> QuerySet:
        sim_exprs = [TrigramWordSimilarity(q, field) for field in self.trigram_fields]
        return (
            self.base_qs.annotate(sim=Greatest(*sim_exprs))
            .filter(sim__gte=self.fallback_threshold)
            .order_by("-sim", "-created_at")
        )

    def suggest(self, q: str, limit: int = 8) -> QuerySet:
        q = (q or "").strip()
        if len(q) < 2:
            return self.base_qs.none()
        return self._fts_qs(q)[:limit]

    def search(self, q: str) -> tuple[QuerySet, SearchQueryMeta]:
        q = (q or "").strip()
        if not q:
            return self.base_qs.none(), SearchQueryMeta()

        fts_qs = self._fts_qs(q)
        fts_count = fts_qs.count()
        if fts_count >= self.fallback_min_results:
            return fts_qs, SearchQueryMeta(used_fallback=False, fts_count=fts_count)

        trigram_qs = self._trigram_qs(q)
        trigram_count = trigram_qs.count()
        logger.info(
            "search_fts_fallback schema=%s q=%r fts_count=%s trigram_count=%s",
            getattr(connection, "schema_name", "?"),
            q,
            fts_count,
            trigram_count,
        )
        return trigram_qs, SearchQueryMeta(used_fallback=True, fts_count=fts_count)
