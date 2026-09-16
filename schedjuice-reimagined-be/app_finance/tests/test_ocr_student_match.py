from django.test import SimpleTestCase

from app_finance.payment_ocr_student import (
    _best_match_for_notes,
    find_roster_in_parsed_lines,
    looks_like_course_title,
    map_roster_match_to_ocr_fields,
    note_name_candidates,
)


def _ref(uid: int, name: str) -> dict:
    return {
        "id": uid,
        "name": name,
        "email": f"u{uid}@example.com",
        "code": f"c{uid}",
        "profile_image": None,
        "roles": [],
        "alternative_name": "",
    }


class MapRosterMatchToOcrFieldsTests(SimpleTestCase):
    def test_auto_when_exact(self):
        raw = {
            "kind": "exact",
            "user": {"id": 42, "name": "Zayar Lin San"},
            "score": 100.0,
            "candidates": [],
        }
        out = map_roster_match_to_ocr_fields(raw, notes_text="Zayar Lin San KET")
        self.assertEqual(out["student_match_kind"], "auto")
        self.assertEqual(out["suggested_student_id"], 42)

    def test_candidates_when_fuzzy_mid_tier(self):
        raw = {
            "kind": "fuzzy",
            "user": None,
            "score": 88.5,
            "candidates": [
                {"user": {"id": 42, "name": "Zayar Lin San"}, "score": 88.5},
            ],
        }
        out = map_roster_match_to_ocr_fields(raw, notes_text="Zayar Lin")
        self.assertEqual(out["student_match_kind"], "candidates")
        self.assertIsNone(out["suggested_student_id"])
        self.assertEqual(len(out["student_match_candidates"]), 1)

    def test_none_below_threshold(self):
        raw = {"kind": "fuzzy", "user": None, "score": 70.0, "candidates": []}
        out = map_roster_match_to_ocr_fields(raw, notes_text="xy")
        self.assertEqual(out["student_match_kind"], "none")


class NoteNameCandidateTests(SimpleTestCase):
    def test_strips_ket_suffix(self):
        self.assertIn(
            "Zayar Lin San",
            note_name_candidates("Zayar Lin San KET 185Fees September"),
        )

    def test_strips_ko_pet(self):
        self.assertIn("Yoon thuri", note_name_candidates("Yoon thuri ko PET 154"))

    def test_strips_parenthetical_course(self):
        self.assertIn(
            "Bhone Myat Khant",
            note_name_candidates("Bhone Myat Khant(Ket-183-Sat-Sun)"),
        )

    def test_strips_hyphen_ket(self):
        self.assertIn(
            "Khit Bhone Khant",
            note_name_candidates("Khit Bhone Khant-KET 184 September"),
        )

    def test_strips_flyers(self):
        self.assertIn(
            "SaungNadiLin",
            note_name_candidates("SaungNadiLin FLYERS207 SchoolFees for September"),
        )

    def test_course_title_is_detected(self):
        self.assertTrue(looks_like_course_title("KET reading and writing 2"))
        self.assertFalse(looks_like_course_title("Yoon thuri ko PET 154"))


class BestMatchForNotesTests(SimpleTestCase):
    def test_substring_after_tokenize(self):
        roster = [_ref(1, "Yoon Thuri")]
        hit = _best_match_for_notes("Yoon thuri ko PET 154", roster)
        self.assertEqual(hit["kind"], "exact")
        self.assertEqual(hit["user"]["id"], 1)

    def test_course_title_does_not_match(self):
        roster = [_ref(1, "Yoon Thuri")]
        hit = _best_match_for_notes("KET reading and writing 2", roster)
        self.assertEqual(hit["kind"], "none")


class FulltextFallbackTests(SimpleTestCase):
    def test_skips_beneficiary_and_matches_purpose_line(self):
        roster = [_ref(9, "Nan Phyu Shinmon")]
        text = (
            "Beneficiary Name\nDAW SU HTET ZAW\nAmount\nMMK 82500\n"
            "Nan Phyu Shinmon KET 150WE"
        )
        hit = find_roster_in_parsed_lines(text, roster)
        self.assertIsNotNone(hit)
        self.assertEqual(hit["user"]["id"], 9)

    def test_skips_all_caps_bank_party_names(self):
        roster = [_ref(3, "Moe Thida Hnin")]
        text = "MOE THIDA HNIN\nSU HTET ZAW\nKET reading and writing 2"
        self.assertIsNone(find_roster_in_parsed_lines(text, roster))
