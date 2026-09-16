import logging
import sys

from django.core.management import BaseCommand
from django.db import connection, transaction
from app_reports.services import get_course_type

from app_course.course_member_counts import refresh_course_member_counts_in_current_schema
from app_course.course_status import repair_course_history_for_schema
from app_course.models import Course

ADVISORY_LOCK_ID = 987654  # any constant int, just be consistent

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
logger.addHandler(handler)


class Command(BaseCommand):
    def handle(self, *args, **options):
        logger.info("Running [process-courses]")
        with connection.cursor() as cursor:
            # 1️⃣ Prevent overlapping runs
            cursor.execute("SELECT pg_try_advisory_lock(%s);", [ADVISORY_LOCK_ID])
            locked = cursor.fetchone()[0]

            if not locked:
                self.stdout.write("Another sync is running. Exiting.")
                return

        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET search_path TO %s;", [connection.schema_name])
                    courses = Course.objects.prefetch_related("events").all()
                    for course in courses:
                        course.course_type = get_course_type(course)
                    Course.objects.bulk_update(courses, ["course_type"])

                    created, deleted = repair_course_history_for_schema()
                    logger.info(
                        "CourseHistory repair: created=%s deleted=%s",
                        created,
                        deleted,
                    )

                    # 5️⃣ Update student_count & teacher counts
                    refresh_course_member_counts_in_current_schema(None)

        finally:
            # 6️⃣ Always release advisory lock
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s);", [ADVISORY_LOCK_ID])
