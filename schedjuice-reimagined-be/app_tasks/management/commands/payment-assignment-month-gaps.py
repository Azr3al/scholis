"""
List courses where a Teams payment assignment is expected for a calendar month.

Default: only courses with no PaymentAssignment row (gaps). Use --include-existing
to list all courses that pass the same precheck as create_payment_assignment_for_course_month,
with a has_assignment column.

Usage:
  python manage.py payment-assignment-month-gaps --year 2026 --month 4
  python manage.py payment-assignment-month-gaps --year 2026 --month 4 --schema-name mytenant
  python manage.py payment-assignment-month-gaps --year 2026 --month 4 --include-existing
"""

import logging

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_microsoft.payment_assignment_helpers import iter_courses_expecting_payment_assignment_month
from app_organization.models import Organization

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = (
        "List courses expecting a payment assignment for a year/month "
        "(default: missing DB rows only)"
    )

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=True, help="Calendar year, e.g. 2026")
        parser.add_argument(
            "--month",
            type=int,
            required=True,
            help="Calendar month 1-12",
        )
        parser.add_argument(
            "--schema-name",
            type=str,
            help="Limit to this tenant schema (default: all Microsoft-enabled orgs)",
        )
        parser.add_argument(
            "--include-existing",
            action="store_true",
            help="Include courses that already have a PaymentAssignment row for this month",
        )

    def handle(self, *args, **options):
        year = options["year"]
        month = options["month"]
        include_existing = options["include_existing"]
        if month < 1 or month > 12:
            self.stderr.write(self.style.ERROR("month must be 1-12"))
            return

        with schema_context(get_public_schema_name()):
            if options.get("schema_name"):
                orgs = list(
                    Organization.objects.filter(
                        schema_name=options["schema_name"],
                        is_microsoft_on=True,
                    )
                )
            else:
                orgs = list(Organization.objects.filter(is_microsoft_on=True))

        for org in orgs:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                continue
            self.stdout.write(self.style.NOTICE(f"=== schema={schema_name} org={org.name} ==="))
            with schema_context(schema_name):
                rows = iter_courses_expecting_payment_assignment_month(
                    year,
                    month,
                    include_existing=include_existing,
                )
                if not rows:
                    self.stdout.write("  (no courses)")
                    continue
                for course, has_row in rows:
                    if include_existing:
                        self.stdout.write(
                            f"  id={course.id}\t{course.title!r}\thas_assignment={'yes' if has_row else 'no'}"
                        )
                    else:
                        self.stdout.write(f"  id={course.id}\t{course.title!r}")
