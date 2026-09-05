from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_ai.client import OpenAIClient
from app_ai.tests.openai_fakes import fake_response, function_call_item


@override_settings(OPENAI_API_KEY="test-key", AI_MAX_TOOL_ITERATIONS=2)
class OpenAIToolLimitTests(SimpleTestCase):
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.get_tool")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_exhausted_loop_returns_tool_limit_outcome(
        self, mock_build, mock_get_tool, _usage
    ):
        mock_tool = MagicMock()
        mock_tool.validate_args.return_value = {}
        mock_tool.exposure = "read"
        mock_tool.run.return_value = {"items": []}
        mock_get_tool.return_value = mock_tool

        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.responses.create.side_effect = [
            fake_response([function_call_item("search_courses", {})]),
            fake_response([function_call_item("search_users", {}, call_id="call_2")]),
        ]

        result = OpenAIClient().generate_with_tools(
            "complex question",
            user=MagicMock(id=1),
            tools=[MagicMock()],
            cache_tools=[],
            feature="telegram_query",
            max_iterations=2,
        )

        self.assertEqual(result.outcome, "tool_limit_exceeded")
        self.assertIn("tool limit", result.text.lower())
        self.assertEqual(result.iterations, 2)
        self.assertEqual(len(result.tool_calls), 2)
