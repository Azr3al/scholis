"""Tests for tenant-gated student–teacher group chat provisioning."""
from __future__ import annotations

import csv
import os
import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIRequestFactory
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_chat.models import ChatThread, ChatThreadKind, ChatThreadParticipant
from app_chat.services import (
    can_access_thread,
    create_group_message,
    get_or_create_course_chat_thread,
)
from app_chat.student_teacher_group_chat import (
    build_student_teacher_group_key,
    course_wide_chat_enabled,
    is_group_thread_listable,
    list_student_teacher_group_threads_for_user,
    sync_student_teacher_group_thread,
)
from app_chat.views import ChatThreadListCreateView, ChatThreadResolveView
from app_course.course_status import compute_effective_status
from app_course.models import AssignedAsRole, Category, Course, UserCourse
from app_course.program_helpers import create_default_general_program, get_default_program
from app_organization.models import Organization


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
class StudentTeacherGroupChatTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        tenant = Organization.objects.filter(schema_name=cls.schema_name).first()
        if tenant is None:
            org_csv = os.path.normpath(
                os.path.join(
                    os.path.dirname(__file__),
                    "..",
                    "..",
                    "app_data",
                    "dummydata",
                    "organization.csv",
                )
            )
            with open(org_csv, "r", encoding="utf-8") as f:
                row = next(
                    (r for r in csv.DictReader(f) if r["schema_name"] == cls.schema_name),
                    None,
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
        Organization.objects.filter(schema_name=cls.schema_name).update(
            timezone="UTC",
            is_student_teacher_group_chat_enabled=True,
        )

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._save_delay_patch = patch(
            "app_chat.signals_enrollment.sync_group_chat_on_user_course_change.delay"
        )
        cls._delete_delay_patch = patch(
            "app_chat.signals_enrollment.sync_group_chat_after_user_course_delete.delay"
        )
        cls._telegram_delay_patch = patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._save_delay_patch.start()
        cls._delete_delay_patch.start()
        cls._telegram_delay_patch.start()

    @classmethod
    def tearDownClass(cls):
        cls._save_delay_patch.stop()
        cls._delete_delay_patch.stop()
        cls._telegram_delay_patch.stop()
        super().tearDownClass()

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.tenant = Organization.objects.get(schema_name=self.schema_name)

    def _active_course_with_student_and_mt(self):
        category = Category.objects.first()
        main_role, _ = AssignedAsRole.objects.get_or_create(
            name=f"Main Teacher (group chat {uuid4().hex[:6]})",
            defaults={"seniority": AssignedAsRole.Seniority.MAIN_TEACHER},
        )
        other_role, _ = AssignedAsRole.objects.get_or_create(
            name=f"Dean oversight (group chat {uuid4().hex[:6]})",
            defaults={"seniority": AssignedAsRole.Seniority.OTHER},
        )
        student = User.objects.filter(roles__contains=[User.UserRole.STUDENT]).first()
        mt = User.objects.filter(roles__contains=[User.UserRole.TEACHER]).first()
        oversight = (
            User.objects.filter(roles__contains=[User.UserRole.TEACHER])
            .exclude(pk=mt.pk)
            .first()
        )
        self.assertIsNotNone(student)
        self.assertIsNotNone(mt)
        today = date.today()
        course = Course.objects.create(
            title=f"Group chat course {uuid4().hex[:8]}",
            code=f"GC-{uuid4().hex[:8]}",
            category=category,
            program=get_default_program(),
            start_date=today.replace(month=1, day=1),
            end_date=today.replace(month=12, day=31),
        )
        UserCourse.objects.create(
            user=student,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        UserCourse.objects.create(
            user=mt,
            course=course,
            assigned_as=UserCourse.AssignedAs.TEACHER,
            assigned_as_role=main_role,
        )
        if oversight is not None:
            UserCourse.objects.create(
                user=oversight,
                course=course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=other_role,
            )
        return course, student, mt, oversight

    def test_sync_creates_thread_with_student_and_mt_only(self):
        with schema_context(self.schema_name):
            course, student, mt, oversight = self._active_course_with_student_and_mt()
            thread = sync_student_teacher_group_thread(student.id, course.id, self.tenant)
            self.assertIsNotNone(thread)
            self.assertEqual(thread.kind, ChatThreadKind.GROUP)
            self.assertEqual(
                thread.group_key, build_student_teacher_group_key(student.id, course.id)
            )
            participant_ids = set(
                ChatThreadParticipant.objects.filter(thread=thread).values_list(
                    "user_id", flat=True
                )
            )
            self.assertIn(student.id, participant_ids)
            self.assertIn(mt.id, participant_ids)
            if oversight is not None:
                self.assertNotIn(oversight.id, participant_ids)

    def test_flag_off_skips_sync(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_student_teacher_group_chat_enabled=False
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            course, student, _mt, _ = self._active_course_with_student_and_mt()
            thread = sync_student_teacher_group_thread(student.id, course.id, tenant)
            self.assertIsNone(thread)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_student_teacher_group_chat_enabled=True
            )

    def test_empty_thread_appears_in_group_list(self):
        with schema_context(self.schema_name):
            course, student, mt, _ = self._active_course_with_student_and_mt()
            sync_student_teacher_group_thread(student.id, course.id, self.tenant)
            threads = list_student_teacher_group_threads_for_user(student)
            self.assertEqual(len(threads), 1)
            self.assertIsNone(threads[0].latest_message_id)

    def test_ended_course_hidden_from_list_and_access_denied(self):
        with schema_context(self.schema_name):
            course, student, mt, _ = self._active_course_with_student_and_mt()
            thread = sync_student_teacher_group_thread(student.id, course.id, self.tenant)
            course.status_override = Course.StatusOverride.ENDED
            course.save(update_fields=["status_override", "updated_at"])
            course.refresh_from_db()
            self.assertEqual(
                compute_effective_status(course), Course.CourseStatus.ENDED
            )
            self.assertFalse(is_group_thread_listable(thread))
            self.assertFalse(can_access_thread(student, thread))
            self.assertEqual(list_student_teacher_group_threads_for_user(student), [])

    def test_student_cannot_access_another_students_group_thread(self):
        with schema_context(self.schema_name):
            course, student, _mt, _ = self._active_course_with_student_and_mt()
            other_student = (
                User.objects.filter(roles__contains=[User.UserRole.STUDENT])
                .exclude(pk=student.pk)
                .first()
            )
            self.assertIsNotNone(other_student)
            thread = sync_student_teacher_group_thread(student.id, course.id, self.tenant)
            self.assertFalse(can_access_thread(other_student, thread))

    def test_create_group_message_for_participant(self):
        with schema_context(self.schema_name):
            course, student, _mt, _ = self._active_course_with_student_and_mt()
            thread = sync_student_teacher_group_thread(student.id, course.id, self.tenant)
            msg, err = create_group_message(
                thread.id, student, {"text": "hello", "attachments": []}
            )
            self.assertIsNone(err)
            self.assertIsNotNone(msg)
            self.assertEqual(msg.content["text"], "hello")

    def test_course_wide_chat_disabled_when_group_chat_enabled(self):
        self.assertTrue(course_wide_chat_enabled(self.tenant) is False)
        with schema_context(self.schema_name):
            course, student, mt, _ = self._active_course_with_student_and_mt()
            course_thread = get_or_create_course_chat_thread(course.id)
            self.assertFalse(can_access_thread(student, course_thread))
            self.assertFalse(can_access_thread(mt, course_thread))

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_resolve_course_thread_forbidden_when_group_chat_enabled(self, mock_auth):
        with schema_context(self.schema_name):
            course, student, _mt, _ = self._active_course_with_student_and_mt()
            factory = APIRequestFactory()
            req = factory.get(f"/courses/{course.id}/chat/thread")
            mock_auth.return_value = (_jwt_token_user(student.email), None)
            req.tenant = self.tenant
            res = ChatThreadResolveView.as_view()(req, course_id=course.id)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_without_participant_row_forbidden(self):
        with schema_context(self.schema_name):
            course, student, _mt, _ = self._active_course_with_student_and_mt()
            thread = sync_student_teacher_group_thread(student.id, course.id, self.tenant)
            admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(admin)
            self.assertFalse(can_access_thread(admin, thread))
            _msg, err = create_group_message(
                thread.id, admin, {"text": "nope", "attachments": []}
            )
            self.assertEqual(err, "forbidden")

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_get_kind_group_returns_threads_when_flag_on(self, mock_auth):
        with schema_context(self.schema_name):
            course, student, mt, _ = self._active_course_with_student_and_mt()
            sync_student_teacher_group_thread(student.id, course.id, self.tenant)
            factory = APIRequestFactory()
            req = factory.get("/chat/threads?kind=group")
            mock_auth.return_value = (_jwt_token_user(student.email), None)
            req.tenant = self.tenant
            res = ChatThreadListCreateView.as_view()(req)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(len(res.data["data"]), 1)
            self.assertEqual(res.data["data"][0]["kind"], "group")
            participants = res.data["data"][0]["participants"]
            labels_by_id = {p["id"]: p["role_label"] for p in participants}
            self.assertEqual(labels_by_id.get(student.id), "Student")
            self.assertEqual(labels_by_id.get(mt.id), "Teacher")
            roles_by_id = {p["id"]: p.get("roles") for p in participants}
            self.assertIn(User.UserRole.STUDENT, roles_by_id.get(student.id, []))
            self.assertEqual(res.data["data"][0].get("anchor_user_id"), student.id)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_get_kind_group_empty_when_flag_off(self, mock_auth):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_student_teacher_group_chat_enabled=False
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            course, student, _mt, _ = self._active_course_with_student_and_mt()
            sync_student_teacher_group_thread(student.id, course.id, tenant)
            factory = APIRequestFactory()
            req = factory.get("/chat/threads?kind=group")
            mock_auth.return_value = (_jwt_token_user(student.email), None)
            req.tenant = tenant
            res = ChatThreadListCreateView.as_view()(req)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data["data"], [])
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_student_teacher_group_chat_enabled=True
            )

    def test_student_left_removes_from_participants(self):
        with schema_context(self.schema_name):
            course, student, mt, _ = self._active_course_with_student_and_mt()
            thread = sync_student_teacher_group_thread(student.id, course.id, self.tenant)
            uc = UserCourse.objects.get(
                user=student, course=course, assigned_as=UserCourse.AssignedAs.STUDENT
            )
            uc.left_at = course.updated_at
            uc.save(update_fields=["left_at", "updated_at"])
            sync_student_teacher_group_thread(student.id, course.id, self.tenant)
            participant_ids = set(
                ChatThreadParticipant.objects.filter(thread=thread).values_list(
                    "user_id", flat=True
                )
            )
            self.assertNotIn(student.id, participant_ids)
            self.assertIn(mt.id, participant_ids)
