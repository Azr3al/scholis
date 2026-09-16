"""
Django management command to update existing Microsoft Teams payment assignments.
Recalculates display names (FM/HM naming) and due dates using the current helper
logic, then patches existing assignments in MS Teams.

Usage:
  python manage.py update-payment-assignments
    Update for current month for all tenants and courses.

  python manage.py update-payment-assignments --month 2 --year 2025
    Update February 2025 assignments for all tenants and courses.

  python manage.py update-payment-assignments --schema xteachersu --course_id 123 --month 2 --year 2025
    Update February 2025 assignments only for course 123 in tenant xteachersu.

  python manage.py update-payment-assignments --all
    Update all existing assignments across all months and tenants.

  python manage.py update-payment-assignments --dry-run
    List assignments that would be updated without making changes.
"""

import logging
from datetime import date

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import PaymentAssignment
from app_microsoft.payment_assignment_helpers import (
    ensure_graph_due_datetime_in_future,
    get_assignment_display_name,
    get_due_date_for_month,
    update_payment_assignment_async,
)
from app_organization.models import Organization

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Update Microsoft Teams payment assignment display names and due dates according to current rules"

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            type=str,
            help="Process only this tenant schema (default: all Microsoft-enabled orgs)",
        )
        parser.add_argument(
            "--course_id",
            type=int,
            help="Update assignments for a specific course only",
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
            "--all",
            action="store_true",
            help="Process all months that have assignments (ignores --month/--year)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List assignments that would be updated without making changes",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run updates synchronously (no async queue). Use if async only updates the first assignment.",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        logger.info("Running [update-payment-assignments]" + (" (dry-run)" if dry_run else ""))

        today = date.today()
        use_all = options.get("all", False)

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

        if use_all:
            months_to_process = self._get_all_months_with_assignments(orgs, options)
        else:
            year = options.get("year") or today.year
            month_index = options.get("month") or today.month
            months_to_process = [(year, month_index)]

        total_queued = 0

        for year, month_index in months_to_process:
            for org in orgs:
                schema_name = getattr(org, "schema_name", None)
                if not schema_name:
                    continue

                logger.info(f"Processing organization [{schema_name}] for {year}-{month_index}")

                with schema_context(schema_name):
                    qs = PaymentAssignment.objects.filter(
                        year=year,
                        month_index=month_index,
                    ).select_related("course")

                    if options.get("course_id"):
                        qs = qs.filter(course_id=options["course_id"])

                    for pa in qs:
                        if not pa.course.microsoft_group_id:
                            logger.info(
                                f"  PaymentAssignment {pa.id}: course {pa.course.id} has no microsoft_group_id, skipping"
                            )
                            continue

                        if dry_run:
                            target_date = date(year, month_index, 1)
                            display_name = get_assignment_display_name(
                                pa.course, year, month_index
                            )
                            due_dt = ensure_graph_due_datetime_in_future(
                                get_due_date_for_month(
                                    target_date, org, pa.course
                                ),
                                org,
                            )
                            self.stdout.write(
                                f"  Would update: Course {pa.course.id} ({pa.course.title}) "
                                f"{year}-{month_index} (PA {pa.id}) → display='{display_name}', "
                                f"due={due_dt.isoformat()}"
                            )
                        elif options.get("sync"):
                            from app_microsoft.graph_wrapper.education import MSEducation

                            target_date = date(year, month_index, 1)
                            display_name = get_assignment_display_name(
                                pa.course, year, month_index
                            )
                            due_dt = ensure_graph_due_datetime_in_future(
                                get_due_date_for_month(
                                    target_date, org, pa.course
                                ),
                                org,
                            )
                            try:
                                education = MSEducation(org)
                                res = education.update_assignment(
                                    class_id=pa.course.microsoft_group_id,
                                    assignment_id=pa.microsoft_assignment_id,
                                    display_name=display_name,
                                    due_datetime=due_dt,
                                )
                                if res.status_code in range(199, 300):
                                    total_queued += 1
                                    logger.info(
                                        f"  Updated course {pa.course.id} ({pa.course.title}) "
                                        f"{year}-{month_index} (PA {pa.id})"
                                    )
                                else:
                                    logger.error(
                                        f"  FAILED course {pa.course.id} (PA {pa.id}): "
                                        f"{res.status_code} {getattr(res, 'text', '')[:200]}"
                                    )
                            except Exception as exc:
                                logger.exception(
                                    f"  Exception updating PA {pa.id}: {exc}"
                                )
                            continue
                        else:
                            update_payment_assignment_async.delay(
                                pa.id,
                                schema_name,
                            )
                        total_queued += 1
                        if not dry_run and not options.get("sync"):
                            logger.info(
                                f"  Queued update for course {pa.course.id} ({pa.course.title}) "
                                f"{year}-{month_index} assignment (PaymentAssignment {pa.id})"
                            )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"Dry-run: {total_queued} assignment(s) would be updated"
                )
            )
        elif options.get("sync"):
            logger.info(f"Update complete. Updated {total_queued} payment assignment(s)")
            self.stdout.write(
                self.style.SUCCESS(f"Updated {total_queued} payment assignment(s)")
            )
        else:
            logger.info(f"Update complete. Queued {total_queued} payment assignment(s)")
            self.stdout.write(
                self.style.SUCCESS(f"Queued {total_queued} payment assignment(s)")
            )

    def _get_all_months_with_assignments(
        self, orgs: list, options: dict
    ) -> list[tuple[int, int]]:
        """Discover all (year, month_index) pairs that have assignments."""
        seen = set()
        for org in orgs:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                continue
            with schema_context(schema_name):
                qs = PaymentAssignment.objects.values_list("year", "month_index").distinct()
                if options.get("course_id"):
                    qs = qs.filter(course_id=options["course_id"])
                for year, month_index in qs:
                    seen.add((year, month_index))
        return sorted(seen)

