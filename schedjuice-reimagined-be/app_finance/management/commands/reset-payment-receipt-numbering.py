"""Realign the payment receipt counter to the highest issued receipt number."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.payment_receipt_number import reconcile_payment_receipt_counter
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Set PaymentReceiptCounter.next_sequence to the highest issued receipt "
        "number + 1. Never renumbers existing receipts."
    )

    def add_arguments(self, parser):
        parser.add_argument("--schema-name", type=str, default=None)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        schema_name_arg = options.get("schema_name")
        dry_run = options["dry_run"]

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.exclude(
                schema_name=get_public_schema_name()
            )
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            schema_names = [o.schema_name for o in org_qs if o.schema_name]

        if schema_name_arg and not schema_names:
            raise CommandError(f"No organization for schema_name={schema_name_arg!r}.")

        for schema_name in schema_names:
            with schema_context(schema_name):
                result = reconcile_payment_receipt_counter(dry_run=dry_run)
            verb = "would set" if dry_run else "set"
            self.stdout.write(
                self.style.NOTICE(
                    f"Schema {schema_name}: receipts={result['receipt_count']}, "
                    f"counter {result['previous_next']} -> {result['new_next']} "
                    f"({verb} next_sequence)"
                )
            )
