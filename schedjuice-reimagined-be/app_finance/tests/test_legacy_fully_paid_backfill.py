import unittest
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
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
    build_audit_row,
    legacy_is_fully_paid_field_exists,
)
from app_finance.legacy_fully_paid_backfill import (
    ACTION_FIXED,
    ACTION_SKIPPED_NO_COURSE_DATES,
    ACTION_SKIPPED_NO_PAYMENT,
    backfill_at_risk_enrollment,
    backfill_full_course_coverage,
    backfill_legacy_fully_paid_coverage,
    select_target_payment,
)
from app_finance.models import UserPayment, UserPaymentCoveredMonth
from app_finance.payment_coverage import apply_month_scope
from app_finance.tests.telegram_mixin import TelegramSignalTestMixin


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _fake_payment(payment_id: int, created_at: datetime, *, has_coverage: bool):
    covered_months = MagicMock()
    covered_months.exists.return_value = has_coverage
    return SimpleNamespace(
        id=payment_id,
        created_at=created_at,
        covered_months=covered_months,
    )


class LegacyFullyPaidBackfillUnitTests(unittest.TestCase):
    def test_select_target_payment_prefers_existing_coverage(self):
        earlier_with_cm = _fake_payment(
            4, datetime(2026, 1, 1, tzinfo=timezone.utc), has_coverage=True
        )
        later_with_cm = _fake_payment(
            3, datetime(2026, 3, 1, tzinfo=timezone.utc), has_coverage=True
        )

        picked = select_target_payment([later_with_cm, earlier_with_cm])
        self.assertEqual(picked.id, 4)

    def test_select_target_payment_earliest_when_no_coverage(self):
        p1 = _fake_payment(
            10, datetime(2026, 2, 1, tzinfo=timezone.utc), has_coverage=False
        )
        p2 = _fake_payment(
            11, datetime(2026, 1, 1, tzinfo=timezone.utc), has_coverage=False
        )

        self.assertEqual(select_target_payment([p1, p2]).id, 11)


