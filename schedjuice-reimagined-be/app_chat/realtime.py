"""Channel layer helpers for chat (HTTP + WS)."""

from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from tenant_schemas.utils import schema_context

from app_chat.models import ChatMessage
from app_chat.message_broadcast import build_message_broadcast_payload
from app_chat.serializers import DirectMessageSerializer

logger = logging.getLogger(__name__)


def chat_thread_group_name(tenant_schema: str, thread_id: int) -> str:
    """Canonical WebSocket room-group name for any unified chat thread."""
    return f"chat_thread_{tenant_schema}_{thread_id}"


def build_dm_message_broadcast_payload(
    message: ChatMessage, client_message_id: str | None = None
) -> dict[str, Any]:
    """WS-shaped payload for a DM row (matches ``ChatThreadConsumer`` broadcasts)."""
    return build_message_broadcast_payload(
        message,
        serializer_class=DirectMessageSerializer,
        client_message_id=client_message_id,
        include_thread_id=True,
    )


def broadcast_dm_chat_message(
    tenant_schema: str, thread_id: int, payload: dict[str, Any]
) -> None:
    """Notify a DM thread's room with the same envelope as websocket ``chat.message``."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            chat_thread_group_name(tenant_schema, thread_id),
            {"type": "chat.message", "message": payload},
        )
    except Exception:
        logger.exception(
            "broadcast_dm_chat_message failed tenant=%s thread=%s",
            tenant_schema,
            thread_id,
        )


def broadcast_dm_message_from_db(
    tenant_schema: str, message_id: int, client_message_id: str | None = None
) -> None:
    """Load a DM row in tenant schema and broadcast it to subscribers."""
    with schema_context(tenant_schema):
        message = (
            ChatMessage.objects.select_related(
                "thread", "user", "reply_to", "reply_to__user"
            )
            .prefetch_related("reactions", "reactions__created_by")
            .get(pk=message_id)
        )
        payload = build_dm_message_broadcast_payload(message, client_message_id)
    broadcast_dm_chat_message(tenant_schema, message.thread_id, payload)


def broadcast_to_chat_thread(
    tenant_schema: str, thread_id: int, payload: dict[str, Any]
) -> None:
    """Notify a chat thread's room with a ``chat.event`` side-channel event
    (edits, deletes, reactions, read receipts, typing)."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            chat_thread_group_name(tenant_schema, thread_id),
            {"type": "chat.event", "payload": payload},
        )
    except Exception:
        logger.exception(
            "broadcast_to_chat_thread failed tenant=%s thread=%s event=%s",
            tenant_schema,
            thread_id,
            payload.get("event"),
        )
