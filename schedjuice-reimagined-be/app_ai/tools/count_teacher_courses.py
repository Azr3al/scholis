"""Count courses assigned to a teacher."""
from __future__ import annotations

from typing import Any

from app_ai.links import compact_user_for_ai
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.rbac import require_user_or_course_read_breadth
from app_ai.tools.resolve import resolve_staff_user
from app_auth.models import User
from app_course.models import UserCourse

from app_ai.tools.count_organization import COURSE_STATUS_ENUM

COUNT_TEACHER_COURSES_SCHEMA = strict_object_schema(
    properties={
        "user_id": {
            "type": "integer",
            "description": "Staff user id from a prior search_users result.",
        },
        "query": {
            "type": "string",
            "description": "Staff name, email, or code when user_id is unknown.",
            "minLength": 1,
        },
        "course_status": {
            "type": "string",
            "enum": COURSE_STATUS_ENUM,
            "description": "Filter by parent course status. Default active.",
        },
    },
    required=[],
)


def run_count_teacher_courses(args: dict[str, Any], user: User) -> dict[str, Any]:
    denied = require_user_or_course_read_breadth(user)
    if denied:
        return denied

    user_id = args.get("user_id")
    query = args.get("query")
    has_id = user_id is not None
    has_query = bool((query or "").strip())
    if has_id == has_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of user_id or query.",
        }

    resolved = resolve_staff_user(user_id=user_id, query=query)
    if resolved["status"] != "ok":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    teacher = resolved["user"]
    course_status = args.get("course_status") or "active"
    qs = UserCourse.objects.filter(
        user_id=teacher.id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    )
    if course_status != "all":
        qs = qs.filter(course__status=course_status)

    return {
        "count": qs.count(),
        "user": compact_user_for_ai(teacher),
        "course_status": course_status,
    }


COUNT_TEACHER_COURSES_TOOL = Tool(
    name="count_teacher_courses",
    description=(
        "Count how many courses a teacher is assigned to. Requires admin permissions. "
        "Provide user_id from search_users or a query to look up the teacher. "
        "Defaults to active courses only."
    ),
    parameters=COUNT_TEACHER_COURSES_SCHEMA,
    run=run_count_teacher_courses,
)
