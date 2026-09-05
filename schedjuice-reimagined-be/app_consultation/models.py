from django.db import models

from utilitas.models import BaseModel

from app_consultation.constants import SLOT_DURATION_MINUTES


class ConsultationWeeklyWhitelist(BaseModel):
    consultant = models.OneToOneField(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="consultation_weekly_whitelist",
    )
    schedule = models.JSONField(default=dict)

    class Meta:
        verbose_name = "consultation weekly whitelist"

    @property
    def slot_duration_minutes(self) -> int:
        return SLOT_DURATION_MINUTES


class ConsultationBooking(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        CANCELLED = "cancelled", "Cancelled"

    class CancelledBy(models.TextChoices):
        CONSULTANT = "consultant", "Consultant"
        STUDENT = "student", "Student"

    consultant = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="consultation_bookings",
    )
    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=SLOT_DURATION_MINUTES)
    student_name = models.CharField(max_length=512)
    student_email = models.EmailField()
    meeting_link = models.CharField(max_length=2048, blank=True)
    google_calendar_event_id = models.CharField(max_length=512, blank=True)
    details = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    cancel_token_hash = models.CharField(max_length=128, blank=True)
    cancel_token_signed = models.TextField(blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.CharField(
        max_length=16,
        choices=CancelledBy.choices,
        null=True,
        blank=True,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["consultant", "scheduled_at"],
                name="uniq_consultation_booking_consultant_scheduled_at",
            ),
        ]
        ordering = ["scheduled_at"]
