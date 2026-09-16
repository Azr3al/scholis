import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_crm.complaint_notifications import _admin_recipient_ids
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class AdminRecipientIdsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_admin_recipient_ids_includes_admin_roles_only(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            admin = User.objects.create_user(
                email=f"notify-admin-{suffix}@example.com",
                password="x",
                name="Notify Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"notify-admin-{suffix}@example.com",
                code=f"notify-admin-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            teacher = User.objects.create_user(
                email=f"notify-teacher-{suffix}@example.com",
                password="x",
                name="Notify Teacher",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"notify-teacher-{suffix}@example.com",
                code=f"notify-teacher-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            recipient_ids = _admin_recipient_ids()
            self.assertIn(admin.id, recipient_ids)
            self.assertNotIn(teacher.id, recipient_ids)

    def test_admin_recipient_ids_honors_exclude(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            admin = User.objects.create_user(
                email=f"notify-exclude-{suffix}@example.com",
                password="x",
                name="Exclude Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"notify-exclude-{suffix}@example.com",
                code=f"notify-exclude-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            recipient_ids = _admin_recipient_ids(exclude_user_ids=[admin.id])
            self.assertNotIn(admin.id, recipient_ids)
