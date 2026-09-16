"""
Sync meeting attendance (Microsoft Teams and/or Zoom) into UserAttendance.
Invoked daily by cron; queues django-q tasks per course unless --sync.

Teams: same behavior as legacy sync-teams-attendance (including --channel-meeting).
Zoom: report/meetings/{id}/participants when the tenant is Zoom-capable and the
course is eligible (school OAuth + ``zoom_account_id``, or personal Zoom + teacher OAuth).
"""

import logging

from django.core.management import BaseCommand
from django.db.models import Q
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course, ProcessedVideoAttendanceReport
from app_organization.models import Organization
from app_tasks.sync_attendance_helpers import (
    course_eligible_for_teams_attendance_sync,
    sync_attendance_for_course_async,
    tenant_teams_attendance_sync_enabled,
)
from app_tasks.sync_zoom_attendance_helpers import (
    sync_zoom_attendance_for_course_async,
    sync_zoom_attendance_for_course,
    course_eligible_for_zoom_attendance_sync,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _get_current_org():
    from django.db import connection

    tenant_schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=tenant_schema).first()


class Command(BaseCommand):
    help = "Sync Teams and/or Zoom meeting attendance into UserAttendance (per-tenant cron)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--course-id",
            type=int,
            help="Sync a single course (requires --schema-name)",
        )
        parser.add_argument(
            "--schema-name",
            type=str,
            help="Schema/tenant name (required with --course-id)",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (no async queue)",
        )
        parser.add_argument(
            "--reprocess",
            action="store_true",
            help="Clear processed meeting attendance markers for the course(s) then re-fetch",
        )
        parser.add_argument(
            "--channel-meeting",
            action="store_true",
            help=(
                "Teams only: filter listed reports to Course Event time windows; "
                "load rows via attendanceRecords list API."
            ),
        )

    def handle(self, *args, **options):
        course_id = options.get("course_id")
        schema_name = options.get("schema_name")
        run_sync = options.get("sync", False)
        channel_meeting = options.get("channel_meeting", False)
        reprocess = options.get("reprocess", False)

        if course_id is not None:
            if schema_name is None:
                self.stderr.write("Both --course-id and --schema-name are required for single-course sync")
                return
            logger.info(
                "Running [sync-meeting-attendance] for course %s in %s",
                course_id,
                schema_name,
            )
            with schema_context(get_public_schema_name()):
                tenant = Organization.objects.filter(schema_name=schema_name).first()
            if not tenant:
                self.stderr.write(self.style.ERROR(f"Tenant not found: {schema_name}"))
                return
            with schema_context(schema_name):
                course = Course.objects.filter(id=course_id).first()
            if not course:
                self.stderr.write(self.style.ERROR(f"Course {course_id} not found"))
                return

            if reprocess:
                with schema_context(schema_name):
                    deleted, _ = ProcessedVideoAttendanceReport.objects.filter(course=course).delete()
                self.stdout.write(
                    f"Cleared {deleted} processed meeting attendance marker(s) for course {course_id}"
                )

            if run_sync:
                from app_tasks.sync_attendance_helpers import sync_attendance_for_course

                total = 0
                with schema_context(schema_name):
                    if course_eligible_for_teams_attendance_sync(course, tenant):
                        total += sync_attendance_for_course(
                            course, tenant, channel_meeting=channel_meeting
                        )
                    if course_eligible_for_zoom_attendance_sync(course, tenant):
                        total += sync_zoom_attendance_for_course(course, tenant)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Meeting attendance sync complete: {total} record(s) created for course {course_id}"
                    )
                )
            else:
                if course_eligible_for_teams_attendance_sync(course, tenant):
                    sync_attendance_for_course_async.delay(
                        course_id,
                        schema_name,
                        channel_meeting,
                    )
                if course_eligible_for_zoom_attendance_sync(course, tenant):
                    sync_zoom_attendance_for_course_async.delay(
                        course_id,
                        schema_name,
                    )
                self.stdout.write(self.style.SUCCESS(f"Meeting attendance sync queued for course {course_id}"))
            return

        logger.info("Running [sync-meeting-attendance] (tenant-wide)")

        org = _get_current_org()
        if not org:
            return
        teams_sync = tenant_teams_attendance_sync_enabled(org)
        can_zoom = (
            org.video_conferencing_platform
            == Organization.VideoConferencingPlatform.ZOOM
            or org.has_active_zoom_account()
        )
        if not teams_sync and not can_zoom:
            return

        schema_name = org.schema_name
        logger.info(
            "%s attendance for organization [%s]",
            "Syncing" if run_sync else "Queueing",
            schema_name,
        )

        with schema_context(schema_name):
            courses_qs = Course.objects.filter(
                Q(microsoft_meeting_id__isnull=False) & ~Q(microsoft_meeting_id="")
                | (
                    Q(zoom_meeting_id__isnull=False)
                    & ~Q(zoom_meeting_id="")
                    & (
                        (
                            Q(zoom_meeting_source=Course.ZoomMeetingSource.SCHOOL)
                            & Q(zoom_account_id__isnull=False)
                            & ~Q(zoom_account_id="")
                        )
                        | Q(zoom_meeting_source=Course.ZoomMeetingSource.PERSONAL)
                    )
                )
            )

            total_created = 0
            for course in courses_qs:
                if reprocess:
                    ProcessedVideoAttendanceReport.objects.filter(course=course).delete()

                if run_sync:
                    from app_tasks.sync_attendance_helpers import sync_attendance_for_course

                    if course_eligible_for_teams_attendance_sync(course, org):
                        total_created += sync_attendance_for_course(
                            course, org, channel_meeting=channel_meeting
                        )
                    if course_eligible_for_zoom_attendance_sync(course, org):
                        total_created += sync_zoom_attendance_for_course(course, org)
                else:
                    if course_eligible_for_teams_attendance_sync(course, org):
                        sync_attendance_for_course_async.delay(
                            course.id,
                            schema_name,
                            channel_meeting,
                        )
                    if course_eligible_for_zoom_attendance_sync(course, org):
                        sync_zoom_attendance_for_course_async.delay(
                            course.id,
                            schema_name,
                        )

            if run_sync:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Meeting attendance sync complete: {total_created} record(s) created"
                    )
                )
            else:
                self.stdout.write(self.style.SUCCESS("Meeting attendance sync tasks queued"))
