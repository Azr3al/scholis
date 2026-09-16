from django.db import models

from utilitas.models import BaseModel


class ChatThreadKind(models.TextChoices):
    COURSE = "course", "course"
    DM = "dm", "dm"
    GROUP = "group", "group"  # reserved for a future phase; unused for now


class ChatThread(BaseModel):
    """Unified thread for course chat, DMs, and (future) group chat."""

    kind = models.CharField(max_length=10, choices=ChatThreadKind.choices)
    course = models.ForeignKey(
        "app_course.Course",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="chat_threads",
    )
    dm_pair_key = models.CharField(max_length=40, null=True, blank=True)
    group_key = models.CharField(max_length=80, null=True, blank=True)
    anchor_user = models.ForeignKey(
        "app_auth.User",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="anchored_chat_threads",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["course"],
                condition=models.Q(kind=ChatThreadKind.COURSE),
                name="uniq_chat_thread_course",
            ),
            models.UniqueConstraint(
                fields=["dm_pair_key"],
                condition=models.Q(kind=ChatThreadKind.DM),
                name="uniq_chat_thread_dm_pair",
            ),
            models.UniqueConstraint(
                fields=["group_key"],
                condition=models.Q(kind=ChatThreadKind.GROUP),
                name="uniq_chat_thread_group_key",
            ),
        ]
        indexes = [
            models.Index(fields=["kind"], name="app_chat_thread_kind_idx"),
        ]


class ChatThreadParticipant(BaseModel):
    """
    Explicit participants for kind=dm/group threads only.

    Course threads derive membership from UserCourse via ChatThread.course_id —
    not duplicated here, to avoid a second source of truth for course rosters.
    """

    thread = models.ForeignKey(
        ChatThread, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="chat_thread_participations",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["thread", "user"], name="uniq_chat_thread_participant"
            ),
        ]
        indexes = [
            models.Index(
                fields=["user", "thread"], name="app_chat_th_participant_idx"
            ),
        ]


class ChatMessage(BaseModel):
    """
    A chat message on a unified thread (course or DM).
    content is JSON: {"text": "...", "mentions": [...], "attachments": [...]}
    """

    thread = models.ForeignKey(
        ChatThread, on_delete=models.CASCADE, related_name="messages"
    )
    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="chat_messages"
    )
    content = models.JSONField(
        help_text="Structured payload: {text, mentions, attachments}"
    )
    reply_to = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="replies",
    )
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        "app_auth.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="chat_messages_deleted",
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(
                fields=["thread", "created_at"], name="app_chat_message_thread_idx"
            ),
        ]


class ChatReadState(BaseModel):
    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="chat_read_states"
    )
    thread = models.ForeignKey(
        ChatThread, on_delete=models.CASCADE, related_name="read_states"
    )
    last_read_message_id = models.BigIntegerField(null=True, blank=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "thread"], name="uniq_chat_read_user_thread"
            ),
        ]
        indexes = [
            models.Index(
                fields=["thread", "user"], name="app_chat_read_state_thread_idx"
            ),
        ]


class ChatMessageReaction(BaseModel):
    """One reaction slot per user per chat message."""

    emoji = models.CharField(max_length=10)
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="chat_message_reactions",
    )
    message = models.ForeignKey(
        "app_chat.ChatMessage",
        on_delete=models.CASCADE,
        related_name="reactions",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["created_by", "message"],
                name="uniq_chat_reaction_user_message",
            ),
        ]
        indexes = [
            models.Index(fields=["message"], name="app_chat_reaction_message_idx"),
        ]
