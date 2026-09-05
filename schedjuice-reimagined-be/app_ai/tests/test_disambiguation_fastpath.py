from unittest.mock import MagicMock, patch

import unittest
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_ai.client import AIResult
from app_ai.disambiguation import PendingTurnResult
from app_ai.guardrails.types import GuardrailResult
from app_ai.service import AIService
from app_auth.models import User
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class DisambiguationFastPathTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    @patch("app_ai.tasks.judge_request_log_capability_gap")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.try_resolve_pending_turn")
    @patch("app_ai.service.try_resolve_pending_confirmation")
    @patch("app_ai.roster_intent.try_resolve_roster_switch")
    @patch("app_ai.service.OpenAIClient.generate_with_tools")
    def test_switch_turn_uses_fast_path(
        self, mock_gen, mock_switch, mock_confirm, mock_pending, mock_eval, _mock_judge
    ):
        mock_eval.return_value = GuardrailResult(allowed=True, reason="allowed")
        mock_gen.return_value = AIResult(text="done", tool_calls=[], model="test", iterations=1)
        mock_confirm.return_value = None
        mock_pending.return_value = None
        mock_switch.return_value = PendingTurnResult(
            reminder="Cancel pending assign and remove you instead? Reply yes or no.",
        )
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            AIService().run(
                "now, remove me from KET 152",
                user,
                feature="telegram_query",
                channel_key="telegram:1",
            )

        kwargs = mock_gen.call_args.kwargs
        self.assertEqual(kwargs["tools"], [])
        self.assertEqual(kwargs["max_iterations"], 1)
        self.assertIn("Pending roster switch:", kwargs["dynamic_context"])

    @patch("app_ai.tasks.judge_request_log_capability_gap")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.try_resolve_pending_turn")
    @patch("app_ai.service.OpenAIClient.generate_with_tools")
    def test_executed_pending_turn_uses_fast_path(
        self, mock_gen, mock_pending, mock_eval, _mock_judge
    ):
        mock_eval.return_value = GuardrailResult(allowed=True, reason="allowed")
        mock_gen.return_value = AIResult(text="done", tool_calls=[], model="test", iterations=1)
        mock_pending.return_value = PendingTurnResult(
            executed=True,
            payload={"status": "ok", "points_awarded": 5},
        )
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            AIService().run(
                "A",
                user,
                feature="telegram_query",
                channel_key="telegram:1",
            )

        kwargs = mock_gen.call_args.kwargs
        self.assertEqual(kwargs["tools"], [])
        self.assertEqual(kwargs["max_iterations"], 1)
        self.assertIn("Tool result:", kwargs["dynamic_context"])

    @patch("app_ai.tasks.judge_request_log_capability_gap")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.try_resolve_pending_confirmation")
    @patch("app_ai.service.OpenAIClient.generate_with_tools")
    def test_confirmation_reminder_uses_fast_path(
        self, mock_gen, mock_confirm, mock_eval, _mock_judge
    ):
        from app_ai.pending_turn import PendingTurnResult

        mock_eval.return_value = GuardrailResult(allowed=True, reason="allowed")
        mock_gen.return_value = AIResult(text="done", tool_calls=[], model="test", iterations=1)
        mock_confirm.return_value = PendingTurnResult(
            reminder='Reply "confirm" to proceed or "cancel" to abort.',
        )
        with schema_context(self.schema_name):
            user = User.objects.filter(is_active=True).first()
            AIService().run(
                "maybe later",
                user,
                feature="telegram_query",
                channel_key="telegram:1",
            )

        kwargs = mock_gen.call_args.kwargs
        self.assertEqual(kwargs["tools"], [])
        self.assertEqual(kwargs["max_iterations"], 1)
        self.assertIn("Pending roster confirmation:", kwargs["dynamic_context"])
