"""Filtered org-wide course lookup for AI assistants."""
from __future__ import annotations

import calendar
from datetime import date
from typing import Any

from app_ai.links import get_current_org, with_course_link
from app_ai.org_datetime import org_today
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.count_organization import COURSE_STATUS_ENUM
from app_ai.tools.rbac import require_course_read_breadth
from app_ai.tools.resolve import resolve_category
from app_auth.models import User
from app_course.course_month_type import (
    MONTH_TYPE_FM,
    MONTH_TYPE_HM,
    filter_queryset_by_month_type,
)
from app_course.course_status import apply_effective_status_filter
from app_course.models import Course

DATE_MODE_OVERLAP = "overlap"
DATE_MODE_STARTING = "starting"


def month_bounds(*, year: int, month: int) -> tuple[date, date]:
    first = date(year, month, 1)
    last = date(year, month, calendar.monthrange(year, month)[1])
    return first, last


def _apply_date_filter(qs, *, first_day: date, last_day: date, date_mode: str):
    if date_mode == DATE_MODE_STARTING:
        return qs.filter(start_date__gte=first_day, start_date__lte=last_day)
    return qs.filter(start_date__lte=last_day, end_date__gte=first_day)


def _resolve_status_filter(
    args: dict[str, Any], *, date_mode: str
) -> tuple[list[str] | None, str]:
    """Return effective statuses to filter and the filters_applied label."""
    explicit_status = args.get("course_status")
    if explicit_status == "all":
        return None, "all"
    if explicit_status:
        return [explicit_status], explicit_status
    if date_mode == DATE_MODE_STARTING:
        return (
            [Course.CourseStatus.ACTIVE, Course.CourseStatus.PLANNED],
            "active_planned",
        )
    return [Course.CourseStatus.ACTIVE], "active"


def _compact_course_row(course: Course, *, org) -> dict[str, Any]:
    row = {
        "course_id": course.id,
        "title": course.title,
        "student_count": course.student_count if course.student_count is not None else 0,
    }
    return with_course_link(row, org=org)


def _group_courses(courses: list[Course], *, org) -> list[dict[str, Any]]:
    buckets: dict[int, dict[str, Any]] = {}
    for course in courses:
        cat = course.category
        cid = cat.id
        if cid not in buckets:
            buckets[cid] = {
                "category": {
                    "id": cid,
                    "name": cat.name,
                    "sort_order": cat.sort_order,
                },
                "courses": [],
            }
        buckets[cid]["courses"].append(_compact_course_row(course, org=org))
    groups = list(buckets.values())
    for group in groups:
        group["count"] = len(group["courses"])
    groups.sort(
        key=lambda g: (g["category"]["sort_order"], g["category"]["name"].lower())
    )
    return groups


QUERY_COURSES_SCHEMA = strict_object_schema(
    properties={
        "year": {
            "type": "integer",
            "description": (
                "Calendar year. Ignored unless user_stated_year is true. "
                "Default: current year in org timezone."
            ),
        },
        "month": {
            "type": "integer",
            "minimum": 1,
            "maximum": 12,
            "description": "Calendar month 1-12. Default: current.",
        },
        "category_id": {
            "type": "integer",
            "description": "Category id after resolve.",
        },
        "category_query": {
            "type": "string",
            "minLength": 1,
            "description": "Fuzzy category name.",
        },
        "course_type": {"type": "string", "enum": ["WD", "WE"]},
        "month_type": {"type": "string", "enum": [MONTH_TYPE_FM, MONTH_TYPE_HM]},
        "course_status": {"type": "string", "enum": COURSE_STATUS_ENUM},
        "group_by_category": {"type": "boolean"},
        "user_stated_year": {
            "type": "boolean",
            "description": (
                "True only when the user explicitly stated a calendar year "
                "in their message."
            ),
        },
        "limit": {"type": "integer", "minimum": 1, "maximum": 50},
    },
    required=[],
)


