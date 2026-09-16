"""Backfill User.search_text for all tenant schemas (run after FTS migrations)."""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization


class Command(BaseCommand):
    help = "Populate User.search_text across tenant schemas for FTS."

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            type=str,
            help="Single tenant schema_name to backfill (default: all non-public tenants).",
        )
        parser.add_argument(
            "--chunk-size",
            type=int,
            default=5000,
            help="Number of user ids per UPDATE chunk (large tenants).",
        )

    def handle(self, *args, **options):
        schema_opt = options.get("schema")
        chunk_size = options["chunk_size"]

        with schema_context(get_public_schema_name()):
            if schema_opt:
                orgs = list(Organization.objects.filter(schema_name=schema_opt))
            else:
                orgs = list(
                    Organization.objects.exclude(
                        schema_name=get_public_schema_name()
                    )
                )

        if not orgs:
            self.stdout.write(self.style.WARNING("No tenant schemas to backfill."))
            return

        for org in orgs:
            self.stdout.write(f"Backfilling search_text in schema {org.schema_name}...")
            with schema_context(org.schema_name):
                updated = self._bulk_update(chunk_size)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {org.schema_name}: updated {updated} user(s)"
                    )
                )

    def _bulk_update(self, chunk_size: int) -> int:
        with connection.cursor() as cursor:
            cursor.execute("SELECT min(id), max(id) FROM app_auth_user")
            row = cursor.fetchone()
            if not row or row[0] is None:
                return 0
            min_id, max_id = row
            total = 0
            start = min_id
            while start <= max_id:
                end = start + chunk_size - 1
                cursor.execute(
                    """
                    UPDATE app_auth_user
                       SET search_text = compute_user_search_text(id)
                     WHERE id BETWEEN %s AND %s;
                    """,
                    [start, end],
                )
                total += cursor.rowcount
                start = end + 1
            return total
