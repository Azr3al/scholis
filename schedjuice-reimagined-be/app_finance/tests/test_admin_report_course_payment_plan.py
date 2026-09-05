import unittest
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import PaymentPlan, UserPayment
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AdminReportCoursePaymentPlanTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.month_start = timezone.make_aware(datetime(2026, 7, 1, 12, 0, 0))
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-cpp-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            pay_no_fee_slug = f"pay-no-fee-{suffix}"
            pay_no_fee_role = Role.objects.create(
                slug=pay_no_fee_slug,
                display_name="Payments no fee",
                is_system=False,
            )
            for code in ("payment.view_all", "payment.record"):
                RolePermission.objects.create(
                    role=pay_no_fee_role,
                    permission_code=code,
                )
            self.pay_no_fee = User.objects.create_user(
                email=f"pnf-cpp-{suffix}@example.com",
                password="x",
                name="PayNoFee",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[pay_no_fee_slug],
            )
            self.student = User.objects.create_user(
                email=f"stu-cpp-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"Whole term plan {suffix}",
                price=Money(700000, "USD"),
                billing_type=PaymentPlan.BillingType.WHOLE_TERM,
            )
            cat = Category.objects.create(name=f"Cat cpp {suffix}")
            prog = Program.objects.create(
                name=f"P cpp {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Discount Test {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 7, 1),
                end_date=date(2027, 1, 1),
                payment_plan=self.plan,
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

    def _payload(self):
        return {
            "filter_params": [
                {
                    "field_name": "course_id",
                    "operator": "exact",
                    "value": self.course.id,
                },
                {
                    "field_name": "issued_at",
                    "operator": "gte",
                    "value": self.month_start.isoformat(),
                },
                {
                    "field_name": "issued_at",
                    "operator": "lte",
                    "value": self.month_start.isoformat(),
                },
            ],
            "exclude_params": [],
        }

    def test_admin_report_includes_course_payment_plan_with_fee_for_finance(self):
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                status=UserPayment.Status.PENDING_PAYMENT,
            )
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            self._payload(),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        plan = resp.json().get("course_payment_plan")
        self.assertIsNotNone(plan)
        self.assertEqual(plan["name"], self.plan.name)
        self.assertEqual(plan["billing_type"], PaymentPlan.BillingType.WHOLE_TERM)
        self.assertEqual(Decimal(plan["price"]), self.plan.price.amount)

    def test_admin_report_omits_fee_without_show_fee_permission(self):
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                status=UserPayment.Status.PENDING_PAYMENT,
            )
        resp = self._client(self.pay_no_fee).post(
            "/api/v1/user-payments/admin-report",
            self._payload(),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        plan = resp.json().get("course_payment_plan")
        self.assertIsNotNone(plan)
        self.assertEqual(plan["name"], self.plan.name)
        self.assertNotIn("price", plan)

    def test_out_of_range_month_still_returns_course_payment_plan(self):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            {
                "filter_params": [
                    {
                        "field_name": "course_id",
                        "operator": "exact",
                        "value": self.course.id,
                    },
                    {
                        "field_name": "issued_at",
                        "operator": "gte",
                        "value": timezone.make_aware(
                            datetime(2026, 1, 1, 12, 0, 0)
                        ).isoformat(),
                    },
                    {
                        "field_name": "issued_at",
                        "operator": "lte",
                        "value": timezone.make_aware(
                            datetime(2026, 1, 1, 12, 0, 0)
                        ).isoformat(),
                    },
                ],
                "exclude_params": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["month_applicable"])
        plan = body.get("course_payment_plan")
        self.assertIsNotNone(plan)
        self.assertEqual(plan["billing_type"], PaymentPlan.BillingType.WHOLE_TERM)
        self.assertEqual(Decimal(plan["price"]), self.plan.price.amount)
