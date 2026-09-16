import unittest

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_ai.user_preferences import (
    build_user_preferences_context,
    get_preferences_for_user,
    preferences_to_dict,
)
from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserPreferencesContextTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_empty_context_for_defaults(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            self.assertEqual(build_user_preferences_context(user), "")

    def test_context_includes_english_only(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            UserAIPreferences.objects.create(
                user=user,
                response_language=UserAIPreferences.ResponseLanguage.EN,
            )
            ctx = build_user_preferences_context(user)
        self.assertIn("English only", ctx)
        self.assertIn("User preferences:", ctx)

    def test_get_preferences_returns_defaults_without_row(self):
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            self.assertIsNone(get_preferences_for_user(user))
            data = preferences_to_dict(None, user_id=user.id)
        self.assertEqual(data["response_language"], "auto")
        self.assertIsNone(data["updated_at"])
