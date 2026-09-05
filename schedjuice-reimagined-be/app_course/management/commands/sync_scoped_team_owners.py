"""Backfill MS Teams owners for program/category course oversight scope."""
from __future__ import annotations

from django.core.management.base import BaseCommand
from tenant_schemas.utils import schema_context

from app_course.course_status import apply_effective_status_filter
from app_course.models import Course
from app_microsoft.scope_team_sync import sync_scoped_team_owners_for_course
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Add program/category scoped users as Microsoft Teams owners "
        "for course teams that already exist."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            dest="schema_name",
            help="Tenant schema name (required unless --all-tenants).",
        )
        parser.add_argument(
            "--all-tenants",
            action="store_true",
            help="Run for every tenant schema.",
        )
        parser.add_argument(
            "--course-id",
            type=int,
            dest="course_id",
            help="Limit to a single course id.",
        )

    def handle(self, *args, **options):
        schema_name = options.get("schema_name")
        all_tenants = options.get("all_tenants")
        course_id = options.get("course_id")

        if not all_tenants and not schema_name:
            self.stderr.write("Provide --schema-name or --all-tenants.")
            return

        if all_tenants:
            schemas = list(
                Organization.objects.exclude(schema_name="public").values_list(
                    "schema_name", flat=True
                )
            )
        else:
            schemas = [schema_name]

        for sn in schemas:
            tenant = Organization.objects.filter(schema_name=sn).first()
            if tenant is None:
                self.stderr.write(f"Unknown tenant schema: {sn}")
                continue
            with schema_context(sn):
                qs = Course.objects.exclude(microsoft_group_id__isnull=True).exclude(
                    microsoft_group_id=""
                )
                qs = apply_effective_status_filter(
                    qs,
                    [Course.CourseStatus.PLANNED, Course.CourseStatus.ACTIVE],
                )
                if course_id is not None:
                    qs = qs.filter(id=course_id)
                count = 0
                for course in qs.iterator():
                    sync_scoped_team_owners_for_course(course, tenant)
                    count += 1
                self.stdout.write(f"{sn}: synced scope owners for {count} course(s)")
