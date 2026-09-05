from uuid import uuid4

from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_finance.models import PaymentBank, PaymentMethod


class PaymentMethodApiTests(APITestCase):
    schema_name = "xschedjuice"
    admin_email = "james@schedjuice.com"
    admin_password = "password123"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", schema_name=cls.schema_name, verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
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

    def test_put_persists_bank_account_number(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            method = PaymentMethod.objects.create(
                name=f"Inline edit {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            method_id = method.id

        token = self._login(self.admin_email, self.admin_password)
        res = self.client.put(
            reverse("payment-method-details", kwargs={"obj_id": method_id}),
            {"bank_account_number": "09123456789"},
            format="json",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)

        with schema_context(self.schema_name):
            method = PaymentMethod.objects.get(pk=method_id)
            self.assertEqual(method.bank_account_number, "09123456789")
