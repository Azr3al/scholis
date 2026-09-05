# Generated manually for ProcessedTeamsRecording

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0060_processedteamsattendancereport"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProcessedTeamsRecording",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("recording_id", models.CharField(max_length=1024)),
                ("file_path", models.CharField(blank=True, max_length=1024, null=True)),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="processed_recordings",
                        to="app_course.course",
                    ),
                ),
            ],
            options={
                "ordering": ("course", "recording_id"),
                "unique_together": {("course", "recording_id")},
            },
        ),
    ]
