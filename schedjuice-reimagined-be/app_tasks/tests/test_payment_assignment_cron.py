"""Tests for payment assignment cron fan-out (Option A)."""

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_tasks.cron_runner import (
    ENSURE_PAYMENT_ASSIGNMENTS_COMMAND,
    schedule_ensure_payment_assignments,
)

class ScheduleEnsurePaymentAssignmentsTests(SimpleTestCase):
    @patch("django_q.tasks.async_task")
    @patch("tenant_schemas.utils.schema_context")
    @patch("app_organization.models.Organization")
    def test_fan_out_one_task_per_microsoft_tenant(
        self, mock_org_model, mock_schema_context, mock_async_task
    ):
        mock_schema_context.return_value.__enter__ = MagicMock(return_value=None)
        mock_schema_context.return_value.__exit__ = MagicMock(return_value=False)
        mock_org_model.objects.filter.return_value = [
            SimpleNamespace(schema_name="xteachersu", is_microsoft_on=True),
            SimpleNamespace(schema_name="xschedjuice", is_microsoft_on=True),
        ]

        schedule_ensure_payment_assignments()

        self.assertEqual(mock_async_task.call_count, 2)
        mock_async_task.assert_any_call(
            "app_tasks.cron_runner.run_ensure_payment_assignments_sync",
            "xteachersu",
            task_name="ensure-payment-assignments:xteachersu",
        )
        mock_async_task.assert_any_call(
            "app_tasks.cron_runner.run_ensure_payment_assignments_sync",
            "xschedjuice",
            task_name="ensure-payment-assignments:xschedjuice",
        )

    @patch("django_q.tasks.async_task")
    @patch("tenant_schemas.utils.schema_context")
    @patch("app_organization.models.Organization")
    def test_skips_tenant_without_schema_name(
        self, mock_org_model, mock_schema_context, mock_async_task
    ):
        mock_schema_context.return_value.__enter__ = MagicMock(return_value=None)
        mock_schema_context.return_value.__exit__ = MagicMock(return_value=False)
        mock_org_model.objects.filter.return_value = [
            SimpleNamespace(schema_name=None, is_microsoft_on=True),
        ]

        schedule_ensure_payment_assignments()

        mock_async_task.assert_not_called()

class GapDigestWindowFilterTests(SimpleTestCase):
    @patch("app_tasks.payment_assignment_gap_digest.notify_discord_ops")
    @patch("app_tasks.payment_assignment_gap_digest.iter_courses_expecting_payment_assignment_month")
    @patch("app_tasks.payment_assignment_gap_digest.payment_assignment_month_in_ensure_window")
    @patch("app_tasks.payment_assignment_gap_digest.org_local_today")
    @patch("app_tasks.payment_assignment_gap_digest.schema_context")
    @patch("app_tasks.payment_assignment_gap_digest.Organization")
    @patch("app_tasks.payment_assignment_gap_digest.settings")
    def test_excludes_gaps_outside_create_window(
        self,
        mock_settings,
        mock_org_model,
        mock_schema_context,
        mock_org_local_today,
        mock_in_window,
        mock_iter_courses,
        mock_notify,
    ):
        from app_tasks.payment_assignment_gap_digest import run_payment_assignment_gap_digest

        mock_settings.DISCORD_WEBHOOK_URL = "https://example.com/hook"
        mock_schema_context.return_value.__enter__ = MagicMock(return_value=None)
        mock_schema_context.return_value.__exit__ = MagicMock(return_value=False)
        org = SimpleNamespace(schema_name="xteachersu", timezone="UTC")
        mock_org_model.objects.filter.return_value = [org]
        mock_org_local_today.return_value = date(2026, 5, 5)
        course_in = SimpleNamespace(id=1)
        course_out = SimpleNamespace(id=2)
        mock_iter_courses.return_value = [(course_in, False), (course_out, False)]
        mock_in_window.side_effect = lambda today, y, m, course: course.id == 1

        run_payment_assignment_gap_digest()

        mock_notify.assert_called_once()
        body = mock_notify.call_args[0][0]
        self.assertIn("course_ids: 1", body)
        self.assertNotIn("course_ids: 2", body)

    @patch("app_tasks.payment_assignment_gap_digest.notify_discord_ops")
    @patch("app_tasks.payment_assignment_gap_digest.iter_courses_expecting_payment_assignment_month")
    @patch("app_tasks.payment_assignment_gap_digest.payment_assignment_month_in_ensure_window")
    @patch("app_tasks.payment_assignment_gap_digest.org_local_today")
    @patch("app_tasks.payment_assignment_gap_digest.schema_context")
    @patch("app_tasks.payment_assignment_gap_digest.Organization")
    @patch("app_tasks.payment_assignment_gap_digest.settings")
    def test_no_discord_when_all_gaps_outside_window(
        self,
        mock_settings,
        mock_org_model,
        mock_schema_context,
        mock_org_local_today,
        mock_in_window,
        mock_iter_courses,
        mock_notify,
    ):
        from app_tasks.payment_assignment_gap_digest import run_payment_assignment_gap_digest

        mock_settings.DISCORD_WEBHOOK_URL = "https://example.com/hook"
        mock_schema_context.return_value.__enter__ = MagicMock(return_value=None)
        mock_schema_context.return_value.__exit__ = MagicMock(return_value=False)
        org = SimpleNamespace(schema_name="xteachersu", timezone="UTC")
        mock_org_model.objects.filter.return_value = [org]
        mock_org_local_today.return_value = date(2026, 5, 5)
        mock_iter_courses.return_value = [(SimpleNamespace(id=2), False)]
        mock_in_window.return_value = False

        run_payment_assignment_gap_digest()

        mock_notify.assert_not_called()
