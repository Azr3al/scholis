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
@override_settings(RBAC_ENFORCE="enforce")
class TelegramRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com",
                password="x",
                name="T",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def test_teacher_cannot_configure(self):
        c = APIClient()
        c.force_authenticate(user=self.teacher)
        c.credentials(HTTP_TENANT=self.schema_name)
        res = c.post(
            "/api/v1/telegram/config",
            {"bot_token": "x", "is_telegram_on": True},
            format="json",
        )
        self.assertIn(res.status_code, (401, 403))

    def test_teacher_cannot_re_register_webhook(self):
        c = APIClient()
        c.force_authenticate(user=self.teacher)
        c.credentials(HTTP_TENANT=self.schema_name)
        res = c.post(
            "/api/v1/telegram/re-register-webhook",
            {"rotate_credentials": False},
            format="json",
        )
        self.assertIn(res.status_code, (401, 403))
