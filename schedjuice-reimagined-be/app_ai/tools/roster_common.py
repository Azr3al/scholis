"""Shared helpers for roster write AI tools."""
from __future__ import annotations

from typing import Any

from app_ai.confirmation import save_write_confirmation
from app_ai.disambiguation import save_pending
from app_ai.links import course_member_edit_url, get_current_org, with_course_link
from app_ai.tools.resolve import resolve_accessible_course, resolve_user
from app_auth.models import User
from app_course.models import Event, UserCourse
from app_course.roster_event_weekdays import filter_events_for_weekdays


def _ambiguous_payload(status: str, resolved: dict[str, Any], query: str) -> dict[str, Any]:
    count = len(resolved.get("candidates") or [])
    field = status.replace("ambiguous_", "").replace("_", " ")
    return {
        "status": status,
        "query": query,
        "message": (
            f"{count} ambiguous {field} matches for {query!r}. "
            "Reply with A, B, C or state the full name."
        ),
        "candidates": resolved["candidates"],
    }


def _resolve_course(
    *,
    user: User,
    course_id: int | None,
    course_query: str | None,
    channel_key: str | None,
    tool_name: str,
    partial_args: dict[str, Any],
) -> dict[str, Any] | None:
    has_id = course_id is not None
    has_query = bool((course_query or "").strip())
    if has_id == has_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of course_id or course_query.",
        }

    resolved = resolve_accessible_course(
        user=user,
        course_id=course_id,
        query=course_query,
    )
    if resolved["status"] == "ambiguous":
        payload = _ambiguous_payload(
            "ambiguous_course",
            resolved,
            (course_query or "").strip(),
        )
        if channel_key:
            save_pending(
                user=user,
                channel_key=channel_key,
                tool_name=tool_name,
                pending_field="course",
                partial_args=partial_args,
                candidates=payload["candidates"],
            )
        return payload
    if resolved["status"] != "ok":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }
    return {"course": resolved["course"]}


def _resolve_member(
    *,
    actor: User,
    user_id: int | None,
    query: str | None,
    role: str,
    channel_key: str | None,
    tool_name: str,
    partial_args: dict[str, Any],
    ambiguous_status: str,
) -> dict[str, Any] | None:
    has_id = user_id is not None
    has_query = bool((query or "").strip())
    if has_id == has_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of user_id or query.",
        }

    resolved = resolve_user(actor=actor, user_id=user_id, query=query, role=role)
    if resolved["status"] == "ambiguous":
        payload = _ambiguous_payload(ambiguous_status, resolved, (query or "").strip())
        if channel_key:
            save_pending(
                user=actor,
                channel_key=channel_key,
                tool_name=tool_name,
                pending_field="subject",
                partial_args=partial_args,
                candidates=payload["candidates"],
            )
        return payload
    if resolved["status"] != "ok":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }
    return {"member": resolved["user"]}


def _pending_confirmation_response(
    *,
    user,
    channel_key: str | None,
    tool_name: str,
    action: str,
    summary: str,
    preview: dict[str, Any],
    execution_payload: dict[str, Any],
) -> dict[str, Any]:
    if not channel_key:
        return {
            "error": "validation_error",
            "message": "Roster writes require a channel context.",
        }
    save_write_confirmation(
        user=user,
        channel_key=channel_key,
        tool_name=tool_name,
        action=action,
        execution_payload=execution_payload,
        summary=summary,
        preview=preview,
    )
    return {
        "status": "pending_confirmation",
        "tool_name": tool_name,
        "summary": summary,
        "preview": preview,
        "message": "Please confirm to proceed.",
    }


def build_course_preview(course, *, org=None) -> dict[str, Any]:
    org = org or get_current_org()
    return with_course_link(
        {"id": course.id, "title": course.title, "code": course.code},
        org=org,
    )


def count_matching_sessions(*, course_id: int, weekdays: list[int] | None, tz_name: str) -> int:
    events = filter_events_for_weekdays(
        Event.objects.filter(course_id=course_id),
        weekdays=weekdays,
        tz_name=tz_name,
    )
    return len(events)


def student_already_enrolled(course_id: int, student_id: int) -> bool:
    return UserCourse.objects.filter(
        course_id=course_id,
        user_id=student_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists()


def staff_already_assigned(course_id: int, staff_id: int) -> bool:
    return UserCourse.objects.filter(
        course_id=course_id,
        user_id=staff_id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).exists()


def adhoc_not_supported(*, org, course_id: int) -> dict[str, Any]:
    return {
        "error": "adhoc_not_supported",
        "message": (
            "Assigning specific sessions by date is not supported via the assistant. "
            "Use the course member edit page instead."
        ),
        "member_edit_url": course_member_edit_url(org, course_id),
    }
