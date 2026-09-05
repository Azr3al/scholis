"""Audit UserPayment amounts against coverage-driven pricing (read-only)."""

from __future__ import annotations

from pathlib import Path

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.payment_repricing_audit import (
    STATUS_MISPRICED,
    audit_payment_repricing,
    summarize_rows,
    write_audit_csv,
)
from app_organization.models import Organization


class Command(BaseCommand):
    help = "Audit UserPayment amounts against coverage-driven pricing (read-only)."

    def add_arguments(self, parser):
        parser.add_argument("--schema-name", type=str, default=None)
        parser.add_argument("--csv", type=str, default=None, metavar="PATH")

    def handle(self, *args, **options):
        schema_name_arg = options.get("schema_name")
        csv_path = options.get("csv")

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.all()
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            schema_names = [o.schema_name for o in org_qs if o.schema_name]

        if schema_name_arg and not schema_names:
            raise CommandError(f"No organization for schema_name={schema_name_arg!r}.")

        all_rows = []
        for schema_name in schema_names:
            with schema_context(schema_name):
                rows = audit_payment_repricing(schema_name)
            counts = summarize_rows(rows)
            all_rows.extend(rows)
            self.stdout.write(
                self.style.NOTICE(
                    f"\nSchema: {schema_name}  payments: {len(rows)}  "
                    f"mispriced: {counts.get(STATUS_MISPRICED, 0)}  "
                    f"match: {counts.get('match', 0)}  "
                    f"skipped_overridden: {counts.get('skipped_overridden', 0)}  "
                    f"skipped_out_of_range: {counts.get('skipped_out_of_range', 0)}"
                )
            )

        if csv_path:
            path = Path(csv_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", newline="", encoding="utf-8") as handle:
                write_audit_csv(all_rows, handle)
            self.stdout.write(self.style.SUCCESS(f"\nWrote {len(all_rows)} row(s) to {path}"))
