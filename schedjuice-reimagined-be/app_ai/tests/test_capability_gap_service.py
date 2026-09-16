import unittest
from datetime import date
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.capability_gap.constants import CAPABILITY_GAP_DATA_NOT_EXPOSED
from app_ai.client import AIResult
from app_ai.models import AIRequestLog
from app_ai.service import AIService
from app_auth.models import User
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CapabilityGapServiceTests(TestCase):
    schema = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema):
            self.user = User.objects.create_user(
                email=f"cap-{suffix}@example.com",
                password="x",
                name="Cap User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema)
            self.org.is_ai_enabled = True
            self.org.save(update_fields=["is_ai_enabled"])

    @patch("app_ai.tasks.judge_request_log_capability_gap")
    @patch("app_ai.service.record_request_log")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.AIService._current_tenant")
    @patch("app_ai.service.list_tools_for_turn")
    def test_success_enqueues_async_judge(
        self,
        mock_list_tools,
        mock_tenant,
        mock_guard,
        mock_log,
        mock_judge_task,
    ):
        from app_ai.tools.base import Tool

        mock_tool = MagicMock(spec=Tool)
        mock_tool.name = "get_staff_point_balances"
        mock_list_tools.return_value = [mock_tool]
        mock_tenant.return_value = self.org
        mock_guard.return_value = MagicMock(allowed=True)
        mock_row = MagicMock(id=42)
        mock_log.return_value = mock_row
        client = MagicMock()
        client.generate_with_tools.return_value = AIResult(
            text="I have balances but no log.",
            tool_calls=[{"name": "get_staff_point_balances", "ok": True, "error": ""}],
            outcome="success",
        )
        with schema_context(self.schema):
            AIService(client=client).run(
                "why extra points?",
                self.user,
                feature="telegram_query",
                channel_key="tg:1",
            )
        mock_log.assert_called_once()
        self.assertEqual(
            mock_log.call_args.kwargs["outcome"],
            AIRequestLog.Outcome.SUCCESS,
        )
        self.assertNotIn("capability_gap", mock_log.call_args.kwargs)
        mock_judge_task.delay.assert_called_once_with(
            42,
            self.org.schema_name,
            ["get_staff_point_balances"],
        )

    @patch("app_ai.tasks.judge_request_log_capability_gap")
    @patch("app_ai.service.record_request_log")
    @patch("app_ai.service.evaluate_prompt")
    @patch("app_ai.service.AIService._current_tenant")
    def test_tool_limit_skips_judge_enqueue(
        self,
        mock_tenant,
        mock_guard,
        mock_log,
        mock_judge_task,
    ):
        mock_tenant.return_value = self.org
        mock_guard.return_value = MagicMock(allowed=True)
        client = MagicMock()
        client.generate_with_tools.return_value = AIResult(
            text="I could not complete that request within the tool limit.",
            outcome="tool_limit_exceeded",
        )
        with schema_context(self.schema):
            AIService(client=client).run(
                "complex question",
                self.user,
                feature="telegram_query",
            )
        mock_judge_task.delay.assert_not_called()
