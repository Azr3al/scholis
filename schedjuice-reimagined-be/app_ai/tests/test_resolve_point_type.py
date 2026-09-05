import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_ai.tools.resolve import resolve_point_type, resolve_staff_user
from app_auth.models import User
from app_points import models as point_models
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ResolvePointTypeTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.merit = point_models.PointType.objects.create(
                name=f"Merit-{suffix}", sort_order=1
            )
            self.merit_plus = point_models.PointType.objects.create(
                name=f"Merit Plus-{suffix}", sort_order=2
            )
            self.retired = point_models.PointType.objects.create(
                name=f"Retired-{suffix}", is_active=False
            )

    def test_single_match_by_query(self):
        with schema_context(self.schema_name):
            result = resolve_point_type(query=self.merit.name)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["point_type"].id, self.merit.id)

    def test_ambiguous_includes_letter_keys(self):
        with schema_context(self.schema_name):
            result = resolve_point_type(query="Merit")
        self.assertEqual(result["status"], "ambiguous")
        keys = [c["key"] for c in result["candidates"]]
        self.assertEqual(keys[:2], ["A", "B"])

    def test_inactive_type_not_matched_when_active_only(self):
        with schema_context(self.schema_name):
            result = resolve_point_type(query=self.retired.name)
        self.assertEqual(result["status"], "not_found")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ResolveStaffUserLetterKeyTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            for name in ("Jamey", "James", "Jamess"):
                User.objects.create_user(
                    email=f"{name.lower()}-{uuid4().hex[:4]}@e.com",
                    password="x",
                    name=name,
                    phone_number="-",
                    date_of_birth=date(1990, 1, 1),
                    roles=[User.UserRole.TEACHER],
                )

    def test_ambiguous_staff_has_letter_keys(self):
        with schema_context(self.schema_name):
            result = resolve_staff_user(query="James")
        self.assertEqual(result["status"], "ambiguous")
        self.assertTrue(all("key" in c for c in result["candidates"]))
