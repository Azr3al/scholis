"""
Django management command to backfill hourly_rate_at_creation on UserAttendance
records where the rate is missing but the session has positive duration (payroll
would show earnings=0 only because hourly_rate_at_creation is null).

By default targets Microsoft-enabled organizations only. Resolves rate via
get_hourly_rate_for_teacher_course (same as Teams sync).
"""

import logging
import time

from django.core.management import BaseCommand
from django.db.models import F
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import UserAttendance
from app_course.rate_utils import (
    build_user_course_teacher_hourly_rate_lookup,
    get_hourly_rate_for_teacher_course,
)
from app_organization.models import Organization

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = (
        "Backfill hourly_rate_at_creation on UserAttendance rows where it is null and "
        "join/leave imply positive duration (Teams payroll would otherwise show zero earnings). "
        "Defaults to Microsoft-enabled orgs; use --all-organizations for every tenant."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be updated without writing to the database.",
        )
        parser.add_argument(
            "--schema-name",
            type=str,
            default=None,
            help="Process only this tenant schema (e.g. xteachersu).",
        )
        parser.add_argument(
            "--all-organizations",
            action="store_true",
            help="Include all organizations, not only those with is_microsoft_on=True.",
        )
        parser.add_argument(
            "--progress-every",
            type=int,
            default=500,
            metavar="N",
            help="Print progress every N candidate rows per tenant (default: 500). Use 1 for every row.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        schema_name_arg = options.get("schema_name")
        all_organizations = options["all_organizations"]
        progress_every = max(1, options["progress_every"])

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no changes will be saved"))

        now = timezone.now()
        total_updated = 0

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.all()
            if not all_organizations:
                org_qs = org_qs.filter(is_microsoft_on=True)
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            organizations = list(org_qs)

        if schema_name_arg and not organizations:
            self.stderr.write(
                self.style.ERROR(
                    f"No organization found for schema_name={schema_name_arg!r} "
                    f"(check is_microsoft_on unless --all-organizations)."
                )
            )
            return

        self.stdout.write(f"Organizations to scan: {len(organizations)}")

        for org in organizations:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                self.stdout.write(
                    self.style.WARNING(f"Skipping org (no schema_name): {org}")
                )
                continue

            with schema_context(schema_name):
                qs = (
                    UserAttendance.objects.filter(
                        hourly_rate_at_creation__isnull=True,
                        leave_datetime__lt=now,
                        join_datetime__lt=F("leave_datetime"),
                    )
                    .select_related("user", "course")
                )

                total_candidates = qs.count()
                if total_candidates == 0:
                    self.stdout.write(
                        f"  [{schema_name}] No matching candidate rows, skipping."
                    )
                    continue

                self.stdout.write(
                    f"  [{schema_name}] Scanning {total_candidates} candidate row(s) "
                    f"(progress every {progress_every})..."
                )
                t0 = time.perf_counter()
                supports_specific = getattr(
                    org, "supports_course_specific_rates", False
                )
                if supports_specific:
                    pair_set = set(qs.values_list("user_id", "course_id"))
                    uc_lookup = build_user_course_teacher_hourly_rate_lookup(pair_set)
                else:
                    uc_lookup = None
                to_update = []
                for i, att in enumerate(qs, start=1):
                    rate = get_hourly_rate_for_teacher_course(
                        att.user,
                        att.course,
                        org,
                        user_course_hourly_rate_lookup=uc_lookup,
                    )
                    if rate is not None:
                        att.hourly_rate_at_creation = rate
                        to_update.append(att)
                    if i % progress_every == 0 or i == total_candidates:
                        elapsed = time.perf_counter() - t0
                        self.stdout.write(
                            f"  [{schema_name}] ... {i}/{total_candidates} scanned "
                            f"({elapsed:.1f}s elapsed)"
                        )

                if to_update:
                    count = len(to_update)
                    bulk_elapsed = 0.0
                    if not dry_run:
                        t_bulk = time.perf_counter()
                        UserAttendance.objects.bulk_update(
                            to_update, ["hourly_rate_at_creation"]
                        )
                        bulk_elapsed = time.perf_counter() - t_bulk
                    total_updated += count
                    elapsed_total = time.perf_counter() - t0
                    if dry_run:
                        self.stdout.write(
                            self.style.WARNING(
                                f"  [{schema_name}] dry-run: would update {count} of "
                                f"{total_candidates} scanned row(s) "
                                f"(scan {elapsed_total:.1f}s, no DB write)"
                            )
                        )
                    else:
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  [{schema_name}] Updated {count} of "
                                f"{total_candidates} scanned row(s) — "
                                f"scan {elapsed_total - bulk_elapsed:.1f}s, "
                                f"bulk_update {bulk_elapsed:.2f}s, "
                                f"total {elapsed_total:.1f}s"
                            )
                        )
                else:
                    elapsed_total = time.perf_counter() - t0
                    self.stdout.write(
                        f"  [{schema_name}] No rates resolved for {total_candidates} "
                        f"candidate(s) ({elapsed_total:.1f}s)."
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f"Backfill complete. Total records updated: {total_updated}"
            )
        )
