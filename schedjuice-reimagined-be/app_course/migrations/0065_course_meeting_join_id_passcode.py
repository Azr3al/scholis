# Add meeting_join_id and meeting_passcode to Course (from MS Graph joinMeetingIdSettings)

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0064_category_is_payment_assignment_eligible"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="meeting_join_id",
            field=models.CharField(
                blank=True,
                help_text="Teams meeting ID for dial-in/join (from joinMeetingIdSettings).",
                max_length=64,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="meeting_passcode",
            field=models.CharField(
                blank=True,
                help_text="Teams meeting passcode for dial-in (from joinMeetingIdSettings).",
                max_length=64,
                null=True,
            ),
        ),
    ]
