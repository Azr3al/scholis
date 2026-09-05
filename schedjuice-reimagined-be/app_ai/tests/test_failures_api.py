import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.failure_causes import LIKELY_CAUSE_UNKNOWN
from app_ai.capability_gap.constants import CAPABILITY_GAP_DATA_NOT_EXPOSED
from app_ai.models import AIRequestLog, AITenantUsageMonthly
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
class AIUsageFailuresApiTests(TestCase):
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
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.superadmin.id,
                feature="telegram_query",
                channel_key="telegram:1",
                prompt="test failure prompt",
                response_text="I could not complete that request within the tool limit.",
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_iterations=5,
                tool_calls=[],
                likely_causes=[LIKELY_CAUSE_UNKNOWN],
                model="gpt-test",
            )

    def _client(self, user: User, schema_name: str) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=schema_name)
        return client

    def test_superadmin_can_fetch_platform_failures(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/platform/ai-usage/failures",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertIn("items", body)
        self.assertIn("summary", body)
        self.assertGreaterEqual(body["total_count"], 1)

    def test_admin_without_permission_forbidden(self):
        resp = self._client(self.admin, self.admin_schema).get(
            f"{self.api_prefix}/platform/ai-usage/failures",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_superadmin_on_customer_tenant_can_fetch_own_org_failures(self):
        resp = self._client(self.customer_superadmin, self.customer_schema).get(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/ai-usage/failures",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertIn("items", body)

    def test_superadmin_on_customer_tenant_cannot_fetch_other_org_failures(self):
        resp = self._client(self.customer_superadmin, self.customer_schema).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/failures",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_failures_include_likely_causes(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/platform/ai-usage/failures",
            {"year": 2026, "month": 6},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        item = body["items"][0]
        self.assertIn("likely_causes", item)
        self.assertIn("by_likely_cause", body["summary"])

    def test_invalid_likely_cause_returns_400(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/platform/ai-usage/failures",
            {"year": 2026, "month": 6, "likely_cause": "not_a_cause"},
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_outcome_all_includes_summary_by_outcome(self):
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.superadmin.id,
                feature="telegram_query",
                prompt="gap test",
                response_text="partial",
                outcome=AIRequestLog.Outcome.CAPABILITY_GAP,
                capability_gaps=[CAPABILITY_GAP_DATA_NOT_EXPOSED],
                capability_gap_intent="History",
                created_at=datetime(2026, 6, 10, tzinfo=timezone.utc),
            )
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/platform/ai-usage/failures",
            {"year": 2026, "month": 6, "outcome": "all"},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertIn("by_outcome", body["summary"])
        self.assertIn("by_capability_gap", body["summary"])
        gap_item = next(
            (i for i in body["items"] if i.get("outcome") == "capability_gap"),
            None,
        )
        self.assertIsNotNone(gap_item)
        self.assertIn("capability_gaps", gap_item)

    def test_resolve_failure_hides_from_open_list(self):
        with schema_context(get_public_schema_name()):
            row = AIRequestLog.objects.get(prompt="test failure prompt")
        resp = self._client(self.superadmin, self.admin_schema).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/failures/{row.id}",
            {"resolved": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertIsNotNone(body["resolved_at"])

        list_resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/failures",
            {"year": 2026, "month": 6, "resolution": "open"},
        )
        self.assertEqual(list_resp.status_code, 200, list_resp.content)
        ids = [item["id"] for item in list_resp.json()["items"]]
        self.assertNotIn(row.id, ids)

    def test_unresolve_failure_returns_to_open_list(self):
        with schema_context(get_public_schema_name()):
            row = AIRequestLog.objects.get(prompt="test failure prompt")
        client = self._client(self.superadmin, self.admin_schema)
        client.patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/failures/{row.id}",
            {"resolved": True},
            format="json",
        )
        resp = client.patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/failures/{row.id}",
            {"resolved": False},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIsNone(resp.json()["resolved_at"])

    def test_resolve_wrong_org_returns_404(self):
        with schema_context(get_public_schema_name()):
            row = AIRequestLog.objects.get(prompt="test failure prompt")
        resp = self._client(self.superadmin, self.admin_schema).patch(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/ai-usage/failures/{row.id}",
            {"resolved": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 404, resp.content)
