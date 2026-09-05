"""
Chat message reaction tests (tenant schema + PostgreSQL).
"""

from __future__ import annotations

import csv
import os
import unittest
from unittest.mock import patch
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_chat.models import ChatMessage
from app_chat.reaction_helpers import toggle_chat_reaction
from app_chat.services import get_or_create_course_chat_thread, get_or_create_dm_thread
from app_chat.views import ChatThreadMessageReactionToggleView
from app_course.models import Category, Course, UserCourse
from app_course.program_helpers import (
    create_default_general_program,
    get_default_program,
)
from app_organization.models import Organization

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _jwt_token_user(email: str):
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()

@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class ChatMessageReactionTests(TestCase):
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
                    (
                        r
                        for r in csv.DictReader(f)
                        if r["schema_name"] == cls.schema_name
                    ),
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
        with schema_context(cls.schema_name):
            create_default_general_program()
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def _create_course_with_students(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            self.assertIsNotNone(category)
            students = list(
                User.objects.filter(roles__contains=[User.UserRole.STUDENT])[:2]
            )
            self.assertEqual(len(students), 2)
            author, other = students[0], students[1]
            course = Course.objects.create(
                title=f"Reaction test {uuid4()}",
                code=f"REACT-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            UserCourse.objects.create(
                user=author,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=other,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            return course, author, other

    def test_toggle_add_remove_replace_course_message(self):
        with schema_context(self.schema_name):
            course, author, other = self._create_course_with_students()
            msg = ChatMessage.objects.create(
                thread=get_or_create_course_chat_thread(course.id),
                user=author,
                content={"text": "hello", "mentions": []},
            )

            added = toggle_chat_reaction(author, message=msg, emoji="👍")
            self.assertEqual(len(added), 1)
            self.assertEqual(added[0]["emoji"], "👍")
            self.assertEqual(added[0]["count"], 1)
            self.assertTrue(added[0]["reacted_by_me"])

            replaced = toggle_chat_reaction(author, message=msg, emoji="❤️")
            self.assertEqual(len(replaced), 1)
            self.assertEqual(replaced[0]["emoji"], "❤️")

            other_view = toggle_chat_reaction(other, message=msg, emoji="👍")
            self.assertEqual(len(other_view), 2)
            thumbs = next(r for r in other_view if r["emoji"] == "👍")
            self.assertEqual(thumbs["count"], 1)
            self.assertTrue(thumbs["reacted_by_me"])

            removed = toggle_chat_reaction(other, message=msg, emoji="👍")
            self.assertEqual(len(removed), 1)
            self.assertEqual(removed[0]["emoji"], "❤️")

    def test_reject_invalid_emoji_and_deleted_message(self):
        with schema_context(self.schema_name):
            course, author, _other = self._create_course_with_students()
            msg = ChatMessage.objects.create(
                thread=get_or_create_course_chat_thread(course.id),
                user=author,
                content={"text": "hello", "mentions": []},
            )
            with self.assertRaises(ValidationError):
                toggle_chat_reaction(author, message=msg, emoji="🦄")

            msg.deleted_at = msg.created_at
            msg.save(update_fields=["deleted_at"])
            with self.assertRaises(ValidationError):
                toggle_chat_reaction(author, message=msg, emoji="👍")

    @patch("app_chat.views.broadcast_to_chat_thread")
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_course_toggle_broadcasts(self, mock_authenticate, mock_broadcast):
        with schema_context(self.schema_name):
            course, author, _other = self._create_course_with_students()
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "hello", "mentions": []},
            )
            thread_id, mid = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{thread_id}/messages/{mid}/reactions",
            {"emoji": "👍"},
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(author.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageReactionToggleView.as_view()(
                req, thread_id=thread_id, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_broadcast.assert_called_once()
        payload = mock_broadcast.call_args[0][2]
        self.assertEqual(payload["event"], "reaction_changed")
        self.assertEqual(payload["data"]["message_id"], mid)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_course_toggle_forbidden_non_member(self, mock_authenticate):
        with schema_context(self.schema_name):
            course, author, other = self._create_course_with_students()
            outsider = User.objects.exclude(pk__in=[author.pk, other.pk]).first()
            self.assertIsNotNone(outsider)
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "hello", "mentions": []},
            )
            thread_id, mid = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{thread_id}/messages/{mid}/reactions",
            {"emoji": "👍"},
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(outsider.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageReactionToggleView.as_view()(
                req, thread_id=thread_id, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_invalid_emoji_returns_400_via_unified_endpoint(self, mock_authenticate):
        with schema_context(self.schema_name):
            course, author, _other = self._create_course_with_students()
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "hello", "mentions": []},
            )
            thread_id, mid = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{thread_id}/messages/{mid}/reactions",
            {"emoji": "🦄"},
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(author.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageReactionToggleView.as_view()(
                req, thread_id=thread_id, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
