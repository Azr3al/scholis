import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AITenantUsageMonthly
from app_auth.models import User
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AIUsageApiTests(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.admin_schema):
            seed_rbac()
            self.superadmin = User.objects.create_user(
                email=f"sa-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )
            self.admin = User.objects.create_user(
                email=f"adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

        with schema_context(self.customer_schema):
            seed_rbac()
            self.customer_superadmin = User.objects.create_user(
                email=f"csa-{suffix}@example.com",
                password="x",
                name="Customer Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.admin_schema)
            self.customer_org = Organization.objects.get(schema_name=self.customer_schema)
            AITenantUsageMonthly.objects.create(
                tenant=self.org,
                year=2026,
                month=6,
                model="gpt-test",
                total_billed_usd=Decimal("1.25"),
                total_tokens=125,
                request_count=2,
            )

    def _client(self, user: User, schema_name: str) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=schema_name)
        return client

    def test_superadmin_on_admin_tenant_can_fetch_summary(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/platform/ai-usage/summary",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertEqual(body["year"], 2026)
        self.assertIn("organizations", body)
        self.assertIn("cached_input_tokens", body["totals"])
        self.assertIn("cache_hit_rate", body["totals"])
        self.assertIn("cache_savings_usd", body["totals"])
        org = body["organizations"][0]
        self.assertIn("cached_input_tokens", org["selected_month"])
        self.assertIn("cache_savings_usd", org["trend"][0])

    def test_jwt_style_superadmin_without_roles_on_token_can_fetch_summary(self):
        class JwtStyleUser:
            is_authenticated = True

            def __init__(self, email: str):
                self.id = email
                self.roles = []

        client = APIClient()
        client.force_authenticate(user=JwtStyleUser(self.superadmin.email))
        client.credentials(HTTP_TENANT=self.admin_schema)
        resp = client.get(
            f"{self.api_prefix}/platform/ai-usage/summary",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_superadmin_on_admin_tenant_can_fetch_org_detail(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertEqual(Decimal(body["month_summary"]["total_cost_usd"]), Decimal("1.25"))
        self.assertIn("cached_input_tokens", body["month_summary"])
        self.assertNotIn("users", body)

    def test_superadmin_on_admin_tenant_can_fetch_org_users(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/users",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertIn("users", body)
        if body["users"]:
            self.assertIn("cache_hit_rate", body["users"][0])
            self.assertNotIn("cache_savings_usd", body["users"][0])

    def test_admin_without_permission_forbidden(self):
        resp = self._client(self.admin, self.admin_schema).get(
            f"{self.api_prefix}/platform/ai-usage/summary",
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_superadmin_on_customer_tenant_forbidden(self):
        resp = self._client(self.customer_superadmin, self.customer_schema).get(
            f"{self.api_prefix}/platform/ai-usage/summary",
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_superadmin_on_customer_tenant_cannot_fetch_other_org_usage(self):
        resp = self._client(self.customer_superadmin, self.customer_schema).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 403, resp.content)
