import io
import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from djmoney.money import Money
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program
from app_finance.models import ReceiverSideScreenshot, UserPayment
from app_finance.payment_group import admin_report_payment_row
from app_finance.payment_verify import verify_screenshots_from_rows
from app_finance.services import mark_receiver_side_screenshots_matched
from app_organization.models import Organization
from PIL import Image


def _make_png() -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGBA", (80, 40), color=(0, 0, 0, 255)).save(buf, format="PNG")
    return SimpleUploadedFile("signature.png", buf.getvalue(), content_type="image/png")


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class UserPaymentVerifiedByTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.transaction_id = f"vby-{suffix}-1234567890"
        self.parsed_amount = Decimal("100.00")
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.filter(
                schema_name=self.schema_name
            ).first()
        with schema_context(self.schema_name):
            self.admin = User.objects.create_user(
                email=f"adm-vby-{suffix}@example.com",
                password="x",
                name="Verifier Admin",
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
                email=f"stu-vby-{suffix}@example.com",
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

    def test_verify_screenshots_sets_verified_by_when_actor_provided(self):
        with schema_context(self.schema_name):
            verify_screenshots_from_rows(
                data_list=[
                    {
                        "transaction_id": self.transaction_id,
                        "amount": self.parsed_amount,
                    }
                ],
                actor=self.admin,
            )
            payment = UserPayment.objects.get(id=self.payment_id)
            self.assertEqual(payment.status, UserPayment.Status.VERIFIED)
            self.assertEqual(payment.verified_by_id, self.admin.id)

    def test_verify_screenshots_leaves_verified_by_null_without_actor(self):
        with schema_context(self.schema_name):
            verify_screenshots_from_rows(
                data_list=[
                    {
                        "transaction_id": self.transaction_id,
                        "amount": self.parsed_amount,
                    }
                ],
            )
            payment = UserPayment.objects.get(id=self.payment_id)
            self.assertEqual(payment.status, UserPayment.Status.VERIFIED)
            self.assertIsNone(payment.verified_by_id)

    def test_mark_receiver_side_sets_verified_by_when_actor_provided(self):
        with schema_context(self.schema_name):
            ReceiverSideScreenshot.objects.create(
                transaction_id=self.transaction_id,
                is_matched=False,
                user_payment=None,
            )
            payment = UserPayment.objects.get(id=self.payment_id)
            mark_receiver_side_screenshots_matched(
                self.transaction_id, payment, actor=self.admin
            )
            payment.refresh_from_db()
            self.assertEqual(payment.status, UserPayment.Status.VERIFIED)
            self.assertEqual(payment.verified_by_id, self.admin.id)

    def test_mark_receiver_side_leaves_verified_by_null_without_actor(self):
        with schema_context(self.schema_name):
            ReceiverSideScreenshot.objects.create(
                transaction_id=self.transaction_id,
                is_matched=False,
                user_payment=None,
            )
            payment = UserPayment.objects.get(id=self.payment_id)
            mark_receiver_side_screenshots_matched(self.transaction_id, payment)
            payment.refresh_from_db()
            self.assertEqual(payment.status, UserPayment.Status.VERIFIED)
            self.assertIsNone(payment.verified_by_id)

    def test_admin_report_row_includes_verified_by_name(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=self.payment_id)
            payment.status = UserPayment.Status.VERIFIED
            payment.verified_by = self.admin
            payment.save(update_fields=["status", "verified_by"])
            payment = UserPayment.objects.select_related(
                "user", "course", "created_by", "verified_by", "payment_method"
            ).prefetch_related("covered_months").get(id=self.payment_id)
            row = admin_report_payment_row(payment)
            self.assertEqual(row["verified_by"]["name"], "Verifier Admin")
            self.assertEqual(row["created_by"]["name"], "Verifier Admin")
            self.assertEqual(row["verified_by"]["id"], self.admin.id)
            self.assertIsNone(row["verified_by"]["user_signature_url"])

    def test_admin_report_row_includes_verifier_signature_url(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=self.payment_id)
            self.admin.user_signature = _make_png()
            self.admin.save(update_fields=["user_signature"])
            payment.status = UserPayment.Status.VERIFIED
            payment.verified_by = self.admin
            payment.save(update_fields=["status", "verified_by"])
            payment = UserPayment.objects.select_related(
                "user", "course", "created_by", "verified_by", "payment_method"
            ).prefetch_related("covered_months").get(id=self.payment_id)
            row = admin_report_payment_row(payment)
            self.assertTrue(row["verified_by"]["user_signature_url"])

    def test_admin_report_row_includes_user_email(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.select_related(
                "user", "course", "created_by", "verified_by", "payment_method"
            ).prefetch_related("covered_months").get(id=self.payment_id)
            row = admin_report_payment_row(payment)
            self.assertIn("email", row["user"])
            self.assertEqual(row["user"]["email"], payment.user.email)
