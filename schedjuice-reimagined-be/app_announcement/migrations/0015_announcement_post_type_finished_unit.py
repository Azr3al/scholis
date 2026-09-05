from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_announcement", "0014_announcement_send_to_telegram"),
    ]

    operations = [
        migrations.AddField(
            model_name="announcement",
            name="post_type",
            field=models.CharField(
                choices=[
                    ("announcement", "Announcement"),
                    ("daily_lesson", "Daily lesson"),
                ],
                default="announcement",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="announcement",
            name="finished_unit",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="announcement",
            name="title",
            field=models.CharField(blank=True, max_length=2048, null=True),
        ),
    ]
