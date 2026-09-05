import unittest
from datetime import date, datetime, time, timezone as dt_timezone
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import (
    AssignedAsRole,
    Category,
    Course,
    CourseMembershipEvent,
    Event,
    UserCourse,
)
from app_course.program_helpers import get_default_program
from app_course.roster_writes import (
    execute_assign_staff,
    execute_enroll_student,
    execute_remove_staff,
    execute_remove_student,
)
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from tenant_schemas.utils import get_public_schema_name


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class RosterWritesTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        cls._telegram_invite_patch = mock.patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._telegram_remove_patch = mock.patch(
            "app_telegram.signals.remove_telegram_member.delay"
        )
        cls._telegram_invite_patch.start()
        cls._telegram_remove_patch.start()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        cls._telegram_remove_patch.stop()
        cls._telegram_invite_patch.stop()
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)
            Organization.objects.filter(schema_name=cls.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                timezone="UTC",
            )

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-rw-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-rw-{suffix}@example.com",
                name="Admin RW",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-rw-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"student-rw-{suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"student-rw-{suffix}@example.com",
                name="Student RW",
                date_of_birth=date(1990, 1, 1),
                code=f"student-rw-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.teacher = User.objects.create_user(
                email=f"teacher-rw-{suffix}@example.com",
                password="pw",
                phone_number="3",
                communication_email=f"teacher-rw-{suffix}@example.com",
                name="Teacher RW",
                date_of_birth=date(1990, 1, 1),
                code=f"teacher-rw-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{suffix}")
            self.course = Course.objects.create(
                title=f"RW Course {suffix}",
                description="d",
                code=f"RW-{suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            self.at_role = AssignedAsRole.objects.create(
                name=f"AT {suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
            )
            mon = datetime(2026, 7, 6, 9, 0, tzinfo=dt_timezone.utc)
            tue = datetime(2026, 7, 7, 9, 0, tzinfo=dt_timezone.utc)
            self.mon_event = Event.objects.create(
                title="Mon",
                date=mon,
                time_from=time(9, 0),
                time_to=time(10, 0),
                course=self.course,
            )
            self.tue_event = Event.objects.create(
                title="Tue",
                date=tue,
                time_from=time(9, 0),
                time_to=time(10, 0),
                course=self.course,
            )

    def test_execute_enroll_student(self):
        with schema_context(self.schema_name):
            result = execute_enroll_student(
                actor=self.admin,
                course=self.course,
                student=self.student,
                source=CourseMembershipEvent.Source.TELEGRAM_BOT,
                tenant=self.org,
            )
            self.assertEqual(result["status"], "ok")
            self.assertTrue(
                UserCourse.objects.filter(
                    user_id=self.student.id,
                    course_id=self.course.id,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                ).exists()
            )
            event = CourseMembershipEvent.objects.latest("id")
            self.assertEqual(event.source, CourseMembershipEvent.Source.TELEGRAM_BOT)

    def test_execute_enroll_already_enrolled(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            result = execute_enroll_student(
                actor=self.admin,
                course=self.course,
                student=self.student,
                source=CourseMembershipEvent.Source.API,
                tenant=self.org,
            )
        self.assertEqual(result["error"], "already_enrolled")

    def test_execute_remove_student(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            result = execute_remove_student(
                actor=self.admin,
                course=self.course,
                student=self.student,
                source=CourseMembershipEvent.Source.WEB_AI,
                tenant=self.org,
            )
            self.assertEqual(result["status"], "ok")
            self.assertFalse(UserCourse.objects.filter(user_id=self.student.id).exists())

    def test_execute_assign_staff_all_sessions(self):
        with schema_context(self.schema_name):
            result = execute_assign_staff(
                actor=self.admin,
                course=self.course,
                staff=self.teacher,
                assigned_as_role=self.at_role,
                weekdays=None,
                source=CourseMembershipEvent.Source.TELEGRAM_BOT,
                tenant=self.org,
            )
            self.assertEqual(result["status"], "ok")
            self.assertEqual(result["sessions_assigned"], 2)
            self.assertEqual(
                UserEvent.objects.filter(user_id=self.teacher.id).count(),
                2,
            )

    def test_execute_assign_staff_weekdays(self):
        with schema_context(self.schema_name):
            result = execute_assign_staff(
                actor=self.admin,
                course=self.course,
                staff=self.teacher,
                assigned_as_role=self.at_role,
                weekdays=[1],
                source=CourseMembershipEvent.Source.TELEGRAM_BOT,
                tenant=self.org,
            )
            self.assertEqual(result["status"], "ok")
            self.assertEqual(result["sessions_assigned"], 1)

    def test_execute_assign_staff_already_assigned(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            result = execute_assign_staff(
                actor=self.admin,
                course=self.course,
                staff=self.teacher,
                assigned_as_role=self.at_role,
                weekdays=None,
                source=CourseMembershipEvent.Source.API,
                tenant=self.org,
            )
        self.assertEqual(result["error"], "already_assigned")

    def test_execute_remove_staff(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )
            UserEvent.objects.create(user=self.teacher, event=self.mon_event)
            result = execute_remove_staff(
                actor=self.admin,
                course=self.course,
                staff=self.teacher,
                source=CourseMembershipEvent.Source.TELEGRAM_BOT,
                tenant=self.org,
            )
            self.assertEqual(result["status"], "ok")
            self.assertFalse(
                UserCourse.objects.filter(
                    user_id=self.teacher.id, course_id=self.course.id
                ).exists()
            )
            ended = UserCourse.including_ended.get(
                user_id=self.teacher.id, course_id=self.course.id
            )
            self.assertIsNotNone(ended.left_at)
            self.assertEqual(UserEvent.objects.filter(user_id=self.teacher.id).count(), 0)
            self.assertEqual(
                UserEvent.all_objects.filter(
                    user_id=self.teacher.id, is_deleted=True
                ).count(),
                1,
            )

    def test_execute_remove_staff_preserves_user_events_with_checkin(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )
            UserEvent.objects.create(
                user=self.teacher,
                event=self.mon_event,
                checkin_time=timezone.now(),
            )
            self.assertEqual(
                UserEvent.objects.filter(
                    user_id=self.teacher.id, event__course_id=self.course.id
                ).count(),
                1,
            )

            result = execute_remove_staff(
                actor=self.admin,
                course=self.course,
                staff=self.teacher,
                source=CourseMembershipEvent.Source.WEB_AI,
                tenant=self.org,
            )
            self.assertEqual(result["status"], "ok")
            self.assertFalse(
                UserCourse.objects.filter(
                    course_id=self.course.id, user_id=self.teacher.id
                ).exists()
            )
            ended = UserCourse.including_ended.get(
                course_id=self.course.id, user_id=self.teacher.id
            )
            self.assertIsNotNone(ended.left_at)
            self.assertEqual(
                UserEvent.objects.filter(
                    user_id=self.teacher.id, event__course_id=self.course.id
                ).count(),
                1,
            )
