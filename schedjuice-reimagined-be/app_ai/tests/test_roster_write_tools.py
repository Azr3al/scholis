import unittest
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_ai.tools.enroll_student_in_course import run_enroll_student_in_course
from app_ai.tools.resolve import resolve_course_role
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from datetime import date
from tenant_schemas.utils import get_public_schema_name


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ResolveCourseRoleTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.mt_role = AssignedAsRole.objects.create(
                name=f"Main Teacher {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.at_one = AssignedAsRole.objects.create(
                name=f"Assistant Teacher A {suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
            )
            AssignedAsRole.objects.create(
                name=f"Assistant Teacher B {suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
            )

    def test_mt_single_role(self):
        with schema_context(self.schema_name):
            result = resolve_course_role(role_seniority="MT")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["role"].id, self.mt_role.id)

    def test_at_multiple_roles_ambiguous(self):
        with schema_context(self.schema_name):
            result = resolve_course_role(role_seniority="AT")
        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(result["candidates"][0]["key"], "A")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class EnrollStudentToolTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-es-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-es-{suffix}@example.com",
                name="Admin ES",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-es-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"student-es-{suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"student-es-{suffix}@example.com",
                name="Student ES",
                date_of_birth=date(1990, 1, 1),
                code=f"student-es-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{suffix}")
            self.course = Course.objects.create(
                title=f"ES Course {suffix}",
                description="d",
                code=f"ES-{suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )

    def test_returns_pending_without_mutation(self):
        with schema_context(self.schema_name):
            before = UserCourse.objects.filter(course_id=self.course.id).count()
            result = run_enroll_student_in_course(
                {"course_id": self.course.id, "student_query": self.student.name},
                self.admin,
                channel_key="telegram:1",
                org=self.org,
            )
            after = UserCourse.objects.filter(course_id=self.course.id).count()
        self.assertEqual(result["status"], "pending_confirmation")
        self.assertEqual(before, after)
