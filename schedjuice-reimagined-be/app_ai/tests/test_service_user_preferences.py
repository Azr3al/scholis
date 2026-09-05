import unittest
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_ai.service import AIService
from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AIServiceUserPreferencesTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    @patch("app_ai.service.OpenAIClient.generate_with_tools")
    def test_system_context_includes_user_preferences(self, mock_gen):
        from app_ai.client import AIResult

        mock_gen.return_value = AIResult(
            text="ok", tool_calls=[], model="test", iterations=0
        )
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            UserAIPreferences.objects.create(
                user=user,
                response_language=UserAIPreferences.ResponseLanguage.EN,
            )
            AIService().run("hello", user, feature="ai_query")

        kwargs = mock_gen.call_args.kwargs
        self.assertIn("English only", kwargs["dynamic_context"])
        self.assertNotIn("English only", kwargs.get("system_context") or "")
