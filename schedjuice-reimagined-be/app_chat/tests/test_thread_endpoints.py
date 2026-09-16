"""
Parity tests for the Phase 2 generic /chat/threads/... surface: each behavior
here must match the equivalent legacy course/DM endpoint (see spec
docs/superpowers/specs/2026-07-04-unified-chat-schema-phase2-api-design.md).

Run (from schedjuice-reimagined-be, with DATABASE_URL pointing at Postgres):

    ./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints
"""

from __future__ import annotations

import csv
import os
import unittest
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework import status
from rest_framework.request import Request as DRFRequest
from rest_framework.test import APIRequestFactory
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_chat.message_list_helpers import fetch_thread_messages_page
from app_chat.models import ChatMessage, ChatReadState, ChatThread
from app_chat.serializers import (
    ChatThreadMessageSerializer,
    ChatThreadSerializer,
    DirectMessageSerializer,
)
from app_chat.services import (
    can_access_thread,
    get_or_create_course_chat_thread,
    get_or_create_dm_thread,
    list_dm_threads_for_user,
    start_dm_conversation,
)
from app_chat.views import (
    ChatThreadListCreateView,
    ChatThreadMessageDetailView,
    ChatThreadMessageListCreateView,
    ChatThreadPresenceGetView,
    ChatThreadReadStatePutView,
    ChatThreadResolveView,
)
from app_course.models import Category, Course, UserCourse
from app_course.program_helpers import create_default_general_program, get_default_program

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _jwt_token_user(email: str):
    return type("TokenUser", (), {"id": email, "is_authenticated": True})()

