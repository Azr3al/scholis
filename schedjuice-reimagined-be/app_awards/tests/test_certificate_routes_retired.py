import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
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
class CertificateRoutesRetiredTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_list_404(self):
        with schema_context(self.schema_name):
            seed_rbac()
            admin = User.objects.create_user(
                email=f"adm-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            client = APIClient()
            client.force_authenticate(user=admin)
            client.credentials(HTTP_TENANT=self.schema_name)
            with self.settings(RBAC_ENFORCE="enforce"):
                resp = client.get("/api/v1/certificate-templates")
        self.assertEqual(resp.status_code, 404)
