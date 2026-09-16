import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AuthRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
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
                is_password_change_required=False,
            )
            self.other_teacher = User.objects.create_user(
                email=f"oth-{suffix}@example.com",
                password="x",
                name="Other Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.c1 = Course.objects.create(
                title=f"C1 {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.c1,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.c1,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def test_manager_sees_all_users(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.manager).get("/api/v1/users?page=1&size=200")
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.json()["data"]}
        self.assertIn(self.teacher.id, ids)
        self.assertIn(self.other_teacher.id, ids)
        self.assertIn(self.student.id, ids)

    def test_teacher_sees_narrowed_user_set(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get("/api/v1/users?page=1&size=200")
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.json()["data"]}
        self.assertIn(self.teacher.id, ids)
        self.assertIn(self.student.id, ids)
        self.assertNotIn(self.other_teacher.id, ids)

    def test_teacher_cannot_patch_another_user(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).patch(
                f"/api/v1/users/{self.other_teacher.id}",
                {"name": f"Blocked {uuid4().hex[:4]}"},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)