@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class ChatThreadFixturesMixin:
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        from app_organization.models import Organization

        tenant = Organization.objects.filter(schema_name=cls.schema_name).first()
        if tenant is None:
            org_csv = os.path.normpath(
                os.path.join(
                    os.path.dirname(__file__), "..", "..", "app_data", "dummydata", "organization.csv"
                )
            )
            with open(org_csv, "r", encoding="utf-8") as f:
                row = next(
                    (r for r in csv.DictReader(f) if r["schema_name"] == cls.schema_name), None
                )
            if row is None:
                raise RuntimeError(f"Missing tenant row for schema '{cls.schema_name}'")
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

    def _create_course_with_member(self):
        """Returns (course, member) with one enrolled student."""
        category = Category.objects.first()
        self.assertIsNotNone(category)
        member = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
        self.assertIsNotNone(member, "load-data should provide at least one student")
        course = Course.objects.create(
            title=f"Thread endpoint test {uuid4()}",
            code=f"THR-{uuid4().hex[:8]}",
            category=category,
            program=get_default_program(),
            start_date="2024-01-01",
            end_date="2024-12-31",
        )
        UserCourse.objects.create(
            user=member,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        return course, member

    def _pick_non_member(self, course):
        enrolled_ids = set(
            UserCourse.objects.filter(course=course).values_list("user_id", flat=True)
        )
        other = User.objects.exclude(pk__in=enrolled_ids).first()
        self.assertIsNotNone(other, "load-data should provide a non-member user")
        return other

@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class ChatThreadServiceTests(ChatThreadFixturesMixin, TestCase):

    def test_can_access_thread_false_for_course_non_member(self):
        with schema_context(self.schema_name):
            course, _member = self._create_course_with_member()
            outsider = self._pick_non_member(course)
            thread = get_or_create_course_chat_thread(course.id)
            self.assertFalse(can_access_thread(outsider, thread))

    def test_can_access_thread_false_for_dm_non_participant(self):
        with schema_context(self.schema_name):
            teacher_a = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())
            teacher_b = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.is_teacher() and u.id != teacher_a.id
            )
            teacher_c = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.id not in (teacher_a.id, teacher_b.id)
            )
            thread, _ = get_or_create_dm_thread(teacher_a, teacher_b.id)
            self.assertFalse(can_access_thread(teacher_c, thread))

    def test_list_dm_threads_for_user_matches_legacy_query_shape(self):
        with schema_context(self.schema_name):
            teacher_a = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())
            teacher_b = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.is_teacher() and u.id != teacher_a.id
            )
            thread, _msg, _created = start_dm_conversation(
                teacher_a, teacher_b.id, {"text": "hi", "mentions": [], "attachments": []}
            )
            threads = list_dm_threads_for_user(teacher_a)
            ids = {t.id for t in threads}
            self.assertIn(thread.id, ids)
            found = next(t for t in threads if t.id == thread.id)
            self.assertEqual(found.latest_message_id, _msg.id)
            self.assertEqual(found._dm_unread_count, 0)

    def test_list_dm_threads_for_user_excludes_empty_threads(self):
        with schema_context(self.schema_name):
            teacher_a = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())
            teacher_b = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.is_teacher() and u.id != teacher_a.id
            )
            empty_thread, _ = get_or_create_dm_thread(teacher_a, teacher_b.id)
            threads = list_dm_threads_for_user(teacher_a)
            ids = {t.id for t in threads}
            self.assertNotIn(empty_thread.id, ids)

    def test_bulk_thread_unread_counts_works_for_course_threads(self):
        with schema_context(self.schema_name):
            from app_chat.services import bulk_thread_unread_counts

            course, member = self._create_course_with_member()
            thread = get_or_create_course_chat_thread(course.id)
            other = self._pick_non_member(course)
            UserCourse.objects.create(
                user=other, course=course, assigned_as=UserCourse.AssignedAs.STUDENT
            )
            m1 = ChatMessage.objects.create(
                thread=thread, user=other, content={"text": "a", "mentions": []}
            )
            ChatMessage.objects.create(
                thread=thread, user=other, content={"text": "b", "mentions": []}
            )

            counts = bulk_thread_unread_counts([thread.id], member.id)
            self.assertEqual(counts[thread.id], 2)

            ChatReadState.objects.update_or_create(
                user=member, thread=thread, defaults={"last_read_message_id": m1.id}
            )
            counts_after_read = bulk_thread_unread_counts([thread.id], member.id)
            self.assertEqual(counts_after_read[thread.id], 1)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadResolveViewTests(ChatThreadFixturesMixin, TestCase):

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_get_forbidden_for_non_member(self, mock_auth):
        with schema_context(self.schema_name):
            course, _member = self._create_course_with_member()
            outsider = self._pick_non_member(course)
            cid = course.id

        factory = APIRequestFactory()
        req = factory.get(f"/courses/{cid}/chat/thread")
        mock_auth.return_value = (_jwt_token_user(outsider.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadResolveView.as_view()(req, course_id=cid)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class FetchThreadMessagesPageTests(ChatThreadFixturesMixin, TestCase):
    def test_returns_latest_messages_and_has_more_flag(self):
        with schema_context(self.schema_name):
            course, member = self._create_course_with_member()
            thread = get_or_create_course_chat_thread(course.id)
            for i in range(3):
                ChatMessage.objects.create(
                    thread=thread, user=member, content={"text": f"m{i}", "mentions": []}
                )

        factory = APIRequestFactory()
        req = DRFRequest(factory.get(f"/chat/threads/{thread.id}/messages?size=2"))
        with schema_context(self.schema_name):
            rows, has_more = fetch_thread_messages_page(
                req, thread, DirectMessageSerializer
            )
        self.assertEqual(len(rows), 2)
        self.assertTrue(has_more)
        self.assertEqual(rows[-1]["content"]["text"], "m2")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadMessageListCreateViewTests(ChatThreadFixturesMixin, TestCase):

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_course_thread_message_returns_405(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._create_course_with_member()
            thread = get_or_create_course_chat_thread(course.id)
            thread_id = thread.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{thread_id}/messages",
            {"content": {"text": "hi", "mentions": [], "attachments": []}},
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(member.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageListCreateView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_dm_thread_message_creates(self, mock_auth):
        with schema_context(self.schema_name):
            teacher_a = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())
            teacher_b = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.is_teacher() and u.id != teacher_a.id
            )
            thread, _ = get_or_create_dm_thread(teacher_a, teacher_b.id)
            thread_id = thread.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{thread_id}/messages",
            {"content": {"text": "hi", "mentions": [], "attachments": []}},
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(teacher_a.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageListCreateView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["data"]["thread"]["kind"], "dm")

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_get_forbidden_for_non_participant(self, mock_auth):
        with schema_context(self.schema_name):
            course, _member = self._create_course_with_member()
            outsider = self._pick_non_member(course)
            thread = get_or_create_course_chat_thread(course.id)
            thread_id = thread.id

        factory = APIRequestFactory()
        req = factory.get(f"/chat/threads/{thread_id}/messages")
        mock_auth.return_value = (_jwt_token_user(outsider.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageListCreateView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadMessageDetailViewTests(ChatThreadFixturesMixin, TestCase):
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_patch_own_dm_message(self, mock_auth):
        with schema_context(self.schema_name):
            teacher_a = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())
            teacher_b = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.is_teacher() and u.id != teacher_a.id
            )
            thread, _ = get_or_create_dm_thread(teacher_a, teacher_b.id)
            msg = ChatMessage.objects.create(
                thread=thread, user=teacher_a, content={"text": "orig", "mentions": []}
            )
            thread_id, message_id = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.patch(
            f"/chat/threads/{thread_id}/messages/{message_id}",
            {"content": {"text": "edited", "mentions": [], "attachments": []}},
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(teacher_a.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadMessageDetailView.as_view()(
                req, thread_id=thread_id, message_id=message_id
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["content"]["text"], "edited")

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_delete_own_dm_message(self, mock_auth):
        with schema_context(self.schema_name):
            teacher_a = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())
            teacher_b = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.is_teacher() and u.id != teacher_a.id
            )
            thread, _ = get_or_create_dm_thread(teacher_a, teacher_b.id)
            msg = ChatMessage.objects.create(
                thread=thread, user=teacher_a, content={"text": "bye", "mentions": []}
            )
            thread_id, message_id = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.delete(f"/chat/threads/{thread_id}/messages/{message_id}")
        mock_auth.return_value = (_jwt_token_user(teacher_a.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadMessageDetailView.as_view()(
                req, thread_id=thread_id, message_id=message_id
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(res.data["data"]["deleted_at"])

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadReactionAndReadStateAndPresenceTests(ChatThreadFixturesMixin, TestCase):
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_put_read_state_forbidden_for_non_participant(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._create_course_with_member()
            outsider = self._pick_non_member(course)
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread, user=member, content={"text": "hi", "mentions": []}
            )
            thread_id, message_id = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.put(
            f"/chat/threads/{thread_id}/read-state",
            {"last_read_message_id": message_id},
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(outsider.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadReadStatePutView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_put_read_state_rejects_non_integer_message_id(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._create_course_with_member()
            thread = get_or_create_course_chat_thread(course.id)
            thread_id = thread.id

        factory = APIRequestFactory()
        req = factory.put(
            f"/chat/threads/{thread_id}/read-state",
            {"last_read_message_id": "not-an-int"},
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(member.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadReadStatePutView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("last_read_message_id", str(res.data).lower())

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_put_read_state_cannot_move_backwards(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._create_course_with_member()
            thread = get_or_create_course_chat_thread(course.id)
            m1 = ChatMessage.objects.create(
                thread=thread, user=member, content={"text": "a", "mentions": []}
            )
            m2 = ChatMessage.objects.create(
                thread=thread, user=member, content={"text": "b", "mentions": []}
            )
            ChatReadState.objects.update_or_create(
                user=member, thread=thread, defaults={"last_read_message_id": m2.id}
            )
            thread_id, older_id = thread.id, m1.id

        factory = APIRequestFactory()
        req = factory.put(
            f"/chat/threads/{thread_id}/read-state",
            {"last_read_message_id": older_id},
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(member.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadReadStatePutView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("backwards", str(res.data).lower())

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_presence_rekey_legacy_heartbeat_visible_via_new_endpoint(self, mock_auth):
        from app_chat.realtime_presence import touch_presence

        with schema_context(self.schema_name):
            course, member = self._create_course_with_member()
            thread = get_or_create_course_chat_thread(course.id)
            thread_id = thread.id
            touch_presence(self.schema_name, thread_id, member.id)

        factory = APIRequestFactory()
        req = factory.get(f"/chat/threads/{thread_id}/presence")
        mock_auth.return_value = (_jwt_token_user(member.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadPresenceGetView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["online_user_ids"], [member.id])

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadListCreateViewTests(ChatThreadFixturesMixin, TestCase):
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_get_requires_kind_dm(self, mock_auth):
        with schema_context(self.schema_name):
            teacher = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())

        factory = APIRequestFactory()
        req = factory.get("/chat/threads?kind=course")
        mock_auth.return_value = (_jwt_token_user(teacher.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadListCreateView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_kind_dm_creates_thread_and_message(self, mock_auth):
        with schema_context(self.schema_name):
            student, teacher = self._pick_student_and_teacher_for_dm()

        factory = APIRequestFactory()
        req = factory.post(
            "/chat/threads",
            {
                "kind": "dm",
                "participant_user_id": teacher.id,
                "content": {"text": "hello", "mentions": [], "attachments": []},
            },
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(student.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadListCreateView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["data"]["thread"]["kind"], "dm")
        self.assertTrue(res.data["data"]["created"])

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_kind_group_returns_400(self, mock_auth):
        with schema_context(self.schema_name):
            teacher = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())

        factory = APIRequestFactory()
        req = factory.post("/chat/threads", {"kind": "group"}, format="json")
        mock_auth.return_value = (_jwt_token_user(teacher.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadListCreateView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_kind_course_returns_400(self, mock_auth):
        with schema_context(self.schema_name):
            teacher = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())

        factory = APIRequestFactory()
        req = factory.post("/chat/threads", {"kind": "course"}, format="json")
        mock_auth.return_value = (_jwt_token_user(teacher.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadListCreateView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def _pick_student_and_teacher_for_dm(self):
        student = next(u for u in User.objects.iterator(chunk_size=500) if u.is_student())
        teacher = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())
        return student, teacher
