"""
Backfill billing_cycle_anchor_date for late joiners and remove pre-anchor pending invoices.

Usage:
  python manage.py backfill-late-joiner-billing --schema-name xschedjuice --dry-run
  python manage.py backfill-late-joiner-billing --schema-name xschedjuice --apply
"""

from __future__ import annotations

from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.late_joiner_backfill import run_late_joiner_backfill
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Set billing_cycle_anchor_date for late-joining students and delete "
        "pending_payment rows whose billing window ends before the anchor."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            required=True,
            help="Tenant schema name (required).",
        )
        parser.add_argument(
            "--course-id",
            type=int,
            default=None,
            help="Limit to a single course (optional).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report changes without writing (default when --apply omitted).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist anchors and delete matching pending invoices.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Recompute anchors even when billing_cycle_anchor_date is already set.",
        )

    def handle(self, *args, **options):
        schema_name = options["schema_name"]
        course_id = options.get("course_id")
        dry_run = not options["apply"]
        force = options["force"]

        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema_name).first()
        if org is None:
            raise CommandError(f"No organization for schema_name={schema_name!r}.")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no rows will be written"))

        with schema_context(schema_name):
            result = run_late_joiner_backfill(
                course_id=course_id,
                force=force,
                dry_run=dry_run,
            )

        self._print_summary(schema_name, result, dry_run=dry_run)

    def _print_summary(self, schema_name, result, *, dry_run: bool) -> None:
        if not result.anchors and not result.deleted_payments:
            self.stdout.write("No late joiner anchors or pre-anchor pending invoices found.")
            return

        by_course: dict[int, list] = defaultdict(list)
        for row in result.anchors:
            by_course[row.course_id].append(row)

        course_count = len(by_course)
        joiner_count = len(result.anchors)
        self.stdout.write(
            f"[{schema_name}] {joiner_count} late joiner(s) across {course_count} course(s)"
        )

        for cid, rows in sorted(by_course.items()):
            for row in rows:
                self.stdout.write(
                    f"  course {cid} {row.course_title!r}: "
                    f"user {row.user_id} anchor {row.new_anchor}"
                )

        if result.deleted_payments:
            payment_ids = sorted({r.payment_id for r in result.deleted_payments})
            verb = "would delete" if dry_run else "deleted"
            self.stdout.write(
                f"  {len(payment_ids)} pending invoice(s) {verb}: "
                f"{', '.join(str(i) for i in payment_ids)}"
            )
            for row in result.deleted_payments:
                self.stdout.write(
                    f"    payment {row.payment_id}: user={row.user_id} "
                    f"course={row.course_id} billing_end={row.billing_end_date}"
                )

        if dry_run and (result.anchors or result.deleted_payments):
            self.stdout.write(
                self.style.NOTICE("Re-run with --apply to write changes.")
            )
