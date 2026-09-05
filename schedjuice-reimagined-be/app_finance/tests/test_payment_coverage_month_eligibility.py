from datetime import date
from types import SimpleNamespace

from django.test import TestCase

from app_finance.payment_coverage import (
    calendar_month_overlaps_course,
    resolve_suggested_payment_month,
)


def _course(start: date | None, end: date | None):
    return SimpleNamespace(start_date=start, end_date=end)


class CalendarMonthOverlapsCourseTests(TestCase):
    def test_july_before_october_start_course(self):
        course = _course(date(2026, 10, 3), date(2027, 2, 28))
        self.assertFalse(calendar_month_overlaps_course(course, 2026, 7))

    def test_october_overlaps_october_start_course(self):
        course = _course(date(2026, 10, 3), date(2027, 2, 28))
        self.assertTrue(calendar_month_overlaps_course(course, 2026, 10))

    def test_missing_dates_treated_as_applicable(self):
        course = _course(None, date(2027, 2, 28))
        self.assertTrue(calendar_month_overlaps_course(course, 2026, 7))
        course = _course(date(2026, 10, 3), None)
        self.assertTrue(calendar_month_overlaps_course(course, 2026, 7))


class ResolveSuggestedPaymentMonthTests(TestCase):
    def test_before_course_returns_start_month(self):
        course = _course(date(2026, 10, 3), date(2027, 2, 28))
        self.assertEqual(
            resolve_suggested_payment_month(course, today=date(2026, 7, 15)),
            (2026, 10),
        )

    def test_after_course_returns_end_month(self):
        course = _course(date(2026, 1, 1), date(2026, 6, 30))
        self.assertEqual(
            resolve_suggested_payment_month(course, today=date(2027, 1, 5)),
            (2026, 6),
        )

    def test_today_in_range_returns_today_month(self):
        course = _course(date(2026, 3, 1), date(2026, 12, 31))
        self.assertEqual(
            resolve_suggested_payment_month(course, today=date(2026, 6, 10)),
            (2026, 6),
        )

    def test_missing_dates_returns_none(self):
        self.assertIsNone(resolve_suggested_payment_month(_course(None, None)))
