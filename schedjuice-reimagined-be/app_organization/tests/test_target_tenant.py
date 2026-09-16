"""resolve_target_organization: require organization_id for platform tools."""

import unittest

from django.core.management import call_command
from django.db import connection
from django.test import RequestFactory, TestCase
from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_organization.target_tenant import resolve_target_organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ResolveTargetOrganizationTests(TestCase):
    admin_schema = "xschedjuice"
    customer_schema = "xschedjuicethihanet"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.admin_schema, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.admin_org = Organization.objects.get(schema_name=self.admin_schema)
            self.customer_org = Organization.objects.get(
                schema_name=self.customer_schema
            )
            self.assertTrue(self.admin_org.is_admin)
            self.assertFalse(self.customer_org.is_admin)

    def test_requires_organization_id(self):
        request = RequestFactory().get("/microsoft/health")
        request.tenant = self.admin_org
        with self.assertRaises(ValidationError):
            resolve_target_organization(request)

    def test_resolves_admin_org(self):
        request = RequestFactory().get(
            "/microsoft/health", {"organization_id": self.admin_org.id}
        )
        request.tenant = self.admin_org
        org = resolve_target_organization(request)
        self.assertEqual(org.id, self.admin_org.id)

    def test_resolves_customer_org(self):
        request = RequestFactory().get(
            "/microsoft/health", {"organization_id": self.customer_org.id}
        )
        request.tenant = self.admin_org
        org = resolve_target_organization(request)
        self.assertEqual(org.id, self.customer_org.id)

    def test_resolves_from_post_body(self):
        request = RequestFactory().post(
            "/microsoft/repair/dry-run",
            data={"organization_id": self.customer_org.id, "target_type": "users"},
            content_type="application/json",
        )
        # Mimic DRF Request.data for body resolution without full view stack.
        request.data = {
            "organization_id": self.customer_org.id,
            "target_type": "users",
        }
        request.tenant = self.admin_org
        org = resolve_target_organization(request)
        self.assertEqual(org.id, self.customer_org.id)

    def test_rejects_unknown_organization(self):
        request = RequestFactory().get(
            "/microsoft/health", {"organization_id": 999999999}
        )
        request.tenant = self.admin_org
        with self.assertRaises(ValidationError) as ctx:
            resolve_target_organization(request)
        self.assertIn("organization_id", ctx.exception.detail)

    def test_rejects_non_integer(self):
        request = RequestFactory().get(
            "/microsoft/health", {"organization_id": "abc"}
        )
        request.tenant = self.admin_org
        with self.assertRaises(ValidationError):
            resolve_target_organization(request)
