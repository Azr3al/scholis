"""Org-scoped user search for organization settings (tenant schema targeting)."""

import base64
import json
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


def _encode_query_param(value) -> str:
    raw = base64.urlsafe_b64encode(json.dumps(value).encode()).decode()
    return raw.rstrip("=")


def _admin_role_filter_body():
    return {
        "filter_params": [
            {
                "field_name": "roles",
                "operator": "contained_by",
                "value": [
                    User.UserRole.SUPERADMIN,
                    User.UserRole.ADMIN,
                    User.UserRole.MANAGER,
                ],
            }
        ]
    }


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class OrganizationUserSearchTests(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)
        call_command("load-data", schema=cls.customer_schema, verbosity=0)

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
            self.customer_teacher = User.objects.create_user(
                email=f"ct-{suffix}@example.com",
                password="x",
                name=f"CustomerTeacher-{suffix}",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.customer_admin = User.objects.create_user(
                email=f"ca-{suffix}@example.com",
                password="x",
                name=f"CustomerAdmin-{suffix}",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

        with schema_context(get_public_schema_name()):
            self.admin_org = Organization.objects.get(schema_name=self.admin_schema)
            self.customer_org = Organization.objects.get(schema_name=self.customer_schema)

    def _client(self, user: User, schema_name: str) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=schema_name)
        return client

    def _search_url(self, org_id: int) -> str:
        return f"{self.api_prefix}/organizations/{org_id}/users/search"

    def _search(
        self,
        client: APIClient,
        org_id: int,
        *,
        q: str = "",
        body: dict | None = None,
    ):
        params = f"?size=-1&sorts={_encode_query_param(['name'])}"
        if q:
            params += f"&q={q}"
        return client.post(
            f"{self._search_url(org_id)}{params}",
            body or _admin_role_filter_body(),
            format="json",
        )

    def test_platform_superadmin_searches_customer_org_schema(self):
        client = self._client(self.platform_superadmin, self.admin_schema)
        resp = self._search(
            client,
            self.customer_org.id,
            q=self.customer_admin.name,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.json()["data"]["data"]}
        self.assertIn(self.customer_admin.id, ids)
        self.assertNotIn(self.platform_superadmin.id, ids)

    def test_school_superadmin_searches_own_org(self):
        client = self._client(self.customer_superadmin, self.customer_schema)
        resp = self._search(
            client,
            self.customer_org.id,
            q=self.customer_admin.name,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.json()["data"]["data"]}
        self.assertIn(self.customer_admin.id, ids)

    def test_school_superadmin_forbidden_on_other_org(self):
        client = self._client(self.customer_superadmin, self.customer_schema)
        resp = self._search(client, self.admin_org.id, q="")
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_role_filter_excludes_teachers(self):
        client = self._client(self.customer_superadmin, self.customer_schema)
        resp = self._search(
            client,
            self.customer_org.id,
            q=self.customer_teacher.name,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = {row["id"] for row in resp.json()["data"]["data"]}
        self.assertNotIn(self.customer_teacher.id, ids)
