from django.test import SimpleTestCase

from app_course.roster_match import find_roster_name_substring_in_text


class RosterSubstringMatchTests(SimpleTestCase):
    def test_name_found_in_notes(self):
        roster = [{"id": 1, "name": "Zayar Lin San", "alternative_name": ""}]
        hit = find_roster_name_substring_in_text(
            "Zayar Lin San KET 185Fees September",
            roster,
        )
        self.assertEqual(hit["user"]["id"], 1)
        self.assertEqual(hit["score"], 100.0)

    def test_case_insensitive_substring(self):
        roster = [{"id": 2, "name": "Yoon Thuri", "alternative_name": ""}]
        hit = find_roster_name_substring_in_text("Yoon thuri ko PET 154", roster)
        self.assertEqual(hit["user"]["id"], 2)
