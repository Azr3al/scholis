from django.db import models

from utilitas.models import BaseModel


class DemoProvisionJob(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"

    brief_slug = models.CharField(max_length=128, db_index=True)
    blueprint_id = models.CharField(max_length=64)
    brief_relative_path = models.CharField(max_length=256)
    reset = models.BooleanField(default=False)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    # User lives in tenant schemas; store actor id/email from the admin tenant session.
    created_by_id = models.IntegerField(null=True, blank=True)
    created_by_email = models.CharField(max_length=254, blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    result = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ("-id",)
