from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0093_course_status_override"),
    ]

    operations = [
        migrations.AddField(
            model_name="useruploadedrecording",
            name="source_type",
            field=models.CharField(
                choices=[("file", "file"), ("youtube", "youtube")],
                default="file",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="useruploadedrecording",
            name="youtube_url",
            field=models.URLField(blank=True, max_length=2048),
        ),
        migrations.AddField(
            model_name="useruploadedrecording",
            name="youtube_video_id",
            field=models.CharField(blank=True, max_length=32),
        ),
    ]
