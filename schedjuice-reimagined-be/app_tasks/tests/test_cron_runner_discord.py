"""Tests for cron_runner Discord alert consolidation."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_tasks.cron_runner import _notify_cron_command_failed, run_cron_command


class RunCronCommandDiscordTests(SimpleTestCase):
    @patch("app_tasks.cron_runner.notify_discord_ops_embed")
    @patch("app_tasks.cron_runner.call_command")
    @patch("app_tasks.models.CronCommandLog")
    @patch("tenant_schemas.utils.schema_context")
    @patch("app_organization.models.Organization")
    def test_consolidates_failures_for_multiple_tenants(
        self,
        mock_org_model,
        mock_schema_context,
        mock_log_model,
        mock_call_command,
        mock_notify,
    ):
        mock_schema_context.return_value.__enter__ = MagicMock(return_value=None)
        mock_schema_context.return_value.__exit__ = MagicMock(return_value=False)
        mock_org_model.objects.all.return_value = [
            SimpleNamespace(schema_name="xschedjuice", name="Schedjuice"),
            SimpleNamespace(schema_name="xschedjuicethihanet", name="Testing Org"),
        ]
        mock_call_command.side_effect = RuntimeError("boom")
        log = MagicMock()
        mock_log_model.objects.create.return_value = log
        mock_log_model.Status.SUCCESS = "SUCCESS"
        mock_log_model.Status.FAILED = "FAILED"

        run_cron_command("process-courses")

        self.assertEqual(mock_notify.call_count, 1)
        _title, fields = mock_notify.call_args[0]
        tenants = mock_notify.call_args.kwargs["tenants"]
        self.assertEqual(len(tenants), 2)
        affected_field = next(f for f in fields if f.get("name") == "Affected tenants")
        self.assertIn("Schedjuice", affected_field["value"])
        self.assertIn("Testing Org", affected_field["value"])

    @patch("app_tasks.cron_runner.notify_discord_ops_embed")
    def test_notify_skips_when_no_failures(self, mock_notify):
        _notify_cron_command_failed("process-courses", [])
        mock_notify.assert_not_called()
