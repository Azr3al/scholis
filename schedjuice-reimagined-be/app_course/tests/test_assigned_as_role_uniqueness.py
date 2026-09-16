import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.course_role_policy import (
    assert_assigned_as_role_seniority_unique,
    resolve_main_teacher_role,
)
from app_course.models import AssignedAsRole
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AssignedAsRoleUniquenessTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.superadmin = User.objects.create_user(
                email=f"sa-{self.suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

    def _client(self) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=self.superadmin)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _set_substitute_flag(self, value: bool):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_substitute_teachers_enabled=value
            )

    def _ensure_main_teacher_exists(self) -> AssignedAsRole:
        with schema_context(self.schema_name):
            role = (
                AssignedAsRole.objects.filter(
                    seniority=AssignedAsRole.Seniority.MAIN_TEACHER
                )
                .order_by("id")
                .first()
            )
            if role is None:
                role = AssignedAsRole.objects.create(
                    name=f"MT-{self.suffix}",
                    seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                )
            return role

    def test_cannot_create_second_main_teacher_role(self):
        self._ensure_main_teacher_exists()
        resp = self._client().post(
            "/api/v1/assigned-as-roles",
            {
                "name": f"MT-duplicate-{self.suffix}",
                "seniority": AssignedAsRole.Seniority.MAIN_TEACHER,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("seniority", resp.json().get("details", {}))

    def test_cannot_update_other_to_duplicate_mt(self):
        self._ensure_main_teacher_exists()
        with schema_context(self.schema_name):
            other_role = AssignedAsRole.objects.create(
                name=f"Other-{self.suffix}",
                seniority=AssignedAsRole.Seniority.OTHER,
            )
            other_id = other_role.id
        resp = self._client().put(
            f"/api/v1/assigned-as-roles/{other_id}",
            {"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("seniority", resp.json().get("details", {}))

    def test_can_create_other_seniority_freely(self):
        client = self._client()
        for i in range(2):
            resp = client.post(
                "/api/v1/assigned-as-roles",
                {
                    "name": f"Other-{self.suffix}-{i}",
                    "seniority": AssignedAsRole.Seniority.OTHER,
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.content)

    def test_substitute_mt_role_allowed_alongside_regular_mt(self):
        with schema_context(self.schema_name):
            AssignedAsRole.objects.create(
                name=f"MT-{self.suffix}-regular",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            assert_assigned_as_role_seniority_unique(
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=True,
            )

    def test_second_substitute_mt_role_allowed(self):
        with schema_context(self.schema_name):
            AssignedAsRole.objects.create(
                name=f"Sub-MT-{self.suffix}-1",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=True,
            )
            assert_assigned_as_role_seniority_unique(
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=True,
            )

    def test_second_substitute_at_role_allowed(self):
        with schema_context(self.schema_name):
            AssignedAsRole.objects.create(
                name=f"Sub-AT-{self.suffix}-1",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
                is_substitute=True,
            )
            assert_assigned_as_role_seniority_unique(
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
                is_substitute=True,
            )

    def test_api_can_create_second_substitute_mt(self):
        self._set_substitute_flag(True)
        client = self._client()
        for i in range(2):
            resp = client.post(
                "/api/v1/assigned-as-roles",
                {
                    "name": f"Sub-MT-{self.suffix}-api-{i}",
                    "seniority": AssignedAsRole.Seniority.MAIN_TEACHER,
                    "is_substitute": True,
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.content)

    def test_resolve_main_teacher_role_ignores_substitute_roles(self):
        with schema_context(self.schema_name):
            substitute = AssignedAsRole.objects.create(
                name=f"Sub-MT-{self.suffix}-resolve",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=True,
            )
            regular = AssignedAsRole.objects.create(
                name=f"MT-{self.suffix}-resolve",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.assertLess(substitute.id, regular.id)
            self.assertEqual(resolve_main_teacher_role().id, regular.id)
