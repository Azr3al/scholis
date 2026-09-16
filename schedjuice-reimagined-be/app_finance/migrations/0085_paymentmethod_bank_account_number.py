from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0084_backfill_group_sibling_duplicate_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentmethod",
            name="bank_account_number",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
