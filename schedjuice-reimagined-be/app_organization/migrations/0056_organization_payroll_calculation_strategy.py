from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0055_organization_default_student_payment_plan"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="payroll_calculation_strategy",
            field=models.CharField(
                choices=[
                    ("tr_phillips", "tr_phillips"),
                    ("session_based", "session_based"),
                ],
                default="tr_phillips",
                max_length=32,
            ),
        ),
    ]
