from django.test import SimpleTestCase

from app_course.course_title_matching import normalize_course_title
from app_course.import_matching import match_course_names

CATALOG = [
    {
        "id": 5,
        "title": "Year 2 Section R1 - Academic Year 2026-2027",
        "code": "Y2R1",
        "academic_year": "2026-2027",
        "student_count": 24,
    },
    {
        "id": 8,
        "title": "Year 2 Mathematics - R1",
        "code": "MATH-Y2",
        "academic_year": "2026-2027",
        "student_count": 24,
    },
    {
        "id": 9,
        "title": "Year 3 Mathematics - R1",
        "code": "MATH-Y3",
        "academic_year": "2026-2027",
        "student_count": 19,
    },
]

INTAKE_CATALOG = [
    {
        "id": 42,
        "title": "EC Program LW (3 Months) - Import Intake",
        "code": "LW",
        "academic_year": "Import Intake",
        "student_count": 12,
        "program_name": "EC Program",
        "intake_name": "Import Intake",
    },
    {
        "id": 43,
        "title": "EC Program TX - Import Intake",
        "code": "TX",
        "academic_year": "Import Intake",
        "student_count": 10,
        "program_name": "EC Program",
        "intake_name": "Import Intake",
    },
]


class NormalizeCourseTitleTest(SimpleTestCase):
    def test_strips_academic_year_suffix(self):
        self.assertEqual(
            normalize_course_title("Year 2 Section R1 - Academic Year 2026-2027"),
            "year 2 section r1",
        )

    def test_handles_none(self):
        self.assertEqual(normalize_course_title(None), "")

    def test_strips_program_and_intake_from_required_strategy_title(self):
        self.assertEqual(
            normalize_course_title(
                "EC Program LW (3 Months) - Import Intake",
                program_name="EC Program",
                intake_name="Import Intake",
            ),
            "lw (3 months)",
        )

    def test_strips_intake_only_from_multi_strategy_title(self):
        self.assertEqual(
            normalize_course_title(
                "Year 1 Section A - 2026 Intake",
                intake_name="2026 Intake",
            ),
            "year 1 section a",
        )

    def test_leaves_non_matching_titles_unchanged(self):
        self.assertEqual(
            normalize_course_title(
                "Algebra II",
                program_name="EC Program",
                intake_name="Import Intake",
            ),
            "algebra ii",
        )


class MatchCourseNamesTest(SimpleTestCase):
    def test_exact_normalized_match_is_linked(self):
        out = match_course_names(["Year 2 Section R1"], tier1=CATALOG, tier2=[])
        res = out["Year 2 Section R1"]
        self.assertEqual(res["status"], "linked")
        self.assertEqual(res["match"]["id"], 5)

    def test_ambiguous_match_needs_attention_with_candidates(self):
        out = match_course_names(["Math"], tier1=CATALOG, tier2=[])
        res = out["Math"]
        self.assertEqual(res["status"], "needs_attention")
        self.assertIsNone(res["match"])
        self.assertGreaterEqual(len(res["candidates"]), 2)
        scores = [c["score"] for c in res["candidates"]]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_no_match_even_in_tier2_is_none(self):
        out = match_course_names(["Underwater Basket Weaving"], tier1=CATALOG, tier2=[])
        self.assertEqual(out["Underwater Basket Weaving"]["status"], "none")

    def test_blank_name_is_none(self):
        out = match_course_names(["   "], tier1=CATALOG, tier2=[])
        self.assertEqual(out["   "]["status"], "none")

    def test_falls_back_to_tier2_when_tier1_empty(self):
        out = match_course_names(["Year 2 Section R1"], tier1=[], tier2=CATALOG)
        self.assertEqual(out["Year 2 Section R1"]["status"], "linked")

    def test_short_token_links_to_intake_generated_title(self):
        out = match_course_names(["LW"], tier1=INTAKE_CATALOG, tier2=[])
        res = out["LW"]
        self.assertEqual(res["status"], "linked")
        self.assertEqual(res["match"]["id"], 42)

    def test_full_title_links_with_scope_normalization(self):
        out = match_course_names(
            ["EC Program TX - Import Intake"],
            tier1=INTAKE_CATALOG,
            tier2=[],
            scope_program_name="EC Program",
            scope_intake_name="Import Intake",
        )
        res = out["EC Program TX - Import Intake"]
        self.assertEqual(res["status"], "linked")
        self.assertEqual(res["match"]["id"], 43)
