from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0042_organization_is_fm_hm_course_display_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="video_conferencing_platform",
            field=models.CharField(
                blank=True,
                choices=[
                    ("microsoft_teams", "Microsoft Teams"),
                    ("zoom", "Zoom"),
                    ("google_meet", "Google Meet"),
                ],
                default=None,
                help_text="Primary video platform for the school. Null = not set (legacy: infer from Microsoft integration).",
                max_length=32,
                null=True,
            ),
        ),
    ]
