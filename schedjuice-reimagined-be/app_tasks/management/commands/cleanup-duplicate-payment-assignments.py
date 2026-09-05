"""
Django management command to find and delete orphaned duplicate Microsoft Teams
payment assignments (Teams only — DB PaymentAssignment rows are kept).

Usage:
  python manage.py cleanup-duplicate-payment-assignments --schema xteachersu --dry-run
    Preview duplicates across tenant (sync scan).

  python manage.py cleanup-duplicate-payment-assignments --schema xteachersu
    Queue one django-q task per eligible course (async, default).

  python manage.py cleanup-duplicate-payment-assignments --schema xteachersu --course_id 123 --sync
    Dedupe a single course inline.
"""

import logging

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course, PaymentAssignment
from app_microsoft.payment_assignment_helpers import (
    cleanup_duplicate_payment_assignments_for_course,
    cleanup_duplicate_payment_assignments_for_course_async,
)
from app_organization.models import Organization

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _courses_for_cleanup(
    *,
    course_id: int | None,
    year: int | None,
    month: int | None,
):
    """Courses to scan: those with PaymentAssignment rows and/or eligible Teams classes."""
    if course_id:
        return list(Course.objects.filter(id=course_id))

    pa_qs = PaymentAssignment.objects.select_related("course")
    if year is not None:
        pa_qs = pa_qs.filter(year=year)
    if month is not None:
        pa_qs = pa_qs.filter(month_index=month)
    course_ids_from_pa = set(pa_qs.values_list("course_id", flat=True))

    eligible_qs = Course.objects.filter(
        microsoft_group_id__isnull=False,
        category__is_payment_assignment_eligible=True,
        is_payment_enabled=True,
    ).exclude(microsoft_group_id="")
    if course_ids_from_pa:
        eligible_qs = eligible_qs.filter(id__in=course_ids_from_pa)
    return list(eligible_qs.distinct())


class Command(BaseCommand):
    help = "Find and delete orphaned duplicate Teams payment assignments"

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            type=str,
            help="Process only this tenant schema (default: all Microsoft-enabled orgs)",
        )
        parser.add_argument(
            "--course_id",
            type=int,
            help="Limit to a single course",
        )
        parser.add_argument(
            "--month",
            type=int,
            help="Limit to payment month 1–12 (optional, use with --year)",
        )
        parser.add_argument(
            "--year",
            type=int,
            help="Limit to payment year (optional, use with --month)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List duplicates without deleting (always sync)",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run inline instead of queuing django-q tasks per course",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        run_sync = options.get("sync", False) or dry_run
        course_id = options.get("course_id")
        year = options.get("year")
        month = options.get("month")

        mode = "dry-run" if dry_run else ("sync" if run_sync else "async")
        logger.info("Running [cleanup-duplicate-payment-assignments] (%s)", mode)

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

        total_found = 0
        total_deleted = 0
        total_failed = 0
        total_queued = 0

        for org in orgs:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                continue

            with schema_context(schema_name):
                courses = _courses_for_cleanup(
                    course_id=course_id,
                    year=year,
                    month=month,
                )
                if not courses:
                    logger.info("  No courses to scan in schema %s", schema_name)
                    continue

                logger.info("  Schema %s: scanning %s course(s)", schema_name, len(courses))

                for course in courses:
                    if run_sync:
                        result = cleanup_duplicate_payment_assignments_for_course(
                            course,
                            org,
                            year=year,
                            month_index=month,
                            dry_run=dry_run,
                        )
                        total_found += result["found"]
                        total_deleted += result["deleted"]
                        total_failed += result["failed"]
                        for detail in result["details"]:
                            if "FAILED" in detail:
                                self.stderr.write(self.style.ERROR(f"  {detail}"))
                            elif dry_run:
                                self.stdout.write(self.style.WARNING(f"  {detail}"))
                            else:
                                self.stdout.write(f"  {detail}")
                    else:
                        cleanup_duplicate_payment_assignments_for_course_async.delay(
                            course.id,
                            schema_name,
                            year=year,
                            month_index=month,
                        )
                        total_queued += 1
                        logger.info(
                            "  Queued cleanup for course %s (%s)",
                            course.id,
                            course.title,
                        )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"Dry-run complete. Found {total_found} duplicate orphan(s) across scanned courses."
                )
            )
        elif run_sync:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Complete. Found {total_found}, deleted {total_deleted}, failed {total_failed}."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Queued cleanup for {total_queued} course(s). Check django-q for results."
                )
            )
