import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIUsageLog, AITenantUsageMonthly, AIUserUsageMonthly
from app_ai.pricing import compute_cache_savings_usd
from app_ai.reporting import (
    aggregate_monthly_rows,
    build_org_detail,
    build_org_usage_summary,
    build_org_users_payload,
    build_platform_summary,
    build_user_usage_detail,
    iter_months_ending,
    user_usage_for_month,
)
from app_auth.models import User
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AIUsageReportingTests(TestCase):
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

    def test_iter_months_ending(self):
        months = iter_months_ending(2026, 6, 6)
        self.assertEqual(months[0], (2026, 1))
        self.assertEqual(months[-1], (2026, 6))

    def test_aggregate_monthly_rows_sums_models(self):
        with schema_context(get_public_schema_name()):
            AITenantUsageMonthly.objects.create(
                tenant=self.org,
                year=2026,
                month=6,
                model="model-a",
                total_billed_usd=Decimal("1.00"),
                total_tokens=100,
                request_count=2,
            )
            AITenantUsageMonthly.objects.create(
                tenant=self.org,
                year=2026,
                month=6,
                model="model-b",
                total_billed_usd=Decimal("0.50"),
                total_tokens=50,
                request_count=1,
            )
            rows = list(
                AITenantUsageMonthly.objects.filter(
                    tenant=self.org, year=2026, month=6
                )
            )
        totals = aggregate_monthly_rows(rows)
        self.assertEqual(Decimal(totals["total_cost_usd"]), Decimal("1.50"))
        self.assertEqual(totals["total_tokens"], 150)
        self.assertEqual(totals["request_count"], 3)

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_aggregate_monthly_rows_includes_cache_metrics(self):
        with schema_context(get_public_schema_name()):
            AITenantUsageMonthly.objects.create(
                tenant=self.org,
                year=2026,
                month=6,
                model="gpt-5.6-luna",
                input_tokens=45000,
                cached_input_tokens=12000,
                total_billed_usd=Decimal("1.00"),
                total_tokens=57000,
                request_count=2,
            )
            rows = list(
                AITenantUsageMonthly.objects.filter(
                    tenant=self.org, year=2026, month=6
                )
            )
        totals = aggregate_monthly_rows(rows)
        self.assertEqual(totals["input_tokens"], 45000)
        self.assertEqual(totals["cached_input_tokens"], 12000)
        self.assertAlmostEqual(totals["cache_hit_rate"], 12000 / 57000, places=4)
        expected_savings = compute_cache_savings_usd(
            "gpt-5.6-luna", cached_input_tokens=12000
        )
        self.assertEqual(totals["cache_savings_usd"], format(expected_savings, "f"))

    def test_user_usage_for_month_ranks_by_cost(self):
        with schema_context(get_public_schema_name()):
            log_a = AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.user_a.id,
                model="gpt-test",
                pricing_version="v1",
                billed_cost_usd=Decimal("2.00"),
                total_tokens=200,
            )
            log_b = AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.user_b.id,
                model="gpt-test",
                pricing_version="v1",
                billed_cost_usd=Decimal("5.00"),
                total_tokens=500,
            )
            AIUsageLog.objects.filter(pk=log_a.pk).update(
                created_at=datetime(2026, 6, 15, tzinfo=timezone.utc)
            )
            AIUsageLog.objects.filter(pk=log_b.pk).update(
                created_at=datetime(2026, 6, 10, tzinfo=timezone.utc)
            )
        users = user_usage_for_month(self.org, 2026, 6)
        self.assertEqual(len(users), 2)
        self.assertEqual(users[0]["email"], self.user_b.email)
        self.assertEqual(Decimal(users[0]["total_cost_usd"]), Decimal("5.00"))

    @override_settings(AI_DEFAULT_USER_MONTHLY_USD_LIMIT=1.0)
    def test_user_usage_for_month_budget_lookup_is_batched(self):
        with schema_context(self.schema_name):
            user_c = User.objects.create_user(
                email=f"c-{uuid4().hex[:6]}@e.com",
                password="x",
                name="User C",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
        with schema_context(get_public_schema_name()):
            for user_id, cost in (
                (self.user_a.id, Decimal("0.10")),
                (self.user_b.id, Decimal("0.20")),
                (user_c.id, Decimal("0.30")),
            ):
                log = AIUsageLog.objects.create(
                    tenant=self.org,
                    user_id=user_id,
                    model="gpt-test",
                    pricing_version="v1",
                    billed_cost_usd=cost,
                    total_tokens=100,
                )
                AIUsageLog.objects.filter(pk=log.pk).update(
                    created_at=datetime(2026, 6, 15, tzinfo=timezone.utc)
                )
        # Fixed query count regardless of user count (rollup check + users + budgets).
        with self.assertNumQueries(8):
            users = user_usage_for_month(self.org, 2026, 6)
        self.assertEqual(len(users), 3)
        self.assertTrue(all("monthly_usd_limit" in row for row in users))

    def test_build_org_detail_includes_summary_only(self):
        with schema_context(get_public_schema_name()):
            AITenantUsageMonthly.objects.create(
                tenant=self.org,
                year=2026,
                month=6,
                model="gpt-test",
                total_billed_usd=Decimal("3.00"),
                total_tokens=300,
                request_count=4,
            )
        detail = build_org_detail(self.org, 2026, 6)
        self.assertEqual(Decimal(detail["month_summary"]["total_cost_usd"]), Decimal("3.00"))
        self.assertNotIn("users", detail)
        self.assertNotIn("trend", detail)

    def test_build_org_users_payload_includes_users(self):
        with schema_context(get_public_schema_name()):
            log = AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.user_a.id,
                model="gpt-test",
                pricing_version="v1",
                billed_cost_usd=Decimal("3.00"),
                total_tokens=300,
            )
            AIUsageLog.objects.filter(pk=log.pk).update(
                created_at=datetime(2026, 6, 12, tzinfo=timezone.utc)
            )
        payload = build_org_users_payload(self.org, 2026, 6)
        self.assertEqual(len(payload["users"]), 1)

    def test_build_org_usage_summary_query_budget(self):
        with schema_context(get_public_schema_name()):
            AITenantUsageMonthly.objects.create(
                tenant=self.org,
                year=2026,
                month=6,
                model="gpt-test",
                total_billed_usd=Decimal("1.00"),
                total_tokens=100,
                request_count=1,
            )
        with self.assertNumQueries(2):
            summary = build_org_usage_summary(self.org, 2026, 6)
        self.assertEqual(Decimal(summary["month_summary"]["total_cost_usd"]), Decimal("1.00"))

    def test_user_usage_for_month_uses_rollup_when_present(self):
        with schema_context(get_public_schema_name()):
            AIUserUsageMonthly.objects.create(
                tenant=self.org,
                user_id=self.user_b.id,
                year=2026,
                month=6,
                total_billed_usd=Decimal("9.00"),
                total_tokens=900,
                request_count=9,
            )
            AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.user_a.id,
                model="gpt-test",
                pricing_version="v1",
                billed_cost_usd=Decimal("1.00"),
                total_tokens=100,
            )
        users = user_usage_for_month(self.org, 2026, 6)
        self.assertEqual(len(users), 1)
        self.assertEqual(users[0]["user_id"], self.user_b.id)
        self.assertEqual(Decimal(users[0]["total_cost_usd"]), Decimal("9.00"))

    def test_build_platform_summary_sorts_orgs_by_cost(self):
        with schema_context(get_public_schema_name()):
            AITenantUsageMonthly.objects.create(
                tenant=self.org,
                year=2026,
                month=6,
                model="gpt-test",
                total_billed_usd=Decimal("9.00"),
                total_tokens=900,
                request_count=9,
            )
        summary = build_platform_summary(2026, 6)
        self.assertEqual(summary["year"], 2026)
        self.assertGreaterEqual(summary["totals"]["organization_count"], 1)
        org_row = next(
            o
            for o in summary["organizations"]
            if o["organization_id"] == self.org.id
        )
        self.assertEqual(Decimal(org_row["selected_month"]["total_cost_usd"]), Decimal("9.00"))

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_build_org_detail_by_model_includes_cache_fields(self):
        with schema_context(get_public_schema_name()):
            AITenantUsageMonthly.objects.create(
                tenant=self.org,
                year=2026,
                month=6,
                model="gpt-5.6-luna",
                input_tokens=1000,
                cached_input_tokens=500,
                total_billed_usd=Decimal("1.00"),
                total_tokens=1500,
                request_count=1,
            )
        detail = build_org_detail(self.org, 2026, 6)
        row = detail["month_summary"]["by_model"][0]
        self.assertEqual(row["cached_input_tokens"], 500)
        self.assertAlmostEqual(row["cache_hit_rate"], 500 / 1500, places=4)
        self.assertIn("cache_savings_usd", row)

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_user_usage_for_month_includes_cache_not_savings(self):
        with schema_context(get_public_schema_name()):
            log = AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.user_a.id,
                model="gpt-5.6-luna",
                pricing_version="v1",
                input_tokens=800,
                cached_input_tokens=200,
                billed_cost_usd=Decimal("1.00"),
                total_tokens=1000,
            )
            AIUsageLog.objects.filter(pk=log.pk).update(
                created_at=datetime(2026, 6, 15, tzinfo=timezone.utc)
            )
        users = user_usage_for_month(self.org, 2026, 6)
        self.assertEqual(users[0]["cached_input_tokens"], 200)
        self.assertAlmostEqual(users[0]["cache_hit_rate"], 200 / 1000, places=4)
        self.assertNotIn("cache_savings_usd", users[0])

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_build_user_usage_detail_includes_cache_on_summary_and_trend(self):
        with schema_context(get_public_schema_name()):
            log = AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.user_a.id,
                feature="ai_query",
                model="gpt-5.6-luna",
                pricing_version="v1",
                input_tokens=900,
                cached_input_tokens=100,
                billed_cost_usd=Decimal("0.50"),
                total_tokens=1000,
            )
            AIUsageLog.objects.filter(pk=log.pk).update(
                created_at=datetime(2026, 6, 20, tzinfo=timezone.utc)
            )
        detail = build_user_usage_detail(self.org, self.user_a.id, 2026, 6)
        summary = detail["month_summary"]
        self.assertEqual(summary["cached_input_tokens"], 100)
        self.assertAlmostEqual(summary["cache_hit_rate"], 100 / 1000, places=4)
        self.assertIn("cache_savings_usd", summary)
        self.assertIn("cached_input_tokens", detail["trend"][-1])
        feature_row = summary["by_feature"][0]
        self.assertEqual(feature_row["cached_input_tokens"], 100)
        self.assertNotIn("cache_savings_usd", feature_row)

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_build_platform_summary_trend_includes_cache_fields(self):
        with schema_context(get_public_schema_name()):
            AITenantUsageMonthly.objects.create(
                tenant=self.org,
                year=2026,
                month=6,
                model="gpt-5.6-luna",
                input_tokens=400,
                cached_input_tokens=100,
                total_billed_usd=Decimal("2.00"),
                total_tokens=500,
                request_count=1,
            )
        summary = build_platform_summary(2026, 6)
        self.assertEqual(summary["totals"]["cached_input_tokens"], 100)
        org_row = next(
            o for o in summary["organizations"] if o["organization_id"] == self.org.id
        )
        june_trend = org_row["trend"][-1]
        self.assertEqual(june_trend["cached_input_tokens"], 100)
        self.assertIn("cache_savings_usd", june_trend)

    @override_settings(AI_DEFAULT_USER_MONTHLY_USD_LIMIT=1.0)
    def test_user_usage_for_month_includes_limit_status(self):
        with schema_context(get_public_schema_name()):
            log = AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.user_a.id,
                model="gpt-test",
                pricing_version="v1",
                billed_cost_usd=Decimal("0.95"),
                total_tokens=100,
            )
            AIUsageLog.objects.filter(pk=log.pk).update(
                created_at=datetime(2026, 6, 15, tzinfo=timezone.utc)
            )
        users = user_usage_for_month(self.org, 2026, 6)
        self.assertIn("monthly_usd_limit", users[0])
        self.assertIn("limit_status", users[0])
        self.assertEqual(users[0]["limit_status"], "near_limit")

    @override_settings(AI_DEFAULT_USER_MONTHLY_USD_LIMIT=1.0)
    def test_build_user_usage_detail_includes_budget(self):
        detail = build_user_usage_detail(self.org, self.user_a.id, 2026, 6)
        self.assertIn("budget", detail)
        self.assertEqual(detail["budget"]["limit_source"], "platform_default")
