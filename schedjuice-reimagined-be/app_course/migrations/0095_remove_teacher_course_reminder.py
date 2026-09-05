from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        (
            "app_course",
            "0093_rename_app_course_te_reminder_8368e9_idx_app_course__reminde_b92567_idx",
        ),
        ("app_course", "0094_useruploadedrecording_source_fields"),
    ]

    operations = [
        migrations.DeleteModel(
            name="TeacherCourseReminder",
        ),
    ]
