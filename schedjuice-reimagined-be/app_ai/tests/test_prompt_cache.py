from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from app_ai.prompt_cache import (
    build_prompt_cache_key,
    bump_org_prompt_cache_version,
    prompt_cache_signature,
)


class PromptCacheKeyTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_signature_stable_for_same_inputs(self):
        org = MagicMock(schema_name="xschool")
        tools = [{"name": "search_users", "description": "x", "parameters": {}}]
        sig_a = prompt_cache_signature(model_name="gpt-5.6-luna", org=org, tool_declarations=tools)
        sig_b = prompt_cache_signature(model_name="gpt-5.6-luna", org=org, tool_declarations=tools)
        self.assertEqual(sig_a, sig_b)

    def test_key_rotates_after_version_bump(self):
        org = MagicMock(schema_name="xschool")
        tools = [{"name": "search_users", "description": "x", "parameters": {}}]
        before = build_prompt_cache_key(
            model_name="gpt-5.6-luna", org=org, tool_declarations=tools
        )
        bump_org_prompt_cache_version(org)
        after = build_prompt_cache_key(
            model_name="gpt-5.6-luna", org=org, tool_declarations=tools
        )
        self.assertNotEqual(before, after)

    @override_settings(AI_PROMPT_CACHE_ENABLED=False)
    def test_returns_none_when_disabled(self):
        org = MagicMock(schema_name="xschool")
        tools = [{"name": "search_users", "description": "x", "parameters": {}}]
        self.assertIsNone(
            build_prompt_cache_key(
                model_name="gpt-5.6-luna", org=org, tool_declarations=tools
            )
        )

    def test_returns_none_without_tools(self):
        org = MagicMock(schema_name="xschool")
        self.assertIsNone(
            build_prompt_cache_key(model_name="gpt-5.6-luna", org=org, tool_declarations=[])
        )

    @override_settings(OPENAI_API_KEY="test-key")
    @patch("app_ai.client.build_prompt_cache_key", return_value="sj:xschool:abc")
    @patch("app_ai.client.OpenAIClient._build_client")
    def test_client_places_breakpoint_on_system_block(self, mock_build, _mock_key):
        from app_ai.client import OpenAIClient
        from app_ai.tests.openai_fakes import fake_response, message_item

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

        system_block = mock_client.responses.create.call_args.kwargs["input"][0]["content"][0]
        self.assertEqual(system_block["prompt_cache_breakpoint"], {"mode": "explicit"})
