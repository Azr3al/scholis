import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from djmoney.money import Money
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Intake, Program, UserCourse
from app_finance.homepage_services import (
    aggregate_collected_summary,
    aggregate_unpaid_summary,
    build_finance_homepage_payload,
    resolve_period_bounds,
    resolve_scope_course_ids,
)
from app_finance.models import PaymentPlan, UserPayment
from app_finance.unpaid_helpers import unpaid_counts_by_course
from app_finance.tests.telegram_mixin import TelegramSignalTestMixin
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _month_filter_bounds(day: date):
    start = timezone.make_aware(datetime(day.year, day.month, 1, 0, 0, 0))
    if day.month == 12:
        end_day = date(day.year + 1, 1, 1) - timedelta(days=1)
    else:
        end_day = date(day.year, day.month + 1, 1) - timedelta(days=1)
    end = timezone.make_aware(
        datetime(end_day.year, end_day.month, end_day.day, 23, 59, 59)
    )
    return start, end


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class FinanceHomepageFixtureMixin:
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_program_courses(self, suffix: str):
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"fh-mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"fh-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"fh-stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.no_perm_user = User.objects.create_user(
                email=f"fh-none-{suffix}@example.com",
                password="x",
                name="No Perm",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            self.program = Program.objects.create(
                name=f"Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            plan = PaymentPlan.objects.create(
                name=f"Plan {suffix}",
                price=Money(100000, "USD"),
                billing_type=PaymentPlan.BillingType.WHOLE_TERM,
            )
            self.course_a = Course.objects.create(
                title=f"Course A {suffix}",
                category=cat,
                program=self.program,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                payment_plan=plan,
            )
            self.course_b = Course.objects.create(
                title=f"Course B {suffix}",
                category=cat,
                program=self.program,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                payment_plan=plan,
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course_a,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course_a,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            from app_organization.models import Organization

            self.org = Organization.objects.get(schema_name=self.schema_name)

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client


@override_settings(RBAC_ENFORCE="enforce")
class FinanceHomepageScopeTests(TelegramSignalTestMixin, FinanceHomepageFixtureMixin, TestCase):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def test_teacher_scope_excludes_unassigned_courses(self):
        with schema_context(self.schema_name):
            ids = resolve_scope_course_ids(
                program_id=self.program.id, intake_id=None, user=self.teacher
            )
        self.assertEqual(ids, [self.course_a.id])

    def test_manager_scope_includes_all_program_courses(self):
        with schema_context(self.schema_name):
            ids = resolve_scope_course_ids(
                program_id=self.program.id, intake_id=None, user=self.manager
            )
        self.assertCountEqual(ids, [self.course_a.id, self.course_b.id])


@override_settings(RBAC_ENFORCE="enforce")
class FinanceHomepageCollectedTests(TelegramSignalTestMixin, FinanceHomepageFixtureMixin, TestCase):
    def setUp(self):
        suffix = uuid4().hex[:6]
        self._create_program_courses(suffix)
        self.month_start, self.month_end = _month_filter_bounds(date(2026, 8, 1))
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.course_a,
                status=UserPayment.Status.VERIFIED,
                verified_at=self.month_start + timedelta(hours=6),
                actual_amount=Money(100000, "USD"),
            )

    def test_collected_summary_sums_verified_payments(self):
        with schema_context(self.schema_name):
            amount, count = aggregate_collected_summary(
                course_ids=[self.course_a.id],
                start_dt=self.month_start,
                end_dt=self.month_end,
            )
        self.assertEqual(count, 1)
        self.assertEqual(amount, Decimal("100000"))


@override_settings(RBAC_ENFORCE="enforce")
class FinanceHomepageUnpaidTests(TelegramSignalTestMixin, FinanceHomepageFixtureMixin, TestCase):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])
        self.month_start, self.month_end = _month_filter_bounds(date(2026, 8, 1))

    def test_unpaid_count_matches_unpaid_helpers(self):
        with schema_context(self.schema_name):
            amount, count = aggregate_unpaid_summary(
                course_ids=[self.course_a.id],
                anchor_year=2026,
                anchor_month=8,
                org=self.org,
            )
            payment_params = {
                "issued_at__gte": self.month_start.isoformat(),
                "issued_at__lte": self.month_end.isoformat(),
            }
            expected = sum(
                unpaid_counts_by_course([self.course_a.id], payment_params).values()
            )
        self.assertEqual(count, expected)
        self.assertEqual(amount, Decimal("100000"))


