from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_announcement", "0013_alter_announcement_course_filters"),
    ]

    operations = [
        migrations.AddField(
            model_name="announcement",
            name="send_to_telegram",
            field=models.BooleanField(default=False),
        ),
    ]
