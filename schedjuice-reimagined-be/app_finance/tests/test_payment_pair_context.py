"""Bulk payment pair context and admin-report attach efficiency."""

from __future__ import annotations

import copy
import unittest
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import PaymentPlan, UserPayment
from app_finance.payment_context import attach_course_payment_context
from app_finance.payment_pair_context import build_payment_pair_context
from app_finance.views import UserPaymentAdminReportView
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _run_report_attach_chain(rows: list[dict]) -> None:
    ctx = build_payment_pair_context(
        rows,
        include_courses=True,
        include_coverage=True,
    )
    UserPaymentAdminReportView._attach_enrollment_metadata(rows, ctx=ctx)
    UserPaymentAdminReportView._attach_installment_cumulative_metadata(rows, ctx=ctx)
    attach_course_payment_context(rows, ctx=ctx)
    UserPaymentAdminReportView._attach_remaining_amount_metadata(rows, ctx=ctx)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class PaymentPairContextTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.filter(schema_name=self.schema_name).first()
        with schema_context(self.schema_name):
            self.plan = PaymentPlan.objects.create(
                name=f"plan-{suffix}",
                price=Money(410000, "USD"),
                billing_type=PaymentPlan.BillingType.WHOLE_TERM,
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 5, 31),
                payment_plan=self.plan,
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.enrollment = UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def _payment_rows(self, count: int) -> list[dict]:
        rows: list[dict] = []
        for index in range(count):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(26000, "USD"),
                actual_amount=Money(26000, "USD"),
                status=UserPayment.Status.VERIFIED,
                issued_at=timezone.now() + timedelta(minutes=index),
            )
            rows.append(
                {
                    "id": payment.id,
                    "user": {"id": self.student.id},
                    "course": {"id": self.course.id},
                }
            )
        return rows

    def test_report_attach_chain_is_constant_query_count(self):
        with schema_context(self.schema_name):
            rows = self._payment_rows(2)
            with self.assertNumQueries(5) as first_pass:
                _run_report_attach_chain(rows)
            rows += self._payment_rows(2)
            with self.assertNumQueries(len(first_pass)):
                _run_report_attach_chain(rows)

    def test_attach_context_matches_prebuilt_context(self):
        with schema_context(self.schema_name):
            rows = self._payment_rows(2)
            built_in = copy.deepcopy(rows)
            attach_course_payment_context(built_in)

            prebuilt = copy.deepcopy(rows)
            ctx = build_payment_pair_context(prebuilt)
            attach_course_payment_context(prebuilt, ctx=ctx)

        self.assertEqual(built_in, prebuilt)

    def test_prebuilt_context_issues_no_extra_queries_on_attach(self):
        with schema_context(self.schema_name):
            rows = self._payment_rows(2)
            ctx = build_payment_pair_context(rows)
            with self.assertNumQueries(0):
                attach_course_payment_context(rows, ctx=ctx)
