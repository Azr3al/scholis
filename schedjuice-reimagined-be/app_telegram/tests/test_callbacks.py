import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.confirmation import save_write_confirmation
from app_auth.models import User
from app_course.models import Category, Course, UserCourse
from app_course.program_helpers import get_default_program
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from app_telegram.callbacks import handle_callback_query
from app_telegram.models import AIPendingWriteConfirmation


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class CallbackTests(TestCase):
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
                email=f"admin-cb-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-cb-{suffix}@example.com",
                name="Admin CB",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-cb-{suffix}",
                roles=[User.UserRole.ADMIN],
                telegram_user_id=999001,
            )
            self.student = User.objects.create_user(
                email=f"student-cb-{suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"student-cb-{suffix}@example.com",
                name="Student CB",
                date_of_birth=date(1990, 1, 1),
                code=f"student-cb-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{suffix}")
            self.course = Course.objects.create(
                title=f"CB Course {suffix}",
                description="d",
                code=f"CB-{suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )
            self.pending = save_write_confirmation(
                user=self.admin,
                channel_key="telegram:88001",
                tool_name="enroll_student_in_course",
                action="enroll_student",
                execution_payload={
                    "course_id": self.course.id,
                    "student_id": self.student.id,
                },
                summary="Enroll Student CB?",
                preview={},
            )

    @patch("app_telegram.callbacks.TelegramClient")
    def test_confirm_executes_enrollment(self, MockClient):
        client = MockClient.return_value
        payload = {
            "id": "cb1",
            "from": {"id": 999001},
            "data": f"ai:confirm:{self.pending.id}",
            "message": {"chat": {"id": 88001}, "message_id": 42},
        }
        with schema_context(self.schema_name):
            handle_callback_query(self.org, payload)
        with schema_context(self.schema_name):
            self.assertTrue(
                UserCourse.objects.filter(
                    user_id=self.student.id,
                    course_id=self.course.id,
                ).exists()
            )
            self.assertFalse(
                AIPendingWriteConfirmation.objects.filter(id=self.pending.id).exists()
            )
        client.answer_callback_query.assert_called_once()
        client.edit_message_text.assert_called_once()

    @patch("app_telegram.callbacks.TelegramClient")
    def test_confirm_clears_disambiguation_pending(self, MockClient):
        from app_ai.disambiguation import get_active_pending, save_pending

        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="telegram:88001",
                tool_name="assign_staff_to_course",
                pending_field="course_role",
                partial_args={"course_id": self.course.id},
                candidates=[{"key": "A", "id": 1, "name": "AT"}],
            )
            pending = save_write_confirmation(
                user=self.admin,
                channel_key="telegram:88001",
                tool_name="enroll_student_in_course",
                action="enroll_student",
                execution_payload={
                    "course_id": self.course.id,
                    "student_id": self.student.id,
                },
                summary="Enroll Student CB?",
                preview={},
            )
            payload = {
                "id": "cb3",
                "from": {"id": 999001},
                "data": f"ai:confirm:{pending.id}",
                "message": {"chat": {"id": 88001}, "message_id": 43},
            }
            handle_callback_query(self.org, payload)
            self.assertIsNone(
                get_active_pending(user=self.admin, channel_key="telegram:88001")
            )

    @patch("app_telegram.callbacks.TelegramClient")
    def test_cancel_clears_pending(self, MockClient):
        payload = {
            "id": "cb2",
            "from": {"id": 999001},
            "data": f"ai:cancel:{self.pending.id}",
            "message": {"chat": {"id": 88001}, "message_id": 42},
        }
        with schema_context(self.schema_name):
            handle_callback_query(self.org, payload)
        with schema_context(self.schema_name):
            self.assertFalse(UserCourse.objects.filter(user_id=self.student.id).exists())
            self.assertFalse(
                AIPendingWriteConfirmation.objects.filter(id=self.pending.id).exists()
            )
