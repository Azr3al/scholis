import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.resolution import effective_permissions
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class DataSheetPermissionTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()

    def test_manager_has_both_by_default(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            mgr = User.objects.create_user(
                email=f"ds-mgr-{suffix}@example.com",
                password="x",
                name="Mgr",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"ds-mgr-{suffix}@example.com",
                code=f"ds-mgr-{suffix}",
                roles=[User.UserRole.MANAGER],
            )
            perms = effective_permissions(mgr)
        self.assertIn("course.view_data_sheet", perms)
        self.assertIn("user.view_data_sheet", perms)

    def test_teacher_lacks_both_by_default(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            t = User.objects.create_user(
                email=f"ds-tch-{suffix}@example.com",
                password="x",
                name="T",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"ds-tch-{suffix}@example.com",
                code=f"ds-tch-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            perms = effective_permissions(t)
        self.assertNotIn("course.view_data_sheet", perms)
        self.assertNotIn("user.view_data_sheet", perms)
