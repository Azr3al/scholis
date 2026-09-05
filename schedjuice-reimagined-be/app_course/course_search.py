"""Fuzzy and full-text course search helpers for Academic Hub."""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import CharField, Q, QuerySet
from django.db.models.expressions import RawSQL
from django.db.models.functions import Greatest

from app_course.course_title_matching import normalize_course_title
from utilitas.search import (
    EntitySearchConfig,
    FullTextSearchService,
    apply_entity_search,
    get_search_q,
    register_search,
)

logger = logging.getLogger(__name__)

COURSE_SEARCH_KEY = "course"

_CORE_TITLE_SQL = """
TRIM(BOTH FROM
  CASE
    WHEN COALESCE(app_course_program.name, '') <> '' THEN
      REGEXP_REPLACE(
        CASE
          WHEN COALESCE(app_course_intake.name, '') <> '' THEN
            REGEXP_REPLACE(
              LOWER(app_course_course.title),
              ' - ' || LOWER(app_course_intake.name) || '$', '', 'i'
            )
          ELSE LOWER(app_course_course.title)
        END,
        '^' || LOWER(app_course_program.name) || ' ',
        '',
        'i'
      )
    WHEN COALESCE(app_course_intake.name, '') <> '' THEN
      REGEXP_REPLACE(
        LOWER(app_course_course.title),
        ' - ' || LOWER(app_course_intake.name) || '$', '', 'i'
      )
    ELSE LOWER(app_course_course.title)
  END
)
"""


def _course_normalize_q(q: str, kwargs: dict[str, Any]) -> str:
    program_name = kwargs.get("program_name")
    intake_name = kwargs.get("intake_name")
    if not program_name and not intake_name:
        return (q or "").strip()
    return normalize_search_q(q, program_name=program_name, intake_name=intake_name)


_COURSE_FTS_CONFIG = EntitySearchConfig(
    vector_field="search_vector",
    trigram_fields=(
        "title",
        "code",
        "subject__name",
        "level__name",
        "section__name",
    ),
    substring_field="title",
    default_fallback_threshold_setting="COURSE_SEARCH_TRIGRAM_THRESHOLD",
    default_fallback_min_results_setting="COURSE_SEARCH_FALLBACK_MIN_RESULTS",
    normalize_q=_course_normalize_q,
)

register_search(COURSE_SEARCH_KEY, _COURSE_FTS_CONFIG)


def strip_status_filters(filter_params: list | None) -> list:
    if not filter_params:
        return []
    return [fp for fp in filter_params if fp.get("field_name") != "status"]


def extract_scope_ids_from_filter_params(
    filter_params: list | None,
) -> tuple[int | None, int | None]:
    program_id = None
    intake_id = None
    if not filter_params:
        return program_id, intake_id
    for fp in filter_params:
        field_name = fp.get("field_name")
        if field_name == "program" and fp.get("operator") == "exact":
            try:
                program_id = int(fp.get("value"))
            except (TypeError, ValueError):
                pass
        elif field_name == "intake" and fp.get("operator") == "exact":
            try:
                intake_id = int(fp.get("value"))
            except (TypeError, ValueError):
                pass
    return program_id, intake_id


def load_scope_names(
    program_id: int | None, intake_id: int | None
) -> tuple[str | None, str | None]:
    from app_course.models import Intake, Program

    scope_program_name = None
    scope_intake_name = None
    if program_id is not None:
        program = Program.objects.filter(pk=program_id).only("name").first()
        scope_program_name = program.name if program else None
    if intake_id is not None:
        intake = Intake.objects.filter(pk=intake_id).only("name").first()
        scope_intake_name = intake.name if intake else None
    return scope_program_name, scope_intake_name


def annotate_core_title(queryset: QuerySet) -> QuerySet:
    return queryset.select_related("program", "intake").annotate(
        core_title=RawSQL(
            _CORE_TITLE_SQL,
            [],
            output_field=CharField(),
        )
    )


def normalize_search_q(
    q: str,
    *,
    program_name: str | None = None,
    intake_name: str | None = None,
) -> str:
    normalized = normalize_course_title(
        q,
        program_name=program_name,
        intake_name=intake_name,
    )
    return normalized or (q or "").strip()


def apply_fuzzy_q(queryset: QuerySet, q: str) -> QuerySet:
    threshold = settings.COURSE_SEARCH_TRIGRAM_THRESHOLD
    queryset = annotate_core_title(queryset)
    return (
        queryset.annotate(
            sim=Greatest(
                TrigramSimilarity("title", q),
                TrigramSimilarity("core_title", q),
                TrigramSimilarity("code", q),
                TrigramSimilarity("subject__name", q),
                TrigramSimilarity("level__name", q),
                TrigramSimilarity("section__name", q),
            )
        )
        .filter(sim__gte=threshold)
        .order_by("-sim", "-created_at")
    )


def apply_multi_word_ilike_q(queryset: QuerySet, q: str) -> QuerySet:
    qs = queryset
    for word in q.split():
        if not word:
            continue
        qs = qs.filter(
            Q(title__icontains=word)
            | Q(code__icontains=word)
            | Q(subject__name__icontains=word)
            | Q(level__name__icontains=word)
            | Q(section__name__icontains=word)
        )
    return qs.order_by("-created_at")


def apply_course_fts_q(queryset: QuerySet, q: str) -> QuerySet:
    qs, _ = apply_course_search_q_with_meta(queryset, q)
    return qs


def apply_course_search_q_with_meta(
    queryset: QuerySet,
    q: str,
    *,
    program_name: str | None = None,
    intake_name: str | None = None,
) -> tuple[QuerySet, bool]:
    q = (q or "").strip()
    if not q:
        return queryset, False
    normalize_kwargs: dict[str, Any] = {}
    if program_name or intake_name:
        normalize_kwargs = {
            "program_name": program_name,
            "intake_name": intake_name,
        }
    qs, meta = apply_entity_search(
        COURSE_SEARCH_KEY,
        queryset,
        q,
        normalize_kwargs=normalize_kwargs,
    )
    if meta.used_fallback:
        logger.info(
            "course_search_fts_fallback q=%r fts_count=%s",
            q,
            meta.fts_count,
        )
    return qs, meta.used_fallback


def apply_course_search_q(
    queryset: QuerySet,
    q: str,
    *,
    program_name: str | None = None,
    intake_name: str | None = None,
) -> QuerySet:
    qs, _ = apply_course_search_q_with_meta(
        queryset,
        q,
        program_name=program_name,
        intake_name=intake_name,
    )
    return qs


def course_suggest_queryset(base_qs: QuerySet, q: str, limit: int = 8) -> QuerySet:
    q = (q or "").strip()
    if len(q) < 2:
        return base_qs.none()
    base_qs = annotate_core_title(base_qs)
    return FullTextSearchService(
        base_qs,
        vector_field="search_vector",
        trigram_fields=("title", "core_title", "code"),
        substring_field="title",
    ).suggest(q, limit=limit)


__all__ = [
    "COURSE_SEARCH_KEY",
    "annotate_core_title",
    "apply_course_fts_q",
    "apply_course_search_q",
    "apply_course_search_q_with_meta",
    "apply_fuzzy_q",
    "apply_multi_word_ilike_q",
    "course_suggest_queryset",
    "extract_scope_ids_from_filter_params",
    "get_search_q",
    "load_scope_names",
    "normalize_search_q",
    "strip_status_filters",
]
