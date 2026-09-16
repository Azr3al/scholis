from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_finance", "0056_alter_paymentmethod_payment_bank"),
    ]

    operations = [
        migrations.AddField(
            model_name="userpayment",
            name="is_installment",
            field=models.BooleanField(
                default=False,
                help_text="Partial payment toward course fees (installment plan).",
            ),
        ),
        migrations.AddField(
            model_name="userpayment",
            name="installment_percent",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Optional display percent for this installment (0–100).",
                max_digits=5,
                null=True,
            ),
        ),
    ]
