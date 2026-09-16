"""Enroll a student in a course (confirmation required)."""
from __future__ import annotations

from typing import Any

from app_ai.links import compact_user_for_ai, get_current_org
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.course_rbac import require_course_manage_members
from app_ai.tools.roster_common import (
    _pending_confirmation_response,
    _resolve_course,
    _resolve_member,
    build_course_preview,
    student_already_enrolled,
)
from app_auth.models import User

ENROLL_STUDENT_SCHEMA = strict_object_schema(
    properties={
        "course_id": {"type": "integer"},
        "course_query": {"type": "string", "minLength": 1},
        "user_id": {"type": "integer"},
        "student_query": {"type": "string", "minLength": 1},
    },
    required=[],
)


def run_enroll_student_in_course(
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
        tool_name="enroll_student_in_course",
        partial_args=partial_args,
    )
    if course_res is None or "course" not in course_res:
        return course_res or {"error": "validation_error", "message": "Course resolution failed."}

    member_res = _resolve_member(
        actor=user,
        user_id=args.get("user_id"),
        query=args.get("student_query") or args.get("query"),
        role="student",
        channel_key=channel_key,
        tool_name="enroll_student_in_course",
        partial_args=partial_args,
        ambiguous_status="ambiguous_subject",
    )
    if member_res is None or "member" not in member_res:
        return member_res or {"error": "validation_error", "message": "Student resolution failed."}

    course = course_res["course"]
    student = member_res["member"]
    org = org or get_current_org()

    from app_ai.tools.course_rbac import require_course_write_access

    denied = require_course_write_access(user, course)
    if denied:
        return denied

    if student_already_enrolled(course.id, student.id):
        return {"error": "already_enrolled", "message": "Student is already enrolled in this course."}

    course_preview = build_course_preview(course, org=org)
    student_preview = compact_user_for_ai(student, org=org)
    summary = f"Enroll {student.name} in {course.title}?"
    preview = {"course": course_preview, "student": student_preview}
    return _pending_confirmation_response(
        user=user,
        channel_key=channel_key,
        tool_name="enroll_student_in_course",
        action="enroll_student",
        summary=summary,
        preview=preview,
        execution_payload={"course_id": course.id, "student_id": student.id},
    )


ENROLL_STUDENT_IN_COURSE_TOOL = Tool(
    name="enroll_student_in_course",
    description=(
        "Enroll a student in a course. Use when the user wants to enroll or add a student. "
        "Requires course.manage_members. "
        "Always returns pending_confirmation — never claim enrollment until confirmed. "
        "Provide exactly one of course_id or course_query, and one of user_id or student_query."
    ),
    parameters=ENROLL_STUDENT_SCHEMA,
    run=run_enroll_student_in_course,
    exposure="write",
)
