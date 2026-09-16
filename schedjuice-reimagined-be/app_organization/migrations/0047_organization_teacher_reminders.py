from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0046_zoom_account"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_teacher_payment_consultation_enabled",
            field=models.BooleanField(
                default=False,
                help_text="When True, run teacher payment-consultation reminders (reminder_type=payment_consultation).",
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="teacher_reminder_escalation_user_id",
            field=models.PositiveIntegerField(
                blank=True,
                help_text=(
                    "Tenant User.id (in that tenant schema) to receive escalation email when overdue. "
                    "No DB FK cross-schema."
                ),
                null=True,
            ),
        ),
    ]
