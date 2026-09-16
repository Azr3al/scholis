from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0069_processedteamsrecording_onedrive_deleted"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="microsoft_meeting_organizer_id",
            field=models.CharField(
                blank=True,
                help_text="Azure AD object ID of the meeting organizer (main teacher). Used for Graph paths under /users/{id}/onlineMeetings/...",
                max_length=512,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="microsoft_calendar_event_id",
            field=models.CharField(
                blank=True,
                help_text="Outlook calendar event id when the Teams meeting was created via calendar API.",
                max_length=512,
                null=True,
            ),
        ),
    ]
