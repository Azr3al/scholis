import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
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
class SubstituteRoleApiTests(TestCase):
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
                email=f"sa-sub-{self.suffix}@example.com",
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

    def _set_flag(self, value: bool):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_substitute_teachers_enabled=value
            )

    def test_create_substitute_role_rejected_when_org_flag_off(self):
        self._set_flag(False)
        resp = self._client().post(
            "/api/v1/assigned-as-roles",
            {
                "name": f"Substitute Main Teacher-{self.suffix}",
                "seniority": "MAIN_TEACHER",
                "is_substitute": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("is_substitute", str(resp.json()))

    def test_create_substitute_role_rejected_with_other_seniority(self):
        self._set_flag(True)
        resp = self._client().post(
            "/api/v1/assigned-as-roles",
            {
                "name": f"Cover-{self.suffix}",
                "seniority": "OTHER",
                "is_substitute": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("is_substitute", str(resp.json()))

    def test_create_substitute_role_persists_when_valid(self):
        self._set_flag(True)
        name = f"Substitute Main Teacher-{self.suffix}"
        resp = self._client().post(
            "/api/v1/assigned-as-roles",
            {
                "name": name,
                "seniority": "MAIN_TEACHER",
                "is_substitute": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.json())
        with schema_context(self.schema_name):
            role = AssignedAsRole.objects.get(name=name)
            self.assertTrue(role.is_substitute)
