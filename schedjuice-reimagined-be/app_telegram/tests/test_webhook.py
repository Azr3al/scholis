import unittest
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class TelegramWebhookTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.telegram_routing_key = f"rk-{uuid4().hex[:8]}"
            self.org.telegram_webhook_secret = "s3cr3t"
            self.org.is_telegram_on = True
            self.org.save()

    def _url(self):
        return f"/api/v1/telegram/webhook/{self.org.telegram_routing_key}/"

    def test_rejects_bad_secret(self):
        res = APIClient().post(
            self._url(),
            {"update_id": 1},
            format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="wrong",
        )
        self.assertEqual(res.status_code, 401)

    def test_unknown_routing_key_404(self):
        res = APIClient().post(
            "/api/v1/telegram/webhook/nope/",
            {"update_id": 1},
            format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="s3cr3t",
        )
        self.assertEqual(res.status_code, 404)

    @patch("app_telegram.webhook.dispatch_update")
    def test_valid_update_dispatched_and_deduped(self, mock_dispatch):
        body = {"update_id": 99, "message": {"text": "hi"}}
        r1 = APIClient().post(
            self._url(),
            body,
            format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="s3cr3t",
        )
        r2 = APIClient().post(
            self._url(),
            body,
            format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="s3cr3t",
        )
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(mock_dispatch.call_count, 1)
