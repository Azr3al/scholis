"""
Delete pending invoices issued before a late joiner's billing anchor.

Usage:
  python manage.py delete-pre-join-invoices --course-id 123 --dry-run
  python manage.py delete-pre-join-invoices --course-id 123 --schema-name xschedjuice
"""

from __future__ import annotations

from datetime import datetime, time

from django.core.management.base import BaseCommand
from django.utils import timezone as dj_timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course, UserCourse
from app_finance.enrollment_anchor import resolve_anchor_for_enrollment
from app_finance.models import UserPayment
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
            required=True,
            help="Course whose late-joiner invoices should be cleaned up.",
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
        course_id = options["course_id"]
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
                course = Course.objects.filter(id=course_id).first()
                if course is None:
                    continue
                deleted = self._cleanup_course(course_id, dry_run=dry_run)
                total_deleted += deleted
                if deleted:
                    self.stdout.write(
                        f"[{schema_name}] course {course_id}: "
                        f"{'would delete' if dry_run else 'deleted'} {deleted} row(s)"
                    )

        if total_deleted == 0:
            self.stdout.write("No matching pending_payment rows found.")
        elif dry_run:
            self.stdout.write(
                self.style.NOTICE(
                    f"Re-run with --apply to delete {total_deleted} row(s)."
                )
            )

    def _cleanup_course(self, course_id: int, *, dry_run: bool) -> int:
        enrollments = UserCourse.objects.filter(
            course_id=course_id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        ids_to_delete: list[int] = []
        for enrollment in enrollments:
            anchor = enrollment.billing_cycle_anchor_date or resolve_anchor_for_enrollment(
                enrollment
            )
            if anchor is None:
                continue
            anchor_end = dj_timezone.make_aware(
                datetime.combine(anchor, time.max),
                timezone=dj_timezone.utc,
            )
            qs = UserPayment.objects.filter(
                user_id=enrollment.user_id,
                course_id=course_id,
                status=UserPayment.Status.PENDING_PAYMENT,
                billing_end_date__lt=anchor_end,
            )
            ids_to_delete.extend(qs.values_list("id", flat=True))

        if not ids_to_delete:
            return 0
        unique_ids = sorted(set(ids_to_delete))
        if dry_run:
            for payment_id in unique_ids:
                payment = UserPayment.objects.filter(id=payment_id).first()
                if payment:
                    self.stdout.write(
                        f"  payment {payment_id}: user={payment.user_id} "
                        f"billing_end={payment.billing_end_date}"
                    )
            return len(unique_ids)

        deleted, _ = UserPayment.objects.filter(id__in=unique_ids).delete()
        return deleted
