from unittest.mock import patch

from django.test import TestCase, override_settings

from app_ai.org_datetime import build_org_datetime_context
from app_ai.prompts import build_platform_base_prompt
from app_ai.tenant_context import (
    build_system_context,
    build_system_context_preview,
    get_default_instructions_line,
    resolve_ai_model,
    resolve_max_context_turns,
    resolve_max_tool_iterations,
)
from app_organization.models import Organization

class TenantContextTests(TestCase):
    def test_build_system_context_includes_name_and_school_blurb(self):
        org = Organization(name="Demo School", ai_school_context="K-12 in Yangon.")
        text = build_system_context(org)
        self.assertIn("Demo School", text)
        self.assertIn("K-12 in Yangon.", text)
        self.assertIn("Refuse general", text)

    def test_build_system_context_excludes_org_local_today(self):
        org = Organization(name="Demo School")
        text = build_system_context(org)
        self.assertNotIn("Today's date (school timezone)", text)
        self.assertNotIn("Current date/time context", text)

    @patch("app_ai.org_datetime.org_today")
    def test_build_org_datetime_context_includes_year_and_directive(self, mock_today):
        from datetime import date

        mock_today.return_value = date(2026, 7, 7)
        org = Organization(name="Demo School")
        text = build_org_datetime_context(org)
        self.assertIn("Current date/time context", text)
        self.assertIn("Tuesday, 07 July 2026", text)
        self.assertIn("Current year: 2026", text)
        self.assertIn("always assume the current year", text.lower())

    @patch("app_ai.org_datetime.org_today")
    def test_build_system_context_preview_includes_datetime_block(self, mock_today):
        from datetime import date

        mock_today.return_value = date(2026, 7, 7)
        org = Organization(name="Demo School")
        preview = build_system_context_preview(org)
        base = build_system_context(org)
        self.assertIn(base, preview)
        self.assertIn("Current year: 2026", preview)

class PlatformPromptTests(TestCase):
    def test_platform_base_includes_org_name_and_scope_rules(self):
        org = Organization(name="SDEC International School")
        text = build_platform_base_prompt(org)
        self.assertIn("SDEC International School", text)
        self.assertIn("Refuse general", text)

    def test_platform_base_discourages_listing_multiple_emails(self):
        org = Organization(name="Demo School")
        text = build_platform_base_prompt(org)
        self.assertIn("do not list multiple email", text.lower())

    def test_platform_base_includes_query_courses_year_rules(self):
        org = Organization(name="Demo School")
        text = build_platform_base_prompt(org)
        self.assertIn("query_courses", text)
        self.assertIn("user_stated_year", text)
        self.assertIn("Never guess or assume historical years", text)
        self.assertIn("date_mode", text)

    def test_platform_base_includes_query_courses_starting_rules(self):
        org = Organization(name="Demo School")
        text = build_platform_base_prompt(org)
        self.assertIn("query_courses_starting", text)
        self.assertIn("start_date", text)
        self.assertIn("Ambiguous month-only questions", text)

    def test_build_system_context_uses_platform_base(self):
        org = Organization(
            name="Teacher Su International School",
            ai_school_context="K-12 in Yangon.",
            ai_assistant_instructions="Be formal.",
        )
        text = build_system_context(org)
        self.assertIn("Teacher Su International School", text)
        self.assertIn("K-12 in Yangon.", text)
        self.assertIn("Be formal.", text)
        self.assertIn("School context:", text)

    def test_preview_includes_datetime_block_beyond_cached_context(self):
        org = Organization(name="Demo School", ai_school_context="Small school.")
        base = build_system_context(org)
        preview = build_system_context_preview(org)
        self.assertIn(base, preview)
        self.assertIn("Current date/time context", preview)
        self.assertNotIn("Current date/time context", base)

    def test_default_instructions_when_org_blank(self):
        org = Organization(name="Demo School", ai_assistant_instructions="")
        text = build_system_context(org)
        self.assertIn(get_default_instructions_line(), text)

    @override_settings(AI_DEFAULT_MODEL="gpt-fallback")
    def test_resolve_model_uses_org_override(self):
        org = Organization(ai_default_model="gpt-override")
        self.assertEqual(resolve_ai_model(org), "gpt-override")

    @override_settings(AI_DEFAULT_MODEL="gpt-fallback")
    def test_resolve_model_falls_back_to_settings(self):
        org = Organization(ai_default_model=None)
        self.assertEqual(resolve_ai_model(org), "gpt-fallback")

    def test_resolve_max_context_turns_minimum_one(self):
        org = Organization(ai_max_context_turns=0)
        self.assertEqual(resolve_max_context_turns(org), 1)

    @override_settings(AI_MAX_TOOL_ITERATIONS=7)
    def test_resolve_max_tool_iterations_from_org(self):
        org = Organization(ai_max_tool_iterations=3)
        self.assertEqual(resolve_max_tool_iterations(org), 3)
