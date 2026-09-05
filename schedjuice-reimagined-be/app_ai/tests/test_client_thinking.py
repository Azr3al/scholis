from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app_ai.client import (
    OpenAIClient,
    _append_thinking_step,
    _extract_reasoning_summary_text,
)
from app_ai.pricing import TokenUsage
from app_ai.tests.openai_fakes import (
    fake_response,
    fake_usage,
    function_call_item,
    message_item,
    reasoning_item,
)
from app_ai.tools.intent import TurnIntent


class ExtractReasoningSummaryTests(SimpleTestCase):
    def test_joins_reasoning_summary_only(self):
        self.assertEqual(
            _extract_reasoning_summary_text(
                [reasoning_item("Plan: search courses"), message_item("Here is the answer")]
            ),
            "Plan: search courses",
        )

    def test_empty_when_no_reasoning_items(self):
        self.assertEqual(_extract_reasoning_summary_text([message_item("Answer only")]), "")


class AppendThinkingStepTests(SimpleTestCase):
    def test_skips_step_when_no_text_and_no_thinking_tokens(self):
        steps: list = []
        _append_thinking_step(
            steps,
            iteration=1,
            output_items=[function_call_item("get_course_roster", {"query": "CAE"})],
            usage=TokenUsage(thinking_tokens=0),
        )
        self.assertEqual(steps, [])

    def test_keeps_step_when_thinking_tokens_without_text(self):
        steps: list = []
        _append_thinking_step(
            steps,
            iteration=2,
            output_items=[function_call_item("get_course_roster", {"query": "CAE"})],
            usage=TokenUsage(thinking_tokens=42),
        )
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0]["iteration"], 2)
        self.assertEqual(steps[0]["text"], "")
        self.assertEqual(steps[0]["thinking_tokens"], 42)


@override_settings(OPENAI_API_KEY="test-key", AI_MAX_TOOL_ITERATIONS=1)
class OpenAIThinkingCaptureTests(SimpleTestCase):
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_final_response_includes_thinking_steps(self, mock_build, _usage):
        response = fake_response(
            [reasoning_item("Reason about roster"), message_item("The teacher is Alice.")],
            usage=fake_usage(
                input_tokens=100,
                output_tokens=35,
                reasoning=15,
            ),
        )
        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.responses.create.return_value = response

        result = OpenAIClient().generate_with_tools(
            "Who teaches Math?",
            user=MagicMock(id=1),
            tools=[],
            cache_tools=[],
            feature="telegram_query",
            max_iterations=1,
        )

        self.assertEqual(len(result.thinking_steps), 1)
        self.assertEqual(result.thinking_steps[0]["iteration"], 1)
        self.assertIn("Reason about roster", result.thinking_steps[0]["text"])
        self.assertEqual(result.thinking_steps[0]["thinking_tokens"], 15)
        self.assertEqual(result.text, "The teacher is Alice.")

    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_tool_loop_without_thought_text_omits_empty_steps(self, mock_build, _usage):
        response = fake_response(
            [function_call_item("get_course_roster", {"query": "CAE 36"})],
            usage=fake_usage(input_tokens=100, output_tokens=20),
        )
        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.responses.create.return_value = response

        with patch("app_ai.client.get_tool") as mock_get_tool:
            tool = MagicMock()
            tool.exposure = "read"
            tool.always_available = False
            tool.validate_args.return_value = {"query": "CAE 36"}
            tool.run.return_value = {"members": []}
            mock_get_tool.return_value = tool

            result = OpenAIClient().generate_with_tools(
                "who's the MT of CAE 36 ?",
                user=MagicMock(id=1),
                tools=[],
                cache_tools=[],
                feature="telegram_query",
                max_iterations=2,
            )

        self.assertEqual(result.outcome, "tool_limit_exceeded")
        self.assertEqual(result.iterations, 2)
        self.assertEqual(result.thinking_steps, [])

    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_request_uses_high_reasoning_effort(self, mock_build, _usage):
        response = fake_response(
            [message_item("ok")],
            usage=fake_usage(input_tokens=10, output_tokens=5),
        )
        mock_client = MagicMock()
        mock_build.return_value = mock_client
        mock_client.responses.create.return_value = response

        for intent in (TurnIntent.READ, TurnIntent.WRITE, None):
            mock_client.responses.create.reset_mock()
            OpenAIClient().generate_with_tools(
                "Who teaches Math?",
                user=MagicMock(id=1),
                tools=[],
                cache_tools=[],
                turn_intent=intent,
                feature="telegram_query",
                max_iterations=1,
            )
            _args, kwargs = mock_client.responses.create.call_args
            self.assertEqual(kwargs["reasoning"]["effort"], "high")
            self.assertEqual(kwargs["reasoning"]["summary"], "auto")
