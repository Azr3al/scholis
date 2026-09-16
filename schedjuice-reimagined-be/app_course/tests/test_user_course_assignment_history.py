import base64
import json
import unittest
from datetime import date, timedelta
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.course_member_counts import refresh_course_member_counts_now
from app_course.models import AssignedAsRole, Category, Course, Program, UserCourse
from app_course.program_helpers import get_default_program
from app_course.user_course_lifecycle import close_teacher_user_course
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _b64_json(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class UserCourseAssignmentHistoryTests(TestCase):
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
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"hist-t-{suffix}@example.com",
                password="x",
                name="Hist Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            cat = Category.objects.first() or Category.objects.create(
                name=f"Hist {suffix}"
            )
            prog = get_default_program() or Program.objects.create(
                name=f"Hist Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Hist Course {suffix}",
                code=f"HC-{suffix}",
                category=cat,
                program=prog,
                start_date=date.today(),
                end_date=date.today() + timedelta(days=30),
            )

    def test_objects_hides_closed_rows(self):
        with schema_context(self.schema_name):
            uc = UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            uc.left_at = timezone.now()
            uc.save(update_fields=["left_at"])
            self.assertFalse(UserCourse.objects.filter(id=uc.id).exists())
            self.assertTrue(UserCourse.including_ended.filter(id=uc.id).exists())

    def test_partial_unique_allows_reassign_after_close(self):
        with schema_context(self.schema_name):
            first = UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            first.left_at = timezone.now()
            first.save(update_fields=["left_at"])
            second = UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            self.assertNotEqual(first.id, second.id)
            self.assertIsNone(second.left_at)

    def test_two_open_rows_rejected(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    UserCourse.including_ended.create(
                        user=self.teacher,
                        course=self.course,
                        assigned_as=UserCourse.AssignedAs.TEACHER,
                    )

    def test_close_teacher_sets_left_at(self):
        with schema_context(self.schema_name):
            uc = UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            closed = close_teacher_user_course(uc)
            self.assertIsNotNone(closed.left_at)
            self.assertFalse(UserCourse.objects.filter(id=uc.id).exists())
            self.assertTrue(UserCourse.including_ended.filter(id=uc.id).exists())

    def test_student_unassign_still_deletes(self):
        with schema_context(self.schema_name):
            student = User.objects.create_user(
                email=f"hist-s-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Hist Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            uc = UserCourse.objects.create(
                user=student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            uc_id = uc.id
            uc.delete()
            self.assertFalse(UserCourse.including_ended.filter(id=uc_id).exists())

    def test_closed_teacher_is_not_counted(self):
        with schema_context(self.schema_name):
            role = AssignedAsRole.objects.create(
                name=f"MT {uuid4().hex[:6]}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=False,
            )
            uc = UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=role,
            )
            refresh_course_member_counts_now([self.course.id])
            self.course.refresh_from_db()
            self.assertEqual(self.course.main_teacher_count, 1)
            close_teacher_user_course(uc)
            refresh_course_member_counts_now([self.course.id])
            self.course.refresh_from_db()
            self.assertEqual(self.course.main_teacher_count, 0)

    def test_course_expand_omits_closed_teacher(self):
        with schema_context(self.schema_name):
            manager = User.objects.create_user(
                email=f"hist-m-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Hist Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            uc = UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            close_teacher_user_course(uc)
            client = APIClient()
            client.force_authenticate(user=manager)
            client.credentials(HTTP_TENANT=self.schema_name)
            resp = client.get(
                f"/api/v1/courses/{self.course.id}",
                {"expand": _b64_json(["user_courses"])},
            )
            self.assertEqual(resp.status_code, 200, resp.content)
            rows = resp.json()["data"].get("user_courses") or []
            self.assertNotIn(uc.id, [row.get("id") for row in rows])
