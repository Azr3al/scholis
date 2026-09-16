from decimal import Decimal

from django.test import SimpleTestCase

from app_grading_reports.mark_sheet_services import (
    compute_sheet_totals,
    infer_rubric_columns,
    jaccard_similarity,
    normalize_column_title,
    rubric_signature,
)


class MarkSheetServiceTests(SimpleTestCase):
    def test_normalize_column_title(self):
        self.assertEqual(normalize_column_title("  Content  "), "content")

    def test_rubric_signature_score_columns_only(self):
        cols = [
            {"title": "Content", "kind": "score"},
            {"title": "Total", "kind": "computed_total"},
            {"title": "No.", "kind": "identifier"},
        ]
        self.assertEqual(rubric_signature(cols), frozenset({"content"}))

    def test_jaccard_threshold(self):
        a = frozenset({"content", "language", "organization"})
        b = frozenset({"content", "language", "organization", "communicative achievement"})
        self.assertGreaterEqual(jaccard_similarity(a, b), 0.75)

    def test_infer_classifies_identifier_and_score(self):
        headers = ["No.", "English name", "Content", "Language", "Total (40) mark"]
        rows = [
            ["1", "Paul", "4", "3.5", "28"],
            ["2", "David", "3", "4", "30"],
        ]
        cols = infer_rubric_columns(headers, rows)
        kinds = {c["title"]: c["kind"] for c in cols}
        self.assertEqual(kinds["English name"], "identifier")
        self.assertEqual(kinds["Content"], "score")
        self.assertEqual(kinds["Total (40) mark"], "computed_total")

    def test_compute_sheet_totals(self):
        rubric_columns = [
            {"key": "c1", "kind": "score"},
            {"key": "c2", "kind": "score"},
            {"key": "total", "kind": "computed_total"},
        ]
        cells = {
            (10, "c1"): Decimal("4.0"),
            (10, "c2"): Decimal("3.5"),
        }
        totals = compute_sheet_totals(rubric_columns, cells)
        self.assertEqual(totals["10:total"], Decimal("7.5"))
