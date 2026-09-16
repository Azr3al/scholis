import unittest
from datetime import timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.course_oversight import get_course_scope_overseers
from app_course.models import Category, Course, Program


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseScopeOverseersTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            self.prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Scope {uuid4().hex[:4]}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            self.dean = User.objects.create_user(
                email=f"dean-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Zara Dean",
                roles=[User.UserRole.MANAGER],
            )
            User.objects.create_user(
                email=f"other-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Unrelated User",
                roles=[User.UserRole.MANAGER],
            )

    def test_program_scope_returns_overseer(self):
        with schema_context(self.schema_name):
            self.dean.scoped_programs.add(self.prog)
            rows = get_course_scope_overseers(self.course)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["user"]["name"], "Zara Dean")
            self.assertEqual(rows[0]["scope_reasons"][0]["type"], "program")

    def test_category_scope_returns_overseer(self):
        with schema_context(self.schema_name):
            self.dean.scoped_categories.add(self.cat)
            rows = get_course_scope_overseers(self.course)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["scope_reasons"][0]["type"], "category")

    def test_both_program_and_category_reasons(self):
        with schema_context(self.schema_name):
            self.dean.scoped_programs.add(self.prog)
            self.dean.scoped_categories.add(self.cat)
            rows = get_course_scope_overseers(self.course)
            types = {r["type"] for r in rows[0]["scope_reasons"]}
            self.assertEqual(types, {"program", "category"})

    def test_unscoped_user_not_returned(self):
        with schema_context(self.schema_name):
            rows = get_course_scope_overseers(self.course)
            self.assertEqual(rows, [])

    def test_sorted_by_name(self):
        with schema_context(self.schema_name):
            dean_b = User.objects.create_user(
                email=f"b-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Alpha Dean",
                roles=[User.UserRole.MANAGER],
            )
            dean_b.scoped_programs.add(self.prog)
            self.dean.scoped_programs.add(self.prog)
            rows = get_course_scope_overseers(self.course)
            self.assertEqual(
                [r["user"]["name"] for r in rows],
                ["Alpha Dean", "Zara Dean"],
            )
