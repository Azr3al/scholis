from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0110_substitution_reserve_sessions"),
    ]

    operations = [
        migrations.AddField(
            model_name="program",
            name="allow_multiple_sessions_per_day",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When true, session-credit courses may schedule more than one "
                    "session on the same calendar date."
                ),
            ),
        ),
    ]
