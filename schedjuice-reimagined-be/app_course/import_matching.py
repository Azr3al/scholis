"""In-memory bulk fuzzy matching of spreadsheet course names to courses."""
from __future__ import annotations

from datetime import date, timedelta

from django.conf import settings
from django.db.models import Q
from rapidfuzz import fuzz, process

from app_course.course_title_matching import normalize_course_title
from app_course.models import Course

# Re-export for backwards compatibility with existing tests/imports.
__all__ = ["match_course_names", "normalize_course_title", "load_tier1_catalog", "load_tier2_catalog"]


def _entry_to_candidate(entry: dict, score: float) -> dict:
    return {
        "id": entry["id"],
        "title": entry["title"],
        "code": entry.get("code"),
        "academic_year": entry.get("academic_year"),
        "student_count": entry.get("student_count"),
        "score": round(float(score), 1),
    }


def _rank(
    name: str,
    catalog: list[dict],
    *,
    scope_program_name: str | None = None,
    scope_intake_name: str | None = None,
) -> list[tuple[dict, float]]:
    norm_query = normalize_course_title(
        name,
        program_name=scope_program_name,
        intake_name=scope_intake_name,
    )
    if not norm_query or not catalog:
        return []
    choices = {
        idx: normalize_course_title(
            e["title"],
            program_name=e.get("program_name"),
            intake_name=e.get("intake_name"),
        )
        for idx, e in enumerate(catalog)
    }
    matches = process.extract(
        norm_query,
        choices,
        scorer=fuzz.WRatio,
        limit=settings.IMPORT_COURSE_CANDIDATE_LIMIT,
    )
    ranked: list[tuple[dict, float]] = []
    for _title, score, idx in matches:
        ranked.append((catalog[idx], float(score)))
    return ranked


def _resolve_one(
    name: str,
    catalog: list[dict],
    *,
    scope_program_name: str | None = None,
    scope_intake_name: str | None = None,
) -> dict | None:
    ranked = _rank(
        name,
        catalog,
        scope_program_name=scope_program_name,
        scope_intake_name=scope_intake_name,
    )
    if not ranked:
        return None
    high = settings.IMPORT_COURSE_MATCH_HIGH
    low = settings.IMPORT_COURSE_MATCH_LOW
    margin = settings.IMPORT_COURSE_MATCH_MARGIN
    top_entry, top_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0
    if top_score >= high and (top_score - second_score) >= margin:
        return {
            "status": "linked",
            "match": _entry_to_candidate(top_entry, top_score),
            "candidates": [],
        }
    if top_score >= low:
        candidates = [_entry_to_candidate(e, s) for e, s in ranked if s >= low]
        return {"status": "needs_attention", "match": None, "candidates": candidates}
    return None


def match_course_names(
    names: list[str],
    *,
    tier1: list[dict],
    tier2: list[dict],
    scope_program_name: str | None = None,
    scope_intake_name: str | None = None,
) -> dict[str, dict]:
    results: dict[str, dict] = {}
    for name in names:
        if name in results:
            continue
        resolved = _resolve_one(
            name,
            tier1,
            scope_program_name=scope_program_name,
            scope_intake_name=scope_intake_name,
        ) or _resolve_one(
            name,
            tier2,
            scope_program_name=scope_program_name,
            scope_intake_name=scope_intake_name,
        )
        results[name] = resolved or {"status": "none", "match": None, "candidates": []}
    return results


def _course_to_entry(course: Course) -> dict:
    intake = getattr(course, "intake", None)
    program = getattr(course, "program", None)
    academic_year = getattr(intake, "name", None) if intake else None
    return {
        "id": course.id,
        "title": course.title,
        "code": course.code,
        "academic_year": academic_year,
        "student_count": course.student_count,
        "program_name": getattr(program, "name", None) if program else None,
        "intake_name": getattr(intake, "name", None) if intake else None,
    }


def _scope_courses(qs, program_id: int | None, intake_id: int | None):
    if program_id is not None:
        qs = qs.filter(program_id=program_id)
    if intake_id is not None:
        qs = qs.filter(intake_id=intake_id)
    return qs


def load_tier1_catalog(
    program_id: int | None = None, intake_id: int | None = None
) -> list[dict]:
    """Active/planned/paused courses ending within the recency window."""
    cutoff = date.today() - timedelta(days=365 * settings.IMPORT_COURSE_RECENCY_YEARS)
    qs = (
        Course.objects.select_related("program", "intake")
        .exclude(status=Course.CourseStatus.ENDED)
        .exclude(status_override=Course.StatusOverride.ENDED)
        .filter(end_date__gte=cutoff)
    )
    qs = _scope_courses(qs, program_id, intake_id)
    return [_course_to_entry(c) for c in qs]


def load_tier2_catalog(
    program_id: int | None = None, intake_id: int | None = None
) -> list[dict]:
    """Older / ended courses for fallback matching."""
    cutoff = date.today() - timedelta(days=365 * settings.IMPORT_COURSE_RECENCY_YEARS)
    qs = Course.objects.select_related("program", "intake").filter(
        Q(status=Course.CourseStatus.ENDED)
        | Q(status_override=Course.StatusOverride.ENDED)
        | Q(end_date__lt=cutoff)
    )
    qs = _scope_courses(qs, program_id, intake_id)
    return [_course_to_entry(c) for c in qs]
