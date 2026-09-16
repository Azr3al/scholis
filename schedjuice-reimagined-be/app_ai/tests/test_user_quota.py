import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.exceptions import AIUserQuotaExceeded
from app_ai.models import AIUsageLog
from app_ai.quota import (
    assert_user_quota_allows,
    get_user_budget,
    get_user_budgets_batch,
    user_budget_snapshot,
)
from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(AI_DEFAULT_USER_MONTHLY_USD_LIMIT=1.0, RBAC_ENFORCE="log_only")
class UserQuotaTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"quota-{suffix}@example.com",
                password="x",
                name="Quota User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def test_get_user_budget_platform_default(self):
        self.assertEqual(get_user_budget(self.org, self.user.id), Decimal("1.00"))

    def test_get_user_budget_org_default(self):
        with schema_context(get_public_schema_name()):
            self.org.ai_default_user_monthly_usd_limit = Decimal("5.00")
            self.org.save(update_fields=["ai_default_user_monthly_usd_limit"])
        self.assertEqual(get_user_budget(self.org, self.user.id), Decimal("5.00"))

    def test_get_user_budget_user_override(self):
        with schema_context(self.schema_name):
            UserAIPreferences.objects.create(
                user=self.user,
                monthly_usd_limit=Decimal("10.00"),
            )
        self.assertEqual(get_user_budget(self.org, self.user.id), Decimal("10.00"))

    def test_get_user_budgets_batch_matches_single_lookup(self):
        with schema_context(self.schema_name):
            other = User.objects.create_user(
                email=f"quota-b-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Other",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            UserAIPreferences.objects.create(
                user=self.user,
                monthly_usd_limit=Decimal("10.00"),
            )
        batch = get_user_budgets_batch(self.org, [self.user.id, other.id])
        self.assertEqual(batch[self.user.id], Decimal("10.00"))
        self.assertEqual(batch[other.id], Decimal("1.00"))

    def test_assert_user_quota_allows_blocks_at_limit(self):
        now = datetime.now(timezone.utc)
        with schema_context(get_public_schema_name()):
            log = AIUsageLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="ai_query",
                model="gpt-5.6-luna",
                pricing_version="v1",
                billed_cost_usd=Decimal("1.00"),
                computed_cost_usd=Decimal("1.00"),
            )
            AIUsageLog.objects.filter(pk=log.pk).update(created_at=now)
        with self.assertRaises(AIUserQuotaExceeded):
            assert_user_quota_allows(self.org, self.user.id)

    def test_assert_user_quota_allows_skips_none_user_id(self):
        assert_user_quota_allows(self.org, None)

    def test_user_budget_snapshot_includes_limit_source(self):
        snap = user_budget_snapshot(self.org, self.user.id)
        self.assertEqual(snap["limit_source"], "platform_default")
        self.assertEqual(snap["monthly_usd_limit"], "1.00")
