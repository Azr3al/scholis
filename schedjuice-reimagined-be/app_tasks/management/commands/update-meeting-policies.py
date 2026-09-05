"""
Django management command to update meeting policies on existing Teams meetings.
PATCHes existing meetings (no new link). On success (sync), prints the re-fetched online meeting JSON from Graph.

By default updates policy settings only (lobby, breakout rooms, presenters).
With --participant-update, updates participants only (teachers as co-organizers).

Usage:
  python manage.py update-meeting-policies --schema <schema_name> --sync                 # policies only
  python manage.py update-meeting-policies --schema <schema_name> --sync --participant-update  # participants only
  python manage.py update-meeting-policies <course_id> --schema <schema_name> --sync --use-staffy-organizer  # Graph user_id = staffy
  python manage.py update-meeting-policies <course_id> --schema <schema_name> --sync     # single course
"""

import json
import logging

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course
from app_microsoft.meeting_helpers import update_course_meeting_policies
from app_organization.models import Organization
from app_tasks.update_meeting_policies_helpers import update_meeting_policies_for_course_async

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = (
        "Update meeting policies on existing Teams meetings (lobby=invited so students wait; teachers as "
        "co-organizers). Same link, no recreation. When run with --sync, also prints the full online meeting "
        "from Graph (GET after PATCH) as JSON. Async via django-q otherwise."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "course_id",
            type=int,
            nargs="?",
            default=None,
            help="Optional course ID. If omitted, updates all courses with meetings.",
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
        parser.add_argument(
            "--participant-update",
            action="store_true",
            default=False,
            help="Only update participants (teachers as co-organizers). "
            "Without this flag, only policy settings (lobby, breakout rooms, presenters) are sent.",
        )
        parser.add_argument(
            "--use-staffy-organizer",
            action="store_true",
            default=False,
            dest="use_staffy_organizer",
            help="Use staffy's Entra object id (STAFFY_AZURE_OBJECT_ID) as Graph /users/{id}/ "
            "for PATCH, instead of the course's resolved teacher/organizer. For meetings created "
            "under staffy when roster points at a different user.",
        )

    def handle(self, *args, **options):
        course_id = options["course_id"]
        schema_name = options["schema"]
        run_sync = options.get("sync", False)
        is_participant_update = options.get("participant_update", False)
        use_staffy_organizer = options.get("use_staffy_organizer", False)

        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema_name).first()
            if not org:
                self.stdout.write(
                    self.style.ERROR(f"Organization with schema '{schema_name}' not found.")
                )
                return

        with schema_context(schema_name):
            if course_id is not None:
                courses = Course.objects.filter(
                    id=course_id,
                    microsoft_meeting_id__isnull=False,
                ).exclude(microsoft_meeting_id="")
                if not courses.exists():
                    self.stdout.write(
                        self.style.ERROR(
                            f"Course {course_id} not found or has no meeting in schema '{schema_name}'."
                        )
                    )
                    return
            else:
                courses = Course.objects.filter(
                    microsoft_meeting_id__isnull=False
                ).exclude(microsoft_meeting_id="")

            updated = 0
            skipped = 0
            queued = 0
            for course in courses:
                if run_sync:
                    try:
                        success, reason, meeting_json = update_course_meeting_policies(
                            course,
                            org,
                            is_participant_update=is_participant_update,
                            use_staffy_organizer=use_staffy_organizer,
                        )
                        if success:
                            updated += 1
                            self.stdout.write(
                                self.style.SUCCESS(f"  Updated course {course.id} ({course.title})")
                            )
                            if meeting_json:
                                self.stdout.write(
                                    json.dumps(
                                        {"updated_online_meeting": meeting_json},
                                        indent=2,
                                        default=str,
                                    )
                                )
                            else:
                                self.stdout.write(
                                    "  (PATCH succeeded; re-fetch of online meeting from Graph had no data — see logs)"
                                )
                        else:
                            skipped += 1
                            self.stdout.write(
                                self.style.WARNING(
                                    f"  Skipped course {course.id} ({course.title}): {reason}"
                                )
                            )
                    except Exception as e:
                        logger.exception("Error updating meeting policies for course %s", course.id)
                        self.stdout.write(
                            self.style.ERROR(f"  Failed course {course.id} ({course.title}): {e}")
                        )
                else:
                    update_meeting_policies_for_course_async.delay(
                        course.id,
                        schema_name,
                        is_participant_update,
                        use_staffy_organizer,
                    )
                    queued += 1
                    self.stdout.write(f"  Queued course {course.id} ({course.title})")

            self.stdout.write("")
            if run_sync:
                summary = f"Done. Updated {updated} meeting(s)."
                if skipped:
                    summary += f" Skipped {skipped}."
                self.stdout.write(
                    self.style.SUCCESS(summary)
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Queued {queued} update task(s). Check django-q cluster for results."
                    )
                )
