"""Rate-limit contract for PasswordResetRequestView."""

from unittest.mock import patch

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


class PasswordResetRequestRateLimitTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                is_student_login_disabled=False,
                timezone="UTC",
            )
        with schema_context(cls.schema_name):
            seed_rbac()

    def setUp(self):
        cache.clear()

    def _public_client(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def _request(self, client: APIClient, email: str):
        return client.post(
            reverse("password-reset-request"),
            {"email": email},
            format="json",
        )

    @patch("app_auth.models.User.send_password_reset_token_email")
    def test_first_request_succeeds(self, _mock_send):
        client = self._public_client()
        resp = self._request(client, "student@schedjuice.com")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get("message"), "success")

    @patch("app_auth.models.User.send_password_reset_token_email")
    def test_second_request_same_email_within_window_returns_429(self, _mock_send):
        client = self._public_client()
        email = "student@schedjuice.com"
        first = self._request(client, email)
        self.assertEqual(first.status_code, 200)

        second = self._request(client, email)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.data.get("message"), "rate_limited")
        details = second.data.get("details") or ""
        self.assertIn("Try again", details)
        self.assertIn("retry_after_seconds", second.data)
        self.assertGreaterEqual(second.data["retry_after_seconds"], 1)

    @patch("app_auth.models.User.send_password_reset_token_email")
    def test_request_after_window_expires_succeeds(self, _mock_send):
        client = self._public_client()
        email = "student@schedjuice.com"
        first = self._request(client, email)
        self.assertEqual(first.status_code, 200)

        cache.clear()
        again = self._request(client, email)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data.get("message"), "success")
