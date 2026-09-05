# Generated manually for ProcessedTeamsAttendanceReport

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0059_usercourse_hourly_rate"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProcessedTeamsAttendanceReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("report_id", models.CharField(max_length=512)),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="processed_attendance_reports",
                        to="app_course.course",
                    ),
                ),
            ],
            options={
                "ordering": ("course", "report_id"),
                "unique_together": {("course", "report_id")},
            },
        ),
    ]
