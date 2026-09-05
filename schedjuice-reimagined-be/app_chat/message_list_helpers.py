"""Shared HTTP list serialization for course chat and DM messages."""

from __future__ import annotations

from rest_framework.request import Request

from app_chat.attachment_batch import attachment_context_for_messages
from app_chat.message_cursor import (
    CURSOR_MESSAGE_PAGE_SIZE,
    DEFAULT_MESSAGE_LIST_SIZE,
    fetch_latest_messages,
    fetch_older_messages,
    parse_before_id,
    parse_message_list_size,
)


def serialize_message_rows(serializer_class, messages, request: Request, **extra_context):
    context = {
        "request": request,
        **attachment_context_for_messages(messages),
        **extra_context,
    }
    return serializer_class(messages, many=True, context=context)


def fetch_thread_messages_page(request: Request, thread, serializer_class) -> tuple[list, bool]:
    """Cursor-paginated message fetch shared by every thread-scoped message list endpoint."""
    from app_chat.models import ChatMessage

    queryset = (
        ChatMessage.objects.filter(thread_id=thread.id)
        .select_related("user", "thread", "reply_to", "reply_to__user")
        .prefetch_related("reactions", "reactions__created_by")
    )
    before_id = parse_before_id(request)
    if before_id is not None:
        size = parse_message_list_size(request, default=CURSOR_MESSAGE_PAGE_SIZE)
        rows = fetch_older_messages(queryset, before_id, size)
    else:
        size = parse_message_list_size(request, default=DEFAULT_MESSAGE_LIST_SIZE)
        rows = fetch_latest_messages(queryset, size)
    serialized = serialize_message_rows(serializer_class, rows, request)
    return serialized.data, len(rows) == size
