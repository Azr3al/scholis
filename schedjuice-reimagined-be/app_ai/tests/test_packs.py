from types import SimpleNamespace

from django.test import SimpleTestCase

from app_ai.packs import (
    LEGACY_FULL_PACK_IDS,
    resolve_enabled_pack_ids,
    resolve_tools_for_org,
)
from app_ai.tenant_context import build_system_context


class ResolveEnabledPackIdsTests(SimpleTestCase):
    def test_none_org_uses_legacy(self):
        self.assertEqual(resolve_enabled_pack_ids(None), list(LEGACY_FULL_PACK_IDS))

    def test_empty_list_is_core_only(self):
        org = SimpleNamespace(ai_enabled_packs=[])
        self.assertEqual(resolve_enabled_pack_ids(org), [])


class ResolveToolsForOrgTests(SimpleTestCase):
    def test_empty_packs_only_core_tools(self):
        org = SimpleNamespace(
            ai_enabled_packs=[],
            is_staff_points_enabled=True,
        )
        names = {t.name for t in resolve_tools_for_org(org)}
        self.assertEqual(
            names,
            {"search_users", "search_courses", "set_ai_preferences"},
        )
        self.assertNotIn("get_unpaid_students", names)
        self.assertNotIn("count_organization", names)

    def test_finance_pack_adds_unpaid(self):
        org = SimpleNamespace(
            ai_enabled_packs=["finance"],
            is_staff_points_enabled=False,
        )
        names = {t.name for t in resolve_tools_for_org(org)}
        self.assertIn("get_unpaid_students", names)
        self.assertIn("search_users", names)

    def test_staff_points_pack_still_needs_feature(self):
        from app_ai.tools.registry import list_tools_for_cache

        org = SimpleNamespace(
            ai_enabled_packs=["staff_points"],
            is_staff_points_enabled=False,
        )
        names = {t.name for t in list_tools_for_cache(org)}
        self.assertNotIn("list_point_types", names)
        self.assertIn("search_users", names)


class PackPromptTests(SimpleTestCase):
    def test_finance_snippet_present_when_enabled(self):
        org = SimpleNamespace(
            name="Test School",
            ai_school_context="",
            ai_assistant_instructions="",
            is_fm_hm_course_display_enabled=False,
            ai_enabled_packs=["finance"],
        )
        text = build_system_context(org)
        self.assertIn("Enabled capability packs:", text)
        self.assertIn("Finance pack:", text)

    def test_finance_snippet_absent_when_core_only(self):
        org = SimpleNamespace(
            name="Test School",
            ai_school_context="",
            ai_assistant_instructions="",
            is_fm_hm_course_display_enabled=False,
            ai_enabled_packs=[],
        )
        text = build_system_context(org)
        self.assertNotIn("Enabled capability packs:", text)
        self.assertNotIn("Finance pack:", text)
