"""Tests for late-joiner billing backfill service and management command."""

from __future__ import annotations

import unittest
from datetime import date, datetime, time, timedelta
from uuid import uuid4

import pytz
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Event, Program, UserCourse
from app_finance.late_joiner_backfill import run_late_joiner_backfill
from app_finance.models import PaymentPlan, UserPayment
from djmoney.money import Money


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class LateJoinerBackfillTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def _event(self, course: Course, day: date) -> None:
        aware = timezone.make_aware(datetime.combine(day, time(10, 0)))
        Event.objects.create(
            title=course.title,
            date=aware,
            time_from=time(10, 0),
            time_to=time(12, 0),
            course=course,
        )

    def _setup_late_joiner_with_pending_invoices(self):
        suffix = uuid4().hex[:6]
        course_first = date(2026, 7, 9)
        join_day = date(2026, 9, 2)
        utc = pytz.UTC

        with schema_context(self.schema_name):
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
                title=f"Late backfill {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 6, 9),
                end_date=date(2026, 12, 9),
                payment_plan=plan,
            )
            self._event(course, course_first)
            self._event(course, date(2026, 8, 29))

            student = User.objects.create_user(
                email=f"late-backfill-{suffix}@example.com",
                password="x",
                name="Late backfill",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            joined_at = timezone.make_aware(datetime.combine(join_day, time(9, 0)))
            enrollment = UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                joined_at=joined_at,
            )

            pre_join = UserPayment.objects.create(
                user=student,
                course=course,
                status=UserPayment.Status.PENDING_PAYMENT,
                billing_start_date=utc.localize(
                    datetime.combine(date(2026, 6, 9), datetime.min.time())
                ),
                billing_end_date=utc.localize(
                    datetime.combine(date(2026, 7, 6), datetime.max.time())
                ),
                invoiced_amount=Money(100, "USD"),
            )
            valid = UserPayment.objects.create(
                user=student,
                course=course,
                status=UserPayment.Status.PENDING_PAYMENT,
                billing_start_date=utc.localize(
                    datetime.combine(date(2026, 9, 1), datetime.min.time())
                ),
                billing_end_date=utc.localize(
                    datetime.combine(date(2026, 9, 28), datetime.max.time())
                ),
                invoiced_amount=Money(100, "USD"),
            )
            paid = UserPayment.objects.create(
                user=student,
                course=course,
                status=UserPayment.Status.AWAITING_EXTRACTION,
                billing_start_date=utc.localize(
                    datetime.combine(date(2026, 7, 7), datetime.min.time())
                ),
                billing_end_date=utc.localize(
                    datetime.combine(date(2026, 8, 3), datetime.max.time())
                ),
                invoiced_amount=Money(100, "USD"),
            )

        return {
            "course": course,
            "student": student,
            "enrollment": enrollment,
            "join_day": join_day,
            "pre_join_id": pre_join.id,
            "valid_id": valid.id,
            "paid_id": paid.id,
        }

    def test_dry_run_writes_nothing(self):
        fixture = self._setup_late_joiner_with_pending_invoices()
        with schema_context(self.schema_name):
            result = run_late_joiner_backfill(
                course_id=fixture["course"].id,
                dry_run=True,
            )
            fixture["enrollment"].refresh_from_db()

        self.assertEqual(result.anchors_updated, 1)
        self.assertEqual(result.payments_deleted, 1)
        self.assertIsNone(fixture["enrollment"].billing_cycle_anchor_date)
        with schema_context(self.schema_name):
            self.assertTrue(
                UserPayment.objects.filter(id=fixture["pre_join_id"]).exists()
            )

    def test_apply_sets_anchor_and_deletes_pre_join_pending_only(self):
        fixture = self._setup_late_joiner_with_pending_invoices()
        with schema_context(self.schema_name):
            result = run_late_joiner_backfill(
                course_id=fixture["course"].id,
                dry_run=False,
            )
            fixture["enrollment"].refresh_from_db()

        self.assertEqual(result.anchors_updated, 1)
        self.assertEqual(result.payments_deleted, 1)
        self.assertEqual(fixture["enrollment"].billing_cycle_anchor_date, fixture["join_day"])

        with schema_context(self.schema_name):
            self.assertFalse(
                UserPayment.objects.filter(id=fixture["pre_join_id"]).exists()
            )
            self.assertTrue(
                UserPayment.objects.filter(id=fixture["valid_id"]).exists()
            )
            self.assertTrue(
                UserPayment.objects.filter(id=fixture["paid_id"]).exists()
            )

    def test_second_apply_is_idempotent(self):
        fixture = self._setup_late_joiner_with_pending_invoices()
        with schema_context(self.schema_name):
            run_late_joiner_backfill(course_id=fixture["course"].id, dry_run=False)
            second = run_late_joiner_backfill(
                course_id=fixture["course"].id,
                dry_run=False,
            )

        self.assertEqual(second.anchors_updated, 0)
        self.assertEqual(second.payments_deleted, 0)

    def test_management_command_dry_run(self):
        fixture = self._setup_late_joiner_with_pending_invoices()
        with schema_context(self.schema_name):
            call_command(
                "backfill-late-joiner-billing",
                schema_name=self.schema_name,
                course_id=fixture["course"].id,
                dry_run=True,
                verbosity=0,
            )
            fixture["enrollment"].refresh_from_db()

        self.assertIsNone(fixture["enrollment"].billing_cycle_anchor_date)

    def test_course_id_scopes_to_single_course(self):
        fixture = self._setup_late_joiner_with_pending_invoices()
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            other_course = Course.objects.create(
                title=f"Other {suffix}",
                category=Category.objects.create(name=f"Other cat {suffix}"),
                program=Program.objects.create(
                    name=f"Other prog {suffix}",
                    course_creation_method=Program.CourseCreationMethod.MANUAL,
                    subject_strategy=Program.SubjectStrategy.NONE,
                ),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            other_student = User.objects.create_user(
                email=f"other-{suffix}@example.com",
                password="x",
                name="Other",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=other_student,
                course=other_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                joined_at=timezone.now() - timedelta(days=30),
            )

            result = run_late_joiner_backfill(
                course_id=fixture["course"].id,
                dry_run=False,
            )

        self.assertEqual(result.anchors_updated, 1)
        self.assertEqual(result.anchors[0].course_id, fixture["course"].id)
