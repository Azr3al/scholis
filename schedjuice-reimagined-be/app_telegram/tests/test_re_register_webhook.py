import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from app_telegram.config import re_register_telegram_webhook


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only", TELEGRAM_TOKEN_ENCRYPTION_KEY="")
class TelegramReRegisterWebhookTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from cryptography.fernet import Fernet

        self.key = Fernet.generate_key().decode()
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"adm-{uuid4().hex[:6]}@e.com",
                password="x",
                name="A",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
        with override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=self.key):
            with schema_context(get_public_schema_name()):
                org = Organization.objects.get(schema_name=self.schema_name)
                org.set_telegram_bot_token("555:secret")
                org.telegram_routing_key = "existing-routing-key"
                org.telegram_webhook_secret = "existing-secret"
                org.is_telegram_on = True
                org.telegram_bot_username = "schoolbot"
                org.save()

    def _client(self):
        c = APIClient()
        c.force_authenticate(user=self.admin)
        c.credentials(HTTP_TENANT=self.schema_name)
        return c

    @patch("app_telegram.config.TelegramClient")
    def test_re_register_keeps_routing_key(self, MockClient):
        with override_settings(
            TELEGRAM_TOKEN_ENCRYPTION_KEY=self.key,
            TELEGRAM_WEBHOOK_BASE_URL="https://api.example.com",
        ):
            res = self._client().post(
                "/api/v1/telegram/re-register-webhook",
                {"rotate_credentials": False},
                format="json",
            )
        self.assertEqual(res.status_code, 200, res.content)
        MockClient.return_value.set_webhook.assert_called_once()
        call_kwargs = MockClient.return_value.set_webhook.call_args.kwargs
        self.assertIn("existing-routing-key", call_kwargs["url"])
        self.assertEqual(call_kwargs["secret_token"], "existing-secret")
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        self.assertEqual(org.telegram_routing_key, "existing-routing-key")
        self.assertEqual(org.telegram_webhook_secret, "existing-secret")

    @patch("app_telegram.config.TelegramClient")
    def test_rotate_credentials_generates_new_keys(self, MockClient):
        with override_settings(
            TELEGRAM_TOKEN_ENCRYPTION_KEY=self.key,
            TELEGRAM_WEBHOOK_BASE_URL="https://api.example.com",
        ):
            res = self._client().post(
                "/api/v1/telegram/re-register-webhook",
                {"rotate_credentials": True},
                format="json",
            )
        self.assertEqual(res.status_code, 200, res.content)
        MockClient.return_value.set_webhook.assert_called_once()
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        self.assertNotEqual(org.telegram_routing_key, "existing-routing-key")
        self.assertNotEqual(org.telegram_webhook_secret, "existing-secret")
        call_kwargs = MockClient.return_value.set_webhook.call_args.kwargs
        self.assertIn(org.telegram_routing_key, call_kwargs["url"])
        self.assertEqual(call_kwargs["secret_token"], org.telegram_webhook_secret)

    @patch("app_telegram.config.TelegramClient")
    def test_re_register_disabled_telegram_returns_400(self, MockClient):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_telegram_on = False
            org.save()
        with override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=self.key):
            res = self._client().post(
                "/api/v1/telegram/re-register-webhook",
                {"rotate_credentials": False},
                format="json",
            )
        self.assertEqual(res.status_code, 400)
        MockClient.return_value.set_webhook.assert_not_called()

    @patch("app_telegram.config.TelegramClient")
    def test_re_register_no_token_returns_400(self, MockClient):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.telegram_bot_token_ct = None
            org.save()
        with override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=self.key):
            res = self._client().post(
                "/api/v1/telegram/re-register-webhook",
                {"rotate_credentials": False},
                format="json",
            )
        self.assertEqual(res.status_code, 400)
        MockClient.return_value.set_webhook.assert_not_called()

    @patch("app_telegram.config.TelegramClient")
    def test_rotate_rolls_back_when_setwebhook_fails(self, MockClient):
        from app_telegram.client import TelegramApiError

        MockClient.return_value.set_webhook.side_effect = TelegramApiError(
            "setWebhook", "boom"
        )
        with override_settings(
            TELEGRAM_TOKEN_ENCRYPTION_KEY=self.key,
            TELEGRAM_WEBHOOK_BASE_URL="https://api.example.com",
        ):
            with self.assertRaises(TelegramApiError):
                re_register_telegram_webhook(self.schema_name, rotate_credentials=True)
        # The new key must NOT be persisted when Telegram registration fails,
        # otherwise the bot is stranded with a key Telegram never received.
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        self.assertEqual(org.telegram_routing_key, "existing-routing-key")
        self.assertEqual(org.telegram_webhook_secret, "existing-secret")
