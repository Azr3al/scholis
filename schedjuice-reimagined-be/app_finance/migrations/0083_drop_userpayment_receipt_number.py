from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0082_backfill_payment_receipts"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="userpayment",
            name="uniq_userpayment_receipt_number_non_null",
        ),
        migrations.RemoveField(
            model_name="userpayment",
            name="receipt_number",
        ),
    ]
