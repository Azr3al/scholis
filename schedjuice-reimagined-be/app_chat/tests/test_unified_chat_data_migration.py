"""
Data migration test: legacy course/DM chat rows -> unified ChatThread/ChatMessage/
ChatReadState/ChatMessageReaction, with ID remap and reply_to/reaction backfill.
"""

from __future__ import annotations

import importlib
import unittest
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.db.migrations.loader import MigrationLoader
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_chat.models import (
    ChatMessage,
    ChatMessageReaction,
    ChatReadState,
    ChatThread,
    ChatThreadKind,
    ChatThreadParticipant,
)
from app_course.models import Category, Course
from app_course.program_helpers import create_default_general_program, get_default_program

_migration_module = importlib.import_module(
    "app_chat.migrations.0011_populate_unified_chat_data"
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _historical_apps_at_0010():
    loader = MigrationLoader(connection, ignore_no_migrations=True)
    state = loader.project_state([("app_chat", "0010_add_unified_chat_models")])
    return state.apps


def _legacy_reaction_model():
    """Historical ChatMessageReaction while legacy FK columns still exist (pre-0012)."""
    return _historical_apps_at_0010().get_model("app_chat", "ChatMessageReaction")


def _legacy_course_chat_message_model():
    return _historical_apps_at_0010().get_model("app_chat", "CourseChatMessage")


def _legacy_course_chat_read_state_model():
    return _historical_apps_at_0010().get_model("app_chat", "CourseChatReadState")


def _legacy_direct_message_thread_model():
    return _historical_apps_at_0010().get_model("app_chat", "DirectMessageThread")


def _legacy_direct_message_model():
    return _historical_apps_at_0010().get_model("app_chat", "DirectMessage")


def _legacy_direct_message_read_state_model():
    return _historical_apps_at_0010().get_model("app_chat", "DirectMessageReadState")


def _reaction_table_has_legacy_columns(schema_name: str = "xschedjuice") -> bool:
    with schema_context(schema_name):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = %s
                  AND table_name = 'app_chat_chatmessagereaction'
                  AND column_name = 'course_chat_message_id'
                LIMIT 1
                """,
                [schema_name],
            )
            return cursor.fetchone() is not None


def _clear_unified_chat_rows():
    if _reaction_table_has_legacy_columns():
        ChatMessageReaction.objects.all().update(message_id=None)
    ChatReadState.objects.all().delete()
    ChatMessage.objects.all().delete()
    ChatThreadParticipant.objects.all().delete()
    ChatThread.objects.all().delete()


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UnifiedChatDataMigrationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        if not _reaction_table_has_legacy_columns(cls.schema_name):
            raise unittest.SkipTest(
                "Data migration tests require schema at 0011 (legacy reaction FK columns)"
            )
        super().setUpClass()

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
            create_default_general_program()

    def _run_forward(self):
        _clear_unified_chat_rows()
        _migration_module.populate_unified_chat_data(
            _historical_apps_at_0010(), connection.schema_editor()
        )

    def test_migrates_course_and_dm_messages_with_remapped_replies_and_reactions(self):
        with schema_context(self.schema_name):
            LegacyCourseChatMessage = _legacy_course_chat_message_model()
            LegacyCourseChatReadState = _legacy_course_chat_read_state_model()
            LegacyDirectMessageThread = _legacy_direct_message_thread_model()
            LegacyDirectMessage = _legacy_direct_message_model()
            LegacyDirectMessageReadState = _legacy_direct_message_read_state_model()

            category = Category.objects.first()
            self.assertIsNotNone(category)
            author = User.objects.filter(roles__contains=[User.UserRole.STUDENT])[0]
            other = User.objects.filter(roles__contains=[User.UserRole.STUDENT])[1]
            course = Course.objects.create(
                title=f"Migration test {uuid4()}",
                code=f"MIG-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            from app_course.models import UserCourse

            UserCourse.objects.create(
                user=author, course=course, assigned_as=UserCourse.AssignedAs.STUDENT
            )

            course_parent = LegacyCourseChatMessage.objects.create(
                course_id=course.id,
                user_id=author.id,
                content={"text": "course parent", "mentions": []},
            )
            course_reply = LegacyCourseChatMessage.objects.create(
                course_id=course.id,
                user_id=other.id,
                content={"text": "course reply", "mentions": []},
                reply_to_id=course_parent.id,
            )
            LegacyCourseChatReadState.objects.create(
                user_id=author.id,
                course_id=course.id,
                last_read_message_id=course_reply.id,
            )

            dm_thread = LegacyDirectMessageThread.objects.create(
                user_low_id=min(author.id, other.id),
                user_high_id=max(author.id, other.id),
            )
            dm_parent = LegacyDirectMessage.objects.create(
                thread_id=dm_thread.id,
                user_id=author.id,
                content={"text": "dm parent", "mentions": []},
            )
            dm_reply = LegacyDirectMessage.objects.create(
                thread_id=dm_thread.id,
                user_id=other.id,
                content={"text": "dm reply", "mentions": []},
                reply_to_id=dm_parent.id,
            )
            LegacyDirectMessageReadState.objects.create(
                user_id=other.id,
                thread_id=dm_thread.id,
                last_read_message_id=dm_reply.id,
            )

            if _reaction_table_has_legacy_columns():
                LegacyReaction = _legacy_reaction_model()
                LegacyReaction.objects.create(
                    created_by_id=other.id,
                    emoji="👍",
                    course_chat_message_id=course_parent.id,
                )
                LegacyReaction.objects.create(
                    created_by_id=author.id,
                    emoji="❤️",
                    direct_message_id=dm_parent.id,
                )

            course_id, author_id, other_id = course.id, author.id, other.id
            course_parent_id = course_parent.id

        with schema_context(self.schema_name):
            self._run_forward()

        with schema_context(self.schema_name):
            course_thread = ChatThread.objects.get(
                kind=ChatThreadKind.COURSE, course_id=course_id
            )
            dm_thread_new = ChatThread.objects.get(
                kind=ChatThreadKind.DM,
                dm_pair_key=f"{min(author_id, other_id)}:{max(author_id, other_id)}",
            )
            participant_ids = set(
                ChatThreadParticipant.objects.filter(thread=dm_thread_new).values_list(
                    "user_id", flat=True
                )
            )
            self.assertEqual(participant_ids, {author_id, other_id})

            new_course_parent = ChatMessage.objects.get(
                thread=course_thread, content__text="course parent"
            )
            new_course_reply = ChatMessage.objects.get(
                thread=course_thread, content__text="course reply"
            )
            self.assertEqual(new_course_reply.reply_to_id, new_course_parent.id)
            self.assertNotEqual(new_course_parent.id, course_parent_id)

            new_dm_parent = ChatMessage.objects.get(
                thread=dm_thread_new, content__text="dm parent"
            )
            new_dm_reply = ChatMessage.objects.get(
                thread=dm_thread_new, content__text="dm reply"
            )
            self.assertEqual(new_dm_reply.reply_to_id, new_dm_parent.id)

            self.assertNotEqual(new_course_parent.id, new_dm_parent.id)
            self.assertNotEqual(new_course_reply.id, new_dm_reply.id)

            course_read = ChatReadState.objects.get(
                thread=course_thread, user_id=author_id
            )
            self.assertEqual(course_read.last_read_message_id, new_course_reply.id)
            dm_read = ChatReadState.objects.get(thread=dm_thread_new, user_id=other_id)
            self.assertEqual(dm_read.last_read_message_id, new_dm_reply.id)

            course_reaction = ChatMessageReaction.objects.get(
                created_by=other, emoji="👍"
            )
            self.assertEqual(course_reaction.message_id, new_course_parent.id)
            dm_reaction = ChatMessageReaction.objects.get(created_by=author, emoji="❤️")
            self.assertEqual(dm_reaction.message_id, new_dm_parent.id)

    def test_course_without_chat_activity_gets_no_thread(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            course = Course.objects.create(
                title=f"No chat activity {uuid4()}",
                code=f"NOCHAT-{uuid4().hex[:8]}",
                category=category,
                program=get_default_program(),
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            course_id = course.id

        with schema_context(self.schema_name):
            self._run_forward()

        with schema_context(self.schema_name):
            self.assertFalse(
                ChatThread.objects.filter(
                    kind=ChatThreadKind.COURSE, course_id=course_id
                ).exists()
            )
