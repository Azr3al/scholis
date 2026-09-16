from django.test import TestCase, override_settings

from app_ai.tools.limits import clamp_tool_payload


@override_settings(AI_TOOL_RESULT_MAX_ITEMS=2, AI_TOOL_RESULT_MAX_CHARS=500)
class ClampToolPayloadTests(TestCase):
    def test_top_level_list_trimmed_and_wrapped(self):
        payload = [{"id": i, "name": f"User {i}"} for i in range(5)]
        result = clamp_tool_payload(payload)
        self.assertEqual(result["truncated"], True)
        self.assertEqual(len(result["results"]), 2)

    def test_nested_groups_trimmed(self):
        payload = {
            "groups": [
                {
                    "category": {"name": "A"},
                    "courses": [{"course_id": 1}, {"course_id": 2}, {"course_id": 3}],
                },
                {
                    "category": {"name": "B"},
                    "courses": [{"course_id": 4}],
                },
            ]
        }
        result = clamp_tool_payload(payload)
        self.assertTrue(result.get("truncated"))
        self.assertEqual(len(result["groups"]), 2)
        self.assertEqual(len(result["groups"][0]["courses"]), 2)

    def test_char_ceiling_marks_truncated(self):
        payload = {
            "courses": [
                {"title": "x" * 200, "course_id": i}
                for i in range(10)
            ]
        }
        result = clamp_tool_payload(payload, max_items=10, max_chars=120)
        self.assertTrue(result.get("truncated"))
