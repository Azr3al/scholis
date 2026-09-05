"""Reprice split-screenshot group first-parts from stored covered_months."""

from django.db import migrations


def run_backfill(apps, schema_editor):
    from app_finance.backfill_split_screenshot_group_pricing import (
        backfill_split_screenshot_group_pricing,
    )

    schema_name = getattr(schema_editor.connection, "schema_name", "") or ""
    if not schema_name or schema_name == "public":
        return
    backfill_split_screenshot_group_pricing(schema_name)


def noop_reverse(apps, schema_editor):
    """Amounts cannot be un-repriced."""


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0086_userpaymentgroup_shared_transaction_key"),
    ]

    operations = [
        migrations.RunPython(run_backfill, noop_reverse),
    ]
