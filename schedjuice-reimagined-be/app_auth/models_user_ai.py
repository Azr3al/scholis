from django.db import models

from utilitas.models import BaseModel


class UserAIPreferences(BaseModel):
    class ResponseLanguage(models.TextChoices):
        AUTO = "auto", "auto"
        EN = "en", "en"
        MY = "my", "my"

    class Tone(models.TextChoices):
        DEFAULT = "default", "default"
        FORMAL = "formal", "formal"
        CASUAL = "casual", "casual"

    class Verbosity(models.TextChoices):
        DEFAULT = "default", "default"
        BRIEF = "brief", "brief"
        DETAILED = "detailed", "detailed"

    user = models.OneToOneField(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="ai_preferences",
    )
    response_language = models.CharField(
        max_length=8,
        choices=ResponseLanguage.choices,
        default=ResponseLanguage.AUTO,
    )
    tone = models.CharField(
        max_length=16,
        choices=Tone.choices,
        default=Tone.DEFAULT,
    )
    verbosity = models.CharField(
        max_length=16,
        choices=Verbosity.choices,
        default=Verbosity.DEFAULT,
    )
    preferred_name = models.CharField(max_length=64, blank=True, default="")
    monthly_usd_limit = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Admin override: monthly USD cap. Null = org default.",
    )
