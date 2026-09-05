# Migration: switch from file storage to metadata-only for recordings

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0061_processedteamsrecording"),
    ]

    operations = [
        migrations.AddField(
            model_name="processedteamsrecording",
            name="meeting_id",
            field=models.CharField(default="", max_length=1024),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="processedteamsrecording",
            name="recording_content_url",
            field=models.CharField(
                default="",
                help_text="Graph API URL to stream content (requires auth). Not a shareable link.",
                max_length=2048,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="processedteamsrecording",
            name="created_datetime",
            field=models.DateTimeField(
                blank=True,
                help_text="When the recording was created (from Microsoft).",
                null=True,
            ),
        ),
        migrations.RemoveField(
            model_name="processedteamsrecording",
            name="file_path",
        ),
    ]
