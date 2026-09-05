from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_ai.client import AIResult
from app_ai.exceptions import AIPromptBlocked
from app_ai.service import AIService


@override_settings(OPENAI_API_KEY="test-key")
class AIServiceRequestLogTests(SimpleTestCase):
    schema_name = "xschedjuice"

    @patch("app_ai.service.record_request_log")
    @patch("app_ai.service.evaluate_prompt")
    @patch.object(AIService, "_current_tenant")
    def test_run_logs_blocked_prompt(self, mock_tenant, mock_guard, mock_log):
        from app_organization.models import Organization

        mock_tenant.return_value = Organization(schema_name=self.schema_name)
        mock_guard.return_value = MagicMock(
            allowed=False, reason="blocked", message="Out of scope."
        )
        service = AIService()
        user = MagicMock(id=7)
        with self.assertRaises(AIPromptBlocked):
            service.run("tell me a joke", user, feature="telegram_query")
        mock_log.assert_called_once()
        self.assertEqual(mock_log.call_args.kwargs["outcome"], "blocked")

    @patch("app_ai.service.record_request_log")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.OpenAIClient.generate_with_tools")
    @patch.object(AIService, "_current_tenant")
    def test_run_logs_tool_limit_result(
        self, mock_tenant, mock_gen, mock_guard, mock_log
    ):
        from app_organization.models import Organization

        mock_tenant.return_value = Organization(schema_name=self.schema_name)
        mock_guard.return_value = MagicMock(allowed=True)
        mock_gen.return_value = AIResult(
            text="I could not complete that request within the tool limit.",
            outcome="tool_limit_exceeded",
            iterations=5,
        )
        service = AIService()
        user = MagicMock(id=7)
        result = service.run("big question", user, feature="telegram_query")
        self.assertEqual(result.outcome, "tool_limit_exceeded")
        mock_log.assert_called_once()
        self.assertEqual(
            mock_log.call_args.kwargs["outcome"],
            "tool_limit_exceeded",
        )
