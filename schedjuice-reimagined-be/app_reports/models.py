from django.db import models

from utilitas.models import BaseModel


class Log(BaseModel):
    class LogLevel(models.TextChoices):
        INFO = "info", "info"
        WARNING = "warning", "warning"
        ERROR = "error", "error"
        CRITICAL = "critical", "critical"

    category = models.CharField(max_length=512, null=True)
    level = models.CharField(choices=LogLevel.choices, max_length=16)
    message = models.TextField()
    entity_description = models.TextField(null=True)
    entity = models.CharField(max_length=512, null=True)
    entity_id = models.PositiveIntegerField(null=True)
