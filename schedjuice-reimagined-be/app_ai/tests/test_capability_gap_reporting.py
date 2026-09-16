import unittest
from datetime import datetime, timezone

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.capability_gap.constants import CAPABILITY_GAP_DATA_NOT_EXPOSED
from app_ai.models import AIRequestLog
from app_ai.reporting import build_failures_list
from app_auth.models import User
from app_organization.models import Organization

_CREATED = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
_PROMPT_TOOL = "cap_gap_reporting_tool_limit"
_PROMPT_GAP = "cap_gap_reporting_capability"


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CapabilityGapReportingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)
        with schema_context(cls.schema_name):
            cls.user = User.objects.filter(is_active=True).first()

    def setUp(self):
        with schema_context(get_public_schema_name()):
            AIRequestLog.objects.filter(
                prompt__in=[_PROMPT_TOOL, _PROMPT_GAP]
            ).delete()
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt=_PROMPT_TOOL,
                response_text="limit",
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_iterations=5,
                likely_causes=["unknown"],
                created_at=_CREATED,
            )
            AIRequestLog.objects.create(
                tenant=self.org,
                user_id=self.user.id,
                feature="telegram_query",
                prompt=_PROMPT_GAP,
                response_text="no log",
                outcome=AIRequestLog.Outcome.CAPABILITY_GAP,
                capability_gaps=[CAPABILITY_GAP_DATA_NOT_EXPOSED],
                capability_gap_intent="Point adjustment history",
                capability_gap_reason="No history exposed",
                capability_gap_domain="staff_points",
                created_at=_CREATED,
            )

    def _our_items(self, payload):
        return [i for i in payload["items"] if i["prompt"] in (_PROMPT_TOOL, _PROMPT_GAP)]

    def test_outcome_all_returns_both_types(self):
        payload = build_failures_list(
            year=2026,
            month=6,
            outcome="all",
            tenant_id=self.org.id,
        )
        items = self._our_items(payload)
        self.assertEqual(len(items), 2)
        outcomes = {i["outcome"] for i in items}
        self.assertEqual(
            outcomes,
            {"tool_limit_exceeded", "capability_gap"},
        )

    def test_capability_gap_filter(self):
        payload = build_failures_list(
            year=2026,
            month=6,
            outcome="capability_gap",
            capability_gap=CAPABILITY_GAP_DATA_NOT_EXPOSED,
            tenant_id=self.org.id,
        )
        items = self._our_items(payload)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["outcome"], "capability_gap")
        self.assertEqual(items[0]["capability_gap_intent"], "Point adjustment history")
        self.assertEqual(
            payload["summary"]["top_gap_domains"][0]["domain"],
            "staff_points",
        )
