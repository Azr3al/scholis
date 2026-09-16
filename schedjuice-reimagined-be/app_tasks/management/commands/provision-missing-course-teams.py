"""
Backfill Microsoft Teams education classes for courses missing microsoft_group_id.
"""

import logging
import time

from django.core.management import BaseCommand
from tenant_schemas.utils import schema_context

from app_course.models import Course
from app_microsoft.flows import _MS_GRAPH_MUTATION_GAP_SEC
from app_microsoft.team_provisioning_helpers import provision_course_team
from app_organization.models import Organization

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Create Microsoft Teams classes for courses with null microsoft_group_id "
        "when Microsoft integration and team creation are enabled."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            help="Limit to one tenant schema",
        )
        parser.add_argument(
            "--course-id",
            type=int,
            help="Only this course (requires --schema-name)",
        )
        parser.add_argument(
            "--since-date",
            type=str,
            help="Only courses created on or after YYYY-MM-DD",
        )

    def handle(self, *args, **options):
        schema_filter = options.get("schema_name")
        course_id = options.get("course_id")
        since_date = options.get("since_date")

        if course_id is not None and not schema_filter:
            self.stderr.write(self.style.ERROR("--course-id requires --schema-name"))
            return

        orgs = Organization.objects.filter(
            is_microsoft_on=True,
            is_teams_creation_enabled=True,
        )
        if schema_filter:
            orgs = orgs.filter(schema_name=schema_filter)

        total = 0
        failed = 0
        for org in orgs:
            with schema_context(org.schema_name):
                course_qs = Course.objects.filter(microsoft_group_id__isnull=True)
                if course_id is not None:
                    course_qs = course_qs.filter(id=course_id)
                if since_date:
                    course_qs = course_qs.filter(created_at__date__gte=since_date)
                courses = list(course_qs.select_related("category").order_by("id"))
                if course_id is not None and not courses:
                    self.stderr.write(
                        self.style.WARNING(
                            f"No course id={course_id} with null microsoft_group_id "
                            f"in {org.schema_name}"
                        )
                    )
                for course in courses:
                    try:
                        provision_course_team(course, org)
                        course.refresh_from_db()
                        if course.microsoft_group_id:
                            total += 1
                            self.stdout.write(
                                f"Provisioned team for course {course.id} "
                                f"({course.title!r}) in {org.schema_name}"
                            )
                        else:
                            failed += 1
                            self.stderr.write(
                                self.style.WARNING(
                                    f"Skipped course {course.id} in {org.schema_name} "
                                    "(teams creation disabled or already provisioned)"
                                )
                            )
                    except Exception as exc:
                        failed += 1
                        logger.exception(
                            "provision-missing-course-teams failed course_id=%s schema=%s",
                            course.id,
                            org.schema_name,
                        )
                        self.stderr.write(
                            self.style.ERROR(
                                f"Failed course {course.id} in {org.schema_name}: {exc}"
                            )
                        )
                    time.sleep(_MS_GRAPH_MUTATION_GAP_SEC)
            self.stdout.write(f"Processed schema {org.schema_name}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Provisioned {total} course team(s); {failed} skipped or failed."
            )
        )
