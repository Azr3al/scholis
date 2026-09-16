from django.db import models

from app_auth.models import User
from utilitas.models import BaseModel


class UtilityNotificationSentLog(BaseModel):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="utility_notification_sent_logs",
    )
    kind = models.CharField(max_length=64)
    reference_id = models.CharField(max_length=255)
    sent_on_date = models.DateField()

    class Meta:
        unique_together = ("user", "kind", "reference_id", "sent_on_date")
