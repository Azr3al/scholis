from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_quiz_v3", "0012_integrity_types_archive_throttle"),
    ]

    operations = [
        migrations.AddField(
            model_name="attemptanswer",
            name="marked_review",
            field=models.BooleanField(default=False),
        ),
    ]
