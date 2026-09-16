import unittest

from django.test import SimpleTestCase

from app_ai.packs import LEGACY_FULL_PACK_IDS
from app_ai.tools.intent import TurnIntent
from types import SimpleNamespace

from app_ai.tools.registry import TOOL_REGISTRY, list_tools_for_cache, list_tools_for_turn


class ToolMetadataTests(SimpleTestCase):
    def test_core_tools_are_read_exposure(self):
        for name in (
            "search_users",
            "search_courses",
            "count_organization",
            "count_teacher_courses",
            "count_course_roster",
            "get_course_roster",
            "list_user_courses",
            "query_courses",
            "query_courses_starting",
            "get_unpaid_students",
        ):
            tool = TOOL_REGISTRY[name]
            self.assertEqual(tool.exposure, "read", name)
            self.assertIsNone(tool.requires_feature, name)

    def test_points_tools_have_staff_points_feature(self):
        for name in (
            "list_point_types",
            "get_staff_point_balances",
            "adjust_staff_points",
        ):
            tool = TOOL_REGISTRY[name]
            self.assertEqual(tool.requires_feature, "staff_points", name)

    def test_adjust_staff_points_is_write(self):
        self.assertEqual(TOOL_REGISTRY["adjust_staff_points"].exposure, "write")

    def test_roster_write_tools_are_write(self):
        for name in (
            "enroll_student_in_course",
            "remove_student_from_course",
            "assign_staff_to_course",
            "remove_staff_from_course",
        ):
            self.assertEqual(TOOL_REGISTRY[name].exposure, "write", name)

    def test_set_ai_preferences_available_on_read_turn(self):
        tools = list_tools_for_turn(intent=TurnIntent.READ, org=None)
        names = {t.name for t in tools}
        self.assertIn("set_ai_preferences", names)


class ListToolsForCacheTests(SimpleTestCase):
    def _org(self, *, points_enabled: bool):
        return SimpleNamespace(
            is_staff_points_enabled=points_enabled,
            ai_enabled_packs=list(LEGACY_FULL_PACK_IDS),
        )

    def test_includes_write_tools_when_points_enabled(self):
        names = {t.name for t in list_tools_for_cache(self._org(points_enabled=True))}
        self.assertIn("adjust_staff_points", names)
        self.assertIn("search_users", names)

    def test_excludes_points_tools_when_disabled(self):
        names = {t.name for t in list_tools_for_cache(self._org(points_enabled=False))}
        self.assertNotIn("adjust_staff_points", names)
        self.assertNotIn("list_point_types", names)
        self.assertIn("search_users", names)

    def test_includes_set_ai_preferences_without_points(self):
        names = {t.name for t in list_tools_for_cache(self._org(points_enabled=False))}
        self.assertIn("set_ai_preferences", names)

    def test_empty_packs_hides_non_core_on_cache_list(self):
        org = SimpleNamespace(is_staff_points_enabled=True, ai_enabled_packs=[])
        names = {t.name for t in list_tools_for_cache(org)}
        self.assertEqual(
            names, {"search_users", "search_courses", "set_ai_preferences"}
        )
