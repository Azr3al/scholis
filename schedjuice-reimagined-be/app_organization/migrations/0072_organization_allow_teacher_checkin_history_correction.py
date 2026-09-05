from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0071_merge_20260707_1747"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="allow_teacher_checkin_history_correction",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Allow teachers to correct or backfill their own session check-in/out "
                    "times from course check-in history (requires reason; audit trail)."
                ),
            ),
        ),
    ]
