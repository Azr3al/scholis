"""Shared WS new-message payload shape for course chat and DM."""

from __future__ import annotations

from typing import Any, Protocol, Type

from rest_framework import serializers


class _ChatMessageLike(Protocol):
    user_id: int
    user: Any


def build_message_broadcast_payload(
    message: _ChatMessageLike,
    *,
    serializer_class: Type[serializers.Serializer],
    client_message_id: str | None = None,
    include_thread_id: bool = False,
) -> dict[str, Any]:
    """WS-shaped payload for a chat row (course or DM)."""
    data = serializer_class(message).data
    payload: dict[str, Any] = {
        "id": data["id"],
        "user": {
            "id": message.user_id,
            "email": getattr(message.user, "email", ""),
            "name": getattr(message.user, "name", ""),
        },
        "content": data["content"],
        "created_at": data["created_at"],
    }
    if include_thread_id:
        payload["thread_id"] = data["thread"]
    if data.get("reply_to") is not None:
        payload["reply_to"] = data["reply_to"]
    if data.get("edited_at") is not None:
        payload["edited_at"] = data["edited_at"]
    if isinstance(client_message_id, str):
        payload["client_message_id"] = client_message_id
    payload["reactions"] = data.get("reactions") or []
    return payload
