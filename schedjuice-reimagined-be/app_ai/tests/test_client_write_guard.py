from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_ai.client import OpenAIClient
from app_ai.tests.openai_fakes import fake_response, function_call_item, message_item
from app_ai.tools.intent import TurnIntent


@override_settings(OPENAI_API_KEY="test-key", AI_MAX_TOOL_ITERATIONS=3)
class WriteGuardTests(SimpleTestCase):
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.get_tool")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_read_turn_blocks_write_tool(self, mock_build, mock_get_tool, _usage):
        mock_tool = MagicMock()
        mock_tool.exposure = "write"
        mock_tool.always_available = False
        mock_get_tool.return_value = mock_tool

        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.responses.create.side_effect = [
            fake_response([function_call_item("adjust_staff_points", {})]),
            fake_response([message_item("Sorry, I cannot do that.")]),
        ]

        result = OpenAIClient().generate_with_tools(
            "how many students",
            user=MagicMock(id=1),
            tools=[MagicMock()],
            cache_tools=[],
            turn_intent=TurnIntent.READ,
        )

        mock_tool.run.assert_not_called()
        self.assertEqual(len(result.tool_calls), 1)
        self.assertFalse(result.tool_calls[0]["ok"])
        self.assertIn("not available", result.tool_calls[0]["error"].lower())

    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.get_tool")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_read_turn_allows_set_ai_preferences(
        self, mock_build, mock_get_tool, _usage
    ):
        mock_tool = MagicMock()
        mock_tool.exposure = "write"
        mock_tool.always_available = True
        mock_tool.validate_args.return_value = {"tone": "formal"}
        mock_tool.run.return_value = {"status": "ok"}
        mock_get_tool.return_value = mock_tool

        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_tool.name = "set_ai_preferences"
        mock_client.responses.create.side_effect = [
            fake_response([function_call_item("set_ai_preferences", {"tone": "formal"})]),
            fake_response([message_item("Updated your preferences.")]),
        ]

        result = OpenAIClient().generate_with_tools(
            "be more formal",
            user=MagicMock(id=1),
            tools=[mock_tool],
            cache_tools=[],
            turn_intent=TurnIntent.READ,
        )

        mock_tool.run.assert_called_once()
        self.assertTrue(result.tool_calls[0]["ok"])

    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.get_tool")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_write_turn_allows_write_tool(self, mock_build, mock_get_tool, _usage):
        mock_tool = MagicMock()
        mock_tool.exposure = "write"
        mock_tool.always_available = False
        mock_tool.validate_args.return_value = {}
        mock_tool.run.return_value = {"status": "ok"}
        mock_get_tool.return_value = mock_tool

        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_tool.name = "adjust_staff_points"
        mock_client.responses.create.side_effect = [
            fake_response([function_call_item("adjust_staff_points", {})]),
            fake_response([message_item("Points updated.")]),
        ]

        result = OpenAIClient().generate_with_tools(
            "award 5 points to Jane",
            user=MagicMock(id=1),
            tools=[mock_tool],
            cache_tools=[],
            turn_intent=TurnIntent.WRITE,
        )

        mock_tool.run.assert_called_once()
        self.assertTrue(result.tool_calls[0]["ok"])
