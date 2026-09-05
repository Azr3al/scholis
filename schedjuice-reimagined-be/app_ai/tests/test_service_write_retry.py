from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_ai.client import AIResult
from app_ai.service import AIService
from app_ai.tools.base import Tool
from app_ai.tools.intent import TurnIntent


class WriteIntentRetryTests(SimpleTestCase):
    @patch("app_ai.actor_context.build_actor_context", return_value="")
    @patch("app_ai.user_preferences.build_user_preferences_context", return_value="")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.record_request_log", return_value=None)
    @patch("app_ai.service.assert_user_quota_allows")
    @patch("app_ai.service.assert_quota_allows")
    @patch("app_ai.service.list_tools_for_cache")
    @patch("app_ai.service.list_tools_for_turn")
    @patch("app_ai.service.AIService._current_tenant")
    def test_read_turn_retries_when_write_tool_blocked(
        self,
        mock_tenant,
        mock_list_tools,
        mock_list_cache,
        _quota,
        _user_quota,
        _log,
        mock_guard,
        _prefs,
        _actor,
    ):
        org = MagicMock()
        org.is_ai_enabled = True
        org.schema_name = "xschedjuice"
        org.timezone = "UTC"
        org.ai_enabled_packs = []
        org.ai_school_context = ""
        org.ai_assistant_instructions = ""
        org.is_fm_hm_course_display_enabled = False
        org.name = "Test"
        mock_tenant.return_value = org
        mock_guard.return_value = MagicMock(allowed=True)

        read_tool = MagicMock(spec=Tool)
        read_tool.name = "search_users"
        write_tool = MagicMock(spec=Tool)
        write_tool.name = "adjust_staff_points"

        def tools_for_turn(*, intent, org):
            if intent == TurnIntent.READ:
                return [read_tool]
            return [read_tool, write_tool]

        mock_list_tools.side_effect = tools_for_turn
        mock_list_cache.return_value = [read_tool, write_tool]

        blocked_result = AIResult(
            text="Sorry, I cannot do that.",
            tool_calls=[
                {
                    "name": "adjust_staff_points",
                    "ok": False,
                    "error": "Tool not available for this turn.",
                }
            ],
            outcome="success",
        )
        success_result = AIResult(
            text="Added 1 point.",
            tool_calls=[
                {"name": "adjust_staff_points", "ok": True, "error": ""},
            ],
            outcome="success",
        )
        client = MagicMock()
        client.generate_with_tools.side_effect = [blocked_result, success_result]

        user = MagicMock()
        user.id = 1
        result = AIService(client=client).run(
            "how many students",
            user,
            feature="telegram_query",
        )

        self.assertEqual(client.generate_with_tools.call_count, 2)
        first_call = client.generate_with_tools.call_args_list[0]
        second_call = client.generate_with_tools.call_args_list[1]
        self.assertEqual(first_call.kwargs["turn_intent"], TurnIntent.READ)
        self.assertEqual(second_call.kwargs["turn_intent"], TurnIntent.WRITE)
        self.assertIn(write_tool, second_call.kwargs["tools"])
        self.assertEqual(result.text, "Added 1 point.")

    @patch("app_ai.actor_context.build_actor_context", return_value="")
    @patch("app_ai.user_preferences.build_user_preferences_context", return_value="")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.record_request_log", return_value=None)
    @patch("app_ai.service.assert_user_quota_allows")
    @patch("app_ai.service.assert_quota_allows")
    @patch("app_ai.service.list_tools_for_cache")
    @patch("app_ai.service.list_tools_for_turn")
    @patch("app_ai.service.AIService._current_tenant")
    def test_read_turn_does_not_retry_without_blocked_write_tool(
        self,
        mock_tenant,
        mock_list_tools,
        mock_list_cache,
        _quota,
        _user_quota,
        _log,
        mock_guard,
        _prefs,
        _actor,
    ):
        org = MagicMock()
        org.is_ai_enabled = True
        org.schema_name = "xschedjuice"
        org.timezone = "UTC"
        org.ai_enabled_packs = []
        org.ai_school_context = ""
        org.ai_assistant_instructions = ""
        org.is_fm_hm_course_display_enabled = False
        org.name = "Test"
        mock_tenant.return_value = org
        mock_guard.return_value = MagicMock(allowed=True)

        read_tool = MagicMock(spec=Tool)
        read_tool.name = "search_users"
        mock_list_tools.return_value = [read_tool]
        mock_list_cache.return_value = [read_tool]

        read_result = AIResult(
            text="There are 100 students.",
            tool_calls=[{"name": "search_users", "ok": True, "error": ""}],
            outcome="success",
        )
        client = MagicMock()
        client.generate_with_tools.return_value = read_result

        user = MagicMock()
        user.id = 1
        result = AIService(client=client).run(
            "how many students",
            user,
            feature="telegram_query",
        )

        client.generate_with_tools.assert_called_once()
        self.assertEqual(result.text, "There are 100 students.")
