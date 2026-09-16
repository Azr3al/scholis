"""
Direct message reply tests (tenant schema + PostgreSQL).
"""

from __future__ import annotations

import csv
import os
import unittest
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_chat.serializers import DirectMessageSerializer
from app_chat.services import create_dm_message, get_or_create_dm_thread
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class DirectMessageReplyTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        tenant = Organization.objects.filter(schema_name=cls.schema_name).first()
        if tenant is None:
            org_csv = os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "app_data",
                "dummydata",
                "organization.csv",
            )
            org_csv = os.path.normpath(org_csv)
            with open(org_csv, "r", encoding="utf-8") as f:
                row = next(
                    (r for r in csv.DictReader(f) if r["schema_name"] == cls.schema_name),
                    None,
                )
            if row is None:
                raise RuntimeError(
                    f"Missing tenant row for schema '{cls.schema_name}' in organization.csv"
                )
            tenant = Organization.objects.create(
                id=int(row["id"]),
                name=row["name"],
                domain_url=row["domain_url"],
                schema_name=row["schema_name"],
                tagline=row.get("tagline") or "",
                is_admin=str(row.get("is_admin", "")).lower() == "true",
                is_microsoft_on=str(row.get("is_microsoft_on", "")).lower() == "true",
                available_domains=[],
            )
            tenant.create_schema(check_if_exists=True)
        call_command("migrate_schemas", schema_name=cls.schema_name, verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def _dm_pair(self):
        with schema_context(self.schema_name):
            student = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_student()
            )
            teacher = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_teacher()
            )
            thread, _ = get_or_create_dm_thread(student, teacher.id)
            parent, err = create_dm_message(
                thread.id,
                student,
                {"text": f"parent {uuid4().hex[:6]}", "mentions": [], "attachments": []},
            )
            self.assertIsNone(err)
            self.assertIsNotNone(parent)
            return thread, student, teacher, parent

    def test_reply_in_thread_includes_reply_to_preview(self):
        with schema_context(self.schema_name):
            thread, student, _teacher, parent = self._dm_pair()
            reply, err = create_dm_message(
                thread.id,
                student,
                {"text": "child", "mentions": [], "attachments": []},
                reply_to_id=parent.id,
            )
            self.assertIsNone(err)
            self.assertEqual(reply.reply_to_id, parent.id)

            data = DirectMessageSerializer(reply).data
            self.assertIsNotNone(data["reply_to"])
            self.assertEqual(data["reply_to"]["id"], parent.id)
            self.assertEqual(data["reply_to"]["user"]["id"], parent.user_id)
            self.assertIn("parent", data["reply_to"]["content"]["text"])

    def test_reply_not_found_wrong_thread(self):
        with schema_context(self.schema_name):
            thread_a, student, teacher, parent_a = self._dm_pair()
            other_teacher = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.is_teacher() and u.id != teacher.id
            )
            thread_b, _ = get_or_create_dm_thread(student, other_teacher.id)
            self.assertNotEqual(thread_a.id, thread_b.id)

            _reply, err = create_dm_message(
                thread_b.id,
                student,
                {"text": "wrong thread", "mentions": [], "attachments": []},
                reply_to_id=parent_a.id,
            )
            self.assertIsNone(_reply)
            self.assertEqual(err, "reply_not_found")

    def test_reply_not_found_missing_id(self):
        with schema_context(self.schema_name):
            thread, student, _teacher, _parent = self._dm_pair()
            _reply, err = create_dm_message(
                thread.id,
                student,
                {"text": "orphan reply", "mentions": [], "attachments": []},
                reply_to_id=9_999_999_999,
            )
            self.assertIsNone(_reply)
            self.assertEqual(err, "reply_not_found")

    def test_reply_to_invalid_non_integer(self):
        with schema_context(self.schema_name):
            thread, student, _teacher, _parent = self._dm_pair()
            _reply, err = create_dm_message(
                thread.id,
                student,
                {"text": "bad ref", "mentions": [], "attachments": []},
                reply_to_id="not-an-id",
            )
            self.assertIsNone(_reply)
            self.assertEqual(err, "reply_to_invalid")

    def test_reply_to_soft_deleted_parent_still_allowed(self):
        with schema_context(self.schema_name):
            thread, student, _teacher, parent = self._dm_pair()
            parent.deleted_at = timezone.now()
            parent.save(update_fields=["deleted_at"])

            reply, err = create_dm_message(
                thread.id,
                student,
                {"text": "reply to tombstone", "mentions": [], "attachments": []},
                reply_to_id=parent.id,
            )
            self.assertIsNone(err)
            data = DirectMessageSerializer(reply).data
            self.assertEqual(data["reply_to"]["id"], parent.id)
            self.assertIsNone(data["reply_to"]["content"])
            self.assertIsNotNone(data["reply_to"]["deleted_at"])
