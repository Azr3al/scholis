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
@override_settings(RBAC_ENFORCE="log_only", TELEGRAM_TOKEN_ENCRYPTION_KEY="")
class TelegramConfigTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from cryptography.fernet import Fernet

        self.key = Fernet.generate_key().decode()
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"adm-{uuid4().hex[:6]}@e.com",
                password="x",
                name="A",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def _client(self):
        c = APIClient()
        c.force_authenticate(user=self.admin)
        c.credentials(HTTP_TENANT=self.schema_name)
        return c

