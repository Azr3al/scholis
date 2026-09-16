from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0102_course_membership_event"),
    ]

    operations = [
        migrations.AddField(
            model_name="coursemembershipevent",
            name="source",
            field=models.CharField(
                blank=True,
                choices=[
                    ("api", "api"),
                    ("web_ai", "web_ai"),
                    ("telegram_bot", "telegram_bot"),
                    ("import", "import"),
                ],
                max_length=32,
                null=True,
            ),
        ),
    ]
