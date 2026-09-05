import datetime as dt
import unittest

from app_auth.shortcuts_availability_helpers import (
    filter_dates_by_day_parity,
    parse_day_parity_param,
)


class ParseDayParityParamTests(unittest.TestCase):
    def test_empty_and_all_default_to_all(self):
        self.assertEqual(parse_day_parity_param(""), "all")
        self.assertEqual(parse_day_parity_param("all"), "all")
        self.assertEqual(parse_day_parity_param("  ALL  "), "all")

    def test_even_and_odd(self):
        self.assertEqual(parse_day_parity_param("even"), "even")
        self.assertEqual(parse_day_parity_param("ODD"), "odd")

    def test_rejects_invalid(self):
        with self.assertRaises(ValueError):
            parse_day_parity_param("both")


class FilterDatesByDayParityTests(unittest.TestCase):
    dates = [
        dt.date(2026, 8, 1),
        dt.date(2026, 8, 2),
        dt.date(2026, 8, 3),
        dt.date(2026, 8, 4),
    ]

    def test_all_returns_copy_semantics(self):
        self.assertEqual(filter_dates_by_day_parity(self.dates, "all"), self.dates)

    def test_odd_days_only(self):
        odd = filter_dates_by_day_parity(self.dates, "odd")
        self.assertEqual(odd, [dt.date(2026, 8, 1), dt.date(2026, 8, 3)])

    def test_even_days_only(self):
        even = filter_dates_by_day_parity(self.dates, "even")
        self.assertEqual(even, [dt.date(2026, 8, 2), dt.date(2026, 8, 4)])
