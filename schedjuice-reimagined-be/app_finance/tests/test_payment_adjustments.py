import unittest
from datetime import date, datetime, timedelta
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import (
    PaymentAdjustment,
    PaymentBank,
    PaymentMethod,
    UserPayment,
)
from app_finance.tests.telegram_mixin import TelegramSignalTestMixin
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PaymentAdjustmentApiTests(TelegramSignalTestMixin, TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.month_start = timezone.make_aware(
            datetime(self.today.year, self.today.month, 1, 0, 0, 0)
        )
        if self.today.month == 12:
            next_month = datetime(self.today.year + 1, 1, 1, 0, 0, 0)
        else:
            next_month = datetime(
                self.today.year, self.today.month + 1, 1, 0, 0, 0
            )
        self.month_end = timezone.make_aware(next_month) - timedelta(seconds=1)
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-adj-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-adj-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat adj {suffix}")
            prog = Program.objects.create(
                name=f"P adj {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C adj {suffix}",
                category=cat,
                program=prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.payment_method = PaymentMethod.objects.create(
                name=f"KPay adj {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            self.payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                payment_method=self.payment_method,
                status=UserPayment.Status.VERIFIED,
                issued_at=self.month_start,
                billing_start_date=self.month_start,
                billing_end_date=self.month_end,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _image(self, name: str = "proof.jpg") -> SimpleUploadedFile:
        return SimpleUploadedFile(
            name,
            b"fake-jpeg-bytes",
            content_type="image/jpeg",
        )

    def _create_payload(self):
        return {
            "kind": PaymentAdjustment.Kind.REFUND,
            "amount": "25.50",
            "occurred_at": timezone.now().isoformat(),
            "note": "Accidental overpayment",
            "image_0": self._image(),
        }

    def test_create_adjustment_with_images(self):
        resp = self._client(self.finance).post(
            f"/api/v1/user-payments/{self.payment.id}/adjustments",
            self._create_payload(),
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()["data"]
        self.assertEqual(data["kind"], PaymentAdjustment.Kind.REFUND)
        self.assertEqual(str(data["amount"]), "25.5000")
        self.assertEqual(data["note"], "Accidental overpayment")
        self.assertEqual(len(data["images"]), 1)
        self.assertTrue(data["images"][0]["image_url"])

        adjustment = PaymentAdjustment.objects.get(id=data["id"])
        self.assertEqual(adjustment.images.count(), 1)

    def test_student_without_refund_permission_cannot_create(self):
        resp = self._client(self.student).post(
            f"/api/v1/user-payments/{self.payment.id}/adjustments",
            self._create_payload(),
            format="multipart",
        )
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertEqual(PaymentAdjustment.objects.count(), 0)

    def test_delete_adjustment(self):
        create_resp = self._client(self.finance).post(
            f"/api/v1/user-payments/{self.payment.id}/adjustments",
            self._create_payload(),
            format="multipart",
        )
        adjustment_id = create_resp.json()["data"]["id"]

        delete_resp = self._client(self.finance).delete(
            f"/api/v1/payment-adjustments/{adjustment_id}"
        )
        self.assertEqual(delete_resp.status_code, 200, delete_resp.content)
        self.assertFalse(
            PaymentAdjustment.objects.filter(id=adjustment_id).exists()
        )

    def test_admin_report_includes_adjustment_count(self):
        self._client(self.finance).post(
            f"/api/v1/user-payments/{self.payment.id}/adjustments",
            self._create_payload(),
            format="multipart",
        )

        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            {
                "filter_params": [
                    {
                        "field_name": "course_id",
                        "operator": "exact",
                        "value": str(self.course.id),
                    },
                    {
                        "field_name": "issued_at",
                        "operator": "gte",
                        "value": self.month_start.isoformat(),
                    },
                    {
                        "field_name": "issued_at",
                        "operator": "lte",
                        "value": self.month_end.isoformat(),
                    },
                ],
                "exclude_params": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        rows = resp.json()["data"]
        payment_row = next(r for r in rows if r.get("id") == self.payment.id)
        self.assertEqual(payment_row["adjustment_count"], 1)
        self.assertEqual(payment_row["total_refunded"], "25.5000")

    def test_get_payment_detail_includes_total_refunded(self):
        self._client(self.finance).post(
            f"/api/v1/user-payments/{self.payment.id}/adjustments",
            self._create_payload(),
            format="multipart",
        )

        resp = self._client(self.finance).get(
            f"/api/v1/user-payments/{self.payment.id}"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertEqual(data["total_refunded"], "25.5000")
        self.assertEqual(data["total_refunded_to_date"], "25.50")
        self.assertEqual(data["adjustment_count"], 1)
