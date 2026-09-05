# Unified Chat Schema (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo note:** This repo's workspace rules forbid creating feature branches/worktrees and forbid the agent from running `git commit`/`git add` unless the user explicitly asks. Treat every "Step: Commit" below as a checkpoint description of what *would* be committed — stage/commit only if the user explicitly requests it during execution.

**Goal:** Replace the 6 chat tables (`CourseChatMessage`, `CourseChatReadState`, `DirectMessageThread`, `DirectMessage`, `DirectMessageReadState`, `ChatMessageReaction`) with 5 unified tables (`ChatThread`, `ChatThreadParticipant`, `ChatMessage`, `ChatReadState`, simplified `ChatMessageReaction`), migrating existing data safely, with **zero changes to REST/WebSocket API contracts**.

**Architecture:** Expand-contract migration. Add new tables alongside old ones (Tasks 1-4), migrate data with a full ID remap for both course and DM message history (Task 3), then swap all application code to the new models in one deploy (Tasks 5-11), verify (Task 13), then retire the old models from the ORM while renaming (not dropping) their DB tables for a rollback window (Task 12).

**Tech Stack:** Django 4.2, django-tenant-schemas (schema-per-tenant), DRF, Django Channels (WebSocket), PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-07-02-unified-chat-schema-design.md`

---

## Scope Check

This plan covers Phase 1 only (backend data model consolidation, API-compatible). Phases 2-4 (unified API surface, mobile migration, group chat feature) are separate future specs — see spec §9. This phase produces working, testable software on its own: existing course chat and DM chat continue to work end-to-end against the new schema.

## Before you start

Run tests with the project's canonical entrypoint (never bare `manage.py test`):

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_chat.tests
```

This uses local Docker Postgres (`schedjuice-test-db`, port 55432) with `--keepdb --noinput`. If it reports "PostgreSQL is not reachable", start Docker and retry.

---

### Task 1: Add unified models (additive only)

**Files:**
- Modify: `app_chat/models.py`
- Test: `app_chat/tests/test_unified_models_unit.py` (create)

The new models are added *alongside* the existing 6 — nothing is removed yet. To avoid `related_name` collisions with the still-present old models (e.g. `CourseChatMessage.user` already uses `related_name="chat_messages"`), the new models use temporary `_v2` suffixes on `User` reverse accessors. These are renamed back to the clean names in Task 12 once the old models are gone.

- [ ] **Step 1: Write the failing test**

Create `app_chat/tests/test_unified_models_unit.py`:

```python
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
            course = Category.objects  # placeholder to keep import used
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_unified_models_unit
```

Expected: FAIL / ERROR — `ImportError: cannot import name 'ChatThread' from 'app_chat.models'`.

- [ ] **Step 3: Add the new models**

In `app_chat/models.py`, add these classes **after** the existing `ChatThreadKind` class (which already exists — extend it rather than duplicating), and **before** `ChatMessageReaction`:

```python
class ChatThreadKind(models.TextChoices):
    COURSE = "course", "course"
    DM = "dm", "dm"
    GROUP = "group", "group"  # reserved for a future phase; unused for now
```

(This replaces the existing 2-choice `ChatThreadKind` at the top of the file — same class, one more member added.)

```python
class ChatThread(BaseModel):
    """Unified thread for course chat, DMs, and (future) group chat."""

    kind = models.CharField(max_length=10, choices=ChatThreadKind.choices)
    course = models.ForeignKey(
        "app_course.Course",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="chat_threads",
    )
    dm_pair_key = models.CharField(max_length=40, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["course"],
                condition=models.Q(kind=ChatThreadKind.COURSE),
                name="uniq_chat_thread_course",
            ),
            models.UniqueConstraint(
                fields=["dm_pair_key"],
                condition=models.Q(kind=ChatThreadKind.DM),
                name="uniq_chat_thread_dm_pair",
            ),
        ]
        indexes = [
            models.Index(fields=["kind"], name="app_chat_thread_kind_idx"),
        ]


class ChatThreadParticipant(BaseModel):
    """
    Explicit participants for kind=dm/group threads only.

    Course threads derive membership from UserCourse via ChatThread.course_id —
    not duplicated here, to avoid a second source of truth for course rosters.
    """

    thread = models.ForeignKey(
        ChatThread, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="chat_thread_participations",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["thread", "user"], name="uniq_chat_thread_participant"
            ),
        ]
        indexes = [
            models.Index(fields=["user", "thread"], name="app_chat_thread_participant_idx"),
        ]


class ChatMessage(BaseModel):
    """
    A chat message on a unified thread (course or DM).
    content is JSON: {"text": "...", "mentions": [...], "attachments": [...]}
    """

    thread = models.ForeignKey(
        ChatThread, on_delete=models.CASCADE, related_name="messages"
    )
    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="chat_messages_v2"
    )
    content = models.JSONField(
        help_text="Structured payload: {text, mentions, attachments}"
    )
    reply_to = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="replies",
    )
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        "app_auth.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="chat_messages_v2_deleted",
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["thread", "created_at"], name="app_chat_message_thread_idx"),
        ]


class ChatReadState(BaseModel):
    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="chat_read_states_v2"
    )
    thread = models.ForeignKey(
        ChatThread, on_delete=models.CASCADE, related_name="read_states"
    )
    last_read_message_id = models.BigIntegerField(null=True, blank=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "thread"], name="uniq_chat_read_user_thread"
            ),
        ]
        indexes = [
            models.Index(fields=["thread", "user"], name="app_chat_read_state_thread_idx"),
        ]
```

Also add a nullable `message` FK to the existing `ChatMessageReaction` class (do not remove `course_chat_message`/`direct_message` yet — that happens in Task 4):

```python
    message = models.ForeignKey(
        "app_chat.ChatMessage",
        on_delete=models.CASCADE,
        related_name="reactions_v2",
        null=True,
        blank=True,
    )
```

Add this field inside the existing `ChatMessageReaction` class body, right after the `direct_message` field.

- [ ] **Step 4: Run test to verify it passes**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_unified_models_unit
```

Expected: This will still FAIL at this point with "relation does not exist" — the model exists in Python but the migration hasn't been written yet. That's expected; proceed to Task 2 before re-running.

- [ ] **Step 5: Commit** (only if the user explicitly asks you to commit during execution)

```bash
git add app_chat/models.py app_chat/tests/test_unified_models_unit.py
git commit -m "feat(chat): add unified ChatThread/ChatThreadParticipant/ChatMessage/ChatReadState models"
```

---

### Task 2: Schema migration for the new tables

**Files:**
- Create: `app_chat/migrations/0010_add_unified_chat_models.py`

- [ ] **Step 1: Write the migration**

```python
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0059_usercourse_hourly_rate"),
        ("app_chat", "0009_remove_chatmessagereaction_uniq_chat_reaction_user_course_msg_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChatThread",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("kind", models.CharField(choices=[("course", "course"), ("dm", "dm"), ("group", "group")], max_length=10)),
                ("dm_pair_key", models.CharField(blank=True, max_length=40, null=True)),
                (
                    "course",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_threads",
                        to="app_course.course",
                    ),
                ),
            ],
            options={"abstract": False},
        ),
        migrations.AddIndex(
            model_name="chatthread",
            index=models.Index(fields=["kind"], name="app_chat_thread_kind_idx"),
        ),
        migrations.AddConstraint(
            model_name="chatthread",
            constraint=models.UniqueConstraint(
                condition=models.Q(("kind", "course")),
                fields=("course",),
                name="uniq_chat_thread_course",
            ),
        ),
        migrations.AddConstraint(
            model_name="chatthread",
            constraint=models.UniqueConstraint(
                condition=models.Q(("kind", "dm")),
                fields=("dm_pair_key",),
                name="uniq_chat_thread_dm_pair",
            ),
        ),
        migrations.CreateModel(
            name="ChatThreadParticipant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "thread",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="participants",
                        to="app_chat.chatthread",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_thread_participations",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={"abstract": False},
        ),
        migrations.AddIndex(
            model_name="chatthreadparticipant",
            index=models.Index(fields=["user", "thread"], name="app_chat_thread_participant_idx"),
        ),
        migrations.AddConstraint(
            model_name="chatthreadparticipant",
            constraint=models.UniqueConstraint(
                fields=("thread", "user"), name="uniq_chat_thread_participant"
            ),
        ),
        migrations.CreateModel(
            name="ChatMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("content", models.JSONField(help_text="Structured payload: {text, mentions, attachments}")),
                ("edited_at", models.DateTimeField(blank=True, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "thread",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="app_chat.chatthread",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_messages_v2",
                        to="app_auth.user",
                    ),
                ),
                (
                    "reply_to",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="replies",
                        to="app_chat.chatmessage",
                    ),
                ),
                (
                    "deleted_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="chat_messages_v2_deleted",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["thread", "created_at"], name="app_chat_message_thread_idx"),
        ),
        migrations.CreateModel(
            name="ChatReadState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("last_read_message_id", models.BigIntegerField(blank=True, null=True)),
                ("last_read_at", models.DateTimeField(blank=True, null=True)),
                (
                    "thread",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="read_states",
                        to="app_chat.chatthread",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_read_states_v2",
                        to="app_auth.user",
                    ),
                ),
            ],
            options={"abstract": False},
        ),
        migrations.AddIndex(
            model_name="chatreadstate",
            index=models.Index(fields=["thread", "user"], name="app_chat_read_state_thread_idx"),
        ),
        migrations.AddConstraint(
            model_name="chatreadstate",
            constraint=models.UniqueConstraint(
                fields=("user", "thread"), name="uniq_chat_read_user_thread"
            ),
        ),
        migrations.AddField(
            model_name="chatmessagereaction",
            name="message",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="reactions_v2",
                to="app_chat.chatmessage",
            ),
        ),
    ]
```

- [ ] **Step 2: Run migration + model tests**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_unified_models_unit
```

Expected: PASS (all 3 tests). This also implicitly runs the migration against the test DB via `--keepdb`.

- [ ] **Step 3: Sanity-check with makemigrations**

```bash
source env/bin/activate  # or the project's venv activation
python manage.py makemigrations app_chat --check --dry-run
```

Expected: "No changes detected" (confirms the hand-written migration matches the model state from Task 1 exactly — field order and options matter for this check).

- [ ] **Step 4: Commit**

```bash
git add app_chat/migrations/0010_add_unified_chat_models.py
git commit -m "feat(chat): create unified chat tables (schema only)"
```

---

### Task 3: Data migration — populate unified tables from legacy data

**Files:**
- Create: `app_chat/migrations/0011_populate_unified_chat_data.py`
- Test: `app_chat/tests/test_unified_chat_data_migration.py` (create)