def run_query_courses_filtered(
    args: dict[str, Any], user: User, *, date_mode: str
) -> dict[str, Any]:
    denied = require_course_read_breadth(user)
    if denied:
        return denied

    org = get_current_org()
    if org is None:
        return {"error": "validation_error", "message": "Organization context required."}

    today = org_today(org)
    month = int(args.get("month") or today.month)
    user_stated_year = bool(args.get("user_stated_year"))
    if user_stated_year:
        year = int(args.get("year") or today.year)
        year_source = "user_stated"
    else:
        year = today.year
        year_source = "default"
    if month < 1 or month > 12:
        return {"error": "validation_error", "message": "month must be 1-12."}

    category_id = args.get("category_id")
    category_query = args.get("category_query")
    has_cat_id = category_id is not None
    has_cat_query = bool((category_query or "").strip())
    if has_cat_id and has_cat_query:
        return {
            "error": "validation_error",
            "message": "Provide at most one of category_id or category_query.",
        }

    resolved_category = None
    if has_cat_id or has_cat_query:
        resolved = resolve_category(category_id=category_id, query=category_query)
        if resolved["status"] != "ok":
            return {
                "error": resolved["status"],
                **{k: v for k, v in resolved.items() if k != "status"},
            }
        resolved_category = resolved["category"]

    effective_statuses, course_status_label = _resolve_status_filter(
        args, date_mode=date_mode
    )
    course_type = args.get("course_type")
    month_type = args.get("month_type")
    group_by_category = args.get("group_by_category")
    if group_by_category is None:
        group_by_category = True
    limit = int(args.get("limit") or 50)

    if month_type and not getattr(org, "is_fm_hm_course_display_enabled", False):
        return {
            "error": "feature_disabled",
            "message": "FM/HM filters are not enabled for this school.",
        }

    first_day, last_day = month_bounds(year=year, month=month)
    qs = Course.objects.all()
    if effective_statuses:
        qs = apply_effective_status_filter(
            qs, effective_statuses, reference=today
        )
    qs = _apply_date_filter(
        qs, first_day=first_day, last_day=last_day, date_mode=date_mode
    )
    if resolved_category is not None:
        qs = qs.filter(category_id=resolved_category.id)
    if course_type in ("WD", "WE"):
        qs = qs.filter(course_type=course_type)
    if month_type in (MONTH_TYPE_FM, MONTH_TYPE_HM):
        qs = filter_queryset_by_month_type(qs, month_type)

    qs = qs.select_related("category").order_by(
        "category__sort_order", "category__name", "title"
    )
    matched = list(qs[: limit + 1])
    truncated = len(matched) > limit
    courses = matched[:limit]

    month_label = first_day.strftime("%B %Y")
    filters_applied: dict[str, Any] = {
        "date_mode": date_mode,
        "course_status": course_status_label,
        "category": (
            {"id": resolved_category.id, "name": resolved_category.name}
            if resolved_category
            else None
        ),
        "course_type": course_type,
        "month_type": month_type,
    }

    result: dict[str, Any] = {
        "count": len(courses),
        "date_mode": date_mode,
        "month": {
            "year": year,
            "month": month,
            "label": month_label,
            "year_source": year_source,
        },
        "filters_applied": filters_applied,
        "group_by_category": group_by_category,
        "truncated": truncated,
    }
    if group_by_category:
        result["groups"] = _group_courses(courses, org=org)
    else:
        result["courses"] = [_compact_course_row(c, org=org) for c in courses]
    return result


def run_query_courses(args: dict[str, Any], user: User) -> dict[str, Any]:
    return run_query_courses_filtered(args, user, date_mode=DATE_MODE_OVERLAP)


def run_query_courses_starting(args: dict[str, Any], user: User) -> dict[str, Any]:
    return run_query_courses_filtered(args, user, date_mode=DATE_MODE_STARTING)


QUERY_COURSES_TOOL = Tool(
    name="query_courses",
    description=(
        "List or count school-wide courses that overlap or run during the calendar "
        "month (defaults to current month): any course active on at least one day "
        "in the month. Filters: category (fuzzy name), WE/WD course_type, and "
        "FM/HM month_type when enabled. Year defaults to current calendar year "
        "unless user_stated_year is true. Use for active/running/in-session "
        "questions — not for new/starting classes. Admin only. Always include "
        "course names when answering counts."
    ),
    parameters=QUERY_COURSES_SCHEMA,
    run=run_query_courses,
)

QUERY_COURSES_STARTING_TOOL = Tool(
    name="query_courses_starting",
    description=(
        "List or count school-wide courses whose start_date falls within the "
        "given calendar month (new/starting classes). Use when the user asks "
        "about new classes, classes starting or beginning in a month, or courses "
        "that start in a period. Same filters as query_courses (category, WE/WD, "
        "FM/HM, course_status). Year defaults to current calendar year unless "
        "user_stated_year is true. Admin only. Always include course names when "
        "answering counts."
    ),
    parameters=QUERY_COURSES_SCHEMA,
    run=run_query_courses_starting,
)
