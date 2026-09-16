import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

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
class OrganizationAISettingsApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

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

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_patch_validates_context_turns(self):
        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {"ai_max_context_turns": 99},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_get_includes_system_prompt_preview_fields(self):
        with schema_context(get_public_schema_name()):
            self.org.ai_school_context = "K-12 school."
            self.org.save(update_fields=["ai_school_context"])
        resp = self._client(self.admin).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertIn("ai_platform_base_prompt", data)
        self.assertIn("ai_system_prompt_preview", data)
        self.assertIn(self.org.name, data["ai_platform_base_prompt"])
        self.assertIn("K-12 school.", data["ai_system_prompt_preview"])

    def test_patch_cannot_overwrite_platform_base_prompt(self):
        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {"ai_platform_base_prompt": "malicious override"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn(
            "malicious override",
            resp.json()["data"]["ai_platform_base_prompt"],
        )

    def test_patch_default_user_monthly_usd_limit(self):
        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {"ai_default_user_monthly_usd_limit": "5.00"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(
            resp.json()["data"]["ai_default_user_monthly_usd_limit"], "5.0000"
        )

    def test_patch_rejects_non_positive_default_user_limit(self):
        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {"ai_default_user_monthly_usd_limit": "0"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_patch_rejects_unknown_model(self):
        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {"ai_default_model": "gpt-4"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_patch_accepts_valid_model_and_null(self):
        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {"ai_default_model": "gpt-5.6-terra"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["data"]["ai_default_model"], "gpt-5.6-terra")

        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {"ai_default_model": None},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIsNone(resp.json()["data"]["ai_default_model"])

    def test_patch_cannot_overwrite_platform_defaults_metadata(self):
        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {
                "ai_platform_defaults": {"default_model": "fake-model"},
                "ai_available_models": ["fake-model"],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertEqual(
            data["ai_platform_defaults"]["default_model"], "gpt-5.6-luna"
        )
        self.assertNotIn("fake-model", data["ai_available_models"])

    def test_get_includes_packs_and_tools(self):
        resp = self._client(self.admin).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()["data"]
        self.assertIn("ai_enabled_packs", data)
        self.assertIn("ai_available_packs", data)
        self.assertIn("available_tools", data)
        self.assertIn("can_edit_ai_packs", data)
        self.assertFalse(data["can_edit_ai_packs"])

    def test_school_admin_cannot_patch_packs(self):
        resp = self._client(self.admin).patch(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-settings",
            {"ai_enabled_packs": ["finance"]},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class OrganizationAISettingsPacksPlatformTests(TestCase):
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
        with schema_context(get_public_schema_name()):
            self.customer_org = Organization.objects.get(
                schema_name=self.customer_schema
            )
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

    def _platform_client(self) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=self.superadmin)
        client.credentials(HTTP_TENANT=self.admin_schema)
        return client

    def test_unknown_pack_rejected_for_platform_staff(self):
        resp = self._platform_client().patch(
            f"{self.api_prefix}/organizations/{self.customer_org.id}/ai-settings",
            {"ai_enabled_packs": ["not_a_real_pack"]},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

