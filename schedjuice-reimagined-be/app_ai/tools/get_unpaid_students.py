"""Unpaid student counts and names for AI assistants."""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any

from django.utils import timezone

from app_ai.links import compact_user_for_ai, get_current_org, with_course_link
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.org_datetime import org_today
from app_ai.tools.resolve import resolve_accessible_course
from app_ai.tools.unpaid_rbac import require_unpaid_course_access, require_unpaid_read
from app_auth.models import User
from app_course.course_month_type import MONTH_TYPE_FM, MONTH_TYPE_HM
from app_course.models import Course
from app_finance.payment_scoping import filter_course_ids_for_unpaid
from app_finance.unpaid_helpers import (
    paid_until_by_user_for_course,
    sort_unpaid_user_courses_by_paid_until,
    unpaid_course_summary_rows,
    unpaid_student_user_courses_queryset,
)
from app_utility_notifications.tenant_time import get_tenant_day_boundaries

GET_UNPAID_STUDENTS_SCHEMA = strict_object_schema(
    properties={
        "course_id": {
            "type": "integer",
            "description": "Course id from search_courses.",
        },
        "query": {
            "type": "string",
            "minLength": 1,
            "description": "Course title or code (e.g. 'CAE 35 WD').",
        },
        "include_names": {
            "type": "boolean",
            "description": (
                "Include unpaid student names (course-scoped only). Default false."
            ),
        },
        "year": {
            "type": "integer",
            "description": "Calendar year. Default: current in org timezone.",
        },
        "month": {
            "type": "integer",
            "minimum": 1,
            "maximum": 12,
            "description": "Calendar month 1-12. Default: current.",
        },
        "month_type": {
            "type": "string",
            "enum": [MONTH_TYPE_FM, MONTH_TYPE_HM],
            "description": "Org-wide only: FM or HM course filter.",
        },
    },
    required=[],
)


def _payment_params_for_calendar_month(
    *, tenant_tz: str, year: int, month: int
) -> dict[str, str]:
    now = timezone.now()
    last_day = monthrange(year, month)[1]
    month_start_ymd = f"{year:04d}-{month:02d}-01"
    month_end_ymd = f"{year:04d}-{month:02d}-{last_day:02d}"
    start_dt, _ = get_tenant_day_boundaries(now, tenant_tz, month_start_ymd)
    _, end_dt = get_tenant_day_boundaries(now, tenant_tz, month_end_ymd)
    return {
        "issued_at__gte": start_dt.isoformat(),
        "issued_at__lte": end_dt.isoformat(),
    }


def _month_meta(*, year: int, month: int) -> dict[str, Any]:
    label = date(year, month, 1).strftime("%B %Y")
    return {"year": year, "month": month, "label": label}


def _build_org_summary(
    *,
    user: User,
    org,
    payment_params: dict[str, str],
    month_block: dict[str, Any],
    month_type: str | None,
    include_names: bool,
) -> dict[str, Any]:
    try:
        rows = unpaid_course_summary_rows(
            payment_params,
            course_month_type=month_type,
        )
    except ValueError as exc:
        return {"error": "validation_error", "message": str(exc)}

    allowed_ids = set(
        filter_course_ids_for_unpaid(user, [row["course_id"] for row in rows])
    )
    rows = [
        row
        for row in rows
        if row["course_id"] in allowed_ids and row["unpaid_count"] > 0
    ]

    buckets: dict[int | None, dict[str, Any]] = {}
    total_unpaid = 0
    for row in rows:
        total_unpaid += row["unpaid_count"]
        cat_id = row.get("category_id")
        if cat_id not in buckets:
            buckets[cat_id] = {
                "category": {
                    "id": cat_id,
                    "name": row.get("category_name") or "Uncategorized",
                    "sort_order": row.get("category_sort_order") or 0,
                },
                "courses": [],
            }
        course_entry = with_course_link(
            {
                "course_id": row["course_id"],
                "title": row["title"],
                "unpaid_count": row["unpaid_count"],
            },
            org=org,
        )
        buckets[cat_id]["courses"].append(course_entry)

    groups = sorted(
        buckets.values(),
        key=lambda group: (
            group["category"]["sort_order"],
            group["category"]["name"].lower(),
        ),
    )
    for group in groups:
        group["courses"].sort(key=lambda course: (course.get("title") or "").lower())

    result: dict[str, Any] = {
        "mode": "org_summary",
        "month": month_block,
        "month_type": month_type,
        "total_unpaid_students": total_unpaid,
        "courses_with_unpaid": len(rows),
        "groups": groups,
    }
    if include_names:
        result["names_omitted_reason"] = "org_wide_summary"
    return result


