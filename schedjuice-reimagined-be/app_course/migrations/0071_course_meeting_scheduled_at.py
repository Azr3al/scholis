from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0070_course_microsoft_meeting_organizer"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="meeting_scheduled_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When the current meeting_link was last set or changed (server-managed audit).",
                null=True,
            ),
        ),
    ]
