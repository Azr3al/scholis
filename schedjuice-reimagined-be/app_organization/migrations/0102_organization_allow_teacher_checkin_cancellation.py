from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0101_organization_student_dm_contact_user_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="allow_teacher_checkin_cancellation",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Allow teachers to cancel an open session check-in when the "
                    "student does not show up (requires reason; audit trail)."
                ),
            ),
        ),
    ]
