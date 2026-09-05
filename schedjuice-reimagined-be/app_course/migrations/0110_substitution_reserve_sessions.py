from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0109_usercourse_joined_left_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="is_substitution_reserve",
            field=models.BooleanField(
                default=False,
                help_text="Buffer day held for substitution; not counted toward max_sessions.",
            ),
        ),
        migrations.AddField(
            model_name="program",
            name="default_substitution_reserve_days",
            field=models.PositiveIntegerField(
                default=0,
                help_text="Max substitution-reserve days staff can add per course (0–10).",
                validators=[MinValueValidator(0), MaxValueValidator(10)],
            ),
        ),
        migrations.AddField(
            model_name="program",
            name="is_substitution_reserve_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When true, session-credit courses may add buffer days beyond max sessions."
                ),
            ),
        ),
    ]
