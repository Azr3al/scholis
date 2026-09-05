from django.db import migrations, models


def backfill_billing_date(apps, schema_editor):
    Billing = apps.get_model("app_finance", "Billing")
    for billing in Billing.objects.filter(billing_date__isnull=True).iterator():
        billing.billing_date = billing.created_at.date()
        billing.save(update_fields=["billing_date"])


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0051_paymentplan_per_hour_price_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="billing",
            name="billing_date",
            field=models.DateField(db_index=True, null=True),
        ),
        migrations.RunPython(backfill_billing_date, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="billing",
            name="billing_date",
            field=models.DateField(db_index=True),
        ),
    ]
