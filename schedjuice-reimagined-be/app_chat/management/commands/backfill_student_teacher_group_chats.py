"""Backfill student–teacher group chat threads for a tenant."""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_chat.student_teacher_group_chat import (
    student_teacher_group_chat_enabled,
    sync_student_teacher_group_thread,
)
from app_course.models import UserCourse
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Create or update student–teacher group chat threads for all open "
        "student enrollments in a tenant schema."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            required=True,
            help="Tenant schema name (e.g. xschedjuice)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report counts without writing threads or participants.",
        )

    def handle(self, *args, **options):
        schema_name = options["schema_name"]
        dry_run = options["dry_run"]

        with schema_context(get_public_schema_name()):
            tenant = Organization.objects.filter(schema_name=schema_name).first()
        if tenant is None:
            raise CommandError(f"Unknown tenant schema: {schema_name}")
        if not student_teacher_group_chat_enabled(tenant):
            raise CommandError(
                "is_student_teacher_group_chat_enabled is False for this tenant. "
                "Enable the flag before backfilling."
            )

        created = 0
        updated = 0
        skipped = 0

        with schema_context(schema_name):
            enrollments = UserCourse.objects.filter(
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).values_list("user_id", "course_id")
            for student_id, course_id in enrollments:
                if dry_run:
                    self.stdout.write(
                        f"would sync student={student_id} course={course_id}"
                    )
                    skipped += 1
                    continue
                from app_chat.models import ChatThread, ChatThreadKind
                from app_chat.student_teacher_group_chat import (
                    build_student_teacher_group_key,
                )

                key = build_student_teacher_group_key(student_id, course_id)
                existed = ChatThread.objects.filter(
                    kind=ChatThreadKind.GROUP, group_key=key
                ).exists()
                thread = sync_student_teacher_group_thread(
                    student_id, course_id, tenant
                )
                if thread is None:
                    skipped += 1
                elif existed:
                    updated += 1
                else:
                    created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. created={created} updated={updated} skipped={skipped}"
                + (" (dry-run)" if dry_run else "")
            )
        )
