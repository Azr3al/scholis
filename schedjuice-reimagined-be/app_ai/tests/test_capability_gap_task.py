import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.capability_gap.constants import CAPABILITY_GAP_DATA_NOT_EXPOSED
from app_ai.capability_gap.types import CapabilityGapResult
from app_ai.models import AIRequestLog
from app_ai.tasks import judge_request_log_capability_gap
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CapabilityGapTaskTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.filter(prompt="async_judge_task_test").delete()
            self.row = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=1,
                feature="telegram_query",
                channel_key="telegram:123",
                prompt="async_judge_task_test",
                response_text="I have balances but no log.",
                outcome=AIRequestLog.Outcome.SUCCESS,
                tool_calls=[
                    {"name": "get_staff_point_balances", "ok": True, "error": ""}
                ],
                created_at=datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc),
            )

    @patch("app_ai.tasks.judge_capability_gap")
    def test_updates_row_when_judge_finds_gap(self, mock_judge):
        mock_judge.return_value = CapabilityGapResult(
            is_gap=True,
            capability_gaps=[CAPABILITY_GAP_DATA_NOT_EXPOSED],
            user_intent_summary="Point history",
            gap_reason="No history tool",
            domain="staff_points",
            suggested_surface="get_staff_point_history",
        )
        judge_request_log_capability_gap(
            self.row.id,
            self.schema_name,
            ["get_staff_point_balances"],
        )
        with schema_context(get_public_schema_name()):
            self.row.refresh_from_db()
        self.assertEqual(self.row.outcome, AIRequestLog.Outcome.CAPABILITY_GAP)
        self.assertEqual(self.row.capability_gaps, [CAPABILITY_GAP_DATA_NOT_EXPOSED])
        self.assertEqual(self.row.capability_gap_intent, "Point history")

    @patch("app_ai.tasks.judge_capability_gap")
    def test_no_update_when_judge_finds_no_gap(self, mock_judge):
        mock_judge.return_value = CapabilityGapResult.none()
        judge_request_log_capability_gap(
            self.row.id,
            self.schema_name,
            ["get_staff_point_balances"],
        )
        with schema_context(get_public_schema_name()):
            self.row.refresh_from_db()
        self.assertEqual(self.row.outcome, AIRequestLog.Outcome.SUCCESS)
        self.assertEqual(self.row.capability_gaps, [])

    @patch("app_ai.tasks.judge_capability_gap")
    def test_no_op_when_outcome_already_changed(self, mock_judge):
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.filter(id=self.row.id).update(
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED
            )
        mock_judge.return_value = CapabilityGapResult(
            is_gap=True,
            capability_gaps=[CAPABILITY_GAP_DATA_NOT_EXPOSED],
        )
        judge_request_log_capability_gap(
            self.row.id,
            self.schema_name,
            ["get_staff_point_balances"],
        )
        mock_judge.assert_not_called()

    @patch("app_ai.tasks.judge_capability_gap")
    def test_fail_open_on_judge_exception(self, mock_judge):
        mock_judge.side_effect = RuntimeError("api down")
        judge_request_log_capability_gap(
            self.row.id,
            self.schema_name,
            ["get_staff_point_balances"],
        )
        with schema_context(get_public_schema_name()):
            self.row.refresh_from_db()
        self.assertEqual(self.row.outcome, AIRequestLog.Outcome.SUCCESS)

    @patch("app_ai.tasks.build_judge_history_for_request_log")
    @patch("app_ai.tasks.judge_capability_gap")
    def test_passes_conversation_history_to_judge(self, mock_judge, mock_history):
        mock_history.return_value = [{"role": "user", "text": "prior"}]
        mock_judge.return_value = CapabilityGapResult.none()
        judge_request_log_capability_gap(
            self.row.id,
            self.schema_name,
            ["get_staff_point_balances"],
        )
        mock_history.assert_called_once()
        _, kwargs = mock_judge.call_args
        self.assertEqual(
            kwargs["conversation_history"], [{"role": "user", "text": "prior"}]
        )
