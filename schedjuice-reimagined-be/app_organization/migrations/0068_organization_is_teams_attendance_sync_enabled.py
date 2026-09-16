from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0067_organization_attendance_tracking_and_data_health"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_teams_attendance_sync_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When on, the nightly sync-meeting-attendance cron fetches Microsoft "
                    "Teams attendance reports into UserAttendance. Zoom sync is unaffected."
                ),
            ),
        ),
    ]
