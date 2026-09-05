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
from app_finance.models import PaymentBank, PaymentInfo, StaffPayment
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
class StaffPaymentRBACTests(TelegramSignalTestMixin, TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"tch-sp-{suffix}@example.com",
                password="x",
                name="Teacher SP",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.other_teacher = User.objects.create_user(
                email=f"tch2-sp-{suffix}@example.com",
                password="x",
                name="Other Teacher SP",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.finance = User.objects.create_user(
                email=f"fin-sp-{suffix}@example.com",
                password="x",
                name="Finance SP",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-sp-{suffix}@example.com",
                password="x",
                name="Student SP",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.teacher_default_info = PaymentInfo.objects.create(
                user=self.teacher,
                account_name="Teacher SP",
                description="09111111111",
                bank_type=PaymentBank.KBZ,
                is_default=True,
            )
            PaymentInfo.objects.create(
                user=self.other_teacher,
                account_name="Other Teacher SP",
                description="09222222222",
                bank_type=PaymentBank.KPAY,
                is_default=True,
            )
            paid_at = timezone.now()
            self.teacher_payment = StaffPayment.objects.create(
                user=self.teacher,
                payment_info=self.teacher_default_info,
                amount="100000",
                amount_currency="USD",
                paid_at=paid_at,
                pay_period_year=paid_at.year,
                pay_period_month=paid_at.month,
                screenshot=self._screenshot(),
                created_by=self.finance,
            )
            self.other_payment = StaffPayment.objects.create(
                user=self.other_teacher,
                payment_info=PaymentInfo.objects.get(
                    user=self.other_teacher, is_default=True
                ),
                amount="200000",
                amount_currency="USD",
                paid_at=paid_at,
                pay_period_year=paid_at.year,
                pay_period_month=paid_at.month,
                screenshot=self._screenshot("other.gif"),
                created_by=self.finance,
            )

    @staticmethod
    def _screenshot(name: str = "proof.gif") -> SimpleUploadedFile:
        return SimpleUploadedFile(
            name,
            b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;",
            content_type="image/gif",
        )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_finance_search_returns_all_rows(self):
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                "/api/v1/staff-payments/search",
                {"filter_params": [], "page": 1, "page_size": 50},
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.data["data"]}
        self.assertIn(self.teacher_payment.id, ids)
        self.assertIn(self.other_payment.id, ids)

    def test_teacher_search_returns_only_own_rows(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                "/api/v1/staff-payments/search",
                {"filter_params": [], "page": 1, "page_size": 50},
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.data["data"]}
        self.assertEqual(ids, {self.teacher_payment.id})

    def test_finance_create_auto_links_default_payment_info(self):
        pay_period = timezone.now().replace(day=1) - timedelta(days=32)
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                "/api/v1/staff-payments",
                {
                    "user": self.teacher.id,
                    "amount": "50000",
                    "amount_currency": "USD",
                    "paid_at": timezone.now().isoformat(),
                    "pay_period_year": pay_period.year,
                    "pay_period_month": pay_period.month,
                    "screenshot": self._screenshot("new.gif"),
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        payment_info_id = resp.data["data"]["payment_info"]
        self.assertEqual(payment_info_id, self.teacher_default_info.id)

    def test_create_fails_when_staff_has_no_default_payment_info(self):
        no_info_teacher = None
        pay_period = timezone.now().replace(day=1) - timedelta(days=64)
        with schema_context(self.schema_name):
            no_info_teacher = User.objects.create_user(
                email=f"no-pi-{uuid4().hex[:6]}@example.com",
                password="x",
                name="No PI Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            resp = self._client(self.finance).post(
                "/api/v1/staff-payments",
                {
                    "user": no_info_teacher.id,
                    "amount": "50000",
                    "amount_currency": "USD",
                    "paid_at": timezone.now().isoformat(),
                    "pay_period_year": pay_period.year,
                    "pay_period_month": pay_period.month,
                    "screenshot": self._screenshot("fail.gif"),
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("default payout account", str(resp.data).lower())

    def test_create_rejects_student_payee(self):
        pay_period = timezone.now().replace(day=1) - timedelta(days=96)
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                "/api/v1/staff-payments",
                {
                    "user": self.student.id,
                    "amount": "50000",
                    "amount_currency": "USD",
                    "paid_at": timezone.now().isoformat(),
                    "pay_period_year": pay_period.year,
                    "pay_period_month": pay_period.month,
                    "screenshot": self._screenshot("student.gif"),
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_create_rejects_mismatched_payment_info(self):
        pay_period = timezone.now().replace(day=1) - timedelta(days=128)
        with schema_context(self.schema_name):
            other_info = PaymentInfo.objects.get(user=self.other_teacher, is_default=True)
            resp = self._client(self.finance).post(
                "/api/v1/staff-payments",
                {
                    "user": self.teacher.id,
                    "payment_info": other_info.id,
                    "amount": "50000",
                    "amount_currency": "USD",
                    "paid_at": timezone.now().isoformat(),
                    "pay_period_year": pay_period.year,
                    "pay_period_month": pay_period.month,
                    "screenshot": self._screenshot("mismatch.gif"),
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_create_accepts_up_to_five_proof_files(self):
        pay_period = timezone.now().replace(day=1) - timedelta(days=160)
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                "/api/v1/staff-payments",
                {
                    "user": self.teacher.id,
                    "amount": "50000",
                    "amount_currency": "USD",
                    "paid_at": timezone.now().isoformat(),
                    "pay_period_year": pay_period.year,
                    "pay_period_month": pay_period.month,
                    "proof_0": self._screenshot("proof-0.gif"),
                    "proof_1": self._screenshot("proof-1.gif"),
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.data["data"]
        self.assertEqual(len(data["proofs"]), 2)
        self.assertTrue(data["screenshot"])

    def test_create_rejects_video_proof(self):
        pay_period = timezone.now().replace(day=1) - timedelta(days=192)
        video = SimpleUploadedFile(
            "clip.mp4",
            b"fake-video-bytes",
            content_type="video/mp4",
        )
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                "/api/v1/staff-payments",
                {
                    "user": self.teacher.id,
                    "amount": "50000",
                    "amount_currency": "USD",
                    "paid_at": timezone.now().isoformat(),
                    "pay_period_year": pay_period.year,
                    "pay_period_month": pay_period.month,
                    "proof_0": video,
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("video", str(resp.data).lower())

    def test_teacher_forbidden_create(self):
        pay_period = timezone.now().replace(day=1) - timedelta(days=224)
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                "/api/v1/staff-payments",
                {
                    "user": self.teacher.id,
                    "amount": "50000",
                    "amount_currency": "USD",
                    "paid_at": timezone.now().isoformat(),
                    "pay_period_year": pay_period.year,
                    "pay_period_month": pay_period.month,
                    "screenshot": self._screenshot("teacher-create.gif"),
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_create_rejects_duplicate_pay_period(self):
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                "/api/v1/staff-payments",
                {
                    "user": self.teacher.id,
                    "amount": "50000",
                    "amount_currency": "USD",
                    "paid_at": timezone.now().isoformat(),
                    "pay_period_year": self.teacher_payment.pay_period_year,
                    "pay_period_month": self.teacher_payment.pay_period_month,
                    "screenshot": self._screenshot("duplicate.gif"),
                },
                format="multipart",
            )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("pay period", str(resp.data).lower())

    def test_teacher_can_confirm_own_payment(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                f"/api/v1/staff-payments/{self.teacher_payment.id}/confirm",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIsNotNone(resp.data["confirmed_at"])
        self.teacher_payment.refresh_from_db()
        self.assertIsNotNone(self.teacher_payment.confirmed_at)

    def test_teacher_cannot_confirm_other_payment(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                f"/api/v1/staff-payments/{self.other_payment.id}/confirm",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_finance_cannot_confirm_for_teacher(self):
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                f"/api/v1/staff-payments/{self.teacher_payment.id}/confirm",
            )
        self.assertEqual(resp.status_code, 403, resp.content)
