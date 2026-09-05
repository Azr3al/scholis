"""Caller-contract tests for payment submission sync Graph auth and eligibility."""

import importlib
from datetime import date
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from django.db.models import Q

_SyncModule = importlib.import_module(
    "app_tasks.management.commands.sync-payment-submissions"
)


class RecentCalendarMonthsTests(TestCase):
    def test_august_anchor_includes_current_and_two_prior_months(self):
        self.assertEqual(
            _SyncModule.recent_calendar_months(date(2026, 8, 10)),
            [(2026, 8), (2026, 7), (2026, 6)],
        )

    def test_january_anchor_rolls_into_prior_year(self):
        self.assertEqual(
            _SyncModule.recent_calendar_months(date(2026, 1, 15)),
            [(2026, 1), (2025, 12), (2025, 11)],
        )

    def test_does_not_include_fourth_month_back(self):
        months = {m for _, m in _SyncModule.recent_calendar_months(date(2026, 8, 10))}
        self.assertNotIn(5, months)


class PaymentAssignmentsForSyncQuerysetTests(TestCase):
    @patch.object(_SyncModule, "PaymentAssignment")
    def test_applies_payment_enabled_and_recent_month_filters(self, mock_pa_model):
        mock_qs = MagicMock()
        mock_pa_model.objects.select_related.return_value = mock_qs
        mock_qs.filter.return_value = mock_qs
        mock_qs.exclude.return_value = mock_qs

        org = SimpleNamespace(timezone="UTC")
        today = date(2026, 8, 10)
        expected_month_filter = Q()
        for year, month_index in _SyncModule.recent_calendar_months(today):
            expected_month_filter |= Q(year=year, month_index=month_index)

        _SyncModule.payment_assignments_for_sync_queryset(org, today=today)

        mock_qs.filter.assert_any_call(course__is_payment_enabled=True)
        mock_qs.filter.assert_any_call(expected_month_filter)
        mock_qs.filter.assert_any_call(
            course__start_date__lt=today,
            course__end_date__gte=today - _SyncModule.timedelta(days=10),
        )

    @patch.object(_SyncModule, "PaymentAssignment")
    def test_old_month_not_in_recent_month_filter(self, mock_pa_model):
        mock_qs = MagicMock()
        mock_pa_model.objects.select_related.return_value = mock_qs
        mock_qs.filter.return_value = mock_qs
        mock_qs.exclude.return_value = mock_qs

        org = SimpleNamespace(timezone="UTC")
        today = date(2026, 8, 10)
        _SyncModule.payment_assignments_for_sync_queryset(org, today=today)

        month_filter_call = next(
            call
            for call in mock_qs.filter.call_args_list
            if call.args and isinstance(call.args[0], Q)
        )
        month_filter = month_filter_call.args[0]
        self.assertNotIn(
            Q(year=2026, month_index=4),
            month_filter.children,
        )


class SyncPaymentSubmissionsAuthTests(TestCase):
    @patch.object(_SyncModule, "User")
    @patch.object(_SyncModule, "UserPayment")
    @patch.object(_SyncModule, "MSEducation")
    def test_sync_uses_app_auth_like_teams_creation(
        self, mock_ms_education, mock_user_payment, mock_user
    ):
        mock_user_payment.objects.filter.return_value.exclude.return_value.values_list.return_value = []
        mock_user.objects.filter.return_value.exclude.return_value = []
        mock_ms_education.return_value.list_submissions.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"value": []}),
        )
        tenant = SimpleNamespace(schema_name="xteachersu")
        pa = SimpleNamespace(
            id=1,
            year=2025,
            month_index=7,
            microsoft_assignment_id="asgn-1",
            course=SimpleNamespace(microsoft_group_id="class-1"),
        )

        _SyncModule.sync_submissions_for_payment_assignment(
            pa, tenant, tenant.schema_name
        )

        mock_ms_education.assert_called_once_with(tenant)
