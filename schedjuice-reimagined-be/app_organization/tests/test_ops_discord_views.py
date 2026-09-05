"""Tests for ops Discord webhook settings API."""

import unittest
from datetime import date
from unittest.mock import MagicMock, patch

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import PlatformOpsSettings
from app_organization.ops_discord_views import OpsDiscordSettingsView, OpsDiscordTestView
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

_TEST_FERNET_KEY = Fernet.generate_key().decode()
_TEST_WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz"

class OpsDiscordViewsApiTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = MagicMock(is_authenticated=True, roles=["superadmin"])

    def _get_settings(self):
        request = self.factory.get("/management/ops-discord")
        force_authenticate(request, user=self.user)
        view = OpsDiscordSettingsView.as_view()
        with patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset({"debug.access"}),
        ):
            return view(request)

    def _put_settings(self, payload):
        request = self.factory.put(
            "/management/ops-discord", payload, format="json"
        )
        force_authenticate(request, user=self.user)
        view = OpsDiscordSettingsView.as_view()
        with patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset({"debug.access"}),
        ):
            return view(request)

    def _post_test(self, payload=None):
        request = self.factory.post(
            "/management/ops-discord/test",
            payload or {},
            format="json",
        )
        force_authenticate(request, user=self.user)
        view = OpsDiscordTestView.as_view()
        with patch(
            "app_rbac.views.effective_permissions",
            return_value=frozenset({"debug.access"}),
        ):
            return view(request)

    @patch(
        "app_organization.ops_discord_views.discord_webhook_status",
        return_value={
            "source": "env",
            "configured": True,
            "webhook_preview": "https://discord.com/api/webhooks/1234…/abcd",
        },
    )
    def test_get_returns_preview_without_full_token(self, _mock_status):
        response = self._get_settings()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["isError"])
        self.assertEqual(response.data["source"], "env")
        self.assertTrue(response.data["configured"])
        self.assertIn("…", response.data["webhook_preview"])
        self.assertNotIn("AbCdEfGhIjKlMnOpQrStUvWxYz", response.data["webhook_preview"])

    def test_put_invalid_url_returns_400(self):
        response = self._put_settings(
            {"webhook_url": "https://example.com/not-a-webhook"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["isError"])

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(
    RBAC_ENFORCE="log_only",
    PLATFORM_SECRETS_ENCRYPTION_KEY=_TEST_FERNET_KEY,
    DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/env/envtok",
)
class OpsDiscordSettingsDbTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            obj = PlatformOpsSettings.get_singleton()
            obj.discord_webhook_url_ct = ""
            obj.discord_webhook_updated_at = None
            obj.save()

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_put_valid_url_persists_db_source(self):
        with schema_context(self.schema_name):
            seed_rbac()
            user = User.objects.create_user(
                email="ops-discord@test.example",
                password="x",
                name="Ops",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(user).put(
                "/api/v1/management/ops-discord",
                {"webhook_url": _TEST_WEBHOOK},
                format="json",
            )

        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertFalse(resp.data["isError"])
        self.assertEqual(resp.data["source"], "db")
        self.assertTrue(resp.data["configured"])
        self.assertNotIn("AbCdEfGhIjKlMnOpQrStUvWxYz", resp.data["webhook_preview"])

        with schema_context(get_public_schema_name()):
            stored = PlatformOpsSettings.get_singleton().get_discord_webhook_url()
        self.assertEqual(stored, _TEST_WEBHOOK)

    def test_put_empty_string_clears_db_override(self):
        with schema_context(self.schema_name):
            seed_rbac()
            user = User.objects.create_user(
                email="ops-discord-clear@test.example",
                password="x",
                name="Ops",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

        with schema_context(get_public_schema_name()):
            obj = PlatformOpsSettings.get_singleton()
            obj.set_discord_webhook_url(_TEST_WEBHOOK)
            obj.save()

        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(user).put(
                "/api/v1/management/ops-discord",
                {"webhook_url": ""},
                format="json",
            )

        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["source"], "env")
        self.assertTrue(resp.data["configured"])

        with schema_context(get_public_schema_name()):
            stored = PlatformOpsSettings.get_singleton().get_discord_webhook_url()
        self.assertEqual(stored, "")
