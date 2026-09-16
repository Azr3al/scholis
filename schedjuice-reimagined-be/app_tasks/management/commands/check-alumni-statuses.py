import logging
import sys
from datetime import datetime, time

from django.core.management import BaseCommand
from django.db.models import Exists, OuterRef
from django.utils import timezone

from app_auth.models import User
from app_course.course_status import effective_status_q
from app_course.models import Course, UserCourse

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
logger.addHandler(handler)


def _get_current_org():
    from django.db import connection
    from tenant_schemas.utils import get_public_schema_name, schema_context
    from app_organization.models import Organization
    tenant_schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=tenant_schema).first()


class Command(BaseCommand):

    def handle(self, *args, **options):
        logger.info("Running [check-alumni-statuses]")
        org = _get_current_org()

        now_utc = timezone.now()
        today_utc_date = now_utc.date()

        student_qs = User.objects.filter(
            roles__contains=[User.UserRole.STUDENT],
            is_active=True,
        )

        active_course_ids = Course.objects.filter(
            effective_status_q(
                Course.CourseStatus.PLANNED,
                Course.CourseStatus.ACTIVE,
            )
        ).values("id")

        active_course_exists = UserCourse.objects.filter(
            user_id=OuterRef("pk"),
            course_id__in=active_course_ids,
        )
        any_enrollment_exists = UserCourse.objects.filter(
            user_id=OuterRef("pk"),
        )
        students_all_courses_ended_qs = student_qs.annotate(
            has_active_courses=Exists(active_course_exists),
            has_any_enrollment=Exists(any_enrollment_exists),
        ).filter(
            has_any_enrollment=True,
            has_active_courses=False,
        )

        students_starting_grace = list(
            students_all_courses_ended_qs.filter(grace_period_start__isnull=True)
        )

        for u in students_starting_grace:
            u.grace_period_start = datetime.combine(
                today_utc_date, time.min, tzinfo=timezone.utc
            )

        if students_starting_grace:
            logger.info(f"Setting grace_period_start for {len(students_starting_grace)} users")
            User.objects.bulk_update(students_starting_grace, ["grace_period_start"])

        # Deactivate users if alumni grace period is exceeded
        if org and org.alumni_grace_period_day is not None:
            today_utc_midnight = datetime.combine(today_utc_date, time.min, tzinfo=timezone.utc)
            students_to_deactivate = []
            for u in student_qs.filter(grace_period_start__isnull=False, is_active=True):
                delta_days = (today_utc_midnight - u.grace_period_start).days
                if delta_days > org.alumni_grace_period_day:
                    u.is_active = False
                    students_to_deactivate.append(u)
            if students_to_deactivate:
                logger.info(f"Deactivating {len(students_to_deactivate)} users exceeded alumni grace period")
                User.objects.bulk_update(students_to_deactivate, ["is_active"])