This is the highest-risk task: it must remap `CourseChatMessage`/`DirectMessage` IDs into a single `ChatMessage` ID space, fix up self-referencing `reply_to`, backfill `ChatReadState.last_read_message_id`, and backfill `ChatMessageReaction.message_id` — all using the same in-memory ID maps in one migration function (they can't be persisted for reuse across separate migrations).

- [ ] **Step 1: Write the failing test**

Create `app_chat/tests/test_unified_chat_data_migration.py`. This test seeds legacy-shape rows directly and calls the migration's forward function directly (imported from the migration module) rather than running the full migration graph, so it's fast and isolated:

```python
"""
Data migration test: legacy course/DM chat rows -> unified ChatThread/ChatMessage/
ChatReadState/ChatMessageReaction, with ID remap and reply_to/reaction backfill.
"""

from __future__ import annotations

import importlib
import unittest
from uuid import uuid4

from django.apps import apps as global_apps
from django.core.management import call_command
from django.db import connection
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
    CourseChatMessage,
    CourseChatReadState,
    DirectMessage,
    DirectMessageReadState,
    DirectMessageThread,
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


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UnifiedChatDataMigrationTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(cls.schema_name):
            create_default_general_program()

    def _run_forward(self):
        _migration_module.populate_unified_chat_data(global_apps, connection.schema_editor())

    def test_migrates_course_and_dm_messages_with_remapped_replies_and_reactions(self):
        with schema_context(self.schema_name):
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

            UserCourse.objects.create(user=author, course=course, assigned_as=UserCourse.AssignedAs.STUDENT)

            # Legacy course chat: parent + reply, a read state, and a reaction.
            course_parent = CourseChatMessage.objects.create(
                course=course, user=author, content={"text": "course parent", "mentions": []}
            )
            course_reply = CourseChatMessage.objects.create(
                course=course, user=other, content={"text": "course reply", "mentions": []},
                reply_to=course_parent,
            )
            CourseChatReadState.objects.create(
                user=author, course=course, last_read_message_id=course_reply.id
            )
            ChatMessageReaction.objects.create(
                created_by=other, emoji="👍", course_chat_message=course_parent
            )

            # Legacy DM: thread + parent + reply, a read state, a reaction.
            dm_thread = DirectMessageThread.objects.create(
                user_low_id=min(author.id, other.id), user_high_id=max(author.id, other.id)
            )
            dm_parent = DirectMessage.objects.create(
                thread=dm_thread, user=author, content={"text": "dm parent", "mentions": []}
            )
            dm_reply = DirectMessage.objects.create(
                thread=dm_thread, user=other, content={"text": "dm reply", "mentions": []},
                reply_to=dm_parent,
            )
            DirectMessageReadState.objects.create(
                user=other, thread=dm_thread, last_read_message_id=dm_reply.id
            )
            ChatMessageReaction.objects.create(
                created_by=author, emoji="❤️", direct_message=dm_parent
            )

            course_id, author_id, other_id = course.id, author.id, other.id
            course_parent_id, course_reply_id = course_parent.id, course_reply.id
            dm_thread_id = dm_thread.id
            dm_parent_id, dm_reply_id = dm_parent.id, dm_reply.id

        with schema_context(self.schema_name):
            self._run_forward()

        with schema_context(self.schema_name):
            # Thread rows.
            course_thread = ChatThread.objects.get(kind=ChatThreadKind.COURSE, course_id=course_id)
            dm_thread_new = ChatThread.objects.get(
                kind=ChatThreadKind.DM,
                dm_pair_key=f"{min(author_id, other_id)}:{max(author_id, other_id)}",
            )
            participant_ids = set(
                ChatThreadParticipant.objects.filter(thread=dm_thread_new).values_list("user_id", flat=True)
            )
            self.assertEqual(participant_ids, {author_id, other_id})

            # Messages: content + reply_to preserved across the ID remap.
            new_course_parent = ChatMessage.objects.get(thread=course_thread, content__text="course parent")
            new_course_reply = ChatMessage.objects.get(thread=course_thread, content__text="course reply")
            self.assertEqual(new_course_reply.reply_to_id, new_course_parent.id)
            self.assertNotEqual(new_course_parent.id, course_parent_id)

            new_dm_parent = ChatMessage.objects.get(thread=dm_thread_new, content__text="dm parent")
            new_dm_reply = ChatMessage.objects.get(thread=dm_thread_new, content__text="dm reply")
            self.assertEqual(new_dm_reply.reply_to_id, new_dm_parent.id)

            # No ID collisions between the two remapped message sets.
            self.assertNotEqual(new_course_parent.id, new_dm_parent.id)
            self.assertNotEqual(new_course_reply.id, new_dm_reply.id)

            # Read states remapped to the new message ids.
            course_read = ChatReadState.objects.get(thread=course_thread, user_id=author_id)
            self.assertEqual(course_read.last_read_message_id, new_course_reply.id)
            dm_read = ChatReadState.objects.get(thread=dm_thread_new, user_id=other_id)
            self.assertEqual(dm_read.last_read_message_id, new_dm_reply.id)

            # Reactions backfilled onto the new unified message FK.
            course_reaction = ChatMessageReaction.objects.get(course_chat_message_id=course_parent_id)
            self.assertEqual(course_reaction.message_id, new_course_parent.id)
            dm_reaction = ChatMessageReaction.objects.get(direct_message_id=dm_parent_id)
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
                ChatThread.objects.filter(kind=ChatThreadKind.COURSE, course_id=course_id).exists()
            )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_unified_chat_data_migration
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app_chat.migrations.0011_populate_unified_chat_data'`.

- [ ] **Step 3: Write the data migration**

```python
"""Populate unified ChatThread/ChatMessage/ChatReadState/ChatMessageReaction from legacy tables."""

from django.db import migrations


def populate_unified_chat_data(apps, schema_editor):
    ChatThread = apps.get_model("app_chat", "ChatThread")
    ChatThreadParticipant = apps.get_model("app_chat", "ChatThreadParticipant")
    ChatMessage = apps.get_model("app_chat", "ChatMessage")
    ChatReadState = apps.get_model("app_chat", "ChatReadState")
    ChatMessageReaction = apps.get_model("app_chat", "ChatMessageReaction")
    CourseChatMessage = apps.get_model("app_chat", "CourseChatMessage")
    CourseChatReadState = apps.get_model("app_chat", "CourseChatReadState")
    DirectMessageThread = apps.get_model("app_chat", "DirectMessageThread")
    DirectMessage = apps.get_model("app_chat", "DirectMessage")
    DirectMessageReadState = apps.get_model("app_chat", "DirectMessageReadState")

    COURSE = "course"
    DM = "dm"

    # --- 1. Threads ---------------------------------------------------
    course_ids_with_activity = set(
        CourseChatMessage.objects.values_list("course_id", flat=True).distinct()
    ) | set(
        CourseChatReadState.objects.values_list("course_id", flat=True).distinct()
    )
    course_thread_id_by_course_id: dict[int, int] = {}
    for course_id in course_ids_with_activity:
        thread = ChatThread.objects.create(kind=COURSE, course_id=course_id)
        course_thread_id_by_course_id[course_id] = thread.id

    dm_thread_id_by_old_thread_id: dict[int, int] = {}
    for old_thread in DirectMessageThread.objects.all():
        lo, hi = sorted((old_thread.user_low_id, old_thread.user_high_id))
        new_thread = ChatThread.objects.create(kind=DM, dm_pair_key=f"{lo}:{hi}")
        dm_thread_id_by_old_thread_id[old_thread.id] = new_thread.id
        ChatThreadParticipant.objects.bulk_create(
            [
                ChatThreadParticipant(thread_id=new_thread.id, user_id=lo),
                ChatThreadParticipant(thread_id=new_thread.id, user_id=hi),
            ]
        )

    # --- 2. Messages (pass 1: create rows, reply_to deferred) ----------
    course_message_id_map: dict[int, int] = {}
    for old in CourseChatMessage.objects.all().order_by("id"):
        new = ChatMessage.objects.create(
            thread_id=course_thread_id_by_course_id[old.course_id],
            user_id=old.user_id,
            content=old.content,
            edited_at=old.edited_at,
            deleted_at=old.deleted_at,
            deleted_by_id=old.deleted_by_id,
        )
        ChatMessage.objects.filter(pk=new.pk).update(created_at=old.created_at, updated_at=old.updated_at)
        course_message_id_map[old.id] = new.id

    dm_message_id_map: dict[int, int] = {}
    for old in DirectMessage.objects.all().order_by("id"):
        new = ChatMessage.objects.create(
            thread_id=dm_thread_id_by_old_thread_id[old.thread_id],
            user_id=old.user_id,
            content=old.content,
            edited_at=old.edited_at,
            deleted_at=old.deleted_at,
            deleted_by_id=old.deleted_by_id,
        )
        ChatMessage.objects.filter(pk=new.pk).update(created_at=old.created_at, updated_at=old.updated_at)
        dm_message_id_map[old.id] = new.id

    # --- 3. Messages (pass 2: backfill reply_to) -----------------------
    for old in CourseChatMessage.objects.filter(reply_to__isnull=False):
        new_parent_id = course_message_id_map.get(old.reply_to_id)
        if new_parent_id is not None:
            ChatMessage.objects.filter(pk=course_message_id_map[old.id]).update(reply_to_id=new_parent_id)

    for old in DirectMessage.objects.filter(reply_to__isnull=False):
        new_parent_id = dm_message_id_map.get(old.reply_to_id)
        if new_parent_id is not None:
            ChatMessage.objects.filter(pk=dm_message_id_map[old.id]).update(reply_to_id=new_parent_id)

    # --- 4. Read states --------------------------------------------------
    for old in CourseChatReadState.objects.all():
        thread_id = course_thread_id_by_course_id.get(old.course_id)
        if thread_id is None:
            continue
        remapped_message_id = course_message_id_map.get(old.last_read_message_id)
        ChatReadState.objects.create(
            user_id=old.user_id,
            thread_id=thread_id,
            last_read_message_id=remapped_message_id,
        )

    for old in DirectMessageReadState.objects.all():
        thread_id = dm_thread_id_by_old_thread_id.get(old.thread_id)
        if thread_id is None:
            continue
        remapped_message_id = (
            dm_message_id_map.get(old.last_read_message_id)
            if old.last_read_message_id is not None
            else None
        )
        ChatReadState.objects.create(
            user_id=old.user_id,
            thread_id=thread_id,
            last_read_message_id=remapped_message_id,
            last_read_at=old.last_read_at,
        )

    # --- 5. Reactions: backfill the new `message` FK --------------------
    for reaction in ChatMessageReaction.objects.filter(course_chat_message__isnull=False):
        new_message_id = course_message_id_map.get(reaction.course_chat_message_id)
        if new_message_id is not None:
            ChatMessageReaction.objects.filter(pk=reaction.pk).update(message_id=new_message_id)

    for reaction in ChatMessageReaction.objects.filter(direct_message__isnull=False):
        new_message_id = dm_message_id_map.get(reaction.direct_message_id)
        if new_message_id is not None:
            ChatMessageReaction.objects.filter(pk=reaction.pk).update(message_id=new_message_id)


def reverse_noop(apps, schema_editor):
    """
    Not reversible: this migration remaps IDs from two independent legacy tables
    into one. Roll back by restoring from a pre-migration backup instead.
    """
    raise migrations.RunPython.DoesNotSupportReverse()


class Migration(migrations.Migration):
    dependencies = [
        ("app_chat", "0010_add_unified_chat_models"),
    ]

    operations = [
        migrations.RunPython(populate_unified_chat_data, reverse_noop),
    ]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_unified_chat_data_migration
```

Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add app_chat/migrations/0011_populate_unified_chat_data.py app_chat/tests/test_unified_chat_data_migration.py
git commit -m "feat(chat): data-migrate legacy course/DM chat rows into unified tables"
```

---

### Task 4: Finalize `ChatMessageReaction` (drop legacy FKs, require `message`)

**Files:**
- Modify: `app_chat/models.py`
- Create: `app_chat/migrations/0012_finalize_chat_message_reaction.py`

- [ ] **Step 1: Update the model**

Replace the entire `ChatMessageReaction` class in `app_chat/models.py` with:

```python
class ChatMessageReaction(BaseModel):
    """One reaction slot per user per chat message."""

    emoji = models.CharField(max_length=10)
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="chat_message_reactions",
    )
    message = models.ForeignKey(
        "app_chat.ChatMessage",
        on_delete=models.CASCADE,
        related_name="reactions",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["created_by", "message"],
                name="uniq_chat_reaction_user_message",
            ),
        ]
        indexes = [
            models.Index(fields=["message"], name="app_chat_reaction_message_idx"),
        ]
```

This removes `course_chat_message`, `direct_message`, the old `clean()`/`save()` XOR-validation methods (no longer needed — `message` is a required FK), and the old conditional constraints/indexes.

- [ ] **Step 2: Write the migration**

```python
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_chat", "0011_populate_unified_chat_data"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="chatmessagereaction",
            name="uniq_chat_reaction_user_course_msg",
        ),
        migrations.RemoveConstraint(
            model_name="chatmessagereaction",
            name="uniq_chat_reaction_user_dm_msg",
        ),
        migrations.RemoveIndex(
            model_name="chatmessagereaction",
            name="app_chat_ch_course__39f694_idx",
        ),
        migrations.RemoveIndex(
            model_name="chatmessagereaction",
            name="app_chat_ch_direct__2de3dc_idx",
        ),
        migrations.RemoveField(
            model_name="chatmessagereaction",
            name="course_chat_message",
        ),
        migrations.RemoveField(
            model_name="chatmessagereaction",
            name="direct_message",
        ),
        migrations.AlterField(
            model_name="chatmessagereaction",
            name="message",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="reactions",
                to="app_chat.chatmessage",
            ),
        ),
        migrations.AddIndex(
            model_name="chatmessagereaction",
            index=models.Index(fields=["message"], name="app_chat_reaction_message_idx"),
        ),
        migrations.AddConstraint(
            model_name="chatmessagereaction",
            constraint=models.UniqueConstraint(
                fields=("created_by", "message"), name="uniq_chat_reaction_user_message"
            ),
        ),
    ]
```

> **Do not run this migration until Task 3's data migration has been applied and verified** (it drops the columns Task 3 read from). In the normal `./scripts/run_backend_tests.sh` flow migrations apply in order automatically, so this is only a concern for manual/production rollout — call it out in the deploy runbook (Task 13).

- [ ] **Step 3: Run full migration + existing reaction tests**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_unified_chat_data_migration
python manage.py makemigrations app_chat --check --dry-run
```

Expected: data migration test still PASSes; "No changes detected" confirms the model matches migration state.

Note: `app_chat/tests/test_reactions.py` and `app_chat/tests/test_reaction_helpers_unit.py` will fail after this task because they still reference `course_chat_message`/`direct_message` kwargs — that's expected and fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add app_chat/models.py app_chat/migrations/0012_finalize_chat_message_reaction.py
git commit -m "feat(chat): finalize ChatMessageReaction on unified message FK"
```

---

### Task 5: Rewrite `app_chat/services.py` for unified threads

**Files:**
- Modify: `app_chat/services.py` (full rewrite)
- Modify: `app_chat/tests/test_course_chat_permissions.py` (update `test_dm_get_or_create_returns_single_thread_for_pair`)
- Modify: `app_chat/tests/test_dm_permissions.py` (update imports/assertions touching `DirectMessageThread`)

Function names and signatures are preserved wherever existing call sites (views, consumers, tests) depend on them, to minimize churn — only their internals move from `DirectMessageThread`/`DirectMessage` to `ChatThread`/`ChatThreadParticipant`/`ChatMessage`. New: `get_or_create_course_chat_thread` (course chat's lazy thread creation, mirroring the DM pattern) and `normalize_dm_pair_key` (replaces `normalize_dm_user_pair`, which returned a tuple keyed to `user_low`/`user_high` fields that no longer exist).

- [ ] **Step 1: Replace `app_chat/services.py`**

```python
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from app_attachment.models import Attachment
from app_auth.models import User
from app_chat.contracts import (
    MAX_CHAT_ATTACHMENT_SIZE_BYTES,
    normalize_extension,
)
from app_chat.models import ChatMessage, ChatReadState, ChatThread, ChatThreadKind, ChatThreadParticipant
from app_course.models import UserCourse


def is_course_member(user: User, course_id: int) -> bool:
    return UserCourse.objects.filter(
        course_id=course_id, user=user
    ).exists()


def is_course_teacher(user: User, course_id: int) -> bool:
    return UserCourse.objects.filter(
        course_id=course_id,
        user=user,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).exists()


def can_moderate_chat(user: User, course_id: int) -> bool:
    return bool(user.is_admin() or is_course_teacher(user, course_id))


def can_send_course_chat_message(user: User, course_id: int) -> bool:
    return is_course_member(user, course_id)


def can_edit_course_chat_message(user: User, message_user_id: int, is_deleted: bool) -> bool:
    return bool(user.id == message_user_id and not is_deleted)


def can_delete_course_chat_message(
    user: User, course_id: int, message_user_id: int, is_deleted: bool
) -> bool:
    if is_deleted:
        return True
    if user.id == message_user_id:
        return True
    return can_moderate_chat(user, course_id)


