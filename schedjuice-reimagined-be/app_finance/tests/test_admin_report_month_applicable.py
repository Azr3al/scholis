import unittest
from datetime import date, datetime
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import UserPayment
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AdminReportMonthApplicableTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-mappl-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-mappl-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat mappl {suffix}")
            prog = Program.objects.create(
                name=f"P mappl {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Future course {suffix}",
                code=f"FC{suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 10, 3),
                end_date=date(2027, 2, 28),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _payload(self, *, year: int, month: int, extra_filters=None):
        month_start = timezone.make_aware(datetime(year, month, 1, 12, 0, 0))
        filters = [
            {
                "field_name": "course_id",
                "operator": "exact",
                "value": self.course.id,
            },
            {
                "field_name": "issued_at",
                "operator": "gte",
                "value": month_start.isoformat(),
            },
            {
                "field_name": "issued_at",
                "operator": "lte",
                "value": month_start.isoformat(),
            },
        ]
        if extra_filters:
            filters.extend(extra_filters)
        return {"filter_params": filters, "exclude_params": []}

    def test_month_before_course_returns_empty_with_metadata(self):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            self._payload(year=2026, month=7),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertEqual(body["data"], [])
        self.assertFalse(body["month_applicable"])
        self.assertEqual(body["suggested_month"], {"year": 2026, "month": 10})
        self.assertEqual(body["summary"]["active_student_row_count"], 0)

    def test_month_within_course_returns_applicable_true(self):
        month_start = timezone.make_aware(datetime(2026, 10, 1, 12, 0, 0))
        month_end = timezone.make_aware(datetime(2026, 10, 31, 12, 0, 0))
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=month_start,
                billing_start_date=month_start,
                billing_end_date=month_end,
                status=UserPayment.Status.PENDING_VERIFICATION,
                transaction_id=f"txn-in-{uuid4().hex[:6]}",
            )
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            self._payload(year=2026, month=10),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertTrue(body["month_applicable"])
        self.assertGreaterEqual(len(body["data"]), 1)

    def test_transaction_id_filter_bypasses_month_guard(self):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            self._payload(
                year=2026,
                month=7,
                extra_filters=[
                    {
                        "field_name": "transaction_id",
                        "operator": "exact",
                        "value": "does-not-exist",
                    }
                ],
            ),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertNotEqual(body.get("month_applicable"), False)
