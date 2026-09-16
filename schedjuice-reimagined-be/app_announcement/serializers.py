import logging
from datetime import datetime, timezone as dt_timezone

from django.db import transaction
from rest_framework import serializers

from app_announcement import models
from app_announcement.models import PostType
from app_announcement.tasks import send_announcement_push_notifications_task
from app_auth.models import User
from app_utility_notifications.tenant_time import (
    event_instant_in_timezone,
    get_tenant_today_ymd,
)
from utilitas.serializers import BaseModelSerializer
from app_microsoft.announcement_helpers import schedule_announcement_teams_sync

logger = logging.getLogger(__name__)

_CREATED_AT_OVERRIDE_UNSET = object()


class AnnouncementSerializer(BaseModelSerializer):
    posted_on = serializers.DateField(required=False, write_only=True)

    class Meta:
        model = models.Announcement
        fields = "__all__"
        expandable_fields = {
            "course": ("app_course.serializers.CourseSerializer",),
            "created_by": ("app_auth.serializers.UserSerializer",),
            "comments": ("app_announcement.serializers.CommentSerializer", {"many": True}),
            "reactions": ("app_announcement.serializers.ReactionSerializer", {"many": True}),
            "attachments": ("app_announcement.serializers.AnnouncementAttachmentSerializer", {"many": True}),
        }
        extra_kwargs = {
            "created_by": {"required": False},
            "microsoft_teams_status": {"read_only": True},
            "microsoft_teams_error": {"read_only": True},
            "microsoft_teams_synced_at": {"read_only": True},
            "microsoft_teams_message_id": {"read_only": True},
            "microsoft_teams_message_ids": {"read_only": True},
            "microsoft_teams_team_id": {"read_only": True},
            "microsoft_teams_channel_id": {"read_only": True},
            "microsoft_teams_posted_as": {"read_only": True},
            "microsoft_teams_posted_by": {"read_only": True},
        }

    def _get_tenant_tz(self) -> str:
        tenant = getattr(self.context.get("request"), "tenant", None)
        return (getattr(tenant, "timezone", None) or "UTC").strip() or "UTC"

    def _resolve_posted_on_created_at(self, posted_on):
        tenant_tz = self._get_tenant_tz()
        now = datetime.now(dt_timezone.utc)
        posted_ymd = posted_on.isoformat()
        if posted_ymd == get_tenant_today_ymd(tenant_tz, now):
            return None
        return event_instant_in_timezone(posted_ymd, "12:00", tenant_tz)

    def _apply_created_at_override(self, instance):
        override = getattr(self, "_created_at_override", _CREATED_AT_OVERRIDE_UNSET)
        if override is _CREATED_AT_OVERRIDE_UNSET or override is None:
            return instance
        instance.created_at = override
        instance.save(update_fields=["created_at"])
        return instance

    def validate(self, attrs):
        posted_on = attrs.pop("posted_on", serializers.empty)
        posted_on_provided = posted_on is not serializers.empty
        if not posted_on_provided:
            posted_on = None

        attrs = super().validate(attrs)
        post_type = attrs.get(
            "post_type",
            getattr(self.instance, "post_type", PostType.ANNOUNCEMENT),
        )
        title = attrs.get("title", getattr(self.instance, "title", None))
        finished_unit = attrs.get(
            "finished_unit",
            getattr(self.instance, "finished_unit", None),
        )

        if post_type == PostType.ANNOUNCEMENT:
            if not (title or "").strip():
                raise serializers.ValidationError(
                    {"title": "Title is required for announcement posts."}
                )
            if finished_unit is not None:
                raise serializers.ValidationError(
                    {"finished_unit": "Must be empty for announcement posts."}
                )
        elif post_type == PostType.DAILY_LESSON:
            if finished_unit is not None and finished_unit < 1:
                raise serializers.ValidationError(
                    {"finished_unit": "Finished unit must be a positive integer."}
                )
            attrs["title"] = None
        else:
            raise serializers.ValidationError(
                {"post_type": f"Unsupported post type: {post_type}"}
            )

        if posted_on_provided:
            self._created_at_override = self._resolve_posted_on_created_at(posted_on)
        else:
            self._created_at_override = _CREATED_AT_OVERRIDE_UNSET
        return attrs

    def _schedule_expo_announcement_push(self, instance, tenant=None):
        if tenant is None:
            tenant = getattr(self.context.get("request"), "tenant", None)
        if not tenant:
            return
        ann_id = instance.pk
        schema_name = tenant.schema_name

        def enqueue():
            send_announcement_push_notifications_task.delay(ann_id, schema_name)

        transaction.on_commit(enqueue)

    def _schedule_teams_sync(self, instance):
        if self.context.get("skip_teams_schedule"):
            return
        tenant = getattr(self.context.get("request"), "tenant", None)
        if not tenant:
            logger.info(
                "Announcement %s: skipping Teams send - no tenant in request context",
                instance.id,
            )
            return
        if not instance.send_to_microsoft:
            logger.debug(
                "Announcement %s: skipping Teams send - send_to_microsoft=False",
                instance.id,
            )
            return
        logger.info(
            "Announcement %s: scheduling Teams send async (schema=%s)",
            instance.id,
            tenant.schema_name,
        )
        schedule_announcement_teams_sync(instance, tenant)

    def _resolve_acting_user(self):
        request = self.context.get("request")
        if request is None:
            return None
        user = getattr(request, "user", None)
        if isinstance(user, User):
            return user
        if user is not None:
            return User.objects.filter(email=user.id).first()
        return None

    def _acting_user_is_author(self, instance) -> bool:
        if instance.created_by_id is None:
            return True
        actor = self._resolve_acting_user()
        return actor is not None and actor.id == instance.created_by_id

    def create(self, validated_data):
        validated_data["created_by"] = self._resolve_acting_user()
        instance = super().create(validated_data)
        self._apply_created_at_override(instance)
        tenant = getattr(self.context.get("request"), "tenant", None)
        self._schedule_expo_announcement_push(instance, tenant)
        self._schedule_teams_sync(instance)
        if (
            tenant
            and instance.send_to_microsoft
            and instance.send_to_telegram
            and not self.context.get("skip_teams_schedule")
        ):
            from app_telegram.announcement import send_announcement_to_telegram

            send_announcement_to_telegram.delay(instance.id, tenant.schema_name)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        self._apply_created_at_override(instance)
        self._schedule_expo_announcement_push(instance)
        if self._acting_user_is_author(instance):
            self._schedule_teams_sync(instance)
        else:
            logger.info(
                "Announcement %s: Teams sync skipped - editor is not the original author",
                instance.id,
            )
        return instance