def author_is_student_in_course(author: User, course_id: int) -> bool:
    return UserCourse.objects.filter(
        course_id=course_id,
        user=author,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists()


def non_dropped_member_count(course_id: int) -> int:
    return UserCourse.objects.filter(course_id=course_id).count()


def staff_read_receipt_user_ids(course_id: int) -> list[int]:
    """Teachers in course + admins who are also course members (non-dropped)."""
    teacher_ids = UserCourse.objects.filter(
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).values_list("user_id", flat=True)
    ids = set(teacher_ids)
    admin_member_ids = UserCourse.objects.filter(
        course_id=course_id
    ).values_list("user_id", flat=True)
    for uid in admin_member_ids:
        u = User.objects.filter(pk=uid).first()
        if u and u.is_admin():
            ids.add(uid)
    return list(ids)


def mention_user_ids_from_content_mentions(mentions) -> list[int]:
    """Normalize mention payloads (dicts with user_id or bare ints) to a list of ids."""
    if not mentions:
        return []
    out: list[int] = []
    for item in mentions:
        if isinstance(item, dict):
            uid = item.get("user_id")
            if uid is not None:
                out.append(int(uid))
        elif isinstance(item, int):
            out.append(item)
    return out


def validate_mention_user_ids(course_id: int, user_ids: list[int]) -> None:
    allowed = set(
        UserCourse.objects.filter(
            course_id=course_id
        ).values_list("user_id", flat=True)
    )
    bad = [uid for uid in user_ids if uid not in allowed]
    if bad:
        raise ValidationError({"mentions": f"Invalid user ids for this course: {bad}"})


def normalize_dm_pair_key(user_a_id: int, user_b_id: int) -> str:
    if user_a_id == user_b_id:
        raise ValidationError({"participant_user_id": "Cannot create DM with yourself."})
    lo, hi = sorted((int(user_a_id), int(user_b_id)))
    return f"{lo}:{hi}"


def can_create_dm_thread(requester: User, participant: User) -> bool:
    """Tenant DM policy: block pure-student <-> pure-student threads."""
    if requester.id == participant.id:
        return False
    if requester.is_student() and participant.is_student():
        return False
    return True


def dm_participants(thread: ChatThread) -> list[User]:
    """The two (or more, for a future group kind) users on a thread."""
    return [p.user for p in ChatThreadParticipant.objects.filter(thread=thread).select_related("user")]


def dm_thread_pair_policy_allows(thread: ChatThread) -> bool:
    """True if messaging is allowed for this thread's user pair (both directions)."""
    users = dm_participants(thread)
    if len(users) != 2:
        return False
    return can_create_dm_thread(users[0], users[1])


def get_or_create_course_chat_thread(course_id: int) -> ChatThread:
    thread, _created = ChatThread.objects.get_or_create(
        kind=ChatThreadKind.COURSE, course_id=course_id
    )
    return thread


def get_or_create_dm_thread(user: User, participant_user_id: int):
    participant = User.objects.filter(pk=participant_user_id).first()
    if participant is None:
        raise ValidationError({"participant_user_id": "User not found."})
    if not can_create_dm_thread(user, participant):
        raise ValidationError(
            {
                "participant_user_id": "Direct messages are not allowed with this user.",
            }
        )
    pair_key = normalize_dm_pair_key(user.id, participant_user_id)
    thread, created = ChatThread.objects.get_or_create(
        kind=ChatThreadKind.DM, dm_pair_key=pair_key
    )
    if created:
        ChatThreadParticipant.objects.bulk_create(
            [
                ChatThreadParticipant(thread=thread, user_id=user.id),
                ChatThreadParticipant(thread=thread, user_id=participant_user_id),
            ]
        )
    return thread, created


def user_is_dm_participant(user: User, thread: ChatThread) -> bool:
    return ChatThreadParticipant.objects.filter(thread=thread, user=user).exists()


def bulk_dm_unread_counts(thread_ids: list[int], reader_user_id: int) -> dict[int, int]:
    """Unread count per thread: messages from others after reader's last_read_message_id."""
    if not thread_ids:
        return {}
    states = {
        s.thread_id: s.last_read_message_id or 0
        for s in ChatReadState.objects.filter(
            thread_id__in=thread_ids, user_id=reader_user_id
        )
    }
    counts = dict.fromkeys(thread_ids, 0)
    rows = ChatMessage.objects.filter(thread_id__in=thread_ids).exclude(
        user_id=reader_user_id
    ).values_list("thread_id", "id")
    for tid, mid in rows:
        cursor = states.get(tid, 0)
        if mid > cursor:
            counts[tid] += 1
    return counts


def validate_chat_content_payload(content: Any) -> dict[str, Any]:
    if not isinstance(content, dict):
        raise ValidationError({"content": "content must be an object"})
    text = content.get("text")
    attachments = content.get("attachments", [])
    mentions = content.get("mentions", [])
    if text is None:
        text = ""
    if not isinstance(text, str):
        raise ValidationError({"text": "content.text must be a string"})
    if not isinstance(attachments, list):
        raise ValidationError({"attachments": "content.attachments must be a list"})
    if not isinstance(mentions, list):
        raise ValidationError({"mentions": "content.mentions must be a list"})
    if not text.strip() and len(attachments) == 0:
        raise ValidationError(
            {"content": "A message must include text or at least one attachment."}
        )
    return {
        "text": text,
        "attachments": attachments,
        "mentions": mentions,
    }


def validate_chat_attachment_refs(user: User, attachments: list[dict[str, Any]]) -> None:
    if not attachments:
        return
    attachment_ids = []
    for item in attachments:
        if not isinstance(item, dict):
            raise ValidationError({"attachments": "Each attachment must be an object."})
        attachment_id = item.get("attachment_id")
        if attachment_id is None:
            raise ValidationError({"attachments": "attachment_id is required."})
        attachment_ids.append(int(attachment_id))

    rows = {
        a.id: a
        for a in Attachment.objects.filter(
            id__in=attachment_ids,
            is_deleted=False,
        )
    }
    missing = [aid for aid in attachment_ids if aid not in rows]
    if missing:
        raise ValidationError({"attachments": f"Invalid attachment ids: {missing}"})

    for aid in attachment_ids:
        row = rows[aid]
        if row.size and row.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES:
            raise ValidationError(
                {"attachments": f"Attachment {aid} exceeds 15 MB size limit."}
            )
        ext = normalize_extension(row.filename or "")
        if not ext:
            raise ValidationError({"attachments": f"Attachment {aid} has no extension."})


def mark_dm_read_state(state, message_id: int | None):
    state.last_read_message_id = message_id
    state.last_read_at = timezone.now()
    state.save(update_fields=["last_read_message_id", "last_read_at", "updated_at"])


def create_dm_message(
    thread_id: int,
    user: User,
    content: Any,
    reply_to_id=None,
) -> tuple[ChatMessage | None, str | None]:
    """
    Create a DM row after membership, policy, content, and optional reply validation.
    Returns (message, error_code).
    """
    from app_chat.notifications import queue_dm_message_pushes

    thread = ChatThread.objects.filter(pk=thread_id, kind=ChatThreadKind.DM).first()
    if thread is None:
        return None, "thread_not_found"
    if not user_is_dm_participant(user, thread):
        return None, "forbidden"
    if not dm_thread_pair_policy_allows(thread):
        return None, "dm_policy_blocked"

    reply_to = None
    if reply_to_id is not None:
        try:
            rid = int(reply_to_id)
        except (TypeError, ValueError):
            return None, "reply_to_invalid"
        parent = ChatMessage.objects.filter(pk=rid, thread_id=thread_id).first()
        if parent is None:
            return None, "reply_not_found"
        reply_to = parent

    try:
        normalized = validate_chat_content_payload(content)
        validate_chat_attachment_refs(user, normalized.get("attachments", []))
    except ValidationError:
        return None, "content_invalid"

    row = ChatMessage.objects.create(
        thread=thread, user=user, content=normalized, reply_to=reply_to
    )
    row = ChatMessage.objects.select_related(
        "thread", "user", "reply_to", "reply_to__user"
    ).get(pk=row.pk)
    queue_dm_message_pushes(row)
    return row, None


def start_dm_conversation(
    user: User,
    participant_user_id: int,
    content: Any,
    reply_to_id=None,
) -> tuple[ChatThread, ChatMessage, bool]:
    """
    Atomically get-or-create a DM thread and post the first message.
    If message creation fails and the thread was newly created, delete the thread.
    """
    _DM_MESSAGE_ERRORS: dict[str, ValidationError] = {
        "forbidden": ValidationError({"details": "Forbidden"}),
        "dm_policy_blocked": ValidationError(
            {
                "participant_user_id": (
                    "Direct messages are not allowed with this user."
                ),
            }
        ),
        "content_invalid": ValidationError(
            {"content": "A message must include text or at least one attachment."}
        ),
        "reply_to_invalid": ValidationError({"reply_to_id": "Invalid reply target."}),
        "reply_not_found": ValidationError({"reply_to_id": "Reply target not found."}),
    }

    with transaction.atomic():
        thread, created = get_or_create_dm_thread(user, participant_user_id)
        row, err = create_dm_message(
            thread.id, user, content, reply_to_id=reply_to_id
        )
        if err:
            if created:
                thread.delete()
            raise _DM_MESSAGE_ERRORS.get(
                err, ValidationError({"details": err})
            )
        return thread, row, created
```

- [ ] **Step 2: Update `test_course_chat_permissions.py`**

Replace the import block:

```python
from app_chat.models import CourseChatMessage
from app_chat.services import (
    can_moderate_chat,
    get_or_create_dm_thread,
    non_dropped_member_count,
    normalize_dm_user_pair,
    validate_chat_content_payload,
    validate_mention_user_ids,
)
```

with:

```python
from app_chat.models import ChatMessage
from app_chat.services import (
    can_moderate_chat,
    get_or_create_dm_thread,
    non_dropped_member_count,
    normalize_dm_pair_key,
    validate_chat_content_payload,
    validate_mention_user_ids,
)
```

Replace every `CourseChatMessage.objects.create(course=course, ...)` in this file with `ChatMessage.objects.create(thread=get_or_create_course_chat_thread(course.id), ...)` — concretely, add this import too:

```python
from app_chat.services import get_or_create_course_chat_thread
```

and in `test_patch_message_forbidden_when_not_author`, replace:

```python
            msg = CourseChatMessage.objects.create(
                course=course,
                user=author,
                content={"text": "original", "mentions": []},
            )
```

with:

```python
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "original", "mentions": []},
            )
```

Replace `test_dm_get_or_create_returns_single_thread_for_pair`:

```python
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
```

- [ ] **Step 3: Update `test_dm_permissions.py`**

Replace `from app_chat.models import DirectMessageThread` with `from app_chat.models import ChatThread` and rename any local references from `DirectMessageThread` to `ChatThread` in that file (used only for type-check-style assertions per the earlier read — search the file for the remaining ~150 lines not shown and rename any `DirectMessageThread.objects` calls to `ChatThread.objects.filter(kind="dm", ...)` accordingly).

- [ ] **Step 4: Run tests**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_course_chat_permissions
./scripts/run_backend_tests.sh app_chat.tests.test_dm_permissions
```

