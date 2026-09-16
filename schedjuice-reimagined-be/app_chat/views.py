from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from django.db.models import OuterRef, Q, Subquery
from django.utils import timezone
import logging
from rest_framework import status
from rest_framework.request import Request
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BrowsableAPIRenderer
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

from app_auth.models import User
from app_chat import serializers
from app_chat.course_chat_list_cache import invalidate_course_chat_list_cache
from app_chat.message_preview import build_message_preview
from app_chat.message_list_helpers import fetch_thread_messages_page
from app_chat.models import ChatMessage, ChatReadState, ChatThread, ChatThreadKind
from app_chat.reaction_toggle_helpers import handle_chat_reaction_toggle_post
from app_chat.realtime import (
    broadcast_dm_message_from_db,
    broadcast_to_chat_thread,
)
from app_chat.realtime_presence import online_user_ids
from app_chat.services import (
    bulk_thread_unread_counts,
    can_access_thread,
    can_create_dm_thread,
    can_moderate_chat,
    can_send_dm_in_thread,
    create_dm_message,
    create_group_message,
    get_or_create_course_chat_thread,
    is_course_member,
    list_dm_threads_for_user,
    start_dm_conversation,
    student_dm_contact_user_id,
    students_dm_admins_only_enabled,
    mention_user_ids_from_content_mentions,
    validate_chat_attachment_refs,
    validate_chat_content_payload,
    validate_mention_user_ids,
)
from app_chat.student_teacher_group_chat import (
    list_student_teacher_group_threads_for_user,
    student_teacher_group_chat_enabled,
)
from app_course.models import UserCourse
from app_rbac.views import RBACPermission
from utilitas.renderer import CustomRenderer
from utilitas.views import BaseView

logger = logging.getLogger(__name__)


_CHAT_PARTICIPATE = {
    "GET": "chat.participate",
    "POST": "chat.participate",
    "PATCH": "chat.participate",
    "PUT": "chat.participate",
    "DELETE": "chat.participate",
}


class ChatApiView(APIView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    required_permissions = _CHAT_PARTICIPATE
    renderer_classes = [CustomRenderer, BrowsableAPIRenderer]


class CourseChatLastMessagesBatchView(ChatApiView):
    """GET last-message preview + real unread count for many courses in one call.

    Replaces the mobile chat list's previous N sequential per-course requests
    (see `fetchLastChatMessagesBatch` removal in the Phase 3 mobile migration
    plan). ``course_ids`` not backed by an active `UserCourse` membership for
    the requesting user are silently dropped rather than causing a 403, since
    this is a list-preview endpoint over a caller-supplied id set.
    """

    def get(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )

        tenant = getattr(request, "tenant", None)
        from app_chat.student_teacher_group_chat import course_wide_chat_enabled

        if tenant and not course_wide_chat_enabled(tenant):
            return BaseView.send_response(
                False, "success", {"data": {}}, status=status.HTTP_200_OK
            )

        raw_ids = (request.query_params.get("course_ids") or "").strip()
        if not raw_ids:
            return BaseView.send_response(
                False, "success", {"data": {}}, status=status.HTTP_200_OK
            )
        try:
            course_ids = [int(x) for x in raw_ids.split(",") if x.strip()]
        except ValueError:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "course_ids must be a comma-separated list of integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not course_ids:
            return BaseView.send_response(
                False, "success", {"data": {}}, status=status.HTTP_200_OK
            )

        member_course_ids = set(
            UserCourse.objects.filter(user=user, course_id__in=course_ids).values_list(
                "course_id", flat=True
            )
        )
        allowed_ids = [cid for cid in course_ids if cid in member_course_ids]
        if not allowed_ids:
            return BaseView.send_response(
                False, "success", {"data": {}}, status=status.HTTP_200_OK
            )

        threads_by_course = {
            t.course_id: t
            for t in ChatThread.objects.filter(
                kind=ChatThreadKind.COURSE, course_id__in=allowed_ids
            )
        }

        thread_ids = [t.id for t in threads_by_course.values()]
        latest_id_by_thread_id: dict[int, int | None] = {}
        latest_messages_by_id: dict[int, ChatMessage] = {}
        unread_counts: dict[int, int] = {}

        if thread_ids:
            latest_subq = (
                ChatMessage.objects.filter(thread_id=OuterRef("pk"))
                .order_by("-created_at", "-id")
                .values("id")[:1]
            )
            latest_id_by_thread_id = dict(
                ChatThread.objects.filter(pk__in=thread_ids)
                .annotate(latest_message_id=Subquery(latest_subq))
                .values_list("id", "latest_message_id")
            )
            latest_ids = [mid for mid in latest_id_by_thread_id.values() if mid]
            if latest_ids:
                latest_messages_by_id = {
                    m.id: m
                    for m in ChatMessage.objects.filter(pk__in=latest_ids)
                    .select_related("user", "thread")
                    .prefetch_related("reactions")
                }
            unread_counts = bulk_thread_unread_counts(thread_ids, user.id)

        data: dict[str, dict] = {}
        for course_id in allowed_ids:
            thread = threads_by_course.get(course_id)
            if thread is None:
                data[str(course_id)] = {"last_message": None, "unread_count": 0}
                continue
            latest_id = latest_id_by_thread_id.get(thread.id)
            msg = latest_messages_by_id.get(latest_id) if latest_id else None
            data[str(course_id)] = {
                "last_message": (
                    None
                    if msg is None
                    else build_message_preview(
                        msg,
                        serializers.ChatThreadMessageSerializer,
                        {"request": request},
                    )
                ),
                "unread_count": unread_counts.get(thread.id, 0),
            }
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )


