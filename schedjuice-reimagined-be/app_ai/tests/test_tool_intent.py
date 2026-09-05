from django.test import SimpleTestCase
from unittest.mock import MagicMock

import unittest

from app_ai.tools.intent import (
    TurnIntent,
    classify_turn_intent,
    is_cancel_reply,
    parse_disambiguation_reply,
)
from app_ai.tools.registry import list_tools_for_turn


class IntentClassifierTests(SimpleTestCase):
    def test_read_intent_default(self):
        self.assertEqual(classify_turn_intent("how many students"), TurnIntent.READ)

    def test_write_intent_points(self):
        self.assertEqual(
            classify_turn_intent("award James 5 merit points for teamwork"),
            TurnIntent.WRITE,
        )

    def test_write_intent_enroll(self):
        self.assertEqual(
            classify_turn_intent("enroll James in PET 151"),
            TurnIntent.WRITE,
        )

    def test_write_intent_remove_him_from_course(self):
        self.assertEqual(
            classify_turn_intent("remove him from KET 152"),
            TurnIntent.WRITE,
        )

    def test_write_intent_assign_person_to_course(self):
        self.assertEqual(
            classify_turn_intent("assign Myat Pann Khwar Nyo to KET 140 WE"),
            TurnIntent.WRITE,
        )

    def test_write_intent_try_again(self):
        self.assertEqual(classify_turn_intent("try again"), TurnIntent.WRITE)

    def test_write_intent_points_remove_from_still_points(self):
        self.assertEqual(
            classify_turn_intent("remove 5 merit points from James"),
            TurnIntent.WRITE,
        )

    def test_write_intent_colloquial_one_extra(self):
        self.assertEqual(
            classify_turn_intent("give him one extra for being too handsome"),
            TurnIntent.WRITE,
        )

    def test_write_intent_colloquial_one_more(self):
        self.assertEqual(
            classify_turn_intent("award her one more for great work"),
            TurnIntent.WRITE,
        )

    def test_read_intent_no_false_positive_on_book(self):
        self.assertEqual(
            classify_turn_intent("give him one book"),
            TurnIntent.READ,
        )

    def test_force_write_overrides_read_prompt(self):
        self.assertEqual(
            classify_turn_intent("how many students", force_write=True),
            TurnIntent.WRITE,
        )

    def test_disambiguation_letter(self):
        candidates = [
            {"key": "A", "id": 1, "name": "Jamey"},
            {"key": "B", "id": 2, "name": "James"},
        ]
        self.assertEqual(parse_disambiguation_reply("B", candidates=candidates), 2)

    def test_disambiguation_name(self):
        candidates = [
            {"key": "A", "id": 1, "name": "Jamey"},
            {"key": "B", "id": 2, "name": "James"},
        ]
        self.assertEqual(parse_disambiguation_reply("James", candidates=candidates), 2)

    def test_cancel_reply_accepts_exact_synonyms(self):
        for q in ("cancel", "Nevermind", "never mind", "ABORT", "stop", "no"):
            with self.subTest(q=q):
                self.assertTrue(is_cancel_reply(q))

    def test_cancel_reply_rejects_non_exact(self):
        for q in ("cancel that", "please cancel", "nope", ""):
            with self.subTest(q=q):
                self.assertFalse(is_cancel_reply(q))


class ToolSubsetTests(unittest.TestCase):
    def _org(self, *, points_enabled: bool):
        from app_ai.packs import LEGACY_FULL_PACK_IDS

        org = MagicMock()
        org.is_staff_points_enabled = points_enabled
        org.ai_enabled_packs = list(LEGACY_FULL_PACK_IDS)
        return org

    def test_read_without_points_returns_core_read_surface(self):
        names = {
            t.name
            for t in list_tools_for_turn(
                intent=TurnIntent.READ,
                org=self._org(points_enabled=False),
            )
        }
        # Legacy packs, no staff_points feature: all read tools + set_ai_preferences.
        self.assertEqual(len(names), 11)
        self.assertIn("get_unpaid_students", names)
        self.assertNotIn("adjust_staff_points", names)

    def test_write_with_points_includes_roster_tools(self):
        names = {
            t.name
            for t in list_tools_for_turn(
                intent=TurnIntent.WRITE,
                org=self._org(points_enabled=True),
            )
        }
        self.assertIn("adjust_staff_points", names)
        self.assertIn("enroll_student_in_course", names)
        self.assertIn("search_users", names)
        # Legacy packs + staff_points feature: full current registry size.
        self.assertEqual(len(names), 18)
