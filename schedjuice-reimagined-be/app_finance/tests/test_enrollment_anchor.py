"""Tests for late-joiner billing cycle anchor resolution."""

from __future__ import annotations

import unittest
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_finance.enrollment_anchor import (
    effective_invoice_start_date,
    enrollment_applies_to_report_month,
    resolve_anchor_for_enrollment,
    resolve_first_session_date,
)
from app_finance.models import PaymentPlan, UserPayment
from app_organization.models import Organization
from djmoney.money import Money


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class EnrollmentAnchorPureTests(unittest.TestCase):
    def test_effective_invoice_start_date_prefers_anchor(self):
        self.assertEqual(
            effective_invoice_start_date(
                course_start_date=date(2026, 4, 26),
                billing_cycle_anchor_date=date(2026, 9, 13),
            ),
            date(2026, 9, 13),
        )

    def test_effective_invoice_start_date_falls_back_to_course_start(self):
        self.assertEqual(
            effective_invoice_start_date(
                course_start_date=date(2026, 4, 26),
                billing_cycle_anchor_date=None,
            ),
            date(2026, 4, 26),
        )

    def test_enrollment_applies_to_report_month_before_anchor(self):
        self.assertFalse(
            enrollment_applies_to_report_month(
                billing_cycle_anchor_date=date(2026, 9, 13),
                report_year=2026,
                report_month=8,
            )
        )

    def test_enrollment_applies_to_report_month_from_anchor_onward(self):
        self.assertTrue(
            enrollment_applies_to_report_month(
                billing_cycle_anchor_date=date(2026, 9, 13),
                report_year=2026,
                report_month=9,
            )
        )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class EnrollmentAnchorIntegrationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def _event(self, course: Course, day: date) -> Event:
        aware = timezone.make_aware(datetime.combine(day, time(10, 0)))
        return Event.objects.create(
            title=course.title,
            date=aware,
            time_from=time(10, 0),
            time_to=time(12, 0),
            course=course,
        )

    def _course_with_sessions(
        self,
        *,
        suffix: str,
        course_start: date,
        course_end: date,
        session_days: list[date],
    ) -> Course:
        cat = Category.objects.create(name=f"Cat {suffix}")
        prog = Program.objects.create(
            name=f"P {suffix}",
            course_creation_method=Program.CourseCreationMethod.MANUAL,
            subject_strategy=Program.SubjectStrategy.NONE,
        )
        plan = PaymentPlan.objects.create(
            name=f"plan-{suffix}",
            price=Money(250000, "USD"),
            billing_type=PaymentPlan.BillingType.PER_PERIOD,
            early_payment_days=0,
        )
        course = Course.objects.create(
            title=f"Course {suffix}",
            category=cat,
            program=prog,
            start_date=course_start,
            end_date=course_end,
            payment_plan=plan,
        )
        for day in session_days:
            self._event(course, day)
        return course

    def test_on_time_joiner_has_no_anchor(self):
        suffix = uuid4().hex[:6]
        course_start = date(2026, 4, 26)
        with schema_context(self.schema_name):
            course = self._course_with_sessions(
                suffix=suffix,
                course_start=course_start,
                course_end=date(2026, 9, 30),
                session_days=[course_start, date(2026, 5, 24)],
            )
            student = User.objects.create_user(
                email=f"ontime-{suffix}@example.com",
                password="x",
                name="On time",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            joined_at = timezone.make_aware(datetime.combine(course_start, time(9, 0)))
            uc = UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                joined_at=joined_at,
            )
            uc.refresh_from_db()
            self.assertIsNone(uc.billing_cycle_anchor_date)
            self.assertIsNone(resolve_anchor_for_enrollment(uc))

    def test_late_joiner_gets_anchor_on_first_future_session(self):
        suffix = uuid4().hex[:6]
        course_start = date(2026, 4, 26)
        first_late_session = date(2026, 9, 13)
        with schema_context(self.schema_name):
            course = self._course_with_sessions(
                suffix=suffix,
                course_start=course_start,
                course_end=date(2026, 12, 31),
                session_days=[course_start, first_late_session],
            )
            student = User.objects.create_user(
                email=f"late-{suffix}@example.com",
                password="x",
                name="Late",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            joined_at = timezone.make_aware(datetime.combine(date(2026, 9, 2), time(9, 0)))
            uc = UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                joined_at=joined_at,
            )
            uc.refresh_from_db()
            self.assertEqual(uc.billing_cycle_anchor_date, first_late_session)
            self.assertEqual(
                resolve_first_session_date(course.id, joined_at),
                first_late_session,
            )

    def test_late_joiner_with_no_future_events_uses_join_date(self):
        suffix = uuid4().hex[:6]
        course_first = date(2026, 7, 9)
        join_day = date(2026, 9, 2)
        with schema_context(self.schema_name):
            course = self._course_with_sessions(
                suffix=suffix,
                course_start=date(2026, 6, 9),
                course_end=date(2026, 12, 9),
                session_days=[course_first, date(2026, 8, 29)],
            )
            student = User.objects.create_user(
                email=f"late-no-future-{suffix}@example.com",
                password="x",
                name="Late no future",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            joined_at = timezone.make_aware(datetime.combine(join_day, time(9, 0)))
            uc = UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                joined_at=joined_at,
            )
            uc.refresh_from_db()
            self.assertEqual(uc.billing_cycle_anchor_date, join_day)
            self.assertEqual(resolve_anchor_for_enrollment(uc), join_day)

    def test_on_time_joiner_still_null_when_no_future_events(self):
        suffix = uuid4().hex[:6]
        course_first = date(2026, 7, 9)
        with schema_context(self.schema_name):
            course = self._course_with_sessions(
                suffix=suffix,
                course_start=date(2026, 6, 9),
                course_end=date(2026, 12, 9),
                session_days=[course_first, date(2026, 8, 29)],
            )
            student = User.objects.create_user(
                email=f"ontime-no-future-{suffix}@example.com",
                password="x",
                name="On time no future",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            joined_at = timezone.make_aware(
                datetime.combine(course_first, time(9, 0))
            )
            uc = UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                joined_at=joined_at,
            )
            self.assertIsNone(resolve_anchor_for_enrollment(uc))

    def test_substitution_reserve_sessions_are_skipped(self):
        suffix = uuid4().hex[:6]
        reserve_day = date(2026, 9, 6)
        real_day = date(2026, 9, 13)
        with schema_context(self.schema_name):
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
                start_date=date(2026, 4, 26),
                end_date=date(2026, 12, 31),
            )
            self._event(course, date(2026, 4, 26))
            reserve = self._event(course, reserve_day)
            reserve.is_substitution_reserve = True
            reserve.save(update_fields=["is_substitution_reserve"])
            self._event(course, real_day)
            joined_at = timezone.make_aware(datetime.combine(date(2026, 9, 2), time(9, 0)))
            self.assertEqual(
                resolve_first_session_date(course.id, joined_at),
                real_day,
            )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class GenerateInvoicesLateJoinerTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.course_start = self.today - timedelta(days=120)
        self.anchor_day = self.today
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.filter(schema_name=self.schema_name).first()
            self.org.invoice_generation_strategy = (
                Organization.InvoiceGenerationStrategy.TR_PHILLIPS_STYLE
            )
            self.org.invoice_generation_interval_days = 28
            self.org.save(
                update_fields=[
                    "invoice_generation_strategy",
                    "invoice_generation_interval_days",
                    "updated_at",
                ]
            )
        with schema_context(self.schema_name):
            self.student = User.objects.create_user(
                email=f"late-inv-{suffix}@example.com",
                password="x",
                name="Late invoice",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"monthly-{suffix}",
                price=Money(250000, "USD"),
                billing_type=PaymentPlan.BillingType.PER_PERIOD,
                early_payment_days=0,
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Late course {suffix}",
                category=cat,
                program=prog,
                start_date=self.course_start,
                end_date=self.today + timedelta(days=120),
                payment_plan=self.plan,
            )
            aware = timezone.make_aware(
                datetime.combine(self.course_start, time(10, 0))
            )
            Event.objects.create(
                title=self.course.title,
                date=aware,
                time_from=time(10, 0),
                time_to=time(12, 0),
                course=self.course,
            )
            aware_today = timezone.make_aware(
                datetime.combine(self.anchor_day, time(10, 0))
            )
            Event.objects.create(
                title=self.course.title,
                date=aware_today,
                time_from=time(10, 0),
                time_to=time(12, 0),
                course=self.course,
            )
            joined_at = timezone.make_aware(
                datetime.combine(self.today - timedelta(days=1), time(9, 0))
            )
            self.enrollment = UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                joined_at=joined_at,
            )
            self.enrollment.refresh_from_db()
            self.assertEqual(
                self.enrollment.billing_cycle_anchor_date,
                self.anchor_day,
            )

    @patch("app_tasks.management.commands.generate_invoices._get_current_org")
    def test_late_joiner_first_invoice_starts_at_anchor(self, mock_get_org):
        mock_get_org.return_value = self.org
        with schema_context(self.schema_name):
            call_command("generate_invoices", verbosity=0)
            payments = list(
                UserPayment.objects.filter(
                    user_id=self.student.id,
                    course_id=self.course.id,
                ).order_by("billing_start_date")
            )
        self.assertEqual(len(payments), 1)
        self.assertEqual(
            payments[0].billing_start_date.date(),
            self.anchor_day,
        )
        self.assertIsNotNone(payments[0].issued_at)

    @patch("app_tasks.management.commands.generate_invoices._get_current_org")
    def test_second_run_does_not_issue_until_next_cycle(self, mock_get_org):
        mock_get_org.return_value = self.org
        with schema_context(self.schema_name):
            call_command("generate_invoices", verbosity=0)
            call_command("generate_invoices", verbosity=0)
            count = UserPayment.objects.filter(
                user_id=self.student.id,
                course_id=self.course.id,
            ).count()
        self.assertEqual(count, 1)
