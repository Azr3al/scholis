"""
Django management command to create Microsoft Teams payment assignments programmatically.
Each course is processed asynchronously via django-q.

Only creates when the org-local calendar date is inside the same FM/HM catch-up window as
``ensure-payment-assignments`` (FM: 20th of prior month through last day of payment month;
HM: 9th through last day of payment month).

Usage:
  python manage.py create-payment-assignments
    Create for current month when today is in that month's window (per course FM/HM)

  python manage.py create-payment-assignments --course_id 123
    Create for course 123, current month (if in window)

  python manage.py create-payment-assignments --course_id 123 --month 2 --year 2025
    Create for course 123, February 2025 (if in window for that month)
"""

import logging
from datetime import date

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course, PaymentAssignment
from app_microsoft.payment_assignment_helpers import (
    create_payment_assignment_for_course_month,
    create_payment_assignment_for_course_month_async,
    is_first_month_of_course,
    org_local_today,
    payment_assignment_month_in_ensure_window,
)
from app_organization.models import Organization
from app_microsoft.payment_assignment_helpers import create_payment_assignment_for_course_month_async

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Create Microsoft Teams payment assignments for courses"

    def add_arguments(self, parser):
        parser.add_argument(
            "--course_id",
            type=int,
            help="Create for a specific course only",
        )
        parser.add_argument(
            "--month",
            type=int,
            help="Target month (1-12). Default: current month",
        )
        parser.add_argument(
            "--year",
            type=int,
            help="Target year. Default: current year",
        )
        parser.add_argument(
            "--schema",
            type=str,
            help="Process only this tenant schema (default: all Microsoft-enabled orgs)",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (no async queue). Default: async.",
        )

    def handle(self, *args, **options):
        run_sync = options.get("sync", False)
        if (
            not run_sync
            and options.get("course_id")
            and options.get("month")
            and options.get("year")
        ):
            run_sync = True
        logger.info("Running [create-payment-assignments]" + (" (sync)" if run_sync else " (async)"))

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

        total_created = 0
        for org in orgs:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                continue

            today_org = org_local_today(org)

            with schema_context(schema_name):
                if options.get("month") and options.get("year"):
                    target_date = date(options["year"], options["month"], 1)
                else:
                    target_date = date(today_org.year, today_org.month, 1)

                if options.get("course_id"):
                    courses = Course.objects.filter(id=options["course_id"])
                else:
                    courses = Course.objects.filter(
                        microsoft_group_id__isnull=False,
                        category__is_payment_assignment_eligible=True,
                    ).exclude(microsoft_group_id="")

                for course in courses:
                    if not course.is_payment_enabled:
                        continue
                    if course.end_date < target_date:
                        continue
                    # When creating for current month, course must have started (start_date <= today)
                    if (
                        target_date.year == today_org.year
                        and target_date.month == today_org.month
                        and course.start_date > today_org
                    ):
                        continue

                    year = target_date.year
                    month_index = target_date.month

                    if not payment_assignment_month_in_ensure_window(
                        today_org, year, month_index, course
                    ):
                        logger.info(
                            f"  Course {course.id} ({course.title}): "
                            f"{year}-{month_index} outside FM/HM create window for org today {today_org}, skipping"
                        )
                        continue

                    if PaymentAssignment.objects.filter(
                        course=course,
                        year=year,
                        month_index=month_index,
                    ).exists():
                        logger.info(
                            f"  Course {course.id} ({course.title}): "
                            f"{year}-{month_index} already exists, skipping"
                        )
                        continue

                    # Skip first month of course (students paid elsewhere)
                    if is_first_month_of_course(course, year, month_index):
                        logger.info(
                            f"  Course {course.id} ({course.title}): "
                            f"{year}-{month_index} is first month, skipping"
                        )
                        continue

                    if run_sync:
                        pa = create_payment_assignment_for_course_month(
                            course, org, year, month_index, target_date
                        )
                        if pa:
                            total_created += 1
                            logger.info(
                                f"  Created '{year}-{month_index}' for course {course.id} ({course.title})"
                            )
                    else:
                        create_payment_assignment_for_course_month_async.delay(
                            course.id,
                            schema_name,
                            year,
                            month_index,
                        )
                        total_created += 1
                        logger.info(
                            f"  Queued '{year}-{month_index}' for course {course.id} ({course.title})"
                        )

        if run_sync:
            logger.info(f"Complete. Created {total_created} payment assignment(s)")
        else:
            logger.info(f"Complete. Queued {total_created} payment assignment(s)")
        self.stdout.write(
            self.style.SUCCESS(f"{'Created' if run_sync else 'Queued'} {total_created} payment assignment(s)")
        )
