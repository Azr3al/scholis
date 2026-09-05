"""Tests for session-based payroll (per_session_rate * session_count)."""

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_hr.payroll_funcs import get_session_based_payments


def _make_ue(course_id, event_id):
    ue = MagicMock()
    ue.event.course.id = course_id
    ue.event.id = event_id
    ue.event.date = datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc)
    ue.event.course.title = "Course"
    ue.user.name = "Teacher"
    ue.checkin_time = datetime(2025, 3, 15, 10, 0, tzinfo=timezone.utc)
    ue.checkout_time = datetime(2025, 3, 15, 15, 0, tzinfo=timezone.utc)
    return ue


class GetSessionBasedPaymentsTests(SimpleTestCase):
    def test_total_equals_rate_times_session_count(self):
        ues = [
            _make_ue(1, 1),
            _make_ue(1, 2),
            _make_ue(2, 3),
            _make_ue(2, 4),
            _make_ue(2, 5),
            _make_ue(1, 6),
            _make_ue(1, 7),
            _make_ue(2, 8),
        ]
        teacher = MagicMock()
        teacher.id = 42
        teacher.per_session_rate = Decimal("30000")

        with patch("app_hr.payroll_funcs.UserEvent.objects.filter") as mock_filter:
            mock_filter.return_value.order_by.return_value.prefetch_related.return_value.all.return_value = (
                ues
            )
            result = get_session_based_payments(
                teacher, 3, 2025, "UTC", course_id=None
            )

        self.assertEqual(result["aggregate"]["session_count"], 8)
        self.assertAlmostEqual(result["aggregate"]["per_session_rate"], 30000.0, places=5)
        self.assertAlmostEqual(result["aggregate"]["total_earnings"], 240000.0, places=5)
        self.assertEqual(len(result["data"]), 8)

    def test_zero_rate_when_per_session_rate_not_set(self):
        ues = [_make_ue(1, 1), _make_ue(1, 2)]
        teacher = MagicMock()
        teacher.id = 42
        teacher.per_session_rate = None

        with patch("app_hr.payroll_funcs.UserEvent.objects.filter") as mock_filter:
            mock_filter.return_value.order_by.return_value.prefetch_related.return_value.all.return_value = (
                ues
            )
            result = get_session_based_payments(
                teacher, 3, 2025, "UTC", course_id=None
            )

        self.assertEqual(result["aggregate"]["session_count"], 2)
        self.assertAlmostEqual(result["aggregate"]["per_session_rate"], 0.0, places=5)
        self.assertAlmostEqual(result["aggregate"]["total_earnings"], 0.0, places=5)

    def test_no_sessions_returns_zero_totals(self):
        teacher = MagicMock()
        teacher.id = 42
        teacher.per_session_rate = Decimal("30000")

        with patch("app_hr.payroll_funcs.UserEvent.objects.filter") as mock_filter:
            mock_filter.return_value.order_by.return_value.prefetch_related.return_value.all.return_value = (
                []
            )
            result = get_session_based_payments(
                teacher, 3, 2025, "UTC", course_id=None
            )

        self.assertEqual(result["aggregate"]["session_count"], 0)
        self.assertAlmostEqual(result["aggregate"]["total_earnings"], 0.0, places=5)
        self.assertEqual(result["data"], [])

    def test_course_id_filter_passed_to_query(self):
        teacher = MagicMock()
        teacher.id = 42
        teacher.per_session_rate = Decimal("1000")

        with patch("app_hr.payroll_funcs.UserEvent.objects.filter") as mock_filter:
            mock_filter.return_value.order_by.return_value.prefetch_related.return_value.all.return_value = (
                []
            )
            get_session_based_payments(teacher, 3, 2025, "UTC", course_id=99)

        mock_filter.assert_called_once()
        call_kwargs = mock_filter.call_args[1]
        self.assertEqual(call_kwargs["event__course_id"], 99)
