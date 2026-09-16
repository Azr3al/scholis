import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Program, Subject
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class SchoolSetupRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.superadmin = User.objects.create_user(
                email=f"sa-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )
            self.manager = User.objects.create_user(
                email=f"mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.category = Category.objects.create(name=f"Cat {suffix}")
            self.program = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            Subject.objects.create(name=f"Subj {suffix}")

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_manager_forbidden_on_programs(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.manager).get("/api/v1/programs?page=1&size=24")
        self.assertEqual(resp.status_code, 403)

    def test_teacher_forbidden_on_subjects(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get("/api/v1/subjects?page=1&size=24")
        self.assertEqual(resp.status_code, 403)

    def test_manager_forbidden_on_intakes(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.manager).get("/api/v1/intakes?page=1&size=24")
        self.assertEqual(resp.status_code, 403)

    def test_manager_forbidden_on_assigned_as_roles(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.manager).get(
                "/api/v1/assigned-as-roles?page=1&size=24"
            )
        self.assertEqual(resp.status_code, 403)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class CategoryRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"mgr-{suffix}@example.com",
                password="x",
                name="Manager",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            Category.objects.create(name=f"Cat {suffix}")

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_forbidden_on_categories(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get("/api/v1/categories?page=1&size=24")
        self.assertEqual(resp.status_code, 403)
