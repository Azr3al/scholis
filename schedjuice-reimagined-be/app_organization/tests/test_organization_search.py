"""Platform-admin organization list search applies q on name and domain_url."""

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
class OrganizationSearchTests(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"
    api_prefix = "/api/v1"
    search_url = f"{api_prefix}/organizations/search"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.admin_schema):
            seed_rbac()
            self.platform_superadmin = User.objects.create_user(
                email=f"psa-{suffix}@example.com",
                password="x",
                name="Platform Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )
            self.platform_admin = User.objects.create_user(
                email=f"pa-{suffix}@example.com",
                password="x",
                name="Platform Admin",
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

        with schema_context(get_public_schema_name()):
            self.admin_org = Organization.objects.get(schema_name=self.admin_schema)
            self.customer_org = Organization.objects.get(schema_name=self.customer_schema)

    def _client(self, user: User, schema_name: str) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=schema_name)
        return client

    def _search(self, client: APIClient, *, q: str = ""):
        params = f"?size=-1"
        if q:
            params += f"&q={q}"
        return client.post(
            f"{self.search_url}{params}",
            {"filter_params": []},
            format="json",
        )

    def _rows(self, resp):
        payload = resp.json()["data"]
        return payload["data"] if isinstance(payload, dict) else payload

    def test_search_by_partial_name_returns_matching_org_only(self):
        client = self._client(self.platform_superadmin, self.admin_schema)
        needle = self.customer_org.name[: max(3, len(self.customer_org.name) // 2)]
        resp = self._search(client, q=needle)
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in self._rows(resp)}
        self.assertIn(self.customer_org.id, ids)
        self.assertNotIn(self.admin_org.id, ids)

    def test_search_by_partial_domain_returns_matching_org(self):
        client = self._client(self.platform_superadmin, self.admin_schema)
        needle = self.admin_org.domain_url.split(".")[0]
        resp = self._search(client, q=needle)
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in self._rows(resp)}
        self.assertIn(self.admin_org.id, ids)

    def test_search_with_no_match_returns_empty_list(self):
        client = self._client(self.platform_superadmin, self.admin_schema)
        resp = self._search(client, q="zzzznonexistent999")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(self._rows(resp), [])

    def test_customer_superadmin_forbidden_on_organization_search(self):
        client = self._client(self.customer_superadmin, self.customer_schema)
        resp = self._search(client, q=self.admin_org.name)
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_non_superadmin_on_admin_tenant_forbidden_on_organization_search(self):
        client = self._client(self.platform_admin, self.admin_schema)
        resp = self._search(client, q=self.admin_org.name)
        self.assertEqual(resp.status_code, 403, resp.content)
