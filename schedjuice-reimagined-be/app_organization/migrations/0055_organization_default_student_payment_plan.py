from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0054_organization_delegated_account_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="default_student_payment_plan",
            field=models.CharField(
                choices=[
                    ("single_month", "single_month"),
                    ("multiple_months", "multiple_months"),
                    ("installment", "installment"),
                ],
                default="single_month",
                help_text="Preselected payment plan on the student payment upload form.",
                max_length=20,
            ),
        ),
    ]
