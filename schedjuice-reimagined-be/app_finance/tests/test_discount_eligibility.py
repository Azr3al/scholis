import unittest
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.discount_eligibility import (
    build_eligibility_context,
    filter_selectable_discounts,
    is_discount_eligible,
)
from app_finance.models import Discount, PaymentPlan


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class DiscountEligibilityTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
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
                start_date=self.today - timedelta(days=1),
                end_date=self.today + timedelta(days=120),
                payment_plan=self.plan,
            )
            self.other_course = Course.objects.create(
                title=f"C2 {suffix}",
                category=cat,
                program=prog,
                start_date=self.today - timedelta(days=10),
                end_date=self.today + timedelta(days=60),
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

    def _percent(self, name: str, **kwargs) -> Discount:
        return Discount.objects.create(
            name=name,
            discount_type=Discount.DiscountType.PERCENT,
            percent_value=Decimal("10"),
            scope=Discount.Scope.WHOLE_ENROLLMENT,
            **kwargs,
        )

    def test_none_always_eligible(self):
        with schema_context(self.schema_name):
            d = self._percent(
                f"plain-{uuid4().hex[:6]}",
                eligibility_type=Discount.EligibilityType.NONE,
            )
            ok, reason = is_discount_eligible(
                discount=d,
                user=self.student,
                course=self.course,
                user_course=self.enrollment,
                as_of=self.today,
            )
            self.assertTrue(ok)
            self.assertIsNone(reason)

    def test_early_bird_inside_window(self):
        with schema_context(self.schema_name):
            # Re-point course start into the future for early-bird window math.
            self.course.start_date = self.today + timedelta(days=30)
            self.course.save(update_fields=["start_date", "updated_at"])
            d = self._percent(
                f"eb-in-{uuid4().hex[:6]}",
                eligibility_type=Discount.EligibilityType.EARLY_BIRD,
                early_bird_days=14,
            )
            as_of = self.course.start_date - timedelta(days=14)
            ok, reason = is_discount_eligible(
                discount=d,
                user=self.student,
                course=self.course,
                user_course=self.enrollment,
                as_of=as_of,
            )
            self.assertTrue(ok)
            self.assertIsNone(reason)

    def test_early_bird_outside_window(self):
        with schema_context(self.schema_name):
            self.course.start_date = self.today + timedelta(days=30)
            self.course.save(update_fields=["start_date", "updated_at"])
            d = self._percent(
                f"eb-out-{uuid4().hex[:6]}",
                eligibility_type=Discount.EligibilityType.EARLY_BIRD,
                early_bird_days=14,
            )
            as_of = self.course.start_date - timedelta(days=7)
            ok, reason = is_discount_eligible(
                discount=d,
                user=self.student,
                course=self.course,
                user_course=self.enrollment,
                as_of=as_of,
            )
            self.assertFalse(ok)
            self.assertEqual(reason, "early_bird_window_closed")

    def test_loyalty_with_prior_enrollment(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            d = self._percent(
                f"loy-{uuid4().hex[:6]}",
                eligibility_type=Discount.EligibilityType.LOYALTY,
            )
            ok, reason = is_discount_eligible(
                discount=d,
                user=self.student,
                course=self.course,
                user_course=self.enrollment,
                as_of=self.today,
            )
            self.assertTrue(ok)
            self.assertIsNone(reason)

    def test_loyalty_only_current(self):
        with schema_context(self.schema_name):
            d = self._percent(
                f"loy-no-{uuid4().hex[:6]}",
                eligibility_type=Discount.EligibilityType.LOYALTY,
            )
            ok, reason = is_discount_eligible(
                discount=d,
                user=self.student,
                course=self.course,
                user_course=self.enrollment,
                as_of=self.today,
            )
            self.assertFalse(ok)
            self.assertEqual(reason, "loyalty_not_met")

    def test_bulk_at_threshold(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            d = self._percent(
                f"bulk-{uuid4().hex[:6]}",
                eligibility_type=Discount.EligibilityType.BULK,
                bulk_min_courses=2,
            )
            ok, reason = is_discount_eligible(
                discount=d,
                user=self.student,
                course=self.course,
                user_course=self.enrollment,
                as_of=self.today,
            )
            self.assertTrue(ok)
            self.assertIsNone(reason)

    def test_bulk_below_threshold(self):
        with schema_context(self.schema_name):
            d = self._percent(
                f"bulk-low-{uuid4().hex[:6]}",
                eligibility_type=Discount.EligibilityType.BULK,
                bulk_min_courses=2,
            )
            ok, reason = is_discount_eligible(
                discount=d,
                user=self.student,
                course=self.course,
                user_course=self.enrollment,
                as_of=self.today,
            )
            self.assertFalse(ok)
            self.assertEqual(reason, "bulk_min_not_met")

    def test_build_eligibility_context_single_query(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            from django.test.utils import CaptureQueriesContext

            with CaptureQueriesContext(connection) as ctx:
                result = build_eligibility_context(
                    user_id=self.student.id,
                    user_course_id=self.enrollment.id,
                    as_of=self.today,
                )
            self.assertTrue(result.has_other_enrollment)
            self.assertEqual(result.active_course_count, 2)
            enrollment_sql = [
                q["sql"]
                for q in ctx.captured_queries
                if "app_course_usercourse" in q["sql"].lower()
            ]
            self.assertEqual(len(enrollment_sql), 1)

    def test_filter_selectable_discounts_does_not_scale_queries_with_rules(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.student,
                course=self.other_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            discounts = [
                self._percent(
                    f"loy-a-{uuid4().hex[:6]}",
                    eligibility_type=Discount.EligibilityType.LOYALTY,
                ),
                self._percent(
                    f"loy-b-{uuid4().hex[:6]}",
                    eligibility_type=Discount.EligibilityType.LOYALTY,
                ),
                self._percent(
                    f"bulk-a-{uuid4().hex[:6]}",
                    eligibility_type=Discount.EligibilityType.BULK,
                    bulk_min_courses=2,
                ),
                self._percent(
                    f"bulk-b-{uuid4().hex[:6]}",
                    eligibility_type=Discount.EligibilityType.BULK,
                    bulk_min_courses=2,
                ),
            ]
            from django.test.utils import CaptureQueriesContext

            with CaptureQueriesContext(connection) as ctx:
                selected = filter_selectable_discounts(
                    discounts=discounts,
                    user=self.student,
                    course=self.course,
                    user_course=self.enrollment,
                    as_of=self.today,
                    applied_template_ids=set(),
                    eligibility_enabled=True,
                )
            self.assertEqual(len(selected), 4)
            enrollment_sql = [
                q["sql"]
                for q in ctx.captured_queries
                if "app_course_usercourse" in q["sql"].lower()
            ]
            self.assertEqual(
                len(enrollment_sql),
                1,
                "loyalty/bulk rules should share one enrollment fetch",
            )

    def test_filter_selectable_discounts_skips_rules_when_disabled(self):
        with schema_context(self.schema_name):
            failing = self._percent(
                f"loy-no-{uuid4().hex[:6]}",
                eligibility_type=Discount.EligibilityType.LOYALTY,
            )
            from django.test.utils import CaptureQueriesContext

            with CaptureQueriesContext(connection) as ctx:
                selected = filter_selectable_discounts(
                    discounts=[failing],
                    user=self.student,
                    course=self.course,
                    user_course=self.enrollment,
                    as_of=self.today,
                    applied_template_ids=set(),
                    eligibility_enabled=False,
                )
            self.assertEqual(selected, [failing])
            enrollment_sql = [
                q["sql"]
                for q in ctx.captured_queries
                if "app_course_usercourse" in q["sql"].lower()
            ]
            self.assertEqual(enrollment_sql, [])
