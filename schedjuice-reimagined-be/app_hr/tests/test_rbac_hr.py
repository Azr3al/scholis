import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_hr.models import BuildingCheckin
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class HRRBACTests(TestCase):
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
            self.hr_user = User.objects.create_user(
                email=f"hr-{suffix}@example.com",
                password="x",
                name="HR User",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.HR],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.other_teacher = User.objects.create_user(
                email=f"oth-{suffix}@example.com",
                password="x",
                name="Other Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            BuildingCheckin.objects.create(
                user=self.teacher,
                date=date(2026, 1, 15),
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_forbidden_on_building_checkins(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get("/api/v1/building-checkins?page=1&size=24")
        self.assertEqual(resp.status_code, 403)

    def test_teacher_forbidden_on_other_payroll_calc(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).post(
                "/api/v1/payroll/trphillips",
                {"month": 1, "year": 2026, "user_id": self.other_teacher.id},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)
