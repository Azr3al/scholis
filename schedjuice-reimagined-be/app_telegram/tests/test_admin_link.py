import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
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
class TelegramAdminLinkTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.telegram_bot_username = "schoolbot"
            self.org.is_telegram_on = True
            self.org.save()
        with schema_context(self.schema_name):
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
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_admin_forbidden_on_link_token(self):
        url = f"/api/v1/users/{self.teacher.id}/telegram-link-token"
        res = self._client(self.admin).post(url)
        self.assertEqual(res.status_code, 403)

    def test_link_token_rejects_non_teacher(self):
        url = f"/api/v1/users/{self.admin.id}/telegram-link-token"
        res = self._client(self.superadmin).post(url)
        self.assertEqual(res.status_code, 400)
        self.assertIn("teachers", str(res.data["details"]).lower())

    def test_link_token_rejects_already_linked_teacher(self):
        with schema_context(self.schema_name):
            self.teacher.telegram_user_id = 12345
            self.teacher.telegram_chat_id = 12345
            self.teacher.telegram_linked_at = timezone.now()
            self.teacher.save()
        url = f"/api/v1/users/{self.teacher.id}/telegram-link-token"
        res = self._client(self.superadmin).post(url)
        self.assertEqual(res.status_code, 400)
        self.assertIn("already", str(res.data["details"]).lower())

    def test_superadmin_can_force_unlink_teacher(self):
        with schema_context(self.schema_name):
            self.teacher.telegram_user_id = 12345
            self.teacher.telegram_chat_id = 12345
            self.teacher.telegram_username = "teach"
            self.teacher.telegram_linked_at = timezone.now()
            self.teacher.save()
        url = f"/api/v1/users/{self.teacher.id}/unlink-telegram"
        res = self._client(self.superadmin).post(url)
        self.assertEqual(res.status_code, 200, res.content)
        with schema_context(self.schema_name):
            self.teacher.refresh_from_db()
        self.assertIsNone(self.teacher.telegram_user_id)

    def test_unlink_rejects_not_linked(self):
        url = f"/api/v1/users/{self.teacher.id}/unlink-telegram"
        res = self._client(self.superadmin).post(url)
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not have", str(res.data["details"]).lower())
