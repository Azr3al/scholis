from uuid import uuid4

from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APITestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_finance.models import PaymentBank, PaymentMethod
from app_finance.student_checkout import _resolve_payment_method


class PaymentMethodApiTests(APITestCase):
    schema_name = "xschedjuice"
    admin_email = "james@schedjuice.com"
    admin_password = "password123"
    student_email = "student@schedjuice.com"
    student_password = "password123"

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
            User.objects.filter(email=cls.student_email).update(
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

    def test_put_retires_and_unretires(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            method = PaymentMethod.objects.create(
                name=f"Retire toggle {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            method_id = method.id
            self.assertFalse(method.is_retired)

        token = self._login(self.admin_email, self.admin_password)
        res = self.client.put(
            reverse("payment-method-details", kwargs={"obj_id": method_id}),
            {"is_retired": True},
            format="json",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)
        with schema_context(self.schema_name):
            method = PaymentMethod.objects.get(pk=method_id)
            self.assertTrue(method.is_retired)

        res = self.client.put(
            reverse("payment-method-details", kwargs={"obj_id": method_id}),
            {"is_retired": False},
            format="json",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)
        with schema_context(self.schema_name):
            method = PaymentMethod.objects.get(pk=method_id)
            self.assertFalse(method.is_retired)

    def test_student_search_omits_retired_methods(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            active = PaymentMethod.objects.create(
                name=f"Active {suffix}",
                payment_bank=PaymentBank.KPAY,
            )
            retired = PaymentMethod.objects.create(
                name=f"Retired {suffix}",
                payment_bank=PaymentBank.AYA,
                is_retired=True,
            )
            active_id = active.id
            retired_id = retired.id

        token = self._login(self.student_email, self.student_password)
        res = self.client.post(
            reverse("payment-method-search"),
            {"filter_params": []},
            format="json",
            QUERY_STRING="size=-1",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)
        ids = {row["id"] for row in res.data["data"]}
        self.assertIn(active_id, ids)
        self.assertNotIn(retired_id, ids)

    def test_admin_search_includes_retired_methods(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            retired = PaymentMethod.objects.create(
                name=f"Admin sees retired {suffix}",
                payment_bank=PaymentBank.KBZ,
                is_retired=True,
            )
            retired_id = retired.id

        token = self._login(self.admin_email, self.admin_password)
        res = self.client.post(
            reverse("payment-method-search"),
            {"filter_params": []},
            format="json",
            QUERY_STRING="size=-1",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)
        ids = {row["id"] for row in res.data["data"]}
        self.assertIn(retired_id, ids)

    def test_student_cannot_opt_into_retired_via_filter(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            retired = PaymentMethod.objects.create(
                name=f"Hidden retired {suffix}",
                payment_bank=PaymentBank.CB,
                is_retired=True,
            )
            retired_id = retired.id

        token = self._login(self.student_email, self.student_password)
        res = self.client.post(
            reverse("payment-method-search"),
            {
                "filter_params": [
                    {
                        "field_name": "is_retired",
                        "operator": "exact",
                        "value": "true",
                    }
                ]
            },
            format="json",
            QUERY_STRING="size=-1",
            **self._auth(token),
        )
        self.assertEqual(res.status_code, 200, res.content)
        ids = {row["id"] for row in res.data["data"]}
        self.assertNotIn(retired_id, ids)

    def test_resolve_payment_method_skips_retired(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            retired = PaymentMethod.objects.create(
                name=f"Checkout retired {suffix}",
                payment_bank=PaymentBank.YOMA,
                is_retired=True,
            )
            active = PaymentMethod.objects.create(
                name=f"Checkout active {suffix}",
                payment_bank=PaymentBank.YOMA,
            )
            self.assertIsNone(_resolve_payment_method(retired.id))
            self.assertEqual(_resolve_payment_method(active.id).id, active.id)
