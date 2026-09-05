from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program
from app_finance.models import PaymentPlan, UserPayment, UserPaymentGroup
from app_finance.tests.billing_base import BillingTenantAwareBaseTest


def _tiny_png():
    buf = BytesIO()
    Image.new("RGB", (1, 1), color="white").save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile("screenshot.png", buf.read(), content_type="image/png")


class StudentCheckoutTest(BillingTenantAwareBaseTest):
    student_email = "student@schedjuice.com"
    student_password = "password123"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        with schema_context(cls.schema_name):
            User.objects.filter(email=cls.student_email).update(
                is_password_change_required=False,
                is_active=True,
            )
            suffix = uuid4().hex[:6]
            cls.student = User.objects.get(email=cls.student_email)
            plan = PaymentPlan.objects.create(
                name=f"plan-checkout-{suffix}",
                price=Money(100, "USD"),
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            today = timezone.localdate()
            cls.course_a = Course.objects.create(
                title=f"Course A {suffix}",
                category=cat,
                program=prog,
                payment_plan=plan,
                start_date=today,
                end_date=today + timedelta(days=30),
            )
            cls.course_b = Course.objects.create(
                title=f"Course B {suffix}",
                category=cat,
                program=prog,
                payment_plan=plan,
                start_date=today,
                end_date=today + timedelta(days=30),
            )

    def _login(self):
        res = self.client.post(
            reverse("login"),
            {"email": self.student_email, "password": self.student_password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def _auth(self, token):
        return {
            "HTTP_AUTHORIZATION": f"Bearer {token}",
            "HTTP_X_DTS_SCHEMA": self.schema_name,
        }

    def _pending_payment(self, course, amount: str):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=course,
                status=UserPayment.Status.PENDING_PAYMENT,
                invoiced_amount=Money(Decimal(amount), "USD"),
            )
            UserPayment.objects.filter(pk=payment.pk).update(payment_date=None)
            payment.refresh_from_db()
            return payment

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_multi_course_checkout_creates_group(self, _mock_delay):
        payment_a = self._pending_payment(self.course_a, "60000")
        payment_b = self._pending_payment(self.course_b, "40000")
        token = self._login()
        res = self.client.post(
            reverse("make-payment"),
            {
                "checkout": "1",
                "payment_ids_count": "2",
                "payment_id_0": str(payment_a.id),
                "payment_id_1": str(payment_b.id),
                "screenshots_count": "1",
                "screenshot_0_screenshot": _tiny_png(),
                "screenshot_0_parsed_amount": "50000",
            },
            format="multipart",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)
        with schema_context(self.schema_name):
            payment_a.refresh_from_db()
            payment_b.refresh_from_db()
            self.assertIsNotNone(payment_a.group_id)
            self.assertEqual(payment_a.group_id, payment_b.group_id)
            self.assertEqual(
                payment_a.group.group_kind,
                UserPaymentGroup.GroupKind.MULTI_COURSE,
            )
            self.assertEqual(
                payment_a.status,
                UserPayment.Status.PENDING_VERIFICATION,
            )
            self.assertTrue(payment_a.screenshot)
            self.assertIsNotNone(payment_a.payment_date)
            self.assertIsNotNone(payment_b.payment_date)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_checkout_succeeds_when_ocr_amount_differs_from_invoiced(self, _mock_delay):
        payment = self._pending_payment(self.course_a, "100000")
        token = self._login()
        res = self.client.post(
            reverse("make-payment"),
            {
                "checkout": "1",
                "payment_ids_count": "1",
                "payment_id_0": str(payment.id),
                "screenshots_count": "2",
                "screenshot_0_screenshot": _tiny_png(),
                "screenshot_0_parsed_amount": "30000",
                "screenshot_1_screenshot": _tiny_png(),
                "screenshot_1_parsed_amount": "20000",
            },
            format="multipart",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_student_cannot_checkout_other_users_payment(self, _mock_delay):
        with schema_context(self.schema_name):
            other = User.objects.get(email=self.teacher_email)
            victim = UserPayment.objects.create(
                user=other,
                course=self.course_a,
                status=UserPayment.Status.PENDING_PAYMENT,
                invoiced_amount=Money(Decimal("50000"), "USD"),
            )
        token = self._login()
        res = self.client.post(
            reverse("make-payment"),
            {
                "checkout": "1",
                "payment_ids_count": "1",
                "payment_id_0": str(victim.id),
                "screenshots_count": "1",
                "screenshot_0_screenshot": _tiny_png(),
            },
            format="multipart",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 403)
