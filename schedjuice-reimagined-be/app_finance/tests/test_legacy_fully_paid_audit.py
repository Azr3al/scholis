import unittest
from datetime import date, datetime
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.legacy_fully_paid_audit import (
    RISK_AT_RISK,
    RISK_OK,
    RISK_REVIEW,
    build_audit_row,
    classify_legacy_fully_paid_risk,
    course_end_month,
    legacy_is_fully_paid_field_exists,
    payments_have_qualifying,
)
from app_finance.models import UserPayment, UserPaymentCoveredMonth

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

class LegacyFullyPaidRiskLogicTests(unittest.TestCase):
    def test_no_payments_is_at_risk(self):
        risk, _notes = classify_legacy_fully_paid_risk(
            payment_count=0,
            has_qualifying_payment=False,
            paid_until=None,
            course_end=(2026, 6),
        )
        self.assertEqual(risk, RISK_AT_RISK)

    def test_payments_without_qualifying_is_at_risk(self):
        risk, notes = classify_legacy_fully_paid_risk(
            payment_count=2,
            has_qualifying_payment=False,
            paid_until=(2026, 3),
            course_end=(2026, 6),
        )
        self.assertEqual(risk, RISK_AT_RISK)
        self.assertIn("screenshot", notes)

    def test_paid_through_course_end_is_ok(self):
        risk, _notes = classify_legacy_fully_paid_risk(
            payment_count=1,
            has_qualifying_payment=True,
            paid_until=(2026, 6),
            course_end=(2026, 6),
        )
        self.assertEqual(risk, RISK_OK)

    def test_paid_before_course_end_is_review(self):
        risk, notes = classify_legacy_fully_paid_risk(
            payment_count=1,
            has_qualifying_payment=True,
            paid_until=(2026, 3),
            course_end=(2026, 6),
        )
        self.assertEqual(risk, RISK_REVIEW)
        self.assertIn("before course end", notes)

    def test_qualifying_without_derived_month_is_review(self):
        risk, _notes = classify_legacy_fully_paid_risk(
            payment_count=1,
            has_qualifying_payment=True,
            paid_until=None,
            course_end=(2026, 6),
        )
        self.assertEqual(risk, RISK_REVIEW)

class LegacyFullyPaidHelperTests(unittest.TestCase):
    def test_payments_have_qualifying_verified(self):
        payment = UserPayment(status=UserPayment.Status.VERIFIED)
        self.assertTrue(payments_have_qualifying([payment]))

    def test_payments_have_qualifying_screenshot(self):
        payment = UserPayment(status=UserPayment.Status.PENDING_PAYMENT)
        payment.screenshot = "payment_screenshots/x.png"
        self.assertTrue(payments_have_qualifying([payment]))

    def test_payments_without_qualifying(self):
        payment = UserPayment(status=UserPayment.Status.PENDING_PAYMENT)
        self.assertFalse(payments_have_qualifying([payment]))

@unittest.skipUnless(
    _database_reachable() and legacy_is_fully_paid_field_exists(),
    "PostgreSQL not available or is_fully_paid removed",
)
class LegacyFullyPaidAuditIntegrationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_enrollment_with_payment(
        self,
        *,
        suffix: str,
        with_qualifying: bool,
        covered_months: list[tuple[int, int]] | None = None,
        issued_at: datetime | None = None,
    ) -> UserCourse:
        with schema_context(self.schema_name):
            student = User.objects.create_user(
                email=f"lfp-{suffix}@example.com",
                password="x",
                name=f"Student {suffix}",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            course = Course.objects.create(
                title=f"Course {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
            )
            uc = UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                is_fully_paid=True,
            )
            if with_qualifying or covered_months or issued_at:
                payment = UserPayment.objects.create(
                    user=student,
                    course=course,
                    status=(
                        UserPayment.Status.VERIFIED
                        if with_qualifying
                        else UserPayment.Status.PENDING_PAYMENT
                    ),
                    issued_at=issued_at,
                )
                if covered_months:
                    UserPaymentCoveredMonth.objects.bulk_create(
                        [
                            UserPaymentCoveredMonth(
                                user_payment=payment,
                                year=y,
                                month_index=m,
                            )
                            for y, m in covered_months
                        ]
                    )
            return uc

    def test_build_audit_row_at_risk_without_payments(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            uc = self._create_enrollment_with_payment(
                suffix=suffix,
                with_qualifying=False,
            )
            row = build_audit_row(
                schema_name=self.schema_name,
                user_course=UserCourse.objects.select_related("user", "course").get(
                    pk=uc.pk
                ),
                payments=[],
            )
        self.assertEqual(row.risk, RISK_AT_RISK)
        self.assertEqual(row.payment_count, 0)
        self.assertIsNone(row.paid_until)

    def test_build_audit_row_ok_with_implicit_month(self):
        suffix = uuid4().hex[:8]
        issued = timezone.make_aware(datetime(2026, 6, 1, 12, 0, 0))
        with schema_context(self.schema_name):
            uc = self._create_enrollment_with_payment(
                suffix=suffix,
                with_qualifying=True,
                issued_at=issued,
            )
            payments = list(
                UserPayment.objects.filter(
                    user_id=uc.user_id,
                    course_id=uc.course_id,
                ).prefetch_related("covered_months")
            )
            row = build_audit_row(
                schema_name=self.schema_name,
                user_course=UserCourse.objects.select_related("user", "course").get(
                    pk=uc.pk
                ),
                payments=payments,
            )
        self.assertEqual(row.risk, RISK_OK)
        self.assertEqual(row.paid_until, (2026, 6))

    def test_build_audit_row_review_with_partial_coverage(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            uc = self._create_enrollment_with_payment(
                suffix=suffix,
                with_qualifying=True,
                covered_months=[(2026, 3)],
            )
            payments = list(
                UserPayment.objects.filter(
                    user_id=uc.user_id,
                    course_id=uc.course_id,
                ).prefetch_related("covered_months")
            )
            row = build_audit_row(
                schema_name=self.schema_name,
                user_course=UserCourse.objects.select_related("user", "course").get(
                    pk=uc.pk
                ),
                payments=payments,
            )
        self.assertEqual(row.risk, RISK_REVIEW)
        self.assertEqual(row.paid_until, (2026, 3))

    def test_dropped_out_excluded_by_default(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            uc = self._create_enrollment_with_payment(
                suffix=suffix,
                with_qualifying=False,
            )
            uc.delete()

        from app_finance.legacy_fully_paid_audit import audit_legacy_fully_paid_enrollments

        with schema_context(self.schema_name):
            rows = audit_legacy_fully_paid_enrollments(self.schema_name)
        ids = {row.user_course_id for row in rows}
        self.assertNotIn(uc.id, ids)

        with schema_context(self.schema_name):
            rows_with_dropped = audit_legacy_fully_paid_enrollments(
                self.schema_name,
                include_dropped=True,
            )
        ids_with_dropped = {row.user_course_id for row in rows_with_dropped}
        self.assertIn(uc.id, ids_with_dropped)
