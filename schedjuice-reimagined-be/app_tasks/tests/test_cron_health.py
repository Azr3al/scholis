"""Tests for cron job health evaluation."""

import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_tasks.cron_health import (
    JOB_STATUS_HEALTHY,
    JOB_STATUS_MISSED,
    JOB_STATUS_STUCK,
    JOB_STATUS_UNKNOWN,
    cleanup_stuck_running_logs,
    evaluate_job_health,
    evaluate_scheduler_health,
    log_global_cron_run,
    run_cron_health_check,
)
from app_tasks.cron_registry import get_job_by_log_command_name
from app_tasks.models import CronCommandLog

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

PROCESS_COURSES = get_job_by_log_command_name("process-courses")
assert PROCESS_COURSES is not None

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CronHealthEvaluatorTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_log(self, *, status, created_at, completed_at=None, error_message=None):
        with schema_context(self.schema_name):
            log = CronCommandLog.objects.create(
                command_name=PROCESS_COURSES.log_command_name,
                status=status,
                error_message=error_message,
            )
            CronCommandLog.objects.filter(pk=log.pk).update(
                created_at=created_at,
                completed_at=completed_at,
            )
            log.refresh_from_db()
            return log

    def test_evaluate_missed_job(self):
        now = timezone.now().replace(minute=25, second=0, microsecond=0)

        result = evaluate_job_health(self.schema_name, PROCESS_COURSES, now=now)

        self.assertEqual(result["status"], JOB_STATUS_MISSED)
        self.assertIsNone(result["last_run_at"])

    def test_evaluate_stuck_running(self):
        now = timezone.now()
        created = now - timedelta(seconds=1000)
        log = self._create_log(
            status=CronCommandLog.Status.RUNNING,
            created_at=created,
        )

        result = evaluate_job_health(self.schema_name, PROCESS_COURSES, now=now)

        self.assertEqual(result["status"], JOB_STATUS_STUCK)
        with schema_context(self.schema_name):
            log.refresh_from_db()
            self.assertEqual(log.status, CronCommandLog.Status.FAILED)
            self.assertEqual(log.error_message, "Timed out (health check)")

    def test_evaluate_unknown_never_ran(self):
        base = timezone.now().replace(minute=32, second=0, microsecond=0)
        now = base

        result = evaluate_job_health(self.schema_name, PROCESS_COURSES, now=now)

        self.assertEqual(result["status"], JOB_STATUS_UNKNOWN)
        self.assertIsNone(result["last_run_at"])

class CleanupStuckRunningLogsTests(SimpleTestCase):
    @patch("app_tasks.cron_health.schema_context")
    @patch("app_tasks.models.CronCommandLog")
    def test_cleanup_flips_old_running_to_failed(self, mock_log_model, mock_schema_context):
        mock_schema_context.return_value.__enter__ = MagicMock(return_value=None)
        mock_schema_context.return_value.__exit__ = MagicMock(return_value=False)

        stuck = MagicMock()
        stuck.status = mock_log_model.Status.RUNNING
        qs = MagicMock()
        qs.order_by.return_value.first.return_value = stuck
        mock_log_model.objects.filter.return_value = qs
        mock_log_model.Status.RUNNING = "RUNNING"
        mock_log_model.Status.FAILED = "FAILED"

        now = timezone.now()
        job = get_job_by_log_command_name("process-courses")
        result = cleanup_stuck_running_logs("xschedjuice", job, now)

        self.assertIs(result, stuck)
        self.assertEqual(stuck.status, "FAILED")
        self.assertEqual(stuck.error_message, "Timed out (health check)")

