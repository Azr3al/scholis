"""Tests for generate_invoices management command."""

from __future__ import annotations

import unittest
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import PaymentPlan, UserPayment
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class GenerateInvoicesWholeTermTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.filter(schema_name=self.schema_name).first()
            self.org.invoice_generation_strategy = (
                Organization.InvoiceGenerationStrategy.TR_PHILLIPS_STYLE
            )
            self.org.invoice_generation_interval_days = 30
            self.org.save(
                update_fields=[
                    "invoice_generation_strategy",
                    "invoice_generation_interval_days",
                    "updated_at",
                ]
            )
        with schema_context(self.schema_name):
            self.student = User.objects.create_user(
                email=f"stu-inv-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"whole-{suffix}",
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
                end_date=date(2026, 6, 30),
                payment_plan=self.plan,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(410000, "USD"),
            )

    @patch("app_tasks.management.commands.generate_invoices._get_current_org")
    @patch("app_course.models.UserCourse.objects.raw")
    def test_whole_term_enrollment_is_not_invoiced_twice(
        self, mock_raw, mock_get_org
    ):
        mock_get_org.return_value = self.org
        mock_raw.return_value = [
            SimpleNamespace(
                user_id=self.student.id,
                course_id=self.course.id,
                billing_start_date=None,
                billing_end_date=None,
                price=self.plan.price,
                discount_price=None,
                epd=0,
                course_start_date=date(2026, 1, 1),
                billing_cycle_anchor_date=None,
                id=1,
            )
        ]

        with schema_context(self.schema_name):
            before = UserPayment.objects.filter(
                user_id=self.student.id,
                course_id=self.course.id,
            ).count()
            call_command("generate_invoices", verbosity=0)
            after = UserPayment.objects.filter(
                user_id=self.student.id,
                course_id=self.course.id,
            ).count()

        self.assertEqual(before, 1)
        self.assertEqual(after, 1)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class GenerateInvoicesEarlyPaymentTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.filter(schema_name=self.schema_name).first()
            self.org.invoice_generation_strategy = (
                Organization.InvoiceGenerationStrategy.TR_PHILLIPS_STYLE
            )
            self.org.invoice_generation_interval_days = 30
            self.org.save(
                update_fields=[
                    "invoice_generation_strategy",
                    "invoice_generation_interval_days",
                    "updated_at",
                ]
            )
        with schema_context(self.schema_name):
            self.student = User.objects.create_user(
                email=f"stu-early-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"monthly-{suffix}",
                price=Money(50000, "USD"),
                billing_type=PaymentPlan.BillingType.PER_PERIOD,
                early_payment_days=3,
            )
            cat = Category.objects.create(name=f"Cat early {suffix}")
            prog = Program.objects.create(
                name=f"P early {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            start = today + timedelta(days=2)
            self.course = Course.objects.create(
                title=f"Future {suffix}",
                category=cat,
                program=prog,
                start_date=start,
                end_date=start + timedelta(days=60),
                payment_plan=self.plan,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    @patch("app_tasks.management.commands.generate_invoices._get_current_org")
    def test_first_invoice_created_inside_early_payment_window(self, mock_get_org):
        mock_get_org.return_value = self.org
        with schema_context(self.schema_name):
            before = UserPayment.objects.filter(
                user_id=self.student.id,
                course_id=self.course.id,
            ).count()
            call_command("generate_invoices", verbosity=0)
            after = UserPayment.objects.filter(
                user_id=self.student.id,
                course_id=self.course.id,
            ).count()
            pending = UserPayment.objects.filter(
                user_id=self.student.id,
                course_id=self.course.id,
                status=UserPayment.Status.PENDING_PAYMENT,
            ).exists()
        self.assertEqual(before, 0)
        self.assertEqual(after, 1)
        self.assertTrue(pending)

    @patch("app_tasks.management.commands.generate_invoices._get_current_org")
    def test_first_invoice_not_created_outside_early_payment_window(self, mock_get_org):
        mock_get_org.return_value = self.org
        today = timezone.localdate()
        with schema_context(self.schema_name):
            self.course.start_date = today + timedelta(days=10)
            self.course.end_date = today + timedelta(days=70)
            self.course.save(update_fields=["start_date", "end_date", "updated_at"])
            call_command("generate_invoices", verbosity=0)
            count = UserPayment.objects.filter(
                user_id=self.student.id,
                course_id=self.course.id,
            ).count()
        self.assertEqual(count, 0)
