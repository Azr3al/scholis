from unittest.mock import MagicMock, patch

from django.test import TestCase

from app_ai.capability_gap.constants import (
    CAPABILITY_GAP_DATA_NOT_EXPOSED,
    CAPABILITY_GAP_UNKNOWN,
)
from app_ai.capability_gap.judge import judge_capability_gap
from app_ai.capability_gap.types import CapabilityGapResult
from app_organization.models import Organization

class CapabilityGapJudgeTests(TestCase):
    @patch("app_ai.capability_gap.classifier.OpenAIClient")
    def test_gap_detected(self, MockClient):
        MockClient.return_value.judge_capability_gap.return_value = {
            "is_capability_gap": True,
            "capability_gaps": [CAPABILITY_GAP_DATA_NOT_EXPOSED],
            "user_intent_summary": "Point adjustment history",
            "gap_reason": "No history tool",
            "suggested_surface": "get_staff_point_history",
            "domain": "staff_points",
        }
        org = Organization(name="Demo School", schema_name="demo")
        result = judge_capability_gap(
            prompt="why extra points?",
            response_text="I have balances but no log.",
            tool_calls=[{"name": "get_staff_point_balances", "ok": True, "error": ""}],
            available_tool_names=["get_staff_point_balances"],
            org=org,
            user=MagicMock(id=1),
        )
        self.assertTrue(result.is_gap)
        self.assertEqual(result.capability_gaps, [CAPABILITY_GAP_DATA_NOT_EXPOSED])
        self.assertEqual(result.domain, "staff_points")

    @patch("app_ai.capability_gap.classifier.OpenAIClient")
    def test_empty_gaps_coerced_to_unknown(self, MockClient):
        MockClient.return_value.judge_capability_gap.return_value = {
            "is_capability_gap": True,
            "capability_gaps": [],
        }
        org = Organization(name="Demo School", schema_name="demo")
        result = judge_capability_gap(
            prompt="q",
            response_text="r",
            tool_calls=[],
            available_tool_names=[],
            org=org,
            user=MagicMock(id=1),
        )
        self.assertEqual(result.capability_gaps, [CAPABILITY_GAP_UNKNOWN])

    @patch("app_ai.capability_gap.classifier.OpenAIClient")
    def test_fail_open_on_exception(self, MockClient):
        MockClient.return_value.judge_capability_gap.side_effect = RuntimeError("api down")
        org = Organization(name="Demo School", schema_name="demo")
        result = judge_capability_gap(
            prompt="q",
            response_text="r",
            tool_calls=[],
            available_tool_names=[],
            org=org,
            user=MagicMock(id=1),
        )
        self.assertFalse(result.is_gap)

    @patch("app_ai.capability_gap.classifier.OpenAIClient")
    def test_forwards_conversation_history(self, MockClient):
        MockClient.return_value.judge_capability_gap.return_value = {
            "is_capability_gap": False,
            "capability_gaps": [],
        }
        org = Organization(name="Demo School", schema_name="demo")
        history = [
            {"role": "user", "text": "June KET?"},
            {"role": "model", "text": "50 students"},
        ]
        judge_capability_gap(
            prompt="what about KET to CAE",
            response_text="KET/PET/CAE...",
            tool_calls=[],
            available_tool_names=["search_courses"],
            conversation_history=history,
            org=org,
            user=MagicMock(id=1),
        )
        _, kwargs = MockClient.return_value.judge_capability_gap.call_args
        self.assertEqual(kwargs["conversation_history"], history)
