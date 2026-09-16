"""Assign staff to a course with role and session scope (confirmation required)."""
from __future__ import annotations

from typing import Any

from app_ai.disambiguation import save_pending
from app_ai.links import compact_user_for_ai, get_current_org
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.course_rbac import require_course_manage_members, require_course_write_access
from app_ai.tools.resolve import list_assignable_course_roles, resolve_course_role
from app_ai.tools.roster_common import (
    _ambiguous_payload,
    _pending_confirmation_response,
    _resolve_course,
    _resolve_member,
    adhoc_not_supported,
    build_course_preview,
    count_matching_sessions,
    staff_already_assigned,
)
from app_auth.models import User
from app_course.roster_event_weekdays import format_weekday_labels
from app_microsoft.team_provisioning_helpers import tenant_syncs_course_team_roster

ASSIGN_STAFF_SCHEMA = strict_object_schema(
    properties={
        "course_id": {"type": "integer"},
        "course_query": {"type": "string", "minLength": 1},
        "user_id": {"type": "integer"},
        "staff_query": {"type": "string", "minLength": 1},
        "role_seniority": {
            "type": "string",
            "enum": ["MT", "AT"],
            "description": "Main Teacher or Assistant Teacher shorthand.",
        },
        "course_role_query": {
            "type": "string",
            "minLength": 1,
            "description": "Named course role when not using MT/AT.",
        },
        "course_role_id": {"type": "integer"},
        "weekdays": {
            "type": "array",
            "items": {"type": "integer", "minimum": 0, "maximum": 6},
            "description": "0=Sun … 6=Sat. Omit for all sessions.",
        },
        "specific_event_ids": {
            "type": "array",
            "items": {"type": "integer"},
            "description": "Not supported — use member edit page.",
        },
    },
    required=[],
)


def run_assign_staff_to_course(
    args: dict[str, Any],
    user: User,
    *,
    channel_key: str | None = None,
    org=None,
) -> dict[str, Any]:
    denied = require_course_manage_members(user)
    if denied:
        return denied

    specific_event_ids = args.get("specific_event_ids") or []
    if specific_event_ids:
        org = org or get_current_org()
        course_id = args.get("course_id")
        if course_id is None and args.get("course_query"):
            course_res = _resolve_course(
                user=user,
                course_id=None,
                course_query=args.get("course_query"),
                channel_key=None,
                tool_name="assign_staff_to_course",
                partial_args=dict(args),
            )
            if course_res and course_res.get("course"):
                course_id = course_res["course"].id
        if course_id is None:
            return {
                "error": "validation_error",
                "message": "Provide course_id or course_query for ad-hoc session requests.",
            }
        return adhoc_not_supported(org=org, course_id=int(course_id))

    partial_args = dict(args)
    course_res = _resolve_course(
        user=user,
        course_id=args.get("course_id"),
        course_query=args.get("course_query"),
        channel_key=channel_key,
        tool_name="assign_staff_to_course",
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
        tool_name="assign_staff_to_course",
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

    if staff_already_assigned(course.id, staff.id):
        return {
            "error": "already_assigned",
            "message": "Staff member is already assigned to this course.",
        }

    has_role = any(
        [
            args.get("role_seniority"),
            args.get("course_role_query"),
            args.get("course_role_id") is not None,
        ]
    )
    if not has_role:
        roles = list_assignable_course_roles()
        if not roles:
            return {"error": "not_found", "message": "No course roles configured."}
        partial_args["_staff_name"] = staff.name
        partial_args["_course_title"] = course.title
        if channel_key:
            save_pending(
                user=user,
                channel_key=channel_key,
                tool_name="assign_staff_to_course",
                pending_field="course_role",
                partial_args=partial_args,
                candidates=roles,
            )
        return {
            "status": "role_required",
            "message": "Role required before assignment.",
            "candidates": roles,
        }

    resolved_role = resolve_course_role(
        role_seniority=args.get("role_seniority"),
        course_role_query=args.get("course_role_query"),
        course_role_id=args.get("course_role_id"),
    )
    if resolved_role["status"] == "ambiguous":
        payload = _ambiguous_payload(
            "ambiguous_course_role",
            resolved_role,
            args.get("course_role_query") or args.get("role_seniority") or "",
        )
        if channel_key:
            save_pending(
                user=user,
                channel_key=channel_key,
                tool_name="assign_staff_to_course",
                pending_field="course_role",
                partial_args=partial_args,
                candidates=payload["candidates"],
            )
        return payload
    if resolved_role["status"] != "ok":
        return {
            "error": resolved_role["status"],
            **{k: v for k, v in resolved_role.items() if k != "status"},
        }

    role = resolved_role["role"]
    weekdays = args.get("weekdays") or None
    tz_name = getattr(org, "timezone", None) or "UTC"
    session_count = count_matching_sessions(
        course_id=course.id,
        weekdays=weekdays,
        tz_name=tz_name,
    )
    if session_count == 0:
        return {
            "error": "validation_error",
            "message": "No course sessions match the requested weekdays.",
        }

    if tenant_syncs_course_team_roster(org):
        if not staff.microsoft_id:
            return {
                "error": "teams_link_required",
                "message": (
                    "This teacher is not linked to Microsoft 365 yet. "
                    "Link their Microsoft account before adding them to a Teams class."
                ),
            }
        if not course.microsoft_group_id:
            return {
                "error": "ms_team_required",
                "message": (
                    "This class does not have a Microsoft team linked. "
                    "Link the team before adding teachers."
                ),
            }

    weekday_labels = format_weekday_labels(weekdays)
    sessions_label = ", ".join(weekday_labels)
    course_preview = build_course_preview(course, org=org)
    staff_preview = compact_user_for_ai(staff, org=org)
    summary = (
        f"Assign {staff.name} as {role.name} on {course.title}, "
        f"sessions: {sessions_label} ({session_count} slots)?"
    )
    preview = {
        "staff": staff_preview,
        "course": course_preview,
        "role": {"id": role.id, "name": role.name},
        "weekdays": weekdays,
        "weekday_labels": weekday_labels,
        "session_count": session_count,
    }
    return _pending_confirmation_response(
        user=user,
        channel_key=channel_key,
        tool_name="assign_staff_to_course",
        action="assign_staff",
        summary=summary,
        preview=preview,
        execution_payload={
            "course_id": course.id,
            "staff_id": staff.id,
            "assigned_as_role_id": role.id,
            "weekdays": weekdays,
        },
    )


ASSIGN_STAFF_TO_COURSE_TOOL = Tool(
    name="assign_staff_to_course",
    description=(
        "Assign or add staff to a course with a teaching role and session scope. "
        "Use when the user wants to assign, add, or put someone on a course roster. "
        "Requires course.manage_members. Use role_seniority MT or AT for main/assistant "
        "teacher, or course_role_query for named roles. Map natural-language weekdays to "
        "weekdays integers (0=Sun … 6=Sat); omit weekdays for all sessions. "
        "Never pass specific_event_ids — direct users to the member edit page instead. "
        "Always returns pending_confirmation."
    ),
    parameters=ASSIGN_STAFF_SCHEMA,
    run=run_assign_staff_to_course,
    exposure="write",
)
