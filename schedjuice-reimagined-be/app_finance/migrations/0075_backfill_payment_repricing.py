"""Reprice historical payments so past receipts reprint with correct amounts."""

from django.db import migrations


def run_backfill(apps, schema_editor):
    from app_finance.payment_repricing_backfill import backfill_payment_repricing

    schema_name = getattr(schema_editor.connection, "schema_name", "") or ""
    if not schema_name or schema_name == "public":
        return
    UserPayment = apps.get_model("app_finance", "UserPayment")
    backfill_payment_repricing(schema_name, user_payment_model=UserPayment)


def noop_reverse(apps, schema_editor):
    """Amounts cannot be un-repriced; the audit CSV is the record of what changed."""


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0076_userpayment_payment_date"),
    ]

    operations = [
        migrations.RunPython(run_backfill, noop_reverse),
    ]
