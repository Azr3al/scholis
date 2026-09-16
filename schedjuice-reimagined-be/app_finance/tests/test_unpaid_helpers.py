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
from app_finance.models import UserPayment, UserPaymentCoveredMonth
from app_finance.unpaid_helpers import (
    paid_until_by_user_for_course,
    unpaid_counts_by_course,
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class PaidUntilByUserForCourseTests(unittest.TestCase):
    def test_empty_user_ids_returns_empty_dict(self):
        self.assertEqual(paid_until_by_user_for_course(1, []), {})


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UnpaidHelpersIntegrationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_student_course(
        self,
        *,
        suffix: str,
        start_date: date,
        end_date: date,
    ) -> tuple[User, Course, UserCourse]:
        with schema_context(self.schema_name):
            student = User.objects.create_user(
                email=f"unpaid-{suffix}@example.com",
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
                start_date=start_date,
                end_date=end_date,
            )
            uc = UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            return student, course, uc

    def test_paid_until_implicit_issued_at_month(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            student, course, _uc = self._create_student_course(
                suffix=suffix,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
            )
            UserPayment.objects.create(
                user=student,
                course=course,
                status=UserPayment.Status.PENDING_PAYMENT,
                issued_at=timezone.make_aware(datetime(2026, 3, 1)),
            )
            paid_map = paid_until_by_user_for_course(course.id, [student.id])
            self.assertEqual(paid_map[student.id], (2026, 3))

    def test_paid_until_explicit_covered_months(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            student, course, _uc = self._create_student_course(
                suffix=suffix,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
            )
            payment = UserPayment.objects.create(
                user=student,
                course=course,
                status=UserPayment.Status.PENDING_PAYMENT,
                issued_at=timezone.make_aware(datetime(2026, 1, 1)),
            )
            UserPaymentCoveredMonth.objects.bulk_create(
                [
                    UserPaymentCoveredMonth(
                        user_payment=payment, year=2026, month_index=2
                    ),
                    UserPaymentCoveredMonth(
                        user_payment=payment, year=2026, month_index=5
                    ),
                ]
            )
            paid_map = paid_until_by_user_for_course(course.id, [student.id])
            self.assertEqual(paid_map[student.id], (2026, 5))

    def test_paid_until_no_payments_is_none(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            student, course, _uc = self._create_student_course(
                suffix=suffix,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
            )
            paid_map = paid_until_by_user_for_course(course.id, [student.id])
            self.assertIsNone(paid_map[student.id])

    def test_unpaid_counts_by_course_counts_students_without_month_coverage(self):
        suffix = uuid4().hex[:8]
        payment_params = {
            "issued_at__gte": "2026-06-01T00:00:00+00:00",
            "issued_at__lte": "2026-06-30T23:59:59+00:00",
        }
        with schema_context(self.schema_name):
            student_paid, course, _uc_paid = self._create_student_course(
                suffix=f"paid-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
            )
            student_unpaid = User.objects.create_user(
                email=f"unpaid-{suffix}@example.com",
                password="x",
                name=f"Student unpaid {suffix}",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=student_unpaid,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserPayment.objects.create(
                user=student_paid,
                course=course,
                status=UserPayment.Status.PENDING_PAYMENT,
                issued_at=timezone.make_aware(datetime(2026, 6, 1)),
            )
            counts = unpaid_counts_by_course([course.id], payment_params)
            self.assertEqual(counts.get(course.id), 1)

    def test_unpaid_counts_skip_months_before_billing_anchor(self):
        suffix = uuid4().hex[:8]
        payment_params = {
            "issued_at__gte": "2026-06-01T00:00:00+00:00",
            "issued_at__lte": "2026-06-30T23:59:59+00:00",
        }
        with schema_context(self.schema_name):
            _student, course, uc = self._create_student_course(
                suffix=f"late-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            UserCourse.objects.filter(pk=uc.pk).update(
                billing_cycle_anchor_date=date(2026, 9, 13)
            )
            counts = unpaid_counts_by_course([course.id], payment_params)
            self.assertNotIn(course.id, counts)