class CommentSerializer(BaseModelSerializer):
    class Meta:
        model = models.Comment
        fields = "__all__"
        expandable_fields = {
            "created_by": ("app_auth.serializers.UserSerializer",),
            "announcement": ("app_announcement.serializers.AnnouncementSerializer",),
            "reactions": ("app_announcement.serializers.ReactionSerializer", {"many": True}),
        }
        extra_kwargs = {
            "created_by": {"required": False},
        }

    def create(self, validated_data):
        validated_data["created_by"] = User.objects.filter(
            email=self.context["request"].user.id
        ).first()
        return super().create(validated_data)


class ReactionSerializer(BaseModelSerializer):
    class Meta:
        model = models.Reaction
        fields = "__all__"
        expandable_fields = {
            "created_by": ("app_auth.serializers.UserSerializer",),
            "announcement": ("app_announcement.serializers.AnnouncementSerializer",),
            "comment": ("app_announcement.serializers.CommentSerializer",),
        }
        extra_kwargs = {
            "created_by": {"required": False},
        }

    def create(self, validated_data):
        validated_data["created_by"] = User.objects.filter(
            email=self.context.get(
                "request",
            ).user.id
        ).first()
        return super().create(validated_data)


class AnnouncementAttachmentSerializer(BaseModelSerializer):
    class Meta:
        model = models.AnnouncementAttachment
        fields = "__all__"
        expandable_fields = {
            "announcement": ("app_announcement.serializers.AnnouncementSerializer",),
        }


class NewsSerializer(BaseModelSerializer):
    class Meta:
        model = models.News
        fields = "__all__"
        expandable_fields = {
            "created_by": ("app_auth.serializers.UserSerializer",),
            "attachments": (
                "app_attachment.serializers.AttachmentSerializer",
                {"many": True},
            ),
        }
        extra_kwargs = {
            "created_by": {"required": False},
        }

    def create(self, validated_data):
        validated_data["created_by"] = User.objects.filter(
            email=self.context.get(
                "request",
            ).user.id
        ).first()
        return super().create(validated_data)
