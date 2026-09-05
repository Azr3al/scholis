"""Tests for tr.phillips payroll when per-session effective rates differ."""

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_hr.payroll_funcs import (
    _effective_trphillips_hourly_rate,
    get_cash_flow_trphillips,
    get_tr_payments_trphillips,
    session_billable_hours,
    session_billable_window,
)


def _make_ue(
    course_id,
    event_id,
    hourly,
    bonus,
    student_count,
    *,
    is_extra=False,
    checkin_time=None,
    checkout_time=None,
    event_time_from_at_calculation=None,
    event_time_to_at_calculation=None,
):
    ue = MagicMock()
    ue.event.course.id = course_id
    ue.event.id = event_id
    ue.event.date = datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc)
    ue.event.course.title = "Course"
    ue.user.name = "Teacher"
    ue.hourly_rate_at_calculation = hourly
    ue.student_bonus_rate_at_calculation = bonus
    ue.student_count_in_course_at_calculation = student_count
    ue.is_extra_class = is_extra
    ue.checkin_time = checkin_time or datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc)
    ue.checkout_time = checkout_time or datetime(2025, 3, 15, 15, 0, tzinfo=timezone.utc)
    ue.per_hour_price_at_calculation = None
    ue.event_time_from_at_calculation = event_time_from_at_calculation
    ue.event_time_to_at_calculation = event_time_to_at_calculation
    return ue


class EffectiveTrPhillipsHourlyRateTests(SimpleTestCase):
    def test_base_only_when_count_none_or_one(self):
        ue = _make_ue(1, 1, 1000, 50, None)
        self.assertEqual(_effective_trphillips_hourly_rate(ue), 1000.0)
        ue.student_count_in_course_at_calculation = 1
        self.assertEqual(_effective_trphillips_hourly_rate(ue), 1000.0)

    def test_bonus_when_count_gt_one(self):
        ue = _make_ue(1, 1, 1000, 100, 3)
        # 1000 + 100 * (3 - 1) = 1200
        self.assertEqual(_effective_trphillips_hourly_rate(ue), 1200.0)


class SessionBillableHoursTests(SimpleTestCase):
    def test_uses_exact_frozen_event_duration(self):
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            checkin_time=datetime(2025, 3, 15, 10, 20, tzinfo=timezone.utc),
            checkout_time=datetime(2025, 3, 15, 11, 10, tzinfo=timezone.utc),
            event_time_from_at_calculation=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
            event_time_to_at_calculation=datetime(2025, 3, 15, 12, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(session_billable_hours(ue), 2.0)
        win = session_billable_window(ue)
        self.assertEqual(win[0], ue.event_time_from_at_calculation)
        self.assertEqual(win[1], ue.event_time_to_at_calculation)

    def test_fallback_half_hour_checkin_when_no_snapshot(self):
        # 10:20 → 10:30, 11:10 → 11:00 → 0.5h with existing round_to_closest_half_hour
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            checkin_time=datetime(2025, 3, 15, 10, 20, tzinfo=timezone.utc),
            checkout_time=datetime(2025, 3, 15, 11, 10, tzinfo=timezone.utc),
        )
        self.assertEqual(session_billable_hours(ue), 0.5)

    def test_partial_snapshot_falls_back(self):
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            event_time_from_at_calculation=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
            event_time_to_at_calculation=None,
        )
        self.assertEqual(session_billable_hours(ue), 5.0)  # default 10:00–15:00 in _make_ue

    def test_invalid_snapshot_to_le_from_falls_back(self):
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            checkin_time=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
            checkout_time=datetime(2025, 3, 15, 12, 0, tzinfo=timezone.utc),
            event_time_from_at_calculation=datetime(2025, 3, 15, 12, 0, tzinfo=timezone.utc),
            event_time_to_at_calculation=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(session_billable_hours(ue), 2.0)


