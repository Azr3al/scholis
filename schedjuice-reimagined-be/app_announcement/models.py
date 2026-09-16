from django.core.exceptions import ValidationError
from django.db import models

from schedjuice_backend.helpers import get_tenant_specific_upload_folder
from schedjuice_backend.storages import PublicMediaStorage
from utilitas.models import BaseModel


def get_announcement_attachment_upload_path(instance, filename):
    return get_tenant_specific_upload_folder(filename, "announcement_attachments")


def default_course_filters():
    return {"month_type": "ALL"}


class PostType(models.TextChoices):
    ANNOUNCEMENT = "announcement", "Announcement"
    DAILY_LESSON = "daily_lesson", "Daily lesson"


class MicrosoftTeamsStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"


class MicrosoftTeamsPostedAs(models.TextChoices):
    USER = "user", "User"
    SERVICE_ACCOUNT = "service_account", "Service account"


class Announcement(BaseModel):
    """
    course_filters schema: { category_ids?: number[], month_type: "HM" | "FM" | "ALL" }
    HM = half-month (start_date day >= 10), FM = full-month (start_date day < 10)
    """
    title = models.CharField(max_length=2048, blank=True, null=True)
    post_type = models.CharField(
        max_length=32,
        choices=PostType.choices,
        default=PostType.ANNOUNCEMENT,
    )
    finished_unit = models.PositiveIntegerField(null=True, blank=True)
    data = models.TextField(blank=True, null=True)
    json_data = models.JSONField(blank=True, null=True)
    html_data = models.TextField(blank=True, null=True)
    course = models.ForeignKey("app_course.Course", on_delete=models.CASCADE, null=True)
    created_by = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    is_pinned = models.BooleanField(default=False)
    send_to_microsoft = models.BooleanField(default=False)
    send_to_telegram = models.BooleanField(default=False)
    microsoft_channel_id = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text="Per-post Teams channel override; falls back to course default.",
    )
    microsoft_teams_status = models.CharField(
        max_length=16,
        choices=MicrosoftTeamsStatus.choices,
        null=True,
        blank=True,
        help_text="Teams delivery status when send_to_microsoft is true.",
    )
    microsoft_teams_error = models.TextField(null=True, blank=True)
    microsoft_teams_synced_at = models.DateTimeField(null=True, blank=True)
    microsoft_teams_message_id = models.CharField(max_length=512, null=True, blank=True)
    microsoft_teams_message_ids = models.JSONField(
        default=list,
        blank=True,
        null=True,
        help_text="All Teams message ids when a post is split across multiple messages.",
    )
    microsoft_teams_team_id = models.CharField(max_length=512, null=True, blank=True)
    microsoft_teams_channel_id = models.CharField(max_length=512, null=True, blank=True)
    microsoft_teams_posted_as = models.CharField(
        max_length=32,
        choices=MicrosoftTeamsPostedAs.choices,
        null=True,
        blank=True,
        help_text="Which identity posted to Teams (user vs org service account).",
    )
    microsoft_teams_posted_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teams_posted_announcements",
        help_text="Schedjuice user whose Microsoft OAuth posted to Teams, when posted_as=user.",
    )
    course_filters = models.JSONField(default=default_course_filters, blank=True, null=True)

    class Meta:
        ordering = ["-is_pinned", "-created_at"]


class AnnouncementAttachment(BaseModel):
    """Attachment for Announcement. One-to-many. Uploaded in same request as announcement."""
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name="attachments",
        null=True,
        blank=True,
    )
    course = models.ForeignKey(
        "app_course.Course",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    uploaded_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    file = models.FileField(
        upload_to=get_announcement_attachment_upload_path,
        storage=PublicMediaStorage(),
    )
    filename = models.CharField(max_length=5120)

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["course", "uploaded_by", "announcement"]),
        ]


class Comment(BaseModel):
    content = models.TextField()
    created_by = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    announcement = models.ForeignKey(
        Announcement, 
        on_delete=models.CASCADE, 
        related_name="comments"
    )

    class Meta:
        ordering = ["-created_at"]


class Reaction(BaseModel):
    emoji = models.CharField(max_length=10)
    created_by = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    announcement = models.ForeignKey(
        Announcement, 
        on_delete=models.CASCADE, 
        related_name="reactions", 
        null=True, 
        blank=True
    )
    comment = models.ForeignKey(
        Comment, 
        on_delete=models.CASCADE, 
        related_name="reactions", 
        null=True, 
        blank=True
    )

    class Meta:
        unique_together = [
            ("created_by", "announcement", "emoji"),
            ("created_by", "comment", "emoji"),
        ]

    def clean(self):
        super().clean()
        if not self.announcement and not self.comment:
            raise ValidationError("Either announcement or comment must be provided.")
        if self.announcement and self.comment:
            raise ValidationError("Only one of announcement or comment can be provided.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class News(BaseModel):
    title = models.CharField(max_length=2048)
    data = models.JSONField()
    created_by = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
