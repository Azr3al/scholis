from django.db import models

from app_attendance.managers import ActiveUserEventManager, AttendanceManager
from app_auth.models import User
from app_course.models import Event
from utilitas.models import BaseModel
from schedjuice_backend.storages import PrivateMediaStorage
from schedjuice_backend.helpers import get_tenant_specific_upload_folder


def get_tenant_specific_upload_folder_for_checkin_image(instance, filename):
    return get_tenant_specific_upload_folder(filename, "checkin_images")


class UserEvent(BaseModel):
    class AttendanceStatus(models.TextChoices):
        UNREGISTERED = "unregistered", "Unregistered"
        PRESENT = "present", "Present"
        ABSENT = "absent", "Absent"
        ABSENT_WITH_LEAVE = "absent_with_leave", "Absent with leave"
        LATE = "late", "Late"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_events")
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    attendance_status = models.CharField(
        max_length=32,
        choices=AttendanceStatus.choices,
        default=AttendanceStatus.UNREGISTERED,
    )
    attendance_note = models.TextField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)
    attendance_code = models.CharField(max_length=6, null=True, blank=True)
    
    checkin_time = models.DateTimeField(null=True, blank=True)
    checkout_time = models.DateTimeField(null=True, blank=True)
    checkin_image = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_checkin_image,
        null=True,
        blank=True,
        storage=PrivateMediaStorage(),
    )
    is_extra_class = models.BooleanField(default=False)
    today_activities = models.TextField(null=True, blank=True)

    # payroll stuffsssss
    hourly_rate_at_calculation = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    student_bonus_rate_at_calculation = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    student_count_in_course_at_calculation = models.IntegerField(null=True, blank=True)
    per_hour_price_at_calculation = models.DecimalField(
        max_digits=19,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Snapshot of course payment plan per-hour price when payroll fields are frozen (cash-flow income).",
    )
    event_time_from_at_calculation = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Frozen Event session start (UTC) at first teacher check-in; used for billable hours.",
    )
    event_time_to_at_calculation = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Frozen Event session end (UTC) at first teacher check-in; used for billable hours.",
    )

    objects = ActiveUserEventManager()
    all_objects = AttendanceManager()

    class Meta:
        unique_together = ("user", "event")
        indexes = [
            models.Index(fields=["event", "user"], name="userevent_event_user_idx"),
            models.Index(fields=["attendance_status"], name="userevent_status_idx"),
        ]


class AttendanceChangeEvent(BaseModel):
    class EventType(models.TextChoices):
        SELF_CHECKIN_CORRECTED = "self_checkin_corrected", "Self check-in corrected"
        SELF_CHECKIN_BACKFILLED = "self_checkin_backfilled", "Self check-in backfilled"
        CHECKIN_CANCELLED = "checkin_cancelled", "Check-in cancelled"

    class Source(models.TextChoices):
        WEB_COURSE_CHECKIN_HISTORY = (
            "web_course_checkin_history",
            "web_course_checkin_history",
        )
        MOBILE_SESSION_CHECKIN = (
            "mobile_session_checkin",
            "mobile_session_checkin",
        )

    user_event = models.ForeignKey(
        UserEvent,
        on_delete=models.CASCADE,
        related_name="change_events",
    )
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_changes_performed",
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    occurred_at = models.DateTimeField()
    source = models.CharField(
        max_length=32,
        choices=Source.choices,
        null=True,
        blank=True,
    )
    payload = models.JSONField(default=dict)

    class Meta:
        ordering = ["-occurred_at", "-id"]
        indexes = [
            models.Index(fields=["user_event", "-occurred_at"]),
        ]


class LeaveRequest(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        DENIED = "denied", "Denied"
        CANCELLED = "cancelled", "Cancelled"

    student = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="leave_requests"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    denial_reason = models.TextField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_leave_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    attachment = models.ForeignKey(
        "app_attachment.Attachment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )

    class Meta:
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["start_date", "end_date"]),
        ]
        ordering = ("-created_at",)
