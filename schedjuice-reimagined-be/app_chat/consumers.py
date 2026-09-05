"""
Course chat WebSocket consumer.
"""
import time

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from tenant_schemas.utils import schema_context

from app_chat.course_chat_list_cache import invalidate_course_chat_list_cache
from app_chat.models import ChatMessage, ChatThread, ChatThreadKind
from app_chat.notifications import (
    queue_course_chat_message_pushes,
)
from app_chat.services import (
    can_access_thread,
    mention_user_ids_from_content_mentions,
    tenant_for_schema_name,
    validate_chat_attachment_refs,
    validate_chat_content_payload,
    validate_mention_user_ids,
    create_dm_message as create_dm_message_service,
    create_group_message as create_group_message_service,
)
from app_chat.realtime_presence import (
    clear_presence,
    set_typing,
    should_broadcast_typing_event,
    touch_presence,
)
from app_chat.message_broadcast import build_message_broadcast_payload
from app_chat.realtime import chat_thread_group_name
from app_chat.serializers import CourseChatMessageSerializer, DirectMessageSerializer


# Rate limit: max messages per user per course per window
CHAT_RATE_LIMIT_MESSAGES = 30
CHAT_RATE_LIMIT_WINDOW_SECONDS = 60


def check_rate_limit(user_id, thread_id):
    """Return (allowed: bool, retry_after_seconds: int)."""
    key = f"chat_rate:{thread_id}:{user_id}"
    now = int(time.time())
    window_start = now - CHAT_RATE_LIMIT_WINDOW_SECONDS

    existing = cache.get(key) or []
    existing = [t for t in existing if t > window_start]

    if len(existing) >= CHAT_RATE_LIMIT_MESSAGES:
        retry_after = int(existing[0]) + CHAT_RATE_LIMIT_WINDOW_SECONDS - now
        return False, max(1, retry_after)

    existing.append(now)
    cache.set(key, existing, timeout=CHAT_RATE_LIMIT_WINDOW_SECONDS + 10)
    return True, 0


def _create_message_on_thread_sync(
    thread, user, content, schema_name, reply_to_id=None
):
    """Assumes the caller is already inside ``schema_context(schema_name)``."""
    if thread.kind == ChatThreadKind.COURSE:
        reply_to = None
        if reply_to_id is not None:
            try:
                rid = int(reply_to_id)
            except (TypeError, ValueError):
                return None, "reply_to_invalid"
            parent = ChatMessage.objects.filter(pk=rid, thread_id=thread.id).first()
            if parent is None:
                return None, "reply_not_found"
            reply_to = parent
        try:
            normalized = validate_chat_content_payload(content)
            validate_chat_attachment_refs(user, normalized.get("attachments", []))
            validate_mention_user_ids(
                thread.course_id,
                mention_user_ids_from_content_mentions(normalized.get("mentions", [])),
            )
        except DjangoValidationError:
            return None, "mentions_invalid"
        msg = ChatMessage.objects.create(
            thread=thread, user=user, content=normalized, reply_to=reply_to
        )
        msg = ChatMessage.objects.select_related("thread", "user").get(pk=msg.pk)
        queue_course_chat_message_pushes(msg)
        invalidate_course_chat_list_cache(schema_name, thread.course_id)
        return msg, None

    if thread.kind == ChatThreadKind.GROUP:
        return create_group_message_service(
            thread.id, user, content, reply_to_id=reply_to_id
        )

    tenant = tenant_for_schema_name(schema_name)
    return create_dm_message_service(
        thread.id, user, content, reply_to_id=reply_to_id, tenant=tenant
    )


@database_sync_to_async
def create_message_on_thread(thread_id, user, content, schema_name, reply_to_id=None):
    with schema_context(schema_name):
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None:
            return None, "thread_not_found"
        return _create_message_on_thread_sync(
            thread, user, content, schema_name, reply_to_id=reply_to_id
        )


@database_sync_to_async
def check_thread_access(thread_id, user, schema_name):
    if not user or user.is_anonymous:
        return None, False
    with schema_context(schema_name):
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None:
            return None, False
        return thread, can_access_thread(user, thread)


@database_sync_to_async
def build_new_thread_message_broadcast_payload(
    message_id, schema_name, client_message_id=None
):
    with schema_context(schema_name):
        message = (
            ChatMessage.objects.select_related(
                "thread", "user", "reply_to", "reply_to__user"
            )
            .prefetch_related("reactions", "reactions__created_by")
            .get(pk=message_id)
        )
        if message.thread.kind == ChatThreadKind.COURSE:
            return build_message_broadcast_payload(
                message,
                serializer_class=CourseChatMessageSerializer,
                client_message_id=client_message_id,
            )
        return build_message_broadcast_payload(
            message,
            serializer_class=DirectMessageSerializer,
            client_message_id=client_message_id,
            include_thread_id=True,
        )


