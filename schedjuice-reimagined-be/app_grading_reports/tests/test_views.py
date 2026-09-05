import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import IntegrityError, connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course
from app_grading_reports.constants import DEFAULT_GRADING_BANDS
from app_grading_reports.models import GradingScale, MonthlyResultSheet
from app_grading_reports.services import compute_grade, resolve_grading_scale
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class GradingReportsServiceTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.course = Course.objects.first()
            self.admin = User.objects.create_user(
                email=f"gr-admin-{self.suffix}@example.com",
                password="x",
                name="Gr Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"gr-admin-{self.suffix}@example.com",
                code=f"gr-admin-{self.suffix}",
                roles=[User.UserRole.ADMIN],
            )

    def test_default_bands_when_no_scale(self):
        with schema_context(self.schema_name):
            self.assertEqual(resolve_grading_scale(self.course), DEFAULT_GRADING_BANDS)

    def test_course_override_wins(self):
        with schema_context(self.schema_name):
            custom = [{"label": "P", "min_pct": 0, "max_pct": 100}]
            GradingScale.objects.create(course=self.course, bands=custom)
            self.assertEqual(resolve_grading_scale(self.course), custom)

    def test_grade_boundaries(self):
        with schema_context(self.schema_name):
            result = compute_grade(30, 58, DEFAULT_GRADING_BANDS)
            self.assertEqual(result["grade"], "C")
            result_a_plus = compute_grade(50, 58, DEFAULT_GRADING_BANDS)
            self.assertEqual(result_a_plus["grade"], "A+")

    def test_duplicate_course_month_blocked(self):
        with schema_context(self.schema_name):
            MonthlyResultSheet.objects.create(
                course=self.course,
                year=2026,
                month=5,
                exam_date="2026-05-28",
                created_by=self.admin,
            )
            with self.assertRaises(IntegrityError):
                MonthlyResultSheet.objects.create(
                    course=self.course,
                    year=2026,
                    month=5,
                    exam_date="2026-05-29",
                    created_by=self.admin,
                )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class GradingReportsViewTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.course = Course.objects.first()
            self.admin = User.objects.create_user(
                email=f"grv-admin-{self.suffix}@example.com",
                password="x",
                name="Gr Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"grv-admin-{self.suffix}@example.com",
                code=f"grv-admin-{self.suffix}",
                roles=[User.UserRole.ADMIN],
            )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_duplicate_month_returns_400(self):
        with schema_context(self.schema_name):
            cid = self.course.id
            body = {"year": 2026, "month": 8, "exam_date": "2026-08-28"}
            res = self._client(self.admin).post(
                f"{self.api_prefix}/courses/{cid}/result-sheets", body, format="json"
            )
            self.assertEqual(res.status_code, 201, res.content)
            res = self._client(self.admin).post(
                f"{self.api_prefix}/courses/{cid}/result-sheets", body, format="json"
            )
            self.assertEqual(res.status_code, 400, res.content)
