import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class CategoryReorderTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"cr-m-{suffix}@example.com",
                password="x",
                name="Mgr",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"cr-m-{suffix}@example.com",
                code=f"cr-m-{suffix}",
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"cr-t-{suffix}@example.com",
                password="x",
                name="T",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"cr-t-{suffix}@example.com",
                code=f"cr-t-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.a = Category.objects.create(name=f"Alpha-{suffix}", sort_order=0)
            self.b = Category.objects.create(name=f"Beta-{suffix}", sort_order=1)
            self.c = Category.objects.create(name=f"Gamma-{suffix}", sort_order=2)

    def _client(self, user):
        cl = APIClient()
        cl.force_authenticate(user=user)
        cl.credentials(HTTP_TENANT=self.schema_name)
        return cl

    def test_reorder_persists_sort_order(self):
        resp = self._client(self.manager).post(
            f"{self.api_prefix}/categories/reorder",
            {"ordered_ids": [self.c.id, self.a.id, self.b.id]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        with schema_context(self.schema_name):
            self.assertEqual(Category.objects.get(id=self.c.id).sort_order, 0)
            self.assertEqual(Category.objects.get(id=self.a.id).sort_order, 1)
            self.assertEqual(Category.objects.get(id=self.b.id).sort_order, 2)

    def test_teacher_forbidden(self):
        resp = self._client(self.teacher).post(
            f"{self.api_prefix}/categories/reorder",
            {"ordered_ids": [self.a.id]},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
