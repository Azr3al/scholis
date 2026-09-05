import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
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
                name="Listed Student",
                phone_number="95987654321",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.inactive = User.objects.create_user(
                email=f"adm-inact-{suffix}@example.com",
                password="x",
                name="Inactive Student",
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

    def test_teacher_forbidden(self):
        resp = self._client(self.teacher).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {"filter_params": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_admissions_only_ok_sparse_row(self):
        resp = self._client(self.officer).post(
            "/api/v1/admissions/people/search?page=1&size=24",
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
            ["id", "name", "alternative_name", "email", "phone_number", "is_active"],
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
