"""
DM policy and eligible-users API tests (tenant schema + PostgreSQL).

Run (from schedjuice-reimagined-be, with DATABASE_URL pointing at Postgres):

    python manage.py test app_chat.tests.test_dm_permissions
"""

from __future__ import annotations

import csv
import os
import unittest
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_chat.models import ChatThread
from app_chat.services import (
    can_create_dm_thread,
    create_dm_message,
    get_or_create_dm_thread,
    start_dm_conversation,
)
from app_chat.views import (
    ChatThreadListCreateView,
    ChatThreadMessageListCreateView,
    DirectMessageEligibleUsersView,
)

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
class DmPermissionsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        from app_organization.models import Organization

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
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def _pick_pure_student_pair(self):
        students = [u for u in User.objects.iterator(chunk_size=500) if u.is_student()]
        self.assertGreaterEqual(
            len(students), 2, "load-data should provide at least two pure students"
        )
        return students[0], students[1]

    def _pick_student_and_teacher(self):
        student = next(
            u for u in User.objects.iterator(chunk_size=500) if u.is_student()
        )
        teacher = next(
            u for u in User.objects.iterator(chunk_size=500) if u.is_teacher()
        )
        self.assertIsNotNone(student)
        self.assertIsNotNone(teacher)
        return student, teacher

    def _pick_two_teachers(self):
        teachers = [u for u in User.objects.iterator(chunk_size=500) if u.is_teacher()]
        self.assertGreaterEqual(len(teachers), 2)
        return teachers[0], teachers[1]

    def _pick_student_and_admin(self):
        student = next(
            u for u in User.objects.iterator(chunk_size=500) if u.is_student()
        )
        admin = next(
            u for u in User.objects.iterator(chunk_size=500) if u.is_admin()
        )
        self.assertIsNotNone(student)
        self.assertIsNotNone(admin)
        return student, admin

    def _set_students_dm_admins_only(
        self, enabled: bool, contact_user_id: int | None = None
    ):
        from app_organization.models import Organization

        update: dict = {"is_students_dm_admins_only_enabled": enabled}
        if contact_user_id is not None:
            update["student_dm_contact_user_id"] = contact_user_id
        elif not enabled:
            update["student_dm_contact_user_id"] = None
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(**update)
            return Organization.objects.get(schema_name=self.schema_name)

    def test_student_cannot_dm_student(self):
        with schema_context(self.schema_name):
            student_a, student_b = self._pick_pure_student_pair()
            self.assertFalse(can_create_dm_thread(student_a, student_b))
            with self.assertRaises(ValidationError):
                get_or_create_dm_thread(student_a, student_b.id)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_eligible_users_excludes_pure_students_for_student_caller(self, mock_auth):
        with schema_context(self.schema_name):
            student_a, student_b = self._pick_pure_student_pair()
            teacher = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_teacher()
            )

        factory = APIRequestFactory()
        req = factory.get("/chat/dm/eligible-users?page=1&size=500")
        mock_auth.return_value = (_jwt_token_user(student_a.email), None)

        with schema_context(self.schema_name):
            res = DirectMessageEligibleUsersView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = res.data["data"]
        ids = {row["id"] for row in payload["results"]}
        self.assertNotIn(student_b.id, ids)
        self.assertIn(teacher.id, ids)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_eligible_users_teacher_sees_students(self, mock_auth):
        with schema_context(self.schema_name):
            student = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_student()
            )
            teacher = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_teacher()
            )

        factory = APIRequestFactory()
        req = factory.get("/chat/dm/eligible-users?page=1&size=500")
        mock_auth.return_value = (_jwt_token_user(teacher.email), None)

        with schema_context(self.schema_name):
            res = DirectMessageEligibleUsersView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = res.data["data"]
        ids = {row["id"] for row in payload["results"]}
        self.assertIn(student.id, ids)

    def test_start_dm_conversation_service(self):
        with schema_context(self.schema_name):
            student, teacher = self._pick_student_and_teacher()
            thread, message, created = start_dm_conversation(
                student,
                teacher.id,
                {"text": "Service test", "mentions": [], "attachments": []},
            )
            self.assertTrue(created)
            self.assertEqual(message.content["text"], "Service test")
            self.assertEqual(thread.id, message.thread_id)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_threads_without_content_returns_400(self, mock_auth):
        with schema_context(self.schema_name):
            student, teacher = self._pick_student_and_teacher()

        factory = APIRequestFactory()
        req = factory.post(
            "/chat/threads",
            {"kind": "dm", "participant_user_id": teacher.id},
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(student.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadListCreateView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("content", str(res.data).lower())

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_threads_with_content_creates_thread_and_message(self, mock_auth):
        with schema_context(self.schema_name):
            student, teacher = self._pick_student_and_teacher()

        factory = APIRequestFactory()
        content = {"text": "Hello from test", "mentions": [], "attachments": []}
        req = factory.post(
            "/chat/threads",
            {"kind": "dm", "participant_user_id": teacher.id, "content": content},
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(student.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadListCreateView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        payload = res.data["data"]
        self.assertTrue(payload["created"])
        self.assertEqual(payload["message"]["content"]["text"], "Hello from test")

        list_req = factory.get("/chat/threads?kind=dm")
        mock_auth.return_value = (_jwt_token_user(student.email), None)
        with schema_context(self.schema_name):
            list_res = ChatThreadListCreateView.as_view()(list_req)
        thread_ids = {row["id"] for row in list_res.data["data"]}
        self.assertIn(payload["thread"]["id"], thread_ids)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_threads_empty_content_rolls_back_new_thread(self, mock_auth):
        with schema_context(self.schema_name):
            teacher_a, teacher_b = self._pick_two_teachers()
            before_count = ChatThread.objects.filter(kind="dm").count()

        factory = APIRequestFactory()
        req = factory.post(
            "/chat/threads",
            {
                "kind": "dm",
                "participant_user_id": teacher_b.id,
                "content": {"text": "", "mentions": [], "attachments": []},
            },
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(teacher_a.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadListCreateView.as_view()(req)
            after_count = ChatThread.objects.filter(kind="dm").count()

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(before_count, after_count)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_get_threads_excludes_empty_threads(self, mock_auth):
        with schema_context(self.schema_name):
            teacher_a, teacher_b = self._pick_two_teachers()
            empty_thread, _ = get_or_create_dm_thread(teacher_a, teacher_b.id)
            empty_thread_id = empty_thread.id

        factory = APIRequestFactory()
        list_req = factory.get("/chat/threads?kind=dm")
        mock_auth.return_value = (_jwt_token_user(teacher_a.email), None)

        with schema_context(self.schema_name):
            list_res = ChatThreadListCreateView.as_view()(list_req)
        thread_ids = {row["id"] for row in list_res.data["data"]}
        self.assertNotIn(empty_thread_id, thread_ids)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_dm_non_participant_forbidden_via_unified_endpoint(self, mock_auth):
        with schema_context(self.schema_name):
            student, teacher = self._pick_student_and_teacher()
            thread, _ = get_or_create_dm_thread(student, teacher.id)
            outsider = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.id not in (student.id, teacher.id)
            )
            thread_id = thread.id

        factory = APIRequestFactory()
        req = factory.get(f"/chat/threads/{thread_id}/messages")
        mock_auth.return_value = (_jwt_token_user(outsider.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageListCreateView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_students_dm_admins_only_blocks_student_to_teacher(self):
        from app_organization.models import Organization

        with schema_context(self.schema_name):
            student, teacher = self._pick_student_and_teacher()
            admin = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_admin()
            )

        tenant = self._set_students_dm_admins_only(True, contact_user_id=admin.id)

        with schema_context(self.schema_name):
            self.assertFalse(
                can_create_dm_thread(student, teacher, tenant=tenant)
            )
            with self.assertRaises(ValidationError):
                get_or_create_dm_thread(student, teacher.id, tenant=tenant)

        self._set_students_dm_admins_only(False)

    def test_students_dm_admins_only_allows_student_to_admin(self):
        with schema_context(self.schema_name):
            student, admin = self._pick_student_and_admin()

        tenant = self._set_students_dm_admins_only(True, contact_user_id=admin.id)

        with schema_context(self.schema_name):
            self.assertTrue(
                can_create_dm_thread(student, admin, tenant=tenant)
            )
            thread, created = get_or_create_dm_thread(
                student, admin.id, tenant=tenant
            )
            self.assertTrue(created or thread is not None)

        self._set_students_dm_admins_only(False)

    def test_students_dm_admins_only_blocks_student_to_other_admin(self):
        with schema_context(self.schema_name):
            student, assigned_admin = self._pick_student_and_admin()
            other_admins = [
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.is_admin() and u.id != assigned_admin.id
            ]
            if not other_admins:
                self.skipTest("Need at least two admins in fixture data")
            other_admin = other_admins[0]

        tenant = self._set_students_dm_admins_only(
            True, contact_user_id=assigned_admin.id
        )

        with schema_context(self.schema_name):
            self.assertFalse(
                can_create_dm_thread(student, other_admin, tenant=tenant)
            )
            with self.assertRaises(ValidationError):
                get_or_create_dm_thread(
                    student, other_admin.id, tenant=tenant
                )

        self._set_students_dm_admins_only(False)

    def test_students_dm_admins_only_without_contact_blocks_student_dm(self):
        from app_organization.models import Organization

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_students_dm_admins_only_enabled=True,
                student_dm_contact_user_id=None,
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)

        with schema_context(self.schema_name):
            student, admin = self._pick_student_and_admin()
            self.assertFalse(
                can_create_dm_thread(student, admin, tenant=tenant)
            )

        self._set_students_dm_admins_only(False)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_students_dm_admins_only_eligible_users_excludes_teachers(
        self, mock_auth
    ):
        from app_organization.models import Organization

        with schema_context(self.schema_name):
            student, teacher = self._pick_student_and_teacher()
            admin = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_admin()
            )

        tenant = self._set_students_dm_admins_only(True, contact_user_id=admin.id)

        factory = APIRequestFactory()
        req = factory.get("/chat/dm/eligible-users?page=1&size=500")
        req.tenant = tenant
        mock_auth.return_value = (_jwt_token_user(student.email), None)

        with schema_context(self.schema_name):
            res = DirectMessageEligibleUsersView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data["data"]["results"]}
        self.assertEqual(ids, {admin.id})

        self._set_students_dm_admins_only(False)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_students_dm_admins_only_eligible_users_empty_without_contact(
        self, mock_auth
    ):
        from app_organization.models import Organization

        with schema_context(self.schema_name):
            student = next(
                u for u in User.objects.iterator(chunk_size=500) if u.is_student()
            )

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_students_dm_admins_only_enabled=True,
                student_dm_contact_user_id=None,
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)

        factory = APIRequestFactory()
        req = factory.get("/chat/dm/eligible-users?page=1&size=500")
        req.tenant = tenant
        mock_auth.return_value = (_jwt_token_user(student.email), None)

        with schema_context(self.schema_name):
            res = DirectMessageEligibleUsersView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["results"], [])

        self._set_students_dm_admins_only(False)

    def test_students_dm_admins_only_teacher_can_still_dm_student(self):
        from app_organization.models import Organization

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_students_dm_admins_only_enabled=True
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)

        with schema_context(self.schema_name):
            student, teacher = self._pick_student_and_teacher()
            self.assertTrue(
                can_create_dm_thread(teacher, student, tenant=tenant)
            )
            thread, created = get_or_create_dm_thread(
                teacher, student.id, tenant=tenant
            )
            self.assertTrue(created or thread is not None)

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_students_dm_admins_only_enabled=False
            )

    def test_students_dm_admins_only_existing_thread_student_send_blocked(self):
        from app_organization.models import Organization

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_students_dm_admins_only_enabled=False
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)

        with schema_context(self.schema_name):
            student, teacher = self._pick_student_and_teacher()
            thread, _ = get_or_create_dm_thread(
                student, teacher.id, tenant=tenant
            )
            _, err = create_dm_message(
                thread.id,
                student,
                {"text": "before flag", "mentions": [], "attachments": []},
                tenant=tenant,
            )
            self.assertIsNone(err)

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_students_dm_admins_only_enabled=True
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)

        with schema_context(self.schema_name):
            _, student_err = create_dm_message(
                thread.id,
                student,
                {"text": "blocked", "mentions": [], "attachments": []},
                tenant=tenant,
            )
            self.assertEqual(student_err, "dm_policy_blocked")
            _, teacher_err = create_dm_message(
                thread.id,
                teacher,
                {"text": "allowed", "mentions": [], "attachments": []},
                tenant=tenant,
            )
            self.assertIsNone(teacher_err)

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_students_dm_admins_only_enabled=False
            )
