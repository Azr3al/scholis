"""Set Course.microsoft_meeting_organizer_id from main-teacher resolution (MT > AT > any teacher)."""

from django.core.management import BaseCommand
from tenant_schemas.utils import schema_context

from app_course.models import Course
from app_course.teams_organizer import get_course_teams_organizer_user
from app_organization.models import Organization


class Command(BaseCommand):
    help = "Backfill microsoft_meeting_organizer_id for courses with a Teams meeting."

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

    def handle(self, *args, **options):
        schema_filter = options.get("schema_name")
        course_id = options.get("course_id")
        if course_id is not None and not schema_filter:
            self.stderr.write(self.style.ERROR("--course-id requires --schema-name"))
            return

        qs = Organization.objects.filter(is_microsoft_on=True)
        if schema_filter:
            qs = qs.filter(schema_name=schema_filter)
        total = 0
        for org in qs:
            with schema_context(org.schema_name):
                course_qs = (
                    Course.objects.filter(microsoft_meeting_id__isnull=False)
                    .exclude(microsoft_meeting_id="")
                )
                if course_id is not None:
                    course_qs = course_qs.filter(id=course_id)
                courses = list(course_qs)
                if course_id is not None and not courses:
                    self.stderr.write(
                        self.style.WARNING(
                            f"No matching course id={course_id} with Teams meeting in {org.schema_name}"
                        )
                    )
                for course in courses:
                    u = get_course_teams_organizer_user(course)
                    if u and u.microsoft_id:
                        Course.objects.filter(pk=course.pk).update(
                            microsoft_meeting_organizer_id=u.microsoft_id
                        )
                        total += 1
            self.stdout.write(f"Processed schema {org.schema_name}")
        self.stdout.write(self.style.SUCCESS(f"Updated {total} course row(s)."))
