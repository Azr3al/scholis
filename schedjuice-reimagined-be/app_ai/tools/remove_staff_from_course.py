"""Remove staff from a course roster (confirmation required)."""
from __future__ import annotations

from typing import Any

from app_ai.links import compact_user_for_ai, get_current_org
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.course_rbac import require_course_manage_members, require_course_write_access
from app_ai.tools.roster_common import (
    _pending_confirmation_response,
    _resolve_course,
    _resolve_member,
    build_course_preview,
    staff_already_assigned,
)
from app_auth.models import User

REMOVE_STAFF_SCHEMA = strict_object_schema(
    properties={
        "course_id": {"type": "integer"},
        "course_query": {"type": "string", "minLength": 1},
        "user_id": {"type": "integer"},
        "staff_query": {"type": "string", "minLength": 1},
    },
    required=[],
)


def run_remove_staff_from_course(
    args: dict[str, Any],
    user: User,
    *,
    channel_key: str | None = None,
    org=None,
) -> dict[str, Any]:
    denied = require_course_manage_members(user)
    if denied:
        return denied

    partial_args = dict(args)
    course_res = _resolve_course(
        user=user,
        course_id=args.get("course_id"),
        course_query=args.get("course_query"),
        channel_key=channel_key,
        tool_name="remove_staff_from_course",
        partial_args=partial_args,
    )
    if course_res is None or "course" not in course_res:
        return course_res or {"error": "validation_error", "message": "Course resolution failed."}

    member_res = _resolve_member(
        actor=user,
        user_id=args.get("user_id"),
        query=args.get("staff_query") or args.get("query"),
        role="staff",
        channel_key=channel_key,
        tool_name="remove_staff_from_course",
        partial_args=partial_args,
        ambiguous_status="ambiguous_subject",
    )
    if member_res is None or "member" not in member_res:
        return member_res or {"error": "validation_error", "message": "Staff resolution failed."}

    course = course_res["course"]
    staff = member_res["member"]
    org = org or get_current_org()

    denied = require_course_write_access(user, course)
    if denied:
        return denied

    if not staff_already_assigned(course.id, staff.id):
        return {"error": "not_on_roster", "message": "Staff member is not on this course roster."}

    course_preview = build_course_preview(course, org=org)
    staff_preview = compact_user_for_ai(staff, org=org)
    summary = f"Remove {staff.name} from {course.title} staff roster?"
    preview = {"course": course_preview, "staff": staff_preview}
    return _pending_confirmation_response(
        user=user,
        channel_key=channel_key,
        tool_name="remove_staff_from_course",
        action="remove_staff",
        summary=summary,
        preview=preview,
        execution_payload={"course_id": course.id, "staff_id": staff.id},
    )


REMOVE_STAFF_FROM_COURSE_TOOL = Tool(
    name="remove_staff_from_course",
    description=(
        "Remove or unassign a staff member from a course roster. "
        "Use when the user says remove, unassign, or take someone off a course. "
        "Requires course.manage_members. "
        "Always returns pending_confirmation. Provide exactly one of course_id or "
        "course_query, and one of user_id or staff_query."
    ),
    parameters=REMOVE_STAFF_SCHEMA,
    run=run_remove_staff_from_course,
    exposure="write",
)