@unittest.skipUnless(
    _database_reachable() and legacy_is_fully_paid_field_exists(),
    "PostgreSQL not available or is_fully_paid removed",
)
class LegacyFullyPaidBackfillIntegrationTests(TelegramSignalTestMixin, TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_legacy_enrollment(
        self,
        suffix: str,
        *,
        course_start: date | None = date(2026, 1, 1),
        course_end: date | None = date(2026, 6, 30),
        with_payment: bool = True,
        qualifying: bool = False,
        covered_months: list[tuple[int, int]] | None = None,
    ) -> tuple[UserCourse, UserPayment | None]:
        with schema_context(self.schema_name):
            student = User.objects.create_user(
                email=f"bfp-{suffix}@example.com",
                password="x",
                name=f"Student {suffix}",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"CatBF {suffix}")
            prog = Program.objects.create(
                name=f"PBF {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            course = Course.objects.create(
                title=f"Course BFP {suffix}",
                category=cat,
                program=prog,
                start_date=course_start,
                end_date=course_end,
            )
            uc = UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                is_fully_paid=True,
            )
            payment = None
            if with_payment:
                payment = UserPayment.objects.create(
                    user=student,
                    course=course,
                    status=(
                        UserPayment.Status.VERIFIED
                        if qualifying
                        else UserPayment.Status.PENDING_PAYMENT
                    ),
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
            return uc, payment

    def test_backfill_skips_zero_payment_at_risk(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            uc, _ = self._create_legacy_enrollment(
                suffix, with_payment=False
            )
            uc = UserCourse.objects.select_related("user", "course").get(pk=uc.pk)
            result = backfill_at_risk_enrollment(
                schema_name=self.schema_name,
                user_course=uc,
                payments=[],
                dry_run=False,
            )
        self.assertIsNotNone(result)
        self.assertEqual(result.action, ACTION_SKIPPED_NO_PAYMENT)

    def test_backfill_skips_missing_course_dates(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            uc, payment = self._create_legacy_enrollment(
                suffix,
                course_start=None,
                course_end=None,
                with_payment=True,
                qualifying=False,
            )
            uc = UserCourse.objects.select_related("user", "course").get(pk=uc.pk)
            payments = list(
                UserPayment.objects.filter(pk=payment.pk).prefetch_related(
                    "covered_months"
                )
            )
            result = backfill_at_risk_enrollment(
                schema_name=self.schema_name,
                user_course=uc,
                payments=payments,
                dry_run=False,
            )
        self.assertEqual(result.action, ACTION_SKIPPED_NO_COURSE_DATES)

    def test_backfill_adds_full_course_months(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            uc, payment = self._create_legacy_enrollment(
                suffix,
                with_payment=True,
                qualifying=False,
            )
            uc = UserCourse.objects.select_related("user", "course").get(pk=uc.pk)
            payments = list(
                UserPayment.objects.filter(pk=payment.pk).prefetch_related(
                    "covered_months"
                )
            )
            audit = build_audit_row(
                schema_name=self.schema_name,
                user_course=uc,
                payments=payments,
            )
            self.assertEqual(audit.risk, RISK_AT_RISK)

            result = backfill_at_risk_enrollment(
                schema_name=self.schema_name,
                user_course=uc,
                payments=payments,
                dry_run=False,
            )
            self.assertEqual(result.action, ACTION_FIXED)
            self.assertEqual(result.months_added, 6)
            self.assertEqual(
                UserPaymentCoveredMonth.objects.filter(user_payment=payment).count(),
                6,
            )
            for month in range(1, 7):
                self.assertTrue(
                    apply_month_scope(
                        UserPayment.objects.filter(id=payment.id),
                        2026,
                        month,
                    ).exists()
                )

    def test_backfill_is_idempotent(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            uc, payment = self._create_legacy_enrollment(
                suffix,
                with_payment=True,
                qualifying=False,
            )
            results = backfill_legacy_fully_paid_coverage(
                self.schema_name,
                dry_run=False,
            )
            uc_results = [r for r in results if r.user_course_id == uc.id]
            self.assertEqual(len(uc_results), 1)
            self.assertEqual(uc_results[0].months_added, 6)

            results_again = backfill_legacy_fully_paid_coverage(
                self.schema_name,
                dry_run=False,
            )
            uc_results_again = [r for r in results_again if r.user_course_id == uc.id]
            self.assertEqual(len(uc_results_again), 1)
            self.assertEqual(uc_results_again[0].months_added, 0)

    def test_dry_run_writes_nothing(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            _uc, payment = self._create_legacy_enrollment(
                suffix,
                with_payment=True,
                qualifying=False,
            )
            backfill_legacy_fully_paid_coverage(self.schema_name, dry_run=True)
            self.assertEqual(
                UserPaymentCoveredMonth.objects.filter(user_payment=payment).count(),
                0,
            )

    def test_target_prefers_payment_with_coverage(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            uc, payment_a = self._create_legacy_enrollment(
                suffix,
                with_payment=True,
                qualifying=False,
            )
            payment_b = UserPayment.objects.create(
                user=uc.user,
                course=uc.course,
                status=UserPayment.Status.PENDING_PAYMENT,
            )
            UserPaymentCoveredMonth.objects.create(
                user_payment=payment_b,
                year=2026,
                month_index=1,
            )
            uc = UserCourse.objects.select_related("user", "course").get(pk=uc.pk)
            payments = list(
                UserPayment.objects.filter(
                    user_id=uc.user_id,
                    course_id=uc.course_id,
                ).prefetch_related("covered_months")
            )
            target = select_target_payment(payments)
            self.assertEqual(target.id, payment_b.id)

            months_added, _, _ = backfill_full_course_coverage(
                payment_b,
                uc.course,
                dry_run=False,
            )
            self.assertEqual(months_added, 5)
