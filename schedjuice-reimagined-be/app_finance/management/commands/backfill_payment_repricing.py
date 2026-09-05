"""Reprice historical payments under coverage-driven pricing."""

from __future__ import annotations

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.payment_repricing_backfill import backfill_payment_repricing
from app_organization.models import Organization


class Command(BaseCommand):
    help = "Reprice UserPayment amounts to match coverage-driven pricing."

    def add_arguments(self, parser):
        parser.add_argument("--schema-name", type=str, default=None)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        schema_name_arg = options.get("schema_name")
        dry_run = options["dry_run"]

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.all()
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            schema_names = [o.schema_name for o in org_qs if o.schema_name]

        if schema_name_arg and not schema_names:
            raise CommandError(f"No organization for schema_name={schema_name_arg!r}.")

        grand_total = 0
        for schema_name in schema_names:
            with schema_context(schema_name):
                changed = backfill_payment_repricing(schema_name, dry_run=dry_run)
            grand_total += len(changed)
            verb = "would reprice" if dry_run else "repriced"
            self.stdout.write(
                self.style.NOTICE(f"Schema {schema_name}: {verb} {len(changed)} payment(s)")
            )

        self.stdout.write(self.style.SUCCESS(f"\nTotal: {grand_total}"))
