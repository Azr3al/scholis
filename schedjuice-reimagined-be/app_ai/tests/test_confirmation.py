"""Tests for roster write confirmation pre-flight."""
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.confirmation import (
    save_write_confirmation,
    try_resolve_pending_confirmation,
)
from app_auth.models import User
from app_course.models import Category, Course, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from app_telegram.models import AIPendingWriteConfirmation


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ConfirmationTests(TestCase):
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
                email=f"conf-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"conf-{suffix}@example.com",
                name="Admin CONF",
                date_of_birth=date(1990, 1, 1),
                code=f"conf-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.student = User.objects.create_user(
                email=f"student-conf-{suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"student-conf-{suffix}@example.com",
                name="Student CONF",
                date_of_birth=date(1990, 1, 1),
                code=f"student-conf-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{suffix}")
            self.course = Course.objects.create(
                title=f"CONF Course {suffix}",
                description="d",
                code=f"CONF-{suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            UserCourse.objects.create(
                course=self.course,
                user=self.student,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_telegram_yes_executes_remove_student(self):
        with schema_context(self.schema_name):
            save_write_confirmation(
                user=self.admin,
                channel_key="telegram:1",
                tool_name="remove_student_from_course",
                action="remove_student",
                execution_payload={
                    "course_id": self.course.id,
                    "student_id": self.student.id,
                },
                summary="Remove Student CONF?",
                preview={
                    "student": {"name": self.student.name},
                    "course": {"title": self.course.title},
                },
            )
            result = try_resolve_pending_confirmation(
                prompt="yes",
                user=self.admin,
                channel_key="telegram:1",
                org=self.org,
            )
            enrolled = UserCourse.objects.filter(
                user_id=self.student.id,
                course_id=self.course.id,
            ).exists()
        self.assertTrue(result.executed)
        self.assertEqual(result.payload.get("status"), "ok")
        self.assertFalse(enrolled)

    def test_telegram_unrecognized_reply_returns_reminder(self):
        with schema_context(self.schema_name):
            save_write_confirmation(
                user=self.admin,
                channel_key="telegram:1",
                tool_name="remove_student_from_course",
                action="remove_student",
                execution_payload={
                    "course_id": self.course.id,
                    "student_id": self.student.id,
                },
                summary="Remove Student CONF?",
                preview={},
            )
            result = try_resolve_pending_confirmation(
                prompt="maybe later",
                user=self.admin,
                channel_key="telegram:1",
                org=self.org,
            )
        self.assertFalse(result.executed)
        self.assertIn("yes", result.reminder.lower())
        with schema_context(self.schema_name):
            self.assertTrue(
                AIPendingWriteConfirmation.objects.filter(
                    user=self.admin,
                    channel_key="telegram:1",
                ).exists()
            )

    def test_cancel_clears_pending(self):
        with schema_context(self.schema_name):
            save_write_confirmation(
                user=self.admin,
                channel_key="telegram:1",
                tool_name="remove_student_from_course",
                action="remove_student",
                execution_payload={
                    "course_id": self.course.id,
                    "student_id": self.student.id,
                },
                summary="Remove Student CONF?",
                preview={},
            )
            result = try_resolve_pending_confirmation(
                prompt="cancel",
                user=self.admin,
                channel_key="telegram:1",
                org=self.org,
            )
        self.assertTrue(result.cancelled)
        with schema_context(self.schema_name):
            self.assertFalse(
                AIPendingWriteConfirmation.objects.filter(
                    user=self.admin,
                    channel_key="telegram:1",
                ).exists()
            )
