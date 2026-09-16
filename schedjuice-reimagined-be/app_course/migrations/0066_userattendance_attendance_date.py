# Add attendance_date (tenant-timezone-aware date) to UserAttendance

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0065_course_meeting_join_id_passcode"),
    ]

    operations = [
        migrations.AddField(
            model_name="userattendance",
            name="attendance_date",
            field=models.DateField(
                blank=True,
                db_index=True,
                help_text="Date of join_datetime in the tenant's timezone. Use for payroll and reporting.",
                null=True,
            ),
        ),
    ]
