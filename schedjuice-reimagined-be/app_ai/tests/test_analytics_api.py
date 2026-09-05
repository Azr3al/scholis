import unittest
from datetime import date, datetime, timezone
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIRequestLog
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
class AIUsageAnalyticsApiTests(TestCase):
    admin_schema = "xschedjuice"
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
                email=f"sa-analytics-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.admin_schema)
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.superadmin.id,
                feature="telegram_query",
                channel_key="telegram:1",
                prompt="analytics test",
                response_text="Hello",
                outcome=AIRequestLog.Outcome.SUCCESS,
                model="gpt-test",
                created_at=datetime(2026, 7, 10, 12, 0, tzinfo=timezone.utc),
            )

    def _client(self, user: User, schema_name: str) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=schema_name)
        return client

    def test_org_analytics_endpoint(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/analytics",
            {"year": 2026, "month": 7, "feature": "telegram_query"},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertIn("daily", body)
        self.assertEqual(len(body["daily"]), 31)
        self.assertIn("monthly_trend", body)
        self.assertEqual(len(body["monthly_trend"]), 6)

    def test_platform_analytics_single_tenant(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/platform/ai-usage/analytics",
            {
                "year": 2026,
                "month": 7,
                "feature": "telegram_query",
                "tenant_id": self.org.id,
            },
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertEqual(body["tenant_id"], self.org.id)

    def test_invalid_feature_returns_400(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/analytics",
            {"year": 2026, "month": 7, "feature": "bogus"},
        )
        self.assertEqual(resp.status_code, 400, resp.content)
