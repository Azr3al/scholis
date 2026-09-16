"""Assemble multi-turn history for Telegram DM AI queries."""
from __future__ import annotations

from django.db.models import Q

from app_ai.tenant_context import resolve_max_context_turns
from app_telegram.models import TelegramAIExchange


def _exchange_to_turns(ex: TelegramAIExchange) -> list[dict[str, str]]:
    turns: list[dict[str, str]] = [{"role": "user", "text": ex.user_text}]
    if ex.bot_text:
        turns.append({"role": "model", "text": ex.bot_text})
    return turns


def _find_exchange_by_message_id(user, chat_id: int, message_id: int):
    return (
        TelegramAIExchange.objects.filter(user=user, chat_id=chat_id)
        .filter(
            Q(user_message_id=message_id) | Q(bot_message_id=message_id)
        )
        .first()
    )


def build_telegram_ai_history(*, message: dict, user, org) -> list[dict[str, str]]:
    chat_id = int((message.get("chat") or {}).get("id") or 0)
    n = resolve_max_context_turns(org)

    recent = list(
        TelegramAIExchange.objects.filter(user=user, chat_id=chat_id)
        .order_by("-created_at")[:n]
    )
    recent.reverse()

    ordered: list[TelegramAIExchange] = []
    seen_user_ids: set[int] = set()

    reply_to = message.get("reply_to_message") or {}
    anchor_id = reply_to.get("message_id")
    if anchor_id is not None:
        ex = _find_exchange_by_message_id(user, chat_id, int(anchor_id))
        if ex is not None and ex.user_message_id not in seen_user_ids:
            ordered.append(ex)
            seen_user_ids.add(ex.user_message_id)

    for ex in recent:
        if ex.user_message_id in seen_user_ids:
            continue
        ordered.append(ex)
        seen_user_ids.add(ex.user_message_id)
        if len(ordered) >= n:
            break

    ordered = ordered[-n:]
    history: list[dict[str, str]] = []
    for ex in ordered:
        history.extend(_exchange_to_turns(ex))
    return history
