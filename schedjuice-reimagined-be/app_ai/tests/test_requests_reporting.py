import unittest
from datetime import datetime, timezone

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIRequestLog
from app_ai.reporting import build_requests_list
from app_auth.models import User
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class BuildRequestsListTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)
        with schema_context(cls.schema_name):
            cls.user = User.objects.filter(is_active=True).first()

    def test_includes_all_outcomes_and_thinking_steps(self):
        created = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt="Hi",
                response_text="Hello",
                outcome=AIRequestLog.Outcome.SUCCESS,
                thinking_steps=[
                    {"iteration": 1, "text": "Greet user", "thinking_tokens": 5},
                ],
                model="gpt-test",
                created_at=created,
            )
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt="Blocked",
                response_text="Out of scope",
                outcome=AIRequestLog.Outcome.BLOCKED,
                created_at=created,
            )
        payload = build_requests_list(
            year=2026,
            month=7,
            tenant_id=self.org.id,
            outcome="all",
        )
        self.assertEqual(payload["total_count"], 2)
        self.assertEqual(payload["summary"]["by_outcome"]["success"], 1)
        self.assertEqual(payload["summary"]["by_outcome"]["blocked"], 1)
        success_item = next(
            item for item in payload["items"] if item["outcome"] == "success"
        )
        self.assertEqual(success_item["thinking_steps"][0]["text"], "Greet user")

    def test_feature_all_includes_ai_query(self):
        created = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="ai_query",
                prompt="Web question",
                response_text="Answer",
                outcome=AIRequestLog.Outcome.SUCCESS,
                created_at=created,
            )
        payload = build_requests_list(
            year=2026,
            month=7,
            tenant_id=self.org.id,
            feature="all",
        )
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["items"][0]["feature"], "ai_query")

    def test_outcome_filter(self):
        created = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt="ok",
                response_text="done",
                outcome=AIRequestLog.Outcome.SUCCESS,
                created_at=created,
            )
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt="fail",
                response_text="error",
                outcome=AIRequestLog.Outcome.ERROR,
                created_at=created,
            )
        payload = build_requests_list(
            year=2026,
            month=7,
            tenant_id=self.org.id,
            outcome="error",
        )
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["items"][0]["outcome"], "error")
