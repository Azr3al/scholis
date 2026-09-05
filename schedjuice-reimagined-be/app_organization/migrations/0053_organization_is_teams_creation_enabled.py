from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0052_merge_20260603_1401"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_teams_creation_enabled",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "When off, no MS Teams are created for courses even if Microsoft "
                    "integration is on."
                ),
            ),
        ),
    ]
