import unittest

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_ai.tools.set_ai_preferences import run_set_ai_preferences
from app_auth.models import User


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class SetAIPreferencesToolTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_sets_english_language(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            result = run_set_ai_preferences({"response_language": "en"}, user)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["preferences"]["response_language"], "en")

    def test_requires_at_least_one_field(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            result = run_set_ai_preferences({}, user)
        self.assertEqual(result["status"], "error")
