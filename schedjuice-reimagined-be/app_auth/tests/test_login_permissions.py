import unittest
from datetime import date

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.urls import reverse
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
class LoginPermissionsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.client = APIClient()
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email="login-perms-teacher@x.io",
                password="password123",
                name="Login Perms Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
                is_password_change_required=False,
            )

    def _tenant_headers(self):
        return {"HTTP_X_DTS_SCHEMA": self.schema_name}

    def test_login_response_includes_permissions_and_rbac_version(self):
        with schema_context(self.schema_name):
            expected_perms = self.teacher.get_effective_permissions()

        res = self.client.post(
            reverse("login"),
            {"email": "login-perms-teacher@x.io", "password": "password123"},
            **self._tenant_headers(),
            format="json",
        )
        self.assertEqual(res.status_code, 200, getattr(res, "data", res.content))
        user = res.data["user"]
        self.assertIn("permissions", user)
        self.assertIn("rbac_version", user)
        self.assertEqual(sorted(user["permissions"]), sorted(expected_perms))
        self.assertIn("attendance.mark", user["permissions"])
        self.assertNotIn("payment.verify", user["permissions"])
        self.assertIn("course.manage_members", user["permissions"])
