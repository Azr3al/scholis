"""Add amount override audit fields to UserPayment."""

from django.db import migrations, models
import djmoney.models.fields


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0073_merge_20260722_1154"),
    ]

    operations = [
        migrations.AddField(
            model_name="userpayment",
            name="computed_invoiced_amount_currency",
            field=djmoney.models.fields.CurrencyField(
                choices=[("USD", "US Dollar")],
                default="USD",
                editable=False,
                max_length=3,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="userpayment",
            name="computed_invoiced_amount",
            field=djmoney.models.fields.MoneyField(
                blank=True,
                currency_field_name="computed_invoiced_amount_currency",
                decimal_places=4,
                help_text=(
                    "What the pricing engine calculated for this payment. Always written, "
                    "including when an admin overrides invoiced_amount, so the override "
                    "can be audited against the computed figure."
                ),
                max_digits=19,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="userpayment",
            name="is_amount_overridden",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "True when an admin supplied invoiced_amount explicitly. Repricing "
                    "and backfills must skip these payments."
                ),
            ),
        ),
        migrations.AddField(
            model_name="userpayment",
            name="amount_override_reason",
            field=models.CharField(
                blank=True,
                help_text="Why the amount was overridden. Audit trail only.",
                max_length=2000,
                null=True,
            ),
        ),
    ]
