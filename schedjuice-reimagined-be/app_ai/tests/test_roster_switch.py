import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.disambiguation import get_active_pending, save_pending
from app_ai.roster_intent import try_resolve_roster_switch
from app_auth.models import User
from app_course.models import Category, Course
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
class RosterSwitchTests(TestCase):
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
                email=f"sw-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"sw-{suffix}@example.com",
                name="Thiha Swan Htet",
                date_of_birth=date(1990, 1, 1),
                code=f"sw-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            cat = Category.objects.first() or Category.objects.create(name=f"Cat-{suffix}")
            self.course = Course.objects.create(
                title=f"KET 152 WE {suffix}",
                description="d",
                code=f"KET152-{suffix}",
                category=cat,
                program=get_default_program(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )

    def test_role_pending_plus_remove_shows_switch_prompt(self):
        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="telegram:55",
                tool_name="assign_staff_to_course",
                pending_field="course_role",
                partial_args={
                    "_staff_name": self.admin.name,
                    "_course_title": self.course.title,
                    "user_id": self.admin.id,
                    "course_id": self.course.id,
                },
                candidates=[{"key": "A", "id": 1, "name": "Assistant Teacher"}],
            )
            result = try_resolve_roster_switch(
                prompt=f"now, remove me from {self.course.title}",
                user=self.admin,
                channel_key="telegram:55",
                org=self.org,
            )
            pending = get_active_pending(user=self.admin, channel_key="telegram:55")
        self.assertIsNotNone(result)
        self.assertIn("Cancel", result.reminder or "")
        self.assertIn("remove you from", (result.reminder or "").lower())
        self.assertEqual(pending.pending_field, "switch_confirm")

    @patch("app_ai.roster_intent._execute_explicit_roster_command")
    def test_switch_yes_executes_new_command(self, mock_execute):
        mock_execute.return_value = {
            "status": "ok",
            "action": "remove_staff",
            "staff": {"name": self.admin.name},
            "course": {"title": self.course.title},
        }
        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="telegram:56",
                tool_name="remove_staff_from_course",
                pending_field="switch_confirm",
                partial_args={
                    "new_tool_name": "remove_staff_from_course",
                    "new_args": {
                        "user_id": self.admin.id,
                        "course_query": self.course.title,
                    },
                    "new_summary": f"remove you from {self.course.title}",
                    "prior_summary": "choose a role",
                    "prior_snapshot": {},
                },
                candidates=[],
            )
            result = try_resolve_roster_switch(
                prompt="yes",
                user=self.admin,
                channel_key="telegram:56",
                org=self.org,
            )
            pending = get_active_pending(user=self.admin, channel_key="telegram:56")
        self.assertTrue(result.executed)
        self.assertEqual(result.payload.get("status"), "ok")
        mock_execute.assert_called_once()
        self.assertIsNone(pending)

    def test_switch_no_restores_prior_disambiguation(self):
        with schema_context(self.schema_name):
            prior_snapshot = {
                "kind": "disambiguation",
                "tool_name": "assign_staff_to_course",
                "pending_field": "course_role",
                "partial_args": {
                    "_staff_name": self.admin.name,
                    "_course_title": self.course.title,
                },
                "candidates": [{"key": "A", "id": 1, "name": "Assistant Teacher"}],
            }
            save_pending(
                user=self.admin,
                channel_key="telegram:57",
                tool_name="remove_staff_from_course",
                pending_field="switch_confirm",
                partial_args={
                    "new_tool_name": "remove_staff_from_course",
                    "new_args": {"user_id": self.admin.id, "course_query": "KET 152"},
                    "new_summary": "remove you from KET 152 WE",
                    "prior_summary": "choose a role",
                    "prior_snapshot": prior_snapshot,
                },
                candidates=[],
            )
            result = try_resolve_roster_switch(
                prompt="no",
                user=self.admin,
                channel_key="telegram:57",
                org=self.org,
            )
            pending = get_active_pending(user=self.admin, channel_key="telegram:57")
        self.assertIsNotNone(result.reminder)
        self.assertIn("continuing", result.reminder.lower())
        self.assertEqual(pending.pending_field, "course_role")

    def test_interaction_message_shows_switch_not_role_picker(self):
        from app_ai.interaction import resolve_interaction_message

        with schema_context(self.schema_name):
            save_pending(
                user=self.admin,
                channel_key="telegram:58",
                tool_name="assign_staff_to_course",
                pending_field="course_role",
                partial_args={
                    "_staff_name": self.admin.name,
                    "_course_title": self.course.title,
                    "user_id": self.admin.id,
                    "course_id": self.course.id,
                },
                candidates=[{"key": "A", "id": 1, "name": "Assistant Teacher"}],
            )
            try_resolve_roster_switch(
                prompt=f"now, remove me from {self.course.title}",
                user=self.admin,
                channel_key="telegram:58",
                org=self.org,
            )
            text = resolve_interaction_message(
                user=self.admin,
                channel_key="telegram:58",
            )
        self.assertIsNotNone(text)
        self.assertNotIn("Which role should", text)
        self.assertIn("Cancel", text)
