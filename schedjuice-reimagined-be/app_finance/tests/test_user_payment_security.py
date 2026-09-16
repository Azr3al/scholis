from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_finance.models import UserPayment
from app_finance.tests.billing_base import BillingTenantAwareBaseTest

def _tiny_png():
    buf = BytesIO()
    Image.new("RGB", (1, 1), color="white").save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile("screenshot.png", buf.read(), content_type="image/png")

class UserPaymentSecurityTest(BillingTenantAwareBaseTest):
    student_email = "student@schedjuice.com"
    student_password = "password123"
    admin_email = "james@schedjuice.com"
    admin_password = "password123"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        with schema_context(cls.schema_name):
            User.objects.filter(email=cls.student_email).update(
                is_password_change_required=False,
                is_active=True,
            )
            User.objects.filter(email=cls.admin_email).update(
                is_password_change_required=False,
                is_active=True,
            )

    def _login(self, email, password):
        res = self.client.post(
            reverse("login"),
            {"email": email, "password": password},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        return res.data["access"]

    def _auth(self, token):
        return {
            "HTTP_AUTHORIZATION": f"Bearer {token}",
            "HTTP_X_DTS_SCHEMA": self.schema_name,
        }

    def _create_payment_for(self, email):
        with schema_context(self.schema_name):
            user = User.objects.get(email=email)
            return UserPayment.objects.create(user=user)

    def test_student_cannot_get_other_users_payment(self):
        victim_payment = self._create_payment_for(self.teacher_email)
        token = self._login(self.student_email, self.student_password)
        res = self.client.get(
            reverse("user-payment-details", kwargs={"obj_id": victim_payment.id}),
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 403)

    def test_student_cannot_put_payment(self):
        payment = self._create_payment_for(self.student_email)
        token = self._login(self.student_email, self.student_password)
        res = self.client.put(
            reverse("user-payment-details", kwargs={"obj_id": payment.id}),
            {"status": UserPayment.Status.VERIFIED},
            format="json",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 403)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_make_payment_ignores_privileged_fields(self, _mock_delay):
        payment = self._create_payment_for(self.student_email)
        token = self._login(self.student_email, self.student_password)
        res = self.client.post(
            reverse("make-payment"),
            {
                "id": payment.id,
                "screenshot": _tiny_png(),
                "status": UserPayment.Status.VERIFIED,
            },
            format="multipart",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200)
        with schema_context(self.schema_name):
            payment.refresh_from_db()
            self.assertEqual(payment.status, UserPayment.Status.AWAITING_EXTRACTION)

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_student_cannot_submit_payment_for_other_user(self, _mock_delay):
        victim_payment = self._create_payment_for(self.teacher_email)
        token = self._login(self.student_email, self.student_password)
        res = self.client.post(
            reverse("make-payment"),
            {"id": victim_payment.id, "screenshot": _tiny_png()},
            format="multipart",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 403)

    def test_student_with_payment_make_can_search_payment_methods(self):
        token = self._login(self.student_email, self.student_password)
        res = self.client.post(
            reverse("payment-method-search"),
            {"filter_params": []},
            format="json",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)

    def test_student_search_returns_bank_account_number_when_field_requested(self):
        import base64
        import json
        from uuid import uuid4

        from app_finance.models import PaymentBank, PaymentMethod

        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            method = PaymentMethod.objects.create(
                name=f"Student checkout {suffix}",
                payment_bank=PaymentBank.KBZ,
                bank_account_number="09123456789",
            )
            method_id = method.id

        fields_b64 = (
            base64.urlsafe_b64encode(
                json.dumps(["id", "name", "bank_account_number"]).encode()
            )
            .decode()
            .rstrip("=")
        )
        token = self._login(self.student_email, self.student_password)
        res = self.client.post(
            reverse("payment-method-search"),
            {"filter_params": []},
            format="json",
            QUERY_STRING=f"size=-1&fields={fields_b64}",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)
        rows = res.data["data"]
        match = [row for row in rows if row["id"] == method_id]
        self.assertEqual(len(match), 1)
        self.assertEqual(match[0]["bank_account_number"], "09123456789")

    def test_student_cannot_create_payment_method(self):
        token = self._login(self.student_email, self.student_password)
        with override_settings(RBAC_ENFORCE="enforce"):
            res = self.client.post(
                reverse("payment-methods"),
                {
                    "name": "Student should not create",
                    "payment_bank": "KBZ",
                },
                format="json",
                **self._auth(token),
            )
        self.assertEqual(res.status_code, 403)
