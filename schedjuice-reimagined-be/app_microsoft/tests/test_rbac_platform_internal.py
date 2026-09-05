"""RBAC enforcement for platform-internal endpoints (Task 10)."""

import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class PlatformInternalRBACTests(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.customer_org = Organization.objects.get(
                schema_name=self.customer_schema
            )
        with schema_context(self.admin_schema):
            seed_rbac()
            self.superadmin = User.objects.create_user(
                email=f"sa-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.admin_schema)
        return client

    def test_teacher_forbidden_on_microsoft_health(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get(
                "/api/v1/microsoft/health",
                {"organization_id": self.customer_org.id},
            )
        self.assertEqual(resp.status_code, 403)

    def test_teacher_forbidden_on_debug_cron_logs(self):
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.teacher).get("/api/v1/management/cron-logs")
        self.assertEqual(resp.status_code, 403)

