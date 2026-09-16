import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.exceptions import AIPromptBlocked, AIRateLimited
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
@override_settings(RBAC_ENFORCE="log_only")
class AIQueryViewGuardrailTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.credentials(HTTP_TENANT=self.schema_name)

    @patch("app_ai.views.AIService")
    def test_prompt_blocked_returns_422(self, MockService):
        MockService.return_value.run.side_effect = AIPromptBlocked(
            "blocked", reason="heuristic_reject"
        )
        resp = self.client.post(
            "/api/v1/ai/query",
            {"prompt": "what is 2+2"},
            format="json",
        )
        self.assertEqual(resp.status_code, 422)
        self.assertEqual(resp.json()["code"], "prompt_blocked")

    @patch("app_ai.views.AIService")
    def test_rate_limited_returns_429(self, MockService):
        MockService.return_value.run.side_effect = AIRateLimited("slow", 90)
        resp = self.client.post(
            "/api/v1/ai/query",
            {"prompt": "find students"},
            format="json",
        )
        self.assertEqual(resp.status_code, 429)
        self.assertEqual(resp.json()["code"], "rate_limited")
        self.assertEqual(resp.json()["retry_after_seconds"], 90)
