import unittest
from datetime import datetime, timezone

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.failure_causes import LIKELY_CAUSE_TOOL_DESCRIPTIONS, LIKELY_CAUSE_UNKNOWN
from app_ai.models import AIRequestLog
from app_ai.reporting import (
    _apply_failures_resolution_filter,
    build_failures_list,
)
from app_auth.models import User
from app_organization.models import Organization
from app_telegram.models import TelegramAIExchange


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


TOOL_LIMIT_TEXT = "I could not complete that request within the tool limit."


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class BuildFailuresListTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)
        with schema_context(cls.schema_name):
            cls.user = User.objects.filter(is_active=True).first()

    def test_lists_tool_limit_rows_for_month(self):
        created = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                channel_key="telegram:1",
                prompt="List all courses and rosters",
                response_text=TOOL_LIMIT_TEXT,
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_iterations=5,
                tool_calls=[{"name": "search_courses", "ok": True, "error": ""}],
                model="gpt-test",
                total_tokens=500,
                latency_ms=300,
                created_at=created,
            )
        payload = build_failures_list(
            year=2026,
            month=6,
            outcome="tool_limit_exceeded",
            feature="telegram_query",
            tenant_id=None,
            page=1,
            page_size=25,
        )
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["items"][0]["prompt"], "List all courses and rosters")
        self.assertEqual(
            payload["items"][0]["user_display_name"],
            self.user.name or self.user.email,
        )

    def test_includes_likely_causes_in_items(self):
        created = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt="retry",
                response_text=TOOL_LIMIT_TEXT,
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_calls=[
                    {"name": "adjust_staff_points", "ok": False, "error": "x"},
                    {"name": "adjust_staff_points", "ok": True, "error": ""},
                ],
                likely_causes=[LIKELY_CAUSE_TOOL_DESCRIPTIONS],
                created_at=created,
            )
        payload = build_failures_list(year=2026, month=6)
        self.assertEqual(payload["items"][0]["likely_causes"], [LIKELY_CAUSE_TOOL_DESCRIPTIONS])
        self.assertIn("by_likely_cause", payload["summary"])

    def test_filter_by_likely_cause(self):
        created = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt="a",
                response_text=TOOL_LIMIT_TEXT,
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                likely_causes=[LIKELY_CAUSE_TOOL_DESCRIPTIONS],
                created_at=created,
            )
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt="b",
                response_text=TOOL_LIMIT_TEXT,
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                likely_causes=[LIKELY_CAUSE_UNKNOWN],
                source=AIRequestLog.Source.BACKFILL,
                created_at=created,
            )
        payload = build_failures_list(
            year=2026,
            month=6,
            likely_cause=LIKELY_CAUSE_TOOL_DESCRIPTIONS,
        )
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["items"][0]["prompt"], "a")

    def test_sort_by_tool_iterations(self):
        created = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt="low",
                response_text=TOOL_LIMIT_TEXT,
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_iterations=2,
                created_at=created,
            )
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt="high",
                response_text=TOOL_LIMIT_TEXT,
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_iterations=9,
                created_at=created,
            )
        payload = build_failures_list(year=2026, month=6, sort="-tool_iterations")
        self.assertEqual(payload["items"][0]["prompt"], "high")

    def test_resolution_open_excludes_resolved_rows(self):
        created = datetime(2026, 6, 30, 23, 59, tzinfo=timezone.utc)
        prompt_open = "resolution-open-test"
        prompt_resolved = "resolution-resolved-test"
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.filter(
                prompt__in=[prompt_open, prompt_resolved]
            ).delete()
            open_row = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt=prompt_open,
                response_text=TOOL_LIMIT_TEXT,
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                created_at=created,
            )
            resolved_row = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt=prompt_resolved,
                response_text=TOOL_LIMIT_TEXT,
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                resolved_at=created,
                resolved_by_user_id=self.user.id,
                created_at=created,
            )
            row_ids = [open_row.id, resolved_row.id]
            scoped = AIRequestLog.objects.filter(id__in=row_ids)
            open_prompts = set(
                _apply_failures_resolution_filter(scoped, "open").values_list(
                    "prompt", flat=True
                )
            )
            resolved_prompts = set(
                _apply_failures_resolution_filter(scoped, "resolved").values_list(
                    "prompt", flat=True
                )
            )
            all_prompts = set(
                _apply_failures_resolution_filter(scoped, "all").values_list(
                    "prompt", flat=True
                )
            )
        self.assertEqual(open_prompts, {prompt_open})
        self.assertEqual(resolved_prompts, {prompt_resolved})
        self.assertEqual(all_prompts, {prompt_open, prompt_resolved})

        from app_ai.reporting import serialize_request_log_failure_item

        with schema_context(get_public_schema_name()):
            resolved_item = serialize_request_log_failure_item(
                AIRequestLog.objects.get(prompt=prompt_resolved)
            )
        self.assertIsNotNone(resolved_item["resolved_at"])
        self.assertEqual(resolved_item["resolved_by_user_id"], self.user.id)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class BackfillRequestLogsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)
        with schema_context(cls.schema_name):
            cls.user = User.objects.filter(is_active=True).first()

    def test_backfill_creates_request_log_from_exchange(self):
        with schema_context(self.schema_name):
            TelegramAIExchange.objects.create(
                user=self.user,
                chat_id=999,
                user_message_id=1,
                bot_message_id=2,
                user_text="List every student",
                bot_text=TOOL_LIMIT_TEXT,
            )
        call_command("backfill_ai_request_logs_from_telegram", schema=self.schema_name)
        with schema_context(get_public_schema_name()):
            row = AIRequestLog.objects.get(prompt="List every student")
        self.assertEqual(row.outcome, "tool_limit_exceeded")
        self.assertEqual(row.source, "backfill")
        self.assertEqual(row.tool_calls, [])
