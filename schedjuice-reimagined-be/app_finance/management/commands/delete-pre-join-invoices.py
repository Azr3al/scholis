"""
Delete pending invoices issued before a late joiner's billing anchor.

Usage:
  python manage.py delete-pre-join-invoices --schema-name xschedjuice --dry-run
  python manage.py delete-pre-join-invoices --course-id 123 --schema-name xschedjuice --apply
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course, UserCourse
from app_finance.late_joiner_backfill import (
    delete_pre_join_pending_invoices,
    iter_candidate_enrollments,
)
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Remove pending_payment rows whose billing window ends before the "
        "student's billing_cycle_anchor_date (or resolved first session)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--course-id",
            type=int,
            default=None,
            help="Course whose late-joiner invoices should be cleaned up (optional).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List matching rows without deleting (default behaviour).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually delete matching pending_payment rows.",
        )
        parser.add_argument(
            "--schema-name",
            type=str,
            default=None,
            help="Tenant schema (defaults to all tenant schemas).",
        )

    def handle(self, *args, **options):
        course_id = options.get("course_id")
        dry_run = not options["apply"]
        schema_name_arg = options.get("schema_name")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no rows will be deleted"))

        with schema_context(get_public_schema_name()):
            if schema_name_arg:
                schemas = [schema_name_arg]
            else:
                schemas = list(
                    Organization.objects.exclude(
                        schema_name=get_public_schema_name()
                    ).values_list("schema_name", flat=True)
                )

        total_deleted = 0
        for schema_name in schemas:
            with schema_context(schema_name):
                if course_id is not None and not Course.objects.filter(id=course_id).exists():
                    continue
                enrollments = list(
                    iter_candidate_enrollments(course_id=course_id, force=True)
                )
                delete_rows, deleted = delete_pre_join_pending_invoices(
                    enrollments,
                    dry_run=dry_run,
                    course_id=course_id,
                )
                total_deleted += deleted
                if deleted:
                    scope = f"course {course_id}" if course_id else "tenant"
                    self.stdout.write(
                        f"[{schema_name}] {scope}: "
                        f"{'would delete' if dry_run else 'deleted'} {deleted} row(s)"
                    )
                    for row in delete_rows:
                        self.stdout.write(
                            f"  payment {row.payment_id}: user={row.user_id} "
                            f"billing_end={row.billing_end_date}"
                        )

        if total_deleted == 0:
            self.stdout.write("No matching pending_payment rows found.")
        elif dry_run:
            self.stdout.write(
                self.style.NOTICE(
                    f"Re-run with --apply to delete {total_deleted} row(s)."
                )
            )
