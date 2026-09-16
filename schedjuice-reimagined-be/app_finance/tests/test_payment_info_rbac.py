import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_finance.models import PaymentBank, PaymentInfo
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
class PaymentInfoRBACTests(TelegramSignalTestMixin, TestCase):
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
                email=f"tch-pi-{suffix}@example.com",
                password="x",
                name="Teacher PI",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.other_teacher = User.objects.create_user(
                email=f"tch2-pi-{suffix}@example.com",
                password="x",
                name="Other Teacher PI",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.finance = User.objects.create_user(
                email=f"fin-pi-{suffix}@example.com",
                password="x",
                name="Finance PI",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.own_info = PaymentInfo.objects.create(
                user=self.teacher,
                account_name="Teacher PI",
                description="111",
                bank_type=PaymentBank.KBZ,
                is_default=True,
            )
            self.other_info = PaymentInfo.objects.create(
                user=self.other_teacher,
                account_name="Other Teacher PI",
                description="222",
                bank_type=PaymentBank.KPAY,
                is_default=True,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_search_returns_only_own_rows(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                "/api/v1/payment-infos/search",
                {
                    "filter_params": [],
                    "page": 1,
                    "page_size": 50,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.data["data"]}
        self.assertEqual(ids, {self.own_info.id})

    def test_teacher_can_get_own_detail(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).get(
                f"/api/v1/payment-infos/{self.own_info.id}"
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["data"]["id"], self.own_info.id)

    def test_teacher_forbidden_on_other_detail(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).get(
                f"/api/v1/payment-infos/{self.other_info.id}"
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_teacher_forbidden_create_for_other_user(self):
        payload = {
            "user": self.other_teacher.id,
            "account_name": "Other",
            "description": "444",
            "bank_type": PaymentBank.UAB,
            "is_default": False,
        }
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                "/api/v1/payment-infos",
                payload,
                format="json",
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_teacher_can_update_own_payment_info(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).put(
                f"/api/v1/payment-infos/{self.own_info.id}",
                {"description": "updated-account"},
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["data"]["description"], "updated-account")

    def test_teacher_forbidden_update_other_payment_info(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).put(
                f"/api/v1/payment-infos/{self.other_info.id}",
                {"description": "hacked"},
                format="json",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_teacher_forbidden_delete_other_payment_info(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).delete(
                f"/api/v1/payment-infos/{self.other_info.id}"
            )
        self.assertEqual(resp.status_code, 403, resp.content)
        with schema_context(self.schema_name):
            self.assertTrue(
                PaymentInfo.objects.filter(id=self.other_info.id).exists()
            )

    def test_finance_can_access_all_payment_infos(self):
        with schema_context(self.schema_name):
            resp = self._client(self.finance).post(
                "/api/v1/payment-infos/search",
                {
                    "filter_params": [],
                    "page": 1,
                    "page_size": 50,
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.data["data"]}
        self.assertIn(self.own_info.id, ids)
        self.assertIn(self.other_info.id, ids)

    def test_finance_can_update_other_payment_info(self):
        with schema_context(self.schema_name):
            resp = self._client(self.finance).put(
                f"/api/v1/payment-infos/{self.other_info.id}",
                {"description": "finance-updated"},
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["data"]["description"], "finance-updated")
