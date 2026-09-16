"""Payment repricing audit, backfill, and receipt context tests."""

from __future__ import annotations

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
from app_finance.discount_engine import apply_enrollment_discount, compute_course_term_total
from app_finance.models import Discount, EnrollmentDiscount, PaymentPlan, UserPayment
from app_finance.payment_context import attach_course_payment_context
from app_finance.payment_coverage import sync_user_payment_covered_months
from app_finance.payment_repricing_audit import (
    STATUS_MISPRICED,
    STATUS_SKIPPED_OUT_OF_RANGE,
    STATUS_SKIPPED_OVERRIDDEN,
    audit_payment_repricing,
    iter_payment_repricing_rows,
)
from app_finance.payment_repricing_backfill import backfill_payment_repricing
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class PaymentRepricingTests(TestCase):
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

    def _whole_term_acca_setup(self):
        """Receipt #172: 410,000 whole-term fee, Early Bird 180k + Loyalty 40k."""
        self.plan.billing_type = PaymentPlan.BillingType.WHOLE_TERM
        self.plan.price = Money(410000, "USD")
        self.plan.save(update_fields=["billing_type", "price", "updated_at"])
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

    def _two_payment_rows(self):
        first = UserPayment.objects.create(
            user=self.student,
            course=self.course,
            invoiced_amount=Money(26000, "USD"),
            actual_amount=Money(26000, "USD"),
            status=UserPayment.Status.VERIFIED,
            issued_at=timezone.now() - timedelta(days=10),
        )
        second = UserPayment.objects.create(
            user=self.student,
            course=self.course,
            invoiced_amount=Money(164000, "USD"),
            actual_amount=Money(164000, "USD"),
            status=UserPayment.Status.VERIFIED,
            issued_at=timezone.now(),
        )
        return [
            {
                "id": p.id,
                "user": {"id": self.student.id},
                "course": {"id": self.course.id},
            }
            for p in (first, second)
        ]

    def test_override_fields_default_to_unset(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(190000, "USD"),
            )
        self.assertFalse(payment.is_amount_overridden)
        self.assertIsNone(payment.computed_invoiced_amount)
        self.assertIsNone(payment.amount_override_reason)

    def test_audit_flags_mispriced_whole_term_payment(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                base_amount=Money(410000, "USD"),
                discount_amount=Money(44000, "USD"),
                invoiced_amount=Money(366000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            rows = audit_payment_repricing(self.schema_name)
        row = next(r for r in rows if r.payment_id == payment.id)
        self.assertEqual(row.status, STATUS_MISPRICED)
        self.assertEqual(row.computed_invoiced, Decimal("190000.00"))
        self.assertEqual(row.delta, Decimal("-176000.00"))

    def test_audit_skips_overridden_payment(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(1, "USD"),
                is_amount_overridden=True,
            )
            sync_user_payment_covered_months(
                payment, [{"year": 2026, "month_index": 1}]
            )
            rows = audit_payment_repricing(self.schema_name)
        row = next(r for r in rows if r.payment_id == payment.id)
        self.assertEqual(row.status, STATUS_SKIPPED_OVERRIDDEN)

    def test_audit_skips_coverage_outside_course(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(100, "USD"),
            )
            sync_user_payment_covered_months(
                payment, [{"year": 2030, "month_index": 11}]
            )
            rows = audit_payment_repricing(self.schema_name)
        row = next(r for r in rows if r.payment_id == payment.id)
        self.assertEqual(row.status, STATUS_SKIPPED_OUT_OF_RANGE)

    def test_backfill_rewrites_mispriced_amounts_only(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                base_amount=Money(410000, "USD"),
                discount_amount=Money(44000, "USD"),
                invoiced_amount=Money(366000, "USD"),
                parsed_amount=Money(190000, "USD"),
                actual_amount=Money(190000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            changed = backfill_payment_repricing(self.schema_name)
            payment.refresh_from_db()

        self.assertEqual(len(changed), 1)
        self.assertEqual(payment.invoiced_amount, Money(190000, "USD"))
        self.assertEqual(payment.discount_amount, Money(220000, "USD"))
        self.assertEqual(payment.computed_invoiced_amount, Money(190000, "USD"))
        self.assertEqual(payment.parsed_amount, Money(190000, "USD"))
        self.assertEqual(payment.actual_amount, Money(190000, "USD"))

    def test_backfill_is_idempotent(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(366000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            first = backfill_payment_repricing(self.schema_name)
            second = backfill_payment_repricing(self.schema_name)
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 0)

    def test_backfill_dry_run_writes_nothing(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(366000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            planned = backfill_payment_repricing(self.schema_name, dry_run=True)
            payment.refresh_from_db()
        self.assertEqual(len(planned), 1)
        self.assertEqual(payment.invoiced_amount, Money(366000, "USD"))

    def test_backfill_skips_overridden_payment(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(1, "USD"),
                is_amount_overridden=True,
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            backfill_payment_repricing(self.schema_name)
            payment.refresh_from_db()
        self.assertEqual(payment.invoiced_amount, Money(1, "USD"))

    def test_backfill_clears_stale_whole_term_per_period_share(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            ed = EnrollmentDiscount.objects.filter(
                user_course=self.enrollment, is_active=True
            ).first()
            ed.per_period_share = Money(36000, "USD")
            ed.save(update_fields=["per_period_share", "updated_at"])

            backfill_payment_repricing(self.schema_name)
            ed.refresh_from_db()
        self.assertIsNone(ed.per_period_share)

    def test_payment_sequence_counts_per_course(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            rows = self._two_payment_rows()
            attach_course_payment_context(rows)
        self.assertEqual(rows[0]["payment_sequence"], 1)
        self.assertEqual(rows[1]["payment_sequence"], 2)

    def test_term_total_is_identical_on_every_receipt(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            rows = self._two_payment_rows()
            attach_course_payment_context(rows)
        self.assertEqual(rows[0]["term_total"], "190000.00")
        self.assertEqual(rows[1]["term_total"], "190000.00")
        self.assertEqual(rows[1]["paid_to_date"], "190000.00")

    def test_term_total_survives_credit_consumption(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            before = compute_course_term_total(
                user_course=self.enrollment, payment_plan=self.plan
            )
            EnrollmentDiscount.objects.filter(user_course=self.enrollment).update(
                remaining_credit=Money(0, "USD")
            )
            after = compute_course_term_total(
                user_course=self.enrollment, payment_plan=self.plan
            )
        self.assertEqual(before, Money(190000, "USD"))
        self.assertEqual(after, Money(190000, "USD"))

    def test_context_attach_is_constant_query_count(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            rows = self._two_payment_rows()
            rows += self._two_payment_rows()
            with self.assertNumQueries(3):
                attach_course_payment_context(rows)

    def _create_mispriced_payments(self, count: int) -> None:
        for _ in range(count):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(366000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )

    def test_audit_is_constant_query_count(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            self._create_mispriced_payments(2)
            with self.assertNumQueries(5) as first_pass:
                audit_payment_repricing(self.schema_name)
            self._create_mispriced_payments(2)
            with self.assertNumQueries(len(first_pass)):
                audit_payment_repricing(self.schema_name)

    def test_audit_chunk_size_does_not_change_results(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            self._create_mispriced_payments(3)
            default_rows = audit_payment_repricing(self.schema_name)
            chunked_rows = list(
                iter_payment_repricing_rows(self.schema_name, chunk_size=1)
            )
        self.assertEqual(default_rows, chunked_rows)

    def test_backfill_chunk_size_one_reprices_without_touching_evidence(self):
        with schema_context(self.schema_name):
            self._whole_term_acca_setup()
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                invoiced_amount=Money(366000, "USD"),
                parsed_amount=Money(190000, "USD"),
                actual_amount=Money(190000, "USD"),
            )
            sync_user_payment_covered_months(
                payment,
                [{"year": 2026, "month_index": m} for m in range(1, 6)],
            )
            changed = backfill_payment_repricing(self.schema_name, chunk_size=1)
            payment.refresh_from_db()
        self.assertEqual(len(changed), 1)
        self.assertEqual(payment.invoiced_amount, Money(190000, "USD"))
        self.assertEqual(payment.parsed_amount, Money(190000, "USD"))
        self.assertEqual(payment.actual_amount, Money(190000, "USD"))