Expected: PASS. (`test_reactions.py`, `test_dm_replies.py`, `test_message_cursor_pagination.py` are still red at this point — they're fixed in Tasks 6 and 9.)

- [ ] **Step 5: Commit**

```bash
git add app_chat/services.py app_chat/tests/test_course_chat_permissions.py app_chat/tests/test_dm_permissions.py
git commit -m "feat(chat): rewrite services.py on unified ChatThread/ChatMessage"
```

---

### Task 6: Rewrite reaction helpers for the unified `message` FK

**Files:**
- Modify: `app_chat/reaction_helpers.py` (full rewrite)
- Modify: `app_chat/reaction_toggle_helpers.py` (no functional change needed — verify only)
- Modify: `app_chat/tests/test_reactions.py`

- [ ] **Step 1: Replace `app_chat/reaction_helpers.py`**

```python
"""Chat message reactions — canonical aggregation and toggle logic."""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from app_auth.models import User
from app_chat.models import ChatMessage, ChatMessageReaction

CHAT_REACTION_EMOJIS: tuple[str, ...] = ("👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀")


def validate_reaction_emoji(emoji: str) -> str:
    if not isinstance(emoji, str) or not emoji.strip():
        raise ValidationError("emoji is required")
    emoji = emoji.strip()
    if emoji not in CHAT_REACTION_EMOJIS:
        raise ValidationError("emoji not allowed")
    return emoji


def _aggregate_reaction_rows(
    rows: list[ChatMessageReaction],
    current_user_id: int | None,
) -> list[dict[str, Any]]:
    by_emoji: dict[str, list[int]] = {}
    for row in rows:
        by_emoji.setdefault(row.emoji, []).append(row.created_by_id)
    result: list[dict[str, Any]] = []
    for emoji in CHAT_REACTION_EMOJIS:
        user_ids = by_emoji.get(emoji)
        if not user_ids:
            continue
        result.append(
            {
                "emoji": emoji,
                "count": len(user_ids),
                "user_ids": user_ids,
                "reacted_by_me": current_user_id is not None
                and current_user_id in user_ids,
            }
        )
    return result


def aggregate_reactions(
    reaction_rows: list[ChatMessageReaction],
    current_user_id: int | None,
) -> list[dict[str, Any]]:
    """Aggregate from explicit reaction rows (tests / ad-hoc)."""
    return _aggregate_reaction_rows(list(reaction_rows), current_user_id)


def aggregate_reactions_for_message(
    message: ChatMessage,
    current_user_id: int | None,
) -> list[dict[str, Any]]:
    """Build aggregated reaction list from prefetched ``message.reactions``."""
    rows = getattr(message, "_prefetched_objects_cache", {}).get("reactions")
    if rows is None:
        rows = list(message.reactions.all())
    return _aggregate_reaction_rows(list(rows), current_user_id)


@transaction.atomic
def toggle_chat_reaction(
    user: User,
    *,
    emoji: str,
    message: ChatMessage,
) -> list[dict[str, Any]]:
    """
    Toggle reaction for the current user on a message.
    One reaction per user per message; same emoji removes, different emoji replaces.
    """
    emoji = validate_reaction_emoji(emoji)

    if message.deleted_at is not None:
        raise ValidationError("Cannot react to a deleted message")

    existing = ChatMessageReaction.objects.filter(created_by=user, message=message).first()
    if existing is not None:
        if existing.emoji == emoji:
            existing.delete()
        else:
            existing.emoji = emoji
            existing.save(update_fields=["emoji", "updated_at"])
    else:
        ChatMessageReaction.objects.create(created_by=user, emoji=emoji, message=message)

    refreshed = (
        ChatMessage.objects.filter(pk=message.pk).prefetch_related("reactions").first()
    )
    assert refreshed is not None
    return aggregate_reactions_for_message(refreshed, user.id)
```

Note the public `toggle_chat_reaction` signature changed from `course_message=None, dm_message=None` to a single required `message=`. This is an internal helper (not exposed over HTTP directly), so update its two call sites in `app_chat/views.py` in Task 9.

- [ ] **Step 2: Verify `reaction_toggle_helpers.py` needs no changes**

Re-read `app_chat/reaction_toggle_helpers.py` — it calls `toggle_chat_reaction(user, emoji=emoji.strip(), **toggle_kwargs)` where `toggle_kwargs` is passed in by the caller (views.py). No change needed in this file itself; the caller in Task 9 will now pass `{"message": message}` instead of `{"course_message": message}` / `{"dm_message": message}`.

- [ ] **Step 3: Update `app_chat/tests/test_reactions.py`**

Replace the import block:

```python
from app_chat.models import ChatMessageReaction, CourseChatMessage, DirectMessage
from app_chat.reaction_helpers import (
    CHAT_REACTION_EMOJIS,
    aggregate_reactions,
    toggle_chat_reaction,
)
from app_chat.services import get_or_create_dm_thread
```

with:

```python
from app_chat.models import ChatMessage, ChatMessageReaction
from app_chat.reaction_helpers import (
    CHAT_REACTION_EMOJIS,
    aggregate_reactions,
    toggle_chat_reaction,
)
from app_chat.services import get_or_create_course_chat_thread, get_or_create_dm_thread
```

Update every `CourseChatMessage.objects.create(course=course, ...)` to:

```python
ChatMessage.objects.create(thread=get_or_create_course_chat_thread(course.id), ...)
```

Update `DirectMessage.objects.create(thread=thread, ...)` to `ChatMessage.objects.create(thread=thread, ...)` (the DM `thread` returned by `get_or_create_dm_thread` is already a `ChatThread`, so this call site is unchanged apart from the model class name).

Update every `toggle_chat_reaction(author, course_message=msg, emoji=...)` call to `toggle_chat_reaction(author, message=msg, emoji=...)`, and every `toggle_chat_reaction(..., dm_message=dm, emoji=...)` to `toggle_chat_reaction(..., message=dm, emoji=...)`.

Update `test_reject_invalid_emoji_and_deleted_message`'s second assertion — no change needed, still calls with a `message=` kwarg after the rename above.

Update `test_aggregate_reacted_by_me`:

```python
            rows = list(ChatMessageReaction.objects.filter(course_chat_message=msg))
```

becomes:

```python
            rows = list(ChatMessageReaction.objects.filter(message=msg))
```

- [ ] **Step 4: Run tests**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_reactions
./scripts/run_backend_tests.sh app_chat.tests.test_reaction_helpers_unit
```

Expected: `test_reaction_helpers_unit.py` PASSes unchanged (it's a `SimpleTestCase` using a fake `_ReactionRow`, not real models — no change needed there). `test_reactions.py` still has 2 failing tests (`test_course_toggle_broadcasts`, `test_dm_toggle_broadcasts`) because they go through `views.py`, which isn't updated until Task 9 — that's expected; re-run this file again after Task 9.

- [ ] **Step 5: Commit**

```bash
git add app_chat/reaction_helpers.py app_chat/tests/test_reactions.py
git commit -m "feat(chat): unify reaction toggle/aggregation on ChatMessage"
```

---

### Task 7: Rewrite `message_broadcast.py` and `realtime.py`

**Files:**
- Modify: `app_chat/message_broadcast.py`
- Modify: `app_chat/realtime.py`

The WS payload builder and channel-layer group-naming stay conceptually the same; they just build off `ChatMessage`/`ChatThread` instead of `DirectMessage`/course-id-only. Room group names are **unchanged** (`course_chat_{schema}_{course_id}`, `dm_chat_{schema}_{thread_id}`) to keep the WebSocket contract stable — course rooms still key off `course_id` (available via `message.thread.course_id`), DM rooms still key off the thread's own `id`.

- [ ] **Step 1: `app_chat/message_broadcast.py`** — no changes needed. Re-read it: it operates on any `_ChatMessageLike` (`user_id`, `user`) and a `serializer_class` passed by the caller — already fully generic. Confirm by running:

```bash
grep -n "CourseChatMessage\|DirectMessage" app_chat/message_broadcast.py
```

Expected: no matches. Skip to Task 7 Step 2.

- [ ] **Step 2: Replace `app_chat/realtime.py`**

```python
"""Channel layer helpers for course chat (HTTP + WS)."""

from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from tenant_schemas.utils import schema_context

from app_chat.models import ChatMessage
from app_chat.message_broadcast import build_message_broadcast_payload
from app_chat.serializers import DirectMessageSerializer

logger = logging.getLogger(__name__)


def room_group_name(tenant_schema: str, course_id: int) -> str:
    return f"course_chat_{tenant_schema}_{course_id}"


def dm_room_group_name(tenant_schema: str, thread_id: int) -> str:
    return f"dm_chat_{tenant_schema}_{thread_id}"


def build_dm_message_broadcast_payload(
    message: ChatMessage, client_message_id: str | None = None
) -> dict[str, Any]:
    """WS-shaped payload for a DM row (matches ``DirectMessageConsumer`` broadcasts)."""
    return build_message_broadcast_payload(
        message,
        serializer_class=DirectMessageSerializer,
        client_message_id=client_message_id,
        include_thread_id=True,
    )


def broadcast_dm_chat_message(tenant_schema: str, thread_id: int, payload: dict[str, Any]) -> None:
    """Notify DM thread room with the same envelope as websocket ``chat.message``."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            dm_room_group_name(tenant_schema, thread_id),
            {"type": "chat.message", "message": payload},
        )
    except Exception:
        logger.exception(
            "broadcast_dm_chat_message failed tenant=%s thread=%s",
            tenant_schema,
            thread_id,
        )


def broadcast_dm_message_from_db(
    tenant_schema: str, message_id: int, client_message_id: str | None = None
) -> None:
    """Load DM row in tenant schema and broadcast to subscribers."""
    with schema_context(tenant_schema):
        message = ChatMessage.objects.select_related(
            "thread", "user", "reply_to", "reply_to__user"
        ).prefetch_related("reactions", "reactions__created_by").get(pk=message_id)
        payload = build_dm_message_broadcast_payload(message, client_message_id)
    broadcast_dm_chat_message(tenant_schema, message.thread_id, payload)


def broadcast_to_dm_chat(tenant_schema: str, thread_id: int, payload: dict[str, Any]) -> None:
    """Notify DM thread room with ``chat.event`` (side-channel events)."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            dm_room_group_name(tenant_schema, thread_id),
            {"type": "chat.event", "payload": payload},
        )
    except Exception:
        logger.exception(
            "broadcast_to_dm_chat failed tenant=%s thread=%s event=%s",
            tenant_schema,
            thread_id,
            payload.get("event"),
        )


