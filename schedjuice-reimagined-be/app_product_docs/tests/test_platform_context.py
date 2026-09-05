"""Platform context: admin org domain for superadmin tenant switch."""

import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.middleware import get_public_schema_name
from tenant_schemas.utils import schema_context

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
class PlatformContextViewTests(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"
    url = "/api/v1/platform/context"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
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
            self.admin = User.objects.create_user(
                email=f"adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

        with schema_context(self.customer_schema):
            seed_rbac()
            self.customer_superadmin = User.objects.create_user(
                email=f"csa-{suffix}@example.com",
                password="x",
                name="Customer Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )

    def _client(self, user: User | None, schema_name: str) -> APIClient:
        client = APIClient()
        if user is not None:
            client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=schema_name)
        return client

    def test_superadmin_on_customer_tenant_gets_admin_org(self):
        resp = self._client(self.customer_superadmin, self.customer_schema).get(self.url)
        self.assertEqual(resp.status_code, 200, resp.content)
        admin_org = resp.json()["data"]["admin_org"]
        with schema_context(get_public_schema_name()):
            expected = Organization.objects.get(schema_name=self.admin_schema)
        self.assertEqual(admin_org["id"], expected.id)
        self.assertEqual(admin_org["domain_url"], expected.domain_url)
        self.assertEqual(admin_org["name"], expected.name)

    def test_school_admin_forbidden(self):
        resp = self._client(self.admin, self.admin_schema).get(self.url)
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_unauthenticated_unauthorized(self):
        resp = self._client(None, self.admin_schema).get(self.url)
        self.assertIn(resp.status_code, (401, 403), resp.content)
