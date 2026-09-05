from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_google.linking import GoogleLinkError, link_google_account
from app_organization.models import Organization

GOOGLE_OAUTH_SETTINGS = {
    "GOOGLE_OAUTH_CLIENT_ID": "test-web.apps.googleusercontent.com",
    "GOOGLE_OAUTH_CLIENT_SECRET": "test-secret",
    "GOOGLE_OAUTH_REDIRECT_URL": "http://testserver/api/v1/google/oauth/callback",
}


@override_settings(**GOOGLE_OAUTH_SETTINGS)
class GoogleLinkingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=cls.schema_name)
            org.is_google_on = True
            org.save()

    def test_link_allows_different_google_email(self):
        claims = {
            "sub": "google-subject-different-email",
            "email": "personal@gmail.com",
            "email_verified": True,
        }
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            with patch(
                "app_google.linking.verify_google_id_token",
                return_value=claims,
            ):
                linked = link_google_account(user, "fake-id-token", org=org)
            self.assertEqual(linked.google_id, "google-subject-different-email")
            self.assertIsNotNone(linked.google_linked_at)

    def test_link_rejects_unverified_google_email(self):
        claims = {
            "sub": "google-subject-unverified",
            "email": "james@schedjuice.com",
            "email_verified": False,
        }
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            user = User.objects.get(email="james@schedjuice.com")
            with patch(
                "app_google.linking.verify_google_id_token",
                return_value=claims,
            ):
                with self.assertRaises(GoogleLinkError):
                    link_google_account(user, "fake-id-token", org=org)

    def test_link_rejects_google_sub_already_bound_to_another_user(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            other = User.objects.exclude(email="james@schedjuice.com").first()
            self.assertIsNotNone(other)
            other.google_id = "google-subject-taken"
            other.save(update_fields=["google_id"])
            user = User.objects.get(email="james@schedjuice.com")
            claims = {
                "sub": "google-subject-taken",
                "email": "james@schedjuice.com",
                "email_verified": True,
            }
            with patch(
                "app_google.linking.verify_google_id_token",
                return_value=claims,
            ):
                with self.assertRaises(GoogleLinkError):
                    link_google_account(user, "fake-id-token", org=org)
