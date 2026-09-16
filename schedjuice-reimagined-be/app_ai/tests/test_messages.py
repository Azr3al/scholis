import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.messages import (
    build_confirm_message,
    build_disambiguation_message,
    build_role_required_message,
    build_switch_prompt,
    resolve_message_tone,
)
from app_ai.user_preferences import upsert_preferences
from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class MessageTemplateTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"msg-{uuid4().hex[:6]}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"msg-{uuid4().hex[:6]}@example.com",
                name="Admin MSG",
                date_of_birth=date(1990, 1, 1),
                code=f"msg-{uuid4().hex[:6]}",
                roles=[User.UserRole.ADMIN],
            )

    def test_default_confirm_remove_staff(self):
        text = build_confirm_message(
            action="remove_staff",
            staff_name="Thiha",
            course_title="KET 152 WE",
            tone="default",
        )
        self.assertIn("Remove Thiha", text)
        self.assertIn("yes", text.lower())

    def test_formal_confirm_is_professional(self):
        text = build_confirm_message(
            action="remove_staff",
            staff_name="Thiha",
            course_title="KET 152 WE",
            tone="formal",
        )
        self.assertIn("confirm", text.lower())

    def test_role_required_lists_candidates(self):
        text = build_role_required_message(
            staff_name="Thiha",
            course_title="KET 152 WE",
            candidates=[
                {"key": "A", "name": "Main Teacher"},
                {"key": "B", "name": "Coordinator"},
            ],
            tone="default",
        )
        self.assertIn("A)", text)
        self.assertIn("cancel", text.lower())

    def test_assign_confirm_all_sessions_scope_line(self):
        text = build_confirm_message(
            action="assign_staff",
            staff_name="Thiha",
            course_title="KET 152 WE",
            role_name="Assistant Teacher",
            weekdays=None,
            tone="default",
        )
        self.assertIn("Adding to all course sessions", text)

    def test_assign_confirm_weekday_scope_line(self):
        text = build_confirm_message(
            action="assign_staff",
            staff_name="Thiha",
            course_title="KET 152 WE",
            role_name="Assistant Teacher",
            weekday_labels=["Monday", "Wednesday"],
            session_count=4,
            tone="default",
        )
        self.assertIn("Monday and Wednesday", text)
        self.assertIn("4", text)

    def test_resolve_message_tone_casual(self):
        with schema_context(self.schema_name):
            upsert_preferences(self.admin, tone=UserAIPreferences.Tone.CASUAL)
            self.assertEqual(resolve_message_tone(self.admin), "casual")

    def test_disambiguation_message_lists_options(self):
        text = build_disambiguation_message(
            field_label="person",
            query="Thiha",
            candidates=[{"key": "A", "name": "Thiha Swan Htet"}],
            tone="default",
        )
        self.assertIn("Thiha", text)
        self.assertIn("A)", text)

    def test_switch_prompt(self):
        text = build_switch_prompt(
            prior_summary="assign you as AT on KET 152 WE",
            new_summary="remove you from KET 152 WE",
            tone="default",
        )
        self.assertIn("Cancel", text)
        self.assertIn("remove you from KET 152 WE", text)
        self.assertIn("yes", text.lower())


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class InteractionResolverTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"int-{uuid4().hex[:6]}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"int-{uuid4().hex[:6]}@example.com",
                name="Admin INT",
                date_of_birth=date(1990, 1, 1),
                code=f"int-{uuid4().hex[:6]}",
                roles=[User.UserRole.ADMIN],
            )

    def test_resolve_interaction_message_for_pending_confirm(self):
        from app_ai.confirmation import save_write_confirmation
        from app_ai.interaction import resolve_interaction_message

        with schema_context(self.schema_name):
            save_write_confirmation(
                user=self.admin,
                channel_key="telegram:1",
                tool_name="remove_staff_from_course",
                action="remove_staff",
                execution_payload={"course_id": 1, "staff_id": 2},
                summary="legacy summary",
                preview={
                    "staff": {"name": "Thiha"},
                    "course": {"title": "KET 152 WE"},
                },
            )
            text = resolve_interaction_message(user=self.admin, channel_key="telegram:1")
        self.assertIn("Remove Thiha", text)
