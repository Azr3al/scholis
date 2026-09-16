"""Telegram inline confirm/cancel callbacks for AI roster writes."""
from __future__ import annotations

import logging

from django.utils import timezone

from app_ai.confirmation import (
    clear_all_roster_pending,
    execute_pending_write_confirmation,
    infer_action_source,
)
from app_ai.messages import (
    build_confirm_cancelled,
    build_confirm_expired,
    build_confirm_success,
    resolve_message_tone,
)
from app_auth.models import User
from app_telegram.client import TelegramClient
from app_telegram.confirm_ui import EMPTY_INLINE_KEYBOARD
from app_telegram.models import AIPendingWriteConfirmation

logger = logging.getLogger(__name__)


def handle_callback_query(tenant, payload: dict) -> None:
    data = (payload.get("data") or "").strip()
    if not data.startswith("ai:"):
        return

    parts = data.split(":")
    if len(parts) != 3:
        return

    _, action, pending_id_str = parts
    try:
        pending_id = int(pending_id_str)
    except ValueError:
        return

    from_user = payload.get("from") or {}
    tg_user_id = from_user.get("id")
    message = payload.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    message_id = message.get("message_id")
    callback_query_id = payload.get("id")

    user = User.objects.filter(telegram_user_id=tg_user_id).first()
    client = TelegramClient(tenant)

    if user is None:
        if callback_query_id:
            client.answer_callback_query(str(callback_query_id), text="Not authorized.")
        return

    pending = AIPendingWriteConfirmation.objects.filter(id=pending_id).first()
    channel_key = f"telegram:{chat_id}" if chat_id is not None else ""

    if pending is None or pending.user_id != user.id:
        if callback_query_id:
            client.answer_callback_query(str(callback_query_id), text="Not authorized.")
        return

    tone = resolve_message_tone(user)

    if pending.expires_at <= timezone.now():
        clear_all_roster_pending(user=user, channel_key=pending.channel_key)
        if callback_query_id:
            client.answer_callback_query(str(callback_query_id), text="Expired.")
        if chat_id is not None and message_id is not None:
            client.edit_message_text(
                chat_id,
                message_id,
                build_confirm_expired(tone),
                parse_mode=None,
                reply_markup=EMPTY_INLINE_KEYBOARD,
            )
        return

    if action == "cancel":
        clear_all_roster_pending(user=user, channel_key=pending.channel_key)
        if callback_query_id:
            client.answer_callback_query(str(callback_query_id), text="Cancelled.")
        if chat_id is not None and message_id is not None:
            client.edit_message_text(
                chat_id,
                message_id,
                build_confirm_cancelled(tone),
                parse_mode=None,
                reply_markup=EMPTY_INLINE_KEYBOARD,
            )
        return

    if action != "confirm":
        return

    pending_action = pending.action
    result = execute_pending_write_confirmation(
        pending=pending,
        actor=user,
        tenant=tenant,
        source=infer_action_source(channel_key or pending.channel_key),
    )
    clear_all_roster_pending(user=user, channel_key=pending.channel_key)

    if callback_query_id:
        if result.get("status") == "ok":
            client.answer_callback_query(str(callback_query_id), text="Done.")
        else:
            client.answer_callback_query(
                str(callback_query_id),
                text=result.get("message", "Failed.")[:180],
                show_alert=True,
            )

    if chat_id is not None and message_id is not None:
        if result.get("status") == "ok":
            text = build_confirm_success(
                action=pending_action,
                result=result,
                tone=tone,
            )
        else:
            text = result.get("message") or "Could not complete that roster change."
        client.edit_message_text(
            chat_id,
            message_id,
            text,
            parse_mode=None,
            reply_markup=EMPTY_INLINE_KEYBOARD,
        )