def broadcast_to_course_chat(tenant_schema: str, course_id: int, payload: dict[str, Any]) -> None:
    """Notify course room with ``chat.event`` (discriminated ``event`` in payload)."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            room_group_name(tenant_schema, course_id),
            {"type": "chat.event", "payload": payload},
        )
    except Exception:
        logger.exception(
            "broadcast_to_course_chat failed tenant=%s course=%s event=%s",
            tenant_schema,
            course_id,
            payload.get("event"),
        )
```

(Only the `DirectMessage` -> `ChatMessage` import and the `select_related("thread", ...)` addition in `broadcast_dm_message_from_db` changed — everything else is identical to the current file.)

- [ ] **Step 3: Run affected tests**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_reactions
```

Expected: still 2 known-red tests from Task 6 (fixed in Task 9) — no new failures.

- [ ] **Step 4: Commit**

```bash
git add app_chat/realtime.py
git commit -m "feat(chat): point realtime broadcast helpers at ChatMessage"
```

---

### Task 8: Rewrite `app_chat/serializers.py`

**Files:**
- Modify: `app_chat/serializers.py` (full rewrite)

API payload shapes are preserved exactly: course chat message rows still expose `course` (an id), DM message rows still expose `thread` (an id); course chat read-state rows still expose `course`, DM read-state rows still expose `thread`; the DM thread list still exposes `user_low`/`user_high` (unused by the mobile client today, confirmed via repo-wide search, but kept for strict payload-shape compatibility).

- [ ] **Step 1: Replace `app_chat/serializers.py`**

```python
from rest_framework import serializers

from utilitas.serializers import BaseModelSerializer

from app_auth.models import User
from app_chat.models import ChatMessage, ChatReadState, ChatThread
from app_chat.reaction_helpers import aggregate_reactions_for_message


def _content_with_attachment_urls(content, attachment_rows_by_id=None):
    if not isinstance(content, dict):
        return content
    attachments = content.get("attachments")
    if not isinstance(attachments, list) or not attachments:
        return content

    attachment_ids = []
    for item in attachments:
        if isinstance(item, dict) and item.get("attachment_id") is not None:
            try:
                attachment_id = int(item["attachment_id"])
            except (TypeError, ValueError):
                continue
            attachment_ids.append(attachment_id)
    if not attachment_ids:
        return content

    from app_attachment.models import Attachment
    from app_attachment.views import get_presigned_url

    if attachment_rows_by_id is None:
        rows = {
            row.id: row
            for row in Attachment.objects.filter(id__in=attachment_ids, is_deleted=False)
        }
    else:
        rows = attachment_rows_by_id
    next_content = {**content}
    next_attachments = []
    for item in attachments:
        if not isinstance(item, dict):
            next_attachments.append(item)
            continue
        next_item = {**item}
        try:
            attachment_id = int(next_item.get("attachment_id"))
        except (TypeError, ValueError):
            next_attachments.append(next_item)
            continue
        row = rows.get(attachment_id)
        if row is not None:
            next_item.setdefault("name", row.filename)
            next_item.setdefault("mime_type", row.file_type)
            next_item.setdefault("size_bytes", row.size or 0)
            if row.data:
                next_item["download_url"] = get_presigned_url(
                    row.data,
                    row.filename,
                    row.file_type,
                )
            elif row.public_data:
                next_item["download_url"] = row.public_data.url
        next_attachments.append(next_item)
    next_content["attachments"] = next_attachments
    return next_content


class BaseChatMessageSerializer(BaseModelSerializer):
    """Shared reply preview, reactions, and tombstone content for course + DM messages."""

    reply_to = serializers.SerializerMethodField(read_only=True)
    reactions = serializers.SerializerMethodField(read_only=True)

    def _attachment_rows_by_id(self):
        return self.context.get("attachment_rows_by_id")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        attachment_rows = self._attachment_rows_by_id()
        if instance.deleted_at is not None:
            data["content"] = {"text": "", "mentions": [], "attachments": []}
            data["reactions"] = []
        else:
            data["content"] = _content_with_attachment_urls(
                data.get("content"), attachment_rows_by_id=attachment_rows
            )
        return data

    def get_reply_to(self, obj):
        parent = obj.reply_to
        if parent is None:
            return None
        user = getattr(parent, "user", None)
        name = getattr(user, "name", "") if user is not None else ""
        attachment_rows = self._attachment_rows_by_id()
        return {
            "id": parent.id,
            "user": {"id": parent.user_id, "name": name},
            "content": None
            if parent.deleted_at
            else _content_with_attachment_urls(
                parent.content, attachment_rows_by_id=attachment_rows
            ),
            "deleted_at": parent.deleted_at.isoformat() if parent.deleted_at else None,
        }

    def get_reactions(self, obj):
        if obj.deleted_at is not None:
            return []
        request = self.context.get("request")
        viewer = User.get_user_from_request(request) if request else None
        current_user_id = viewer.id if viewer else None
        return aggregate_reactions_for_message(obj, current_user_id)


class ChatMessageSerializer(BaseChatMessageSerializer):
    """Base serializer for a unified ChatMessage row (exposes raw `thread`)."""

    class Meta:
        model = ChatMessage
        fields = (
            "id",
            "created_at",
            "updated_at",
            "thread",
            "user",
            "content",
            "edited_at",
            "deleted_at",
            "deleted_by",
            "reply_to",
            "reactions",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "thread",
            "user",
            "edited_at",
            "deleted_at",
            "deleted_by",
            "reply_to",
            "reactions",
        )
        expandable_fields = {
            "user": ("app_auth.serializers.UserSerializer",),
        }


class CourseChatMessageSerializer(ChatMessageSerializer):
    """
    Course chat API contract: exposes `course` (the owning course id) instead of
    the raw `thread` id, preserving the pre-unification response shape.
    """

    course = serializers.SerializerMethodField(read_only=True)

    class Meta(ChatMessageSerializer.Meta):
        fields = tuple(f for f in ChatMessageSerializer.Meta.fields if f != "thread") + ("course",)
        read_only_fields = fields
        expandable_fields = {
            "user": ("app_auth.serializers.UserSerializer",),
            "course": ("app_course.serializers.CourseSerializer",),
        }

    def get_course(self, obj):
        return obj.thread.course_id


class DirectMessageSerializer(ChatMessageSerializer):
    """DM API contract: identical to the base serializer (already exposes `thread`)."""


class ChatReadStateSerializer(BaseModelSerializer):
    class Meta:
        model = ChatReadState
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "user",
            "thread",
        )


class CourseChatReadStateSerializer(ChatReadStateSerializer):
    """Course chat read-state API contract: exposes `course` instead of `thread`."""

    course = serializers.SerializerMethodField(read_only=True)

    class Meta(ChatReadStateSerializer.Meta):
        fields = ("id", "created_at", "updated_at", "user", "course", "last_read_message_id")
        read_only_fields = fields

    def get_course(self, obj):
        return obj.thread.course_id


class DirectMessageReadStateSerializer(ChatReadStateSerializer):
    """DM read-state API contract: identical to the base serializer."""


class DirectMessageThreadSerializer(BaseModelSerializer):
    user_low = serializers.SerializerMethodField(read_only=True)
    user_high = serializers.SerializerMethodField(read_only=True)
    participant_ids = serializers.SerializerMethodField(read_only=True)
    other_participant = serializers.SerializerMethodField(read_only=True)
    last_message = serializers.SerializerMethodField(read_only=True)
    unread_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ChatThread
        fields = (
            "id",
            "created_at",
            "updated_at",
            "user_low",
            "user_high",
            "participant_ids",
            "other_participant",
            "last_message",
            "unread_count",
        )
        read_only_fields = fields

    def _participants(self, obj):
        cached = getattr(obj, "_participant_users", None)
        if cached is not None:
            return cached
        users = [p.user for p in obj.participants.select_related("user").all()]
        obj._participant_users = users
        return users

    def get_participant_ids(self, obj):
        return [u.id for u in self._participants(obj)]

    def get_user_low(self, obj):
        ids = sorted(u.id for u in self._participants(obj))
        return ids[0] if ids else None

    def get_user_high(self, obj):
        ids = sorted(u.id for u in self._participants(obj))
        return ids[-1] if ids else None

    def _profile_image_url(self, user):
        request = self.context.get("request")
        if not getattr(user, "profile_image", None):
            return None
        url = user.profile_image.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_other_participant(self, obj):
        viewer = self.context.get("dm_user")
        if viewer is None:
            request = self.context.get("request")
            viewer = User.get_user_from_request(request) if request else None
        if viewer is None:
            return None
        others = [u for u in self._participants(obj) if u.id != viewer.id]
        other = others[0] if others else None
        if other is None:
            return None
        return {
            "id": other.id,
            "name": getattr(other, "name", "") or "",
            "email": getattr(other, "email", "") or "",
            "profile_image": self._profile_image_url(other),
        }

    def get_last_message(self, obj):
        mid = getattr(obj, "latest_message_id", None)
        if mid is None:
            return None
        latest_map = self.context.get("latest_messages_by_id") or {}
        msg = latest_map.get(mid)
        if msg is None:
            return None
        data = DirectMessageSerializer(msg, context=self.context).data
        return {
            "id": data["id"],
            "created_at": data["created_at"],
            "user": {
                "id": msg.user_id,
                "name": getattr(msg.user, "name", ""),
            },
            "content": data["content"],
        }

    def get_unread_count(self, obj):
        return getattr(obj, "_dm_unread_count", 0)
```

- [ ] **Step 2: Run reply/reaction serializer tests**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_dm_replies
```

Expected: still red (depends on `services.py` already fixed in Task 5, but the test file itself imports fine now) — confirm the failure is only in `views.py`-dependent paths, not serializer-level `ImportError`s. `test_dm_replies.py` doesn't touch views directly (see its content — it calls `create_dm_message` and `DirectMessageSerializer` directly), so this should now PASS. If it doesn't, check the traceback before moving on.

- [ ] **Step 3: Commit**

```bash
git add app_chat/serializers.py
git commit -m "feat(chat): rewrite serializers on unified ChatMessage/ChatThread/ChatReadState"
```

---

### Task 9: Rewrite `app_chat/views.py`

**Files:**
- Modify: `app_chat/views.py` (full rewrite)
- Modify: `app_chat/tests/test_course_chat_permissions.py`, `test_reactions.py`, `test_message_cursor_pagination.py` (model imports)

URLs (`app_chat/urls.py`) are **unchanged** — this task only changes what each view queries internally.

- [ ] **Step 1: Replace `app_chat/views.py`**

```python
from django.core.exceptions import BadRequest, ValidationError as DjangoValidationError
from django.db import connection
from django.db.models import Exists, OuterRef, Q, QuerySet, Subquery
from django.utils import timezone
import logging
from rest_framework import status
from rest_framework.request import Request
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BrowsableAPIRenderer
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

from app_auth.models import User
from app_chat import models, serializers
from app_chat.course_chat_list_cache import invalidate_course_chat_list_cache
from app_chat.message_cursor import (
    CURSOR_MESSAGE_PAGE_SIZE,
    DEFAULT_MESSAGE_LIST_SIZE,
    fetch_latest_messages,
    fetch_older_messages,
    parse_before_id,
    parse_message_list_size,
)
from app_chat.message_list_helpers import serialize_message_rows
from app_chat.models import ChatMessage, ChatReadState, ChatThread, ChatThreadKind
from app_chat.notifications import queue_course_chat_message_pushes
from app_chat.reaction_helpers import aggregate_reactions_for_message
from app_chat.reaction_toggle_helpers import handle_chat_reaction_toggle_post
from app_chat.realtime import (
    broadcast_dm_message_from_db,
    broadcast_to_course_chat,
    broadcast_to_dm_chat,
)
from app_chat.realtime_presence import online_user_ids
from app_chat.services import (
    bulk_dm_unread_counts,
    can_create_dm_thread,
    can_moderate_chat,
    can_send_course_chat_message,
    create_dm_message,
    dm_thread_pair_policy_allows,
    get_or_create_course_chat_thread,
    is_course_member,
    start_dm_conversation,
    mention_user_ids_from_content_mentions,
    user_is_dm_participant,
    validate_chat_attachment_refs,
    validate_chat_content_payload,
    validate_mention_user_ids,
)
from app_course.models import UserCourse
from app_rbac.views import RBACListView, RBACPermission
from utilitas.renderer import CustomRenderer
from utilitas.views import BaseView

logger = logging.getLogger(__name__)


def _course_chat_message_patch_broadcast_dict(message: ChatMessage) -> dict:
    """
    JSON-safe message row for PATCH response and WS ``message_edited``.

    Built explicitly so we never pass DRF ReturnDict / odd nested types into
    CustomRenderer or the channel layer (both have caused HTTP 500s in practice).
    """
    u = message.user
    reply_payload = None
    parent = message.reply_to
    if parent is not None:
        pu = getattr(parent, "user", None)
        reply_payload = {
            "id": parent.id,
            "user": {
                "id": parent.user_id,
                "name": getattr(pu, "name", "") if pu is not None else "",
            },
            "content": None if parent.deleted_at else parent.content,
            "deleted_at": parent.deleted_at.isoformat() if parent.deleted_at else None,
        }
    return {
        "id": message.id,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "updated_at": message.updated_at.isoformat() if message.updated_at else None,
        "course": message.thread.course_id,
        "user": {
            "id": message.user_id,
            "email": getattr(u, "email", "") if u is not None else "",
            "name": getattr(u, "name", "") if u is not None else "",
        },
        "content": message.content,
        "edited_at": message.edited_at.isoformat() if message.edited_at else None,
        "deleted_at": message.deleted_at.isoformat() if message.deleted_at else None,
        "deleted_by": message.deleted_by_id,
        "deleted_by_id": message.deleted_by_id,
        "reply_to": reply_payload,
        "reactions": aggregate_reactions_for_message(message, None),
    }


_CHAT_PARTICIPATE = {
    "GET": "chat.participate",
    "POST": "chat.participate",
    "PATCH": "chat.participate",
    "PUT": "chat.participate",
    "DELETE": "chat.participate",
}


class CourseChatMessageListView(RBACListView):
    """List chat messages for a course. Requires course membership (non-dropped)."""

    name = "Course chat message list"
    model = ChatMessage
    serializer = serializers.CourseChatMessageSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    required_permissions = _CHAT_PARTICIPATE

    def augment_search_queryset(
        self, queryset: QuerySet, expand: list, is_csv: bool
    ) -> QuerySet:
        return queryset.select_related("thread", "reply_to", "reply_to__user").prefetch_related(
            "reactions", "reactions__created_by"
        )

    def get(self, request: Request, course_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return self.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )

        is_member = UserCourse.objects.filter(
            course_id=course_id, user=user
        ).exists()
        if not is_member:
            return self.forbidden("You are not a member of this course")

        self.description = self.model.__doc__
        if request.GET.get("meta"):
            return self.send_metadata(request)

        try:
            query_params = self.get_query_params(request)
        except BadRequest as e:
            return self.send_response(
                True, "bad_request", {"details": str(e)}, status=400
            )

        thread = ChatThread.objects.filter(kind=ChatThreadKind.COURSE, course_id=course_id).first()
        if thread is None:
            # No chat activity yet for this course: valid empty history, not an error.
            empty_body = {"data": [], "has_more": False}
            return self.send_response(False, "success", empty_body, status=status.HTTP_200_OK)

        # Include soft-deleted rows so HTTP history matches WS tombstones for clients
        # who open the chat after a delete. Do not HTTP-cache this list: cached snapshots
        # could still contain pre-delete bodies after invalidation races.
        filter_params: dict = {"thread_id": thread.id}

        before_id = parse_before_id(request)
        if before_id is not None:
            queryset = (
                self.model.objects.filter(**filter_params)
                .select_related("user", "thread", "reply_to", "reply_to__user")
                .prefetch_related("reactions", "reactions__created_by")
            )
            size = parse_message_list_size(
                request, default=CURSOR_MESSAGE_PAGE_SIZE
            )
            rows = fetch_older_messages(queryset, before_id, size)
            serialized_data = serialize_message_rows(
                self.serializer, rows, request
            )
            body = {
                "data": serialized_data.data,
                "has_more": len(rows) == size,
            }
            return self.send_response(
                False,
                "success",
                body,
                status=status.HTTP_200_OK,
            )

        serialized_data = self.get_queryset(
            request,
            filter_params=filter_params,
            **query_params,
        )
        body = {**self.get_paginated_response(), "data": serialized_data.data}
        return self.send_response(
            False,
            "success",
            body,
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request, course_id: int):
        """Course chat messages are created via WebSocket (notifications + realtime)."""
        return self.send_response(
            True,
            "method_not_allowed",
            {"details": "POST not allowed; send messages via WebSocket."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class ChatApiView(APIView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    required_permissions = _CHAT_PARTICIPATE
    renderer_classes = [CustomRenderer, BrowsableAPIRenderer]


class CourseChatMessageDetailView(ChatApiView):
    """PATCH (edit own) or DELETE (soft-delete) a course chat message."""

    def patch(self, request: Request, course_id: int, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        if not can_send_course_chat_message(user, course_id):
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You are not a member of this course"},
                status=403,
            )

        message = (
            ChatMessage.objects.filter(
                pk=message_id, thread__kind=ChatThreadKind.COURSE, thread__course_id=course_id
            )
            .select_related("thread", "user", "reply_to", "reply_to__user")
            .first()
        )
        if message is None:
            return BaseView.send_response(
                True,
                "not_found",
                {"details": "Message not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if message.user_id != user.id or message.deleted_at is not None:
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You cannot edit this message"},
                status=status.HTTP_403_FORBIDDEN,
            )

        body = request.data if isinstance(request.data, dict) else {}
        content = body.get("content")
        if not isinstance(content, dict):
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "Body must include object 'content'"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            new_content = validate_chat_content_payload(content)
            validate_chat_attachment_refs(user, new_content.get("attachments", []))
        except DjangoValidationError as e:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": e.message_dict if hasattr(e, "message_dict") else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_mention_user_ids(
                course_id, mention_user_ids_from_content_mentions(new_content["mentions"])
            )
        except DjangoValidationError as e:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": e.message_dict if hasattr(e, "message_dict") else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if message.edited_at is None:
            message.edited_at = timezone.now()
        message.content = new_content
        message.save()

        invalidate_course_chat_list_cache(connection.schema_name, course_id)
        fresh = (
            ChatMessage.objects.filter(pk=message.pk)
            .select_related("thread", "user", "reply_to", "reply_to__user")
            .first()
        )
        if fresh is None:
            return BaseView.send_response(
                True,
                "not_found",
                {"details": "Message not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        data = _course_chat_message_patch_broadcast_dict(fresh)
        broadcast_to_course_chat(
            connection.schema_name,
            course_id,
            {"event": "message_edited", "data": data},
        )
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )

    def delete(self, request: Request, course_id: int, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        if not is_course_member(user, course_id):
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You are not a member of this course"},
                status=403,
            )

        message = (
            ChatMessage.objects.filter(
                pk=message_id, thread__kind=ChatThreadKind.COURSE, thread__course_id=course_id
            )
            .select_related("user")
            .first()
        )
        if message is None:
            return BaseView.send_response(
                True,
                "not_found",
                {"details": "Message not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if message.deleted_at is not None:
            tombstone = {
                "id": message.id,
                "deleted_at": message.deleted_at.isoformat(),
                "deleted_by_id": message.deleted_by_id,
            }
            return BaseView.send_response(
                False, "success", {"data": tombstone}, status=status.HTTP_200_OK
            )

        if message.user_id == user.id:
            message.deleted_at = timezone.now()
            message.deleted_by = None
        elif can_moderate_chat(user, course_id):
            message.deleted_at = timezone.now()
            message.deleted_by = user
        else:
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You cannot delete this message"},
                status=status.HTTP_403_FORBIDDEN,
            )

        message.save()
        invalidate_course_chat_list_cache(connection.schema_name, course_id)
        tombstone = {
            "id": message.id,
            "deleted_at": message.deleted_at.isoformat(),
            "deleted_by_id": message.deleted_by_id,
        }
        broadcast_to_course_chat(
            connection.schema_name,
            course_id,
            {"event": "message_deleted", "data": tombstone},
        )
        return BaseView.send_response(
            False, "success", {"data": tombstone}, status=status.HTTP_200_OK
        )


class CourseChatReadStatePutView(ChatApiView):
    """PUT monotonic read cursor for the current user in a course."""

    def put(self, request: Request, course_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        if not is_course_member(user, course_id):
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You are not a member of this course"},
                status=403,
            )

        body = request.data if isinstance(request.data, dict) else {}
        mid = body.get("last_read_message_id")
        try:
            last_read_message_id = int(mid)
        except (TypeError, ValueError):
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "last_read_message_id must be an integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        thread = get_or_create_course_chat_thread(course_id)
        msg = ChatMessage.objects.filter(
            pk=last_read_message_id,
            thread_id=thread.id,
            deleted_at__isnull=True,
        ).first()
        if msg is None:
            return BaseView.send_response(
                True,
                "not_found",
                {"details": "Message not found in this course"},
                status=status.HTTP_404_NOT_FOUND,
            )

        existing = ChatReadState.objects.filter(user=user, thread=thread).first()
        if (
            existing is not None
            and existing.last_read_message_id is not None
            and last_read_message_id < existing.last_read_message_id
        ):
            return BaseView.send_response(
                True,
                "bad_request",
                {
                    "details": "last_read_message_id cannot move backwards",
                    "current_last_read_message_id": existing.last_read_message_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        state, _created = ChatReadState.objects.update_or_create(
            user=user,
            thread=thread,
            defaults={"last_read_message_id": last_read_message_id},
        )
        data = serializers.CourseChatReadStateSerializer(
            state, context={"request": request}
        ).data
        broadcast_to_course_chat(
            connection.schema_name,
            course_id,
            {
                "event": "read_receipt",
                "user_id": user.id,
                "last_read_message_id": last_read_message_id,
            },
        )
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )


class CourseChatPresenceGetView(ChatApiView):
    """GET online member user ids (from WebSocket presence heartbeats)."""

    def get(self, request: Request, course_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        if not is_course_member(user, course_id):
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You are not a member of this course"},
                status=403,
            )
        ids = online_user_ids(connection.schema_name, course_id)
        return BaseView.send_response(
            False,
            "success",
            {"data": {"online_user_ids": ids}},
            status=status.HTTP_200_OK,
        )


class DirectMessageEligibleUsersView(ChatApiView):
    """Paginated tenant user search for DM compose (policy-filtered)."""

    def get(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )

        q = (request.query_params.get("q") or "").strip()
        try:
            page = max(1, int(request.query_params.get("page") or 1))
        except (TypeError, ValueError):
            page = 1
        try:
            size = int(request.query_params.get("size") or 20)
        except (TypeError, ValueError):
            size = 20
        size = max(1, min(size, 100))

        qs = User.objects.exclude(pk=user.pk).order_by("name", "email")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(email__icontains=q))

        eligible = [u for u in qs if can_create_dm_thread(user, u)]
        total = len(eligible)
        start = (page - 1) * size
        page_users = eligible[start : start + size]

        def row(u: User):
            img = None
            if u.profile_image:
                img = request.build_absolute_uri(u.profile_image.url)
            return {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "profile_image": img,
            }

        return BaseView.send_response(
            False,
            "success",
            {
                "data": {
                    "results": [row(u) for u in page_users],
                    "page": page,
                    "size": size,
                    "count": total,
                }
            },
            status=status.HTTP_200_OK,
        )


class DirectMessageThreadListCreateView(ChatApiView):
    def get(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        latest_subq = ChatMessage.objects.filter(thread_id=OuterRef("pk")).order_by(
            "-created_at", "-id"
        ).values("id")[:1]
        has_messages = ChatMessage.objects.filter(thread_id=OuterRef("pk"))
        qs = (
            ChatThread.objects.filter(kind=ChatThreadKind.DM, participants__user=user)
            .filter(Exists(has_messages))
            .prefetch_related("participants__user")
            .annotate(latest_message_id=Subquery(latest_subq))
            .order_by("-updated_at")
        )
        threads = list(qs)
        latest_ids = [t.latest_message_id for t in threads if t.latest_message_id]
        latest_map = {}
        if latest_ids:
            for m in ChatMessage.objects.filter(pk__in=latest_ids).select_related("user"):
                latest_map[m.id] = m
        counts = bulk_dm_unread_counts([t.id for t in threads], user.id)
        for t in threads:
            t._dm_unread_count = counts.get(t.id, 0)
        ser_ctx = {
            "request": request,
            "dm_user": user,
            "latest_messages_by_id": latest_map,
        }
        data = serializers.DirectMessageThreadSerializer(
            threads, many=True, context=ser_ctx
        ).data
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )

    def post(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        participant_user_id = request.data.get("participant_user_id")
        content = request.data.get("content")
        if content is None:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "content is required to start a conversation"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            participant_user_id = int(participant_user_id)
        except (TypeError, ValueError):
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "participant_user_id must be an integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reply_to_id = request.data.get("reply_to_id")
        try:
            thread, message, created = start_dm_conversation(
                user, participant_user_id, content, reply_to_id=reply_to_id
            )
        except DjangoValidationError as e:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": e.message_dict if hasattr(e, "message_dict") else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        thread = (
            ChatThread.objects.prefetch_related("participants__user")
            .filter(pk=thread.pk)
            .first()
        )
        latest_map = {message.id: message}
        thread_data = serializers.DirectMessageThreadSerializer(
            thread,
            context={
                "request": request,
                "dm_user": user,
                "latest_messages_by_id": latest_map,
            },
        ).data
        thread_data["thread_type"] = "dm"
        message_data = serializers.DirectMessageSerializer(
            message, context={"request": request}
        ).data
        cid = request.data.get("client_message_id")
        cid_str = cid if isinstance(cid, str) else None
        try:
            broadcast_dm_message_from_db(connection.schema_name, message.id, cid_str)
        except Exception:
            logger.exception(
                "broadcast_dm_message_from_db failed message_id=%s", message.id
            )
        return BaseView.send_response(
            False,
            "created",
            {
                "data": {
                    "thread": thread_data,
                    "message": message_data,
                    "created": created,
                }
            },
            status=status.HTTP_201_CREATED,
        )


class DirectMessageListCreateView(ChatApiView):
    def get(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id, kind=ChatThreadKind.DM).first()
        if not thread or not user_is_dm_participant(user, thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        queryset = (
            ChatMessage.objects.filter(thread=thread)
            .select_related("user", "reply_to", "reply_to__user")
            .prefetch_related("reactions", "reactions__created_by")
        )
        before_id = parse_before_id(request)
        if before_id is not None:
            size = parse_message_list_size(
                request, default=CURSOR_MESSAGE_PAGE_SIZE
            )
            rows = fetch_older_messages(queryset, before_id, size)
        else:
            size = parse_message_list_size(
                request, default=DEFAULT_MESSAGE_LIST_SIZE
            )
            rows = fetch_latest_messages(queryset, size)
        serialized = serialize_message_rows(
            serializers.DirectMessageSerializer, rows, request
        )
        return BaseView.send_response(
            False,
            "success",
            {
                "data": {
                    "results": serialized.data,
                    "has_more": len(rows) == size,
                }
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id, kind=ChatThreadKind.DM).first()
        if not thread or not user_is_dm_participant(user, thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        if not dm_thread_pair_policy_allows(thread):
            return BaseView.send_response(
                True,
                "bad_request",
                {
                    "details": (
                        "Direct messages are not allowed for this conversation."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        reply_to_id = request.data.get("reply_to_id")
        row, err = create_dm_message(
            thread_id,
            user,
            request.data.get("content"),
            reply_to_id=reply_to_id,
        )
        if err:
            status_code = status.HTTP_403_FORBIDDEN if err == "forbidden" else status.HTTP_400_BAD_REQUEST
            err_key = "forbidden" if err == "forbidden" else "bad_request"
            return BaseView.send_response(
                True,
                err_key,
                {"details": err},
                status=status_code,
            )
        serialized = serializers.DirectMessageSerializer(
            row, context={"request": request}
        ).data
        cid = request.data.get("client_message_id")
        cid_str = cid if isinstance(cid, str) else None
        try:
            broadcast_dm_message_from_db(connection.schema_name, row.id, cid_str)
        except Exception:
            logger.exception("broadcast_dm_message_from_db failed message_id=%s", row.id)
        return BaseView.send_response(
            False, "created", {"data": serialized}, status=status.HTTP_201_CREATED
        )


class DirectMessageDetailView(ChatApiView):
    def patch(self, request: Request, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        message = ChatMessage.objects.select_related("thread").filter(
            pk=message_id, thread__kind=ChatThreadKind.DM
        ).first()
        if not message or not user_is_dm_participant(user, message.thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        if message.user_id != user.id or message.deleted_at is not None:
            return BaseView.send_response(
                True, "forbidden", {"details": "You cannot edit this message"}, status=403
            )
        try:
            normalized_content = validate_chat_content_payload(request.data.get("content"))
            validate_chat_attachment_refs(
                user, normalized_content.get("attachments", [])
            )
        except DjangoValidationError as e:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": e.message_dict if hasattr(e, "message_dict") else str(e)},
                status=400,
            )
        message.content = normalized_content
        message.edited_at = timezone.now()
        message.save(update_fields=["content", "edited_at", "updated_at"])
        data = serializers.DirectMessageSerializer(
            message, context={"request": request}
        ).data
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )

    def delete(self, request: Request, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        message = ChatMessage.objects.select_related("thread").filter(
            pk=message_id, thread__kind=ChatThreadKind.DM
        ).first()
        if not message or not user_is_dm_participant(user, message.thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        if message.user_id != user.id:
            return BaseView.send_response(
                True, "forbidden", {"details": "You cannot delete this message"}, status=403
            )
        message.deleted_at = timezone.now()
        message.deleted_by = None
        message.save(update_fields=["deleted_at", "deleted_by", "updated_at"])
        return BaseView.send_response(
            False,
            "success",
            {
                "data": {
                    "id": message.id,
                    "deleted_at": message.deleted_at.isoformat(),
                    "deleted_by_id": None,
                }
            },
            status=status.HTTP_200_OK,
        )


class CourseChatMessageReactionToggleView(ChatApiView):
    """POST toggle reaction on a course chat message."""

    def post(self, request: Request, course_id: int, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        if not is_course_member(user, course_id):
            return BaseView.send_response(
                True,
                "forbidden",
                {"details": "You are not a member of this course"},
                status=403,
            )

        message = (
            ChatMessage.objects.filter(
                pk=message_id, thread__kind=ChatThreadKind.COURSE, thread__course_id=course_id
            )
            .prefetch_related("reactions", "reactions__created_by")
            .first()
        )
        if message is None:
            return BaseView.send_response(
                True,
                "not_found",
                {"details": "Message not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return handle_chat_reaction_toggle_post(
            request,
            message=message,
            toggle_kwargs={"message": message},
            broadcast=lambda reactions: broadcast_to_course_chat(
                connection.schema_name,
                course_id,
                {
                    "event": "reaction_changed",
                    "data": {"message_id": message.id, "reactions": reactions},
                },
            ),
        )


class DirectMessageReactionToggleView(ChatApiView):
    """POST toggle reaction on a direct message."""

    def post(self, request: Request, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )

        message = (
            ChatMessage.objects.select_related("thread")
            .prefetch_related("reactions", "reactions__created_by")
            .filter(pk=message_id, thread__kind=ChatThreadKind.DM)
            .first()
        )
        if not message or not user_is_dm_participant(user, message.thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )

        return handle_chat_reaction_toggle_post(
            request,
            message=message,
            toggle_kwargs={"message": message},
            broadcast=lambda reactions: broadcast_to_dm_chat(
                connection.schema_name,
                message.thread_id,
                {
                    "event": "reaction_changed",
                    "data": {"message_id": message.id, "reactions": reactions},
                },
            ),
        )


class DirectMessageReadStatePutView(ChatApiView):
    def put(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id, kind=ChatThreadKind.DM).first()
        if not thread or not user_is_dm_participant(user, thread):
            return BaseView.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        message_id = request.data.get("last_read_message_id")
        if message_id is not None:
            try:
                message_id = int(message_id)
            except (TypeError, ValueError):
                return BaseView.send_response(
                    True,
                    "bad_request",
                    {"details": "last_read_message_id must be an integer or null"},
                    status=400,
                )
        state, _ = ChatReadState.objects.get_or_create(user=user, thread=thread)
        state.last_read_message_id = message_id
        state.last_read_at = timezone.now()
        state.save(update_fields=["last_read_message_id", "last_read_at", "updated_at"])
        data = serializers.DirectMessageReadStateSerializer(
            state, context={"request": request}
        ).data
        return BaseView.send_response(
            False, "success", {"data": data}, status=status.HTTP_200_OK
        )
```

Note the `CourseChatMessageListView.get` now returns an early empty-history response when no `ChatThread` exists yet for the course (previously `CourseChatMessage.objects.filter(course_id=...)` on an empty table returned `[]` implicitly via the same code path — this makes that same "no messages yet" case explicit now that a thread row must exist for the normal query path to make sense).

- [ ] **Step 2: Update remaining test files' model imports**

In `app_chat/tests/test_message_cursor_pagination.py`, replace:

```python
from app_chat.models import CourseChatMessage, DirectMessage, DirectMessageThread
from app_chat.services import get_or_create_dm_thread
```

with:

```python
from app_chat.models import ChatMessage
from app_chat.services import get_or_create_course_chat_thread, get_or_create_dm_thread
```

and update `_seed_course_messages`:

```python
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
```

and update all other `CourseChatMessage`/`DirectMessage` references in this file (e.g. `CourseChatMessage.objects.filter(course=self.course)` in `test_course_chat_before_id_returns_older_page`) to `ChatMessage.objects.filter(thread=get_or_create_course_chat_thread(self.course.id))`, and `DirectMessage.objects.filter(thread=self.thread)` to `ChatMessage.objects.filter(thread=self.thread)`.

- [ ] **Step 3: Run the full app_chat suite**

```bash
./scripts/run_backend_tests.sh app_chat.tests
```

Expected: PASS across the board (`test_reactions.py`'s two previously-red broadcast tests now pass since `views.py` is updated).

- [ ] **Step 4: Commit**

```bash
git add app_chat/views.py app_chat/tests/test_message_cursor_pagination.py
git commit -m "feat(chat): rewrite views.py on unified ChatThread/ChatMessage"
```

---

### Task 10: Rewrite `app_chat/consumers.py`

**Files:**
- Modify: `app_chat/consumers.py` (full rewrite)

WebSocket URL routing (`ws/chat/<course_id>/`, DM equivalent) and room group names are unchanged.

- [ ] **Step 1: Replace `app_chat/consumers.py`**

```python
"""
Course chat WebSocket consumer.
"""
import time

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from tenant_schemas.utils import schema_context

from app_chat.course_chat_list_cache import invalidate_course_chat_list_cache
from app_chat.models import ChatMessage, ChatThread, ChatThreadKind
from app_chat.notifications import (
    queue_course_chat_message_pushes,
)
from app_chat.services import (
    get_or_create_course_chat_thread,
    mention_user_ids_from_content_mentions,
    user_is_dm_participant,
    validate_chat_attachment_refs,
    validate_chat_content_payload,
    validate_mention_user_ids,
    create_dm_message as create_dm_message_service,
)
from app_chat.realtime_presence import (
    clear_presence,
    set_typing,
    should_broadcast_typing_event,
    touch_presence,
)
from app_chat.message_broadcast import build_message_broadcast_payload
from app_chat.realtime import build_dm_message_broadcast_payload
from app_chat.serializers import CourseChatMessageSerializer
from app_course.models import UserCourse


# Rate limit: max messages per user per course per window
CHAT_RATE_LIMIT_MESSAGES = 30
CHAT_RATE_LIMIT_WINDOW_SECONDS = 60


@database_sync_to_async
def check_course_membership(course_id, user, schema_name):
    """Return True if user is a non-dropped member of the course."""
    if not user or user.is_anonymous:
        return False
    with schema_context(schema_name):
        return UserCourse.objects.filter(
            course_id=course_id, user=user
        ).exists()


@database_sync_to_async
def create_chat_message(course_id, user, content, schema_name, reply_to_id=None):
    with schema_context(schema_name):
        thread = get_or_create_course_chat_thread(course_id)

        reply_to = None
        if reply_to_id is not None:
            try:
                rid = int(reply_to_id)
            except (TypeError, ValueError):
                return None, "reply_to_invalid"
            parent = ChatMessage.objects.filter(pk=rid, thread_id=thread.id).first()
            if parent is None:
                return None, "reply_not_found"
            reply_to = parent

        try:
            content = validate_chat_content_payload(content)
            validate_chat_attachment_refs(user, content.get("attachments", []))
            validate_mention_user_ids(
                course_id,
                mention_user_ids_from_content_mentions(content.get("mentions", [])),
            )
        except DjangoValidationError:
            return None, "mentions_invalid"

        msg = ChatMessage.objects.create(
            thread=thread, user=user, content=content, reply_to=reply_to
        )
        msg = ChatMessage.objects.select_related("thread", "user").get(pk=msg.pk)
        queue_course_chat_message_pushes(msg)
        invalidate_course_chat_list_cache(schema_name, course_id)
        return msg, None


@database_sync_to_async
def build_new_chat_broadcast_payload(message_id, schema_name, client_message_id=None):
    with schema_context(schema_name):
        msg = ChatMessage.objects.select_related(
            "thread", "user", "reply_to", "reply_to__user"
        ).prefetch_related("reactions", "reactions__created_by").get(pk=message_id)
        return build_message_broadcast_payload(
            msg,
            serializer_class=CourseChatMessageSerializer,
            client_message_id=client_message_id,
        )


@database_sync_to_async
def build_new_dm_broadcast_payload(message_id, schema_name, client_message_id=None):
    with schema_context(schema_name):
        message = ChatMessage.objects.select_related(
            "thread", "user", "reply_to", "reply_to__user"
        ).get(pk=message_id)
        return build_dm_message_broadcast_payload(message, client_message_id)


def check_rate_limit(user_id, course_id):
    """Return (allowed: bool, retry_after_seconds: int)."""
    key = f"chat_rate:{course_id}:{user_id}"
    now = int(time.time())
    window_start = now - CHAT_RATE_LIMIT_WINDOW_SECONDS

    # Get existing timestamps (list of message times in window)
    existing = cache.get(key) or []
    existing = [t for t in existing if t > window_start]

    if len(existing) >= CHAT_RATE_LIMIT_MESSAGES:
        retry_after = int(existing[0]) + CHAT_RATE_LIMIT_WINDOW_SECONDS - now
        return False, max(1, retry_after)

    existing.append(now)
    cache.set(key, existing, timeout=CHAT_RATE_LIMIT_WINDOW_SECONDS + 10)
    return True, 0


class CourseChatConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for course group chat.
    URL: ws/chat/<course_id>/?token=<jwt>&tenant=<schema>
    """

    async def connect(self):
        self.course_id = self.scope["url_route"]["kwargs"]["course_id"]
        self.tenant_schema = self.scope.get("tenant_schema")
        self.user = self.scope.get("user")

        if not self.tenant_schema:
            await self.close(code=4001)
            return

        if not self.user or isinstance(self.user, AnonymousUser):
            await self.close(code=4002)
            return

        is_member = await check_course_membership(
            self.course_id, self.user, self.tenant_schema
        )
        if not is_member:
            await self.close(code=4003)
            return

        self.room_group_name = f"course_chat_{self.tenant_schema}_{self.course_id}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        await database_sync_to_async(touch_presence)(
            self.tenant_schema, self.course_id, self.user.id
        )

    async def disconnect(self, close_code):
        if (
            getattr(self, "tenant_schema", None)
            and getattr(self, "user", None)
            and not isinstance(self.user, AnonymousUser)
        ):
            await database_sync_to_async(clear_presence)(
                self.tenant_schema, self.course_id, self.user.id
            )
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(
                self.room_group_name, self.channel_name
            )

    async def receive_json(self, content):
        if not content or not isinstance(content, dict):
            await self.send_json({"error": "invalid_payload"})
            return

        msg_type = content.get("type") or "message"

        if msg_type == "heartbeat":
            await database_sync_to_async(touch_presence)(
                self.tenant_schema, self.course_id, self.user.id
            )
            return

        if msg_type == "typing":
            typing_active = bool(content.get("typing"))
            await database_sync_to_async(set_typing)(
                self.tenant_schema, self.course_id, self.user.id, typing_active
            )
            if typing_active:
                allowed = await database_sync_to_async(should_broadcast_typing_event)(
                    self.tenant_schema, self.course_id, self.user.id
                )
                if not allowed:
                    return
            name = getattr(self.user, "name", "") or ""
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "chat.event",
                    "payload": {
                        "event": "typing",
                        "user_id": self.user.id,
                        "name": name,
                        "typing": typing_active,
                    },
                },
            )
            return

        # --- type "message" (default) ---
        raw_content = content.get("content")
        if raw_content is None:
            await self.send_json({"error": "content_required"})
            return

        if not isinstance(raw_content, dict):
            await self.send_json({"error": "content_must_be_object"})
            return

        client_message_id = content.get("client_message_id")
        if client_message_id is not None and not isinstance(client_message_id, str):
            await self.send_json({"error": "client_message_id_must_be_string"})
            return
        if client_message_id is not None and len(client_message_id) > 64:
            await self.send_json({"error": "client_message_id_too_long"})
            return

        reply_to_id = content.get("reply_to_id")

        allowed, retry_after = await self._check_rate_limit_async()
        if not allowed:
            await self.send_json(
                {
                    "error": "rate_limited",
                    "retry_after_seconds": retry_after,
                }
            )
            return

        message, err = await create_chat_message(
            self.course_id,
            self.user,
            raw_content,
            self.tenant_schema,
            reply_to_id=reply_to_id,
        )
        if err:
            await self.send_json({"error": err})
            return

        payload = await build_new_chat_broadcast_payload(
            message.id,
            self.tenant_schema,
            client_message_id=client_message_id,
        )

        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "chat.message", "message": payload},
        )

    async def _check_rate_limit_async(self):
        """Run sync rate limit check in thread."""
        return await database_sync_to_async(
            lambda: check_rate_limit(self.user.id, self.course_id)
        )()

    async def chat_message(self, event):
        """Handle broadcast from group_send (legacy flat new message)."""
        await self.send_json(event["message"])

    async def chat_event(self, event):
        """Side-channel events (edit, delete, typing, read receipts)."""
        await self.send_json(event["payload"])


