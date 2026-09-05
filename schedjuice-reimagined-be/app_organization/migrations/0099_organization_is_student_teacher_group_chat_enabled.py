from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0098_organization_platform_monthly_flat_rate"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_student_teacher_group_chat_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When True, auto-create private group chats between each student "
                    "and their course teachers (MT/AT)."
                ),
            ),
        ),
    ]
