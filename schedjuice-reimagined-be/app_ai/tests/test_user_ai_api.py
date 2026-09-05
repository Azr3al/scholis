import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIUsageLog
from app_auth.models import User
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserAIApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

        with schema_context(get_public_schema_name()):
            from app_organization.models import Organization

            self.org = Organization.objects.get(schema_name=self.schema_name)

    def _client_for(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_other_get_preferences_denied_for_teacher(self):
        client = self._client_for(self.teacher)
        res = client.get(f"{self.api_prefix}/users/{self.admin.id}/ai-preferences")
        self.assertEqual(res.status_code, 403)

    def test_self_patch_preferences(self):
        client = self._client_for(self.admin)
        res = client.patch(
            f"{self.api_prefix}/users/{self.admin.id}/ai-preferences",
            {"response_language": "en", "verbosity": "brief"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["data"]["response_language"], "en")
        self.assertEqual(body["data"]["verbosity"], "brief")

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_self_get_usage(self):
        with schema_context(get_public_schema_name()):
            AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.admin.id,
                feature="ai_query",
                model="gpt-5.6-luna",
                pricing_version="v1",
                input_tokens=900,
                cached_input_tokens=100,
                billed_cost_usd=Decimal("0.50"),
                total_tokens=1000,
                created_at=datetime(2026, 6, 20, tzinfo=timezone.utc),
            )
        client = self._client_for(self.admin)
        res = client.get(
            f"{self.api_prefix}/users/{self.admin.id}/ai-usage",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["data"]["user_id"], self.admin.id)
        self.assertIn("cached_input_tokens", body["data"]["month_summary"])
        self.assertIn("cache_savings_usd", body["data"]["month_summary"])
        self.assertIn("cached_input_tokens", body["data"]["trend"][0])

    def test_get_ai_usage_includes_budget(self):
        client = self._client_for(self.admin)
        res = client.get(
            f"{self.api_prefix}/users/{self.admin.id}/ai-usage",
            {"year": 2026, "month": 7},
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn("budget", res.json()["data"])
        self.assertEqual(
            res.json()["data"]["budget"]["limit_source"], "platform_default"
        )

    def test_admin_sets_user_monthly_limit(self):
        client = self._client_for(self.admin)
        res = client.patch(
            f"{self.api_prefix}/users/{self.teacher.id}/ai-preferences",
            {"monthly_usd_limit": "10.00"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["data"]["monthly_usd_limit"], "10.0000")

    def test_self_cannot_set_monthly_limit(self):
        client = self._client_for(self.admin)
        res = client.patch(
            f"{self.api_prefix}/users/{self.admin.id}/ai-preferences",
            {"monthly_usd_limit": "10.00"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)
