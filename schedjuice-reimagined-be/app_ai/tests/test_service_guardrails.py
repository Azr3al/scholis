from unittest.mock import MagicMock, patch

from django.test import TestCase

from app_ai.exceptions import AIPromptBlocked, AIRateLimited
from app_ai.service import AIService
from app_organization.models import Organization


class AIServiceGuardrailTests(TestCase):
    @patch("app_ai.service.AIService._current_tenant")
    @patch("app_ai.service.evaluate_prompt")
    def test_blocked_prompt_raises(self, mock_eval, mock_tenant):
        org = Organization(
            name="SDEC International School",
            schema_name="xschedjuice",
            is_ai_enabled=True,
        )
        mock_tenant.return_value = org
        mock_eval.return_value = MagicMock(
            allowed=False,
            reason="heuristic_reject",
            message=(
                "I can only help with SDEC International School operations — "
                "things like students, staff, courses, schedules, and attendance. "
                "Try rephrasing your question."
            ),
            retry_after_seconds=None,
        )
        with self.assertRaises(AIPromptBlocked) as ctx:
            AIService(client=MagicMock()).run("what is 2+2", MagicMock(id=1))
        self.assertIn("SDEC International School", str(ctx.exception.message))

    @patch("app_ai.service.AIService._current_tenant")
    @patch("app_ai.service.evaluate_prompt")
    def test_rate_limited_raises(self, mock_eval, mock_tenant):
        org = Organization(name="Demo", schema_name="xschedjuice", is_ai_enabled=True)
        mock_tenant.return_value = org
        mock_eval.return_value = MagicMock(
            allowed=False,
            reason="rate_limited",
            message="slow down",
            retry_after_seconds=60,
        )
        with self.assertRaises(AIRateLimited):
            AIService(client=MagicMock()).run("find students", MagicMock(id=1))
