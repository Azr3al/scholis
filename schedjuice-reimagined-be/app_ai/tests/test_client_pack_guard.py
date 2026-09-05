from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_ai.client import OpenAIClient
from app_ai.tests.openai_fakes import fake_response, function_call_item, message_item
from app_ai.tools.intent import TurnIntent
from app_ai.tools.search_users import SEARCH_USERS_TOOL


@override_settings(OPENAI_API_KEY="test-key", AI_MAX_TOOL_ITERATIONS=3)
class PackGuardTests(SimpleTestCase):
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.get_tool")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_blocks_tool_not_in_selected_set(
        self, mock_build, mock_get_tool, _usage
    ):
        mock_tool = MagicMock()
        mock_tool.exposure = "read"
        mock_tool.always_available = False
        mock_get_tool.return_value = mock_tool

        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.responses.create.side_effect = [
            fake_response([function_call_item("get_unpaid_students", {})]),
            fake_response([message_item("I cannot do that.")]),
        ]

        result = OpenAIClient().generate_with_tools(
            "how many unpaid students",
            user=MagicMock(id=1),
            tools=[SEARCH_USERS_TOOL],
            cache_tools=[],
            turn_intent=TurnIntent.READ,
        )

        mock_tool.run.assert_not_called()
        self.assertEqual(len(result.tool_calls), 1)
        self.assertFalse(result.tool_calls[0]["ok"])
        self.assertIn("not available", result.tool_calls[0]["error"].lower())
