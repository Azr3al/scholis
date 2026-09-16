# Generated manually for UserAttendance.hourly_rate_at_creation

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0055_add_microsoft_meeting_id_and_user_attendance"),
    ]

    operations = [
        migrations.AddField(
            model_name="userattendance",
            name="hourly_rate_at_creation",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=12, null=True
            ),
        ),
    ]
