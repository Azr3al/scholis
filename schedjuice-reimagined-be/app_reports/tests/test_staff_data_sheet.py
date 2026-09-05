import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class StaffDataSheetTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

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
                email=f"sds-staff-m-{suffix}@example.com",
                password="x",
                name="Staff Mgr",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"sds-staff-m-{suffix}@example.com",
                code=f"sds-staff-m-{suffix}",
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"sds-staff-t-{suffix}@example.com",
                password="x",
                name="José Teacher",
                phone_number="+95 9 1111 2222",
                date_of_birth=date(1985, 1, 1),
                communication_email=f"sds-staff-t-{suffix}@example.com",
                code=f"sds-staff-t-{suffix}",
                roles=[User.UserRole.TEACHER],
            )

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        c.credentials(HTTP_TENANT=self.schema_name)
        return c

    def test_search_accent_insensitive(self):
        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/staff-data-sheet?q=jose"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        codes = [r["code"] for r in resp.json()["data"]]
        self.assertIn(self.teacher.code, codes)

    def test_search_phone_digits(self):
        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/staff-data-sheet?q=95911112222"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        codes = [r["code"] for r in resp.json()["data"]]
        self.assertIn(self.teacher.code, codes)
