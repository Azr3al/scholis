import unittest
from datetime import datetime, timezone

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.failure_causes import LIKELY_CAUSE_TOOL_DESCRIPTIONS, LIKELY_CAUSE_UNKNOWN
from app_ai.models import AIRequestLog
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ReclassifyCausesCommandTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.filter(schema_name="xschedjuice").first()

    def test_reclassify_updates_empty_likely_causes(self):
        created = datetime(2026, 6, 10, tzinfo=timezone.utc)
        with schema_context(get_public_schema_name()):
            row = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=1,
                feature="telegram_query",
                prompt="retry tool",
                response_text="limit",
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_calls=[
                    {"name": "adjust_staff_points", "ok": False, "error": "x"},
                    {"name": "adjust_staff_points", "ok": True, "error": ""},
                ],
                likely_causes=[],
                created_at=created,
            )
        call_command("reclassify_ai_request_log_causes")
        row.refresh_from_db()
        self.assertEqual(row.likely_causes, [LIKELY_CAUSE_TOOL_DESCRIPTIONS])

    def test_reclassify_backfill_unknown(self):
        with schema_context(get_public_schema_name()):
            row = AIRequestLog.objects.create(
                tenant=self.org,
                user_id=1,
                feature="telegram_query",
                prompt="old",
                response_text="limit",
                outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED,
                tool_calls=[],
                source=AIRequestLog.Source.BACKFILL,
                likely_causes=[],
            )
        call_command("reclassify_ai_request_log_causes")
        row.refresh_from_db()
        self.assertEqual(row.likely_causes, [LIKELY_CAUSE_UNKNOWN])
