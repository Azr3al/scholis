"""Service for enabling/configuring the per-org Telegram bot."""
from __future__ import annotations

import random
import secrets

from django.conf import settings
from django.db import transaction
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_telegram.client import TelegramClient

WEBHOOK_ALLOWED_UPDATES = [
    "message",
    "callback_query",
    "my_chat_member",
    "chat_join_request",
    "chat_member",
]

TELEGRAM_VALID_REACTION_EMOJIS = frozenset(
    {
        "❤",
        "👍",
        "👎",
        "🔥",
        "🥰",
        "👏",
        "😁",
        "🤔",
        "🤯",
        "😱",
        "🤬",
        "😢",
        "🎉",
        "🤩",
        "🤮",
        "💩",
        "🙏",
        "👌",
        "🕊",
        "🤡",
        "🥱",
        "🥴",
        "😍",
        "🐳",
        "❤‍🔥",
        "🌚",
        "🌭",
        "💯",
        "🤣",
        "⚡",
        "🍌",
        "🏆",
        "💔",
        "🤨",
        "😐",
        "🍓",
        "🍾",
        "💋",
        "🖕",
        "😈",
        "😴",
        "😭",
        "🤓",
        "👻",
        "👨‍💻",
        "👀",
        "🎃",
        "🙈",
        "😇",
        "😨",
        "🤝",
        "✍",
        "🤗",
        "🫡",
        "🎅",
        "🎄",
        "☃",
        "💅",
        "🤪",
        "🗿",
        "🆒",
        "💘",
        "🙉",
        "🦄",
        "😘",
        "💊",
        "🙊",
        "😎",
        "👾",
        "🤷‍♂",
        "🤷",
        "🤷‍♀",
        "😡",
    }
)

TELEGRAM_AI_ACK_REACTIONS = [
    emoji
    for emoji in ["👀", "✍", "⚡"]
    if emoji in TELEGRAM_VALID_REACTION_EMOJIS
]

TELEGRAM_AI_PENDING_MESSAGES = (
    "Looking up…",
    "One moment…",
    "Thinking…",
)


def pick_ai_pending_message() -> str:
    return random.choice(TELEGRAM_AI_PENDING_MESSAGES)


class TelegramWebhookError(ValueError):
    """Raised when webhook registration preconditions are not met."""


def _ensure_webhook_credentials(org: Organization) -> None:
    if not org.telegram_routing_key:
        org.telegram_routing_key = secrets.token_urlsafe(24)
    if not org.telegram_webhook_secret:
        org.telegram_webhook_secret = secrets.token_urlsafe(24)


def _build_webhook_url(org: Organization) -> str:
    return (
        f"{settings.TELEGRAM_WEBHOOK_BASE_URL.rstrip('/')}"
        f"/api/v1/telegram/webhook/{org.telegram_routing_key}/"
    )


def _register_webhook(org: Organization, client: TelegramClient | None = None) -> None:
    if client is None:
        client = TelegramClient(org)
    client.set_webhook(
        url=_build_webhook_url(org),
        secret_token=org.telegram_webhook_secret,
        allowed_updates=WEBHOOK_ALLOWED_UPDATES,
    )


def re_register_telegram_webhook(
    schema_name: str, *, rotate_credentials: bool = False
) -> Organization:
    """Re-sync Telegram webhook URL with stored credentials; optionally rotate keys."""
    with schema_context(get_public_schema_name()):
        org = Organization.objects.get(schema_name=schema_name)
        if not org.is_telegram_on:
            raise TelegramWebhookError(
                "Telegram is not enabled for this organization."
            )
        if not org.get_telegram_bot_token():
            raise TelegramWebhookError("No Telegram bot token is configured.")

        # Persist the (possibly rotated) credentials and tell Telegram about the
        # new webhook URL atomically: if setWebhook fails, roll back the DB so we
        # never strand the bot with a routing key Telegram does not know about.
        with transaction.atomic():
            if rotate_credentials:
                org.telegram_routing_key = secrets.token_urlsafe(24)
                org.telegram_webhook_secret = secrets.token_urlsafe(24)
            else:
                _ensure_webhook_credentials(org)
            org.save(
                update_fields=["telegram_routing_key", "telegram_webhook_secret"]
            )
            _register_webhook(org)
    return org


def configure_telegram(
    schema_name: str, *, bot_token: str, is_telegram_on: bool
) -> Organization:
    """Validate the token, persist config, (re)register the webhook."""
    with schema_context(get_public_schema_name()):
        org = Organization.objects.get(schema_name=schema_name)
        org.set_telegram_bot_token(bot_token)
        _ensure_webhook_credentials(org)
        org.is_telegram_on = is_telegram_on
        org.save()

        client = TelegramClient(org)
        me = client.get_me()
        org.telegram_bot_id = str(me["id"])
        org.telegram_bot_username = me.get("username")
        org.save()

        if is_telegram_on:
            _register_webhook(org, client)
        else:
            client.delete_webhook()
    return org
