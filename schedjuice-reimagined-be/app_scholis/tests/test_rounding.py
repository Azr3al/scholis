"""
The rounding policy for marks written into the gradebook.

Scholis scores are exact decimals; ``ResultCell.marks`` is an integer. Something
has to decide what 12.5 becomes, and the wrong decision is invisible in code
review and very visible on a report card.

These tests run against unsaved model instances, so they need no database. The
point is the policy, and the policy is arithmetic.
"""
from __future__ import annotations

from decimal import Decimal

from django.test import SimpleTestCase

from app_scholis.models import ScholisScore


def _score(value) -> ScholisScore:
    """An unsaved row: enough to exercise the property, no database involved."""
    return ScholisScore(score=Decimal(value), max_score=Decimal("100"))


class RoundedMarksTest(SimpleTestCase):
    def test_ties_go_up_where_the_builtin_would_go_down(self):
        # The whole reason for this property. Python's round() is banker's
        # rounding: it sends a tie to the nearest *even* integer, so round(12.5)
        # == 12 and round(2.5) == 2. A teacher who types 12.5 into a spreadsheet
        # gets 13, and the gradebook should agree with their spreadsheet rather
        # than with Python's default.
        #
        # Only ties with an even integer part differ. 1.5 and 3.5 round up under
        # both policies because the even neighbour is above, so they are asserted
        # separately rather than smuggled in here to make the test look broader.
        for value, expected in (("0.5", 1), ("2.5", 3), ("12.5", 13), ("30.5", 31)):
            with self.subTest(value=value):
                self.assertEqual(_score(value).rounded_marks, expected)
                # The same value under Python's default, which is the bug this
                # property exists to avoid.
                self.assertEqual(round(float(value)), expected - 1)

    def test_odd_part_ties_agree_with_the_builtin(self):
        # Not discriminating cases, but they must still be right, and asserting
        # them stops someone "fixing" half-up into something that adds one
        # everywhere.
        for value, expected in (("1.5", 2), ("3.5", 4), ("99.5", 100)):
            with self.subTest(value=value):
                self.assertEqual(_score(value).rounded_marks, expected)
                self.assertEqual(round(float(value)), expected)

    def test_below_a_tie_rounds_down(self):
        for value, expected in (("12.4", 12), ("12.49", 12), ("0.0", 0), ("0.49", 0)):
            with self.subTest(value=value):
                self.assertEqual(_score(value).rounded_marks, expected)

    def test_above_a_tie_rounds_up(self):
        for value, expected in (
            ("12.51", 13),
            ("12.6", 13),
            ("0.50001", 1),
            ("99.9", 100),
        ):
            with self.subTest(value=value):
                self.assertEqual(_score(value).rounded_marks, expected)

    def test_non_ties_agree_with_the_builtin_round(self):
        # Only the exact .5 cases should differ. Everything else must match what
        # anyone would expect, or the policy is not half-up, it is something else.
        for value in ("12.3", "12.7", "7.1", "7.9", "0.1", "0.9", "45.44", "45.56"):
            with self.subTest(value=value):
                self.assertEqual(_score(value).rounded_marks, round(float(value)))

    def test_zero_and_whole_numbers_pass_through(self):
        for value, expected in (("0", 0), ("1", 1), ("47", 47), ("100", 100)):
            with self.subTest(value=value):
                self.assertEqual(_score(value).rounded_marks, expected)

    def test_a_negative_tie_moves_away_from_zero(self):
        # ROUND_HALF_UP means "ties away from zero", not "ties towards positive
        # infinity". Scholis does not report negative scores, but a penalty or a
        # correction could, and the behaviour should be stated rather than
        # discovered by whichever teacher hits it first.
        self.assertEqual(_score("-2.5").rounded_marks, -3)
        self.assertEqual(_score("-2.4").rounded_marks, -2)

    def test_the_result_is_an_int_not_a_decimal(self):
        # ResultCell.marks is an integer column. A Decimal here would be coerced
        # somewhere downstream, and that coercion is not one we control.
        marks = _score("12.5").rounded_marks
        self.assertIsInstance(marks, int)
        self.assertNotIsInstance(marks, Decimal)


class ExactScoreIsPreservedTest(SimpleTestCase):
    """
    Rounding is for the gradebook projection only. The stored row keeps the
    exact figure, so the policy can change later and every cell can be recomputed
    without going back to Scholis for the numbers again.
    """

    def test_storing_does_not_round(self):
        self.assertEqual(_score("12.5").score, Decimal("12.5"))
        self.assertEqual(_score("12.34").score, Decimal("12.34"))

    def test_a_score_of_zero_is_not_confused_with_a_missing_one(self):
        # Both are falsy in Python. A `if score:` anywhere would silently drop
        # zeroes, which is exactly the kind of bug that shows up as "one student
        # has no mark" rather than as an error.
        zero = _score("0")
        self.assertFalse(zero.score)
        self.assertEqual(zero.rounded_marks, 0)
        self.assertIsNotNone(zero.score)
