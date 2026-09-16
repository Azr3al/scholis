# Recording sync progress tracking

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0035_organization_meeting_sensitivity_label_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="RecordingSyncProgress",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("schema_name", models.CharField(db_index=True, max_length=128)),
                ("course_id", models.PositiveIntegerField(blank=True, help_text="Null = tenant-wide sync; set = single course sync", null=True)),
                ("status", models.CharField(choices=[("running", "Running"), ("completed", "Completed"), ("failed", "Failed")], db_index=True, default="running", max_length=32)),
                ("phase", models.CharField(choices=[("discovery", "Discovery"), ("download", "Download"), ("delete", "Delete")], default="discovery", max_length=32, null=True)),
                ("courses_total", models.PositiveIntegerField(default=0)),
                ("courses_discovered", models.PositiveIntegerField(default=0)),
                ("courses_with_recordings", models.PositiveIntegerField(default=0)),
                ("recordings_total", models.PositiveIntegerField(default=0)),
                ("recordings_downloaded", models.PositiveIntegerField(default=0)),
                ("recordings_deleted", models.PositiveIntegerField(default=0)),
                ("error_message", models.TextField(blank=True, null=True)),
                ("last_activity", models.CharField(blank=True, help_text="Human-readable status, e.g. 'Course 123: downloading 2/3'", max_length=512, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "ordering": ["-created_at"],
                "verbose_name": "Recording sync progress",
                "verbose_name_plural": "Recording sync progress",
            },
        ),
    ]
