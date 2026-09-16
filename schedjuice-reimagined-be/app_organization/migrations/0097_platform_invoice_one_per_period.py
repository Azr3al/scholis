from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0096_platform_invoice"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="platforminvoice",
            name="uniq_platform_invoice_org_period_issued",
        ),
        migrations.AddConstraint(
            model_name="platforminvoice",
            constraint=models.UniqueConstraint(
                fields=("organization", "billing_year", "billing_month"),
                name="uniq_platform_invoice_org_period",
            ),
        ),
    ]
