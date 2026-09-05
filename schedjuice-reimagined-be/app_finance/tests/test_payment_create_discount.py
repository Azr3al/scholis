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
from app_finance.discount_engine import get_active_enrollment_discount
from app_finance.models import (
    Discount,
    EnrollmentDiscount,
    PaymentBank,
    PaymentMethod,
    PaymentPlan,
    UserPayment,
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
class PaymentCreateDiscountTests(TestCase):
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
                email=f"fin-pcd-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-pcd-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.plan = PaymentPlan.objects.create(
                name=f"plan-pcd-{suffix}",
                price=Money(500, "USD"),
            )
            cat = Category.objects.create(name=f"Cat pcd {suffix}")
            prog = Program.objects.create(
                name=f"P pcd {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C pcd {suffix}",
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
                name=f"KPay pcd {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            self.discount = Discount.objects.create(
                name=f"disc-pcd-{suffix}",
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

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_create_with_discount_id_applies_and_sets_breakdown(self, _mock_ocr):
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
        with schema_context(self.schema_name):
            ed = get_active_enrollment_discount(self.enrollment)
            self.assertIsNotNone(ed)
            self.assertEqual(ed.discount_id, self.discount.id)
            payment = UserPayment.objects.get(id=resp.json()["data"]["id"])
            self.assertEqual(payment.invoiced_amount.amount, Decimal("450.00"))
            self.assertEqual(payment.base_amount.amount, Decimal("500.00"))
            self.assertEqual(payment.discount_amount.amount, Decimal("50.00"))
            self.assertIsNone(payment.enrollment_discount_id)
            self.assertEqual(payment.payment_discounts.count(), 1)
            line = payment.payment_discounts.get()
            self.assertEqual(line.enrollment_discount_id, ed.id)
            self.assertEqual(line.amount.amount, Decimal("50.00"))
            self.assertEqual(line.label, self.discount.name)

    def test_payment_detail_includes_discount_label(self):
        with schema_context(self.schema_name):
            ed = EnrollmentDiscount.objects.create(
                user_course=self.enrollment,
                discount=self.discount,
                snapshot_discount_type=Discount.DiscountType.PERCENT,
                snapshot_scope=Discount.Scope.WHOLE_ENROLLMENT,
                snapshot_percent_value=Decimal("10"),
                applied_by=self.finance,
                is_active=True,
            )
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=self.month_start,
                payment_method=self.kpay,
                transaction_id=f"tx-label-{uuid4().hex[:8]}",
                status=UserPayment.Status.VERIFIED,
                parsed_amount=Money(450, "USD"),
                base_amount=Money(500, "USD"),
                discount_amount=Money(50, "USD"),
                invoiced_amount=Money(450, "USD"),
                enrollment_discount=ed,
            )
            from app_finance.models import UserPaymentDiscount

            UserPaymentDiscount.objects.create(
                user_payment=payment,
                enrollment_discount=ed,
                label=self.discount.name,
                amount=Money(50, "USD"),
            )
            payment_id = payment.id

        detail = self._client(self.finance).get(f"/api/v1/user-payments/{payment_id}")
        self.assertEqual(detail.status_code, 200, detail.content)
        body = detail.json()["data"]
        self.assertEqual(body.get("discount_label"), self.discount.name, body)
        self.assertEqual(len(body.get("discount_lines") or []), 1, body)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_clear_discount_removes_enrollment_discount(self, _mock_ocr):
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
            "screenshot": self._screenshot("clear.gif"),
            "payment_method": self.kpay.id,
            "parsed_amount": "500",
            "transaction_id": f"tx-{uuid4().hex[:12]}",
            "clear_discount": "true",
        }
        resp = client.post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            self.assertIsNone(get_active_enrollment_discount(self.enrollment))
            payment = UserPayment.objects.get(id=resp.json()["data"]["id"])
            self.assertEqual(payment.invoiced_amount.amount, Decimal("500.00"))
            self.assertEqual(payment.discount_amount.amount, Decimal("0.00"))

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_payment_create_discount_ids_sets_stack_and_snapshots_lines(self, _mock_ocr):
        with schema_context(self.schema_name):
            d2 = Discount.objects.create(
                name=f"disc2-pcd-{uuid4().hex[:6]}",
                discount_type=Discount.DiscountType.PERCENT,
                percent_value=Decimal("5"),
                scope=Discount.Scope.WHOLE_ENROLLMENT,
            )
            d2_id = d2.id
        payload = {
            "user": self.student.id,
            "course": self.course.id,
            "issued_at": self.month_start.isoformat(),
            "screenshot": self._screenshot("stack.gif"),
            "payment_method": self.kpay.id,
            "parsed_amount": "425",
            "transaction_id": f"tx-{uuid4().hex[:12]}",
            "discount_ids": [self.discount.id, d2_id],
        }
        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            from app_finance.discount_engine import get_active_enrollment_discounts

            active = get_active_enrollment_discounts(self.enrollment)
            self.assertEqual(len(active), 2)
            payment = UserPayment.objects.get(id=resp.json()["data"]["id"])
            self.assertIsNone(payment.enrollment_discount_id)
            self.assertEqual(payment.discount_amount.amount, Decimal("75.00"))
            self.assertEqual(payment.payment_discounts.count(), 2)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_payment_create_omitted_discount_ids_leaves_stack(self, _mock_ocr):
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
            "screenshot": self._screenshot("omit.gif"),
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
        with schema_context(self.schema_name):
            ed = get_active_enrollment_discount(self.enrollment)
            self.assertIsNotNone(ed)
            self.assertEqual(ed.discount_id, self.discount.id)
            payment = UserPayment.objects.get(id=resp.json()["data"]["id"])
            self.assertEqual(payment.discount_amount.amount, Decimal("50.00"))
            self.assertEqual(payment.payment_discounts.count(), 1)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_payment_create_rejects_discount_id_and_discount_ids_together(self, _mock_ocr):
        payload = {
            "user": self.student.id,
            "course": self.course.id,
            "issued_at": self.month_start.isoformat(),
            "screenshot": self._screenshot("both.gif"),
            "payment_method": self.kpay.id,
            "parsed_amount": "450",
            "transaction_id": f"tx-{uuid4().hex[:12]}",
            "discount_id": self.discount.id,
            "discount_ids": [self.discount.id],
        }
        resp = self._client(self.finance).post(
            "/api/v1/scan-transaction-screenshots",
            payload,
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_user_payment_search_prefetch_avoids_payment_discounts_nplusone(self):
        """List/search serialization must not lazy-load payment_discounts per row."""
        from django.test.utils import CaptureQueriesContext

        from app_finance.models import UserPaymentDiscount
        from app_finance.serializers import UserPaymentSerializer
        from app_finance.views import UserPaymentSearchView

        with schema_context(self.schema_name):
            ed = EnrollmentDiscount.objects.create(
                user_course=self.enrollment,
                discount=self.discount,
                snapshot_discount_type=Discount.DiscountType.PERCENT,
                snapshot_scope=Discount.Scope.WHOLE_ENROLLMENT,
                snapshot_percent_value=Decimal("10"),
                applied_by=self.finance,
                is_active=True,
            )
            payment_ids: list[int] = []
            for i in range(3):
                payment = UserPayment.objects.create(
                    user=self.student,
                    course=self.course,
                    created_by=self.finance,
                    issued_at=self.month_start,
                    payment_method=self.kpay,
                    transaction_id=f"tx-n1-{uuid4().hex[:8]}-{i}",
                    status=UserPayment.Status.VERIFIED,
                    parsed_amount=Money(450, "USD"),
                    base_amount=Money(500, "USD"),
                    discount_amount=Money(50, "USD"),
                    invoiced_amount=Money(450, "USD"),
                )
                UserPaymentDiscount.objects.create(
                    user_payment=payment,
                    enrollment_discount=ed,
                    label=self.discount.name,
                    amount=Money(50, "USD"),
                )
                payment_ids.append(payment.id)

            view = UserPaymentSearchView()
            qs = UserPayment.objects.filter(id__in=payment_ids)
            for pref in view.base_prefetch_related:
                qs = qs.prefetch_related(pref)
            payments = list(qs)

            with CaptureQueriesContext(connection) as ctx:
                data = UserPaymentSerializer(payments, many=True).data

            discount_sql = [
                q["sql"]
                for q in ctx.captured_queries
                if "app_finance_userpaymentdiscount" in q["sql"].lower()
            ]
            self.assertEqual(
                len(discount_sql),
                0,
                "payment_discounts should already be prefetched; got:\n"
                + "\n".join(discount_sql),
            )
            self.assertEqual(len(data), 3)
            self.assertTrue(all(row.get("discount_lines") for row in data))
