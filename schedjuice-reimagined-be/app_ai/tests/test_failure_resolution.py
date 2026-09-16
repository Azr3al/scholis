import unittest
from datetime import datetime, timezone

from django.db import connection
from django.test import TestCase
from django.utils import timezone as django_timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.failure_resolution import FailureResolutionError, resolve_request_log_failure
from app_ai.models import AIRequestLog
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class FailureResolutionTests(TestCase):
    schema_name = "xschedjuice"
    created = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)

    def _create_row(self, *, outcome: str) -> AIRequestLog:
        with schema_context(get_public_schema_name()):
            return AIRequestLog.objects.create(
                tenant=self.org,
                user_id=1,
                feature="telegram_query",
                prompt="resolution test",
                response_text="r",
                outcome=outcome,
                created_at=self.created,
            )

    def test_resolve_sets_metadata(self):
        row = self._create_row(outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED)
        before = django_timezone.now()
        resolve_request_log_failure(row, resolved=True, user_id=99)
        row.refresh_from_db()
        self.assertIsNotNone(row.resolved_at)
        self.assertGreaterEqual(row.resolved_at, before)
        self.assertEqual(row.resolved_by_user_id, 99)

    def test_unresolve_clears_metadata(self):
        row = self._create_row(outcome=AIRequestLog.Outcome.CAPABILITY_GAP)
        resolve_request_log_failure(row, resolved=True, user_id=99)
        resolve_request_log_failure(row, resolved=False, user_id=99)
        row.refresh_from_db()
        self.assertIsNone(row.resolved_at)
        self.assertIsNone(row.resolved_by_user_id)

    def test_resolve_is_idempotent(self):
        row = self._create_row(outcome=AIRequestLog.Outcome.TOOL_LIMIT_EXCEEDED)
        resolve_request_log_failure(row, resolved=True, user_id=5)
        row.refresh_from_db()
        first_at = row.resolved_at
        resolve_request_log_failure(row, resolved=True, user_id=99)
        row.refresh_from_db()
        self.assertEqual(row.resolved_at, first_at)
        self.assertEqual(row.resolved_by_user_id, 5)

    def test_rejects_non_failure_outcome(self):
        row = self._create_row(outcome=AIRequestLog.Outcome.SUCCESS)
        with self.assertRaises(FailureResolutionError):
            resolve_request_log_failure(row, resolved=True, user_id=1)
