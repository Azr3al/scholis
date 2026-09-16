from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0094_idcard_background_transform"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="warn_on_long_course_duration",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When True, show a warning on course create when the date range spans "
                    "more than 30 calendar days."
                ),
            ),
        ),
    ]
