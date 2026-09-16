import unittest

from cryptography.fernet import Fernet
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_organization.serializers import OrganizationSerializer

KEY = Fernet.generate_key().decode()


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class OrgTelegramLoginFlagTests(TestCase):
    def test_cannot_enable_login_without_bot(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name="xschedjuice")
            org.is_telegram_on = True
            org.telegram_bot_username = None
            org.is_telegram_login_on = True
            ser = OrganizationSerializer(instance=org, data={"is_telegram_login_on": True}, partial=True)
            with self.assertRaises(ValidationError):
                ser.is_valid(raise_exception=True)

    def test_public_payload_includes_login_flag(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name="xschedjuice")
            org.is_telegram_login_on = True
            org.telegram_bot_username = "schoolbot"
            org.save()
            data = OrganizationSerializer(org).data
            self.assertTrue(data["is_telegram_login_on"])
            self.assertEqual(data["telegram_bot_username"], "schoolbot")