class SchedulerHealthTests(SimpleTestCase):
    def _mock_schema(self, mock_schema_context):
        mock_schema_context.return_value.__enter__ = MagicMock(return_value=None)
        mock_schema_context.return_value.__exit__ = MagicMock(return_value=False)

    @patch("app_tasks.cron_health._meta_check_ran_at", return_value=None)
    @patch("app_tasks.cron_health.schema_context")
    @patch("django_q.models.Schedule")
    @patch("django_q.models.Success")
    def test_evaluate_scheduler_down_when_qcluster_inactive(
        self,
        mock_success,
        mock_schedule,
        mock_schema_context,
        _mock_meta,
    ):
        self._mock_schema(mock_schema_context)
        mock_success.objects.filter.return_value.exists.return_value = False
        mock_schedule.objects.count.return_value = 19

        result = evaluate_scheduler_health(now=timezone.now())

        self.assertFalse(result["qcluster_alive"])
        self.assertEqual(result["overall"], "down")

    @patch("app_tasks.cron_health._meta_check_ran_at", return_value=None)
    @patch("app_tasks.cron_health.schema_context")
    @patch("django_q.models.Schedule")
    @patch("django_q.models.Success")
    def test_evaluate_scheduler_degraded_when_schedule_count_mismatch(
        self,
        mock_success,
        mock_schedule,
        mock_schema_context,
        _mock_meta,
    ):
        self._mock_schema(mock_schema_context)
        mock_success.objects.filter.return_value.exists.return_value = True
        mock_schedule.objects.count.return_value = 1

        result = evaluate_scheduler_health(now=timezone.now())

        self.assertTrue(result["qcluster_alive"])
        self.assertNotEqual(result["schedules_registered"], result["schedules_expected"])
        self.assertEqual(result["overall"], "degraded")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class MetaCronHealthTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    @patch("app_tasks.cron_health.notify_discord_ops_embed")
    @patch("app_tasks.cron_health.evaluate_cron_health")
    @patch("app_tasks.cron_health.evaluate_scheduler_health")
    def test_meta_cron_alerts_once_within_dedup_window(
        self,
        mock_scheduler,
        mock_eval,
        mock_notify,
    ):
        mock_scheduler.return_value = {"qcluster_alive": True}
        mock_eval.return_value = {
            "jobs": [
                {
                    "log_command_name": "process-courses",
                    "status": JOB_STATUS_MISSED,
                    "last_run_at": None,
                }
            ],
            "summary": {JOB_STATUS_MISSED: 1},
        }

        org = SimpleNamespace(schema_name=self.schema_name, name="Schedjuice Test")
        with patch("app_organization.models.Organization.objects") as mock_objects:
            mock_objects.exclude.return_value.exclude.return_value = [org]
            run_cron_health_check()
            run_cron_health_check()

        self.assertEqual(mock_notify.call_count, 1)
        title = mock_notify.call_args[0][0]
        fields = mock_notify.call_args[0][1]
        self.assertIn("Cron health: MISSED", title)
        field_text = " ".join(str(f.get("value", "")) for f in fields)
        self.assertIn("process-courses", field_text)

    @patch("app_tasks.cron_health.record_alert_sent")
    @patch("app_tasks.cron_health.should_send_alert", return_value=True)
    @patch("app_tasks.cron_health.notify_discord_ops_embed")
    @patch("app_tasks.cron_health.evaluate_cron_health")
    @patch("app_tasks.cron_health.evaluate_scheduler_health")
    def test_meta_cron_consolidates_multi_tenant_alerts(
        self,
        mock_scheduler,
        mock_eval,
        mock_notify,
        _mock_should,
        _mock_record,
    ):
        mock_scheduler.return_value = {"qcluster_alive": True}
        missed_job = {
            "log_command_name": "alert-payment-assignment-gaps",
            "status": JOB_STATUS_MISSED,
            "last_run_at": None,
        }
        mock_eval.return_value = {"jobs": [missed_job], "summary": {JOB_STATUS_MISSED: 1}}

        org_a = SimpleNamespace(schema_name="xschedjuice", name="Schedjuice")
        org_b = SimpleNamespace(schema_name="xschedjuicethihanet", name="Testing Org")
        with patch("app_organization.models.Organization.objects") as mock_objects:
            mock_objects.exclude.return_value.exclude.return_value = [org_a, org_b]
            run_cron_health_check()

        self.assertEqual(mock_notify.call_count, 1)
        _title, fields = mock_notify.call_args[0]
        tenants = mock_notify.call_args.kwargs["tenants"]
        tenant_names = {getattr(t, "name") for t in tenants}
        self.assertEqual(tenant_names, {"Schedjuice", "Testing Org"})
        affected_field = next(f for f in fields if f.get("name") == "Affected tenants")
        self.assertIn("Schedjuice", affected_field["value"])
        self.assertIn("Testing Org", affected_field["value"])

    @patch("app_tasks.cron_health.record_alert_sent")
    @patch("app_tasks.cron_health.notify_discord_ops_embed")
    @patch("app_tasks.cron_health.evaluate_cron_health")
    @patch("app_tasks.cron_health.evaluate_scheduler_health")
    def test_meta_cron_partial_dedup_still_lists_all_affected_tenants(
        self,
        mock_scheduler,
        mock_eval,
        mock_notify,
        mock_record,
    ):
        mock_scheduler.return_value = {"qcluster_alive": True}
        missed_job = {
            "log_command_name": "alert-payment-assignment-gaps",
            "status": JOB_STATUS_MISSED,
            "last_run_at": None,
        }
        mock_eval.return_value = {"jobs": [missed_job], "summary": {JOB_STATUS_MISSED: 1}}

        org_a = SimpleNamespace(schema_name="xschedjuice", name="Schedjuice")
        org_b = SimpleNamespace(schema_name="xschedjuicethihanet", name="Testing Org")

        def should_alert(schema_name, log_command_name, alert_type, now):
            return schema_name == "xschedjuicethihanet"

        with patch("app_organization.models.Organization.objects") as mock_objects:
            with patch(
                "app_tasks.cron_health.should_send_alert",
                side_effect=should_alert,
            ):
                mock_objects.exclude.return_value.exclude.return_value = [org_a, org_b]
                run_cron_health_check()

        self.assertEqual(mock_notify.call_count, 1)
        tenants = mock_notify.call_args.kwargs["tenants"]
        self.assertEqual(len(tenants), 2)
        mock_record.assert_called_once_with(
            "xschedjuicethihanet",
            "alert-payment-assignment-gaps",
            JOB_STATUS_MISSED,
            mock_record.call_args[0][3],
        )

    def test_log_global_cron_run_writes_all_tenants(self):
        command_name = "test-global-log-command"

        with schema_context(get_public_schema_name()):
            orgs = list(
                Organization.objects.exclude(schema_name__isnull=True).exclude(
                    schema_name=""
                )
            )
        self.assertTrue(len(orgs) >= 1)

        log_global_cron_run(command_name, lambda: None)

        for org in orgs:
            with schema_context(org.schema_name):
                log = CronCommandLog.objects.filter(command_name=command_name).latest(
                    "completed_at"
                )
                self.assertEqual(log.status, CronCommandLog.Status.SUCCESS)
                self.assertEqual(log.stdout, "")
                self.assertIsNone(log.error_message)
                self.assertIsNotNone(log.completed_at)
