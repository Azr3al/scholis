import unittest

from cryptography.fernet import Fernet
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization

KEY = Fernet.generate_key().decode()


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class OrgTelegramFieldTests(TestCase):
    def test_set_and_get_bot_token_encrypted(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name="xschedjuice")
            org.set_telegram_bot_token("999:secret")
            org.save()
            org.refresh_from_db()
            self.assertNotIn("999:secret", org.telegram_bot_token_ct or "")
            self.assertEqual(org.get_telegram_bot_token(), "999:secret")
            self.assertFalse(org.is_telegram_on)
            self.assertTrue(org.is_telegram_roster_sync_enabled)
