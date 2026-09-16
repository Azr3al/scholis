"""Search courses by title, code, or related names."""
from __future__ import annotations

from typing import Any

from app_ai.links import get_current_org, with_course_link
from app_ai.tools.base import Tool, strict_object_schema
from app_auth.models import User
from app_course.course_scoping import scope_courses_for_user
from app_course.course_search import apply_course_search_q_with_meta

SEARCH_COURSES_SCHEMA = strict_object_schema(
    properties={
        "query": {
            "type": "string",
            "description": "Course title, code, subject, level, or section fragment.",
            "minLength": 1,
        },
        "limit": {
            "type": "integer",
            "description": "Maximum results (1-50).",
            "minimum": 1,
            "maximum": 50,
        },
    },
    required=["query"],
)


def _compact_row(course, *, org) -> dict[str, Any]:
    return with_course_link(
        {
            "id": course.id,
            "title": course.title,
            "code": course.code,
            "subject_name": getattr(getattr(course, "subject", None), "name", None),
            "level_name": getattr(getattr(course, "level", None), "name", None),
            "section_name": getattr(getattr(course, "section", None), "name", None),
        },
        org=org,
    )


def run_search_courses(args: dict[str, Any], user: User) -> list[dict[str, Any]]:
    query = args["query"]
    limit = int(args.get("limit") or 20)
    org = get_current_org()
    qs = scope_courses_for_user(user)
    qs = qs.select_related("subject", "level", "section")
    qs, _ = apply_course_search_q_with_meta(qs, query)
    return [_compact_row(c, org=org) for c in qs[:limit]]


SEARCH_COURSES_TOOL = Tool(
    name="search_courses",
    description=(
        "Search courses the caller can access by title, code, subject, level, section, "
        "or related names (full-text + fuzzy match). Returns ids and metadata only; "
        "use get_course_roster for staff/student names on a specific course."
    ),
    parameters=SEARCH_COURSES_SCHEMA,
    run=run_search_courses,
)
