import unittest
from datetime import timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_course.course_status import apply_effective_status_filter
from app_course.models import Category, Course, CourseSubject, Program, Subject
from app_course.services.aggregate import build_course_aggregates, build_subject_usage_rows

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseAggregateServiceTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        today = timezone.localdate()
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.cat2 = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            Course.objects.create(
                title="A1",
                category=self.cat,
                program=self.prog,
                start_date=today - timedelta(days=10),
                end_date=today + timedelta(days=10),
            )
            Course.objects.create(
                title="A2",
                category=self.cat,
                program=self.prog,
                start_date=today - timedelta(days=5),
                end_date=today + timedelta(days=20),
            )
            Course.objects.create(
                title="P1",
                category=self.cat2,
                program=self.prog,
                start_date=today + timedelta(days=10),
                end_date=today + timedelta(days=40),
            )
            self.base_qs = Course.objects.filter(program=self.prog)

    def test_status_counts_ignore_status_filter(self):
        with schema_context(self.schema_name):
            result = build_course_aggregates(
                base_qs=self.base_qs,
                request_filter_params=[
                    {"field_name": "status", "operator": "in", "value": "active"}
                ],
                facets=["status"],
            )
        self.assertEqual(result["status"]["active"], 2)
        self.assertEqual(result["status"]["planned"], 1)

    def test_category_counts_ignore_category_filter(self):
        with schema_context(self.schema_name):
            result = build_course_aggregates(
                base_qs=self.base_qs,
                request_filter_params=[
                    {
                        "field_name": "category",
                        "operator": "in",
                        "value": str(self.cat.id),
                    }
                ],
                facets=["category"],
            )
        by_id = {row["id"]: row["count"] for row in result["category"]}
        self.assertEqual(by_id[self.cat.id], 2)
        self.assertEqual(by_id[self.cat2.id], 1)

    def test_omits_facets_not_requested(self):
        with schema_context(self.schema_name):
            result = build_course_aggregates(
                base_qs=self.base_qs,
                request_filter_params=[],
                facets=["status"],
            )
        self.assertIn("status", result)
        self.assertNotIn("subject", result)
        self.assertNotIn("category", result)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class SubjectUsageServiceTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        today = timezone.localdate()
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.math = Subject.objects.create(name=f"Math {uuid4().hex[:4]}")
            self.physics = Subject.objects.create(name=f"Physics {uuid4().hex[:4]}")
            self.biology = Subject.objects.create(name=f"Biology {uuid4().hex[:4]}")

            Course.objects.create(
                title="Primary subject course",
                category=self.cat,
                program=self.prog,
                subject=self.math,
                start_date=today - timedelta(days=10),
                end_date=today + timedelta(days=10),
            )
            self.multi_subject_course = Course.objects.create(
                title="Multi subject course",
                category=self.cat,
                program=self.prog,
                start_date=today - timedelta(days=5),
                end_date=today + timedelta(days=15),
            )
            CourseSubject.objects.create(
                course=self.multi_subject_course, subject=self.physics
            )

            self.double_linked_course = Course.objects.create(
                title="Double linked course",
                category=self.cat,
                program=self.prog,
                subject=self.biology,
                start_date=today - timedelta(days=3),
                end_date=today + timedelta(days=12),
            )
            CourseSubject.objects.create(
                course=self.double_linked_course, subject=self.biology
            )

            Course.objects.create(
                title="Ended subject course",
                category=self.cat,
                program=self.prog,
                subject=self.math,
                start_date=today - timedelta(days=40),
                end_date=today - timedelta(days=10),
            )
            self.base_qs = Course.objects.filter(program=self.prog)

    def test_subject_usage_counts_primary_subject(self):
        with schema_context(self.schema_name):
            rows = build_subject_usage_rows(
                base_qs=self.base_qs,
                request_filter_params=[],
                include_all_courses=False,
            )

        by_id = {row["id"]: row for row in rows}
        self.assertEqual(by_id[self.math.id]["count"], 1)

    def test_subject_usage_counts_course_subject_rows(self):
        with schema_context(self.schema_name):
            rows = build_subject_usage_rows(
                base_qs=self.base_qs,
                request_filter_params=[],
                include_all_courses=False,
            )

        by_id = {row["id"]: row for row in rows}
        self.assertEqual(by_id[self.physics.id]["count"], 1)

    def test_subject_usage_does_not_double_count_same_course_subject(self):
        with schema_context(self.schema_name):
            rows = build_subject_usage_rows(
                base_qs=self.base_qs,
                request_filter_params=[],
                include_all_courses=False,
            )

        by_id = {row["id"]: row for row in rows}
        self.assertEqual(by_id[self.biology.id]["count"], 1)

    def test_subject_usage_include_all_courses_adds_ended_courses(self):
        with schema_context(self.schema_name):
            active_rows = build_subject_usage_rows(
                base_qs=self.base_qs,
                request_filter_params=[],
                include_all_courses=False,
            )
            all_rows = build_subject_usage_rows(
                base_qs=self.base_qs,
                request_filter_params=[],
                include_all_courses=True,
            )

        active_by_id = {row["id"]: row for row in active_rows}
        all_by_id = {row["id"]: row for row in all_rows}
        self.assertEqual(active_by_id[self.math.id]["count"], 1)
        self.assertEqual(all_by_id[self.math.id]["count"], 2)

    def test_academic_hub_subject_facet_uses_shared_subject_usage(self):
        with schema_context(self.schema_name):
            result = build_course_aggregates(
                base_qs=self.base_qs,
                request_filter_params=[],
                facets=["subject"],
            )

        by_id = {row["id"]: row for row in result["subject"]}
        self.assertEqual(by_id[self.math.id]["count"], 2)
        self.assertEqual(by_id[self.physics.id]["count"], 1)
        self.assertEqual(by_id[self.biology.id]["count"], 1)
