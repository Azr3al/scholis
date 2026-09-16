import logging
import sys

from django.core.management import BaseCommand

from app_auth.models import User
from app_course.course_status import course_is_effectively_planned_or_active
from app_course.models import UserCourse


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
logger.addHandler(handler)


class Command(BaseCommand):
    def handle(self, *args, **options):
        logger.info("Running [re-enable-alumni]")
        inactive_students = User.objects.filter(
            is_active=False,
            roles__contains=[User.UserRole.STUDENT],
            resigned_at__isnull=True,
        )
        if not inactive_students.exists():
            return

        inactive_student_ids = list(inactive_students.values_list("id", flat=True))
        enrollment_qs = (
            UserCourse.objects.select_related("course")
            .filter(
                user_id__in=inactive_student_ids,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
        )

        students_with_active_courses = set()
        for uc in enrollment_qs:
            if course_is_effectively_planned_or_active(uc.course):
                students_with_active_courses.add(uc.user_id)

        students_to_reenable = list(inactive_students.filter(id__in=students_with_active_courses))
        if students_to_reenable:
            for u in students_to_reenable:
                u.is_active = True
            logger.info(f"Re-enabling {len(students_to_reenable)} users with active/planned courses")
            User.objects.bulk_update(students_to_reenable, ["is_active"])
