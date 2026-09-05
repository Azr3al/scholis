import unittest
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import IntegrityError, connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.discount_engine import (
    apply_enrollment_discount,
    compute_invoiced_amount,
    consume_discount_state_after_invoice,
    estimate_billing_period_count,
    get_active_enrollment_discount,
    get_active_enrollment_discounts,
    remove_enrollment_discount,
    resolve_base_price,
    set_enrollment_discounts,
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
class DiscountEngineTests(TestCase):
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

    def test_estimate_billing_period_count_calendar_months(self):
        with schema_context(self.schema_name):
            count = estimate_billing_period_count(course=self.course, org=self.org)
        self.assertEqual(count, 6)

    def test_resolve_base_price_without_enrollment_discount_uses_plan_price(self):
        with schema_context(self.schema_name):
            base = resolve_base_price(
                user_course=self.enrollment,
                payment_plan=self.plan,
                user_active_course_count=1,
            )
        self.assertEqual(base, Money(500, "USD"))

    def test_resolve_base_price_legacy_sibling_uses_discount_price(self):
        with schema_context(self.schema_name):
            base = resolve_base_price(
                user_course=self.enrollment,
                payment_plan=self.plan,
                user_active_course_count=2,
            )
        self.assertEqual(base, Money(450, "USD"))

    def _apply_percent(self, scope, value="10"):
        with schema_context(self.schema_name):
            ed = EnrollmentDiscount.objects.create(
                user_course=self.enrollment,
                snapshot_discount_type=Discount.DiscountType.PERCENT,
                snapshot_scope=scope,
                snapshot_percent_value=Decimal(value),
                applied_by=self.admin,
                is_active=True,
            )
            self.enrollment.active_enrollment_discount_list = [ed]
            return ed

    def test_percent_first_period_only_index_zero(self):
        with schema_context(self.schema_name):
            self._apply_percent(Discount.Scope.FIRST_PERIOD)
            r0 = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                billing_period_index=0,
                org=self.org,
                user_active_course_count=1,
            )
            r1 = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                billing_period_index=1,
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(r0.invoiced_amount, Money(450, "USD"))
        self.assertEqual(r1.invoiced_amount, Money(500, "USD"))

    def test_percent_whole_enrollment_all_periods(self):
        with schema_context(self.schema_name):
            self._apply_percent(Discount.Scope.WHOLE_ENROLLMENT)
            for idx in (0, 1, 2):
                r = compute_invoiced_amount(
                    user_course=self.enrollment,
                    payment_plan=self.plan,
                    billing_period_index=idx,
                    org=self.org,
                    user_active_course_count=1,
                )
                self.assertEqual(r.invoiced_amount, Money(450, "USD"))

    def test_enrollment_discount_beats_legacy_sibling(self):
        with schema_context(self.schema_name):
            self._apply_percent(Discount.Scope.WHOLE_ENROLLMENT, "10")
            r = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                billing_period_index=0,
                org=self.org,
                user_active_course_count=3,
            )
        self.assertEqual(r.invoiced_amount, Money(450, "USD"))

    def test_apply_fixed_whole_sets_remaining_credit_and_share(self):
        with schema_context(self.schema_name):
            discount = Discount.objects.create(
                name=f"200off-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(200, "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            ed = apply_enrollment_discount(
                user_course=self.enrollment,
                discount=discount,
                applied_by=self.admin,
                org=self.org,
                reason="scholarship",
            )
        self.assertEqual(ed.remaining_credit, Money(200, "USD"))
        self.assertEqual(ed.per_period_share.amount, Decimal("33.33"))

    def test_apply_second_keeps_first_active(self):
        with schema_context(self.schema_name):
            d1 = Discount.objects.create(
                name=f"d1-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.FIRST_PERIOD,
            )
            d2 = Discount.objects.create(
                name=f"d2-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("20"),
                scope=Discount.Scope.FIRST_PERIOD,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d1,
                applied_by=self.admin,
                org=self.org,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d2,
                applied_by=self.admin,
                org=self.org,
            )
            active = get_active_enrollment_discounts(self.enrollment)
            inactive_count = EnrollmentDiscount.objects.filter(
                user_course=self.enrollment, is_active=False
            ).count()
        self.assertEqual(len(active), 2)
        self.assertEqual(inactive_count, 0)
        self.assertEqual(
            {ed.snapshot_percent_value for ed in active},
            {Decimal("10"), Decimal("20")},
        )

    def test_apply_duplicate_template_raises(self):
        with schema_context(self.schema_name):
            d1 = Discount.objects.create(
                name=f"d1-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.FIRST_PERIOD,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d1,
                applied_by=self.admin,
                org=self.org,
            )
            with self.assertRaises(ValueError) as ctx:
                apply_enrollment_discount(
                    user_course=self.enrollment,
                    discount=d1,
                    applied_by=self.admin,
                    org=self.org,
                )
            self.assertEqual(str(ctx.exception), "already_applied")
            self.assertEqual(len(get_active_enrollment_discounts(self.enrollment)), 1)

    def test_stack_two_percents_independent_off_base(self):
        with schema_context(self.schema_name):
            d1 = Discount.objects.create(
                name=f"p10-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            d2 = Discount.objects.create(
                name=f"p5-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("5"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d1,
                applied_by=self.admin,
                org=self.org,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d2,
                applied_by=self.admin,
                org=self.org,
            )
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                billing_period_index=0,
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.base_amount, Money(500, "USD"))
        self.assertEqual(result.discount_amount, Money(75, "USD"))
        self.assertEqual(result.invoiced_amount, Money(425, "USD"))
        self.assertEqual(len(result.lines), 2)
        self.assertEqual(
            sum((ln.amount for ln in result.lines), Money(0, "USD")),
            Money(75, "USD"),
        )

    def test_stack_scales_when_sum_exceeds_base(self):
        with schema_context(self.schema_name):
            self.plan.price = Money(100, "USD")
            self.plan.save(update_fields=["price", "updated_at"])
            d1 = Discount.objects.create(
                name=f"p60a-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("60"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            d2 = Discount.objects.create(
                name=f"p60b-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("60"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d1,
                applied_by=self.admin,
                org=self.org,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d2,
                applied_by=self.admin,
                org=self.org,
            )
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                billing_period_index=0,
                org=self.org,
                user_active_course_count=1,
            )
        self.assertEqual(result.discount_amount, Money(100, "USD"))
        self.assertEqual(result.invoiced_amount, Money(0, "USD"))
        self.assertEqual(
            sum((ln.amount for ln in result.lines), Money(0, "USD")),
            Money(100, "USD"),
        )

    def test_set_enrollment_discounts_reconciles(self):
        with schema_context(self.schema_name):
            d1 = Discount.objects.create(
                name=f"s1-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            d2 = Discount.objects.create(
                name=f"s2-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("5"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            d3 = Discount.objects.create(
                name=f"s3-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("3"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d1,
                applied_by=self.admin,
                org=self.org,
            )
            set_enrollment_discounts(
                user_course=self.enrollment,
                discount_ids=[d2.id, d3.id],
                applied_by=self.admin,
                org=self.org,
            )
            active = get_active_enrollment_discounts(self.enrollment)
            active_template_ids = {ed.discount_id for ed in active}
            d1_still_active = EnrollmentDiscount.objects.filter(
                user_course=self.enrollment, discount=d1, is_active=True
            ).exists()
        self.assertEqual(active_template_ids, {d2.id, d3.id})
        self.assertFalse(d1_still_active)

    def test_consume_two_fixed_whole_enrollment_independently(self):
        with schema_context(self.schema_name):
            d1 = Discount.objects.create(
                name=f"f1-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(120, "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            d2 = Discount.objects.create(
                name=f"f2-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.FIXED_AMOUNT,
                fixed_amount=Money(60, "USD"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            ed1 = apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d1,
                applied_by=self.admin,
                org=self.org,
            )
            ed2 = apply_enrollment_discount(
                user_course=self.enrollment,
                discount=d2,
                applied_by=self.admin,
                org=self.org,
            )
            result = compute_invoiced_amount(
                user_course=self.enrollment,
                payment_plan=self.plan,
                billing_period_index=0,
                org=self.org,
                user_active_course_count=1,
            )
            for ln in result.lines:
                ed = EnrollmentDiscount.objects.get(id=ln.enrollment_discount_id)
                consume_discount_state_after_invoice(
                    enrollment_discount=ed,
                    billing_period_index=0,
                    discount_amount=ln.amount,
                )
            ed1.refresh_from_db()
            ed2.refresh_from_db()
            line1 = next(ln for ln in result.lines if ln.enrollment_discount_id == ed1.id)
            line2 = next(ln for ln in result.lines if ln.enrollment_discount_id == ed2.id)
        self.assertEqual(ed1.remaining_credit, Money(120, "USD") - line1.amount)
        self.assertEqual(ed2.remaining_credit, Money(60, "USD") - line2.amount)

    def test_consume_first_period_marks_consumed(self):
        with schema_context(self.schema_name):
            ed = self._apply_percent(Discount.Scope.FIRST_PERIOD)
            consume_discount_state_after_invoice(
                enrollment_discount=ed,
                billing_period_index=0,
                discount_amount=Money(50, "USD"),
            )
            ed.refresh_from_db()
        self.assertTrue(ed.first_period_consumed)

    def test_remove_enrollment_discount(self):
        with schema_context(self.schema_name):
            self._apply_percent(Discount.Scope.WHOLE_ENROLLMENT)
            remove_enrollment_discount(user_course=self.enrollment, removed_by=self.admin)
            active = get_active_enrollment_discount(self.enrollment)
        self.assertIsNone(active)

    def test_two_active_enrollment_discounts_allowed_for_different_templates(self):
        with schema_context(self.schema_name):
            d1 = Discount.objects.create(
                name=f"p1-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
                is_active=True,
            )
            d2 = Discount.objects.create(
                name=f"p2-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("5"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
                is_active=True,
            )
            EnrollmentDiscount.objects.create(
                user_course=self.enrollment,
                discount=d1,
                snapshot_discount_type=d1.discount_type,
                snapshot_scope=d1.scope,
                snapshot_percent_value=d1.percent_value,
                applied_by=self.admin,
                is_active=True,
            )
            EnrollmentDiscount.objects.create(
                user_course=self.enrollment,
                discount=d2,
                snapshot_discount_type=d2.discount_type,
                snapshot_scope=d2.scope,
                snapshot_percent_value=d2.percent_value,
                applied_by=self.admin,
                is_active=True,
            )
            self.assertEqual(
                EnrollmentDiscount.objects.filter(
                    user_course=self.enrollment, is_active=True
                ).count(),
                2,
            )

    def test_duplicate_active_template_rejected(self):
        with schema_context(self.schema_name):
            d1 = Discount.objects.create(
                name=f"dup-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
                is_active=True,
            )
            EnrollmentDiscount.objects.create(
                user_course=self.enrollment,
                discount=d1,
                snapshot_discount_type=d1.discount_type,
                snapshot_scope=d1.scope,
                snapshot_percent_value=d1.percent_value,
                applied_by=self.admin,
                is_active=True,
            )
            with self.assertRaises(IntegrityError):
                EnrollmentDiscount.objects.create(
                    user_course=self.enrollment,
                    discount=d1,
                    snapshot_discount_type=d1.discount_type,
                    snapshot_scope=d1.scope,
                    snapshot_percent_value=d1.percent_value,
                    applied_by=self.admin,
                    is_active=True,
                )
