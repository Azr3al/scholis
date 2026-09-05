from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from app_ai.client import OpenAIClient
from app_ai.tests.openai_fakes import fake_response, function_call_item, message_item


@override_settings(OPENAI_API_KEY="test-key")
class OpenAIHistoryTests(TestCase):
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_history_dynamic_context_and_inline_system(self, mock_build):
        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.responses.create.return_value = fake_response([message_item("ok")])

        OpenAIClient().generate_with_tools(
            "current question",
            user=MagicMock(id=1),
            history=[
                {"role": "user", "text": "first"},
                {"role": "model", "text": "answer one"},
            ],
            system_context="You assist Demo School.",
            dynamic_context="Current user info",
            feature="test",
        )

        call_kwargs = mock_client.responses.create.call_args.kwargs
        input_list = call_kwargs["input"]
        self.assertEqual(input_list[0]["role"], "developer")
        self.assertEqual(input_list[0]["content"][0]["text"], "You assist Demo School.")
        self.assertIn("Session context:", input_list[1]["content"])
        self.assertIn("Current user info", input_list[1]["content"])
        self.assertEqual(input_list[2]["role"], "user")
        self.assertEqual(input_list[2]["content"], "first")
        self.assertEqual(input_list[3]["role"], "assistant")
        self.assertEqual(input_list[3]["content"], "answer one")
        self.assertEqual(input_list[-1]["role"], "user")
        self.assertEqual(input_list[-1]["content"], "current question")

    @patch("app_ai.client.build_prompt_cache_key", return_value="sj:xschool:abc123")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_prompt_cache_key_and_breakpoint_when_org_present(
        self, mock_build, _mock_cache_key
    ):
        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.responses.create.return_value = fake_response([message_item("ok")])

        org = MagicMock(schema_name="xschool")
        OpenAIClient().generate_with_tools(
            "question",
            user=MagicMock(id=1),
            system_context="Static prompt",
            feature="test",
            org=org,
            tools=[MagicMock(name="search_users", description="x", parameters={})],
            cache_tools=[MagicMock(name="search_users", description="x", parameters={})],
        )

        call_kwargs = mock_client.responses.create.call_args.kwargs
        self.assertEqual(call_kwargs["prompt_cache_key"], "sj:xschool:abc123")
        self.assertEqual(
            call_kwargs["input"][0]["content"][0]["prompt_cache_breakpoint"],
            {"mode": "explicit"},
        )

    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.get_tool")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_function_call_output_round_trips_with_matching_call_id(
        self, mock_build, mock_get_tool, _usage
    ):
        mock_tool = MagicMock()
        mock_tool.exposure = "read"
        mock_tool.validate_args.return_value = {"query": "Math"}
        mock_tool.run.return_value = {"items": []}
        mock_get_tool.return_value = mock_tool

        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.responses.create.side_effect = [
            fake_response([function_call_item("search_courses", {"query": "Math"}, call_id="call_9")]),
            fake_response([message_item("Done.")]),
        ]

        OpenAIClient().generate_with_tools(
            "find Math courses",
            user=MagicMock(id=1),
            tools=[mock_tool],
            cache_tools=[],
            feature="test",
            max_iterations=2,
        )

        second_input = mock_client.responses.create.call_args_list[1].kwargs["input"]
        function_call_items = [
            item for item in second_input if getattr(item, "type", "") == "function_call"
        ]
        outputs = [
            item
            for item in second_input
            if (item.get("type") if isinstance(item, dict) else getattr(item, "type", ""))
            == "function_call_output"
        ]
        self.assertEqual(function_call_items[0].call_id, "call_9")
        self.assertEqual(outputs[0]["call_id"], "call_9")
