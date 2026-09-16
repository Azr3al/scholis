from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from django.db.models import Prefetch

from app_course.models import AssignedAsRole, Course, CourseSubject, UserCourse
from app_hr.school_overview_cache import (
    get_school_overview_snapshot,
    set_school_overview_snapshot,
)

logger = logging.getLogger(__name__)

ALLOWED_SORT_FIELDS = frozenset(
    {
        "course_title",
        "mt_name",
        "total_income",
        "total_expense",
        "total_profit",
    }
)
_MONEY_SORT_FIELDS = frozenset(
    {"total_income", "total_expense", "total_profit"}
)
_DEFAULT_SORTS = ["course_title"]
_DEFAULT_PAGE_SIZE = 20
_MAX_PAGE_SIZE = 100


def enrich_school_overview_courses(
    course_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not course_rows:
        return []

    course_ids = [int(r["course_id"]) for r in course_rows if r.get("course_id") is not None]
    courses_by_id = {
        c.id: c
        for c in Course.objects.filter(id__in=course_ids)
        .select_related("subject")
        .prefetch_related(
            Prefetch(
                "course_subjects",
                queryset=CourseSubject.objects.select_related("subject").order_by(
                    "sort_order", "id"
                ),
            )
        )
    }

    mt_names: dict[int, list[str]] = {cid: [] for cid in course_ids}
    ucs = (
        UserCourse.objects.filter(
            course_id__in=course_ids,
            assigned_as=UserCourse.AssignedAs.TEACHER,
            assigned_as_role__seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
        )
        .select_related("user")
        .order_by("course_id", "user__name", "id")
    )
    for uc in ucs:
        name = (getattr(uc.user, "name", None) or "").strip()
        if name and name not in mt_names[uc.course_id]:
            mt_names[uc.course_id].append(name)

    enriched: list[dict[str, Any]] = []
    for row in course_rows:
        cid = int(row["course_id"])
        course = courses_by_id.get(cid)
        title = ""
        code: Optional[str] = None
        subject_names = ""
        if course is not None:
            title = (course.title or "").strip()
            code = course.code
            names: list[str] = []
            if course.subject_id and course.subject and course.subject.name:
                names.append(course.subject.name.strip())
            for cs in course.course_subjects.all():
                n = (cs.subject.name if cs.subject else "") or ""
                n = n.strip()
                if n and n not in names:
                    names.append(n)
            subject_names = ", ".join(names)
        if not title:
            title = str(row.get("course_title") or "")

        enriched.append(
            {
                "course_id": cid,
                "course_title": title,
                "course_code": code,
                "subject_names": subject_names,
                "mt_name": ", ".join(mt_names.get(cid, [])),
                "total_income": row["total_income"],
                "total_expense": row["total_expense"],
                "total_profit": row["total_profit"],
            }
        )
    return enriched


def _haystack(row: dict[str, Any]) -> str:
    parts = [
        str(row.get("course_title") or ""),
        str(row.get("course_code") or ""),
        str(row.get("subject_names") or ""),
        str(row.get("mt_name") or ""),
    ]
    return " ".join(parts).lower()


def _substring_match_ids(courses: list[dict[str, Any]], q: str) -> set[int]:
    needle = q.strip().lower()
    if not needle:
        return {int(r["course_id"]) for r in courses}
    return {
        int(r["course_id"])
        for r in courses
        if needle in _haystack(r)
    }


def _hub_search_match_ids(course_ids: list[int], q: str) -> set[int]:
    if not course_ids or not (q or "").strip():
        return set()
    try:
        from app_course.course_search import apply_course_search_q

        qs = Course.objects.filter(id__in=course_ids)
        matched = apply_course_search_q(qs, q).values_list("id", flat=True)
        return set(int(i) for i in matched)
    except Exception:
        logger.warning(
            "school_overview_query: hub course search failed; substring only",
            exc_info=True,
        )
        return set()


def filter_school_overview_courses(
    courses: list[dict[str, Any]], q: str
) -> list[dict[str, Any]]:
    q = (q or "").strip()
    if not q:
        return list(courses)

    ids = _substring_match_ids(courses, q)
    ids |= _hub_search_match_ids([int(r["course_id"]) for r in courses], q)
    return [r for r in courses if int(r["course_id"]) in ids]


def _sort_key_for_field(row: dict[str, Any], field: str):
    raw = row.get(field)
    if field in _MONEY_SORT_FIELDS:
        try:
            return Decimal(str(raw if raw is not None else "0"))
        except (InvalidOperation, TypeError, ValueError):
            return Decimal("0")
    return str(raw or "").lower()


def sort_school_overview_courses(
    courses: list[dict[str, Any]], sorts: Optional[list[str]]
) -> list[dict[str, Any]]:
    effective = list(sorts) if sorts else list(_DEFAULT_SORTS)
    if not effective:
        effective = list(_DEFAULT_SORTS)

    # Apply sorts least-significant first so the first sort wins.
    ordered = list(courses)
    for token in reversed(effective):
        if not token:
            continue
        descending = token.startswith("-")
        field = token[1:] if descending else token
        if field not in ALLOWED_SORT_FIELDS:
            continue
        ordered.sort(
            key=lambda r, f=field: _sort_key_for_field(r, f),
            reverse=descending,
        )
    return ordered


def paginate_school_overview_courses(
    courses: list[dict[str, Any]], page: int, size: int
) -> tuple[list[dict[str, Any]], int]:
    try:
        page = int(page)
    except (TypeError, ValueError):
        page = 1
    try:
        size = int(size)
    except (TypeError, ValueError):
        size = _DEFAULT_PAGE_SIZE

    page = max(1, page)
    size = max(1, min(_MAX_PAGE_SIZE, size if size else _DEFAULT_PAGE_SIZE))
    total = len(courses)
    start = (page - 1) * size
    end = start + size
    return courses[start:end], total


def build_school_overview_payload(
    *,
    schema_name: str,
    timezone_code: str,
    month: int,
    year: int,
    q: str = "",
    page: int = 1,
    size: int = _DEFAULT_PAGE_SIZE,
    sorts: Optional[list[str]] = None,
) -> dict[str, Any]:
    from app_hr.payroll_funcs import get_school_overview_trphillips

    snapshot = get_school_overview_snapshot(schema_name, year, month)
    if snapshot is None:
        computed = get_school_overview_trphillips(month, year, timezone_code)
        snapshot = {
            "courses": computed["courses"],
            "grand_aggregate": computed["grand_aggregate"],
        }
        set_school_overview_snapshot(schema_name, year, month, snapshot)

    courses = filter_school_overview_courses(snapshot.get("courses") or [], q)
    courses = sort_school_overview_courses(courses, sorts)
    page_rows, count = paginate_school_overview_courses(courses, page, size)
    return {
        "courses": page_rows,
        "count": count,
        "grand_aggregate": snapshot["grand_aggregate"],
    }
