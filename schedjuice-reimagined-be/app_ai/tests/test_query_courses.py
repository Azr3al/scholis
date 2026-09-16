import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.tests.test_count_tools import _CountToolsTestBase
from app_ai.tools.query_courses import DATE_MODE_OVERLAP, run_query_courses
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


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class QueryCoursesTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = date(2026, 6, 15)
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.ket_cat = Category.objects.create(name=f"KET {suffix}")
            self.pet_cat = Category.objects.create(name=f"PET {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.ket1 = Course.objects.create(
                title=f"KET 1 {suffix}",
                category=self.ket_cat,
                program=self.prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
                course_type=Course.CourseType.WD,
                student_count=30,
            )
            self.ket2 = Course.objects.create(
                title=f"KET 2 {suffix}",
                category=self.ket_cat,
                program=self.prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
                student_count=22,
            )
            self.pet1 = Course.objects.create(
                title=f"PET 1 {suffix}",
                category=self.pet_cat,
                program=self.prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
                student_count=30,
            )
            self.ended = Course.objects.create(
                title=f"Ended {suffix}",
                category=self.ket_cat,
                program=self.prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 5, 31),
                status=Course.CourseStatus.ACTIVE,
            )
        self.suffix = suffix

    @patch("app_ai.tools.query_courses.org_today")
    def test_filters_by_category_and_month(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses(
                {"category_query": "KET", "month": 6, "year": 2026},
                self.admin,
            )
        self.assertNotIn("error", out)
        self.assertEqual(out["count"], 2)
        titles = [c["title"] for g in out["groups"] for c in g["courses"]]
        self.assertTrue(any("KET 1" in t for t in titles))
        self.assertTrue(any("KET 2" in t for t in titles))
        self.assertFalse(any("Ended" in t for t in titles))

    @patch("app_ai.tools.query_courses.org_today")
    def test_student_counts_in_response(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses({"category_query": "KET"}, self.admin)
        by_title = {
            c["title"]: c["student_count"]
            for g in out["groups"]
            for c in g["courses"]
        }
        self.assertEqual(by_title[f"KET 1 {self.suffix}"], 30)
        self.assertEqual(by_title[f"KET 2 {self.suffix}"], 22)

    @patch("app_ai.tools.query_courses.org_today")
    def test_teacher_denied(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses({}, self.teacher)
        self.assertEqual(out["error"], "permission_denied")

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
                title=f"FM {self.suffix}",
                category=self.ket_cat,
                program=self.prog,
                start_date=date(2026, 1, 5),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            Course.objects.create(
                title=f"HM {self.suffix}",
                category=self.ket_cat,
                program=self.prog,
                start_date=date(2026, 1, 20),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses(
                {"month_type": "FM", "month": 6, "year": 2026},
                self.admin,
            )
        titles = [c["title"] for g in out["groups"] for c in g["courses"]]
        self.assertTrue(any(t.startswith("FM ") for t in titles))
        self.assertFalse(any(t.startswith("HM ") for t in titles))

    @patch("app_ai.tools.query_courses.org_today")
    def test_fm_filter_feature_disabled(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_fm_hm_course_display_enabled = False
            org.save(update_fields=["is_fm_hm_course_display_enabled"])
        _clear_ai_org_cache(self.schema_name)
        with schema_context(self.schema_name):
            out = run_query_courses({"month_type": "FM"}, self.admin)
        self.assertEqual(out["error"], "feature_disabled")

    @patch("app_ai.tools.query_courses.org_today")
    def test_course_type_wd_filter(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses(
                {"category_query": "KET", "course_type": "WD"},
                self.admin,
            )
        titles = [c["title"] for g in out["groups"] for c in g["courses"]]
        self.assertEqual(len(titles), 1)
        self.assertIn("KET 1", titles[0])

    @patch("app_ai.tools.query_courses.org_today")
    def test_flat_mode(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses(
                {"category_query": "KET", "group_by_category": False},
                self.admin,
            )
        self.assertIn("courses", out)
        self.assertNotIn("groups", out)

    @patch("app_ai.tools.query_courses.org_today")
    def test_groups_sorted_by_category_sort_order(self, mock_today):
        mock_today.return_value = self.today
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            alpha = Category.objects.create(name=f"Alpha {suffix}", sort_order=2)
            beta = Category.objects.create(name=f"Beta {suffix}", sort_order=1)
            Course.objects.create(
                title=f"Alpha course {suffix}",
                category=alpha,
                program=self.prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            Course.objects.create(
                title=f"Beta course {suffix}",
                category=beta,
                program=self.prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses({}, self.admin)
        self.assertNotIn("error", out)
        names = [
            g["category"]["name"]
            for g in out["groups"]
            if g["category"]["name"].endswith(suffix)
        ]
        self.assertEqual(names, [f"Beta {suffix}", f"Alpha {suffix}"])

    @patch("app_ai.tools.query_courses.org_today")
    def test_default_month_label_and_year_source(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses({}, self.admin)
        self.assertNotIn("error", out)
        self.assertEqual(out["month"]["label"], "June 2026")
        self.assertEqual(out["month"]["year"], 2026)
        self.assertEqual(out["month"]["month"], 6)
        self.assertEqual(out["month"]["year_source"], "default")

    @patch("app_ai.tools.query_courses.org_today")
    def test_month_only_defaults_year_to_current(self, mock_today):
        mock_today.return_value = date(2026, 7, 7)
        with schema_context(self.schema_name):
            out = run_query_courses({"month": 6}, self.admin)
        self.assertEqual(out["month"]["year"], 2026)
        self.assertEqual(out["month"]["year_source"], "default")

    @patch("app_ai.tools.query_courses.org_today")
    def test_wrong_year_ignored_without_user_stated_year(self, mock_today):
        mock_today.return_value = date(2026, 7, 7)
        with schema_context(self.schema_name):
            out = run_query_courses({"month": 6, "year": 2024}, self.admin)
        self.assertEqual(out["month"]["year"], 2026)
        self.assertEqual(out["month"]["year_source"], "default")

    @patch("app_ai.tools.query_courses.org_today")
    def test_user_stated_year_honored(self, mock_today):
        mock_today.return_value = date(2026, 7, 7)
        with schema_context(self.schema_name):
            out = run_query_courses(
                {"month": 6, "year": 2025, "user_stated_year": True},
                self.admin,
            )
        self.assertEqual(out["month"]["year"], 2025)
        self.assertEqual(out["month"]["year_source"], "user_stated")

    @patch("app_ai.tools.query_courses.org_today")
    def test_overlap_includes_course_spanning_month_boundary(self, mock_today):
        mock_today.return_value = date(2026, 6, 15)
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            spanning = Course.objects.create(
                title=f"Spanning {suffix}",
                category=self.ket_cat,
                program=self.prog,
                start_date=date(2026, 6, 15),
                end_date=date(2026, 7, 15),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses({"month": 6}, self.admin)
        titles = [c["title"] for g in out["groups"] for c in g["courses"]]
        self.assertIn(spanning.title, titles)

    @patch("app_ai.tools.query_courses.org_today")
    def test_includes_stored_planned_but_effectively_active(self, mock_today):
        mock_today.return_value = date(2026, 7, 7)
        with schema_context(self.schema_name):
            starters = Course.objects.create(
                title=f"Starters {self.suffix}",
                category=self.ket_cat,
                program=self.prog,
                start_date=date(2026, 7, 6),
                end_date=date(2026, 11, 30),
                status=Course.CourseStatus.PLANNED,
            )
            out = run_query_courses({"month": 7}, self.admin)
        titles = [c["title"] for g in out["groups"] for c in g["courses"]]
        self.assertIn(starters.title, titles)

    @patch("app_ai.tools.query_courses.org_today")
    def test_excludes_effectively_ended_courses(self, mock_today):
        mock_today.return_value = date(2026, 7, 7)
        with schema_context(self.schema_name):
            out = run_query_courses({"month": 7}, self.admin)
        titles = [c["title"] for g in out["groups"] for c in g["courses"]]
        self.assertNotIn(self.ended.title, titles)

    @patch("app_ai.tools.query_courses.org_today")
    def test_response_includes_date_mode_overlap(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses({}, self.admin)
        self.assertEqual(out["date_mode"], DATE_MODE_OVERLAP)
        self.assertEqual(out["filters_applied"]["date_mode"], DATE_MODE_OVERLAP)
