from django.contrib.postgres.fields import ArrayField
from django.db import models

from utilitas.models import BaseModel


class DocAudience(models.TextChoices):
    ALL = "all", "All roles"
    ADMIN = "admin", "Administrators"
    TEACHER = "teacher", "Teachers"
    STUDENT = "student", "Students"


class DocStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"


class DocVideoStatus(models.TextChoices):
    UPLOADING = "uploading", "Uploading"
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"


class DocCategory(BaseModel):
    slug = models.SlugField(max_length=128, unique=True)
    title = models.CharField(max_length=256)
    sort_order = models.PositiveIntegerField(default=0)
    default_audience = models.CharField(
        max_length=16,
        choices=DocAudience.choices,
        default=DocAudience.ALL,
    )

    class Meta:
        ordering = ["sort_order", "title"]


class DocArticle(BaseModel):
    slug = models.SlugField(max_length=256, unique=True)
    title = models.CharField(max_length=512)
    markdown_body = models.TextField(blank=True, default="")
    category = models.ForeignKey(
        DocCategory, on_delete=models.PROTECT, related_name="articles"
    )
    audiences = ArrayField(
        models.CharField(max_length=16, choices=DocAudience.choices),
        default=list,
    )
    status = models.CharField(
        max_length=16, choices=DocStatus.choices, default=DocStatus.DRAFT
    )
    published_at = models.DateTimeField(null=True, blank=True)
    organization = models.ForeignKey(
        "app_organization.Organization",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        help_text="Null = global article (v1 only).",
    )
    created_by_user_id = models.PositiveIntegerField(null=True, blank=True)
    created_by_email = models.CharField(max_length=512, blank=True, default="")
    updated_by_user_id = models.PositiveIntegerField(null=True, blank=True)
    updated_by_email = models.CharField(max_length=512, blank=True, default="")

    class Meta:
        ordering = ["-updated_at"]


class DocVideo(BaseModel):
    title = models.CharField(max_length=512, blank=True, default="")
    video_url = models.URLField(max_length=1024, blank=True, default="")
    duration_sec = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=DocVideoStatus.choices)
    error_message = models.TextField(blank=True, default="")
    uploaded_by_user_id = models.PositiveIntegerField(null=True, blank=True)
    uploaded_by_email = models.CharField(max_length=512, blank=True, default="")
    article = models.ForeignKey(
        DocArticle,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="videos",
    )
