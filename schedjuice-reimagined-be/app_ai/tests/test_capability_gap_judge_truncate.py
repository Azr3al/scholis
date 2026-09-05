from django.test import TestCase

from app_ai.capability_gap.constants import (
    JUDGE_HISTORY_MODEL_MAX_CHARS,
    JUDGE_HISTORY_USER_MAX_CHARS,
    JUDGE_PROMPT_MAX_CHARS,
    JUDGE_RESPONSE_MAX_CHARS,
    JUDGE_TRUNCATION_SUFFIX,
)
from app_ai.capability_gap.truncate import truncate_judge_payload, truncate_judge_text


class TruncateJudgeTextTests(TestCase):
    def test_under_limit_unchanged(self):
        self.assertEqual(truncate_judge_text("hello", 500), "hello")

    def test_strips_whitespace(self):
        self.assertEqual(truncate_judge_text("  hi  ", 500), "hi")

    def test_empty_returns_empty(self):
        self.assertEqual(truncate_judge_text("", 500), "")
        self.assertEqual(truncate_judge_text(None, 500), "")

    def test_over_limit_exact_length_with_suffix(self):
        limit = 50
        long_text = "x" * 100
        result = truncate_judge_text(long_text, limit)
        self.assertEqual(len(result), limit)
        self.assertTrue(result.endswith(JUDGE_TRUNCATION_SUFFIX))

    def test_exactly_at_limit_no_suffix(self):
        text = "a" * 50
        self.assertEqual(truncate_judge_text(text, 50), text)


class TruncateJudgePayloadTests(TestCase):
    def test_current_turn_limits(self):
        payload = truncate_judge_payload(
            prompt="p" * 600,
            response_text="r" * 900,
            tool_calls=[],
            available_tool_names=[],
            conversation_history=None,
        )
        self.assertEqual(len(payload["prompt"]), JUDGE_PROMPT_MAX_CHARS)
        self.assertTrue(payload["prompt"].endswith(JUDGE_TRUNCATION_SUFFIX))
        self.assertEqual(len(payload["response_text"]), JUDGE_RESPONSE_MAX_CHARS)
        self.assertTrue(payload["response_text"].endswith(JUDGE_TRUNCATION_SUFFIX))

    def test_history_role_specific_limits(self):
        history = [
            {"role": "user", "text": "u" * 500},
            {"role": "model", "text": "m" * 700},
        ]
        payload = truncate_judge_payload(
            prompt="ok",
            response_text="ok",
            tool_calls=[],
            available_tool_names=[],
            conversation_history=history,
        )
        self.assertEqual(
            len(payload["conversation_history"][0]["text"]),
            JUDGE_HISTORY_USER_MAX_CHARS,
        )
        self.assertEqual(
            len(payload["conversation_history"][1]["text"]),
            JUDGE_HISTORY_MODEL_MAX_CHARS,
        )

    def test_unknown_history_role_uses_user_limit(self):
        payload = truncate_judge_payload(
            prompt="ok",
            response_text="ok",
            tool_calls=[],
            available_tool_names=[],
            conversation_history=[{"role": "system", "text": "s" * 500}],
        )
        self.assertEqual(
            len(payload["conversation_history"][0]["text"]),
            JUDGE_HISTORY_USER_MAX_CHARS,
        )

    def test_tool_fields_pass_through(self):
        tool_calls = [{"name": "search_courses", "ok": True, "error": ""}]
        names = ["search_courses", "search_users"]
        payload = truncate_judge_payload(
            prompt="ok",
            response_text="ok",
            tool_calls=tool_calls,
            available_tool_names=names,
            conversation_history=[],
        )
        self.assertIs(payload["tool_calls"], tool_calls)
        self.assertIs(payload["available_tool_names"], names)

    def test_none_history_becomes_empty_list(self):
        payload = truncate_judge_payload(
            prompt="ok",
            response_text="ok",
            tool_calls=[],
            available_tool_names=[],
            conversation_history=None,
        )
        self.assertEqual(payload["conversation_history"], [])
