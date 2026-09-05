"""Chat message reactions — canonical aggregation and toggle logic."""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from app_auth.models import User
from app_chat.models import ChatMessage, ChatMessageReaction

CHAT_REACTION_EMOJIS: tuple[str, ...] = ("👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀")


def validate_reaction_emoji(emoji: str) -> str:
    if not isinstance(emoji, str) or not emoji.strip():
        raise ValidationError("emoji is required")
    emoji = emoji.strip()
    if emoji not in CHAT_REACTION_EMOJIS:
        raise ValidationError("emoji not allowed")
    return emoji


def _aggregate_reaction_rows(
    rows: list[ChatMessageReaction],
    current_user_id: int | None,
) -> list[dict[str, Any]]:
    by_emoji: dict[str, list[int]] = {}
    for row in rows:
        by_emoji.setdefault(row.emoji, []).append(row.created_by_id)
    result: list[dict[str, Any]] = []
    for emoji in CHAT_REACTION_EMOJIS:
        user_ids = by_emoji.get(emoji)
        if not user_ids:
            continue
        result.append(
            {
                "emoji": emoji,
                "count": len(user_ids),
                "user_ids": user_ids,
                "reacted_by_me": current_user_id is not None
                and current_user_id in user_ids,
            }
        )
    return result


def aggregate_reactions(
    reaction_rows: list[ChatMessageReaction],
    current_user_id: int | None,
) -> list[dict[str, Any]]:
    """Aggregate from explicit reaction rows (tests / ad-hoc)."""
    return _aggregate_reaction_rows(list(reaction_rows), current_user_id)


def aggregate_reactions_for_message(
    message: ChatMessage,
    current_user_id: int | None,
) -> list[dict[str, Any]]:
    """Build aggregated reaction list from prefetched ``message.reactions``."""
    rows = getattr(message, "_prefetched_objects_cache", {}).get("reactions")
    if rows is None:
        rows = list(message.reactions.all())
    return _aggregate_reaction_rows(list(rows), current_user_id)


@transaction.atomic
def toggle_chat_reaction(
    user: User,
    *,
    emoji: str,
    message: ChatMessage,
) -> list[dict[str, Any]]:
    """
    Toggle reaction for the current user on a message.
    One reaction per user per message; same emoji removes, different emoji replaces.
    """
    emoji = validate_reaction_emoji(emoji)

    if message.deleted_at is not None:
        raise ValidationError("Cannot react to a deleted message")

    existing = ChatMessageReaction.objects.filter(created_by=user, message=message).first()
    if existing is not None:
        if existing.emoji == emoji:
            existing.delete()
        else:
            existing.emoji = emoji
            existing.save(update_fields=["emoji", "updated_at"])
    else:
        ChatMessageReaction.objects.create(created_by=user, emoji=emoji, message=message)

    refreshed = (
        ChatMessage.objects.filter(pk=message.pk).prefetch_related("reactions").first()
    )
    assert refreshed is not None
    return aggregate_reactions_for_message(refreshed, user.id)
