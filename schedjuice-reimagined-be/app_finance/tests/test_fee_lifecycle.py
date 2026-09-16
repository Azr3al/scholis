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
from unittest import mock

from app_auth.models import User
from app_course.models import Category, Course, Intake, Program, UserCourse
from app_finance.models import (
    PaymentAdjustment,
    PaymentPlan,
    UserPayment,
    UserPaymentCoveredMonth,
)
from app_finance.tests.telegram_mixin import TelegramSignalTestMixin
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class FeeLifecycleFixtureMixin:
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        cls._chat_save_patch = mock.patch(
            "app_chat.signals_enrollment.sync_group_chat_on_user_course_change.delay"
        )
        cls._chat_delete_patch = mock.patch(
            "app_chat.signals_enrollment.sync_group_chat_after_user_course_delete.delay"
        )
        cls._chat_save_patch.start()
        cls._chat_delete_patch.start()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        cls._chat_delete_patch.stop()
        cls._chat_save_patch.stop()
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_program_courses(self, suffix: str):
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"fl-mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"fl-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"fl-stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.finance = User.objects.create_user(
                email=f"fl-fin-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.hr = User.objects.create_user(
                email=f"fl-hr-{suffix}@example.com",
                password="x",
                name="HR",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.HR],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            self.program = Program.objects.create(
                name=f"Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.plan = PaymentPlan.objects.create(
                name=f"Plan {suffix}",
                price=Money(100000, "USD"),
                billing_type=PaymentPlan.BillingType.PER_PERIOD,
            )
            self.course_a = Course.objects.create(
                title=f"Course A {suffix}",
                category=cat,
                program=self.program,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                payment_plan=self.plan,
                is_payment_enabled=True,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course_a,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            from app_organization.models import Organization

            self.org = Organization.objects.get(schema_name=self.schema_name)

    def _aware(self, year, month, day=1):
        return timezone.make_aware(datetime(year, month, day, 12, 0, 0))

    def _pay(self, **kwargs):
        defaults = dict(
            user=self.student,
            course=self.course_a,
            status=UserPayment.Status.PENDING_PAYMENT,
            base_amount=Money(100000, "USD"),
            discount_amount=Money(0, "USD"),
            invoiced_amount=Money(100000, "USD"),
            issued_at=self._aware(2026, 3, 1),
        )
        defaults.update(kwargs)
        return UserPayment.objects.create(**defaults)

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client


@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecycleCoverageTests(
    TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase
):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def test_coverage_month_does_not_override_issued_at_period(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload

        with schema_context(self.schema_name):
            pay = self._pay(issued_at=self._aware(2026, 4, 1))
            UserPaymentCoveredMonth.objects.create(
                user_payment=pay,
                year=2026,
                month_index=3,
            )
            march = build_fee_lifecycle_payload(
                program_id=self.program.id,
                intake_id=None,
                period="single_month",
                date_from=date(2026, 3, 1),
                date_to=None,
                breakdown="none",
                org=self.org,
            )
            april = build_fee_lifecycle_payload(
                program_id=self.program.id,
                intake_id=None,
                period="single_month",
                date_from=date(2026, 4, 1),
                date_to=None,
                breakdown="none",
                org=self.org,
            )
            march_ids = {
                n["key"] for n in march["nodes"]
            }
            self.assertNotIn("billed", march_ids)
            billed = next(n for n in april["nodes"] if n["key"] == "billed")
            self.assertEqual(billed["amount"], "100000.00")

    def test_null_issued_at_without_verified_at_is_excluded_from_period(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload

        with schema_context(self.schema_name):
            self._pay(issued_at=None)
            payload = build_fee_lifecycle_payload(
                program_id=self.program.id,
                intake_id=None,
                period="single_month",
                date_from=date(2026, 3, 1),
                date_to=None,
                breakdown="none",
                org=self.org,
            )
            self.assertEqual(payload["nodes"], [])
            self.assertEqual(payload["unattributed"]["payment_count"], 1)

    def test_every_status_maps_to_exactly_one_settlement_band(self):
        from app_finance.fee_lifecycle_services import SETTLEMENT_BAND_BY_STATUS
        from app_finance.models import UserPayment

        mapped = set(SETTLEMENT_BAND_BY_STATUS)
        self.assertEqual(mapped, set(UserPayment.Status.values))
        self.assertEqual(
            len(SETTLEMENT_BAND_BY_STATUS), len(UserPayment.Status.values)
        )

    def test_billed_split_balances(self):
        from app_finance.fee_lifecycle_services import aggregate_recorded_buckets

        with schema_context(self.schema_name):
            self._pay(
                status=UserPayment.Status.VERIFIED,
                base_amount=Money(100000, "USD"),
                discount_amount=Money(20000, "USD"),
                invoiced_amount=Money(80000, "USD"),
                actual_amount=Money(85000, "USD"),
            )
            self._pay(
                status=UserPayment.Status.PENDING_PAYMENT,
                base_amount=Money(50000, "USD"),
                discount_amount=Money(0, "USD"),
                invoiced_amount=Money(50000, "USD"),
            )
            buckets = aggregate_recorded_buckets(
                UserPayment.objects.filter(course=self.course_a)
            )
            billed = buckets["billed"]
            self.assertEqual(billed["base"], Decimal("150000"))
            self.assertEqual(billed["discount"], Decimal("20000"))
            self.assertEqual(billed["invoiced"], Decimal("130000"))
            self.assertEqual(billed["discount"] + billed["invoiced"], billed["base"])
            self.assertEqual(buckets["settlement"]["collected"], Decimal("80000"))
            self.assertEqual(
                buckets["settlement"]["awaiting_payment"], Decimal("50000")
            )
            self.assertEqual(sum(buckets["settlement"].values()), billed["invoiced"])
            self.assertEqual(buckets["cash_received"], Decimal("85000"))


@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecycleRefundTests(
    TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase
):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def test_re_transfer_does_not_reduce_retained(self):
        from app_finance.fee_lifecycle_services import aggregate_refunds

        with schema_context(self.schema_name):
            pay = self._pay(status=UserPayment.Status.VERIFIED)
            PaymentAdjustment.objects.create(
                user_payment=pay,
                kind=PaymentAdjustment.Kind.RE_TRANSFER,
                amount=Money(10000, "USD"),
                occurred_at=self._aware(2026, 3, 15),
            )
            result = aggregate_refunds([pay.id], Decimal("100000"))
            self.assertEqual(result["refunded"], Decimal("0"))
            self.assertEqual(result["retained"], Decimal("100000"))
            self.assertFalse(result["refund_clamped"])

    def test_refund_on_non_verified_is_ignored(self):
        from app_finance.fee_lifecycle_services import aggregate_refunds

        with schema_context(self.schema_name):
            pay = self._pay(status=UserPayment.Status.PENDING_PAYMENT)
            PaymentAdjustment.objects.create(
                user_payment=pay,
                kind=PaymentAdjustment.Kind.REFUND,
                amount=Money(10000, "USD"),
                occurred_at=self._aware(2026, 3, 15),
            )
            result = aggregate_refunds([pay.id], Decimal("0"))
            self.assertEqual(result["refunded"], Decimal("0"))

    def test_over_refund_is_clamped_to_invoiced(self):
        from app_finance.fee_lifecycle_services import aggregate_refunds

        with schema_context(self.schema_name):
            pay = self._pay(
                status=UserPayment.Status.VERIFIED,
                invoiced_amount=Money(100000, "USD"),
            )
            PaymentAdjustment.objects.create(
                user_payment=pay,
                kind=PaymentAdjustment.Kind.REFUND,
                amount=Money(250000, "USD"),
                occurred_at=self._aware(2026, 3, 15),
            )
            result = aggregate_refunds([pay.id], Decimal("100000"))
            self.assertEqual(result["refunded"], Decimal("100000"))
            self.assertEqual(result["retained"], Decimal("0"))
            self.assertTrue(result["refund_clamped"])

    def test_unattributed_includes_null_dates(self):
        from app_finance.fee_lifecycle_services import aggregate_unattributed

        with schema_context(self.schema_name):
            self._pay(
                issued_at=None,
                invoiced_amount=Money(4200, "USD"),
                base_amount=Money(4200, "USD"),
            )
            self._pay(issued_at=self._aware(2026, 3, 1))
            result = aggregate_unattributed(course_ids=[self.course_a.id])
            self.assertEqual(result["amount"], Decimal("4200"))
            self.assertEqual(result["payment_count"], 1)


@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecyclePayloadTests(
    TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase
):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def test_empty_program_returns_zero_payload_without_error(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload

        with schema_context(self.schema_name):
            other = Program.objects.create(
                name=f"Empty {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            payload = build_fee_lifecycle_payload(
                program_id=other.id,
                intake_id=None,
                period="single_month",
                date_from=date(2026, 3, 1),
                date_to=None,
                breakdown="none",
                org=self.org,
            )
            self.assertEqual(payload["nodes"], [])
            self.assertEqual(payload["links"], [])
            self.assertEqual(payload["unattributed"]["payment_count"], 0)

    def test_missing_program_raises_valueerror(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload

        with schema_context(self.schema_name):
            with self.assertRaises(ValueError):
                build_fee_lifecycle_payload(
                    program_id=999999,
                    intake_id=None,
                    period="single_month",
                    date_from=date(2026, 3, 1),
                    date_to=None,
                    breakdown="none",
                    org=self.org,
                )

    def test_missing_invoiced_uses_cash_and_is_not_empty(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload

        with schema_context(self.schema_name):
            self._pay(
                status=UserPayment.Status.VERIFIED,
                verified_at=self._aware(2026, 3, 15),
                invoiced_amount=None,
                base_amount=None,
                discount_amount=None,
                actual_amount=Money(85000, "USD"),
            )
            payload = build_fee_lifecycle_payload(
                program_id=self.program.id,
                intake_id=None,
                period="single_month",
                date_from=date(2026, 3, 1),
                date_to=None,
                breakdown="none",
                org=self.org,
            )
            by_key = {n["key"]: Decimal(n["amount"]) for n in payload["nodes"]}
            self.assertEqual(by_key.get("billed"), Decimal("85000.00"))
            self.assertEqual(by_key.get("net_invoiced"), Decimal("85000.00"))
            self.assertEqual(by_key.get("collected"), Decimal("85000.00"))
            self.assertEqual(by_key.get("retained"), Decimal("85000.00"))
            self.assertNotIn("discounts_given", by_key)
            self.assertEqual(
                Decimal(payload["meta"]["cash_received"]), Decimal("85000.00")
            )

    def test_payload_links_balance_at_billed_and_net(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload

        with schema_context(self.schema_name):
            self._pay(
                status=UserPayment.Status.VERIFIED,
                verified_at=self._aware(2026, 3, 15),
                base_amount=Money(100000, "USD"),
                discount_amount=Money(20000, "USD"),
                invoiced_amount=Money(80000, "USD"),
                actual_amount=Money(80000, "USD"),
            )
            payload = build_fee_lifecycle_payload(
                program_id=self.program.id,
                intake_id=None,
                period="single_month",
                date_from=date(2026, 3, 1),
                date_to=None,
                breakdown="none",
                org=self.org,
            )
            by_key = {n["key"]: Decimal(n["amount"]) for n in payload["nodes"]}
            outgoing = {}
            for link in payload["links"]:
                outgoing.setdefault(link["source"], Decimal("0"))
                outgoing[link["source"]] += Decimal(link["amount"])
            self.assertEqual(outgoing["billed"], by_key["billed"])
            self.assertEqual(outgoing["net_invoiced"], by_key["net_invoiced"])
            self.assertNotIn("expected", by_key)
            self.assertNotIn("not_yet_billed", by_key)

    def test_breakdown_fans_from_retained_only(self):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload
        from app_finance.models import PaymentBank, PaymentMethod

        with schema_context(self.schema_name):
            method = PaymentMethod.objects.create(
                name=f"KBZ {uuid4().hex[:6]}",
                payment_bank=PaymentBank.KBZ,
            )
            self._pay(
                status=UserPayment.Status.VERIFIED,
                verified_at=self._aware(2026, 3, 15),
                payment_method=method,
                actual_amount=Money(100000, "USD"),
            )
            payload = build_fee_lifecycle_payload(
                program_id=self.program.id,
                intake_id=None,
                period="single_month",
                date_from=date(2026, 3, 1),
                date_to=None,
                breakdown="payment_method",
                org=self.org,
            )
            sources = {
                link["source"]
                for link in payload["links"]
                if link["target"].startswith("method:")
            }
            self.assertEqual(sources, {"retained"})
            collected_targets = {
                link["target"]
                for link in payload["links"]
                if link["source"] == "collected"
            }
            self.assertTrue(
                collected_targets.isdisjoint(
                    {
                        link["target"]
                        for link in payload["links"]
                        if link["target"].startswith("method:")
                    }
                )
            )


@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecycleIntakeTests(
    TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase
):
    def _create_future_intake(self, suffix: str):
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"fl-int-mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.student = User.objects.create_user(
                email=f"fl-int-stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat intake {suffix}")
            self.program = Program.objects.create(
                name=f"Intake Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            plan = PaymentPlan.objects.create(
                name=f"Plan intake {suffix}",
                price=Money(100000, "USD"),
                billing_type=PaymentPlan.BillingType.WHOLE_TERM,
            )
            self.future_intake = Intake.objects.create(
                name=f"2026 Oct - 2027 Mar {suffix}",
                program=self.program,
                start_date=date(2026, 10, 1),
                end_date=date(2027, 3, 31),
            )
            self.future_course = Course.objects.create(
                title=f"Future Course {suffix}",
                category=cat,
                program=self.program,
                intake=self.future_intake,
                start_date=date(2026, 10, 1),
                end_date=date(2027, 3, 31),
                payment_plan=plan,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.future_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            from app_organization.models import Organization

            self.org = Organization.objects.get(schema_name=self.schema_name)

    @mock.patch("app_finance.homepage_services._today_for_org")
    def test_intake_pre_registration_payment_is_billed(self, mock_today):
        from app_finance.fee_lifecycle_services import build_fee_lifecycle_payload

        mock_today.return_value = date(2026, 8, 3)
        suffix = uuid4().hex[:6]
        self._create_future_intake(suffix)
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.future_course,
                status=UserPayment.Status.VERIFIED,
                verified_at=self._aware(2026, 8, 3),
                issued_at=self._aware(2026, 8, 3),
                base_amount=Money(250000, "USD"),
                discount_amount=Money(0, "USD"),
                invoiced_amount=Money(250000, "USD"),
                actual_amount=Money(250000, "USD"),
            )
            payload = build_fee_lifecycle_payload(
                program_id=self.program.id,
                intake_id=self.future_intake.id,
                period="intake_range",
                date_from=None,
                date_to=None,
                breakdown="none",
                org=self.org,
            )
        by_key = {n["key"]: n["amount"] for n in payload["nodes"]}
        self.assertEqual(by_key.get("billed"), "250000.00")
        self.assertEqual(by_key.get("collected"), "250000.00")
        self.assertNotIn("expected", by_key)
        self.assertNotIn("not_yet_billed", by_key)


URL = "/api/v1/finance/fee-lifecycle"


@override_settings(RBAC_ENFORCE="enforce")
class FeeLifecycleViewTests(
    TelegramSignalTestMixin, FeeLifecycleFixtureMixin, TestCase
):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def _body(self, **overrides):
        body = {
            "program_id": self.program.id,
            "period": "single_month",
            "date_from": "2026-03-01",
            "breakdown": "none",
        }
        body.update(overrides)
        return body

    def test_forbidden_for_teacher(self):
        resp = self._client(self.teacher).post(URL, self._body(), format="json")
        self.assertEqual(resp.status_code, 403)

    def test_forbidden_for_student(self):
        resp = self._client(self.student).post(URL, self._body(), format="json")
        self.assertEqual(resp.status_code, 403)

    def test_hr_with_analytics_view_is_allowed(self):
        resp = self._client(self.hr).post(URL, self._body(), format="json")
        self.assertEqual(resp.status_code, 200)

    def test_missing_program_id_is_400(self):
        resp = self._client(self.manager).post(
            URL, self._body(program_id=""), format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("program_id", str(resp.json()))

    def test_invalid_period_is_400(self):
        resp = self._client(self.manager).post(
            URL, self._body(period="last_week"), format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("period", str(resp.json()))

    def test_invalid_breakdown_is_400(self):
        resp = self._client(self.manager).post(
            URL, self._body(breakdown="course"), format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("breakdown", str(resp.json()))
