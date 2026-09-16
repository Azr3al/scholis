"""
Django management command to delete Microsoft Teams payment assignments.
Deletes from MS Teams and the local database.

Usage:
  python manage.py delete-payment-assignments --course_id 123 --month 2 --year 2025
    Delete February 2025 assignment for course 123.

  python manage.py delete-payment-assignments --course_id 123
    Delete all assignments for course 123.

  python manage.py delete-payment-assignments --month 2 --year 2025
    Delete all February 2025 assignments (all courses).

  python manage.py delete-payment-assignments --schema xteachersu --dry-run
    Dry-run: list assignments that would be deleted.
"""

import logging

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import PaymentAssignment
from app_microsoft.payment_assignment_helpers import (
    delete_payment_assignment,
    delete_payment_assignment_async,
)
from app_organization.models import Organization
from app_microsoft.payment_assignment_helpers import delete_payment_assignment_async

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Delete Microsoft Teams payment assignments (targetable by course_id, month, year)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            type=str,
            help="Process only this tenant schema (default: all Microsoft-enabled orgs)",
        )
        parser.add_argument(
            "--course_id",
            type=int,
            help="Target a specific course only",
        )
        parser.add_argument(
            "--month",
            type=int,
            help="Target month 1–12 (e.g. 2 = February). Use with --year.",
        )
        parser.add_argument(
            "--year",
            type=int,
            help="Target year (e.g. 2025). Use with --month.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List assignments that would be deleted without making changes",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run deletions synchronously (no async queue)",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        logger.info("Running [delete-payment-assignments]" + (" (dry-run)" if dry_run else ""))

        with schema_context(get_public_schema_name()):
            if options.get("schema"):
                orgs = list(
                    Organization.objects.filter(
                        schema_name=options["schema"],
                        is_microsoft_on=True,
                    )
                )
            else:
                orgs = list(Organization.objects.filter(is_microsoft_on=True))

        total_queued = 0
        total_failed = 0

        for org in orgs:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                continue

            with schema_context(schema_name):
                qs = PaymentAssignment.objects.select_related("course")

                if options.get("course_id"):
                    qs = qs.filter(course_id=options["course_id"])
                if options.get("month") is not None and options.get("year") is not None:
                    qs = qs.filter(
                        month_index=options["month"],
                        year=options["year"],
                    )

                for pa in qs:
                    if dry_run:
                        self.stdout.write(
                            f"  Would delete: Course {pa.course.id} ({pa.course.title}) "
                            f"{pa.year}-{pa.month_index} (PA {pa.id})"
                        )
                        total_queued += 1
                    elif options.get("sync"):
                        success, msg = delete_payment_assignment(pa, org)
                        if success:
                            total_queued += 1
                            logger.info(
                                f"  Deleted course {pa.course.id} ({pa.course.title}) "
                                f"{pa.year}-{pa.month_index} (PA {pa.id}): {msg}"
                            )
                        else:
                            total_failed += 1
                            logger.error(f"  FAILED to delete PA {pa.id}: {msg}")
                    else:
                        delete_payment_assignment_async.delay(
                            pa.id,
                            schema_name,
                        )
                        total_queued += 1
                        logger.info(
                            f"  Queued delete for course {pa.course.id} ({pa.course.title}) "
                            f"{pa.year}-{pa.month_index} (PA {pa.id})"
                        )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"Dry-run: {total_queued} assignment(s) would be deleted"
                )
            )
        elif options.get("sync"):
            self.stdout.write(
                self.style.SUCCESS(
                    f"Deleted {total_queued} assignment(s); {total_failed} failed"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f"Queued {total_queued} assignment(s)")
            )
