"""Tests for the batched course chat preview endpoint added in Phase 3
(mobile migration). See
docs/superpowers/specs/2026-07-04-unified-chat-schema-phase3-mobile-migration-design.md
section "Backend addendum 1".
"""

from __future__ import annotations

import unittest
from unittest.mock import patch
from uuid import uuid4

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APIRequestFactory
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import schema_context

from app_chat.models import ChatMessage
from app_chat.services import get_or_create_course_chat_thread
from app_chat.tests.test_thread_endpoints import (
    ChatThreadFixturesMixin,
    _database_reachable,
    _jwt_token_user,
)
from app_chat.views import CourseChatLastMessagesBatchView
from app_course.models import Category, Course, UserCourse
from app_course.program_helpers import get_default_program

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseChatLastMessagesBatchViewTests(ChatThreadFixturesMixin, TestCase):
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_returns_last_message_and_unread_count_per_course(self, mock_auth):
        with schema_context(self.schema_name):
            course_a, member = self._create_course_with_member()
            course_b, _ = self._create_course_with_member()
            UserCourse.objects.get_or_create(
                user=member,
                course=course_b,
                defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
            )
            thread_a = get_or_create_course_chat_thread(course_a.id)
            other = self._pick_non_member(course_a)
            UserCourse.objects.create(
                user=other, course=course_a, assigned_as=UserCourse.AssignedAs.STUDENT
            )
            ChatMessage.objects.create(
                thread=thread_a, user=other, content={"text": "first", "mentions": []}
            )
            latest = ChatMessage.objects.create(
                thread=thread_a, user=other, content={"text": "second", "mentions": []}
            )
            cid_a, cid_b = course_a.id, course_b.id

        factory = APIRequestFactory()
        req = factory.get(f"/courses/chat/last-messages?course_ids={cid_a},{cid_b}")
        mock_auth.return_value = (_jwt_token_user(member.email), None)

        with schema_context(self.schema_name):
            res = CourseChatLastMessagesBatchView.as_view()(req)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = res.data["data"]
        self.assertIn(str(cid_a), payload)
        self.assertIn(str(cid_b), payload)
        self.assertEqual(payload[str(cid_a)]["last_message"]["id"], latest.id)
        self.assertEqual(payload[str(cid_a)]["last_message"]["content"]["text"], "second")
        self.assertEqual(payload[str(cid_a)]["unread_count"], 2)
        self.assertIsNone(payload[str(cid_b)]["last_message"])
        self.assertEqual(payload[str(cid_b)]["unread_count"], 0)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_silently_drops_courses_the_user_is_not_a_member_of(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._create_course_with_member()
            outsider = self._pick_non_member(course)
            category = Category.objects.first()
            self.assertIsNotNone(category)
            outsider_course = Course.objects.create(
                title=f"Outsider batch preview test {uuid4()}",
                code=f"OBP-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            UserCourse.objects.create(
                user=outsider,
                course=outsider_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            cid, outsider_cid = course.id, outsider_course.id

        factory = APIRequestFactory()
        req = factory.get(f"/courses/chat/last-messages?course_ids={cid},{outsider_cid}")
        mock_auth.return_value = (_jwt_token_user(member.email), None)

        with schema_context(self.schema_name):
            res = CourseChatLastMessagesBatchView.as_view()(req)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = res.data["data"]
        self.assertIn(str(cid), payload)
        self.assertNotIn(str(outsider_cid), payload)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_empty_course_ids_returns_empty_data(self, mock_auth):
        with schema_context(self.schema_name):
            _course, member = self._create_course_with_member()

        factory = APIRequestFactory()
        req = factory.get("/courses/chat/last-messages")
        mock_auth.return_value = (_jwt_token_user(member.email), None)

        with schema_context(self.schema_name):
            res = CourseChatLastMessagesBatchView.as_view()(req)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"], {})

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_non_integer_course_ids_returns_bad_request(self, mock_auth):
        with schema_context(self.schema_name):
            _course, member = self._create_course_with_member()

        factory = APIRequestFactory()
        req = factory.get("/courses/chat/last-messages?course_ids=abc")
        mock_auth.return_value = (_jwt_token_user(member.email), None)

        with schema_context(self.schema_name):
            res = CourseChatLastMessagesBatchView.as_view()(req)

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
