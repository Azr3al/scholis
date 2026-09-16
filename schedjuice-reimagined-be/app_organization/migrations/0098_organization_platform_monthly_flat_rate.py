from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0097_platform_invoice_one_per_period"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="platform_monthly_flat_rate",
            field=models.PositiveIntegerField(
                blank=True,
                help_text=(
                    "Optional monthly platform flat fee in tenant currency. "
                    "Included on platform invoices when set."
                ),
                null=True,
            ),
        ),
    ]
