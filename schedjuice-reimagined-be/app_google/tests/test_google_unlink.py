import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization

GOOGLE_OAUTH_SETTINGS = {
    "GOOGLE_OAUTH_CLIENT_ID": "test-web.apps.googleusercontent.com",
    "GOOGLE_OAUTH_CLIENT_SECRET": "test-secret",
    "GOOGLE_OAUTH_REDIRECT_URL": "http://testserver/api/v1/google/oauth/callback",
}


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _jwt_token_user(email: str):
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(**GOOGLE_OAUTH_SETTINGS)
class GoogleUnlinkTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_google_on = True
            org.save()
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"google-unlink-{suffix}@example.com",
                password="x",
                name="Google User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
                google_id=f"google-sub-{suffix}",
                google_linked_at=timezone.now(),
            )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_unlink_with_jwt_token_user(self):
        """Stateless JWT auth yields TokenUser (id=email), not a User model instance."""
        token_user = _jwt_token_user(self.user.email)
        res = self._client(token_user).post("/api/v1/google/unlink", {})
        self.assertEqual(res.status_code, 200, res.content)
        with schema_context(self.schema_name):
            self.user.refresh_from_db()
        self.assertIsNone(self.user.google_id)
        self.assertIsNone(self.user.google_linked_at)

    def test_unlink_rejects_not_linked(self):
        with schema_context(self.schema_name):
            self.user.google_id = None
            self.user.google_linked_at = None
            self.user.save(update_fields=["google_id", "google_linked_at"])
        token_user = _jwt_token_user(self.user.email)
        res = self._client(token_user).post("/api/v1/google/unlink", {})
        self.assertEqual(res.status_code, 400)
        self.assertIn("not linked", res.data["message"].lower())
