"""
List student-role users who have no course assignment for a tenant.

Usage:
  python manage.py list_students_without_courses --schema-name xschedjuice
  python manage.py list_students_without_courses --schema-name xschedjuice --without-active-enrollment
  python manage.py list_students_without_courses --schema-name xschedjuice --include-inactive
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.student_enrollment import (
    students_without_active_course_enrollment_qs,
    students_without_any_course_enrollment_qs,
)
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "List student-role users without course assignments for a tenant schema."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            required=True,
            help="Tenant schema to scan (e.g. xschedjuice).",
        )
        parser.add_argument(
            "--without-active-enrollment",
            action="store_true",
            help=(
                "Include alumni with only ended courses (default: only students "
                "with zero enrollments ever)."
            ),
        )
        parser.add_argument(
            "--include-inactive",
            action="store_true",
            help="Include inactive student-role users.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of rows to print.",
        )

    def handle(self, *args, **options):
        schema_name: str = options["schema_name"]
        without_active_enrollment: bool = options["without_active_enrollment"]
        include_inactive: bool = options["include_inactive"]
        limit: int | None = options["limit"]

        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema_name).first()

        if org is None:
            raise CommandError(
                f"No organization found for schema_name={schema_name!r}."
            )

        mode_label = (
            "no active enrollment"
            if without_active_enrollment
            else "never enrolled"
        )

        with schema_context(schema_name):
            if without_active_enrollment:
                qs = students_without_active_course_enrollment_qs(
                    include_inactive_users=include_inactive,
                )
            else:
                qs = students_without_any_course_enrollment_qs(
                    include_inactive_users=include_inactive,
                )

            total_count = qs.count()
            students = qs.order_by("name", "id").values(
                "id", "code", "name", "email"
            )
            if limit is not None:
                students = students[: max(0, limit)]

            rows = list(students)

        self.stdout.write(
            self.style.NOTICE(
                f"Schema: {schema_name}\n"
                f"Mode: {mode_label}\n"
                f"Students found: {total_count}"
            )
        )

        if not rows:
            self.stdout.write("No matching students.")
            return

        for row in rows:
            code = row["code"] or "-"
            self.stdout.write(
                f"id={row['id']} code={code!r} name={row['name']!r} "
                f"email={row['email']}"
            )

        if limit is not None and total_count > len(rows):
            self.stdout.write(
                self.style.WARNING(
                    f"Showing {len(rows)} of {total_count} (limit={limit})."
                )
            )
