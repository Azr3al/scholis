from rest_framework import serializers

from utilitas.serializers import BaseModelSerializer

from app_auth.models import User
from app_chat.message_preview import build_message_preview
from app_chat.models import ChatMessage, ChatReadState, ChatThread, ChatThreadKind
from app_chat.reaction_helpers import aggregate_reactions_for_message


def _content_with_attachment_urls(content, attachment_rows_by_id=None):
    if not isinstance(content, dict):
        return content
    attachments = content.get("attachments")
    if not isinstance(attachments, list) or not attachments:
        return content

    attachment_ids = []
    for item in attachments:
        if isinstance(item, dict) and item.get("attachment_id") is not None:
            try:
                attachment_id = int(item["attachment_id"])
            except (TypeError, ValueError):
                continue
            attachment_ids.append(attachment_id)
    if not attachment_ids:
        return content

    from app_attachment.models import Attachment
    from app_attachment.views import get_presigned_url

    if attachment_rows_by_id is None:
        rows = {
            row.id: row
            for row in Attachment.objects.filter(
                id__in=attachment_ids, is_deleted=False
            )
        }
    else:
        rows = attachment_rows_by_id
    next_content = {**content}
    next_attachments = []
    for item in attachments:
        if not isinstance(item, dict):
            next_attachments.append(item)
            continue
        next_item = {**item}
        try:
            attachment_id = int(next_item.get("attachment_id"))
        except (TypeError, ValueError):
            next_attachments.append(next_item)
            continue
        row = rows.get(attachment_id)
        if row is not None:
            next_item.setdefault("name", row.filename)
            next_item.setdefault("mime_type", row.file_type)
            next_item.setdefault("size_bytes", row.size or 0)
            if row.data:
                next_item["download_url"] = get_presigned_url(
                    row.data,
                    row.filename,
                    row.file_type,
                )
            elif row.public_data:
                next_item["download_url"] = row.public_data.url
        next_attachments.append(next_item)
    next_content["attachments"] = next_attachments
    return next_content


class BaseChatMessageSerializer(BaseModelSerializer):
    """Shared reply preview, reactions, and tombstone content for course + DM messages."""

    reply_to = serializers.SerializerMethodField(read_only=True)
    reactions = serializers.SerializerMethodField(read_only=True)

    def _attachment_rows_by_id(self):
        return self.context.get("attachment_rows_by_id")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        attachment_rows = self._attachment_rows_by_id()
        if instance.deleted_at is not None:
            data["content"] = {"text": "", "mentions": [], "attachments": []}
            data["reactions"] = []
        else:
            data["content"] = _content_with_attachment_urls(
                data.get("content"), attachment_rows_by_id=attachment_rows
            )
        return data

    def get_reply_to(self, obj):
        parent = obj.reply_to
        if parent is None:
            return None
        user = getattr(parent, "user", None)
        name = getattr(user, "name", "") if user is not None else ""
        attachment_rows = self._attachment_rows_by_id()
        return {
            "id": parent.id,
            "user": {"id": parent.user_id, "name": name},
            "content": None
            if parent.deleted_at
            else _content_with_attachment_urls(
                parent.content, attachment_rows_by_id=attachment_rows
            ),
            "deleted_at": parent.deleted_at.isoformat() if parent.deleted_at else None,
        }

    def get_reactions(self, obj):
        if obj.deleted_at is not None:
            return []
        request = self.context.get("request")
        viewer = User.get_user_from_request(request) if request else None
        current_user_id = viewer.id if viewer else None
        return aggregate_reactions_for_message(obj, current_user_id)


class ChatMessageSerializer(BaseChatMessageSerializer):
    """Base serializer for a unified ChatMessage row (exposes raw `thread`)."""

    class Meta:
        model = ChatMessage
        fields = (
            "id",
            "created_at",
            "updated_at",
            "thread",
            "user",
            "content",
            "edited_at",
            "deleted_at",
            "deleted_by",
            "reply_to",
            "reactions",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "thread",
            "user",
            "edited_at",
            "deleted_at",
            "deleted_by",
            "reply_to",
            "reactions",
        )
        expandable_fields = {
            "user": ("app_auth.serializers.UserSerializer",),
        }


