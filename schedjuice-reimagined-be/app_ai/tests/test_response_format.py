from django.test import TestCase

from app_ai.response_format import cleanup_ai_response_text


class CleanupAiResponseTextTests(TestCase):
    def test_strips_user_id_suffix(self):
        text = "Student Bruce (ID: 3812) is enrolled in:"
        self.assertEqual(
            cleanup_ai_response_text(text),
            "Student Bruce is enrolled in:",
        )

    def test_strips_course_id_suffix(self):
        text = "• test course 3 (Course ID: 94)"
        self.assertEqual(
            cleanup_ai_response_text(text),
            "• test course 3",
        )

    def test_case_insensitive_id_suffix(self):
        text = "Bruce (id: 12)"
        self.assertEqual(cleanup_ai_response_text(text), "Bruce")

    def test_leaves_markdown_links_unchanged(self):
        text = "[Bruce](https://schedjuice.thiha.net/users/3812) (bruce@school.com)"
        self.assertEqual(cleanup_ai_response_text(text), text)

    def test_empty_string(self):
        self.assertEqual(cleanup_ai_response_text(""), "")