@database_sync_to_async
def check_dm_thread_membership(thread_id, user, schema_name):
    if not user or user.is_anonymous:
        return False
    with schema_context(schema_name):
        thread = ChatThread.objects.filter(pk=thread_id, kind=ChatThreadKind.DM).first()
        if thread is None:
            return False
        return user_is_dm_participant(user, thread)


@database_sync_to_async
def create_dm_message(thread_id, user, content, schema_name, reply_to_id=None):
    with schema_context(schema_name):
        return create_dm_message_service(thread_id, user, content, reply_to_id)


class DirectMessageConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.thread_id = self.scope["url_route"]["kwargs"]["thread_id"]
        self.tenant_schema = self.scope.get("tenant_schema")
        self.user = self.scope.get("user")
        if not self.tenant_schema:
            await self.close(code=4001)
            return
        if not self.user or isinstance(self.user, AnonymousUser):
            await self.close(code=4002)
            return
        is_member = await check_dm_thread_membership(
            self.thread_id, self.user, self.tenant_schema
        )
        if not is_member:
            await self.close(code=4003)
            return
        self.room_group_name = f"dm_chat_{self.tenant_schema}_{self.thread_id}"
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(
                self.room_group_name, self.channel_name
            )

    async def receive_json(self, content):
        if not content or not isinstance(content, dict):
            await self.send_json({"error": "invalid_payload"})
            return
        msg_type = content.get("type") or "message"
        if msg_type != "message":
            return
        raw_content = content.get("content")
        if not isinstance(raw_content, dict):
            await self.send_json({"error": "content_must_be_object"})
            return
        client_message_id = content.get("client_message_id")
        reply_to_id = content.get("reply_to_id")
        message, err = await create_dm_message(
            self.thread_id,
            self.user,
            raw_content,
            self.tenant_schema,
            reply_to_id=reply_to_id,
        )
        if err:
            await self.send_json({"error": err})
            return
        payload = await build_new_dm_broadcast_payload(
            message.id,
            self.tenant_schema,
            client_message_id=client_message_id,
        )
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "chat.message", "message": payload},
        )

    async def chat_message(self, event):
        await self.send_json(event["message"])

    async def chat_event(self, event):
        """Side-channel events (edit, delete, reactions)."""
        await self.send_json(event["payload"])
