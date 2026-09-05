"""Pending confirm/cancel for AI roster write tools."""
from __future__ import annotations

import re
from datetime import timedelta
from typing import Any

from django.utils import timezone

from app_ai.pending_turn import PendingTurnResult
from app_ai.messages import (
    build_confirm_success,
    build_pending_reminder,
    resolve_message_tone,
)
from app_ai.tools.intent import is_cancel_reply
from app_course.models import CourseMembershipEvent
from app_course.roster_writes import execute_roster_action
from app_telegram.models import AIPendingWriteConfirmation

WEB_ROSTER_CONFIRM_ENABLED = False
DEFAULT_TTL = timedelta(minutes=10)

_CONFIRM_WORDS = frozenset({"confirm", "yes", "y"})
_ROLE_SENIORITY_PATTERN = re.compile(
    r"\b(?:as\s+)?(?:at|assistant\s+teacher|mt|main\s+teacher)\b",
    re.IGNORECASE,
)


def infer_action_source(channel_key: str) -> str:
    if channel_key.startswith("telegram:"):
        return CourseMembershipEvent.Source.TELEGRAM_BOT
    return CourseMembershipEvent.Source.WEB_AI


def clear_all_roster_pending(*, user, channel_key: str) -> None:
    from app_ai.disambiguation import clear_pending

    clear_write_confirmation(user=user, channel_key=channel_key)
    clear_pending(user=user, channel_key=channel_key)


def save_write_confirmation(
    *,
    user,
    channel_key: str,
    tool_name: str,
    action: str,
    execution_payload: dict[str, Any],
    summary: str,
    preview: dict[str, Any],
    ttl: timedelta = DEFAULT_TTL,
) -> AIPendingWriteConfirmation:
    from app_ai.disambiguation import clear_pending

    if channel_key:
        clear_pending(user=user, channel_key=channel_key)
    expires_at = timezone.now() + ttl
    row, _ = AIPendingWriteConfirmation.objects.update_or_create(
        user=user,
        channel_key=channel_key,
        defaults={
            "tool_name": tool_name,
            "action": action,
            "execution_payload": execution_payload,
            "summary": summary,
            "preview": preview,
            "expires_at": expires_at,
            "telegram_chat_id": None,
            "telegram_message_id": None,
        },
    )
    return row


def get_active_write_confirmation(
    *, user, channel_key: str
) -> AIPendingWriteConfirmation | None:
    row = AIPendingWriteConfirmation.objects.filter(
        user=user,
        channel_key=channel_key,
    ).first()
    if row is None:
        return None
    if row.expires_at <= timezone.now():
        row.delete()
        return None
    return row


def clear_write_confirmation(*, user, channel_key: str) -> None:
    AIPendingWriteConfirmation.objects.filter(user=user, channel_key=channel_key).delete()


def execute_pending_write_confirmation(
    *,
    pending: AIPendingWriteConfirmation,
    actor,
    tenant,
    source: str,
) -> dict[str, Any]:
    return execute_roster_action(
        action=pending.action,
        actor=actor,
        tenant=tenant,
        payload=pending.execution_payload,
        source=source,
    )


def _edit_telegram_confirm_message(*, tenant, pending, text: str) -> None:
    if not pending.telegram_chat_id or not pending.telegram_message_id:
        return
    from app_telegram.client import TelegramClient
    from app_telegram.confirm_ui import EMPTY_INLINE_KEYBOARD

    TelegramClient(tenant).edit_message_text(
        pending.telegram_chat_id,
        pending.telegram_message_id,
        text,
        parse_mode=None,
        reply_markup=EMPTY_INLINE_KEYBOARD,
    )


