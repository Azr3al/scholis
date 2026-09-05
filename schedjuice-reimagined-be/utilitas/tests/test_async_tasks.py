import logging
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from utilitas.async_tasks import django_q_task, tenant_async

class TenantAsyncTests(SimpleTestCase):
    @patch("utilitas.async_tasks.schema_context")
    @patch("utilitas.async_tasks.Organization")
    def test_missing_schema_returns_none_and_logs(self, mock_org, mock_schema_context):
        mock_schema_context.return_value.__enter__ = MagicMock(return_value=None)
        mock_schema_context.return_value.__exit__ = MagicMock(return_value=False)
        mock_org.objects.filter.return_value.first.return_value = None

        @tenant_async()
        def task(entity_id, tenant):
            return "ran"

        with self.assertLogs("utilitas.async_tasks", level="WARNING") as logs:
            result = task(1, "missing_schema")

        self.assertIsNone(result)
        self.assertTrue(any("tenant not found" in m for m in logs.output))

