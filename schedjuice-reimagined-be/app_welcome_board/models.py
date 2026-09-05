from django.db import models

from app_auth.models import User
from utilitas.models import BaseModel


class WelcomeBoard(BaseModel):
    """One row per audience per tenant (school schema)."""

    class Audience(models.TextChoices):
        STAFF = "staff", "staff"
        STUDENT = "student", "student"

    audience = models.CharField(max_length=32, choices=Audience.choices, db_index=True)
    body_html = models.TextField(null=True, blank=True)
    body_plain = models.TextField(null=True, blank=True)
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="welcome_boards_updated",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["audience"], name="welcome_board_audience_unique"),
        ]

    def __str__(self):
        return f"<WelcomeBoard {self.audience}>"
