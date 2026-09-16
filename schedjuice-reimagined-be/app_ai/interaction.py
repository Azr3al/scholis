"""Resolve deterministic interaction copy after AI tool runs."""
from __future__ import annotations

from app_ai.confirmation import get_active_write_confirmation
from app_ai.disambiguation import get_active_pending
from app_ai.messages import (
    build_confirm_message,
    build_disambiguation_message,
    build_role_required_message,
    build_switch_prompt,
    resolve_message_tone,
)


def resolve_interaction_message(*, user, channel_key: str) -> str | None:
    tone = resolve_message_tone(user)
    pending = get_active_write_confirmation(user=user, channel_key=channel_key)
    if pending is not None:
        preview = pending.preview or {}
        staff = preview.get("staff") or {}
        student = preview.get("student") or {}
        course = preview.get("course") or {}
        role = preview.get("role") or {}
        return build_confirm_message(
            action=pending.action,
            tone=tone,
            staff_name=staff.get("name", ""),
            student_name=student.get("name", ""),
            course_title=course.get("title", ""),
            role_name=role.get("name", ""),
            weekdays=preview.get("weekdays"),
            weekday_labels=preview.get("weekday_labels"),
            session_count=preview.get("session_count"),
        )

    row = get_active_pending(user=user, channel_key=channel_key)
    if row is None:
        return None

    labels = {
        "subject": "person",
        "course": "course",
        "course_role": "role",
        "point_type": "point type",
    }
    if row.pending_field == "switch_confirm":
        partial = row.partial_args or {}
        return build_switch_prompt(
            prior_summary=partial.get("prior_summary") or "the pending roster change",
            new_summary=partial.get("new_summary") or "proceed with your new request",
            tone=tone,
        )

    if row.pending_field == "course_role":
        partial = row.partial_args or {}
        staff_name = partial.get("_staff_name") or "this staff member"
        course_title = partial.get("_course_title") or "this course"
        return build_role_required_message(
            staff_name=staff_name,
            course_title=course_title,
            candidates=row.candidates or [],
            tone=tone,
        )

    partial = row.partial_args or {}
    query = (
        partial.get("staff_query")
        or partial.get("student_query")
        or partial.get("course_query")
        or partial.get("point_type_query")
        or partial.get("query")
        or ""
    )
    return build_disambiguation_message(
        field_label=labels.get(row.pending_field, row.pending_field.replace("_", " ")),
        query=query,
        candidates=row.candidates or [],
        tone=tone,
    )
