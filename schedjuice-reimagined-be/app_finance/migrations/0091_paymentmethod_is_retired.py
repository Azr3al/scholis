from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0090_backfill_payment_date_after_upload"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentmethod",
            name="is_retired",
            field=models.BooleanField(default=False),
        ),
    ]
