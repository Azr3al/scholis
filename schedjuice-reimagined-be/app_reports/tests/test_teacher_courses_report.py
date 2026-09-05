import io
import unittest
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from unittest import mock
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Event, Program, UserCourse
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _utc_noon(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 12, 0, tzinfo=dt_timezone.utc)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class TeacherCoursesReportEndpointTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"
    month_from = date(2020, 6, 1)
    month_to = date(2020, 6, 30)

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
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                report_style=Organization.ReportStyle.TR_SU_STYLE,
            )
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"tc-fin-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.teacher = User.objects.create_user(
                email=f"tc-tch-{suffix}@example.com",
                password="x",
                name="Teacher Courses Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"tc-stu-{suffix}@example.com",
                password="x",
                name="Teacher Courses Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"TC API {suffix}")
            prog = Program.objects.create(
                name=f"TC API Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"TC Course {suffix}",
                category=cat,
                program=prog,
                start_date=self.month_from,
                end_date=self.month_to + timedelta(days=30),
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _role(self, seniority, *, suffix=None):
        with schema_context(self.schema_name):
            return AssignedAsRole.objects.create(
                name=f"TC {seniority} {suffix or uuid4().hex[:6]}",
                seniority=seniority,
                is_substitute=False,
            )

    def _assign_teacher(
        self,
        *,
        joined: date,
        left: date | None = None,
        course=None,
        role=None,
    ) -> UserCourse:
        with schema_context(self.schema_name):
            uc = UserCourse.objects.create(
                user=self.teacher,
                course=course or self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=role or self._role(AssignedAsRole.Seniority.MAIN_TEACHER),
            )
            uc.joined_at = _utc_noon(joined)
            uc.left_at = _utc_noon(left) if left is not None else None
            uc.save(update_fields=["joined_at", "left_at"])
            return uc

    def _get(self, user, date_from, date_to, **extra):
        params = {}
        if date_from is not None:
            params["date_from"] = date_from
        if date_to is not None:
            params["date_to"] = date_to
        params.update(extra)
        return self._client(user).get(
            f"{self.api_prefix}/reports/teacher-courses",
            params,
        )

    def _month_rows(self):
        resp = self._get(self.finance, self.month_from.isoformat(), self.month_to.isoformat())
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()["data"]

    def _row_for_teacher(self, rows):
        matches = [row for row in rows if row.get("user_id") == self.teacher.id]
        return matches[0] if matches else None

    def test_teacher_forbidden(self):
        resp = self._get(
            self.teacher, self.month_from.isoformat(), self.month_to.isoformat()
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_wrong_report_style_is_forbidden(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                report_style=Organization.ReportStyle.EXCELLENT_CHOICE_STYLE,
            )
        resp = self._get(
            self.finance, self.month_from.isoformat(), self.month_to.isoformat()
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_missing_date_from_is_bad_request(self):
        resp = self._get(self.finance, None, self.month_to.isoformat())
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("date_from", resp.json()["details"])

    def test_overlap_includes_left_mid_month(self):
        self._assign_teacher(joined=date(2020, 5, 1), left=date(2020, 6, 15))
        row = self._row_for_teacher(self._month_rows())
        self.assertIsNotNone(row)
        self.assertEqual(row["name"], self.teacher.name)
        self.assertEqual(row["email"], self.teacher.email)
        self.assertIn(self.course.title, row["assigned_classes"])
        self.assertEqual(row["course_id"], self.course.id)

    def test_overlap_excludes_left_before_month(self):
        self._assign_teacher(joined=date(2020, 4, 1), left=date(2020, 5, 31))
        self.assertIsNone(self._row_for_teacher(self._month_rows()))

    def test_overlap_excludes_joined_after_month(self):
        self._assign_teacher(joined=date(2020, 7, 1), left=None)
        self.assertIsNone(self._row_for_teacher(self._month_rows()))

    def test_still_open_included(self):
        self._assign_teacher(joined=date(2020, 5, 1), left=None)
        self.assertIsNotNone(self._row_for_teacher(self._month_rows()))

    def test_empty_month_returns_empty_list(self):
        resp = self._get(self.finance, "1990-01-01", "1990-01-31")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["data"], [])

    def test_students_never_appear(self):
        with schema_context(self.schema_name):
            uc = UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            uc.joined_at = _utc_noon(date(2020, 5, 1))
            uc.save(update_fields=["joined_at"])
        rows = self._month_rows()
        self.assertFalse(
            any(row.get("user_id") == self.student.id for row in rows)
        )

    def test_two_courses_are_separate_rows(self):
        with schema_context(self.schema_name):
            other = Course.objects.create(
                title=f"TC Course B {uuid4().hex[:6]}",
                category=self.course.category,
                program=self.course.program,
                start_date=date(2020, 6, 20),
                end_date=self.month_to + timedelta(days=30),
            )
        self._assign_teacher(joined=date(2020, 5, 1), left=None)
        self._assign_teacher(joined=date(2020, 5, 1), left=None, course=other)
        rows = [
            row
            for row in self._month_rows()
            if row.get("user_id") == self.teacher.id
        ]
        self.assertEqual(len(rows), 2)
        self.assertEqual({row["course_id"] for row in rows}, {self.course.id, other.id})
        for row in rows:
            self.assertNotIn("\n", row["assigned_classes"])

    def test_class_line_keeps_role_and_month_type_only(self):
        with schema_context(self.schema_name):
            Event.objects.create(
                title="WE session",
                date=datetime(2020, 6, 6, 0, 0, tzinfo=dt_timezone.utc),
                time_from=time(9, 0),
                time_to=time(10, 30),
                course=self.course,
            )
        self._assign_teacher(joined=date(2020, 5, 1), left=None)
        row = self._row_for_teacher(self._month_rows())
        self.assertIsNotNone(row)
        self.assertEqual(row["assigned_classes"], f"{self.course.title} (MT) FM")
        self.assertNotIn("WE", row["assigned_classes"])
        self.assertEqual(row["course_type"], "WE")
        self.assertEqual(row["duration"], "1h 30m")

    def test_duration_omits_zero_minutes_and_hours(self):
        with schema_context(self.schema_name):
            Event.objects.create(
                title="WD session",
                date=datetime(2020, 6, 8, 0, 0, tzinfo=dt_timezone.utc),
                time_from=time(9, 0),
                time_to=time(11, 0),
                course=self.course,
            )
        self._assign_teacher(joined=date(2020, 5, 1), left=None)
        row = self._row_for_teacher(self._month_rows())
        self.assertEqual(row["duration"], "2h")
        self.assertEqual(row["course_type"], "WD")

    def test_missing_events_use_dash_duration_and_other_type(self):
        self._assign_teacher(joined=date(2020, 5, 1), left=None)
        row = self._row_for_teacher(self._month_rows())
        self.assertEqual(row["duration"], "—")
        self.assertEqual(row["course_type"], "OTHER")

    def test_excludes_non_mt_at_roles(self):
        other = self._role(AssignedAsRole.Seniority.OTHER)
        self._assign_teacher(
            joined=date(2020, 5, 1), left=None, role=other
        )
        self.assertIsNone(self._row_for_teacher(self._month_rows()))

    def test_at_assignment_shows_at_marker(self):
        at = self._role(AssignedAsRole.Seniority.ASSISTANT_TEACHER)
        self._assign_teacher(joined=date(2020, 5, 1), left=None, role=at)
        row = self._row_for_teacher(self._month_rows())
        self.assertIsNotNone(row)
        self.assertIn(f"{self.course.title} (AT)", row["assigned_classes"])

    def test_post_returns_xlsx(self):
        self._assign_teacher(joined=date(2020, 5, 1), left=None)
        resp = self._client(self.finance).post(
            f"{self.api_prefix}/reports/teacher-courses",
            {
                "date_from": self.month_from.isoformat(),
                "date_to": self.month_to.isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(
            resp["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertTrue(resp.content.startswith(b"PK"))
        self.assertGreater(len(resp.content), 0)
        _ = io.BytesIO(resp.content)

    def test_legacy_classes_data_hr_type_rejected(self):
        resp = self._client(self.finance).post(
            f"{self.api_prefix}/reports/hr/classes_data",
            {
                "date_from": self.month_from.isoformat(),
                "date_to": self.month_to.isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_legacy_teacher_courses_hr_type_rejected(self):
        resp = self._client(self.finance).post(
            f"{self.api_prefix}/reports/hr/teacher_courses",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_legacy_mt_at_ratios_hr_type_rejected(self):
        resp = self._client(self.finance).post(
            f"{self.api_prefix}/reports/hr/mt_at_ratios",
            {
                "date_from": self.month_from.isoformat(),
                "date_to": self.month_to.isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
