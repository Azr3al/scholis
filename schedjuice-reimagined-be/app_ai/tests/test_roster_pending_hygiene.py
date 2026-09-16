import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.confirmation import (
    clear_all_roster_pending,
    get_active_write_confirmation,
    save_write_confirmation,
)
from app_ai.disambiguation import get_active_pending, save_pending
from app_auth.models import User
from app_course.models import Category, Course, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class RosterPendingHygieneTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            cls.org = Organization.objects.get(schema_name=cls.schema_name)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"hyg-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"hyg-{suffix}@example.com",
                name="Admin HYG",
                date_of_birth=date(1990, 1, 1),
                code=f"hyg-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{suffix}")
            self.course = Course.objects.create(
                title=f"HYG Course {suffix}",
                description="d",
                code=f"HYG-{suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )

    def test_save_write_confirmation_clears_disambiguation(self):
        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="telegram:99",
                tool_name="assign_staff_to_course",
                pending_field="course_role",
                partial_args={"course_id": self.course.id},
                candidates=[{"key": "A", "id": 1, "name": "AT"}],
            )
            save_write_confirmation(
                user=self.admin,
                channel_key="telegram:99",
                tool_name="assign_staff_to_course",
                action="assign_staff",
                execution_payload={
                    "course_id": self.course.id,
                    "staff_id": self.admin.id,
                },
                summary="Assign?",
                preview={},
            )
            self.assertIsNone(
                get_active_pending(user=self.admin, channel_key="telegram:99")
            )

    def test_clear_all_clears_both_stores(self):
        from datetime import timedelta

        from django.utils import timezone

        from app_telegram.models import AIPendingWriteConfirmation

        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="telegram:100",
                tool_name="assign_staff_to_course",
                pending_field="course_role",
                partial_args={},
                candidates=[{"key": "A", "id": 1, "name": "AT"}],
            )
            AIPendingWriteConfirmation.objects.create(
                user=self.admin,
                channel_key="telegram:100",
                tool_name="remove_staff_from_course",
                action="remove_staff",
                execution_payload={
                    "course_id": self.course.id,
                    "staff_id": self.admin.id,
                },
                summary="Remove?",
                preview={},
                expires_at=timezone.now() + timedelta(minutes=10),
            )
            clear_all_roster_pending(user=self.admin, channel_key="telegram:100")
            self.assertIsNone(
                get_active_pending(user=self.admin, channel_key="telegram:100")
            )
            self.assertIsNone(
                get_active_write_confirmation(
                    user=self.admin, channel_key="telegram:100"
                )
            )
