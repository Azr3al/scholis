"""Course aggregate facets for the Academic Hub filter bar."""
from __future__ import annotations

from django.db.models import Count, Q, QuerySet

from app_course import models
from app_course.course_search import apply_course_search_q, strip_status_filters
from app_course.course_status import (
    annotate_effective_status,
    apply_effective_status_filter,
    extract_status_filter_values,
    filter_params_without_status,
)
from utilitas.views import BaseView


FACET_FIELDS = frozenset({"status", "subject", "category"})

FACET_STRIP_FIELDS = {
    "status": {"status"},
    "subject": {"subject", "subject_id", "subject__id"},
    "category": {"category", "category_id", "category__id"},
}

CURRENT_COURSE_STATUSES = (
    models.Course.CourseStatus.ACTIVE,
    models.Course.CourseStatus.PAUSED,
)
SUBJECT_FILTER_FIELDS = {"subject", "subject_id", "subject__id"}


def _strip_facet_filters(filter_params: list | None, facet: str) -> list:
    if not filter_params:
        return []
    drop = FACET_STRIP_FIELDS.get(facet, set())
    return [fp for fp in filter_params if fp.get("field_name") not in drop]


def _build_filter_dict(filter_params: list) -> dict:
    return BaseView.build_body_params(filter_params, model=models.Course)


def _build_chained_q(filter_params: list) -> list[Q]:
    q_objects = []
    for i in filter_params:
        if "|" not in i.get("field_name", ""):
            continue
        field_names = i["field_name"].split("|")
        op = i["operator"]
        value = i["value"]
        q_chain = Q()
        for f in field_names:
            if op == "in":
                q_object = Q(**{f"{f}__{op}": value.split(",")})
            elif op == "isnull":
                q_object = Q(**{f"{f}__{op}": value in ("true", "True", "1")})
            else:
                q_object = Q(**{f"{f}__{op}": value})
            q_chain = q_chain | q_object
        q_objects.append(q_chain)
    return q_objects


def _apply_filters(
    base_qs: QuerySet,
    filter_params: list,
    *,
    q: str | None = None,
) -> QuerySet:
    status_values = extract_status_filter_values(filter_params)
    plain = [
        fp
        for fp in filter_params_without_status(filter_params)
        if "|" not in fp.get("field_name", "")
    ]
    chained_raw = [
        fp for fp in filter_params if "|" in fp.get("field_name", "")
    ]
    qs = base_qs.filter(**_build_filter_dict(plain))
    for q_obj in _build_chained_q(chained_raw):
        qs = qs.filter(q_obj)
    if status_values:
        qs = apply_effective_status_filter(qs, status_values)
    if q:
        qs = apply_course_search_q(qs, q)
    return qs


def _subject_usage_base_qs(
    base_qs: QuerySet,
    request_filter_params: list | None,
    *,
    include_all_courses: bool,
    q: str | None = None,
) -> QuerySet:
    filters = [
        fp
        for fp in list(request_filter_params or [])
        if fp.get("field_name") not in SUBJECT_FILTER_FIELDS
    ]
    qs = _apply_filters(base_qs, filters, q=q or None)
    if not include_all_courses:
        qs = apply_effective_status_filter(
            qs,
            list(CURRENT_COURSE_STATUSES),
        )
    return qs


def build_subject_usage_rows(
    *,
    base_qs: QuerySet,
    request_filter_params: list | None,
    include_all_courses: bool = False,
    q: str | None = None,
) -> list[dict]:
    """Return subject usage rows, counting each course once per subject."""
    qs = _subject_usage_base_qs(
        base_qs,
        request_filter_params,
        include_all_courses=include_all_courses,
        q=q,
    )
    course_ids = qs.values("id")

    subject_course_ids: dict[int, set[int]] = {}
    subject_names: dict[int, str] = {}

    for row in (
        models.Course.objects.filter(id__in=course_ids)
        .exclude(subject_id__isnull=True)
        .values("id", "subject_id", "subject__name")
    ):
        subject_id = row["subject_id"]
        subject_course_ids.setdefault(subject_id, set()).add(row["id"])
        subject_names[subject_id] = row["subject__name"]

    for row in models.CourseSubject.objects.filter(course_id__in=course_ids).values(
        "course_id", "subject_id", "subject__name"
    ):
        subject_id = row["subject_id"]
        subject_course_ids.setdefault(subject_id, set()).add(row["course_id"])
        subject_names[subject_id] = row["subject__name"]

    programs_by_subject: dict[int, dict[int, str]] = {}
    if subject_course_ids:
        program_rows = (
            models.Course.objects.filter(id__in=course_ids)
            .filter(
                Q(subject_id__in=subject_course_ids.keys())
                | Q(course_subjects__subject_id__in=subject_course_ids.keys())
            )
            .values(
                "subject_id",
                "course_subjects__subject_id",
                "program_id",
                "program__name",
            )
            .distinct()
        )
        for row in program_rows:
            for subject_id in (row["subject_id"], row["course_subjects__subject_id"]):
                if subject_id in subject_course_ids and row["program_id"] is not None:
                    programs_by_subject.setdefault(subject_id, {})[
                        row["program_id"]
                    ] = row["program__name"]

    return [
        {
            "id": subject_id,
            "name": subject_names[subject_id],
            "count": len(course_ids_for_subject),
            "programs": [
                {"id": program_id, "name": name}
                for program_id, name in sorted(
                    programs_by_subject.get(subject_id, {}).items(),
                    key=lambda item: item[1],
                )
            ],
        }
        for subject_id, course_ids_for_subject in sorted(
            subject_course_ids.items(),
            key=lambda item: subject_names[item[0]].lower(),
        )
    ]


def build_course_aggregates(
    *,
    base_qs: QuerySet,
    request_filter_params: list | None,
    facets: list[str],
    q: str | None = None,
) -> dict:
    """Compute facet counts; each facet ignores its own filter fields."""
    request_filter_params = list(request_filter_params or [])
    if q:
        request_filter_params = strip_status_filters(request_filter_params)

    result: dict = {}
    for facet in facets:
        if facet not in FACET_FIELDS:
            continue
        filters_for_facet = _strip_facet_filters(request_filter_params, facet)
        qs = _apply_filters(base_qs, filters_for_facet, q=q or None)

        if facet == "status":
            rows = (
                annotate_effective_status(qs)
                .values("effective_status")
                .annotate(count=Count("id"))
            )
            status_counts = {
                row["effective_status"]: row["count"] for row in rows
            }
            for key in ("active", "planned", "ended", "paused"):
                status_counts.setdefault(key, 0)
            result["status"] = status_counts
        elif facet == "subject":
            result["subject"] = build_subject_usage_rows(
                base_qs=base_qs,
                request_filter_params=filters_for_facet,
                include_all_courses=True,
                q=q or None,
            )
        elif facet == "category":
            rows = (
                qs.exclude(category_id__isnull=True)
                .values("category_id", "category__name")
                .annotate(count=Count("id"))
                .order_by("category__name")
            )
            result["category"] = [
                {
                    "id": row["category_id"],
                    "name": row["category__name"],
                    "count": row["count"],
                }
                for row in rows
            ]
    return result
