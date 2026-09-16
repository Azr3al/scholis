"""
Course chat permission and validation tests (tenant schema + PostgreSQL).

Run (from schedjuice-reimagined-be, with DATABASE_URL pointing at Postgres):

    python manage.py test app_chat.tests
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
from app_chat.services import (
    can_moderate_chat,
    get_or_create_course_chat_thread,
    get_or_create_dm_thread,
    non_dropped_member_count,
    normalize_dm_pair_key,
    validate_chat_content_payload,
    validate_mention_user_ids,
)
from app_chat.views import ChatThreadMessageDetailView
from app_course.models import AssignedAsRole, Category, Course, UserCourse
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
    """Minimal object compatible with User.get_user_from_request and IsAuthenticated."""
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()


@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class CourseChatPermissionsTests(TestCase):
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
        """Returns (course, author, other_member) inside caller's schema_context."""
        category = Category.objects.first()
        self.assertIsNotNone(category)
        students = list(
            User.objects.filter(roles__contains=[User.UserRole.STUDENT])[:2]
        )
        self.assertEqual(
            len(students), 2, "load-data should provide at least two students"
        )
        author, other = students[0], students[1]
        course = Course.objects.create(
            title=f"Chat perm test {uuid4()}",
            code=f"CHAT-{uuid4().hex[:8]}",
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

    def test_non_dropped_member_count_zero_without_enrollments(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            self.assertIsNotNone(category)
            course = Course.objects.create(
                title=f"Empty chat course {uuid4()}",
                code=f"EMPTY-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            cid = course.id

        with schema_context(self.schema_name):
            self.assertEqual(non_dropped_member_count(cid), 0)

    def test_validate_mention_user_ids_rejects_non_member(self):
        with schema_context(self.schema_name):
            course, author, other = self._create_course_with_students()
            # Any tenant user not enrolled in this course is an invalid mention target.
            outsider = User.objects.exclude(pk__in=[author.pk, other.pk]).first()
            self.assertIsNotNone(outsider)
            cid = course.id
            bad_id = outsider.id

        with schema_context(self.schema_name):
            with self.assertRaises(ValidationError) as ctx:
                validate_mention_user_ids(cid, [bad_id])
            err = ctx.exception
            self.assertIn("mentions", err.message_dict)
            self.assertIn(str(bad_id), str(err.message_dict["mentions"]))

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_unified_patch_forbidden_when_not_author(self, mock_authenticate):
        with schema_context(self.schema_name):
            course, author, other = self._create_course_with_students()
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "original", "mentions": []},
            )
            thread_id, mid = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.patch(
            f"/chat/threads/{thread_id}/messages/{mid}",
            {"content": {"text": "changed", "mentions": []}},
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(other.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageDetailView.as_view()(
                req, thread_id=thread_id, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(res.data.get("isError"))
        self.assertEqual(res.data.get("message"), "forbidden")

    def test_can_moderate_chat_teacher_not_student(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            main_role, _ = AssignedAsRole.objects.get_or_create(
                name="Main Teacher (chat test)",
                defaults={"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
            )
            student = User.objects.filter(
                roles__contains=[User.UserRole.STUDENT]
            ).first()
            teacher = User.objects.filter(
                roles__contains=[User.UserRole.TEACHER]
            ).first()
            self.assertIsNotNone(student)
            self.assertIsNotNone(teacher)

            course = Course.objects.create(
                title=f"Moderation test {uuid4()}",
                code=f"MOD-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=teacher,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=main_role,
            )
            cid = course.id

            self.assertTrue(can_moderate_chat(teacher, cid))
            self.assertFalse(can_moderate_chat(student, cid))

    def test_dm_get_or_create_returns_single_thread_for_pair(self):
        with schema_context(self.schema_name):
            student = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_student()
            )
            teacher = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_teacher()
            )
            u1, u2 = student, teacher
            thread1, created1 = get_or_create_dm_thread(u1, u2.id)
            thread2, created2 = get_or_create_dm_thread(u2, u1.id)
            self.assertTrue(created1)
            self.assertFalse(created2)
            self.assertEqual(thread1.id, thread2.id)
            self.assertEqual(thread1.dm_pair_key, normalize_dm_pair_key(u1.id, u2.id))

    def test_validate_chat_content_payload_requires_text_or_attachment(self):
        with self.assertRaises(ValidationError):
            validate_chat_content_payload({"text": "", "attachments": []})
        good_text = validate_chat_content_payload({"text": "hello", "attachments": []})
        self.assertEqual(good_text["text"], "hello")
        good_attachment = validate_chat_content_payload(
            {
                "text": "",
                "attachments": [{"attachment_id": 99}],
            }
        )
        self.assertEqual(len(good_attachment["attachments"]), 1)

    @patch("app_chat.views.broadcast_to_chat_thread")
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_unified_patch_rejects_invalid_mention(
        self, mock_authenticate, mock_broadcast
    ):
        with schema_context(self.schema_name):
            course, author, other = self._create_course_with_students()
            outsider = User.objects.exclude(pk__in=[author.pk, other.pk]).first()
            self.assertIsNotNone(outsider)
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "original", "mentions": []},
            )
            thread_id, mid, bad_id = thread.id, msg.id, outsider.id

        factory = APIRequestFactory()
        req = factory.patch(
            f"/chat/threads/{thread_id}/messages/{mid}",
            {
                "content": {
                    "text": "changed",
                    "mentions": [{"user_id": bad_id, "offset": 0, "length": 1}],
                }
            },
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(author.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageDetailView.as_view()(
                req, thread_id=thread_id, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("mentions", str(res.data).lower())
        mock_broadcast.assert_not_called()

    @patch("app_chat.views.broadcast_to_chat_thread")
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_unified_patch_broadcasts_message_edited(
        self, mock_authenticate, mock_broadcast
    ):
        with schema_context(self.schema_name):
            course, author, _other = self._create_course_with_students()
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "original", "mentions": []},
            )
            thread_id, mid = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.patch(
            f"/chat/threads/{thread_id}/messages/{mid}",
            {"content": {"text": "changed", "mentions": []}},
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(author.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageDetailView.as_view()(
                req, thread_id=thread_id, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_broadcast.assert_called_once()
        args = mock_broadcast.call_args[0]
        self.assertEqual(args[1], thread_id)
        self.assertEqual(args[2]["event"], "message_edited")
        self.assertEqual(args[2]["data"]["content"]["text"], "changed")
