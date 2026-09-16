import unittest
from datetime import datetime, timedelta, timezone

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.capability_gap.history import build_judge_history_for_request_log
from app_ai.models import AIRequestLog
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CapabilityGapHistoryTests(TestCase):
    schema_name = "xschedjuice"
    channel = "telegram:999001"

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)
            cls.org.ai_max_context_turns = 2
            cls.org.save(update_fields=["ai_max_context_turns"])

    def _create_row(self, *, prompt: str, response: str, offset_minutes: int) -> AIRequestLog:
        base = datetime(2026, 7, 6, 12, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            return AIRequestLog.objects.create(
                tenant=self.org,
                user_id=42,
                feature="telegram_query",
                channel_key=self.channel,
                prompt=prompt,
                response_text=response,
                outcome=AIRequestLog.Outcome.SUCCESS,
                created_at=base + timedelta(minutes=offset_minutes),
            )

    def test_returns_empty_for_non_telegram_feature(self):
        row = self._create_row(prompt="hi", response="hello", offset_minutes=0)
        row.feature = "ai_query"
        history = build_judge_history_for_request_log(row, self.org)
        self.assertEqual(history, [])

    def test_returns_empty_when_no_prior_rows(self):
        row = self._create_row(prompt="what about KET", response="...", offset_minutes=10)
        history = build_judge_history_for_request_log(row, self.org)
        self.assertEqual(history, [])

    def test_builds_oldest_first_user_model_pairs(self):
        self._create_row(
            prompt="June KET enrollment?",
            response="KET has 50 students.",
            offset_minutes=0,
        )
        current = self._create_row(
            prompt="what about KET to CAE",
            response="KET/PET/CAE list...",
            offset_minutes=10,
        )
        history = build_judge_history_for_request_log(current, self.org)
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "user")
        self.assertEqual(history[0]["text"], "June KET enrollment?")
        self.assertEqual(history[1]["role"], "model")
        self.assertEqual(history[1]["text"], "KET has 50 students.")

    def test_caps_at_org_max_context_turns(self):
        self._create_row(prompt="turn1", response="r1", offset_minutes=0)
        self._create_row(prompt="turn2", response="r2", offset_minutes=5)
        self._create_row(prompt="turn3", response="r3", offset_minutes=10)
        current = self._create_row(prompt="turn4", response="r4", offset_minutes=15)
        history = build_judge_history_for_request_log(current, self.org)
        self.assertEqual(len(history), 4)
        self.assertEqual(history[0]["text"], "turn2")
        self.assertEqual(history[-1]["text"], "r3")

    def test_skips_empty_model_turn(self):
        self._create_row(prompt="blocked?", response="", offset_minutes=0)
        current = self._create_row(prompt="follow up", response="ok", offset_minutes=5)
        history = build_judge_history_for_request_log(current, self.org)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["role"], "user")
