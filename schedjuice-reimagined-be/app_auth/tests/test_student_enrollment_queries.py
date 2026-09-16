"""Tests for student enrollment query helpers and list_students_without_courses."""

import unittest
from datetime import date
from io import StringIO
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.student_enrollment import (
    students_without_active_course_enrollment_qs,
    students_without_any_course_enrollment_qs,
)
from app_course.models import Category, Course, Program, UserCourse


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class StudentEnrollmentQueryTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"EnrollCat-{suffix}", sort_order=1)
            self.program = Program.objects.create(name=f"EnrollProg-{suffix}")
            self.active_course = Course.objects.create(
                title=f"Active-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat,
                program=self.program,
            )
            self.ended_course = Course.objects.create(
                title=f"Ended-{suffix}",
                start_date=date(2020, 1, 1),
                end_date=date(2020, 6, 1),
                status=Course.CourseStatus.ENDED,
                category=self.cat,
                program=self.program,
            )

            self.never_enrolled = User.objects.create_user(
                email=f"never-{suffix}@example.com",
                password="x",
                name="Never Enrolled",
                phone_number="0911",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"never-{suffix}@example.com",
                code=f"never-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.alumni_only = User.objects.create_user(
                email=f"alumni-{suffix}@example.com",
                password="x",
                name="Alumni Only",
                phone_number="0912",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"alumni-{suffix}@example.com",
                code=f"alumni-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=self.alumni_only,
                course=self.ended_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

            self.active_student = User.objects.create_user(
                email=f"active-{suffix}@example.com",
                password="x",
                name="Active Student",
                phone_number="0913",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"active-{suffix}@example.com",
                code=f"active-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=self.active_student,
                course=self.active_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

            self.inactive_never_enrolled = User.objects.create_user(
                email=f"inactive-{suffix}@example.com",
                password="x",
                name="Inactive Never",
                phone_number="0914",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"inactive-{suffix}@example.com",
                code=f"inactive-{suffix}",
                roles=[User.UserRole.STUDENT],
                is_active=False,
            )

    def test_students_without_any_course_enrollment_qs(self):
        with schema_context(self.schema_name):
            codes = set(
                students_without_any_course_enrollment_qs().values_list(
                    "code", flat=True
                )
            )

        self.assertIn(self.never_enrolled.code, codes)
        self.assertNotIn(self.inactive_never_enrolled.code, codes)
        self.assertNotIn(self.alumni_only.code, codes)
        self.assertNotIn(self.active_student.code, codes)

    def test_students_without_any_course_enrollment_excludes_inactive_by_default(self):
        with schema_context(self.schema_name):
            codes = set(
                students_without_any_course_enrollment_qs(
                    include_inactive_users=False,
                ).values_list("code", flat=True)
            )

        self.assertIn(self.never_enrolled.code, codes)
        self.assertNotIn(self.inactive_never_enrolled.code, codes)

    def test_students_without_active_course_enrollment_qs(self):
        with schema_context(self.schema_name):
            codes = set(
                students_without_active_course_enrollment_qs().values_list(
                    "code", flat=True
                )
            )

        self.assertIn(self.never_enrolled.code, codes)
        self.assertIn(self.alumni_only.code, codes)
        self.assertNotIn(self.active_student.code, codes)

    def test_list_students_without_courses_default_mode(self):
        out = StringIO()
        call_command(
            "list_students_without_courses",
            schema_name=self.schema_name,
            stdout=out,
        )
        output = out.getvalue()

        self.assertIn("Mode: never enrolled", output)
        self.assertIn(self.never_enrolled.code, output)
        self.assertNotIn(self.alumni_only.code, output)
        self.assertNotIn(self.active_student.code, output)

    def test_list_students_without_courses_without_active_enrollment_mode(self):
        out = StringIO()
        call_command(
            "list_students_without_courses",
            schema_name=self.schema_name,
            without_active_enrollment=True,
            stdout=out,
        )
        output = out.getvalue()

        self.assertIn("Mode: no active enrollment", output)
        self.assertIn(self.never_enrolled.code, output)
        self.assertIn(self.alumni_only.code, output)
        self.assertNotIn(self.active_student.code, output)

    def test_list_students_without_courses_unknown_schema(self):
        with self.assertRaises(Exception) as ctx:
            call_command(
                "list_students_without_courses",
                schema_name="nonexistent-schema-xyz",
            )
        self.assertIn("No organization found", str(ctx.exception))