def _parse_role_override(prompt: str) -> dict[str, Any] | None:
    normalized = (prompt or "").strip().lower()
    if normalized in _CONFIRM_WORDS or is_cancel_reply(prompt):
        return None
    if not _ROLE_SENIORITY_PATTERN.search(normalized):
        return None
    if re.search(r"\bat\b", normalized) or "assistant" in normalized:
        return {"role_seniority": "AT", "course_role_id": None}
    if re.search(r"\bmt\b", normalized) or "main teacher" in normalized:
        return {"role_seniority": "MT", "course_role_id": None}
    return None


def _try_role_override_on_pending_assign(
    *,
    prompt: str,
    user,
    channel_key: str,
    org,
    pending: AIPendingWriteConfirmation,
) -> PendingTurnResult | None:
    if pending.action != "assign_staff":
        return None
    role_args = _parse_role_override(prompt)
    if role_args is None:
        return None

    payload = dict(pending.execution_payload or {})
    preview = pending.preview or {}
    staff_id = payload.get("staff_id")
    course_id = payload.get("course_id")
    if staff_id is None or course_id is None:
        return None

    telegram_chat_id = pending.telegram_chat_id
    telegram_message_id = pending.telegram_message_id
    clear_write_confirmation(user=user, channel_key=channel_key)

    from app_ai.tools.assign_staff_to_course import run_assign_staff_to_course

    args: dict[str, Any] = {
        "course_id": course_id,
        "user_id": staff_id,
        "weekdays": preview.get("weekdays"),
    }
    args.update(role_args)
    args.pop("course_role_id", None)
    if role_args.get("role_seniority"):
        args.pop("course_role_query", None)

    result = run_assign_staff_to_course(
        args,
        user,
        channel_key=channel_key,
        org=org,
    )
    if result.get("status") == "pending_confirmation":
        new_pending = get_active_write_confirmation(user=user, channel_key=channel_key)
        if new_pending is not None and telegram_chat_id and telegram_message_id:
            new_pending.telegram_chat_id = telegram_chat_id
            new_pending.telegram_message_id = telegram_message_id
            new_pending.save(update_fields=["telegram_chat_id", "telegram_message_id"])
    return PendingTurnResult(executed=True, payload=result)


def try_resolve_pending_confirmation(
    *,
    prompt: str,
    user,
    channel_key: str,
    org,
) -> PendingTurnResult | None:
    row = get_active_write_confirmation(user=user, channel_key=channel_key)
    if row is None:
        return None

    if is_cancel_reply(prompt):
        clear_all_roster_pending(user=user, channel_key=channel_key)
        return PendingTurnResult(cancelled=True)

    role_override = _try_role_override_on_pending_assign(
        prompt=prompt,
        user=user,
        channel_key=channel_key,
        org=org,
        pending=row,
    )
    if role_override is not None:
        return role_override

    row = get_active_write_confirmation(user=user, channel_key=channel_key)
    if row is None:
        return None

    if not channel_key.startswith("telegram:") and not WEB_ROSTER_CONFIRM_ENABLED:
        return PendingTurnResult(
            reminder=(
                f"Roster change awaiting confirmation: {row.summary} "
                "Web confirm is not enabled yet; use Telegram or the member edit page."
            )
        )

    normalized = (prompt or "").strip().lower()
    if normalized in _CONFIRM_WORDS:
        tone = resolve_message_tone(user)
        action = row.action
        telegram_pending = row
        result = execute_pending_write_confirmation(
            pending=row,
            actor=user,
            tenant=org,
            source=infer_action_source(channel_key),
        )
        if channel_key.startswith("telegram:") and result.get("status") == "ok":
            _edit_telegram_confirm_message(
                tenant=org,
                pending=telegram_pending,
                text=build_confirm_success(action=action, result=result, tone=tone),
            )
        clear_all_roster_pending(user=user, channel_key=channel_key)
        return PendingTurnResult(executed=True, payload=result)

    tone = resolve_message_tone(user)
    return PendingTurnResult(
        reminder=build_pending_reminder(
            summary=row.summary,
            channel_key=channel_key,
            tone=tone,
        )
    )
