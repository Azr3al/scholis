from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0050_alter_organization_course_fields_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="organization",
            name="is_teacher_payment_consultation_enabled",
        ),
        migrations.RemoveField(
            model_name="organization",
            name="teacher_reminder_escalation_user_id",
        ),
    ]