class ChatThreadResolveView(ChatApiView):
    """Get-or-create the ChatThread for a course."""

    def _resolve(self, request: Request, course_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        if not is_course_member(user, course_id):
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You are not a member of this course"},
                status=403,
            )
        tenant = getattr(request, "tenant", None)
        from app_chat.student_teacher_group_chat import course_wide_chat_enabled

        if tenant and not course_wide_chat_enabled(tenant):
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "Course chat is disabled for this organization"},
                status=403,
            )
        thread = get_or_create_course_chat_thread(course_id)
        return BaseView.send_response(
            False,
            "success",
            {
                "data": {
                    "id": thread.id,
                    "kind": thread.kind,
                    "course": thread.course_id,
                }
            },
            status=status.HTTP_200_OK,
        )

    def get(self, request: Request, course_id: int):
        return self._resolve(request, course_id)

    def post(self, request: Request, course_id: int):
        return self._resolve(request, course_id)


class ChatThreadMessageListCreateView(ChatApiView):
    """GET history / POST create for any unified chat thread, by thread_id."""

    def get(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None:
            return BaseView.send_response(
                True, "not_found", {"details": "Thread not found"}, status=404
            )
        if not can_access_thread(user, thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )

        results, has_more = fetch_thread_messages_page(
            request, thread, serializers.ChatThreadMessageSerializer
        )
        return BaseView.send_response(
            False,
            "success",
            {"data": {"results": results, "has_more": has_more}},
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None:
            return BaseView.send_response(
                True, "not_found", {"details": "Thread not found"}, status=404
            )
        if thread.kind == ChatThreadKind.COURSE:
            return BaseView.send_response(
                True,
                "method_not_allowed",
                {"details": "POST not allowed; send messages via WebSocket."},
                status=status.HTTP_405_METHOD_NOT_ALLOWED,
            )
        if not can_access_thread(user, thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        if thread.kind == ChatThreadKind.DM and not can_send_dm_in_thread(
            user, thread, tenant=getattr(request, "tenant", None)
        ):
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "Direct messages are not allowed for this conversation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reply_to_id = request.data.get("reply_to_id")
        if thread.kind == ChatThreadKind.GROUP:
            row, err = create_group_message(
                thread_id, user, request.data.get("content"), reply_to_id=reply_to_id
            )
        else:
            row, err = create_dm_message(
                thread_id,
                user,
                request.data.get("content"),
                reply_to_id=reply_to_id,
                tenant=getattr(request, "tenant", None),
            )
        if err:
            status_code = (
                status.HTTP_403_FORBIDDEN
                if err == "forbidden"
                else status.HTTP_400_BAD_REQUEST
            )
            err_key = "forbidden" if err == "forbidden" else "bad_request"
            return BaseView.send_response(
                True, err_key, {"details": err}, status=status_code
            )

        serialized = serializers.ChatThreadMessageSerializer(
            row, context={"request": request}
        ).data
        cid = request.data.get("client_message_id")
        cid_str = cid if isinstance(cid, str) else None
        try:
            broadcast_dm_message_from_db(connection.schema_name, row.id, cid_str)
        except Exception:
            logger.exception(
                "broadcast_dm_message_from_db failed message_id=%s", row.id
            )
        return BaseView.send_response(
            False, "created", {"data": serialized}, status=status.HTTP_201_CREATED
        )


class ChatThreadMessageDetailView(ChatApiView):
    """PATCH (edit own) or DELETE (soft-delete) a message on any unified thread."""

    def patch(self, request: Request, thread_id: int, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        message = (
            ChatMessage.objects.filter(pk=message_id, thread_id=thread_id)
            .select_related("thread", "user", "reply_to", "reply_to__user")
            .first()
        )
        if message is None or not can_access_thread(user, message.thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        if message.user_id != user.id or message.deleted_at is not None:
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You cannot edit this message"},
                status=403,
            )
        try:
            normalized_content = validate_chat_content_payload(
                request.data.get("content")
            )
            validate_chat_attachment_refs(
                user, normalized_content.get("attachments", [])
            )
            if message.thread.kind == ChatThreadKind.COURSE:
                validate_mention_user_ids(
                    message.thread.course_id,
                    mention_user_ids_from_content_mentions(
                        normalized_content["mentions"]
                    ),
                )
        except DjangoValidationError as e:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": e.message_dict if hasattr(e, "message_dict") else str(e)},
                status=400,
            )
        message.content = normalized_content
        message.edited_at = timezone.now()
        message.save(update_fields=["content", "edited_at", "updated_at"])
        data = serializers.ChatThreadMessageSerializer(
            message, context={"request": request}
        ).data
        if message.thread.kind == ChatThreadKind.COURSE:
            invalidate_course_chat_list_cache(
                connection.schema_name, message.thread.course_id
            )
            broadcast_to_chat_thread(
                connection.schema_name,
                message.thread_id,
                {"event": "message_edited", "data": data},
            )
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )

    def delete(self, request: Request, thread_id: int, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        message = (
            ChatMessage.objects.filter(pk=message_id, thread_id=thread_id)
            .select_related("thread", "user")
            .first()
        )
        if message is None or not can_access_thread(user, message.thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        if message.deleted_at is not None:
            return BaseView.send_response(
                False,
                "success",
                {
                    "data": {
                        "id": message.id,
                        "deleted_at": message.deleted_at.isoformat(),
                        "deleted_by_id": message.deleted_by_id,
                    }
                },
                status=status.HTTP_200_OK,
            )
        if message.user_id == user.id:
            message.deleted_at = timezone.now()
            message.deleted_by = None
        elif message.thread.kind == ChatThreadKind.COURSE and can_moderate_chat(
            user, message.thread.course_id
        ):
            message.deleted_at = timezone.now()
            message.deleted_by = user
        else:
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You cannot delete this message"},
                status=403,
            )
        message.save(update_fields=["deleted_at", "deleted_by", "updated_at"])
        data = {
            "id": message.id,
            "deleted_at": message.deleted_at.isoformat(),
            "deleted_by_id": message.deleted_by_id,
        }
        if message.thread.kind == ChatThreadKind.COURSE:
            broadcast_to_chat_thread(
                connection.schema_name,
                message.thread_id,
                {"event": "message_deleted", "data": data},
            )
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )


class ChatThreadMessageReactionToggleView(ChatApiView):
    """POST toggle reaction on a message on any unified thread."""

    def post(self, request: Request, thread_id: int, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        message = (
            ChatMessage.objects.filter(pk=message_id, thread_id=thread_id)
            .select_related("thread")
            .prefetch_related("reactions", "reactions__created_by")
            .first()
        )
        if message is None or not can_access_thread(user, message.thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )

        def _broadcast(reactions):
            payload = {
                "event": "reaction_changed",
                "data": {"message_id": message.id, "reactions": reactions},
            }
            broadcast_to_chat_thread(connection.schema_name, message.thread_id, payload)

        return handle_chat_reaction_toggle_post(
            request,
            message=message,
            toggle_kwargs={"message": message},
            broadcast=_broadcast,
        )


class ChatThreadReadStatePutView(ChatApiView):
    """PUT monotonic read cursor for the current user on any unified thread."""

    def put(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None or not can_access_thread(user, thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )

        message_id = request.data.get("last_read_message_id")
        if message_id is not None:
            try:
                message_id = int(message_id)
            except (TypeError, ValueError):
                return BaseView.send_response(
                    True,
                    "bad_request",
                    {"details": "last_read_message_id must be an integer or null"},
                    status=400,
                )
        existing = ChatReadState.objects.filter(user=user, thread=thread).first()
        if (
            message_id is not None
            and existing is not None
            and existing.last_read_message_id is not None
            and message_id < existing.last_read_message_id
        ):
            return BaseView.send_response(
                True,
                "bad_request",
                {
                    "details": "last_read_message_id cannot move backwards",
                    "current_last_read_message_id": existing.last_read_message_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        state, _ = ChatReadState.objects.get_or_create(user=user, thread=thread)
        state.last_read_message_id = message_id
        state.last_read_at = timezone.now()
        state.save(update_fields=["last_read_message_id", "last_read_at", "updated_at"])
        data = serializers.ChatReadStateSerializer(
            state, context={"request": request}
        ).data
        if thread.kind == ChatThreadKind.COURSE:
            broadcast_to_chat_thread(
                connection.schema_name,
                thread.id,
                {
                    "event": "read_receipt",
                    "user_id": user.id,
                    "last_read_message_id": message_id,
                },
            )
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )


class ChatThreadPresenceGetView(ChatApiView):
    """GET online member user ids for any unified thread."""

    def get(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None or not can_access_thread(user, thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        ids = online_user_ids(connection.schema_name, thread_id)
        return BaseView.send_response(
            False,
            "success",
            {"data": {"online_user_ids": ids}},
            status=status.HTTP_200_OK,
        )


class ChatThreadListCreateView(ChatApiView):
    """Generic thread list/create. kind=dm and kind=group are supported."""

    def get(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        kind = request.query_params.get("kind")
        tenant = getattr(request, "tenant", None)
        if kind == ChatThreadKind.DM:
            threads = list_dm_threads_for_user(user)
        elif kind == ChatThreadKind.GROUP:
            if not student_teacher_group_chat_enabled(tenant):
                threads = []
            else:
                threads = list_student_teacher_group_threads_for_user(user)
        else:
            return BaseView.send_response(
                True,
                "bad_request",
                {
                    "details": "Unsupported or missing 'kind'; use 'dm' or 'group'."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = serializers.ChatThreadSerializer(
            threads, many=True, context={"request": request, "viewer": user}
        ).data
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )

    def post(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        kind = request.data.get("kind")
        if kind == ChatThreadKind.COURSE:
            return BaseView.send_response(
                True,
                "bad_request",
                {
                    "details": "Course threads are created via GET/POST "
                    "courses/<course_id>/chat/thread, not this endpoint."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if kind != ChatThreadKind.DM:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "Unsupported 'kind'; only 'dm' is supported today."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant_user_id = request.data.get("participant_user_id")
        content = request.data.get("content")
        if content is None:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "content is required to start a conversation"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            participant_user_id = int(participant_user_id)
        except (TypeError, ValueError):
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "participant_user_id must be an integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reply_to_id = request.data.get("reply_to_id")
        try:
            thread, message, created = start_dm_conversation(
                user,
                participant_user_id,
                content,
                reply_to_id=reply_to_id,
                tenant=getattr(request, "tenant", None),
            )
        except DjangoValidationError as e:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": e.message_dict if hasattr(e, "message_dict") else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        thread = (
            ChatThread.objects.prefetch_related("participants__user")
            .filter(pk=thread.pk)
            .first()
        )
        thread_data = serializers.ChatThreadSerializer(
            thread, context={"request": request, "viewer": user}
        ).data
        message_data = serializers.ChatThreadMessageSerializer(
            message, context={"request": request}
        ).data
        cid = request.data.get("client_message_id")
        cid_str = cid if isinstance(cid, str) else None
        try:
            broadcast_dm_message_from_db(connection.schema_name, message.id, cid_str)
        except Exception:
            logger.exception(
                "broadcast_dm_message_from_db failed message_id=%s", message.id
            )
        return BaseView.send_response(
            False,
            "created",
            {
                "data": {
                    "thread": thread_data,
                    "message": message_data,
                    "created": created,
                }
            },
            status=status.HTTP_201_CREATED,
        )


class DirectMessageEligibleUsersView(ChatApiView):
    """Paginated tenant user search for DM compose (policy-filtered)."""

    def get(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )

        q = (request.query_params.get("q") or "").strip()
        try:
            page = max(1, int(request.query_params.get("page") or 1))
        except (TypeError, ValueError):
            page = 1
        try:
            size = int(request.query_params.get("size") or 20)
        except (TypeError, ValueError):
            size = 20
        size = max(1, min(size, 100))

        tenant = getattr(request, "tenant", None)
        if (
            tenant
            and user.is_student()
            and students_dm_admins_only_enabled(tenant)
        ):
            contact_id = student_dm_contact_user_id(tenant)
            if contact_id is None:
                eligible = []
            else:
                qs = User.objects.filter(pk=contact_id)
                if q:
                    qs = qs.filter(Q(name__icontains=q) | Q(email__icontains=q))
                eligible = [
                    u
                    for u in qs
                    if can_create_dm_thread(user, u, tenant=tenant)
                ]
        else:
            qs = User.objects.exclude(pk=user.pk).order_by("name", "email")
            if q:
                qs = qs.filter(Q(name__icontains=q) | Q(email__icontains=q))
            eligible = [
                u for u in qs if can_create_dm_thread(user, u, tenant=tenant)
            ]
        total = len(eligible)
        start = (page - 1) * size
        page_users = eligible[start : start + size]

        def row(u: User):
            img = None
            if u.profile_image:
                img = request.build_absolute_uri(u.profile_image.url)
            return {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "profile_image": img,
            }

        return BaseView.send_response(
            False,
            "success",
            {
                "data": {
                    "results": [row(u) for u in page_users],
                    "page": page,
                    "size": size,
                    "count": total,
                }
            },
            status=status.HTTP_200_OK,
        )
