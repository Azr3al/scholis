import uuid

from django.db import models
from django.utils import timezone

from utilitas.models import BaseModel


class TelegramLinkToken(BaseModel):
    """One-time token for binding a user's Schedjuice account to Telegram."""

    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    def is_active(self) -> bool:
        return self.consumed_at is None and self.expires_at > timezone.now()


class TelegramLoginSession(BaseModel):
    """Mobile bot OTP login session (pairing code + one-time OTP)."""

    session_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        db_index=True,
    )
    pairing_code = models.CharField(max_length=8, db_index=True)
    user = models.ForeignKey(
        "app_auth.User",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
    )
    otp_hash = models.CharField(max_length=128, blank=True, default="")
    otp_sent_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    def is_active(self) -> bool:
        return self.consumed_at is None and self.expires_at > timezone.now()


class TelegramPendingGroupLink(BaseModel):
    """Tracks an in-progress 'add bot to group' link for a course."""

    course = models.ForeignKey("app_course.Course", on_delete=models.CASCADE)
    initiated_by = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    def is_active(self) -> bool:
        return self.consumed_at is None and self.expires_at > timezone.now()


class TelegramProcessedUpdate(BaseModel):
    """Dedupe table for inbound webhook update_ids (per tenant)."""

    update_id = models.BigIntegerField(db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["update_id"], name="uniq_tg_update_id"),
        ]


class TelegramAIExchange(BaseModel):
    """One user question + bot answer in a Telegram DM AI session."""

    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    chat_id = models.BigIntegerField(db_index=True)
    user_message_id = models.BigIntegerField()
    bot_message_id = models.BigIntegerField(null=True, blank=True)
    user_text = models.TextField()
    bot_text = models.TextField(blank=True, default="")

    class Meta:
        indexes = [
            models.Index(
                fields=["user", "chat_id", "-created_at"],
                name="ix_tg_ai_ex_user_chat_created",
            ),
        ]


class AIDisambiguationPending(BaseModel):
    """Pending A/B/C disambiguation for AI write tools (Telegram + web)."""

    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    channel_key = models.CharField(max_length=128, db_index=True)
    tool_name = models.CharField(max_length=64)
    pending_field = models.CharField(max_length=32)
    partial_args = models.JSONField(default=dict)
    candidates = models.JSONField(default=list)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "channel_key"],
                name="uniq_ai_disambiguation_user_channel",
            ),
        ]


class AIPendingWriteConfirmation(BaseModel):
    """Pending confirm/cancel for AI roster write tools."""

    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    channel_key = models.CharField(max_length=128, db_index=True)
    tool_name = models.CharField(max_length=64)
    action = models.CharField(max_length=32)
    execution_payload = models.JSONField(default=dict)
    summary = models.TextField()
    preview = models.JSONField(default=dict)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    telegram_message_id = models.BigIntegerField(null=True, blank=True)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "channel_key"],
                name="uniq_ai_write_confirm_user_channel",
            ),
        ]