class _BaseChatThreadConsumer(AsyncJsonWebsocketConsumer):
    """Shared connect/receive/broadcast logic for any unified chat thread."""

    async def _resolve_thread_id(self) -> int | None:
        raise NotImplementedError

    async def connect(self):
        self.tenant_schema = self.scope.get("tenant_schema")
        self.user = self.scope.get("user")

        if not self.tenant_schema:
            await self.close(code=4001)
            return
        if not self.user or isinstance(self.user, AnonymousUser):
            await self.close(code=4002)
            return

        thread_id = await self._resolve_thread_id()
        if thread_id is None:
            await self.close(code=4004)
            return

        thread, allowed = await check_thread_access(
            thread_id, self.user, self.tenant_schema
        )
        if not allowed:
            await self.close(code=4003)
            return

        self.thread_id = thread_id
        self.thread_kind = thread.kind
        self.room_group_name = chat_thread_group_name(
            self.tenant_schema, self.thread_id
        )

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        if self.thread_kind == ChatThreadKind.COURSE:
            await database_sync_to_async(touch_presence)(
                self.tenant_schema, self.thread_id, self.user.id
            )

    async def disconnect(self, close_code):
        if (
            getattr(self, "thread_kind", None) == ChatThreadKind.COURSE
            and getattr(self, "tenant_schema", None)
            and getattr(self, "user", None)
            and not isinstance(self.user, AnonymousUser)
        ):
            await database_sync_to_async(clear_presence)(
                self.tenant_schema, self.thread_id, self.user.id
            )
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(
                self.room_group_name, self.channel_name
            )

    async def receive_json(self, content):
        if not content or not isinstance(content, dict):
            await self.send_json({"error": "invalid_payload"})
            return

        msg_type = content.get("type") or "message"
        course_like = self.thread_kind == ChatThreadKind.COURSE

        if msg_type == "heartbeat":
            if course_like:
                await database_sync_to_async(touch_presence)(
                    self.tenant_schema, self.thread_id, self.user.id
                )
            return

        if msg_type == "typing":
            if not course_like:
                return
            typing_active = bool(content.get("typing"))
            await database_sync_to_async(set_typing)(
                self.tenant_schema, self.thread_id, self.user.id, typing_active
            )
            if typing_active:
                allowed = await database_sync_to_async(should_broadcast_typing_event)(
                    self.tenant_schema, self.thread_id, self.user.id
                )
                if not allowed:
                    return
            name = getattr(self.user, "name", "") or ""
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "chat.event",
                    "payload": {
                        "event": "typing",
                        "user_id": self.user.id,
                        "name": name,
                        "typing": typing_active,
                    },
                },
            )
            return

        raw_content = content.get("content")
        if raw_content is None:
            await self.send_json({"error": "content_required"})
            return
        if not isinstance(raw_content, dict):
            await self.send_json({"error": "content_must_be_object"})
            return

        client_message_id = content.get("client_message_id")
        if client_message_id is not None and not isinstance(client_message_id, str):
            await self.send_json({"error": "client_message_id_must_be_string"})
            return
        if client_message_id is not None and len(client_message_id) > 64:
            await self.send_json({"error": "client_message_id_too_long"})
            return

        reply_to_id = content.get("reply_to_id")

        if course_like:
            allowed, retry_after = await database_sync_to_async(
                lambda: check_rate_limit(self.user.id, self.thread_id)
            )()
            if not allowed:
                await self.send_json(
                    {"error": "rate_limited", "retry_after_seconds": retry_after}
                )
                return

        message, err = await create_message_on_thread(
            self.thread_id,
            self.user,
            raw_content,
            self.tenant_schema,
            reply_to_id=reply_to_id,
        )
        if err:
            await self.send_json({"error": err})
            return

        payload = await build_new_thread_message_broadcast_payload(
            message.id, self.tenant_schema, client_message_id=client_message_id
        )
        await self.channel_layer.group_send(
            self.room_group_name, {"type": "chat.message", "message": payload}
        )

    async def chat_message(self, event):
        """Handle broadcast from group_send (new message)."""
        await self.send_json(event["message"])

    async def chat_event(self, event):
        """Side-channel events (edit, delete, typing, read receipts, reactions)."""
        await self.send_json(event["payload"])


class ChatThreadConsumer(_BaseChatThreadConsumer):
    """New unified consumer. URL: ws/chat/threads/<thread_id>/?token=<jwt>&tenant=<schema>"""

    async def _resolve_thread_id(self):
        return self.scope["url_route"]["kwargs"]["thread_id"]
