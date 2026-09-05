"""
Django management command to send the meeting link message to a course's Teams channel.
Usage: python manage.py send-meeting-link-to-channel <course_id> --schema <schema_name>
"""

import logging

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course
from app_microsoft.meeting_helpers import (
    post_meeting_link_to_channel,
    post_meeting_link_to_channel_async,
)
from app_organization.models import Organization
from app_microsoft.meeting_helpers import post_meeting_link_to_channel_async

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send the meeting link message to a course's Teams channel"

    def add_arguments(self, parser):
        parser.add_argument(
            "course_id",
            type=int,
            help="ID of the course",
        )
        parser.add_argument(
            "--schema",
            type=str,
            required=True,
            help="Tenant schema name (e.g. xteachersu)",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (no async queue). Default: async.",
        )

    def handle(self, *args, **options):
        course_id = options["course_id"]
        schema_name = options["schema"]
        run_sync = options.get("sync", False)

        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema_name).first()
            if not org:
                self.stdout.write(
                    self.style.ERROR(f"Organization with schema '{schema_name}' not found.")
                )
                return

        with schema_context(schema_name):
            course = Course.objects.filter(id=course_id).first()
            if not course:
                self.stdout.write(
                    self.style.ERROR(f"Course with id {course_id} not found in schema '{schema_name}'.")
                )
                return

        if run_sync:
            with schema_context(schema_name):
                try:
                    res = post_meeting_link_to_channel(course, org)
                    if res.status_code in range(199, 300):
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"Meeting link posted to channel for course '{course.title}' (id={course_id})"
                            )
                        )
                    else:
                        self.stdout.write(
                            self.style.ERROR(f"Failed to post message: {res.status_code} - {res.text}")
                        )
                except ValueError as e:
                    self.stdout.write(self.style.ERROR(str(e)))
                except Exception as e:
                    logger.exception("Error posting meeting link to channel")
                    self.stdout.write(self.style.ERROR(str(e)))
        else:
            post_meeting_link_to_channel_async.delay(
                course_id,
                schema_name,
            )
            self.stdout.write(
                self.style.SUCCESS(f"Meeting link post queued for course {course_id}. Check django-q for results.")
            )
