from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0074_userpayment_amount_override"),
    ]

    operations = [
        migrations.AddField(
            model_name="userpayment",
            name="payment_date",
            field=models.DateTimeField(
                blank=True,
                help_text="Date shown on payment receipts; defaults to upload time.",
                null=True,
            ),
        ),
    ]
