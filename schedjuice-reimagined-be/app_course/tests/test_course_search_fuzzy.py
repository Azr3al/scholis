import unittest
from uuid import uuid4

from django.conf import settings
from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_course.course_search import (
    apply_course_search_q,
    apply_multi_word_ilike_q,
    extract_scope_ids_from_filter_params,
    normalize_search_q,
    strip_status_filters,
)
from app_course.models import Category, Course, Intake, Program


class CourseSearchScopeHelpersTest(SimpleTestCase):
    def test_extract_scope_ids_from_filter_params(self):
        program_id, intake_id = extract_scope_ids_from_filter_params(
            [
                {"field_name": "program", "operator": "exact", "value": "12"},
                {"field_name": "intake", "operator": "exact", "value": "34"},
            ]
        )
        self.assertEqual(program_id, 12)
        self.assertEqual(intake_id, 34)

    def test_normalize_search_q_strips_scope_names(self):
        self.assertEqual(
            normalize_search_q(
                "EC Program LW - Import Intake",
                program_name="EC Program",
                intake_name="Import Intake",
            ),
            "lw",
        )


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseSearchHelpersTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _make_course(self, *, title, code=""):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            if not category:
                category = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            program, _ = Program.objects.get_or_create(
                name=f"Prog {uuid4().hex[:6]}",
                defaults={
                    "course_creation_method": Program.CourseCreationMethod.MANUAL,
                    "subject_strategy": Program.SubjectStrategy.NONE,
                },
            )
            return Course.objects.create(
                title=title,
                code=code,
                category=category,
                program=program,
                start_date="2024-01-01",
                end_date="2024-12-31",
            )

    def test_strip_status_filters(self):
        fps = [
            {"field_name": "status", "operator": "in", "value": "active"},
            {"field_name": "program", "operator": "exact", "value": "1"},
        ]
        stripped = strip_status_filters(fps)
        self.assertEqual(len(stripped), 1)
        self.assertEqual(stripped[0]["field_name"], "program")

    @override_settings(COURSE_SEARCH_FUZZY_ENABLED=False)
    def test_multi_word_ilike_matches_all_words(self):
        with schema_context(self.schema_name):
            self._make_course(title="Term 1 Algebra Advanced")
            self._make_course(title="Geometry Basics")
            qs = Course.objects.all()
            result = list(
                apply_multi_word_ilike_q(qs, "algebra term").values_list("title", flat=True)
            )
        self.assertIn("Term 1 Algebra Advanced", result)
        self.assertNotIn("Geometry Basics", result)

    @override_settings(COURSE_SEARCH_FUZZY_ENABLED=True)
    def test_fuzzy_q_finds_typo_in_title(self):
        with schema_context(self.schema_name):
            self._make_course(title="Algebra II")
            self._make_course(title="History 101")
            qs = Course.objects.all()
            result = list(
                apply_course_search_q(qs, "algerba").values_list("title", flat=True)
            )
        self.assertIn("Algebra II", result)
        self.assertNotIn("History 101", result)

    @override_settings(
        COURSE_SEARCH_FUZZY_ENABLED=True,
        COURSE_SEARCH_FALLBACK_MIN_RESULTS=1,
        COURSE_SEARCH_TRIGRAM_THRESHOLD=0.15,
    )
    def test_short_query_matches_intake_generated_title(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            category = Category.objects.first()
            if not category:
                category = Category.objects.create(name=f"Cat {suffix}")
            program = Program.objects.create(
                name=f"EC Program {suffix}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            intake = Intake.objects.create(
                name=f"Import Intake {suffix}",
                program=program,
                start_date="2026-01-01",
                end_date="2026-12-31",
            )
            title = f"EC Program {suffix} LW (3 Months) - Import Intake {suffix}"
            Course.objects.create(
                title=title,
                code=f"LW-{suffix}",
                category=category,
                program=program,
                intake=intake,
                start_date="2026-01-01",
                end_date="2026-12-31",
            )
            Course.objects.create(
                title="Unrelated History 101",
                code=f"HIST-{suffix}",
                category=category,
                program=program,
                start_date="2026-01-01",
                end_date="2026-12-31",
            )
            qs = Course.objects.filter(code=f"LW-{suffix}") | Course.objects.filter(
                code=f"HIST-{suffix}"
            )
            result = list(apply_course_search_q(qs, "LW").values_list("title", flat=True))
        self.assertIn(title, result)
        self.assertNotIn("Unrelated History 101", result)
