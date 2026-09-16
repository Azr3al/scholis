"""Shared 'last message' preview shape used by thread list/preview payloads.

Reused by ``ChatThreadSerializer.get_last_message`` and
``CourseChatLastMessagesBatchView`` so both surfaces agree on the shape
of a message preview without copy-pasting the same four-field dict.
"""

from __future__ import annotations

from typing import Any


def build_message_preview(message, serializer_class, context: dict) -> dict[str, Any]:
    data = serializer_class(message, context=context).data
    return {
        "id": data["id"],
        "created_at": data["created_at"],
        "user": {
            "id": message.user_id,
            "name": getattr(message.user, "name", "") or "",
        },
        "content": data["content"],
    }
