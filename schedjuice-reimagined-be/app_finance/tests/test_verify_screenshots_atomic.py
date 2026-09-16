import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import IntegrityError, connection
from django.test import TestCase, override_settings
from djmoney.money import Money
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program
from app_finance.models import ReceiverSideScreenshot, UserPayment
from app_finance.payment_verify import verify_screenshots_from_rows
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class VerifyScreenshotsAtomicTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.transaction_id = f"verify-{suffix}-1234567890"
        self.parsed_amount = Decimal("100.00")
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.filter(schema_name=self.schema_name).first()
        with schema_context(self.schema_name):
            self.admin = User.objects.create_user(
                email=f"adm-verify-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
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
            )
            self.student = User.objects.create_user(
                email=f"stu-verify-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.admin,
                transaction_id=self.transaction_id,
                parsed_amount=Money(self.parsed_amount, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            self.payment_id = payment.id

    def test_bulk_update_failure_creates_no_receiver_rows(self):
        with schema_context(self.schema_name):
            before = ReceiverSideScreenshot.objects.count()
            rows = [
                {
                    "transaction_id": self.transaction_id,
                    "amount": self.parsed_amount,
                }
            ]
            with patch.object(
                UserPayment.objects,
                "bulk_update",
                side_effect=IntegrityError("forced"),
            ):
                with self.assertRaises(IntegrityError):
                    verify_screenshots_from_rows(data_list=rows)
            self.assertEqual(ReceiverSideScreenshot.objects.count(), before)
            payment = UserPayment.objects.get(id=self.payment_id)
            self.assertEqual(
                payment.status, UserPayment.Status.PENDING_VERIFICATION
            )
