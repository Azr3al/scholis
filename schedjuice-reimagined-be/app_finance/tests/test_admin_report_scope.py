import unittest
from datetime import date, datetime, timedelta
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
class AdminReportScopeTests(TestCase):
    """admin-report must be course + month scoped (except txn exact lookup)."""

    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.month_start = timezone.make_aware(
            datetime(self.today.year, self.today.month, 1, 0, 0, 0)
        )
        if self.today.month == 12:
            end_day = date(self.today.year + 1, 1, 1) - timedelta(days=1)
        else:
            end_day = date(self.today.year, self.today.month + 1, 1) - timedelta(
                days=1
            )
        self.month_end = timezone.make_aware(
            datetime(end_day.year, end_day.month, end_day.day, 23, 59, 59)
        )
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-scope-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-scope-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat scope {suffix}")
            prog = Program.objects.create(
                name=f"P scope {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Course scope {suffix}",
                code=f"CS{suffix}",
                category=cat,
                program=prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=60),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                billing_start_date=self.month_start,
                billing_end_date=self.month_end,
                status=UserPayment.Status.PENDING_VERIFICATION,
                transaction_id=f"txn-scope-{suffix}",
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_finance_rejects_month_without_course_id(self):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            {
                "filter_params": [
                    {
                        "field_name": "issued_at",
                        "operator": "gte",
                        "value": self.month_start.isoformat(),
                    },
                    {
                        "field_name": "issued_at",
                        "operator": "lte",
                        "value": self.month_end.isoformat(),
                    },
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        body = resp.json()
        details = body.get("details", body)
        self.assertIn("course_id", str(details))

    def test_finance_rejects_course_without_month(self):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            {
                "filter_params": [
                    {
                        "field_name": "course_id",
                        "operator": "exact",
                        "value": str(self.course.id),
                    },
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        body = resp.json()
        details = body.get("details", body)
        self.assertTrue(
            "month" in str(details).lower() or "issued_at" in str(details),
            msg=str(details),
        )

    def test_txn_exact_lookup_allowed_without_course_or_month(self):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            {
                "filter_params": [
                    {
                        "field_name": "transaction_id",
                        "operator": "exact",
                        "value": self.payment.transaction_id,
                    },
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        rows = resp.json()["data"]
        self.assertTrue(
            any(r.get("transaction_id") == self.payment.transaction_id for r in rows)
        )

    def test_txn_exact_lookup_returns_at_most_50_rows(self):
        tid = f"txn-cap-{uuid4().hex[:10]}"
        with schema_context(self.schema_name):
            for i in range(55):
                UserPayment.objects.create(
                    user=self.student,
                    course=self.course,
                    created_by=self.finance,
                    issued_at=self.month_start,
                    billing_start_date=self.month_start,
                    billing_end_date=self.month_end,
                    status=UserPayment.Status.PENDING_VERIFICATION,
                    transaction_id=tid,
                    description=f"dup-{i}",
                )
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            {
                "filter_params": [
                    {
                        "field_name": "transaction_id",
                        "operator": "exact",
                        "value": tid,
                    },
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        rows = body["data"]
        self.assertEqual(len(rows), 50)
        self.assertTrue(body.get("truncated"))
