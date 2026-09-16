from django.db import models

from utilitas.models import BaseModel


class MicrosoftRepairJob(BaseModel):
    """Tracks an asynchronous bulk Microsoft provisioning repair run.

    A job creates Microsoft accounts (users) or Teams (courses) for local
    records missing their Microsoft id. Dry-run scanning is synchronous and not
    persisted; only actual repair runs are recorded here so the Superadmin Tools
    UI can show progress, results, and failures.
    """

    class TargetType(models.TextChoices):
        USERS = "users", "Users"
        COURSES = "courses", "Courses"
        UNLICENSED_USERS = "unlicensed_users", "Unlicensed users"
        SCOPE_TEAM_OWNERS = "scope_team_owners", "Scope team owners"
        PASSWORD_RESET = "password_reset", "Password reset"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        SUCCEEDED = "succeeded", "Succeeded"
        PARTIAL = "partial", "Partial"
        FAILED = "failed", "Failed"

    target_type = models.CharField(max_length=32, choices=TargetType.choices)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    # Optional explicit candidate ids; empty means "all repairable of target type".
    candidate_ids = models.JSONField(default=list, blank=True)

    total = models.PositiveIntegerField(default=0)
    succeeded = models.PositiveIntegerField(default=0)
    failed = models.PositiveIntegerField(default=0)
    skipped = models.PositiveIntegerField(default=0)
    # Per-record outcomes: [{id, status, detail}].
    results = models.JSONField(default=list, blank=True)

    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="microsoft_repair_jobs",
    )
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ("-id",)
