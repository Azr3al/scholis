"""
Backfill UserPaymentCoveredMonth rows for legacy is_fully_paid at_risk enrollments.

Converts fixable at_risk rows (has payments but no full coverage) into explicit
per-month coverage before UserCourse.is_fully_paid is removed.

Usage:
  python manage.py backfill-legacy-fully-paid-coverage --dry-run
  python manage.py backfill-legacy-fully-paid-coverage --schema-name xteachersu
  python manage.py backfill-legacy-fully-paid-coverage --csv /tmp/backfill-result.csv
"""

from __future__ import annotations

from pathlib import Path

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.legacy_fully_paid_backfill import (
    ACTION_FIXED,
    ACTION_SKIPPED_NO_COURSE_DATES,
    ACTION_SKIPPED_NO_PAYMENT,
    backfill_legacy_fully_paid_coverage,
    summarize_backfill_results,
    write_backfill_csv,
)
from app_finance.legacy_fully_paid_audit import legacy_is_fully_paid_field_exists
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Backfill full-course UserPaymentCoveredMonth rows for legacy "
        "UserCourse.is_fully_paid at_risk enrollments (before field removal)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print actions without writing to the database.",
        )
        parser.add_argument(
            "--schema-name",
            type=str,
            default=None,
            help="Process only this tenant schema (e.g. xteachersu).",
        )
        parser.add_argument(
            "--csv",
            type=str,
            default=None,
            metavar="PATH",
            help="Write backfill result rows to a CSV file.",
        )
        parser.add_argument(
            "--include-dropped",
            action="store_true",
            help="Include dropped-out student enrollments (excluded by default).",
        )

    def handle(self, *args, **options):
        if not legacy_is_fully_paid_field_exists():
            self.stdout.write(
                self.style.WARNING(
                    "UserCourse.is_fully_paid has been removed; nothing to backfill."
                )
            )
            return

        dry_run: bool = options["dry_run"]
        schema_name_arg: str | None = options.get("schema_name")
        csv_path: str | None = options.get("csv")
        include_dropped: bool = options["include_dropped"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved"))

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.all()
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            schema_names = [o.schema_name for o in org_qs if o.schema_name]

        if schema_name_arg and not schema_names:
            raise CommandError(
                f"No organization found for schema_name={schema_name_arg!r}."
            )

        self.stdout.write(f"Organizations to process: {len(schema_names)}")

        all_results = []
        grand_at_risk = 0

        for schema_name in schema_names:
            with schema_context(schema_name):
                results = backfill_legacy_fully_paid_coverage(
                    schema_name,
                    include_dropped=include_dropped,
                    dry_run=dry_run,
                )

            counts = summarize_backfill_results(results)
            at_risk_count = len(results)
            grand_at_risk += at_risk_count
            all_results.extend(results)

            prefix = "DRY " if dry_run else ""
            self.stdout.write(
                self.style.NOTICE(
                    f"\nSchema: {schema_name}\n"
                    f"  at_risk: {at_risk_count}  "
                    f"fixed: {counts.get(ACTION_FIXED, 0)}  "
                    f"skipped_no_payment: {counts.get(ACTION_SKIPPED_NO_PAYMENT, 0)}  "
                    f"skipped_no_course_dates: "
                    f"{counts.get(ACTION_SKIPPED_NO_COURSE_DATES, 0)}"
                )
            )

            for row in results:
                if row.action == ACTION_FIXED:
                    first = (
                        f"{row.first_month[0]}-{row.first_month[1]:02d}"
                        if row.first_month
                        else "—"
                    )
                    last = (
                        f"{row.last_month[0]}-{row.last_month[1]:02d}"
                        if row.last_month
                        else "—"
                    )
                    self.stdout.write(
                        f"  {prefix}FIXED user_course_id={row.user_course_id} "
                        f'course="{row.course_title}" payment_id={row.target_payment_id} '
                        f"months={first}..{last} added={row.months_added}"
                    )
                elif row.action == ACTION_SKIPPED_NO_PAYMENT:
                    self.stdout.write(
                        f"  {prefix}SKIP_NO_PAYMENT user_course_id={row.user_course_id} "
                        f'course="{row.course_title}" — {row.notes}'
                    )
                elif row.action == ACTION_SKIPPED_NO_COURSE_DATES:
                    self.stdout.write(
                        f"  {prefix}SKIP_NO_COURSE_DATES user_course_id={row.user_course_id} "
                        f'course="{row.course_title}" — {row.notes}'
                    )

        if csv_path:
            path = Path(csv_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", newline="", encoding="utf-8") as handle:
                write_backfill_csv(all_results, handle)
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nWrote {len(all_results)} result row(s) to {path}"
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nGrand total at_risk processed: {len(all_results)} "
                f"(from {grand_at_risk} at_risk enrollment(s))"
            )
        )