```

- [ ] **Step 2: Run WS-adjacent tests**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_websocket_tenant_auth
./scripts/run_backend_tests.sh app_chat.tests.test_dm_replies
```

Expected: PASS (`test_websocket_tenant_auth.py` doesn't touch chat models directly — it tests JWT tenant-claim middleware — so it should be unaffected and already green; running it here is a regression check).

- [ ] **Step 3: Commit**

```bash
git add app_chat/consumers.py
git commit -m "feat(chat): rewrite WebSocket consumers on unified ChatThread/ChatMessage"
```

---

### Task 11: Rewrite `notifications.py`, `signals.py`, `admin.py`

**Files:**
- Modify: `app_chat/notifications.py` (full rewrite)
- Modify: `app_chat/signals.py` (full rewrite)
- Modify: `app_chat/admin.py` (full rewrite)
- Modify: `app_chat/tests/test_notifications.py`

- [ ] **Step 1: Replace `app_chat/notifications.py`**

```python
from __future__ import annotations

from collections.abc import Callable, Iterable

from app_utils.push_helpers import enqueue_push_for_user_ids
from app_chat.models import ChatReadState, ChatThreadParticipant


def _chat_body_preview(content: dict | None) -> str:
    c = content or {}
    text = (c.get("text") or "").strip()
    if text:
        return text[:120]
    attachments = c.get("attachments") or []
    if attachments:
        if len(attachments) == 1 and isinstance(attachments[0], dict):
            mime = (attachments[0].get("mime_type") or "").strip().lower()
            if mime.startswith("audio/"):
                return "Sent a voice message."
        return "Sent an attachment."
    return "You received a new message."


def _sender_display_name(user) -> str:
    if user is None:
        return ""
    return (getattr(user, "name", "") or "").strip()


def _filter_unread_recipient_ids(
    message_id: int,
    candidate_ids: Iterable[int],
    read_states: dict[int, int],
) -> list[int]:
    target_ids = []
    for uid in candidate_ids:
        last_read_id = read_states.get(uid, 0) or 0
        if last_read_id >= message_id:
            continue
        target_ids.append(uid)
    return target_ids


def queue_chat_message_pushes(
    message,
    *,
    sender_id: int,
    resolve_candidate_ids: Callable[[], list[int]],
    resolve_read_states: Callable[[list[int]], dict[int, int]],
    resolve_title: Callable[[], str],
    push_data: dict[str, str],
) -> None:
    """Queue push notifications for chat messages not yet read by recipients."""
    candidate_ids = [uid for uid in resolve_candidate_ids() if uid != sender_id]
    if not candidate_ids:
        return
    read_states = resolve_read_states(candidate_ids)
    target_ids = _filter_unread_recipient_ids(message.id, candidate_ids, read_states)
    if not target_ids:
        return
    sender_name = _sender_display_name(getattr(message, "user", None))
    body = _chat_body_preview(
        message.content if isinstance(message.content, dict) else None
    )
    data = {**push_data, "message_id": str(message.id), "sender_name": sender_name}
    enqueue_push_for_user_ids(target_ids, title=resolve_title(), body=body, data=data)


def queue_course_chat_message_pushes(message) -> None:
    thread = message.thread
    course_id = thread.course_id

    def resolve_candidate_ids() -> list[int]:
        return list(thread.course.user_courses.values_list("user_id", flat=True))

    def resolve_read_states(candidate_ids: list[int]) -> dict[int, int]:
        return {
            s.user_id: s.last_read_message_id
            for s in ChatReadState.objects.filter(
                thread_id=thread.id, user_id__in=candidate_ids
            )
        }

    def resolve_title() -> str:
        course = getattr(thread, "course", None)
        return (getattr(course, "title", "") or "").strip() or "Course chat"

    queue_chat_message_pushes(
        message,
        sender_id=message.user_id,
        resolve_candidate_ids=resolve_candidate_ids,
        resolve_read_states=resolve_read_states,
        resolve_title=resolve_title,
        push_data={"type": "course_chat", "course_id": str(course_id)},
    )


def queue_dm_message_pushes(message) -> None:
    thread = message.thread

    def resolve_candidate_ids() -> list[int]:
        return list(
            ChatThreadParticipant.objects.filter(thread_id=thread.id).values_list("user_id", flat=True)
        )

    def resolve_read_states(candidate_ids: list[int]) -> dict[int, int]:
        return {
            s.user_id: s.last_read_message_id or 0
            for s in ChatReadState.objects.filter(
                thread_id=thread.id, user_id__in=candidate_ids
            )
        }

    def resolve_title() -> str:
        sender_name = _sender_display_name(getattr(message, "user", None))
        return sender_name or "Direct message"

    queue_chat_message_pushes(
        message,
        sender_id=message.user_id,
        resolve_candidate_ids=resolve_candidate_ids,
        resolve_read_states=resolve_read_states,
        resolve_title=resolve_title,
        push_data={"type": "dm", "thread_id": str(thread.id)},
    )
```

Note `ChatReadState` and `ChatThreadParticipant` are now imported at **module level** (not inside the nested functions as the old `CourseChatReadState`/`DirectMessageReadState` were) — this makes them patchable as `app_chat.notifications.ChatReadState` / `app_chat.notifications.ChatThreadParticipant` in tests, and both course and DM paths now query the *same* `ChatReadState` model, matching the unified schema. Also note `queue_course_chat_message_pushes` now takes `course_id`/`resolve_title` from `message.thread` (a `ChatThread`) instead of `message.course` — callers must ensure `message` has `.thread.course` reachable (already `select_related`'d in `views.py`/`consumers.py`).

- [ ] **Step 2: Replace `app_chat/signals.py`**

```python
from django.db import connection
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from app_chat.course_chat_list_cache import invalidate_course_chat_list_cache
from app_chat.models import ChatMessage, ChatThreadKind


@receiver(post_save, sender=ChatMessage)
def _invalidate_course_chat_list_cache_on_save(sender, instance, **kwargs):
    if instance.thread.kind != ChatThreadKind.COURSE:
        return
    invalidate_course_chat_list_cache(connection.schema_name, instance.thread.course_id)


@receiver(post_delete, sender=ChatMessage)
def _invalidate_course_chat_list_cache_on_delete(sender, instance, **kwargs):
    if instance.thread.kind != ChatThreadKind.COURSE:
        return
    invalidate_course_chat_list_cache(connection.schema_name, instance.thread.course_id)
```

Note: accessing `instance.thread` inside a signal handler triggers a DB query unless the caller's queryset already `select_related("thread")`'d the instance (the `ChatMessage.objects.create(...)` calls in `services.py`/`consumers.py` do not pre-populate `.thread` on the returned instance from `.create()` — Django does cache the FK object you passed in on `.create(thread=thread, ...)`, so `instance.thread` is already the in-memory `thread` object with no extra query in every current call site). This is safe as written; if a future call site does `ChatMessage.objects.filter(...).update(...)` (bypassing signals) or constructs a bare `ChatMessage(thread_id=X)` without setting `.thread`, add `.select_related("thread")` before triggering the signal.

- [ ] **Step 3: Replace `app_chat/admin.py`**

```python
from django.contrib import admin

from app_chat.models import ChatMessage


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "thread", "user", "created_at")
    list_filter = ("thread__kind",)
    search_fields = ("content", "user__email")
```

- [ ] **Step 4: Update `app_chat/tests/test_notifications.py`**

Replace every `@patch("app_chat.notifications.CourseChatReadState.objects.filter")` with `@patch("app_chat.notifications.ChatReadState.objects.filter")`, and every `@patch("app_chat.notifications.DirectMessageReadState.objects.filter")` with the same `@patch("app_chat.notifications.ChatReadState.objects.filter")` target (both course and DM now share one model).

Update the `message` fixtures to use `message.thread` instead of `message.course`/`message.course_id`, e.g. in `test_course_chat_excludes_sender_and_includes_data_payload`:

```python
        mock_read_filter.return_value = []
        user_courses = MagicMock()
        user_courses.filter.return_value.values_list.return_value = [10, 20, 30]
        course = SimpleNamespace(title="Algebra 101", user_courses=user_courses)
        thread = SimpleNamespace(id=1, course_id=5, course=course, kind="course")
        sender = SimpleNamespace(name="Jane Doe")
        message = SimpleNamespace(
            id=99,
            user_id=10,
            thread=thread,
            user=sender,
            content={"text": "Hello class"},
        )
```

Apply the same `course = SimpleNamespace(...)` -> `thread = SimpleNamespace(id=..., course_id=..., course=course, kind="course")` + `message = SimpleNamespace(..., thread=thread, ...)` transform (dropping `course_id`/`course` keys directly on `message`) to: `test_course_chat_skips_already_read_recipient`, `test_course_chat_voice_message_preview`, `test_course_chat_attachment_preview`.

For the DM tests, replace `@patch("app_chat.notifications.DirectMessageReadState.objects.filter")` with `@patch("app_chat.notifications.ChatReadState.objects.filter")`, and additionally mock `ChatThreadParticipant`. Concretely, `test_dm_push_uses_sender_name_and_thread_data` becomes:

```python
    @patch("app_chat.notifications.enqueue_push_for_user_ids")
    @patch("app_chat.notifications.ChatReadState.objects.filter")
    @patch("app_chat.notifications.ChatThreadParticipant.objects.filter")
    def test_dm_push_uses_sender_name_and_thread_data(
        self, mock_participant_filter, mock_read_filter, mock_enqueue
    ):
        mock_participant_filter.return_value.values_list.return_value = [1, 2]
        mock_read_filter.return_value = []
        thread = SimpleNamespace(id=7)
        message = SimpleNamespace(
            id=12,
            user_id=1,
            thread=thread,
            user=SimpleNamespace(name="Alex"),
            content={"text": "Ping"},
        )

        notifications.queue_dm_message_pushes(message)

        mock_enqueue.assert_called_once_with(
            [2],
            title="Alex",
            body="Ping",
            data={
                "type": "dm",
                "thread_id": "7",
                "message_id": "12",
                "sender_name": "Alex",
            },
        )
```

Apply the same `mock_participant_filter` patch + `thread = SimpleNamespace(id=7)` (dropping `user_low_id`/`user_high_id`) + `mock_participant_filter.return_value.values_list.return_value = [1, 2]` transform to `test_dm_push_skips_when_read_cursor_ahead` and `test_dm_voice_message_preview`.

- [ ] **Step 5: Run tests**

```bash
./scripts/run_backend_tests.sh app_chat.tests.test_notifications
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app_chat/notifications.py app_chat/signals.py app_chat/admin.py app_chat/tests/test_notifications.py
git commit -m "feat(chat): rewrite notifications/signals/admin on unified schema"
```

---

### Task 12: Retire legacy models from the ORM (rename tables, keep data)

**Files:**
- Modify: `app_chat/models.py`
- Create: `app_chat/migrations/0013_retire_legacy_chat_models.py`

This removes `CourseChatMessage`, `CourseChatReadState`, `DirectMessageThread`, `DirectMessage`, `DirectMessageReadState` from Django's ORM state (no more admin/model access) **without dropping their tables** — the tables are renamed with a `legacy_` prefix so they can be restored from if needed. This also cleans up the `_v2` `related_name` suffixes added in Task 1, now that there's no naming collision.

- [ ] **Step 1: Remove old model classes from `app_chat/models.py`**

Delete the `CourseChatMessage`, `CourseChatReadState`, `DirectMessageThread`, `DirectMessage`, `DirectMessageReadState` class definitions entirely.

In the remaining `ChatMessage`, `ChatReadState` classes, drop the `_v2` suffix from `related_name`:

```python
    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="chat_messages"
    )
    ...
    deleted_by = models.ForeignKey(
        "app_auth.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="chat_messages_deleted",
    )
```

(in `ChatMessage`), and:

```python
    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="chat_read_states"
    )
```

(in `ChatReadState`).

- [ ] **Step 2: Write the migration**

```python
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_chat", "0012_finalize_chat_message_reaction"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name="CourseChatMessage"),
                migrations.DeleteModel(name="CourseChatReadState"),
                migrations.DeleteModel(name="DirectMessage"),
                migrations.DeleteModel(name="DirectMessageReadState"),
                migrations.DeleteModel(name="DirectMessageThread"),
            ],
            database_operations=[
                migrations.AlterModelTable(
                    name="CourseChatMessage", table="legacy_app_chat_coursechatmessage"
                ),
                migrations.AlterModelTable(
                    name="CourseChatReadState", table="legacy_app_chat_coursechatreadstate"
                ),
                migrations.AlterModelTable(
                    name="DirectMessage", table="legacy_app_chat_directmessage"
                ),
                migrations.AlterModelTable(
                    name="DirectMessageReadState", table="legacy_app_chat_directmessagereadstate"
                ),
                migrations.AlterModelTable(
                    name="DirectMessageThread", table="legacy_app_chat_directmessagethread"
                ),
            ],
        ),
        migrations.AlterField(
            model_name="chatmessage",
            name="user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="chat_messages",
                to="app_auth.user",
            ),
        ),
        migrations.AlterField(
            model_name="chatmessage",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="chat_messages_deleted",
                to="app_auth.user",
            ),
        ),
        migrations.AlterField(
            model_name="chatreadstate",
            name="user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="chat_read_states",
                to="app_auth.user",
            ),
        ),
    ]
```

The `SeparateDatabaseAndState` block removes the five legacy models from Django's ORM state (no more admin/model access) while renaming — not dropping — their tables at the database level. The three `AlterField` operations that follow are pure Python-level `related_name` cleanup (no `_v2` naming collision remains once the legacy models are gone from state); they don't touch the database schema.

- [ ] **Step 3: Run the full suite**

```bash
./scripts/run_backend_tests.sh app_chat.tests
python manage.py makemigrations app_chat --check --dry-run
```

Expected: PASS; "No changes detected".

- [ ] **Step 4: Verify legacy tables still exist with data (manual check)**

```bash
python manage.py dbshell
```

```sql
SELECT count(*) FROM legacy_app_chat_coursechatmessage;
SELECT count(*) FROM legacy_app_chat_directmessage;
```

Expected: row counts match what existed before migration (compare against pre-migration counts noted during Task 13's verification pass).

- [ ] **Step 5: Commit**

```bash
git add app_chat/models.py app_chat/migrations/0013_retire_legacy_chat_models.py
git commit -m "feat(chat): retire legacy chat models from ORM, rename tables for rollback window"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the entire `app_chat` suite**

```bash
./scripts/run_backend_tests.sh app_chat.tests
```

Expected: all tests PASS, zero errors.

- [ ] **Step 2: Run the broader backend suite for cross-app regressions**

```bash
./scripts/run_backend_tests.sh
```

Expected: no new failures outside `app_chat` (chat models aren't referenced by other apps per the earlier repo-wide grep for `CourseChatMessage`/`DirectMessage` usage, but this is a cheap confirmation).

- [ ] **Step 3: Manual WS smoke test**

With the backend running locally (`python manage.py runserver` + Channels/Redis if configured) and the mobile app or a WS client pointed at it:

1. Open course chat as a course member; send a message; confirm it appears via WebSocket broadcast.
2. Reply to that message; confirm the reply preview renders.
3. React to a message; confirm `reaction_changed` broadcasts and toggling the same emoji removes it.
4. Edit and delete a message; confirm `message_edited`/`message_deleted` broadcast and the HTTP list reflects tombstones.
5. Set a read cursor (`PUT .../chat/read-state`); confirm `read_receipt` broadcasts.
6. Repeat steps 1-5 for a DM thread (start a new DM via `POST /chat/dm/threads`, then use the WS endpoint).
7. Confirm push notification payloads still contain `course_id`/`thread_id`/`message_id` as before (check `app_utils.push_helpers.enqueue_push_for_user_ids` call args via logs, or a real device).

- [ ] **Step 4: Confirm row-count parity**

Before starting this plan's execution, capture baseline counts:

```sql
SELECT count(*) FROM app_chat_coursechatmessage;
SELECT count(*) FROM app_chat_directmessage;
SELECT count(*) FROM app_chat_coursechatreadstate;
SELECT count(*) FROM app_chat_directmessagereadstate;
SELECT count(*) FROM app_chat_directmessagethread;
```

After Task 12, compare against:

```sql
SELECT count(*) FROM legacy_app_chat_coursechatmessage;
SELECT count(*) FROM legacy_app_chat_directmessage;
SELECT count(*) FROM app_chat_chatmessage;              -- should equal the sum of the two legacy message tables
SELECT count(*) FROM app_chat_chatreadstate;             -- should equal the sum of the two legacy read-state tables
SELECT count(*) FROM app_chat_chatthread WHERE kind='dm'; -- should equal legacy_app_chat_directmessagethread count
```

If any count mismatches, stop and investigate before proceeding to Task 14 — do not drop legacy tables with an unexplained mismatch.

---

### Task 14 (deferred — do not execute as part of this plan): Drop legacy tables

**Not to be run immediately.** Per the approved spec (§4, step 5), keep the `legacy_app_chat_*` tables for a 1-2 week rollback window after Task 12 ships to production. When that window has passed with no rollback needed, create a follow-up migration:

```python
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("app_chat", "0013_retire_legacy_chat_models"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                DROP TABLE IF EXISTS legacy_app_chat_coursechatmessage;
                DROP TABLE IF EXISTS legacy_app_chat_coursechatreadstate;
                DROP TABLE IF EXISTS legacy_app_chat_directmessage;
                DROP TABLE IF EXISTS legacy_app_chat_directmessagereadstate;
                DROP TABLE IF EXISTS legacy_app_chat_directmessagethread;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
```

This task is intentionally not scheduled now — revisit it as its own small change once the rollback window has passed.

---

## Self-Review

**Spec coverage:** Every locked decision in the spec (§2) maps to a task — unified models (Task 1-2), full ID remap data migration (Task 3), `ChatMessageReaction` single-FK finalization (Task 4), course-thread-participants-derived-from-`UserCourse` (Task 5's `dm_participants`/`user_is_dm_participant` only ever query `ChatThreadParticipant`, never materializing course participants), API-stable serializers (Task 8), stable URLs (Task 9's `urls.py` is untouched), legacy-table-rename-not-drop rollback safety (Task 12 + deferred Task 14).

**Placeholder scan:** No "TBD"/"similar to Task N" left in the plan text itself (the one placeholder that appeared mid-draft in Task 12's migration was corrected inline with the real `AlterField` operations, not left as a stub).

**Type/name consistency check:** `toggle_chat_reaction(message=...)` (Task 6) matches its two call sites in `views.py` (Task 9, `toggle_kwargs={"message": message}`). `get_or_create_course_chat_thread` (introduced in Task 5) is used consistently in Task 9 (views), Task 10 (consumers), and the Task 6/9 test updates. `ChatReadState`/`ChatThreadParticipant` import-at-module-level in `notifications.py` (Task 11) matches the test patch targets in the same task.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-unified-chat-schema-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
