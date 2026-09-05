"""
Delete student UserEvent rows with no active student UserCourse on the event's course.

One-time cleanup for rows left after student removal / dropout migration while
UserEvent history was preserved.

Usage:
  python manage.py cleanup_orphan_student_userevents
  python manage.py cleanup_orphan_student_userevents --schema-name xschedjuice
  python manage.py cleanup_orphan_student_userevents --schema-name xschedjuice --course-id 42
  python manage.py cleanup_orphan_student_userevents --schema-name xschedjuice --execute
"""

from __future__ import annotations

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.orphan_userevent_cleanup import (
    delete_orphan_student_userevents,
    orphan_student_userevents_qs,
    summarize_orphans,
)
from app_course.models import Course
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Report or delete orphan student UserEvent rows (no active student "
        "UserCourse on the course). Defaults to dry-run; pass --execute to delete."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            default=None,
            help="Process only this tenant schema (e.g. xschedjuice).",
        )
        parser.add_argument(
            "--course-id",
            type=int,
            default=None,
            help="Limit to a single course id.",
        )
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Delete orphan rows (default is dry-run report only).",
        )
        parser.add_argument(
            "--summary-only",
            action="store_true",
            help="Print counts only; omit per-row sample lines.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            help="Delete batch size when --execute is set (default 500).",
        )

    def handle(self, *args, **options):
        schema_name_arg: str | None = options.get("schema_name")
        course_id: int | None = options.get("course_id")
        execute: bool = options["execute"]
        summary_only: bool = options["summary_only"]
        batch_size = max(1, options["batch_size"])

        if not execute:
            self.stdout.write(
                self.style.WARNING(
                    "DRY RUN — no rows will be deleted (pass --execute to delete)."
                )
            )

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.all()
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            schema_names = [o.schema_name for o in org_qs if o.schema_name]

        if schema_name_arg and not schema_names:
            raise CommandError(
                f"No organization found for schema_name={schema_name_arg!r}."
            )

        self.stdout.write(f"Organizations to scan: {len(schema_names)}")

        grand_total = 0
        grand_deleted = 0

        for schema_name in schema_names:
            with schema_context(schema_name):
                if course_id is not None and not Course.objects.filter(id=course_id).exists():
                    self.stdout.write(
                        self.style.WARNING(
                            f"\nSchema: {schema_name}\n"
                            f"  course_id={course_id} not found; skipping."
                        )
                    )
                    continue

                qs = orphan_student_userevents_qs(course_id=course_id)
                summary = summarize_orphans(qs)

            total = summary["total_count"]
            grand_total += total

            self.stdout.write(
                self.style.NOTICE(f"\nSchema: {schema_name}\n  orphan UserEvents: {total}")
            )

            if summary["per_course"]:
                for cid, count in sorted(summary["per_course"].items()):
                    self.stdout.write(f"    course_id={cid}: {count}")

            if not summary_only and summary["samples"]:
                for row in summary["samples"]:
                    self.stdout.write(
                        f"    id={row['user_event_id']} user={row['user_name']!r} "
                        f"({row['user_email']}) course={row['course_title']!r} "
                        f"event={row['event_date']} status={row['attendance_status']}"
                    )
                if total > len(summary["samples"]):
                    self.stdout.write(
                        f"    … and {total - len(summary['samples'])} more row(s)"
                    )

            if execute and total > 0:
                with schema_context(schema_name):
                    deleted = delete_orphan_student_userevents(
                        course_id=course_id,
                        batch_size=batch_size,
                    )
                grand_deleted += deleted
                self.stdout.write(
                    self.style.SUCCESS(f"  Deleted {deleted} orphan UserEvent row(s).")
                )

        if execute:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nTotal deleted across tenants: {grand_deleted} row(s)."
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"\nTotal orphan rows found: {grand_total} (dry-run; no changes made)."
                )
            )
