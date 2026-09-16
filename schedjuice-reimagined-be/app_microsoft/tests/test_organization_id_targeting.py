"""Microsoft tool APIs require platform-admin + organization_id (Task 9)."""

import unittest
from datetime import date
from unittest.mock import patch
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
@override_settings(RBAC_ENFORCE="enforce")
class MicrosoftOrganizationIdTargetingTests(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.admin_org = Organization.objects.get(schema_name=self.admin_schema)
            self.customer_org = Organization.objects.get(
                schema_name=self.customer_schema
            )
            Organization.objects.filter(pk=self.customer_org.pk).update(
                is_microsoft_on=True
            )
            self.customer_org.refresh_from_db()

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

    def tearDown(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(pk=self.customer_org.pk).update(
                is_microsoft_on=False
            )

    def _client(self) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=self.superadmin)
        client.credentials(HTTP_TENANT=self.admin_schema)
        return client

    def test_health_requires_organization_id(self):
        resp = self._client().get(f"{self.api_prefix}/microsoft/health")
        self.assertEqual(resp.status_code, 400, resp.content)

    @patch("app_microsoft.views.scan_user_candidates", return_value=[])
    @patch("app_microsoft.views.scan_course_candidates", return_value=[])
    @patch("app_microsoft.views.scan_unlicensed_user_candidates", return_value=[])
    @patch("app_microsoft.views.scan_scope_team_owner_candidates", return_value=[])
    @patch("app_microsoft.views.tenant_microsoft_config_blockers", return_value=[])
    def test_health_ok_for_admin_org(self, *_mocks):
        resp = self._client().get(
            f"{self.api_prefix}/microsoft/health",
            {"organization_id": self.admin_org.id},
        )
        self.assertEqual(resp.status_code, 200, resp.content)

