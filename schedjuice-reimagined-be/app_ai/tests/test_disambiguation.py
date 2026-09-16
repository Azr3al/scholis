import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.disambiguation import (
    clear_pending,
    get_active_pending,
    save_pending,
    try_resolve_pending_turn,
)
from app_auth.models import User
from app_organization.models import Organization
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
class DisambiguationStoreTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_staff_points_enabled = True
            org.save(update_fields=["is_staff_points_enabled"])
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"d-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Teacher One",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.point_type = point_models.PointType.objects.create(
                name=f"Merit-{uuid4().hex[:6]}"
            )

    def test_save_and_get_pending(self):
        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="telegram:123",
                tool_name="adjust_staff_points",
                pending_field="subject",
                partial_args={"direction": "add", "amount": 5, "note": "Good job"},
                candidates=[{"key": "A", "id": 1, "name": "James"}],
            )
            row = get_active_pending(user=self.admin, channel_key="telegram:123")
        self.assertIsNotNone(row)
        self.assertEqual(row.pending_field, "subject")

    def test_expired_pending_not_returned(self):
        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="web:1",
                tool_name="adjust_staff_points",
                pending_field="subject",
                partial_args={},
                candidates=[],
                ttl=timedelta(seconds=-1),
            )
            row = get_active_pending(user=self.admin, channel_key="web:1")
        self.assertIsNone(row)

    def test_disambiguation_reply_executes_write(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="web:9",
                tool_name="adjust_staff_points",
                pending_field="subject",
                partial_args={
                    "point_type_id": self.point_type.id,
                    "direction": "add",
                    "amount": 2,
                    "note": "Nice work",
                },
                candidates=[
                    {"key": "A", "id": self.teacher.id, "name": "Teacher One"},
                ],
            )
            result = try_resolve_pending_turn(
                prompt="A",
                user=self.admin,
                channel_key="web:9",
                org=org,
            )
        self.assertTrue(result.executed)
        self.assertEqual(result.payload["status"], "ok")
        self.assertEqual(result.payload["transaction"]["delta"], 2)

    def test_cancel_clears_pending(self):
        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="web:2",
                tool_name="adjust_staff_points",
                pending_field="subject",
                partial_args={},
                candidates=[{"key": "A", "id": 1, "name": "X"}],
            )
            result = try_resolve_pending_turn(
                prompt="cancel",
                user=self.admin,
                channel_key="web:2",
                org=None,
            )
            row = get_active_pending(user=self.admin, channel_key="web:2")
        self.assertTrue(result.cancelled)
        self.assertIsNone(row)
