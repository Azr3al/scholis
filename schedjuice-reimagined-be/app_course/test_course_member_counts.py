import unittest
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.course_member_counts import (
    REFRESH_COURSE_MEMBER_COUNTS_TASK,
    queue_refresh_course_member_counts,
    refresh_course_member_counts_in_current_schema,
    refresh_course_member_counts_now,
)
from app_course.models import AssignedAsRole, Category, Course, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class CourseMemberCountsNowTest(SimpleTestCase):
    def test_now_noop_empty_ids(self):
        refresh_course_member_counts_now([])


class CourseMemberCountsQueueTest(SimpleTestCase):
    @patch("app_course.course_member_counts.refresh_course_member_counts_async.delay")
    @patch("django.db.transaction.on_commit", lambda fn: fn())
    def test_queue_refresh_calls_async_task(self, mock_delay):
        queue_refresh_course_member_counts("xschedjuice", [1, 1, 2])
        mock_delay.assert_called_once_with("xschedjuice", [1, 2])

    @patch("app_course.course_member_counts.refresh_course_member_counts_async.delay")
    @patch("django.db.transaction.on_commit", lambda fn: fn())
    def test_queue_refresh_skips_empty_ids(self, mock_delay):
        queue_refresh_course_member_counts("xschedjuice", [])
        mock_delay.assert_not_called()


@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class CourseMemberCountsScopedSqlTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        cls._telegram_invite_patch = patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._telegram_remove_patch = patch(
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
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def test_scoped_refresh_sets_student_and_teacher_counts(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            self.assertIsNotNone(category)
            main_role, _ = AssignedAsRole.objects.get_or_create(
                name="Main Teacher (member counts test)",
                defaults={"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
            )
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT]
            ).first()
            teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER]
            ).first()
            self.assertIsNotNone(student)
            self.assertIsNotNone(teacher)

            course = Course.objects.create(
                title=f"Count test {uuid4()}",
                code=f"CT-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=teacher,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=main_role,
            )
            cid = course.id

        with schema_context(self.schema_name):
            refresh_course_member_counts_in_current_schema([cid])
            course = Course.objects.get(id=cid)
            self.assertEqual(course.student_count, 1)
            self.assertEqual(course.main_teacher_count, 1)
            self.assertEqual(course.assistant_teacher_count, 0)

    def test_substitute_teacher_not_counted_as_main_teacher(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            mt_role, _ = AssignedAsRole.objects.get_or_create(
                name="Main Teacher (sub count test)",
                defaults={"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
            )
            sub_role = AssignedAsRole.objects.create(
                name=f"Substitute MT-{uuid4().hex[:6]}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=True,
            )
            teachers = list(
                User.objects.filter(roles__contains=[User.UserRole.TEACHER])[:2]
            )
            self.assertGreaterEqual(len(teachers), 2)

            course = Course.objects.create(
                title=f"Sub count test {uuid4()}",
                code=f"SCT-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            UserCourse.objects.create(
                user=teachers[0],
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=mt_role,
            )
            UserCourse.objects.create(
                user=teachers[1],
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=sub_role,
            )
            cid = course.id

        with schema_context(self.schema_name):
            refresh_course_member_counts_in_current_schema([cid])
            course = Course.objects.get(id=cid)
            self.assertEqual(course.main_teacher_count, 1)

            refresh_course_member_counts_in_current_schema(None)
            course.refresh_from_db()
            self.assertEqual(course.main_teacher_count, 1)
