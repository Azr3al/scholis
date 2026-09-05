from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0100_organization_is_students_dm_admins_only_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="student_dm_contact_user_id",
            field=models.PositiveIntegerField(
                blank=True,
                help_text=(
                    "Tenant User.id for the sole admin students may DM when "
                    "is_students_dm_admins_only_enabled is True. No cross-schema FK."
                ),
                null=True,
            ),
        ),
    ]
