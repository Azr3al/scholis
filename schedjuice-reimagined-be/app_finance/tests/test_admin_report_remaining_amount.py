import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.discount_engine import apply_enrollment_discount
from app_finance.models import Discount, PaymentPlan, UserPayment
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AdminReportRemainingAmountTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        # Use a month inside the setUp course calendar so the admin-report
        # out-of-range guard does not return an empty payload.
        self.month_start = timezone.make_aware(datetime(2026, 1, 1, 0, 0, 0))
        self.month_end = timezone.make_aware(datetime(2026, 1, 31, 23, 59, 59))
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-rem-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-rem-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat rem {suffix}")
            prog = Program.objects.create(
                name=f"P rem {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.per_period_plan = PaymentPlan.objects.create(
                name=f"Per period {suffix}",
                price=Money(500, "USD"),
                billing_type=PaymentPlan.BillingType.PER_PERIOD,
            )
            self.whole_term_plan = PaymentPlan.objects.create(
                name=f"Whole term {suffix}",
                price=Money(1000, "USD"),
                billing_type=PaymentPlan.BillingType.WHOLE_TERM,
            )
            self.per_period_course = Course.objects.create(
                title=f"C per period {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 2, 28),
                payment_plan=self.per_period_plan,
            )
            self.whole_term_course = Course.objects.create(
                title=f"C whole term {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
                payment_plan=self.whole_term_plan,
            )
            self.no_plan_course = Course.objects.create(
                title=f"C no plan {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 2, 28),
            )
            for course in (
                self.per_period_course,
                self.whole_term_course,
                self.no_plan_course,
            ):
                UserCourse.objects.create(
                    user=self.student,
                    course=course,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _admin_report_payload(self, course_id: int):
        return {
            "filter_params": [
                {
                    "field_name": "course_id",
                    "operator": "exact",
                    "value": str(course_id),
                },
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
        }

    def _admin_report_rows(self, course_id: int):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            self._admin_report_payload(course_id),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        rows = data["data"] if isinstance(data, dict) else data
        return [
            row
            for row in rows
            if row["user"]["id"] == self.student.id
            and row["course"]["id"] == course_id
        ]

    def _create_payment(
        self,
        *,
        course: Course,
        status: str,
        actual_amount: Money | None = None,
        parsed_amount: Money | None = None,
    ) -> UserPayment:
        with schema_context(self.schema_name):
            return UserPayment.objects.create(
                user=self.student,
                course=course,
                created_by=self.finance,
                issued_at=self.month_start,
                billing_start_date=self.month_start,
                billing_end_date=self.month_end,
                status=status,
                actual_amount=actual_amount,
                parsed_amount=parsed_amount,
                transaction_id=f"txn-{uuid4().hex[:12]}",
            )

    def test_per_period_remaining_uses_plan_price_times_period_count(self):
        self._create_payment(
            course=self.per_period_course,
            status=UserPayment.Status.VERIFIED,
            actual_amount=Money(200, "USD"),
        )
        self._create_payment(
            course=self.per_period_course,
            status=UserPayment.Status.PENDING_VERIFICATION,
            parsed_amount=Money(100, "USD"),
        )

        rows = self._admin_report_rows(self.per_period_course.id)

        self.assertEqual(len(rows), 2)
        self.assertEqual(
            {Decimal(str(row["remaining_amount"])) for row in rows},
            {Decimal("800")},
        )

    def test_whole_term_remaining_uses_plan_price_directly(self):
        self._create_payment(
            course=self.whole_term_course,
            status=UserPayment.Status.VERIFIED,
            actual_amount=Money(400, "USD"),
        )

        rows = self._admin_report_rows(self.whole_term_course.id)

        self.assertEqual(len(rows), 1)
        self.assertEqual(Decimal(str(rows[0]["remaining_amount"])), Decimal("600"))

    def test_whole_term_remaining_uses_discounted_term_total(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=self.schema_name).first()
        with schema_context(self.schema_name):
            enrollment = UserCourse.objects.get(
                user=self.student,
                course=self.whole_term_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            discount = Discount.objects.create(
                name=f"20pct-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("20"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            apply_enrollment_discount(
                user_course=enrollment,
                discount=discount,
                applied_by=self.finance,
                org=org,
            )
        self._create_payment(
            course=self.whole_term_course,
            status=UserPayment.Status.VERIFIED,
            actual_amount=Money(800, "USD"),
        )

        rows = self._admin_report_rows(self.whole_term_course.id)

        self.assertEqual(len(rows), 1)
        self.assertEqual(Decimal(str(rows[0]["term_total"])), Decimal("800"))
        self.assertEqual(Decimal(str(rows[0]["remaining_amount"])), Decimal("0"))

    def test_no_payment_plan_yields_null_remaining_amount(self):
        self._create_payment(
            course=self.no_plan_course,
            status=UserPayment.Status.VERIFIED,
            actual_amount=Money(100, "USD"),
        )

        rows = self._admin_report_rows(self.no_plan_course.id)

        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]["remaining_amount"])

    def test_verified_sum_prefers_actual_amount_over_parsed_amount(self):
        self._create_payment(
            course=self.whole_term_course,
            status=UserPayment.Status.VERIFIED,
            actual_amount=Money(250, "USD"),
            parsed_amount=Money(999, "USD"),
        )

        rows = self._admin_report_rows(self.whole_term_course.id)

        self.assertEqual(len(rows), 1)
        self.assertEqual(Decimal(str(rows[0]["remaining_amount"])), Decimal("750"))
