from django.test import SimpleTestCase

from app_grading_reports.mark_sheet_inference import (
    column_is_burmese_name_candidate,
    column_is_grade_column,
    infer_import_columns,
    is_attendance_header,
    parse_max_marks_from_header,
    rubric_columns_for_commit,
    validate_section_max_marks,
)


class MarkSheetInferenceHelperTests(SimpleTestCase):
    def test_parse_max_marks_from_m_suffix(self):
        self.assertEqual(parse_max_marks_from_header("Reading and UoE(81M)"), 81)
        self.assertEqual(parse_max_marks_from_header("Writing (20M)"), 20)
        self.assertEqual(parse_max_marks_from_header("Total (173 marks)"), 173)

    def test_grade_column_detected_by_header_and_values(self):
        self.assertTrue(column_is_grade_column("R&W Grade", ["A+", "B", "B"]))
        self.assertFalse(column_is_grade_column("Reading Mark", ["53", "28"]))

    def test_burmese_candidate_short_non_grade(self):
        self.assertTrue(column_is_burmese_name_candidate(["က", "မ", "း"]))
        self.assertFalse(column_is_burmese_name_candidate(["A+", "B"]))

    def test_attendance_header(self):
        self.assertTrue(is_attendance_header("days attended"))
        self.assertFalse(is_attendance_header("reading mark"))


class MarkSheetImportInferenceTests(SimpleTestCase):
    def test_serial_number_header_is_ignored_not_mapped(self):
        headers = ["No.", "English name", "Score (20M)"]
        rows = [["1", "Paul", "18"]]
        columns, mapping = infer_import_columns(headers, rows)
        self.assertNotIn("no", mapping)
        self.assertEqual(columns[0]["kind"], "ignored")

    def test_reading_uoe_layout(self):
        headers = [
            "No.",
            "English name",
            "Reading and UoE(81M)",
            "R&W Grade",
            "Writing (20M)",
            "W Grade",
        ]
        rows = [["1", "Paul", "53", "B", "28", "B"]]
        cols, mapping = infer_import_columns(headers, rows)
        kinds = {c["title"]: c["kind"] for c in cols}
        self.assertEqual(kinds["Reading and UoE(81M)"], "score")
        self.assertEqual(cols[2]["max_marks"], 81)
        self.assertEqual(kinds["R&W Grade"], "ignored")
        self.assertEqual(kinds["W Grade"], "ignored")
        self.assertEqual(mapping.get("name"), 1)

    def test_burmese_fallback_column_mapping(self):
        headers = ["No.", "English name", "မြ", "Score"]
        rows = [
            ["1", "Paul", "က", "50"],
            ["2", "David", "မ", "40"],
        ]
        _, mapping = infer_import_columns(headers, rows)
        self.assertEqual(mapping.get("alternative_name"), 2)

    def test_section_total_warning(self):
        headers = ["Reading (81M)", "Writing (20M)", "Total (173M)"]
        rows = [["50", "10", "60"]]
        cols, _ = infer_import_columns(headers, rows)
        warnings = validate_section_max_marks(cols)
        self.assertTrue(any("173" in w for w in warnings))

    def test_rubric_commit_score_only(self):
        cols, _ = infer_import_columns(
            ["No.", "Reading (81M)", "Grade", "Total (173M)"],
            [["1", "50", "B", "50"]],
        )
        committed = rubric_columns_for_commit(cols)
        self.assertEqual(len(committed), 1)
        self.assertEqual(committed[0]["kind"], "score")

    def test_attendance_column_ignored(self):
        headers = ["No.", "Days attended", "Reading (20M)"]
        rows = [["1", "18", "15"]]
        cols, _ = infer_import_columns(headers, rows)
        kinds = {c["title"]: c["kind"] for c in cols}
        self.assertEqual(kinds["Days attended"], "ignored")
