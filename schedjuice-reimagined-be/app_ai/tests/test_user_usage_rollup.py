import unittest
from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import AIUserUsageMonthly
from app_ai.pricing import TokenUsage
from app_ai.usage import record_usage
from app_auth.models import User
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AIUserUsageRollupTests(TestCase):
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
            self.user = User.objects.create_user(
                email=f"rollup-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Rollup User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def test_record_usage_updates_user_monthly_rollup(self):
        with schema_context(self.schema_name):
            connection.set_schema(self.schema_name)
            record_usage(
                user_id=self.user.id,
                feature="ai_query",
                model="gpt-test",
                usage=TokenUsage(
                    input_tokens=10,
                    output_tokens=5,
                    thinking_tokens=0,
                    cached_input_tokens=2,
                ),
                latency_ms=100,
                tool_iterations=0,
                status="success",
            )

        with schema_context(get_public_schema_name()):
            row = AIUserUsageMonthly.objects.get(
                tenant=self.org,
                user_id=self.user.id,
            )
        self.assertEqual(row.total_tokens, 17)
        self.assertEqual(row.request_count, 1)
        self.assertGreater(row.total_billed_usd, Decimal("0"))
