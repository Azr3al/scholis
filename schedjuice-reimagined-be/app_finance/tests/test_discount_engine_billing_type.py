"""Coverage-driven pricing and billing-type behaviour in the discount engine."""

from __future__ import annotations

import unittest
from datetime import date, datetime
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from decimal import Decimal
from uuid import uuid4

from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_finance.discount_engine import (
    apply_enrollment_discount,
    compute_invoiced_amount,
    consume_discount_state_after_invoice,
    course_months,
    estimate_billing_period_count,
    resolve_term_fee,
)
from app_finance.models import Discount, EnrollmentDiscount, PaymentPlan
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class DiscountEngineBillingTypeTests(TestCase):
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
            self.admin = User.objects.create_user(
                email=f"adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"plan-{suffix}",
                price=Money(500, "USD"),
                discount_price=Money(450, "USD"),
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

    def test_resolve_term_fee_whole_term_ignores_month_count(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
            self.plan.price = Money(410000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            fee = resolve_term_fee(plan=self.plan, course=self.course)
        self.assertEqual(fee, Money(410000, "USD"))

    def test_resolve_term_fee_per_period_multiplies_by_course_months(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.price = Money(100, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            fee = resolve_term_fee(plan=self.plan, course=self.course)
        # setUp course runs 2026-01-01 .. 2026-06-30 => 6 calendar months.
        self.assertEqual(fee, Money(600, "USD"))

    def test_course_without_dates_counts_as_one_period(self):
        class CourseWithoutDates:
            start_date = None
            end_date = None

        bare = CourseWithoutDates()
        self.assertEqual(course_months(bare), [])
        self.assertEqual(estimate_billing_period_count(course=bare), 1)

    def _fixed_whole_enrollment(self, amount: str):
        """Active fixed whole-enrollment discount on the setUp enrollment."""
        with schema_context(self.schema_name):
            discount = Discount.objects.create(
                name=f"fixed-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(Decimal(amount), "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            return apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )

    def _whole_term_acca_setup(self):
        """Receipt #172: 410,000 whole-term fee, Early Bird 180k + Loyalty 40k."""
        self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
        self.plan.price = Money(410000, "USD")
        self.plan.save(update_fields=["billing_type", "price", "updated_at"])
        # 5 calendar months: 2026-01 .. 2026-05
        self.course.start_date = date(2026, 1, 1)
        self.course.end_date = date(2026, 5, 31)
        self.course.save(update_fields=["start_date", "end_date"])
        for name, amount in (("eb", "180000"), ("loyalty", "40000")):
            discount = Discount.objects.create(
                name=f"{name}-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(Decimal(amount), "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )

    def test_per_period_span_sums_each_covered_month(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.price = Money(100000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            self._fixed_whole_enrollment("180000")  # 6 months => 30,000/month
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.base_amount, Money(300000, "USD"))
        self.assertEqual(result.discount_amount, Money(90000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(210000, "USD"))

    def test_per_period_span_does_not_exceed_fixed_credit(self):
        """A 3-month span must not draw 3x the share when only 1 share remains."""
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.price = Money(100000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            ed = self._fixed_whole_enrollment("180000")
            ed.remaining_credit = Money(30000, "USD")
            ed.save(update_fields=["remaining_credit", "updated_at"])
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.discount_amount, Money(30000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(270000, "USD"))

    def test_first_period_scope_applies_only_at_course_index_zero(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.price = Money(100000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            discount = Discount.objects.create(
                name=f"fp-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.FIRST_PERIOD,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )
            with_first = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2)],
                org=self.org,
                user_active_course_count=1,
            )
            without_first = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(with_first.discount_amount, Money(10000, "USD"))
        self.assertEqual(without_first.discount_amount, Money(0, "USD"))

    def test_covered_month_outside_course_is_rejected(self):
        with schema_context(self.schema_name):
            with self.assertRaises(ValueError) as ctx:
                compute_invoiced_amount(
                    user_course=self.enrollment,
                    payment_plan=self.plan,
                    covered_months=[(2030, 11)],
                    org=self.org,
                    user_active_course_count=1,
                )
        self.assertEqual(str(ctx.exception), "covered_month_outside_course")

    def test_whole_term_discounts_are_not_divided_by_period(self):
        """
        Regression: receipt #172 invoiced 366,000 because a 180,000 Early Bird
        was applied as 180,000/5 against the full 410,000 term fee. Whole-term
        discounts apply once, at full value.
        """
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, m) for m in range(1, 6)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.base_amount, Money(410000, "USD"))
        self.assertEqual(result.discount_amount, Money(220000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(190000, "USD"))

    def test_whole_term_partial_coverage_prorates_base_but_not_discount(self):
        """Base follows month count; the discount lands in full on transaction 1."""
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.base_amount, Money(246000, "USD"))
        self.assertEqual(result.discount_amount, Money(220000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(26000, "USD"))

    def test_whole_term_lines_sum_to_discount_amount(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
            line_sum = sum((ln.amount for ln in result.lines), Money(0, "USD"))
        self.assertEqual(line_sum, result.discount_amount)

    def test_whole_term_discount_is_clamped_to_an_undersized_first_payment(self):
        """1 month of base (82,000) cannot absorb 220,000 of discount."""
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1)],
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.base_amount, Money(82000, "USD"))
        self.assertEqual(result.discount_amount, Money(82000, "USD"))
        self.assertEqual(result.invoiced_amount, Money(0, "USD"))

    def test_whole_term_apply_leaves_per_period_share_null(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
            self.plan.price = Money(410000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            ed = self._fixed_whole_enrollment("180000")
        self.assertIsNone(ed.per_period_share)
        self.assertEqual(ed.remaining_credit, Money(180000, "USD"))

    def test_whole_term_percent_discount_gets_a_credit(self):
        """Without a credit a percent discount would re-apply every transaction."""
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
            self.plan.price = Money(400000, "USD")
            self.plan.save(update_fields=["billing_type", "price", "updated_at"])
            discount = Discount.objects.create(
                name=f"pct-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            ed = apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )
        self.assertEqual(ed.remaining_credit, Money(40000, "USD"))

    def test_whole_term_split_transactions_sum_to_term_total(self):
        """3 months then 2 months must total the same 190,000 as one payment."""
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()

            first = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 1), (2026, 2), (2026, 3)],
                org=self.org,
                user_active_course_count=1,
            )
            for line in first.lines:
                consume_discount_state_after_invoice(
                    enrollment_discount=EnrollmentDiscount.objects.get(
                        id=line.enrollment_discount_id
                    ),
                    discount_amount=line.amount,
                    period_indices=[0, 1, 2],
                )

            second = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                covered_months=[(2026, 4), (2026, 5)],
                org=self.org,
                user_active_course_count=1,
            )

        self.assertEqual(first.invoiced_amount, Money(26000, "USD"))
        self.assertEqual(second.discount_amount, Money(0, "USD"))
        self.assertEqual(second.invoiced_amount, Money(164000, "USD"))
        self.assertEqual(
            first.invoiced_amount + second.invoiced_amount, Money(190000, "USD")
        )

    def test_per_period_apply_still_sets_share(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.save(update_fields=["billing_type", "updated_at"])
            ed = self._fixed_whole_enrollment("180000")
        # setUp course spans 6 months.
        self.assertEqual(ed.per_period_share, Money(30000, "USD"))

    def test_consume_marks_first_period_when_span_includes_index_zero(self):
        with schema_context(self.schema_name):
            self.plan.billing_type = PaymentPlan.BillingType.PER_PERIOD
            self.plan.save(update_fields=["billing_type", "updated_at"])
            discount = Discount.objects.create(
                name=f"fp-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.FIRST_PERIOD,
            )
            ed = apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
            )
            consume_discount_state_after_invoice(
                enrollment_discount=ed,
                discount_amount=Money(10000, "USD"),
                period_indices=[2, 3],
            )
            ed.refresh_from_db()
            self.assertFalse(ed.first_period_consumed)

            consume_discount_state_after_invoice(
                enrollment_discount=ed,
                discount_amount=Money(10000, "USD"),
                period_indices=[0, 1],
            )
            ed.refresh_from_db()
        self.assertTrue(ed.first_period_consumed)