def _build_course_result(
    *,
    user: User,
    org,
    course,
    payment_params: dict[str, str],
    month_block: dict[str, Any],
    include_names: bool,
) -> dict[str, Any]:
    denied_course = require_unpaid_course_access(user, course.id)
    if denied_course:
        return denied_course

    user_courses_qs = unpaid_student_user_courses_queryset(
        course.id,
        payment_params,
        sorts=["user__name"],
    )
    unpaid_count = user_courses_qs.count()
    course_row = with_course_link(
        {"id": course.id, "title": course.title, "code": course.code},
        org=org,
    )
    result: dict[str, Any] = {
        "mode": "course",
        "month": month_block,
        "course": course_row,
        "unpaid_count": unpaid_count,
    }
    if not include_names:
        return result

    user_courses_list = list(user_courses_qs)
    paid_until_map = paid_until_by_user_for_course(
        course.id,
        [uc.user_id for uc in user_courses_list],
    )
    user_courses_list = sort_unpaid_user_courses_by_paid_until(
        user_courses_list,
        paid_until_map,
    )
    students = []
    for uc in user_courses_list:
        row = compact_user_for_ai(uc.user, org=org)
        paid_until = paid_until_map.get(uc.user_id)
        row["paid_until"] = (
            {"year": paid_until[0], "month_index": paid_until[1]}
            if paid_until is not None
            else None
        )
        row["payment_status"] = (
            "never_paid" if paid_until is None else "behind"
        )
        students.append(row)
    result["students"] = students
    return result


def run_get_unpaid_students(args: dict[str, Any], user: User) -> dict[str, Any]:
    denied = require_unpaid_read(user)
    if denied:
        return denied

    org = get_current_org()
    if org is None:
        return {"error": "validation_error", "message": "Organization context required."}

    today = org_today(org)
    year = int(args.get("year") or today.year)
    month = int(args.get("month") or today.month)
    if month < 1 or month > 12:
        return {"error": "validation_error", "message": "month must be 1-12."}

    month_type = args.get("month_type")
    if month_type not in (None, "", MONTH_TYPE_FM, MONTH_TYPE_HM):
        return {
            "error": "validation_error",
            "message": "month_type must be FM, HM, or omitted.",
        }

    tenant_tz = getattr(org, "timezone", None) or "UTC"
    payment_params = _payment_params_for_calendar_month(
        tenant_tz=tenant_tz,
        year=year,
        month=month,
    )
    month_block = _month_meta(year=year, month=month)
    include_names = bool(args.get("include_names"))

    course_id = args.get("course_id")
    query = args.get("query")
    has_id = course_id is not None
    has_query = bool((query or "").strip())
    if has_id and has_query:
        return {
            "error": "validation_error",
            "message": "Provide at most one of course_id or query.",
        }

    if not has_id and not has_query:
        return _build_org_summary(
            user=user,
            org=org,
            payment_params=payment_params,
            month_block=month_block,
            month_type=month_type or None,
            include_names=include_names,
        )

    if has_id:
        course = Course.objects.filter(id=course_id).first()
        if course is None:
            return {"error": "not_found", "message": "Course not found."}
        return _build_course_result(
            user=user,
            org=org,
            course=course,
            payment_params=payment_params,
            month_block=month_block,
            include_names=include_names,
        )

    resolved = resolve_accessible_course(
        user=user,
        course_id=None,
        query=query,
    )
    if resolved["status"] != "ok":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    return _build_course_result(
        user=user,
        org=org,
        course=resolved["course"],
        payment_params=payment_params,
        month_block=month_block,
        include_names=include_names,
    )


GET_UNPAID_STUDENTS_TOOL = Tool(
    name="get_unpaid_students",
    description=(
        "Count or list students who lack payment on file for a calendar month on a "
        "course, or summarize which courses have unpaid students school-wide. "
        "Requires payment.view_unpaid (connected courses) or payment.view_unpaid_all. "
        "Default month is current in org timezone. Use include_names=true when the "
        "user asks who is unpaid. Omit course_id/query for org-wide summary grouped "
        "by category; org-wide never returns individual student names. "
        "Provide course_id from search_courses or query (e.g. 'CAE 35 WD'). "
        "Success: mode course (unpaid_count, optional students) or org_summary "
        "(groups, total_unpaid_students). Errors: permission_denied, "
        "validation_error, ambiguous, not_found."
    ),
    parameters=GET_UNPAID_STUDENTS_SCHEMA,
    run=run_get_unpaid_students,
)
