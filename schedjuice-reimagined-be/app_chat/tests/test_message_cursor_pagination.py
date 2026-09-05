"""Tests for chat message cursor pagination and attachment batching."""

from __future__ import annotations

import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_chat.message_cursor import (
    fetch_latest_messages,
    fetch_older_messages,
)
from app_chat.models import ChatMessage
from app_chat.services import get_or_create_course_chat_thread, get_or_create_dm_thread
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac


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


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class ChatMessageCursorPaginationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timezone.timedelta(days=30),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as="student",
            )
            self.thread, _ = get_or_create_dm_thread(self.student, self.teacher.id)

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=_jwt_token_user(user.email))
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _seed_course_messages(self, count: int) -> list[ChatMessage]:
        thread = get_or_create_course_chat_thread(self.course.id)
        rows = []
        for i in range(count):
            rows.append(
                ChatMessage.objects.create(
                    thread=thread,
                    user=self.student,
                    content={"text": f"msg {i}", "mentions": [], "attachments": []},
                )
            )
        return rows

    def _seed_dm_messages(self, count: int) -> list[ChatMessage]:
        rows = []
        for i in range(count):
            rows.append(
                ChatMessage.objects.create(
                    thread=self.thread,
                    user=self.student,
                    content={"text": f"dm {i}", "mentions": [], "attachments": []},
                )
            )
        return rows

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_course_chat_before_id_returns_older_page(self, mock_authenticate):
        mock_authenticate.return_value = (_jwt_token_user(self.student.email), None)
        with schema_context(self.schema_name):
            self._seed_course_messages(120)
            course_thread = get_or_create_course_chat_thread(self.course.id)
            newest = (
                ChatMessage.objects.filter(thread=course_thread).order_by("-id").first()
            )
            thread_id = course_thread.id
            resp = self._client(self.student).get(
                f"/api/v1/chat/threads/{thread_id}/messages"
                f"?before_id={newest.id}&size=50"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()["data"]
        rows = payload["results"]
        self.assertEqual(len(rows), 50)
        self.assertTrue(all(row["id"] < newest.id for row in rows))
        self.assertTrue(payload["has_more"])

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_course_chat_initial_load_caps_at_default_size_via_unified_endpoint(
        self, mock_authenticate
    ):
        mock_authenticate.return_value = (_jwt_token_user(self.student.email), None)
        with schema_context(self.schema_name):
            self._seed_course_messages(120)
            thread_id = get_or_create_course_chat_thread(self.course.id).id
            resp = self._client(self.student).get(
                f"/api/v1/chat/threads/{thread_id}/messages"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()["data"]
        rows = payload["results"]
        self.assertEqual(len(rows), 100)
        self.assertTrue(payload["has_more"])
        self.assertEqual([row["id"] for row in rows], sorted(row["id"] for row in rows))

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_dm_list_caps_initial_response(self, mock_authenticate):
        mock_authenticate.return_value = (_jwt_token_user(self.student.email), None)
        with schema_context(self.schema_name):
            self._seed_dm_messages(120)
            resp = self._client(self.student).get(
                f"/api/v1/chat/threads/{self.thread.id}/messages?size=100"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()["data"]
        rows = payload["results"]
        self.assertEqual(len(rows), 100)
        self.assertTrue(payload["has_more"])
        self.assertEqual([row["id"] for row in rows], sorted(row["id"] for row in rows))

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_dm_before_id_returns_older_messages(self, mock_authenticate):
        mock_authenticate.return_value = (_jwt_token_user(self.student.email), None)
        with schema_context(self.schema_name):
            self._seed_dm_messages(120)
            oldest_in_first_page = ChatMessage.objects.filter(
                thread=self.thread
            ).order_by("-id")[20]
            resp = self._client(self.student).get(
                f"/api/v1/chat/threads/{self.thread.id}/messages"
                f"?before_id={oldest_in_first_page.id}&size=20"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        rows = resp.json()["data"]["results"]
        self.assertEqual(len(rows), 20)
        self.assertTrue(all(row["id"] < oldest_in_first_page.id for row in rows))

    def test_cursor_helpers_return_ascending_rows(self):
        with schema_context(self.schema_name):
            self._seed_course_messages(10)
            qs = ChatMessage.objects.filter(
                thread=get_or_create_course_chat_thread(self.course.id)
            )
            latest = fetch_latest_messages(qs, 5)
            self.assertEqual(len(latest), 5)
            self.assertEqual(
                [row.id for row in latest],
                sorted(row.id for row in latest),
            )
            before_id = latest[0].id
            older = fetch_older_messages(qs, before_id, 3)
            self.assertEqual(len(older), 3)
            self.assertTrue(all(row.id < before_id for row in older))
