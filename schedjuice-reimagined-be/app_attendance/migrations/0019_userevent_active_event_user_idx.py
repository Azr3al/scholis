from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_attendance", "0018_userevent_absent_with_leave_status"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="userevent",
            index=models.Index(
                fields=["event", "user"],
                name="userevent_active_event_user",
                condition=models.Q(is_deleted=False),
            ),
        ),
    ]
