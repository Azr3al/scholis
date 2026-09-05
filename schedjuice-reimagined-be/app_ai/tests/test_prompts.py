from django.test import SimpleTestCase
from unittest.mock import MagicMock

from app_ai.prompts import build_platform_base_prompt, build_roster_write_context


class PromptTemplateTests(SimpleTestCase):
    def test_roster_write_context_under_400_tokens(self):
        text = build_roster_write_context()
        self.assertLess(len(text.split()), 400)

    def test_platform_prompt_omits_duplicate_roster_rules(self):
        org = MagicMock()
        org.name = "Test School"
        text = build_platform_base_prompt(org)
        self.assertNotIn("Never claim roster membership changed", text)
        self.assertIn("session context on write-intent turns", text)

    def test_roster_write_context_maps_remove_to_tool(self):
        text = build_roster_write_context()
        self.assertIn("remove_staff_from_course", text)
        self.assertIn("NOT assign", text)
