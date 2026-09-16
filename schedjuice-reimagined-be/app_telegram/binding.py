"""Account binding: issue link tokens, handle `/start <token>`."""
from __future__ import annotations

import logging
import random
import secrets
from datetime import timedelta

from django.utils import timezone

from app_auth.models import User
from app_rbac.resolution import resolve_for_roles
from app_telegram.client import TelegramClient
from app_telegram.config import TELEGRAM_AI_ACK_REACTIONS, pick_ai_pending_message
from app_telegram.models import TelegramLinkToken

logger = logging.getLogger(__name__)
TOKEN_TTL_MINUTES = 15


def issue_link_token(user, bot_username: str) -> str:
    """Create a one-time token and return the t.me deep link."""
    token = secrets.token_urlsafe(24)
    TelegramLinkToken.objects.create(
        user=user,
        token=token,
        expires_at=timezone.now() + timedelta(minutes=TOKEN_TTL_MINUTES),
    )
    return f"https://t.me/{bot_username}?start={token}"


TELEGRAM_BINDING_FIELDS = (
    "telegram_user_id",
    "telegram_chat_id",
    "telegram_username",
    "telegram_linked_at",
)


def clear_user_telegram_binding(user: User) -> None:
    """Clear all Telegram account binding fields on a user."""
    user.telegram_user_id = None
    user.telegram_chat_id = None
    user.telegram_username = None
    user.telegram_linked_at = None
    user.save(update_fields=list(TELEGRAM_BINDING_FIELDS))


def handle_message(tenant, message: dict) -> None:
    """Dispatch private-chat messages."""
    text = (message.get("text") or "").strip()
    chat = message.get("chat") or {}
    if chat.get("type") != "private":
        return

    if text.startswith("/start"):
        _handle_start(tenant, message, text, chat)
        return

    if not text or text.startswith("/"):
        return

    _handle_free_text_query(tenant, message, text, chat)


def _handle_start(tenant, message: dict, text: str, chat: dict) -> None:
    parts = text.split(maxsplit=1)
    if len(parts) != 2:
        return
    payload = parts[1].strip()

    from app_telegram.bot_login import handle_login_command, parse_login_start_payload

    login_code = parse_login_start_payload(payload)
    if login_code is not None:
        handle_login_command(tenant, message, login_code)
        return

    _handle_start_link(tenant, message, text, chat, payload)


def _handle_start_link(tenant, message: dict, text: str, chat: dict, token_value: str) -> None:
    tok = (
        TelegramLinkToken.objects.filter(token=token_value)
        .select_related("user")
        .first()
    )
    if tok is None or not tok.is_active():
        _reply(
            tenant,
            chat["id"],
            f"This link is invalid or expired. Generate a new one from your {tenant.name} profile.",
        )
        return

    from_user = message.get("from") or {}
    tg_user_id = from_user.get("id")

    User.objects.filter(telegram_user_id=tg_user_id).exclude(id=tok.user.id).update(
        telegram_user_id=None,
        telegram_chat_id=None,
        telegram_username=None,
        telegram_linked_at=None,
    )

    user = tok.user
    user.telegram_user_id = tg_user_id
    user.telegram_chat_id = chat["id"]
    user.telegram_username = from_user.get("username")
    user.telegram_linked_at = timezone.now()
    user.save(
        update_fields=[
            "telegram_user_id",
            "telegram_chat_id",
            "telegram_username",
            "telegram_linked_at",
        ]
    )

    tok.consumed_at = timezone.now()
    tok.save(update_fields=["consumed_at"])

    _reply(
        tenant,
        chat["id"],
        f"Linked to {tenant.name}. You'll receive course updates here.",
    )


def _handle_free_text_query(tenant, message: dict, text: str, chat: dict) -> None:
    from_user = message.get("from") or {}
    tg_user_id = from_user.get("id")
    user = User.objects.filter(telegram_user_id=tg_user_id).first()
    if user is None:
        _reply(
            tenant,
            chat["id"],
            f"Your Telegram isn't linked to {tenant.name} yet. Sign in to link your account.",
        )
        return

    perms = resolve_for_roles(user.roles or [])
    if "ai.telegram_use" not in perms:
        _reply(
            tenant,
            chat["id"],
            f"You don't have access to the {tenant.name} assistant.",
        )
        return

    if not getattr(tenant, "is_ai_enabled", True):
        _reply(
            tenant,
            chat["id"],
            "AI assistant is disabled for your school.",
        )
        return

    from app_ai.guardrails import quick_heuristic_check
    from app_ai.guardrails.messages import blocked_message
    from app_telegram.context import build_telegram_ai_history
    from app_telegram.tasks import run_ai_query

    history = build_telegram_ai_history(message=message, user=user, org=tenant)
    quick = quick_heuristic_check(text, history=history)
    if quick is not None:
        _reply(tenant, chat["id"], blocked_message(tenant))
        return

    user_message_id = message.get("message_id")
    is_private = chat.get("type") == "private"
    ack_message_id = None
    try:
        client = TelegramClient(tenant)
        if user_message_id is not None:
            try:
                emoji = random.choice(TELEGRAM_AI_ACK_REACTIONS)
                client.set_message_reaction(chat["id"], user_message_id, emoji)
            except Exception:
                logger.warning("telegram: ack reaction failed", exc_info=True)
        sent = client.send_message(
            chat["id"],
            pick_ai_pending_message(),
            parse_mode=None,
            reply_to_message_id=None if is_private else user_message_id,
        )
        if is_private:
            ack_message_id = (sent or {}).get("message_id")
    except Exception:
        logger.warning("telegram: pending ack message failed", exc_info=True)

    run_ai_query.delay(
        user.id,
        tenant.schema_name,
        chat_id=chat["id"],
        prompt=text,
        history=history,
        user_message_id=user_message_id,
        ack_message_id=ack_message_id,
        channel_key=f"telegram:{chat['id']}",
    )


def _reply(tenant, chat_id: int, text: str) -> None:
    try:
        TelegramClient(tenant).send_message(chat_id, text)
    except Exception:
        logger.exception("telegram: failed to send binding reply")
