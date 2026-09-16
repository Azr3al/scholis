from django.db import models

from utilitas.models import BaseModel


class ReportType(BaseModel):
    class AppliesTo(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        STAFF = "STAFF", "Staff"
        BOTH = "BOTH", "Both"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    color = models.CharField(max_length=16, default="#64748b")
    applies_to = models.CharField(
        max_length=16, choices=AppliesTo.choices, default=AppliesTo.BOTH
    )
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]


class ReportTypeField(BaseModel):
    class FieldType(models.TextChoices):
        TEXT = "text", "text"
        TEXTAREA = "textarea", "textarea"
        NUMBER = "number", "number"
        DATE = "date", "date"
        DATETIME = "datetime", "datetime"
        BOOLEAN = "boolean", "boolean"
        CHOICE = "choice", "choice"
        MULTICHOICE = "multichoice", "multichoice"
        EMAIL = "email", "email"
        URL = "url", "url"
        STAFF_USER_FK = "staff_user_fk", "staff user"
        COURSE_FK = "course_fk", "course"

    report_type = models.ForeignKey(
        ReportType, on_delete=models.CASCADE, related_name="fields"
    )
    field_key = models.SlugField(max_length=100)
    field_label = models.CharField(max_length=255)
    field_type = models.CharField(max_length=32, choices=FieldType.choices)
    is_required = models.BooleanField(default=False)
    choices = models.JSONField(null=True, blank=True)
    validation_rules = models.JSONField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=("report_type", "field_key"),
                name="uniq_reporttypefield_type_key",
            ),
        ]


class LogEntry(BaseModel):
    subject = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="log_entries"
    )
    report_type = models.ForeignKey(
        ReportType, on_delete=models.PROTECT, related_name="entries"
    )
    title = models.CharField(max_length=512)
    body = models.TextField(blank=True, default="")
    field_values = models.JSONField(default=dict, blank=True)
    author = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="authored_log_entries",
    )
    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at", "-id"]


class LogEntryVersion(BaseModel):
    entry = models.ForeignKey(
        LogEntry, on_delete=models.CASCADE, related_name="versions"
    )
    version_no = models.PositiveIntegerField()
    editor = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="log_entry_versions",
    )
    snapshot = models.JSONField(default=dict)
    change_summary = models.CharField(max_length=512, blank=True, default="")

    class Meta:
        ordering = ["version_no", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=("entry", "version_no"),
                name="uniq_logentryversion_entry_version",
            ),
        ]


class LogEntryEvent(BaseModel):
    class EventType(models.TextChoices):
        CREATED = "created", "Created"
        EDITED = "edited", "Edited"
        DELETED = "deleted", "Deleted"

    class Level(models.TextChoices):
        MAJOR = "MAJOR", "Major"
        DETAIL = "DETAIL", "Detail"

    entry = models.ForeignKey(LogEntry, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="log_entry_events",
    )
    event_type = models.CharField(max_length=16, choices=EventType.choices)
    level = models.CharField(max_length=8, choices=Level.choices, default=Level.MAJOR)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
