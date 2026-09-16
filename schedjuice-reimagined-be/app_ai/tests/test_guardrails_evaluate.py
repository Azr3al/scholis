from unittest.mock import MagicMock, patch

from django.test import TestCase

from app_ai.guardrails import evaluate_prompt
from app_organization.models import Organization


class EvaluatePromptTests(TestCase):
    def setUp(self):
        self.org = Organization(
            name="Teacher Su International School",
            schema_name="xschedjuice",
        )
        self.user = MagicMock(id=1)

    @patch("app_ai.guardrails.check_ai_rate_limit", return_value=(True, 0))
    def test_math_blocked_without_classifier(self, _mock_rl):
        result = evaluate_prompt("what is 2 + 2525", user=self.user, org=self.org)
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "heuristic_reject")
        self.assertIn("Teacher Su International School", result.message or "")

    @patch("app_ai.guardrails.classify_prompt")
    @patch("app_ai.guardrails.check_ai_rate_limit", return_value=(True, 0))
    def test_uncertain_calls_classifier(self, _mock_rl, mock_classify):
        mock_classify.return_value = {"allowed": True, "reason": "ok"}
        result = evaluate_prompt("find Sarah", user=self.user, org=self.org)
        self.assertTrue(result.allowed)
        mock_classify.assert_called_once()

    @patch("app_ai.guardrails.check_ai_rate_limit", return_value=(False, 120))
    def test_rate_limited(self, _mock_rl):
        result = evaluate_prompt("find students", user=self.user, org=self.org)
        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, "rate_limited")
        self.assertEqual(result.retry_after_seconds, 120)