@patch("app_hr.payroll_funcs.UserEvent.objects.filter")
class GetTrPaymentsUsesBillableHoursTests(SimpleTestCase):
    def test_late_checkin_still_pays_frozen_event_hours(self, mock_filter):
        ue = _make_ue(
            1, 1, 1000, 0, 1,
            checkin_time=datetime(2025, 3, 15, 10, 30, tzinfo=timezone.utc),
            checkout_time=datetime(2025, 3, 15, 11, 0, tzinfo=timezone.utc),
            event_time_from_at_calculation=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
            event_time_to_at_calculation=datetime(2025, 3, 15, 12, 0, tzinfo=timezone.utc),
        )
        mock_filter.return_value.order_by.return_value.prefetch_related.return_value.all.return_value = [
            ue
        ]
        teacher = MagicMock()
        teacher.id = 42
        result = get_tr_payments_trphillips(teacher, 3, 2025, "UTC", course_id=None)
        self.assertEqual(result["data"][0]["hours"], 2.0)
        self.assertEqual(
            result["data"][0]["checkin_time"],
            ue.event_time_from_at_calculation,
        )
        self.assertEqual(
            result["data"][0]["checkout_time"],
            ue.event_time_to_at_calculation,
        )
        # reg=2, <=16 → 2 * 1000
        self.assertAlmostEqual(result["aggregate"]["total_earnings"], 2000.0, places=5)


class GetTrPaymentsTrphillipsWeightedTests(SimpleTestCase):
    def test_identical_sessions_matches_single_rate(self):
        """Two regular sessions, same effective inputs: same total as 10h * 1200."""
        ues = [
            _make_ue(1, 1, 1000, 100, 3, is_extra=False),
            _make_ue(1, 2, 1000, 100, 3, is_extra=False),
        ]
        teacher = MagicMock()
        teacher.id = 42

        with patch("app_hr.payroll_funcs.UserEvent.objects.filter") as mock_filter:
            mock_filter.return_value.order_by.return_value.prefetch_related.return_value.all.return_value = (
                ues
            )
            result = get_tr_payments_trphillips(
                teacher, 3, 2025, "UTC", course_id=None
            )

        # reg=10, extra=0, <=16 -> 10 * 1200
        self.assertAlmostEqual(result["aggregate"]["total_earnings"], 12000.0, places=5)
        self.assertAlmostEqual(
            result["aggregate"]["by_course"][1]["earnings"], 12000.0, places=5
        )

    def test_different_student_count_weighted_average(self):
        """Session A: eff 1200 (sc=3); Session B: eff 1400 (sc=5); 5h each -> avg 1300, 10h total."""
        ues = [
            _make_ue(1, 1, 1000, 100, 3, is_extra=False),
            _make_ue(1, 2, 1000, 100, 5, is_extra=False),
        ]
        teacher = MagicMock()
        teacher.id = 42

        with patch("app_hr.payroll_funcs.UserEvent.objects.filter") as mock_filter:
            mock_filter.return_value.order_by.return_value.prefetch_related.return_value.all.return_value = (
                ues
            )
            result = get_tr_payments_trphillips(
                teacher, 3, 2025, "UTC", course_id=None
            )

        # (5*1200 + 5*1400) / 10 = 1300; 10 * 1300 = 13000
        self.assertAlmostEqual(result["aggregate"]["total_earnings"], 13000.0, places=5)
        self.assertAlmostEqual(
            result["aggregate"]["by_course"][1]["earnings"], 13000.0, places=5
        )


@patch("app_hr.payroll_funcs.Course.objects.filter")
@patch("app_hr.payroll_funcs.UserEvent.objects.filter")
class GetCashFlowUsesFrozenHoursTests(SimpleTestCase):
    def test_income_uses_frozen_hours_not_late_checkin(self, mock_ue_filter, mock_course_filter):
        """Cash-flow inherits billable hours from get_tr_payments_trphillips (freeze, not fallback)."""
        ue = _make_ue(
            1,
            1,
            1000,
            0,
            2,
            checkin_time=datetime(2025, 3, 15, 10, 20, tzinfo=timezone.utc),
            checkout_time=datetime(2025, 3, 15, 11, 10, tzinfo=timezone.utc),
            event_time_from_at_calculation=datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc),
            event_time_to_at_calculation=datetime(2025, 3, 15, 12, 0, tzinfo=timezone.utc),
        )
        ue.per_hour_price_at_calculation = Decimal("10")
        mock_ue_filter.return_value.order_by.return_value.prefetch_related.return_value.all.return_value = [
            ue
        ]
        mock_course_filter.return_value.select_related.return_value = []
        teacher = MagicMock()
        teacher.id = 42
        result = get_cash_flow_trphillips(teacher, 3, 2025, "UTC", course_id=None)
        self.assertEqual(len(result["rows"]), 1)
        row = result["rows"][0]
        self.assertEqual(row["hours"], 2.0)
        self.assertEqual(row["income"], "40.00")
