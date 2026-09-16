"""
Backfill attendance_date on UserAttendance records where it is null.
Computes date from join_datetime in the tenant's timezone.

Use after adding attendance_date to backfill historical records.
"""

import logging
import time

import pytz
from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import UserAttendance
from app_organization.models import Organization

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = (
        "Backfill attendance_date on UserAttendance records where it is null, "
        "using join_datetime converted to the tenant's timezone."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be updated without writing to the database.",
        )
        parser.add_argument(
            "--progress-every",
            type=int,
            default=500,
            metavar="N",
            help="Print progress every N rows per tenant (default: 500). Use 1 for every row.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        progress_every = max(1, options["progress_every"])
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no changes will be saved"))

        total_updated = 0

        with schema_context(get_public_schema_name()):
            organizations = list(Organization.objects.all())

        self.stdout.write(f"Organizations to scan: {len(organizations)}")

        for org in organizations:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                self.stdout.write(
                    self.style.WARNING(f"Skipping org (no schema_name): {org}")
                )
                continue

            with schema_context(schema_name):
                qs = UserAttendance.objects.filter(
                    attendance_date__isnull=True,
                )

                total_rows = qs.count()
                if total_rows == 0:
                    self.stdout.write(
                        f"  [{schema_name}] No rows with null attendance_date, skipping."
                    )
                    continue

                self.stdout.write(
                    f"  [{schema_name}] Backfilling {total_rows} row(s) "
                    f"(progress every {progress_every})..."
                )
                t0 = time.perf_counter()
                to_update = []
                tz = pytz.timezone(getattr(org, "timezone", None) or "UTC")
                for i, att in enumerate(qs.iterator(chunk_size=2000), start=1):
                    att.attendance_date = att.join_datetime.astimezone(tz).date()
                    to_update.append(att)
                    if i % progress_every == 0 or i == total_rows:
                        elapsed = time.perf_counter() - t0
                        self.stdout.write(
                            f"  [{schema_name}] ... {i}/{total_rows} rows "
                            f"({elapsed:.1f}s elapsed)"
                        )

                if to_update:
                    count = len(to_update)
                    bulk_elapsed = 0.0
                    if not dry_run:
                        t_bulk = time.perf_counter()
                        UserAttendance.objects.bulk_update(
                            to_update, ["attendance_date"]
                        )
                        bulk_elapsed = time.perf_counter() - t_bulk
                    total_updated += count
                    elapsed_total = time.perf_counter() - t0
                    if dry_run:
                        self.stdout.write(
                            self.style.WARNING(
                                f"  [{schema_name}] dry-run: would update {count} row(s) "
                                f"(scan {elapsed_total:.1f}s, no DB write)"
                            )
                        )
                    else:
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  [{schema_name}] Updated {count} row(s) — "
                                f"scan {elapsed_total - bulk_elapsed:.1f}s, "
                                f"bulk_update {bulk_elapsed:.2f}s, "
                                f"total {elapsed_total:.1f}s"
                            )
                        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Backfill complete. Total records updated: {total_updated}"
            )
        )
