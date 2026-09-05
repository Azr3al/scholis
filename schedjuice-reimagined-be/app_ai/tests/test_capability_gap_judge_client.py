import json
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from app_ai.client import OpenAIClient
from app_ai.tests.openai_fakes import fake_response, message_item


@override_settings(OPENAI_API_KEY="test-key")
class CapabilityGapJudgeClientTests(TestCase):
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_payload_includes_conversation_history(self, mock_build, _usage):
        mock_client = MagicMock()
        mock_client.responses.create.return_value = fake_response(
            [message_item('{"is_capability_gap": false, "capability_gaps": [], '
             '"user_intent_summary": "", "gap_reason": "", '
             '"suggested_surface": "", "domain": ""}')]
        )
        mock_build.return_value = mock_client

        history = [{"role": "user", "text": "June KET?"}]
        OpenAIClient().judge_capability_gap(
            prompt="what about KET to CAE",
            response_text="list...",
            tool_calls=[],
            available_tool_names=["search_courses"],
            conversation_history=history,
            org_name="Demo School",
            user=MagicMock(id=1),
        )

        _args, kwargs = mock_client.responses.create.call_args
        instructions = kwargs["instructions"].lower()
        self.assertIn("conversation_history", instructions)
        self.assertIn("follow-up", instructions)
        user_content = kwargs["input"][0]["content"]
        payload = json.loads(user_content)
        self.assertEqual(payload["conversation_history"], history)

    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_payload_truncates_long_text_fields(self, mock_build, _usage):
        mock_client = MagicMock()
        mock_client.responses.create.return_value = fake_response(
            [message_item('{"is_capability_gap": false, "capability_gaps": [], '
             '"user_intent_summary": "", "gap_reason": "", '
             '"suggested_surface": "", "domain": ""}')]
        )
        mock_build.return_value = mock_client

        long_history = [{"role": "user", "text": "h" * 1000}]
        OpenAIClient().judge_capability_gap(
            prompt="p" * 1000,
            response_text="r" * 2000,
            tool_calls=[{"name": "search_courses", "ok": True, "error": ""}],
            available_tool_names=["search_courses"],
            conversation_history=long_history,
            org_name="Demo School",
            user=MagicMock(id=1),
        )

        user_content = mock_client.responses.create.call_args.kwargs["input"][0]["content"]
        payload = json.loads(user_content)
        self.assertLessEqual(len(payload["prompt"]), 500)
        self.assertLessEqual(len(payload["response_text"]), 800)
        self.assertLessEqual(len(payload["conversation_history"][0]["text"]), 400)
        self.assertEqual(
            payload["tool_calls"],
            [{"name": "search_courses", "ok": True, "error": ""}],
        )

    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_system_prompt_mentions_truncation(self, mock_build, _usage):
        mock_client = MagicMock()
        mock_client.responses.create.return_value = fake_response(
            [message_item('{"is_capability_gap": false, "capability_gaps": [], '
             '"user_intent_summary": "", "gap_reason": "", '
             '"suggested_surface": "", "domain": ""}')]
        )
        mock_build.return_value = mock_client

        OpenAIClient().judge_capability_gap(
            prompt="ok",
            response_text="ok",
            tool_calls=[],
            available_tool_names=[],
            conversation_history=[],
            org_name="Demo School",
            user=MagicMock(id=1),
        )

        system = mock_client.responses.create.call_args.kwargs["instructions"].lower()
        self.assertIn("truncated", system)
        self.assertIn("missing list rows", system)

    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_uses_medium_reasoning_effort(self, mock_build, _usage):
        mock_client = MagicMock()
        mock_client.responses.create.return_value = fake_response(
            [message_item('{"is_capability_gap": false, "capability_gaps": [], '
             '"user_intent_summary": "", "gap_reason": "", '
             '"suggested_surface": "", "domain": ""}')]
        )
        mock_build.return_value = mock_client

        OpenAIClient().judge_capability_gap(
            prompt="ok",
            response_text="ok",
            tool_calls=[],
            available_tool_names=[],
            conversation_history=[],
            org_name="Demo School",
            user=MagicMock(id=1),
        )

        kwargs = mock_client.responses.create.call_args.kwargs
        self.assertEqual(kwargs["reasoning"]["effort"], "medium")
        self.assertNotIn("summary", kwargs["reasoning"])
