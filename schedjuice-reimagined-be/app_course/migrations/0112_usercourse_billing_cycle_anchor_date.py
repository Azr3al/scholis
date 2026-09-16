from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0111_program_allow_multiple_sessions_per_day"),
    ]

    operations = [
        migrations.AddField(
            model_name="usercourse",
            name="billing_cycle_anchor_date",
            field=models.DateField(
                blank=True,
                help_text=(
                    "First billable calendar day for late joiners (their first class session). "
                    "Null keeps course.start_date as the invoice anchor."
                ),
                null=True,
            ),
        ),
    ]
