import unittest
from datetime import date, datetime, time
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement, PostType
from app_auth.models import User
from app_course.models import (
    AssignedAsRole,
    Category,
    Course,
    Event,
    Program,
    UserCourse,
)
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class CourseDataSheetTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"cds-m-{suffix}@example.com",
                password="x",
                name="Mgr",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"cds-m-{suffix}@example.com",
                code=f"cds-m-{suffix}",
                roles=[User.UserRole.MANAGER],
            )
            self.teacher_user = User.objects.create_user(
                email=f"cds-t-{suffix}@example.com",
                password="x",
                name="Aung Aung",
                alternative_name="AA",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"cds-t-{suffix}@example.com",
                code=f"cds-t-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"FCE-{suffix}", sort_order=1)
            self.program = Program.objects.create(name=f"P-cds-{suffix}")
            self.mt_role = AssignedAsRole.objects.create(
                name=f"MT-cds-{suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.course = Course.objects.create(
                title=f"FCE 59 WD-{suffix}",
                start_date=date(2026, 6, 5),
                end_date=date(2026, 6, 30),
                course_type="WD",
                category=self.cat,
                program=self.program,
                student_count=62,
                main_teacher_count=1,
                assistant_teacher_count=2,
            )
            Event.objects.create(
                title="s",
                date=date(2026, 6, 5),
                time_from=time(18, 40),
                time_to=time(20, 30),
                course=self.course,
            )
            UserCourse.objects.create(
                user=self.teacher_user,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        c.credentials(HTTP_TENANT=self.schema_name)
        return c

    def test_teacher_forbidden(self):
        resp = self._client(self.teacher_user).get(
            f"{self.api_prefix}/reports/course-data-sheet?date=2026-06-15"
        )
        self.assertEqual(resp.status_code, 403)

    def test_manager_gets_course_row_with_dates(self):
        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/course-data-sheet?date=2026-06-15"
        )
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()["data"]
        match = [r for r in rows if r["course_id"] == self.course.id]
        self.assertEqual(len(match), 1)
        row = match[0]
        self.assertEqual(row["start_date"], "2026-06-05")
        self.assertEqual(row["end_date"], "2026-06-30")

    def test_current_unit_from_most_recent_daily_lesson(self):
        with schema_context(self.schema_name):
            older = Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=5,
                data="<p>Unit 5</p>",
                html_data="<p>Unit 5</p>",
                course=self.course,
                created_by=self.manager,
            )
            newer = Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=8,
                data="<p>Unit 8</p>",
                html_data="<p>Unit 8</p>",
                course=self.course,
                created_by=self.manager,
            )
            Announcement.objects.filter(pk=older.pk).update(
                created_at=datetime(2026, 6, 10, 10, 0, tzinfo=timezone.utc),
                updated_at=datetime(2026, 6, 10, 10, 0, tzinfo=timezone.utc),
            )
            Announcement.objects.filter(pk=newer.pk).update(
                created_at=datetime(2026, 6, 20, 10, 0, tzinfo=timezone.utc),
                updated_at=datetime(2026, 8, 3, 14, 0, tzinfo=timezone.utc),
            )

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/course-data-sheet?date=2026-06-15"
        )
        self.assertEqual(resp.status_code, 200)
        row = next(r for r in resp.json()["data"] if r["course_id"] == self.course.id)
        self.assertEqual(row["current_unit"], 8)
        self.assertEqual(row["current_unit_updated_at"], "2026-08-03")

    def test_current_unit_null_when_daily_lesson_has_no_finished_unit(self):
        with schema_context(self.schema_name):
            Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=None,
                data="<p>No unit</p>",
                html_data="<p>No unit</p>",
                course=self.course,
                created_by=self.manager,
            )

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/course-data-sheet?date=2026-06-15"
        )
        self.assertEqual(resp.status_code, 200)
        row = next(r for r in resp.json()["data"] if r["course_id"] == self.course.id)
        self.assertIsNone(row["current_unit"])
        self.assertIsNone(row["current_unit_updated_at"])
