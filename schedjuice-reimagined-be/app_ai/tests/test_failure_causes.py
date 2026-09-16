import unittest

from app_ai.failure_causes import (
    LIKELY_CAUSE_COMPLEX_TASK,
    LIKELY_CAUSE_MODEL_LOOP,
    LIKELY_CAUSE_TOOL_DESCRIPTIONS,
    LIKELY_CAUSE_UNKNOWN,
    VALID_LIKELY_CAUSES,
    classify_tool_limit_causes,
)


class ClassifyToolLimitCausesTests(unittest.TestCase):
    def test_empty_tool_calls_returns_unknown(self):
        self.assertEqual(classify_tool_limit_causes([]), [LIKELY_CAUSE_UNKNOWN])

    def test_same_tool_retry_with_failures(self):
        calls = [
            {"name": "adjust_staff_points", "ok": False, "error": "Unexpected arguments: adjustment"},
            {"name": "adjust_staff_points", "ok": False, "error": "Unexpected arguments: change"},
            {"name": "adjust_staff_points", "ok": False, "error": "Missing required argument: direction"},
            {"name": "adjust_staff_points", "ok": False, "error": "Missing required argument: note"},
            {"name": "adjust_staff_points", "ok": True, "error": ""},
        ]
        self.assertEqual(
            classify_tool_limit_causes(calls),
            [LIKELY_CAUSE_TOOL_DESCRIPTIONS, LIKELY_CAUSE_MODEL_LOOP],
        )

    def test_three_unique_tools_complex_task(self):
        calls = [
            {"name": "list_point_types", "ok": True, "error": ""},
            {"name": "get_staff_point_balances", "ok": True, "error": ""},
            {"name": "search_courses", "ok": True, "error": ""},
        ]
        self.assertEqual(classify_tool_limit_causes(calls), [LIKELY_CAUSE_COMPLEX_TASK])

    def test_mixed_both_badges(self):
        calls = [
            {"name": "search_courses", "ok": True, "error": ""},
            {"name": "search_users", "ok": True, "error": ""},
            {"name": "adjust_staff_points", "ok": False, "error": "bad args"},
            {"name": "adjust_staff_points", "ok": True, "error": ""},
        ]
        self.assertEqual(
            classify_tool_limit_causes(calls),
            [LIKELY_CAUSE_TOOL_DESCRIPTIONS, LIKELY_CAUSE_COMPLEX_TASK],
        )

    def test_two_tools_no_match(self):
        calls = [
            {"name": "search_courses", "ok": True, "error": ""},
            {"name": "search_users", "ok": True, "error": ""},
        ]
        self.assertEqual(classify_tool_limit_causes(calls), [])

    def test_single_failed_call_no_retry(self):
        calls = [{"name": "search_courses", "ok": False, "error": "not found"}]
        self.assertEqual(classify_tool_limit_causes(calls), [])

    def test_same_tool_twice_both_ok(self):
        calls = [
            {"name": "search_courses", "ok": True, "error": ""},
            {"name": "search_courses", "ok": True, "error": ""},
        ]
        self.assertEqual(classify_tool_limit_causes(calls), [])

    def test_skips_entries_without_name(self):
        calls = [
            {"ok": False, "error": "x"},
            {"name": "search_courses", "ok": True, "error": ""},
            {"name": "search_users", "ok": True, "error": ""},
            {"name": "search_courses", "ok": True, "error": ""},
        ]
        self.assertEqual(classify_tool_limit_causes(calls), [])

    def test_same_tool_three_times_model_loop(self):
        calls = [
            {"name": "get_course_roster", "ok": True, "error": ""},
            {"name": "get_course_roster", "ok": True, "error": ""},
            {"name": "get_course_roster", "ok": True, "error": ""},
        ]
        self.assertEqual(
            classify_tool_limit_causes(calls),
            [LIKELY_CAUSE_MODEL_LOOP],
        )

    def test_mt_roster_thrash_pattern(self):
        calls = [{"name": "get_course_roster", "ok": True, "error": ""}] * 6 + [
            {"name": "search_courses", "ok": True, "error": ""},
        ]
        self.assertEqual(
            classify_tool_limit_causes(calls),
            [LIKELY_CAUSE_MODEL_LOOP],
        )

    def test_valid_likely_causes_includes_filter_tokens(self):
        self.assertIn(LIKELY_CAUSE_TOOL_DESCRIPTIONS, VALID_LIKELY_CAUSES)
        self.assertIn(LIKELY_CAUSE_MODEL_LOOP, VALID_LIKELY_CAUSES)
        self.assertIn("uncategorized", VALID_LIKELY_CAUSES)
