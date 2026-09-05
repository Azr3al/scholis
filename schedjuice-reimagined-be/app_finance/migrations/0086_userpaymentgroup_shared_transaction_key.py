from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_finance", "0085_paymentmethod_bank_account_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="userpaymentgroup",
            name="shared_transaction_key",
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text=(
                    "Links sibling groups created from one shared bank transfer "
                    "(multiple students, one screenshot)."
                ),
                max_length=64,
                null=True,
            ),
        ),
    ]
