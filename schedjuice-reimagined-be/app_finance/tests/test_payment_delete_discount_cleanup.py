import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.discount_engine import (
    consume_discount_state_after_invoice,
    get_active_enrollment_discount,
    get_active_enrollment_discounts,
)
from app_finance.models import (
    Discount,
    EnrollmentDiscount,
    PaymentBank,
    PaymentMethod,
    PaymentPlan,
    UserPayment,
    UserPaymentDiscount,
)
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PaymentDeleteDiscountCleanupTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.today = timezone.localdate()
        self.month_start = timezone.make_aware(
            datetime(self.today.year, self.today.month, 1, 0, 0, 0)
        )
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-pddc-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-pddc-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-pddc-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"plan-pddc-{suffix}",
                price=Money(500, "USD"),
            )
            cat = Category.objects.create(name=f"Cat pddc {suffix}")
            prog = Program.objects.create(
                name=f"P pddc {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C pddc {suffix}",
                category=cat,
                program=prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                payment_plan=self.plan,
            )
            self.enrollment = UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.kpay = PaymentMethod.objects.create(
                name=f"KPay pddc {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            self.discount = Discount.objects.create(
                name=f"disc-pddc-{suffix}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("10"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _screenshot(self, name: str = "ss.gif") -> SimpleUploadedFile:
        return SimpleUploadedFile(
            name,
            (
                b"GIF87a\x01\x00\x01\x00\x80\x01\x00\x00\x00\x00"
                b"\xff\xff\xff,\x00\x00\x00\x00\x01\x00\x01\x00"
                b"\x00\x02\x02D\x01\x00;"
            ),
            content_type="image/gif",
        )

    def _create_payment_with_discount(self) -> int:
        payload = {
            "user": self.student.id,
            "course": self.course.id,
            "issued_at": self.month_start.isoformat(),
            "screenshot": self._screenshot(),
            "payment_method": self.kpay.id,
            "parsed_amount": "450",
            "transaction_id": f"tx-{uuid4().hex[:12]}",
            "discount_id": self.discount.id,
        }
        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        payment_id = resp.json()["data"]["id"]
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=payment_id)
            self.assertEqual(payment.discount_ids_set_on_create, [self.discount.id])
        return payment_id

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_delete_payment_with_discount_on_create_deactivates_orphan_ed(
        self, _mock_ocr
    ):
        payment_id = self._create_payment_with_discount()
        with schema_context(self.schema_name):
            self.assertEqual(len(get_active_enrollment_discounts(self.enrollment)), 1)

        resp = self._client(self.finance).delete(f"/api/v1/user-payments/{payment_id}")
        self.assertEqual(resp.status_code, 200, resp.content)

        with schema_context(self.schema_name):
            self.assertFalse(UserPayment.objects.filter(id=payment_id).exists())
            self.assertEqual(len(get_active_enrollment_discounts(self.enrollment)), 0)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_delete_payment_with_preexisting_ed_does_not_deactivate(self, _mock_ocr):
        client = self._client(self.finance)
        client.post(
            f"/api/v1/user-courses/{self.enrollment.id}/discount",
            {"discount_id": self.discount.id},
            format="json",
        )
        payload = {
            "user": self.student.id,
            "course": self.course.id,
            "issued_at": self.month_start.isoformat(),
            "screenshot": self._screenshot("preexist.gif"),
            "payment_method": self.kpay.id,
            "parsed_amount": "450",
            "transaction_id": f"tx-{uuid4().hex[:12]}",
        }
        resp = client.post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        payment_id = resp.json()["data"]["id"]
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=payment_id)
            self.assertIsNone(payment.discount_ids_set_on_create)

        delete_resp = client.delete(f"/api/v1/user-payments/{payment_id}")
        self.assertEqual(delete_resp.status_code, 200, delete_resp.content)

        with schema_context(self.schema_name):
            ed = get_active_enrollment_discount(self.enrollment)
            self.assertIsNotNone(ed)
            self.assertEqual(ed.discount_id, self.discount.id)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_delete_reverts_remaining_credit(self, _mock_ocr):
        payment_id = self._create_payment_with_discount()
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=payment_id)
            ed = get_active_enrollment_discount(self.enrollment)
            self.assertIsNotNone(ed)
            ed.remaining_credit = Money(50, "USD")
            ed.save(update_fields=["remaining_credit", "updated_at"])
            line = payment.payment_discounts.get()
            consume_discount_state_after_invoice(
                enrollment_discount=ed,
                discount_amount=line.amount,
                period_indices=[0],
            )
            ed.refresh_from_db()
            self.assertEqual(ed.remaining_credit.amount, Decimal("0.00"))

        resp = self._client(self.finance).delete(f"/api/v1/user-payments/{payment_id}")
        self.assertEqual(resp.status_code, 200, resp.content)

        with schema_context(self.schema_name):
            ed.refresh_from_db()
            self.assertEqual(ed.remaining_credit.amount, Decimal("50.00"))

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_delete_skips_deactivate_when_other_payment_references_ed(self, _mock_ocr):
        payment_id = self._create_payment_with_discount()
        with schema_context(self.schema_name):
            payment = UserPayment.objects.get(id=payment_id)
            ed = get_active_enrollment_discount(self.enrollment)
            self.assertIsNotNone(ed)
            other = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                payment_method=self.kpay,
                transaction_id=f"tx-other-{uuid4().hex[:8]}",
                status=UserPayment.Status.VERIFIED,
                parsed_amount=Money(450, "USD"),
                base_amount=Money(500, "USD"),
                discount_amount=Money(50, "USD"),
                invoiced_amount=Money(450, "USD"),
            )
            UserPaymentDiscount.objects.create(
                user_payment=other,
                enrollment_discount=ed,
                label=self.discount.name,
                amount=Money(50, "USD"),
            )

        resp = self._client(self.finance).delete(f"/api/v1/user-payments/{payment_id}")
        self.assertEqual(resp.status_code, 200, resp.content)

        with schema_context(self.schema_name):
            ed.refresh_from_db()
            self.assertTrue(ed.is_active)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_delete_forbidden_without_payment_record(self, _mock_ocr):
        payment_id = self._create_payment_with_discount()
        resp = self._client(self.teacher).delete(
            f"/api/v1/user-payments/{payment_id}"
        )
        self.assertEqual(resp.status_code, 403, resp.content)

        with schema_context(self.schema_name):
            self.assertTrue(UserPayment.objects.filter(id=payment_id).exists())

    def test_delete_succeeds_when_issued_at_outside_course_calendar(self):
        """Orphan multi-course rows often have issued_at before the course starts."""
        with schema_context(self.schema_name):
            future_start = self.today + timedelta(days=90)
            self.course.start_date = future_start
            self.course.end_date = future_start + timedelta(days=60)
            self.course.save(update_fields=["start_date", "end_date"])

            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                payment_method=self.kpay,
                transaction_id=f"tx-orphan-{uuid4().hex[:8]}",
                status=UserPayment.Status.PENDING_VERIFICATION,
                parsed_amount=Money(450, "USD"),
                base_amount=Money(500, "USD"),
                discount_amount=Money(50, "USD"),
                invoiced_amount=Money(450, "USD"),
            )
            payment_id = payment.id

        resp = self._client(self.finance).delete(f"/api/v1/user-payments/{payment_id}")
        self.assertEqual(resp.status_code, 200, resp.content)

        with schema_context(self.schema_name):
            self.assertFalse(UserPayment.objects.filter(id=payment_id).exists())
