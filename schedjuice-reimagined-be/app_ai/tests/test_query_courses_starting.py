import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.db import connection
from django.test import override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.tests.test_count_tools import _CountToolsTestBase
from app_ai.tools.query_courses import (
    DATE_MODE_STARTING,
    run_query_courses_starting,
)
from app_course.models import Category, Course, Program
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _clear_ai_org_cache(schema_name: str) -> None:
    cache = getattr(connection, "_ai_current_org_cache", None)
    if isinstance(cache, dict):
        cache.pop(schema_name, None)


def _titles(out: dict) -> list[str]:
    return [c["title"] for g in out["groups"] for c in g["courses"]]


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class QueryCoursesStartingTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = date(2026, 7, 7)
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"KET {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
        self.suffix = suffix

    @patch("app_ai.tools.query_courses.org_today")
    def test_includes_course_starting_first_day_of_month(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            july = Course.objects.create(
                title=f"July start {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertNotIn("error", out)
        self.assertIn(july.title, _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_excludes_course_starting_before_month(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            Course.objects.create(
                title=f"June start {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 6, 30),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertNotIn(f"June start {self.suffix}", _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_spanning_course_in_start_month_only(self, mock_today):
        mock_today.return_value = date(2026, 6, 15)
        with schema_context(self.schema_name):
            spanning = Course.objects.create(
                title=f"Spanning {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 6, 15),
                end_date=date(2026, 7, 15),
                status=Course.CourseStatus.ACTIVE,
            )
            june_out = run_query_courses_starting({"month": 6}, self.admin)
            july_out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertIn(spanning.title, _titles(june_out))
        self.assertNotIn(spanning.title, _titles(july_out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_includes_stored_planned_but_effectively_active(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            starters = Course.objects.create(
                title=f"Starters {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 6),
                end_date=date(2026, 11, 30),
                status=Course.CourseStatus.PLANNED,
            )
            out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertNotIn("error", out)
        self.assertIn(starters.title, _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_default_status_includes_planned(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            planned = Course.objects.create(
                title=f"Planned July {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 10),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.PLANNED,
            )
            out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertIn(planned.title, _titles(out))
        self.assertEqual(out["filters_applied"]["course_status"], "active_planned")

    @patch("app_ai.tools.query_courses.org_today")
    def test_explicit_active_excludes_future_planned(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            planned = Course.objects.create(
                title=f"Planned July {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 10),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.PLANNED,
            )
            out = run_query_courses_starting(
                {"month": 7, "course_status": "active"}, self.admin
            )
        self.assertNotIn(planned.title, _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_future_month_includes_planned_start(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            august = Course.objects.create(
                title=f"August start {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 8, 15),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.PLANNED,
            )
            out = run_query_courses_starting({"month": 8}, self.admin)
        self.assertIn(august.title, _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_status_all_includes_planned(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            planned = Course.objects.create(
                title=f"Planned July {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 10),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.PLANNED,
            )
            out = run_query_courses_starting(
                {"month": 7, "course_status": "all"}, self.admin
            )
        self.assertIn(planned.title, _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_teacher_denied(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses_starting({}, self.teacher)
        self.assertEqual(out["error"], "permission_denied")

    @patch("app_ai.tools.query_courses.org_today")
    def test_response_includes_date_mode_starting(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            Course.objects.create(
                title=f"July start {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertEqual(out["date_mode"], DATE_MODE_STARTING)
        self.assertEqual(out["filters_applied"]["date_mode"], DATE_MODE_STARTING)

    @patch("app_ai.tools.query_courses.org_today")
    def test_fm_filter_when_enabled(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_fm_hm_course_display_enabled = True
            org.save(update_fields=["is_fm_hm_course_display_enabled"])
        _clear_ai_org_cache(self.schema_name)
        with schema_context(self.schema_name):
            Course.objects.create(
                title=f"FM July {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 5),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            Course.objects.create(
                title=f"HM July {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 20),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses_starting(
                {"month": 7, "month_type": "FM"}, self.admin
            )
        titles = _titles(out)
        self.assertTrue(any(t.startswith("FM July") for t in titles))
        self.assertFalse(any(t.startswith("HM July") for t in titles))
