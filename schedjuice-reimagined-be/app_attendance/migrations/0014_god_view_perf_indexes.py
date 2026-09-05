from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_attendance", "0013_userevent_today_activities"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="userevent",
            index=models.Index(
                fields=["event", "user"],
                name="userevent_event_user_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="userevent",
            index=models.Index(
                fields=["attendance_status"],
                name="userevent_status_idx",
            ),
        ),
    ]
