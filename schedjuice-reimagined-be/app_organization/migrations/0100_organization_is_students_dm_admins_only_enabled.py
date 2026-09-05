from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0099_organization_is_student_teacher_group_chat_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_students_dm_admins_only_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When True, students may only start or send direct messages to "
                    "school admins (superadmin, admin, manager)."
                ),
            ),
        ),
    ]
