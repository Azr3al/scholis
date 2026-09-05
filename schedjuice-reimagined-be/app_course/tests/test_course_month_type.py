import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_course.course_month_type import (
    MONTH_TYPE_FM,
    MONTH_TYPE_HM,
    filter_queryset_by_month_type,
    is_hm_course,
    is_hm_start_day,
)
from app_course.models import Category, Course, Program


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseMonthTypeTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _course_with_start_day(self, day: int) -> Course:
        with schema_context(self.schema_name):
            suffix = uuid4().hex[:6]
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            return Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, day),
                end_date=date(2026, 12, 31),
            )

    def test_day_13_is_fm(self):
        self.assertFalse(is_hm_start_day(13))
        self.assertFalse(is_hm_course(self._course_with_start_day(13)))

    def test_day_14_is_hm(self):
        self.assertTrue(is_hm_start_day(14))
        self.assertTrue(is_hm_course(self._course_with_start_day(14)))

    def test_filter_fm_excludes_hm(self):
        with schema_context(self.schema_name):
            fm = self._course_with_start_day(5)
            hm = self._course_with_start_day(20)
            qs = filter_queryset_by_month_type(Course.objects.all(), MONTH_TYPE_FM)
            ids = set(qs.values_list("id", flat=True))
        self.assertIn(fm.id, ids)
        self.assertNotIn(hm.id, ids)

    def test_filter_hm_excludes_fm(self):
        with schema_context(self.schema_name):
            fm = self._course_with_start_day(5)
            hm = self._course_with_start_day(20)
            qs = filter_queryset_by_month_type(Course.objects.all(), MONTH_TYPE_HM)
            ids = set(qs.values_list("id", flat=True))
        self.assertNotIn(fm.id, ids)
        self.assertIn(hm.id, ids)
