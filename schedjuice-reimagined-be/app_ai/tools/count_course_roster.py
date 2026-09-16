"""Count students and staff on a course roster."""
from __future__ import annotations

from typing import Any

from app_ai.links import get_current_org, with_course_link
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.resolve import resolve_accessible_course
from app_auth.models import User
from app_course.models import UserCourse

COUNT_COURSE_ROSTER_SCHEMA = strict_object_schema(
    properties={
        "course_id": {
            "type": "integer",
            "description": "Course id from a prior search_courses result.",
        },
        "query": {
            "type": "string",
            "description": "Course title or code when course_id is unknown.",
            "minLength": 1,
        },
        "member_type": {
            "type": "string",
            "enum": ["students", "staff", "all"],
            "description": "Which roster members to count. Default all.",
        },
    },
    required=[],
)


def run_count_course_roster(args: dict[str, Any], user: User) -> dict[str, Any]:
    course_id = args.get("course_id")
    query = args.get("query")
    member_type = args.get("member_type") or "all"

    has_id = course_id is not None
    has_query = bool((query or "").strip())
    if has_id == has_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of course_id or query.",
        }

    resolved = resolve_accessible_course(
        user=user, course_id=course_id, query=query
    )
    if resolved["status"] != "ok":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    course = resolved["course"]
    org = get_current_org()
    course_row = with_course_link(
        {"id": course.id, "title": course.title, "code": course.code},
        org=org,
    )
    base = UserCourse.objects.filter(course_id=course.id)
    out: dict[str, Any] = {
        "course": course_row,
        "member_type_requested": member_type,
    }
    if member_type in ("students", "all"):
        out["students"] = base.filter(
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).count()
    if member_type in ("staff", "all"):
        out["staff"] = base.filter(
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).count()
    return out


COUNT_COURSE_ROSTER_TOOL = Tool(
    name="count_course_roster",
    description=(
        "Count students and/or teachers on a course roster. "
        "Requires access to the course. Provide course_id from search_courses "
        "or a query to look up the course."
    ),
    parameters=COUNT_COURSE_ROSTER_SCHEMA,
    run=run_count_course_roster,
)
