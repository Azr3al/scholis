import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIRequestLog, AIUsageLog
from app_ai.reporting import build_ai_usage_analytics
from app_auth.models import User
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AIUsageAnalyticsReportingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            self.user_a = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="User A",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.user_b = User.objects.create_user(
                email=f"b-{uuid4().hex[:6]}@e.com",
                password="x",
                name="User B",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

        with schema_context(get_public_schema_name()):
            log_a = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user_a.id,
                feature="telegram_query",
                channel_key="telegram:1",
                prompt="first",
                response_text="ok",
                outcome=AIRequestLog.Outcome.SUCCESS,
                model="gpt-test",
                total_tokens=100,
            )
            AIRequestLog.objects.filter(pk=log_a.pk).update(
                created_at=datetime(2026, 7, 10, 12, 0, tzinfo=timezone.utc),
            )
            log_b = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user_b.id,
                feature="telegram_query",
                channel_key="telegram:2",
                prompt="second",
                response_text="",
                outcome=AIRequestLog.Outcome.CAPABILITY_GAP,
                model="gpt-test",
                total_tokens=200,
            )
            AIRequestLog.objects.filter(pk=log_b.pk).update(
                created_at=datetime(2026, 7, 10, 14, 0, tzinfo=timezone.utc),
            )
            log_c = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user_b.id,
                feature="telegram_query",
                channel_key="telegram:3",
                prompt="third",
                response_text="ok",
                outcome=AIRequestLog.Outcome.SUCCESS,
                model="gpt-test",
                total_tokens=50,
            )
            AIRequestLog.objects.filter(pk=log_c.pk).update(
                created_at=datetime(2026, 7, 15, 9, 0, tzinfo=timezone.utc),
            )
            usage_a = AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.user_a.id,
                feature="telegram_query",
                model="gpt-test",
                pricing_version="v1",
                billed_cost_usd=Decimal("0.05000000"),
                total_tokens=100,
            )
            AIUsageLog.objects.filter(pk=usage_a.pk).update(
                created_at=datetime(2026, 7, 10, 12, 0, tzinfo=timezone.utc),
            )

    def test_daily_zero_fills_inactive_days(self):
        payload = build_ai_usage_analytics(
            year=2026,
            month=7,
            feature="telegram_query",
            tenant_id=self.org.id,
        )
        self.assertEqual(len(payload["daily"]), 31)
        day10 = next(row for row in payload["daily"] if row["date"] == "2026-07-10")
        self.assertEqual(day10["request_count"], 2)
        day01 = next(row for row in payload["daily"] if row["date"] == "2026-07-01")
        self.assertEqual(day01["request_count"], 0)

    def test_outcome_totals_match_logs(self):
        payload = build_ai_usage_analytics(
            year=2026,
            month=7,
            feature="telegram_query",
            tenant_id=self.org.id,
        )
        self.assertEqual(payload["outcome_totals"]["success"], 2)
        self.assertEqual(payload["outcome_totals"]["capability_gap"], 1)

    def test_monthly_trend_six_months_oldest_first(self):
        payload = build_ai_usage_analytics(
            year=2026,
            month=7,
            feature="telegram_query",
            tenant_id=self.org.id,
        )
        self.assertEqual(len(payload["monthly_trend"]), 6)
        self.assertEqual(payload["monthly_trend"][0]["month"], 2)
        self.assertEqual(payload["monthly_trend"][-1]["month"], 7)
        july = payload["monthly_trend"][-1]
        self.assertEqual(july["request_count"], 3)
        self.assertAlmostEqual(july["success_rate"], 2 / 3)

    def test_top_users_ordered_by_request_count(self):
        payload = build_ai_usage_analytics(
            year=2026,
            month=7,
            feature="telegram_query",
            tenant_id=self.org.id,
        )
        self.assertGreaterEqual(len(payload["top_users"]), 2)
        self.assertEqual(payload["top_users"][0]["display_name"], "User B")
        self.assertEqual(payload["top_users"][0]["request_count"], 2)

    def test_daily_cost_merged_from_usage_log(self):
        payload = build_ai_usage_analytics(
            year=2026,
            month=7,
            feature="telegram_query",
            tenant_id=self.org.id,
        )
        day10 = next(row for row in payload["daily"] if row["date"] == "2026-07-10")
        self.assertEqual(day10["total_cost_usd"], "0.05000000")

    def test_invalid_feature_raises(self):
        with self.assertRaises(ValueError):
            build_ai_usage_analytics(
                year=2026,
                month=7,
                feature="bogus",
                tenant_id=self.org.id,
            )
