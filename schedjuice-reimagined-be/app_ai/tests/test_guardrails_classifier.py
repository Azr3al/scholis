from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from app_ai.client import OpenAIClient
from app_ai.tests.openai_fakes import fake_response, message_item


@override_settings(OPENAI_API_KEY="test-key")
class ClassifierClientThinkingTests(TestCase):
    @patch("app_ai.client.record_usage")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_uses_low_reasoning_effort(self, mock_build, _usage):
        mock_client = MagicMock()
        mock_client.responses.create.return_value = fake_response(
            [message_item('{"allowed": true, "reason": "ok"}')]
        )
        mock_build.return_value = mock_client

        OpenAIClient().classify_prompt_scope(
            "find Sarah",
            org_name="Demo School",
            user=MagicMock(id=1),
        )

        _args, kwargs = mock_client.responses.create.call_args
        self.assertEqual(kwargs["reasoning"]["effort"], "low")
        self.assertNotIn("summary", kwargs["reasoning"])
        self.assertEqual(kwargs["text"]["format"]["type"], "json_schema")
        self.assertTrue(kwargs["text"]["format"]["strict"])
