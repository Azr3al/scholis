from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import get_public_schema_name, schema_context
from unittest.mock import patch

from app_google.login_user import assert_google_login_enabled
from app_organization.models import Organization
from app_organization.serializers import OrganizationSerializer


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID="test-web.apps.googleusercontent.com",
    GOOGLE_OAUTH_CLIENT_SECRET="secret",
    GOOGLE_OAUTH_REDIRECT_URL="http://testserver/api/v1/google/oauth/callback",
)
class OrgGoogleLoginFlagTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_google_login_on_requires_platform_oauth_config(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            serializer = OrganizationSerializer(
                instance=org,
                data={
                    "is_google_on": True,
                    "is_google_login_on": True,
                },
                partial=True,
            )
            self.assertTrue(serializer.is_valid(), serializer.errors)

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="")
    def test_google_login_on_rejected_without_client_id(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            serializer = OrganizationSerializer(
                instance=org,
                data={
                    "is_google_on": True,
                    "is_google_login_on": True,
                },
                partial=True,
            )
            self.assertFalse(serializer.is_valid())
            self.assertIn("is_google_login_on", serializer.errors)

    def test_assert_google_login_enabled(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_google_on = True
            org.is_google_login_on = True
            org.save()
        assert_google_login_enabled(org)

    def test_assert_google_login_disabled(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_google_login_on = False
            org.save()
        with self.assertRaises(ValidationError) as ctx:
            assert_google_login_enabled(org)
        self.assertEqual(ctx.exception.detail["message"], "google_login_disabled")
