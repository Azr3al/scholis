"""Unit tests for the new unified chat model constraints (no server, real Postgres)."""

from __future__ import annotations

import unittest
from uuid import uuid4

from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_chat.models import ChatThread, ChatThreadKind, ChatThreadParticipant


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UnifiedChatModelConstraintTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_one_course_thread_per_course(self):
        with schema_context(self.schema_name):
            from app_course.models import Category, Course
            from app_course.program_helpers import create_default_general_program, get_default_program

            create_default_general_program()
            category = Category.objects.first()
            from app_course.models import Course as CourseModel

            course = CourseModel.objects.create(
                title=f"Unified model test {uuid4()}",
                code=f"UNI-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            ChatThread.objects.create(kind=ChatThreadKind.COURSE, course=course)
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    ChatThread.objects.create(kind=ChatThreadKind.COURSE, course=course)

    def test_one_dm_thread_per_pair_key(self):
        with schema_context(self.schema_name):
            ChatThread.objects.create(kind=ChatThreadKind.DM, dm_pair_key="1:2")
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    ChatThread.objects.create(kind=ChatThreadKind.DM, dm_pair_key="1:2")

    def test_participant_unique_per_thread(self):
        with schema_context(self.schema_name):
            thread = ChatThread.objects.create(kind=ChatThreadKind.DM, dm_pair_key="10:20")
            user = User.objects.first()
            self.assertIsNotNone(user)
            ChatThreadParticipant.objects.create(thread=thread, user=user)
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    ChatThreadParticipant.objects.create(thread=thread, user=user)
