import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.capability_gap.constants import CAPABILITY_GAP_DATA_NOT_EXPOSED
from app_ai.capability_gap.types import CapabilityGapResult
from app_ai.client import AIResult
from app_ai.failure_causes import LIKELY_CAUSE_TOOL_DESCRIPTIONS
from app_ai.models import AIRequestLog
from app_ai.request_log import record_request_log, truncate_text
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AIRequestLogModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.filter(schema_name="xschedjuice").first()

    def test_create_tool_limit_row(self):
        with schema_context(get_public_schema_name()):
            row = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=1,
                feature="telegram_query",
                channel_key="telegram:123",
                prompt="List every student in every course",
                response_text="I could not complete that request within the tool limit.",
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_iterations=5,
                tool_calls=[{"name": "search_courses", "ok": True, "error": ""}],
                model="gpt-test",
                total_tokens=1000,
                latency_ms=500,
                source=AIRequestLog.Source.LIVE,
            )
        self.assertEqual(row.outcome, "tool_limit_exceeded")
        self.assertEqual(row.feature, "telegram_query")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class RecordRequestLogTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.filter(schema_name="xschedjuice").first()

    def test_truncate_text(self):
        self.assertEqual(truncate_text("abc", 10), "abc")
        self.assertEqual(len(truncate_text("x" * 3000, 2000)), 2000)

    @patch("app_ai.request_log._resolve_tenant")
    def test_record_request_log_persists_tool_limit(self, mock_tenant):
        mock_tenant.return_value = self.org
        result = AIResult(
            text="I could not complete that request within the tool limit.",
            tool_calls=[{"name": "search_users", "ok": True, "error": ""}],
            model="gpt-test",
            iterations=5,
            outcome="tool_limit_exceeded",
            total_tokens=900,
            latency_ms=400,
        )
        row = record_request_log(
            user_id=42,
            feature="telegram_query",
            channel_key="telegram:99",
            prompt="Who teaches what?",
            result=result,
            outcome="tool_limit_exceeded",
        )
        self.assertIsNotNone(row)
        self.assertEqual(row.outcome, "tool_limit_exceeded")
        self.assertEqual(row.tool_iterations, 5)
        self.assertEqual(row.total_tokens, 900)

    @patch("app_ai.request_log._resolve_tenant")
    def test_record_request_log_persists_likely_causes_for_tool_limit(self, mock_tenant):
        mock_tenant.return_value = self.org
        result = AIResult(
            text="I could not complete that request within the tool limit.",
            tool_calls=[
                {"name": "adjust_staff_points", "ok": False, "error": "bad"},
                {"name": "adjust_staff_points", "ok": True, "error": ""},
            ],
            model="gpt-test",
            iterations=5,
            outcome="tool_limit_exceeded",
            total_tokens=900,
            latency_ms=400,
        )
        row = record_request_log(
            user_id=42,
            feature="telegram_query",
            channel_key="telegram:99",
            prompt="Adjust points",
            result=result,
            outcome="tool_limit_exceeded",
        )
        self.assertEqual(row.likely_causes, [LIKELY_CAUSE_TOOL_DESCRIPTIONS])

    @patch("app_ai.request_log._resolve_tenant")
    def test_record_request_log_empty_causes_for_success(self, mock_tenant):
        mock_tenant.return_value = self.org
        result = AIResult(
            text="done",
            tool_calls=[],
            model="gpt-test",
            iterations=1,
        )
        row = record_request_log(
            user_id=42,
            feature="telegram_query",
            channel_key="telegram:99",
            prompt="Hi",
            result=result,
            outcome="success",
        )
        self.assertEqual(row.likely_causes, [])

    @patch("app_ai.request_log._resolve_tenant")
    def test_record_request_log_persists_capability_gap(self, mock_tenant):
        mock_tenant.return_value = self.org
        result = AIResult(
            text="I have balances but no log.",
            tool_calls=[{"name": "get_staff_point_balances", "ok": True, "error": ""}],
            model="gpt-test",
            iterations=2,
            outcome="success",
        )
        gap = CapabilityGapResult(
            is_gap=True,
            capability_gaps=[CAPABILITY_GAP_DATA_NOT_EXPOSED],
            user_intent_summary="Point history",
            gap_reason="No history tool",
            domain="staff_points",
            suggested_surface="get_staff_point_history",
        )
        row = record_request_log(
            user_id=42,
            feature="telegram_query",
            channel_key="telegram:99",
            prompt="Why extra points?",
            result=result,
            outcome="success",
            capability_gap=gap,
        )
        self.assertEqual(row.outcome, "capability_gap")
        self.assertEqual(row.capability_gaps, [CAPABILITY_GAP_DATA_NOT_EXPOSED])
        self.assertEqual(row.capability_gap_intent, "Point history")

    @patch("app_ai.request_log._resolve_tenant")
    def test_record_request_log_persists_thinking_steps(self, mock_tenant):
        mock_tenant.return_value = self.org
        result = AIResult(
            text="Done.",
            thinking_steps=[
                {"iteration": 1, "text": "Search for course", "thinking_tokens": 50},
                {"iteration": 2, "text": "Fetch roster", "thinking_tokens": 30},
            ],
            model="gpt-5.6-luna",
            iterations=2,
            total_tokens=500,
            latency_ms=1200,
        )
        row = record_request_log(
            user_id=1,
            feature="telegram_query",
            channel_key="telegram:1",
            prompt="Who teaches Math 101?",
            result=result,
            outcome="success",
        )
        self.assertIsNotNone(row)
        self.assertEqual(len(row.thinking_steps), 2)
        self.assertEqual(row.thinking_steps[0]["iteration"], 1)
        self.assertEqual(row.thinking_steps[1]["thinking_tokens"], 30)
