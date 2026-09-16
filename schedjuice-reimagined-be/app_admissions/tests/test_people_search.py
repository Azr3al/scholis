import unittest
from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.cache import bump_matrix_generation
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AdmissionsPeopleSearchTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.suffix = suffix
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"adm-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.listed = User.objects.create_user(
                email=f"adm-listed-{suffix}@example.com",
                password="x",
                name=f"Listed {suffix}",
                phone_number="95987654321",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.inactive = User.objects.create_user(
                email=f"adm-inact-{suffix}@example.com",
                password="x",
                name=f"Inactive {suffix}",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
                is_active=False,
            )
            self.officer = self._admissions_only(suffix)

    def _admissions_only(self, suffix: str) -> User:
        role = Role.objects.create(
            slug=f"admissions-desk-{suffix}",
            display_name="Admissions desk",
            is_system=False,
        )
        RolePermission.objects.create(role=role, permission_code="admissions.view")
        bump_matrix_generation(self.schema_name)
        return User.objects.create_user(
            email=f"adm-{suffix}@example.com",
            password="x",
            name="Officer",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[role.slug],
        )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _student_filter(self):
        return {
            "field_name": "roles",
            "operator": "contained_by",
            "value": "{student}",
        }

    def _enroll(self, user, *, start_offset, end_offset, status_override=None):
        cat, _ = Category.objects.get_or_create(name=f"Adm ps cat {self.suffix}")
        prog, _ = Program.objects.get_or_create(
            name=f"Adm ps prog {self.suffix}",
            defaults={
                "course_creation_method": Program.CourseCreationMethod.MANUAL,
                "subject_strategy": Program.SubjectStrategy.NONE,
            },
        )
        today = timezone.localdate()
        course = Course.objects.create(
            title=f"Adm ps {user.id} {start_offset} {self.suffix}",
            category=cat,
            program=prog,
            start_date=today + timedelta(days=start_offset),
            end_date=today + timedelta(days=end_offset),
            status_override=status_override,
        )
        with patch(
            "app_chat.signals_enrollment.sync_group_chat_on_user_course_change.delay"
        ), patch("app_telegram.signals.dm_invite_link_to_teacher.delay"):
            UserCourse.objects.create(
                user=user,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
        return course

    def test_teacher_forbidden(self):
        resp = self._client(self.teacher).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {"filter_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_admissions_only_ok_sparse_row(self):
        resp = self._client(self.officer).post(
            f"/api/v1/admissions/people/search?page=1&size=24&q={self.listed.email}",
            {"filter_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(r for r in resp.json()["data"] if r["id"] == self.listed.id)
        self.assertEqual(row["phone_number"], "95987654321")
        self.assertNotIn("profile_completeness", row)
        self.assertNotIn("nrc", row)
        self.assertCountEqual(
            row.keys(),
            [
                "id",
                "name",
                "alternative_name",
                "email",
                "phone_number",
                "is_active",
                "is_attending",
            ],
        )

    def test_include_inactive_off_hides_inactive(self):
        resp = self._client(self.officer).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {
                "filter_params": [
                    {
                        "field_name": "is_active",
                        "operator": "exact",
                        "value": "true",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertNotIn(self.inactive.id, ids)

    def test_students_default_hides_alumni(self):
        with schema_context(self.schema_name):
            self._enroll(self.listed, start_offset=-10, end_offset=10)
        resp = self._client(self.officer).post(
            f"/api/v1/admissions/people/search?page=1&size=24&q={self.listed.email}",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertIn(self.listed.id, ids)
        row = next(r for r in resp.json()["data"] if r["id"] == self.listed.id)
        self.assertTrue(row["is_attending"])

    def test_include_alumni_returns_non_attending_students(self):
        listed_resp = self._client(self.officer).post(
            f"/api/v1/admissions/people/search?page=1&size=24&include_alumni=true&q={self.listed.email}",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        inactive_resp = self._client(self.officer).post(
            f"/api/v1/admissions/people/search?page=1&size=24&include_alumni=true&q={self.inactive.email}",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        self.assertEqual(listed_resp.status_code, 200, listed_resp.content)
        self.assertEqual(inactive_resp.status_code, 200, inactive_resp.content)
        listed_ids = [r["id"] for r in listed_resp.json()["data"]]
        inactive_ids = [r["id"] for r in inactive_resp.json()["data"]]
        self.assertIn(self.listed.id, listed_ids)
        self.assertIn(self.inactive.id, inactive_ids)
        row = next(r for r in listed_resp.json()["data"] if r["id"] == self.listed.id)
        self.assertFalse(row["is_attending"])

    def test_students_q_does_not_include_alumni(self):
        resp = self._client(self.officer).post(
            f"/api/v1/admissions/people/search?page=1&size=24&q={self.listed.email}",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertNotIn(self.listed.id, ids)

    def test_disabled_account_still_attending_is_listed(self):
        with schema_context(self.schema_name):
            self._enroll(self.inactive, start_offset=-10, end_offset=10)
        resp = self._client(self.officer).post(
            f"/api/v1/admissions/people/search?page=1&size=24&q={self.inactive.email}",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertIn(self.inactive.id, ids)
        with schema_context(self.schema_name):
            self._enroll(
                self.listed,
                start_offset=-10,
                end_offset=10,
                status_override=Course.StatusOverride.PAUSED,
            )
        resp = self._client(self.officer).post(
            f"/api/v1/admissions/people/search?page=1&size=24&q={self.listed.email}",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertIn(self.listed.id, ids)

    def test_ended_only_is_alumni(self):
        with schema_context(self.schema_name):
            self._enroll(self.listed, start_offset=-40, end_offset=-10)
        resp = self._client(self.officer).post(
            f"/api/v1/admissions/people/search?page=1&size=24&q={self.listed.email}",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertNotIn(self.listed.id, ids)