@override_settings(RBAC_ENFORCE="enforce")
class FinanceHomepageViewTests(TelegramSignalTestMixin, FinanceHomepageFixtureMixin, TestCase):
    def setUp(self):
        suffix = uuid4().hex[:6]
        self._create_program_courses(suffix)
        self.month_start, self.month_end = _month_filter_bounds(date(2026, 8, 1))
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.course_a,
                status=UserPayment.Status.VERIFIED,
                verified_at=self.month_start + timedelta(hours=6),
                actual_amount=Money(50000, "USD"),
            )

    def test_forbidden_without_finance_permission(self):
        resp = self._client(self.no_perm_user).post(
            "/api/v1/finance/homepage",
            {
                "program_id": self.program.id,
                "period": "single_month",
                "date_from": "2026-08-01",
                "pie_group_by": "payment_status",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_manager_receives_payload(self):
        resp = self._client(self.manager).post(
            "/api/v1/finance/homepage",
            {
                "program_id": self.program.id,
                "period": "single_month",
                "date_from": "2026-08-01",
                "pie_group_by": "payment_status",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()["data"]
        self.assertEqual(data["summary"]["collected_count"], 1)
        self.assertGreater(len(data["line_chart"]["current"]), 0)

    def test_query_count_bounded(self):
        with schema_context(self.schema_name):
            with CaptureQueriesContext(connection) as ctx:
                resp = self._client(self.manager).post(
                    "/api/v1/finance/homepage",
                    {
                        "program_id": self.program.id,
                        "period": "single_month",
                        "date_from": "2026-08-01",
                        "pie_group_by": "payment_status",
                    },
                    format="json",
                )
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(
            len(ctx),
            20,
            msg=f"too many queries ({len(ctx)}): {[q['sql'][:80] for q in ctx.captured_queries]}",
        )


@override_settings(RBAC_ENFORCE="enforce")
class FinanceHomepagePayloadTests(TelegramSignalTestMixin, FinanceHomepageFixtureMixin, TestCase):
    def setUp(self):
        self._create_program_courses(uuid4().hex[:6])

    def test_empty_program_courses_returns_zeroed_payload(self):
        with schema_context(self.schema_name):
            empty_program = Program.objects.create(
                name=f"Empty {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            payload = build_finance_homepage_payload(
                program_id=empty_program.id,
                intake_id=None,
                period="single_month",
                date_from=date(2026, 8, 1),
                date_to=None,
                pie_group_by="payment_status",
                user=self.manager,
                org=self.org,
            )
        self.assertEqual(payload["summary"]["collected_count"], 0)
        self.assertEqual(payload["pie_chart"]["slices"], [])


@override_settings(RBAC_ENFORCE="enforce")
class FinanceHomepageIntakeRangeTests(
    TelegramSignalTestMixin, FinanceHomepageFixtureMixin, TestCase
):
    def _create_intake_program(self, suffix: str):
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"fh-intake-mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.student = User.objects.create_user(
                email=f"fh-intake-stu-{suffix}@example.com",
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
            self.prev_intake = Intake.objects.create(
                name=f"2026 Apr - Sep {suffix}",
                program=self.program,
                start_date=date(2026, 4, 1),
                end_date=date(2026, 9, 30),
            )
            self.future_intake = Intake.objects.create(
                name=f"2026 Oct - 2027 Mar {suffix}",
                program=self.program,
                start_date=date(2026, 10, 1),
                end_date=date(2027, 3, 31),
            )
            self.in_progress_intake = Intake.objects.create(
                name=f"2026 Jan - Dec {suffix}",
                program=self.program,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
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
            self.in_progress_course = Course.objects.create(
                title=f"In Progress Course {suffix}",
                category=cat,
                program=self.program,
                intake=self.in_progress_intake,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                payment_plan=plan,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.future_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.in_progress_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            from app_organization.models import Organization

            self.org = Organization.objects.get(schema_name=self.schema_name)

    @patch("app_finance.homepage_services._today_for_org")
    def test_intake_range_future_intake_bounds_not_inverted(self, mock_today):
        suffix = uuid4().hex[:6]
        self._create_intake_program(suffix)
        mock_today.return_value = date(2026, 8, 3)
        with schema_context(self.schema_name):
            bounds = resolve_period_bounds(
                period="intake_range",
                date_from=None,
                date_to=None,
                intake=self.future_intake,
                org=self.org,
                course_ids=[self.future_course.id],
            )
        self.assertLessEqual(bounds.date_from, bounds.date_to)
        self.assertEqual(bounds.date_from, date(2026, 8, 3))
        self.assertEqual(bounds.date_to, date(2026, 8, 3))

    @patch("app_finance.homepage_services._today_for_org")
    def test_intake_range_pre_registration_payment_counted(self, mock_today):
        suffix = uuid4().hex[:6]
        self._create_intake_program(suffix)
        mock_today.return_value = date(2026, 8, 3)
        month_start, month_end = _month_filter_bounds(date(2026, 8, 1))
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.future_course,
                status=UserPayment.Status.VERIFIED,
                verified_at=month_start + timedelta(hours=6),
                actual_amount=Money(250000, "USD"),
            )
            payload = build_finance_homepage_payload(
                program_id=self.program.id,
                intake_id=self.future_intake.id,
                period="intake_range",
                date_from=None,
                date_to=None,
                pie_group_by="payment_status",
                user=self.manager,
                org=self.org,
            )
        self.assertEqual(payload["summary"]["collected_count"], 1)
        self.assertEqual(payload["summary"]["collected_amount"], "250000.00")
        self.assertTrue(
            any(
                point["amount"] != "0.00"
                for point in payload["line_chart"]["current"]
            )
        )
        self.assertGreater(len(payload["pie_chart"]["slices"]), 0)

    @patch("app_finance.homepage_services._today_for_org")
    def test_intake_range_in_progress_unchanged(self, mock_today):
        suffix = uuid4().hex[:6]
        self._create_intake_program(suffix)
        mock_today.return_value = date(2026, 8, 3)
        month_start, _month_end = _month_filter_bounds(date(2026, 8, 1))
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.in_progress_course,
                status=UserPayment.Status.VERIFIED,
                verified_at=month_start + timedelta(hours=6),
                actual_amount=Money(75000, "USD"),
            )
            payload = build_finance_homepage_payload(
                program_id=self.program.id,
                intake_id=self.in_progress_intake.id,
                period="intake_range",
                date_from=None,
                date_to=None,
                pie_group_by="payment_status",
                user=self.manager,
                org=self.org,
            )
        self.assertEqual(payload["summary"]["collected_count"], 1)
        self.assertEqual(payload["summary"]["collected_amount"], "75000.00")
        self.assertEqual(payload["meta"]["date_from"], "2026-01-01")
        self.assertEqual(payload["meta"]["date_to"], "2026-08-03")
