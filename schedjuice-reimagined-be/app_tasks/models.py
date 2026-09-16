from django.db import models

from utilitas.models import BaseModel


class Task(BaseModel):
    class TaskName(models.TextChoices):
        REMOVE_MS_MEMBER = "remove_ms_member", "remove_ms_member"
        DELETE_USER = "delete_user", "delete_user"
        DELETE_COURSE = "delete_course", "delete_course"
        LEAVE_TELEGRAM_GROUP = "leave_telegram_group", "leave_telegram_group"
        SEND_SYSTEM_EMAIL = "send_email", "send_email"
        CREATE_MS_USER = "create_ms_user", "create_ms_user"
        SEND_CUSTOM_EMAIL = "send_custom_email", "send_custom_email"
        CREATE_DVR_AND_SEND_EMAIL = "create_dvr_and_send_email", "create_dvr_and_send_email"

    name = models.CharField(choices=TaskName.choices, max_length=512)
    data = models.JSONField(null=True)
    is_locked = models.BooleanField(
        default=False,
        help_text="So that another worker cannot take while this task is being processed by the current worker.",
    )
    retry_count = models.PositiveIntegerField(default=0)
    is_success = models.BooleanField(default=False)
    response = models.TextField()
    status_code = models.CharField(max_length=16, null=True)


class CronCommandLog(BaseModel):
    class Status(models.TextChoices):
        RUNNING = "RUNNING", "Running"
        SUCCESS = "SUCCESS", "Success"
        FAILED = "FAILED", "Failed"

    command_name = models.CharField(max_length=256, db_index=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RUNNING)
    stdout = models.TextField(default="")
    stderr = models.TextField(default="")
    error_message = models.TextField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
