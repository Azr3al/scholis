from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0066_platformopssettings_github_docs_video"),
    ]

    operations = [
        migrations.RenameField(
            model_name="organization",
            old_name="is_session_checkin_enabled",
            new_name="use_teacher_session_checkin",
        ),
        migrations.AddField(
            model_name="organization",
            name="use_student_attendance",
            field=models.BooleanField(
                default=True,
                help_text="Track student attendance status (present/late/absent) for data health.",
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="use_student_checkin",
            field=models.BooleanField(
                default=False,
                help_text="Track student manual session check-in. Mutually exclusive with use_student_attendance.",
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="course_data_health_session_lookback",
            field=models.PositiveIntegerField(
                default=5,
                help_text="Number of past sessions to evaluate for missing session data.",
            ),
        ),
    ]
