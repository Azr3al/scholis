# Zoom meeting id, UserAttendance source, ProcessedVideoAttendanceReport; migrate from ProcessedTeamsAttendanceReport

import django.db.models.deletion
from django.db import migrations, models


def copy_processed_teams_to_video(apps, schema_editor):
    Old = apps.get_model("app_course", "ProcessedTeamsAttendanceReport")
    New = apps.get_model("app_course", "ProcessedVideoAttendanceReport")
    for row in Old.objects.all().iterator():
        New.objects.get_or_create(
            course_id=row.course_id,
            platform="microsoft_teams",
            external_report_id=row.report_id,
            defaults={},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0072_category_sort_order"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="zoom_meeting_id",
            field=models.CharField(
                blank=True,
                help_text="Zoom meeting UUID or ID for report/participant APIs (per course).",
                max_length=512,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="userattendance",
            name="source",
            field=models.CharField(
                choices=[("microsoft_teams", "Microsoft Teams"), ("zoom", "Zoom")],
                db_index=True,
                default="microsoft_teams",
                max_length=32,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="userattendance",
            name="zoom_user_identifier",
            field=models.CharField(
                blank=True,
                help_text="Zoom-reported email or user id when source is Zoom; may differ from User.email.",
                max_length=512,
                null=True,
            ),
        ),
        migrations.CreateModel(
            name="ProcessedVideoAttendanceReport",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("platform", models.CharField(db_index=True, max_length=32)),
                ("external_report_id", models.CharField(max_length=512)),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="processed_video_attendance_reports",
                        to="app_course.course",
                    ),
                ),
            ],
            options={
                "ordering": ("course", "platform", "external_report_id"),
                "unique_together": {("course", "platform", "external_report_id")},
            },
        ),
        migrations.RunPython(copy_processed_teams_to_video, migrations.RunPython.noop),
        migrations.DeleteModel(name="ProcessedTeamsAttendanceReport"),
    ]