class CourseChatMessageSerializer(ChatMessageSerializer):
    """
    Course chat API contract: exposes `course` (the owning course id) instead of
    the raw `thread` id, preserving the pre-unification response shape.
    """

    course = serializers.SerializerMethodField(read_only=True)

    class Meta(ChatMessageSerializer.Meta):
        fields = tuple(
            f for f in ChatMessageSerializer.Meta.fields if f != "thread"
        ) + ("course",)
        read_only_fields = fields
        expandable_fields = {
            "user": ("app_auth.serializers.UserSerializer",),
            "course": ("app_course.serializers.CourseSerializer",),
        }

    def get_course(self, obj):
        return obj.thread.course_id


class DirectMessageSerializer(ChatMessageSerializer):
    """DM API contract: identical to the base serializer (already exposes `thread`)."""


class ChatThreadMessageSerializer(BaseChatMessageSerializer):
    """New unified message contract: nested self-describing ``thread`` object."""

    thread = serializers.SerializerMethodField(read_only=True)

    class Meta(ChatMessageSerializer.Meta):
        fields = tuple(
            f for f in ChatMessageSerializer.Meta.fields if f != "thread"
        ) + ("thread",)
        read_only_fields = fields

    def get_thread(self, obj):
        return {
            "id": obj.thread_id,
            "kind": obj.thread.kind,
            "course": obj.thread.course_id,
        }


class ChatReadStateSerializer(BaseModelSerializer):
    class Meta:
        model = ChatReadState
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "user",
            "thread",
        )


class ChatThreadSerializer(BaseModelSerializer):
    """Unified thread contract for DM and student–teacher group threads."""

    participants = serializers.SerializerMethodField(read_only=True)
    last_message = serializers.SerializerMethodField(read_only=True)
    unread_count = serializers.SerializerMethodField(read_only=True)
    course = serializers.SerializerMethodField(read_only=True)
    display_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ChatThread
        fields = (
            "id",
            "kind",
            "created_at",
            "updated_at",
            "participants",
            "last_message",
            "unread_count",
            "course",
            "display_title",
            "anchor_user_id",
        )
        read_only_fields = fields

    def _profile_image_url(self, user):
        request = self.context.get("request")
        if not getattr(user, "profile_image", None):
            return None
        url = user.profile_image.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_participants(self, obj):
        users = [p.user for p in obj.participants.all()]
        is_group = obj.kind == ChatThreadKind.GROUP
        out = []
        for u in users:
            row = {
                "id": u.id,
                "name": getattr(u, "name", "") or "",
                "email": getattr(u, "email", "") or "",
                "profile_image": self._profile_image_url(u),
            }
            if is_group:
                row["role_label"] = "Student" if u.is_student() else "Teacher"
                row["roles"] = list(u.roles or [])
            out.append(row)
        return out

    def get_last_message(self, obj):
        mid = getattr(obj, "latest_message_id", None)
        if mid is None:
            return None
        msg = getattr(obj, "_latest_message", None)
        if msg is None:
            latest_map = self.context.get("latest_messages_by_id") or {}
            msg = latest_map.get(mid)
        if msg is None:
            return None
        return build_message_preview(msg, ChatThreadMessageSerializer, self.context)

    def get_unread_count(self, obj):
        return getattr(obj, "_dm_unread_count", 0)

    def get_course(self, obj):
        if not obj.course_id:
            return None
        course = getattr(obj, "course", None)
        if course is None:
            return {"id": obj.course_id, "title": ""}
        return {"id": course.id, "title": getattr(course, "title", "") or ""}

    def get_display_title(self, obj):
        if obj.kind != ChatThreadKind.GROUP:
            return None
        viewer = self.context.get("viewer")
        if viewer is None:
            return None
        from app_chat.student_teacher_group_chat import group_thread_display_title

        return group_thread_display_title(obj, viewer)
