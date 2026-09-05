"""Tests for split-screenshot group pricing backfill."""

from __future__ import annotations

import unittest
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.backfill_split_screenshot_group_pricing import (
    backfill_split_screenshot_group_pricing,
)
from app_finance.models import PaymentBank, PaymentMethod, PaymentPlan, UserPayment
from app_finance.payment_coverage import sync_user_payment_covered_months
from app_finance.payment_group import create_user_payment_group_with_parts
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class BackfillSplitScreenshotGroupPricingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.month_start = timezone.make_aware(
            datetime(self.today.year, self.today.month, 1, 0, 0, 0)
        )
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-bf-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-bf-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"plan-bf-{suffix}",
                price=Money(130000, "USD"),
                billing_type=PaymentPlan.BillingType.PER_PERIOD,
            )
            cat = Category.objects.create(name=f"Cat bf {suffix}")
            prog = Program.objects.create(
                name=f"P bf {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C bf {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 3, 31),
                payment_plan=self.plan,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.kpay = PaymentMethod.objects.create(
                name=f"KPay bf {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            self.cash = PaymentMethod.objects.create(
                name=f"Cash bf {suffix}",
                payment_bank=PaymentBank.CASH,
            )

    def _coverage_three_months(self):
        return [
            {"year": 2026, "month_index": 1},
            {"year": 2026, "month_index": 2},
            {"year": 2026, "month_index": 3},
        ]

    def _create_mispriced_group(self):
        coverage = self._coverage_three_months()
        with schema_context(self.schema_name):
            group = create_user_payment_group_with_parts(
                actor=self.finance,
                user=self.student,
                course=self.course,
                plan_fields={
                    "issued_at": self.month_start,
                    "billing_start_date": self.month_start,
                    "billing_end_date": self.month_start,
                    "is_installment": False,
                    "installment_percent": None,
                },
                coverage=coverage,
                parts=[
                    {
                        "parsed_amount": "120000",
                        "payment_method": self.kpay,
                        "transaction_id": f"{uuid4().int % 10**20:020d}",
                    },
                    {
                        "parsed_amount": "90000",
                        "payment_method": self.cash,
                        "transaction_id": f"{uuid4().int % 10**20:020d}",
                    },
                ],
                amount_fields={
                    "base_amount": Money(130000, "USD"),
                    "discount_amount": Money(0, "USD"),
                    "invoiced_amount": Money(210000, "USD"),
                    "computed_invoiced_amount": Money(210000, "USD"),
                },
            )
            parts = list(group.parts.order_by("id"))
            for part in parts:
                sync_user_payment_covered_months(part, coverage)
            return parts[0], parts[1]

    def test_backfill_rewrites_mispriced_first_part_from_coverage(self):
        first, second = self._create_mispriced_group()

        changed = backfill_split_screenshot_group_pricing(self.schema_name)
        first.refresh_from_db()
        second.refresh_from_db()

        self.assertEqual(changed, [first.id])
        self.assertEqual(first.base_amount, Money(390000, "USD"))
        self.assertEqual(first.invoiced_amount, Money(390000, "USD"))
        self.assertIsNone(second.base_amount)

    def test_backfill_is_idempotent(self):
        first, _ = self._create_mispriced_group()
        backfill_split_screenshot_group_pricing(self.schema_name)
        second_run = backfill_split_screenshot_group_pricing(self.schema_name)
        self.assertEqual(second_run, [])

    def test_backfill_skips_overridden_first_part(self):
        first, _ = self._create_mispriced_group()
        with schema_context(self.schema_name):
            first.is_amount_overridden = True
            first.save(update_fields=["is_amount_overridden", "updated_at"])

        changed = backfill_split_screenshot_group_pricing(self.schema_name)
        first.refresh_from_db()

        self.assertEqual(changed, [])
        self.assertEqual(first.base_amount, Money(130000, "USD"))

    def test_backfill_dry_run_writes_nothing(self):
        first, _ = self._create_mispriced_group()
        planned = backfill_split_screenshot_group_pricing(
            self.schema_name, dry_run=True
        )
        first.refresh_from_db()

        self.assertEqual(planned, [first.id])
        self.assertEqual(first.base_amount, Money(130000, "USD"))
        self.assertEqual(
            Decimal(str(first.invoiced_amount.amount)), Decimal("210000")
        )
