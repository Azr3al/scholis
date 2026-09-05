"""Pending A/B/C disambiguation for AI write tools."""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from app_ai.pending_turn import PendingTurnResult
from app_ai.tools.intent import is_cancel_reply, parse_disambiguation_reply
from app_telegram.models import AIDisambiguationPending

__all__ = [
    "PendingTurnResult",
    "save_pending",
    "get_active_pending",
    "clear_pending",
    "try_resolve_pending_turn",
]

DEFAULT_TTL = timedelta(minutes=10)


def save_pending(
    *,
    user,
    channel_key: str,
    tool_name: str,
    pending_field: str,
    partial_args: dict[str, Any],
    candidates: list[dict[str, Any]],
    ttl: timedelta = DEFAULT_TTL,
) -> AIDisambiguationPending:
    expires_at = timezone.now() + ttl
    row, _ = AIDisambiguationPending.objects.update_or_create(
        user=user,
        channel_key=channel_key,
        defaults={
            "tool_name": tool_name,
            "pending_field": pending_field,
            "partial_args": partial_args,
            "candidates": candidates,
            "expires_at": expires_at,
        },
    )
    return row


def get_active_pending(*, user, channel_key: str) -> AIDisambiguationPending | None:
    row = AIDisambiguationPending.objects.filter(
        user=user,
        channel_key=channel_key,
    ).first()
    if row is None:
        return None
    if row.expires_at <= timezone.now():
        row.delete()
        return None
    return row


def clear_pending(*, user, channel_key: str) -> None:
    AIDisambiguationPending.objects.filter(user=user, channel_key=channel_key).delete()


def _build_reminder(row: AIDisambiguationPending) -> str:
    from app_ai.messages import (
        build_disambiguation_message,
        build_role_required_message,
        resolve_message_tone,
    )

    tone = resolve_message_tone(row.user)
    partial = row.partial_args or {}
    if row.pending_field == "course_role":
        return build_role_required_message(
            staff_name=partial.get("_staff_name") or "this staff member",
            course_title=partial.get("_course_title") or "this course",
            candidates=row.candidates or [],
            tone=tone,
        )

    labels = {
        "subject": "person",
        "point_type": "point type",
        "course": "course",
        "course_role": "course role",
    }
    field_label = labels.get(row.pending_field, row.pending_field.replace("_", " "))
    query = (
        partial.get("staff_query")
        or partial.get("student_query")
        or partial.get("course_query")
        or partial.get("point_type_query")
        or partial.get("query")
        or ""
    )
    return build_disambiguation_message(
        field_label=field_label,
        query=query,
        candidates=row.candidates or [],
        tone=tone,
    )


def try_resolve_pending_turn(
    *,
    prompt: str,
    user,
    channel_key: str,
    org=None,
) -> PendingTurnResult | None:
    row = get_active_pending(user=user, channel_key=channel_key)
    if row is None:
        return None

    if row.pending_field == "switch_confirm":
        return None

    if is_cancel_reply(prompt):
        clear_pending(user=user, channel_key=channel_key)
        return PendingTurnResult(cancelled=True)

    picked_id = parse_disambiguation_reply(prompt, candidates=row.candidates or [])
    if picked_id is None:
        return PendingTurnResult(reminder=_build_reminder(row))

    args = dict(row.partial_args or {})
    if row.pending_field == "subject":
        args["user_id"] = picked_id
        args.pop("query", None)
        args.pop("student_query", None)
        args.pop("staff_query", None)
    elif row.pending_field == "point_type":
        args["point_type_id"] = picked_id
        args.pop("point_type_query", None)
    elif row.pending_field == "course":
        args["course_id"] = picked_id
        args.pop("course_query", None)
    elif row.pending_field == "course_role":
        args["course_role_id"] = picked_id
        args.pop("course_role_query", None)
        args.pop("role_seniority", None)
    else:
        return PendingTurnResult(reminder=_build_reminder(row))

    from app_ai.tools.registry import get_tool

    tool = get_tool(row.tool_name)
    result = tool.run(args, user, channel_key=channel_key, org=org)

    ambiguous_statuses = {
        "ambiguous_subject",
        "ambiguous_point_type",
        "ambiguous_course",
        "ambiguous_course_role",
    }
    if result.get("status") in ambiguous_statuses:
        return PendingTurnResult(reminder=result.get("message") or _build_reminder(row))

    if result.get("error"):
        clear_pending(user=user, channel_key=channel_key)
        return PendingTurnResult(executed=True, payload=result)

    clear_pending(user=user, channel_key=channel_key)
    return PendingTurnResult(executed=True, payload=result)
