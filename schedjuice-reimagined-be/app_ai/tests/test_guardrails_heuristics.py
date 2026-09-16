from django.test import TestCase

from app_ai.guardrails.heuristics import scan_heuristics
from app_ai.guardrails.types import HeuristicVerdict


class HeuristicRejectTests(TestCase):
    def test_pure_math_rejected(self):
        self.assertEqual(
            scan_heuristics("what is 2 + 2525 ?"),
            HeuristicVerdict.REJECT,
        )

    def test_trivia_rejected(self):
        self.assertEqual(
            scan_heuristics("what is the capital of France"),
            HeuristicVerdict.REJECT,
        )

    def test_creative_writing_rejected(self):
        self.assertEqual(
            scan_heuristics("write me a poem about cats"),
            HeuristicVerdict.REJECT,
        )

    def test_empty_rejected(self):
        self.assertEqual(scan_heuristics("   "), HeuristicVerdict.REJECT)


class HeuristicAllowTests(TestCase):
    def test_school_keywords_allowed(self):
        self.assertEqual(
            scan_heuristics("find students named Sarah in Grade 7"),
            HeuristicVerdict.ALLOW,
        )

    def test_staff_lookup_allowed(self):
        self.assertEqual(
            scan_heuristics("who teaches math this semester"),
            HeuristicVerdict.ALLOW,
        )


class HeuristicUncertainTests(TestCase):
    def test_short_name_lookup_uncertain(self):
        self.assertEqual(
            scan_heuristics("find Sarah"),
            HeuristicVerdict.UNCERTAIN,
        )


class HeuristicFollowUpTests(TestCase):
    def test_follow_up_without_keywords_allowed_with_history(self):
        history = [
            {"role": "user", "text": "find students named Sarah"},
            {"role": "model", "text": "Found 2 students named Sarah."},
        ]
        self.assertEqual(
            scan_heuristics("what courses do they teach", history=history),
            HeuristicVerdict.ALLOW,
        )
