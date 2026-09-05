import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_points import models
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class PointsViewTest(TestCase):
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
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_staff_points_enabled = True
            org.save(update_fields=["is_staff_points_enabled"])

            self.admin = User.objects.create_user(
                email=f"pts-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"pts-admin-{suffix}@example.com",
                code=f"pts-admin-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"pts-teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"pts-teacher-{suffix}@example.com",
                code=f"pts-teacher-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.colleague = User.objects.create_user(
                email=f"pts-colleague-{suffix}@example.com",
                password="x",
                name="Colleague",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"pts-colleague-{suffix}@example.com",
                code=f"pts-colleague-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"pts-student-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"pts-student-{suffix}@example.com",
                code=f"pts-student-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_org_flag_off_returns_404(self):
        with schema_context(self.schema_name):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_staff_points_enabled = False
            org.save(update_fields=["is_staff_points_enabled"])

            res = self._client(self.admin).get(f"{self.api_prefix}/point-types")
            self.assertEqual(res.status_code, 404, res.content)
            self.assertEqual(res.json()["message"], "staff_points_disabled")

    def test_award_requires_note(self):
        with schema_context(self.schema_name):
            pt = models.PointType.objects.create(name=f"Gold-{uuid4().hex[:6]}")
            res = self._client(self.admin).post(
                f"{self.api_prefix}/users/{self.teacher.id}/points/transactions",
                {"point_type_id": pt.id, "delta": 1, "note": "ab"},
                format="json",
            )
            self.assertEqual(res.status_code, 400, res.content)

    def test_inactive_type_rejected(self):
        with schema_context(self.schema_name):
            pt = models.PointType.objects.create(
                name=f"Retired-{uuid4().hex[:6]}",
                is_active=False,
            )
            res = self._client(self.admin).post(
                f"{self.api_prefix}/users/{self.teacher.id}/points/transactions",
                {
                    "point_type_id": pt.id,
                    "delta": 1,
                    "note": "Should fail",
                },
                format="json",
            )
            self.assertEqual(res.status_code, 400, res.content)

    def test_other_user_requires_points_view(self):
        with schema_context(self.schema_name):
            res = self._client(self.teacher).get(
                f"{self.api_prefix}/users/{self.colleague.id}/points"
            )
            self.assertEqual(res.status_code, 403, res.content)

    def test_student_cannot_access(self):
        with schema_context(self.schema_name):
            res = self._client(self.student).get(
                f"{self.api_prefix}/users/{self.student.id}/points"
            )
            self.assertEqual(res.status_code, 403, res.content)
