"""Tests for role_required flow in assign_staff_to_course."""
import unittest
from datetime import date, datetime, time, timezone as dt_timezone
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.disambiguation import get_active_pending
from app_ai.tools.assign_staff_to_course import run_assign_staff_to_course
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Event
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
class AssignStaffRoleRequiredTests(TestCase):
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
                email=f"asrr-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"asrr-{suffix}@example.com",
                name="Admin ASRR",
                date_of_birth=date(1990, 1, 1),
                code=f"asrr-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.staff = User.objects.create_user(
                email=f"staff-{suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"staff-{suffix}@example.com",
                name="Staff ASRR",
                date_of_birth=date(1990, 1, 1),
                code=f"staff-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.mt_role = AssignedAsRole.objects.create(
                name=f"Main Teacher {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{suffix}")
            self.course = Course.objects.create(
                title=f"ASRR Course {suffix}",
                description="d",
                code=f"ASRR-{suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            session_date = datetime(2026, 7, 6, 9, 0, tzinfo=dt_timezone.utc)
            Event.objects.create(
                course=self.course,
                title="Session",
                date=session_date,
                time_from=time(9, 0),
                time_to=time(10, 0),
            )

    def test_assign_without_role_returns_role_required(self):
        with schema_context(self.schema_name):
            result = run_assign_staff_to_course(
                {"course_id": self.course.id, "user_id": self.staff.id},
                self.admin,
                channel_key="telegram:99",
                org=self.org,
            )
            row = get_active_pending(user=self.admin, channel_key="telegram:99")
        self.assertEqual(result["status"], "role_required")
        self.assertTrue(result["candidates"])
        self.assertEqual(row.pending_field, "course_role")
        self.assertEqual(row.partial_args.get("_staff_name"), self.staff.name)

    def test_assign_with_role_skips_role_required(self):
        with schema_context(self.schema_name):
            result = run_assign_staff_to_course(
                {
                    "course_id": self.course.id,
                    "user_id": self.staff.id,
                    "course_role_id": self.mt_role.id,
                },
                self.admin,
                channel_key="telegram:99",
                org=self.org,
            )
        self.assertEqual(result["status"], "pending_confirmation")
        preview = result.get("preview") or {}
        self.assertEqual(preview.get("role", {}).get("id"), self.mt_role.id)
        self.assertIsNone(preview.get("weekdays"))
