# User.zoom_user_identifier for Zoom attendance matching (moved from UserAttendance)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_auth", "0041_alter_user_country"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="zoom_user_identifier",
            field=models.CharField(
                blank=True,
                help_text="Stable Zoom identity for attendance matching: participant user_email, user_id, or id from report API.",
                max_length=512,
                null=True,
            ),
        ),
    ]
