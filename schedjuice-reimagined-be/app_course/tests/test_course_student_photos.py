import unittest
from datetime import date, timedelta
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.course_student_photos import course_staff_can_upload_student_image
from app_course.models import Category, Course, Program, UserCourse


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseStudentPhotoAuthTests(TestCase):
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

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Course {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
            )
            self.teacher = User.objects.create_user(
                email=f"t-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"t-{suffix}@example.com",
                code=f"t-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"s-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="2",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"s-{suffix}@example.com",
                code=f"s-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.outsider_teacher = User.objects.create_user(
                email=f"o-{suffix}@example.com",
                password="x",
                name="Outsider",
                phone_number="3",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"o-{suffix}@example.com",
                code=f"o-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_course_teacher_can_upload_for_enrolled_student(self):
        with schema_context(self.schema_name):
            self.assertTrue(
                course_staff_can_upload_student_image(
                    self.teacher, self.course, self.student
                )
            )

    def test_outsider_teacher_denied(self):
        with schema_context(self.schema_name):
            self.assertFalse(
                course_staff_can_upload_student_image(
                    self.outsider_teacher, self.course, self.student
                )
            )

    def test_student_actor_denied_even_when_self(self):
        with schema_context(self.schema_name):
            self.assertFalse(
                course_staff_can_upload_student_image(
                    self.student, self.course, self.student
                )
            )
