# Unified Chat Schema (Phase 2: Unified API Surface) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo note:** This repo's workspace rules forbid creating feature branches/worktrees and forbid the agent from running `git commit`/`git add` unless the user explicitly asks. Treat every "Step: Commit" below as a checkpoint description of what *would* be committed — stage/commit only if the user explicitly requests it during execution.

**Goal:** Generalize course chat and DM chat's REST views, serializers, and WebSocket consumers into a single kind-aware, `thread_id`-keyed surface (`/chat/threads/...`, `ws/chat/threads/<id>/`), while every existing course/DM endpoint and WebSocket URL keeps working unchanged as a thin wrapper (dual-support — no client changes required to ship this phase).

**Architecture:** Additive + wrapping, in one deploy (no expand-contract needed — no schema changes). Extract the few genuinely shared pieces (room-group naming, thread-kind permission dispatch, cursor message-page fetch, DM thread listing) into shared functions used by both old and new code paths (Tasks 1-2, 4, 8). Add new generic views/serializers/consumer on top of those shared pieces (Tasks 3, 5-9). Refactor legacy views/consumers to call the same shared pieces where it's a clean fit, without changing their payload shapes or URLs. Existing `app_chat/tests/*` suites must keep passing **unchanged** throughout — they are the backward-compatibility contract lock.

**Tech Stack:** Django 4.2, django-tenant-schemas (schema-per-tenant), DRF, Django Channels (WebSocket), PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-07-04-unified-chat-schema-phase2-api-design.md`

---

## Scope Check

This plan covers Phase 2 only (unified API surface, dual-support, backend-only). No mobile or web frontend code changes. Group chat (Phase 4) and legacy endpoint removal (Phase 2b) are separate, unscheduled future work — see spec §9.

## Before you start

Run tests with the project's canonical entrypoint (never bare `manage.py test`):

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_chat.tests
```

This uses local Docker Postgres (`schedjuice-test-db`, port 55432) with `--keepdb --noinput`. If it reports "PostgreSQL is not reachable", start Docker and retry.

## File structure (decomposition decisions)

| File | Role |
| --- | --- |
| `app_chat/realtime.py` | Modify: add `chat_thread_group_name()`; re-key `room_group_name`/`broadcast_to_course_chat` to `thread_id`. |
| `app_chat/services.py` | Modify: add `can_access_thread()`, `list_dm_threads_for_user()`. |
| `app_chat/message_list_helpers.py` | Modify: add `fetch_thread_messages_page()` (shared cursor fetch — home for this is the existing message-list-helpers module, not a new file, since it already owns `serialize_message_rows`). |
| `app_chat/serializers.py` | Modify: add `ChatThreadMessageSerializer`, `ChatThreadSerializer`. |
| `app_chat/views.py` | Modify: add `ChatThreadResolveView`, `ChatThreadMessageListCreateView`, `ChatThreadMessageDetailView`, `ChatThreadMessageReactionToggleView`, `ChatThreadReadStatePutView`, `ChatThreadPresenceGetView`, `ChatThreadListCreateView`; update legacy course broadcast call sites and DM thread list/create view to reuse `list_dm_threads_for_user`. |
| `app_chat/urls.py` | Modify: add 7 new URL patterns. |
| `app_chat/consumers.py` | Modify: add `_BaseChatThreadConsumer`, `ChatThreadConsumer`; refactor `CourseChatConsumer`/`DirectMessageConsumer` into thin subclasses of the base. |
| `app_ws/routing.py` | Modify: add `ws/chat/threads/<int:thread_id>/` route. |
| `app_chat/realtime_presence.py` | Modify: rename `course_id` params to `thread_id` (pure rename — the cache-key logic is already generic; only the parameter name and docstring change). |
| `app_chat/tests/test_thread_endpoints.py` | Create: parity tests for the new generic REST endpoints. |
| `app_chat/tests/test_chat_thread_group_naming_unit.py` | Create: unit test locking the shared room-group-naming invariant. |

Note on the spec: the design doc (§5) mentions a new `thread_handlers.py` module. During planning this was refined to extend the existing focused modules (`services.py`, `message_list_helpers.py`) instead of introducing a new file, since the amount of genuinely shared logic is small and each piece has an obvious existing home. This doesn't change any behavior or API surface described in the spec.

---

### Task 1: Unify WebSocket room-group naming

This is the highest-risk change (spec §4.2, §6) — it must land correctly so legacy and future new WebSocket clients on the same thread share one broadcast group. Doing it first, in isolation, makes it easy to verify before anything is layered on top.

**Files:**
- Modify: `app_chat/realtime.py`
- Modify: `app_chat/views.py:305,374,451` (course broadcast call sites — pass `thread.id`/`message.thread_id` instead of `course_id`)
- Test: `app_chat/tests/test_chat_thread_group_naming_unit.py` (create)

- [ ] **Step 1: Write the failing test**

Create `app_chat/tests/test_chat_thread_group_naming_unit.py`:

```python
"""Locks the shared WebSocket room-group naming invariant (no DB needed)."""

from __future__ import annotations

from app_chat.realtime import chat_thread_group_name, dm_room_group_name, room_group_name


class ChatThreadGroupNamingTests:
    """Plain assertions run via unittest.TestCase below (kept flat for readability)."""


import unittest


class ChatThreadGroupNamingUnitTests(unittest.TestCase):
    def test_course_room_group_name_matches_generic_thread_group_name(self):
        # A course-kind thread with id=99 must produce the same group name whether
        # reached via the legacy course-keyed helper or the generic thread-keyed one.
        self.assertEqual(
            room_group_name("xschedjuice", thread_id=99),
            chat_thread_group_name("xschedjuice", 99),
        )

    def test_dm_room_group_name_matches_generic_thread_group_name(self):
        self.assertEqual(
            dm_room_group_name("xschedjuice", 42),
            chat_thread_group_name("xschedjuice", 42),
        )

    def test_generic_group_name_format(self):
        self.assertEqual(
            chat_thread_group_name("xschedjuice", 7),
            "chat_thread_xschedjuice_7",
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_chat_thread_group_naming_unit -v 2`
Expected: FAIL — `room_group_name()` doesn't accept a `thread_id` keyword yet, and `chat_thread_group_name` doesn't exist.

- [ ] **Step 3: Add the shared naming function and re-key `room_group_name`**

In `app_chat/realtime.py`, replace lines 19-24:

```python
def chat_thread_group_name(tenant_schema: str, thread_id: int) -> str:
    """Canonical WebSocket room-group name for any unified chat thread.

    Every consumer/broadcast path (legacy course-keyed, legacy DM-keyed, and the
    new generic thread-keyed WebSocket) must resolve to this same group name for
    a given (tenant, thread) pair, or legacy and new clients on the same
    conversation will silently stop receiving each other's messages.
    """
    return f"chat_thread_{tenant_schema}_{thread_id}"


def room_group_name(tenant_schema: str, *, thread_id: int) -> str:
    """Legacy course-chat room-group name. Now just a thin alias — kept because
    ``broadcast_to_course_chat`` call sites already read naturally as course-scoped."""
    return chat_thread_group_name(tenant_schema, thread_id)


def dm_room_group_name(tenant_schema: str, thread_id: int) -> str:
    return chat_thread_group_name(tenant_schema, thread_id)
```

- [ ] **Step 4: Update `broadcast_to_course_chat` to take `thread_id`**

In `app_chat/realtime.py`, replace the `broadcast_to_course_chat` function (was lines 88-104):

```python
def broadcast_to_course_chat(tenant_schema: str, thread_id: int, payload: dict[str, Any]) -> None:
    """Notify a course thread's room with ``chat.event`` (discriminated ``event`` in payload).

    Takes the course's ``ChatThread.id`` (not ``course_id``) — see ``chat_thread_group_name``.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            room_group_name(tenant_schema, thread_id=thread_id),
            {"type": "chat.event", "payload": payload},
        )
    except Exception:
        logger.exception(
            "broadcast_to_course_chat failed tenant=%s thread=%s event=%s",
            tenant_schema,
            thread_id,
            payload.get("event"),
        )
```

- [ ] **Step 5: Update the three course broadcast call sites in `app_chat/views.py`**

`CourseChatMessageDetailView.patch` (was line 305): the enclosing method already has `fresh` (a `ChatMessage` with `.thread` selected). Change:

```python
        broadcast_to_course_chat(
            connection.schema_name,
            course_id,
            {"event": "message_edited", "data": data},
        )
```

to:

```python
        broadcast_to_course_chat(
            connection.schema_name,
            fresh.thread_id,
            {"event": "message_edited", "data": data},
        )
```

`CourseChatMessageDetailView.delete` (was line 374): the enclosing method has `message` in scope. Change:

```python
        broadcast_to_course_chat(
            connection.schema_name,
            course_id,
            {"event": "message_deleted", "data": tombstone},
        )
```

to (first add `.select_related("thread")` to the `message` query a few lines above so `message.thread_id` is cheap — the existing query is `ChatMessage.objects.filter(pk=message_id, thread__kind=ChatThreadKind.COURSE, thread__course_id=course_id).select_related("user").first()`; change `.select_related("user")` to `.select_related("user", "thread")`):

```python
        broadcast_to_course_chat(
            connection.schema_name,
            message.thread_id,
            {"event": "message_deleted", "data": tombstone},
        )
```

`CourseChatReadStatePutView.put` (was line 451): the enclosing method already has `thread` (from `get_or_create_course_chat_thread(course_id)`). Change:

```python
        broadcast_to_course_chat(
            connection.schema_name,
            course_id,
            {
                "event": "read_receipt",
                "user_id": user.id,
                "last_read_message_id": last_read_message_id,
            },
        )
```

to:

```python
        broadcast_to_course_chat(
            connection.schema_name,
            thread.id,
            {
                "event": "read_receipt",
                "user_id": user.id,
                "last_read_message_id": last_read_message_id,
            },
        )
```

`CourseChatMessageReactionToggleView.post`'s `broadcast=lambda reactions: broadcast_to_course_chat(...)` (was line 866): the enclosing method already has `message` (a `ChatMessage`, queried without `select_related("thread")` today — add it). Change the query from:

```python
        message = (
            ChatMessage.objects.filter(
                pk=message_id, thread__kind=ChatThreadKind.COURSE, thread__course_id=course_id
            )
            .prefetch_related("reactions", "reactions__created_by")
            .first()
        )
```

to:

```python
        message = (
            ChatMessage.objects.filter(
                pk=message_id, thread__kind=ChatThreadKind.COURSE, thread__course_id=course_id
            )
            .select_related("thread")
            .prefetch_related("reactions", "reactions__created_by")
            .first()
        )
```

and the broadcast lambda from:

```python
            broadcast=lambda reactions: broadcast_to_course_chat(
                connection.schema_name,
                course_id,
                {
                    "event": "reaction_changed",
                    "data": {"message_id": message.id, "reactions": reactions},
                },
            ),
```

to:

```python
            broadcast=lambda reactions: broadcast_to_course_chat(
                connection.schema_name,
                message.thread_id,
                {
                    "event": "reaction_changed",
                    "data": {"message_id": message.id, "reactions": reactions},
                },
            ),
```

- [ ] **Step 6: Run the naming test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_chat_thread_group_naming_unit -v 2`
Expected: PASS (3 tests)

- [ ] **Step 7: Run the full existing chat suite to confirm zero regressions**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: PASS, same test count as before this task (in particular `test_reactions.py::test_course_toggle_broadcasts`, which patches `broadcast_to_course_chat` and only asserts on `call_args[0][2]` — the payload, not the id argument — so it's unaffected by the `course_id` → `thread_id` argument change).

- [ ] **Step 8: Commit**

```bash
git add app_chat/realtime.py app_chat/views.py app_chat/tests/test_chat_thread_group_naming_unit.py
git commit -m "refactor(chat): unify websocket room-group naming by thread_id"
```

---

### Task 2: Add `can_access_thread` permission dispatcher and `list_dm_threads_for_user`

**Files:**
- Modify: `app_chat/services.py`
- Test: `app_chat/tests/test_thread_endpoints.py` (create — this task adds the first tests to it; later tasks extend the same file)

- [ ] **Step 1: Write the failing test**

Create `app_chat/tests/test_thread_endpoints.py`:

```python
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

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_chat.models import ChatThread
from app_chat.services import (
    can_access_thread,
    get_or_create_course_chat_thread,
    get_or_create_dm_thread,
    list_dm_threads_for_user,
    start_dm_conversation,
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available (set DATABASE_URL, e.g. local Docker on 127.0.0.1:55432)",
)
class ChatThreadServiceTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
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
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def _pick_course_member(self):
        from app_course.models import UserCourse

        with schema_context(self.schema_name):
            row = UserCourse.objects.select_related("user", "course").first()
            self.assertIsNotNone(row, "load-data should provide at least one UserCourse row")
            return row.course, row.user

    def _pick_non_member(self, course):
        from app_course.models import UserCourse

        member_ids = set(
            UserCourse.objects.filter(course=course).values_list("user_id", flat=True)
        )
        other = User.objects.exclude(pk__in=member_ids).first()
        self.assertIsNotNone(other, "load-data should provide a non-member user")
        return other

    def test_can_access_thread_true_for_course_member(self):
        with schema_context(self.schema_name):
            course, member = self._pick_course_member()
            thread = get_or_create_course_chat_thread(course.id)
            self.assertTrue(can_access_thread(member, thread))

    def test_can_access_thread_false_for_course_non_member(self):
        with schema_context(self.schema_name):
            course, _member = self._pick_course_member()
            outsider = self._pick_non_member(course)
            thread = get_or_create_course_chat_thread(course.id)
            self.assertFalse(can_access_thread(outsider, thread))

    def test_can_access_thread_true_for_dm_participant(self):
        with schema_context(self.schema_name):
            teacher_a = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())
            teacher_b = next(
                u
                for u in User.objects.iterator(chunk_size=500)
                if u.is_teacher() and u.id != teacher_a.id
            )
            thread, _ = get_or_create_dm_thread(teacher_a, teacher_b.id)
            self.assertTrue(can_access_thread(teacher_a, thread))
            self.assertTrue(can_access_thread(teacher_b, thread))

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
                if u.is_teacher() and u.id not in (teacher_a.id, teacher_b.id)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints -v 2`
Expected: FAIL — `can_access_thread` and `list_dm_threads_for_user` don't exist yet (`ImportError`).

- [ ] **Step 3: Implement `can_access_thread` and `list_dm_threads_for_user`**

In `app_chat/services.py`, update the imports at the top (add `Exists, OuterRef, Subquery` from `django.db.models`):

```python
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Exists, OuterRef, Subquery
from django.utils import timezone
```

Then add these two functions (near `user_is_dm_participant`, since they're closely related):

```python
def can_access_thread(user: User, thread: ChatThread) -> bool:
    """Single dispatch point for 'may this user read/act on this thread'.

    Course threads: membership is UserCourse-derived. DM/group threads:
    membership is the explicit ChatThreadParticipant table.
    """
    if thread.kind == ChatThreadKind.COURSE:
        return is_course_member(user, thread.course_id)
    return user_is_dm_participant(user, thread)


def list_dm_threads_for_user(user: User) -> list[ChatThread]:
    """Non-empty DM threads for ``user``, newest-activity first.

    Each returned ``ChatThread`` is annotated with ``latest_message_id`` (int or
    None) and ``_dm_unread_count`` (int), and carries a resolved ``_latest_message``
    (``ChatMessage`` or None) for serializers that want to avoid a second query.
    Shared by the legacy ``DirectMessageThreadListCreateView.get`` and the new
    generic ``GET /chat/threads?kind=dm`` — same query, different serializer.
    """
    latest_subq = (
        ChatMessage.objects.filter(thread_id=OuterRef("pk"))
        .order_by("-created_at", "-id")
        .values("id")[:1]
    )
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
        t._latest_message = latest_map.get(t.latest_message_id) if t.latest_message_id else None
    return threads
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints -v 2`
Expected: PASS (6 tests)

- [ ] **Step 5: Refactor legacy `DirectMessageThreadListCreateView.get` to use the shared query**

In `app_chat/views.py`, replace `DirectMessageThreadListCreateView.get`'s body (the whole method, currently building `latest_subq`/`has_messages`/`qs` inline):

```python
    def get(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        threads = list_dm_threads_for_user(user)
        latest_map = {
            t.latest_message_id: t._latest_message
            for t in threads
            if t.latest_message_id and t._latest_message is not None
        }
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
```

Add `list_dm_threads_for_user` to the existing `from app_chat.services import (...)` block in `views.py`.

- [ ] **Step 6: Run the full DM + reaction suites to confirm zero regressions**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: PASS, same test count as before (in particular `test_dm_permissions.py::test_get_threads_excludes_empty_threads` and `test_post_threads_with_content_creates_thread_and_message`, which exercise this exact view/query).

- [ ] **Step 7: Commit**

```bash
git add app_chat/services.py app_chat/views.py app_chat/tests/test_thread_endpoints.py
git commit -m "refactor(chat): extract can_access_thread and list_dm_threads_for_user"
```

---

### Task 3: Course chat thread resolver endpoint

**Files:**
- Modify: `app_chat/views.py`
- Modify: `app_chat/urls.py`
- Test: `app_chat/tests/test_thread_endpoints.py`

- [ ] **Step 1: Write the failing test**

Add to `ChatThreadServiceTests` in `app_chat/tests/test_thread_endpoints.py` a new test class (append to the bottom of the file):

```python
from rest_framework import status
from rest_framework.test import APIRequestFactory
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from unittest.mock import patch

from app_chat.views import ChatThreadResolveView


def _jwt_token_user(email: str):
    return type("TokenUser", (), {"id": email, "is_authenticated": True})()


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadResolveViewTests(ChatThreadServiceTests):
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_get_creates_and_returns_course_thread(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._pick_course_member()
            cid = course.id

        factory = APIRequestFactory()
        req = factory.get(f"/courses/{cid}/chat/thread")
        mock_auth.return_value = (_jwt_token_user(member.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadResolveView.as_view()(req, course_id=cid)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = res.data["data"]
        self.assertEqual(payload["kind"], "course")
        self.assertEqual(payload["course"], cid)
        with schema_context(self.schema_name):
            thread = get_or_create_course_chat_thread(cid)
        self.assertEqual(payload["id"], thread.id)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_get_forbidden_for_non_member(self, mock_auth):
        with schema_context(self.schema_name):
            course, _member = self._pick_course_member()
            outsider = self._pick_non_member(course)
            cid = course.id

        factory = APIRequestFactory()
        req = factory.get(f"/courses/{cid}/chat/thread")
        mock_auth.return_value = (_jwt_token_user(outsider.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadResolveView.as_view()(req, course_id=cid)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints.ChatThreadResolveViewTests -v 2`
Expected: FAIL — `ChatThreadResolveView` doesn't exist (`ImportError`).

- [ ] **Step 3: Implement `ChatThreadResolveView`**

In `app_chat/views.py`, add after `CourseChatPresenceGetView`:

```python
class ChatThreadResolveView(ChatApiView):
    """Get-or-create the ChatThread for a course. GET and POST behave identically
    (both get-or-create) — POST is offered for clients that prefer not to use GET
    for a mutating (thread-creating) call."""

    def _resolve(self, request: Request, course_id: int):
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
        thread = get_or_create_course_chat_thread(course_id)
        return BaseView.send_response(
            False,
            "success",
            {"data": {"id": thread.id, "kind": thread.kind, "course": thread.course_id}},
            status=status.HTTP_200_OK,
        )

    def get(self, request: Request, course_id: int):
        return self._resolve(request, course_id)

    def post(self, request: Request, course_id: int):
        return self._resolve(request, course_id)
```

- [ ] **Step 4: Add the URL pattern**

In `app_chat/urls.py`, add after the `course-chat-presence` pattern:

```python
    path(
        "courses/<int:course_id>/chat/thread",
        views.ChatThreadResolveView.as_view(),
        name="chat-thread-resolve",
    ),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints -v 2`
Expected: PASS (all tests so far)

- [ ] **Step 6: Commit**

```bash
git add app_chat/views.py app_chat/urls.py app_chat/tests/test_thread_endpoints.py
git commit -m "feat(chat): add course chat thread resolver endpoint"
```

---

### Task 4: Extract shared cursor message-page fetch

**Files:**
- Modify: `app_chat/message_list_helpers.py`
- Modify: `app_chat/views.py` (refactor `DirectMessageListCreateView.get` and the `before_id` branch of `CourseChatMessageListView.get` to call it)
- Test: `app_chat/tests/test_thread_endpoints.py`

- [ ] **Step 1: Write the failing test**

Append to `app_chat/tests/test_thread_endpoints.py`:

```python
from app_chat.message_list_helpers import fetch_thread_messages_page
from app_chat.models import ChatMessage
from app_chat.serializers import DirectMessageSerializer


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class FetchThreadMessagesPageTests(ChatThreadServiceTests):
    def test_returns_latest_messages_and_has_more_flag(self):
        with schema_context(self.schema_name):
            course, member = self._pick_course_member()
            thread = get_or_create_course_chat_thread(course.id)
            for i in range(3):
                ChatMessage.objects.create(
                    thread=thread, user=member, content={"text": f"m{i}", "mentions": []}
                )

        factory = APIRequestFactory()
        req = factory.get(f"/chat/threads/{thread.id}/messages?size=2")
        with schema_context(self.schema_name):
            rows, has_more = fetch_thread_messages_page(
                req, thread, DirectMessageSerializer
            )
        self.assertEqual(len(rows), 2)
        self.assertTrue(has_more)
        self.assertEqual(rows[-1]["content"]["text"], "m2")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints.FetchThreadMessagesPageTests -v 2`
Expected: FAIL — `fetch_thread_messages_page` doesn't exist.

- [ ] **Step 3: Implement `fetch_thread_messages_page`**

In `app_chat/message_list_helpers.py`, add the necessary imports and the new function:

```python
"""Shared HTTP list serialization for course chat and DM messages."""

from __future__ import annotations

from rest_framework.request import Request

from app_chat.attachment_batch import attachment_context_for_messages
from app_chat.message_cursor import (
    CURSOR_MESSAGE_PAGE_SIZE,
    DEFAULT_MESSAGE_LIST_SIZE,
    fetch_latest_messages,
    fetch_older_messages,
    parse_before_id,
    parse_message_list_size,
)


def serialize_message_rows(serializer_class, messages, request: Request, **extra_context):
    context = {
        "request": request,
        **attachment_context_for_messages(messages),
        **extra_context,
    }
    return serializer_class(messages, many=True, context=context)


def fetch_thread_messages_page(request: Request, thread, serializer_class) -> tuple[list, bool]:
    """Cursor-paginated message fetch shared by every thread-scoped message list
    endpoint (legacy DM, legacy course's before_id branch, and the new generic
    endpoint). Returns ``(serialized_rows, has_more)`` — callers build their own
    response envelope since the legacy course/DM shapes differ slightly.
    """
    from app_chat.models import ChatMessage

    queryset = (
        ChatMessage.objects.filter(thread_id=thread.id)
        .select_related("user", "thread", "reply_to", "reply_to__user")
        .prefetch_related("reactions", "reactions__created_by")
    )
    before_id = parse_before_id(request)
    if before_id is not None:
        size = parse_message_list_size(request, default=CURSOR_MESSAGE_PAGE_SIZE)
        rows = fetch_older_messages(queryset, before_id, size)
    else:
        size = parse_message_list_size(request, default=DEFAULT_MESSAGE_LIST_SIZE)
        rows = fetch_latest_messages(queryset, size)
    serialized = serialize_message_rows(serializer_class, rows, request)
    return serialized.data, len(rows) == size
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints.FetchThreadMessagesPageTests -v 2`
Expected: PASS

- [ ] **Step 5: Refactor `DirectMessageListCreateView.get` to use it**

In `app_chat/views.py`, replace the body of `DirectMessageListCreateView.get` from `queryset = (...)` through the `serialized = serialize_message_rows(...)` line with:

```python
        results, has_more = fetch_thread_messages_page(
            request, thread, serializers.DirectMessageSerializer
        )
        return BaseView.send_response(
            False,
            "success",
            {"data": {"results": results, "has_more": has_more}},
            status=status.HTTP_200_OK,
        )
```

(remove the now-unused `queryset = (...)`, `before_id = ...` branching, and `serialized = serialize_message_rows(...)` lines it replaces). Add `fetch_thread_messages_page` to the `from app_chat.message_list_helpers import serialize_message_rows` import line (rename it to `from app_chat.message_list_helpers import fetch_thread_messages_page, serialize_message_rows` — keep `serialize_message_rows` since other views still use it directly).

- [ ] **Step 6: Refactor `CourseChatMessageListView.get`'s `before_id` branch to use it**

In `app_chat/views.py`, replace the `if before_id is not None:` branch inside `CourseChatMessageListView.get` (the block building `queryset`, `size`, `rows`, `serialized_data`, `body`) with:

```python
        before_id = parse_before_id(request)
        if before_id is not None:
            results, has_more = fetch_thread_messages_page(request, thread, self.serializer)
            body = {"data": results, "has_more": has_more}
            return self.send_response(
                False,
                "success",
                body,
                status=status.HTTP_200_OK,
            )
```

This preserves the exact legacy envelope (`{"data": [...], "has_more": bool}` — a flat array, unlike DM's nested `{"data": {"results": [...], ...}}`).

- [ ] **Step 7: Run the full chat suite to confirm zero regressions**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: PASS, same test count as before (in particular `test_message_cursor_pagination.py`).

- [ ] **Step 8: Commit**

```bash
git add app_chat/message_list_helpers.py app_chat/views.py app_chat/tests/test_thread_endpoints.py
git commit -m "refactor(chat): extract fetch_thread_messages_page shared cursor fetch"
```

---

### Task 5: New generic serializers

**Files:**
- Modify: `app_chat/serializers.py`
- Test: `app_chat/tests/test_thread_endpoints.py`

- [ ] **Step 1: Write the failing test**

Append to `app_chat/tests/test_thread_endpoints.py`:

```python
from app_chat.serializers import ChatThreadMessageSerializer, ChatThreadSerializer


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadGenericSerializerTests(ChatThreadServiceTests):
    def test_message_serializer_exposes_nested_thread_object(self):
        with schema_context(self.schema_name):
            course, member = self._pick_course_member()
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread, user=member, content={"text": "hi", "mentions": []}
            )
            data = ChatThreadMessageSerializer(msg, context={"request": None}).data
        self.assertEqual(
            data["thread"], {"id": thread.id, "kind": "course", "course": course.id}
        )
        self.assertNotIn("course", data)

    def test_thread_serializer_exposes_participants_array(self):
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
            thread = ChatThread.objects.prefetch_related("participants__user").get(pk=thread.id)
            data = ChatThreadSerializer(
                thread, context={"request": None, "viewer": teacher_a}
            ).data
        ids = {p["id"] for p in data["participants"]}
        self.assertEqual(ids, {teacher_a.id, teacher_b.id})
        self.assertNotIn("user_low", data)
        self.assertNotIn("user_high", data)
        self.assertNotIn("other_participant", data)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints.ChatThreadGenericSerializerTests -v 2`
Expected: FAIL — `ChatThreadMessageSerializer`/`ChatThreadSerializer` don't exist.

- [ ] **Step 3: Implement the two serializers**

In `app_chat/serializers.py`, add after `DirectMessageSerializer`:

```python
class ChatThreadMessageSerializer(BaseChatMessageSerializer):
    """New unified message contract: nested self-describing ``thread`` object
    instead of a bare ``course`` or ``thread`` id (see Phase 2 spec §3.3)."""

    thread = serializers.SerializerMethodField(read_only=True)

    class Meta(ChatMessageSerializer.Meta):
        fields = tuple(f for f in ChatMessageSerializer.Meta.fields if f != "thread") + ("thread",)
        read_only_fields = fields

    def get_thread(self, obj):
        return {"id": obj.thread_id, "kind": obj.thread.kind, "course": obj.thread.course_id}
```

Then add after `DirectMessageThreadSerializer`:

```python
class ChatThreadSerializer(BaseModelSerializer):
    """New unified thread contract (kind=dm today): group-ready ``participants``
    array instead of DM-only ``user_low``/``user_high``/``other_participant``."""

    participants = serializers.SerializerMethodField(read_only=True)
    last_message = serializers.SerializerMethodField(read_only=True)
    unread_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ChatThread
        fields = (
            "id",
            "kind",
            "created_at",
            "updated_at",
            "participants",
            "last_message",
            "unread_count",
        )
        read_only_fields = fields

    def _profile_image_url(self, user):
        request = self.context.get("request")
        if not getattr(user, "profile_image", None):
            return None
        url = user.profile_image.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_participants(self, obj):
        users = [p.user for p in obj.participants.all()]
        return [
            {
                "id": u.id,
                "name": getattr(u, "name", "") or "",
                "email": getattr(u, "email", "") or "",
                "profile_image": self._profile_image_url(u),
            }
            for u in users
        ]

    def get_last_message(self, obj):
        mid = getattr(obj, "latest_message_id", None)
        if mid is None:
            return None
        msg = getattr(obj, "_latest_message", None)
        if msg is None:
            latest_map = self.context.get("latest_messages_by_id") or {}
            msg = latest_map.get(mid)
        if msg is None:
            return None
        data = ChatThreadMessageSerializer(msg, context=self.context).data
        return {
            "id": data["id"],
            "created_at": data["created_at"],
            "user": {"id": msg.user_id, "name": getattr(msg.user, "name", "")},
            "content": data["content"],
        }

    def get_unread_count(self, obj):
        return getattr(obj, "_dm_unread_count", 0)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints.ChatThreadGenericSerializerTests -v 2`
Expected: PASS

- [ ] **Step 5: Run the full chat suite to confirm zero regressions**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: PASS, same test count as before.

- [ ] **Step 6: Commit**

```bash
git add app_chat/serializers.py app_chat/tests/test_thread_endpoints.py
git commit -m "feat(chat): add generic ChatThreadMessageSerializer and ChatThreadSerializer"
```

---

### Task 6: Generic message list/create endpoint

**Files:**
- Modify: `app_chat/views.py`
- Modify: `app_chat/urls.py`
- Test: `app_chat/tests/test_thread_endpoints.py`

- [ ] **Step 1: Write the failing test**

Append to `app_chat/tests/test_thread_endpoints.py`:

```python
from app_chat.views import ChatThreadMessageListCreateView


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadMessageListCreateViewTests(ChatThreadServiceTests):
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_get_course_thread_messages(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._pick_course_member()
            thread = get_or_create_course_chat_thread(course.id)
            ChatMessage.objects.create(
                thread=thread, user=member, content={"text": "hello", "mentions": []}
            )
            thread_id = thread.id

        factory = APIRequestFactory()
        req = factory.get(f"/chat/threads/{thread_id}/messages")
        mock_auth.return_value = (_jwt_token_user(member.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageListCreateView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data["data"]["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["thread"]["kind"], "course")

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_course_thread_message_returns_405(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._pick_course_member()
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
            course, _member = self._pick_course_member()
            outsider = self._pick_non_member(course)
            thread = get_or_create_course_chat_thread(course.id)
            thread_id = thread.id

        factory = APIRequestFactory()
        req = factory.get(f"/chat/threads/{thread_id}/messages")
        mock_auth.return_value = (_jwt_token_user(outsider.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageListCreateView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints.ChatThreadMessageListCreateViewTests -v 2`
Expected: FAIL — `ChatThreadMessageListCreateView` doesn't exist.

- [ ] **Step 3: Implement `ChatThreadMessageListCreateView`**

In `app_chat/views.py`, add after `ChatThreadResolveView`:

```python
class ChatThreadMessageListCreateView(ChatApiView):
    """GET history / POST create for any unified chat thread, by thread_id."""

    def get(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None:
            return BaseView.send_response(
                True, "not_found", {"details": "Thread not found"}, status=404
            )
        if not can_access_thread(user, thread):
            return BaseView.send_response(True, "forbidden", {"details": "Forbidden"}, status=403)

        results, has_more = fetch_thread_messages_page(
            request, thread, serializers.ChatThreadMessageSerializer
        )
        return BaseView.send_response(
            False,
            "success",
            {"data": {"results": results, "has_more": has_more}},
            status=status.HTTP_200_OK,
        )

    def post(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None:
            return BaseView.send_response(
                True, "not_found", {"details": "Thread not found"}, status=404
            )
        if thread.kind == ChatThreadKind.COURSE:
            return BaseView.send_response(
                True,
                "method_not_allowed",
                {"details": "POST not allowed; send messages via WebSocket."},
                status=status.HTTP_405_METHOD_NOT_ALLOWED,
            )
        if not can_access_thread(user, thread):
            return BaseView.send_response(True, "forbidden", {"details": "Forbidden"}, status=403)
        if thread.kind == ChatThreadKind.DM and not dm_thread_pair_policy_allows(thread):
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "Direct messages are not allowed for this conversation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reply_to_id = request.data.get("reply_to_id")
        row, err = create_dm_message(
            thread_id, user, request.data.get("content"), reply_to_id=reply_to_id
        )
        if err:
            status_code = (
                status.HTTP_403_FORBIDDEN if err == "forbidden" else status.HTTP_400_BAD_REQUEST
            )
            err_key = "forbidden" if err == "forbidden" else "bad_request"
            return BaseView.send_response(True, err_key, {"details": err}, status=status_code)

        serialized = serializers.ChatThreadMessageSerializer(
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
```

Add `can_access_thread` and `fetch_thread_messages_page` to the existing import blocks at the top of `views.py` (`from app_chat.services import (...)` and `from app_chat.message_list_helpers import (...)` respectively).

- [ ] **Step 4: Add the URL pattern**

In `app_chat/urls.py`, add:

```python
    path(
        "chat/threads/<int:thread_id>/messages",
        views.ChatThreadMessageListCreateView.as_view(),
        name="chat-thread-message-list-create",
    ),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints -v 2`
Expected: PASS (all tests so far)

- [ ] **Step 6: Run the full chat suite to confirm zero regressions**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: PASS, same test count as before.

- [ ] **Step 7: Commit**

```bash
git add app_chat/views.py app_chat/urls.py app_chat/tests/test_thread_endpoints.py
git commit -m "feat(chat): add generic chat/threads/<id>/messages list+create endpoint"
```

---

### Task 7: Generic message detail, reaction toggle, read-state, and presence endpoints

These four are mechanical, thread_id-keyed generalizations of existing per-kind logic that's already dispatched by `can_access_thread`/`ChatThreadKind`. Grouped into one task since each is a small, independent, analogous view.

**Files:**
- Modify: `app_chat/views.py`
- Modify: `app_chat/urls.py`
- Modify: `app_chat/realtime_presence.py` (rename `course_id` params to `thread_id` — pure rename, cache-key logic is already generic)
- Test: `app_chat/tests/test_thread_endpoints.py`

- [ ] **Step 1: Rename `course_id` to `thread_id` in `app_chat/realtime_presence.py`**

Replace every `course_id` parameter name with `thread_id` in `_presence_map_key`, `_typing_map_key`, `_typing_throttle_key`, `touch_presence`, `clear_presence`, `online_user_ids`, `set_typing`, `typing_user_ids`, `should_broadcast_typing_event` (9 functions, purely renaming the parameter — the f-string bodies like `f"chat_presence:{schema}:{course_id}"` become `f"chat_presence:{schema}:{thread_id}"`; no other logic changes). This is safe because the cache keys are ephemeral (90s/5s TTL) — there's no historical data to migrate, old-format keys simply expire.

- [ ] **Step 2: Update the two existing callers to pass thread ids**

In `app_chat/consumers.py`, `CourseChatConsumer.connect`/`disconnect`/`receive_json` currently call `touch_presence`/`clear_presence`/`set_typing`/`should_broadcast_typing_event` with `self.course_id`. Leave these calls as-is for now — Task 9 replaces this whole consumer, and until then `self.course_id` continues to be numerically the course id, which is *not* the same thing as the thread id. To avoid a behavior change before Task 9 lands, in this step only rename the keyword usage at call sites to stay positional (no code change needed yet since parameters are positional, not keyword, in every existing call site — verify with a search):

Run: `grep -n "touch_presence\|clear_presence\|set_typing\|should_broadcast_typing_event\|typing_user_ids\|online_user_ids" app_chat/consumers.py app_chat/views.py`

Confirm every call passes `self.course_id`/`course_id` positionally (not as `course_id=`). If so, no call-site changes are needed in this step — the rename in Step 1 is purely cosmetic until Task 9 re-points these calls at the resolved thread id.

- [ ] **Step 3: Write the failing tests for the four new views**

Append to `app_chat/tests/test_thread_endpoints.py`:

```python
from app_chat.views import (
    ChatThreadMessageDetailView,
    ChatThreadMessageReactionToggleView,
    ChatThreadPresenceGetView,
    ChatThreadReadStatePutView,
)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadMessageDetailViewTests(ChatThreadServiceTests):
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
class ChatThreadReactionAndReadStateAndPresenceTests(ChatThreadServiceTests):
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_toggle_reaction_on_course_thread_message(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._pick_course_member()
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread, user=member, content={"text": "hi", "mentions": []}
            )
            thread_id, message_id = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{thread_id}/messages/{message_id}/reactions",
            {"emoji": "👍"},
            format="json",
        )
        mock_auth.return_value = (_jwt_token_user(member.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadMessageReactionToggleView.as_view()(
                req, thread_id=thread_id, message_id=message_id
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["data"]["reactions"]), 1)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_put_read_state_on_course_thread(self, mock_auth):
        with schema_context(self.schema_name):
            course, member = self._pick_course_member()
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
        mock_auth.return_value = (_jwt_token_user(member.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadReadStatePutView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_presence_empty_for_dm_thread(self, mock_auth):
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
        req = factory.get(f"/chat/threads/{thread_id}/presence")
        mock_auth.return_value = (_jwt_token_user(teacher_a.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadPresenceGetView.as_view()(req, thread_id=thread_id)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["online_user_ids"], [])

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_presence_rekey_legacy_heartbeat_visible_via_new_endpoint(self, mock_auth):
        """Spec §8 'presence re-keying test': a heartbeat recorded by thread_id
        (what the legacy course WS consumer does after Task 9's rename) must be
        visible through the new generic presence endpoint, proving both paths
        share one cache key format keyed by thread_id (not course_id)."""
        from app_chat.realtime_presence import touch_presence

        with schema_context(self.schema_name):
            course, member = self._pick_course_member()
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints -v 2`
Expected: FAIL — the four view classes don't exist yet.

- [ ] **Step 5: Implement the four views**

In `app_chat/views.py`, add after `ChatThreadMessageListCreateView`:

```python
class ChatThreadMessageDetailView(ChatApiView):
    """PATCH (edit own) or DELETE (soft-delete) a message on any unified thread."""

    def patch(self, request: Request, thread_id: int, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        message = (
            ChatMessage.objects.filter(pk=message_id, thread_id=thread_id)
            .select_related("thread", "user", "reply_to", "reply_to__user")
            .first()
        )
        if message is None or not can_access_thread(user, message.thread):
            return BaseView.send_response(True, "forbidden", {"details": "Forbidden"}, status=403)
        if message.user_id != user.id or message.deleted_at is not None:
            return BaseView.send_response(
                True, "forbidden", {"details": "You cannot edit this message"}, status=403
            )
        try:
            normalized_content = validate_chat_content_payload(request.data.get("content"))
            validate_chat_attachment_refs(user, normalized_content.get("attachments", []))
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
        data = serializers.ChatThreadMessageSerializer(message, context={"request": request}).data
        return BaseView.send_response(False, "success", {"data": data}, status=status.HTTP_200_OK)

    def delete(self, request: Request, thread_id: int, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        message = (
            ChatMessage.objects.filter(pk=message_id, thread_id=thread_id)
            .select_related("thread", "user")
            .first()
        )
        if message is None or not can_access_thread(user, message.thread):
            return BaseView.send_response(True, "forbidden", {"details": "Forbidden"}, status=403)
        if message.deleted_at is not None:
            return BaseView.send_response(
                False,
                "success",
                {
                    "data": {
                        "id": message.id,
                        "deleted_at": message.deleted_at.isoformat(),
                        "deleted_by_id": message.deleted_by_id,
                    }
                },
                status=status.HTTP_200_OK,
            )
        if message.user_id == user.id:
            message.deleted_at = timezone.now()
            message.deleted_by = None
        elif message.thread.kind == ChatThreadKind.COURSE and can_moderate_chat(
            user, message.thread.course_id
        ):
            message.deleted_at = timezone.now()
            message.deleted_by = user
        else:
            return BaseView.send_response(
                True, "forbidden", {"details": "You cannot delete this message"}, status=403
            )
        message.save(update_fields=["deleted_at", "deleted_by", "updated_at"])
        data = {
            "id": message.id,
            "deleted_at": message.deleted_at.isoformat(),
            "deleted_by_id": message.deleted_by_id,
        }
        if message.thread.kind == ChatThreadKind.COURSE:
            broadcast_to_course_chat(
                connection.schema_name,
                message.thread_id,
                {"event": "message_deleted", "data": data},
            )
        return BaseView.send_response(False, "success", {"data": data}, status=status.HTTP_200_OK)


class ChatThreadMessageReactionToggleView(ChatApiView):
    """POST toggle reaction on a message on any unified thread."""

    def post(self, request: Request, thread_id: int, message_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        message = (
            ChatMessage.objects.filter(pk=message_id, thread_id=thread_id)
            .select_related("thread")
            .prefetch_related("reactions", "reactions__created_by")
            .first()
        )
        if message is None or not can_access_thread(user, message.thread):
            return BaseView.send_response(True, "forbidden", {"details": "Forbidden"}, status=403)

        def _broadcast(reactions):
            payload = {
                "event": "reaction_changed",
                "data": {"message_id": message.id, "reactions": reactions},
            }
            if message.thread.kind == ChatThreadKind.COURSE:
                broadcast_to_course_chat(connection.schema_name, message.thread_id, payload)
            else:
                broadcast_to_dm_chat(connection.schema_name, message.thread_id, payload)

        return handle_chat_reaction_toggle_post(
            request,
            message=message,
            toggle_kwargs={"message": message},
            broadcast=_broadcast,
        )


class ChatThreadReadStatePutView(ChatApiView):
    """PUT monotonic read cursor for the current user on any unified thread."""

    def put(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None or not can_access_thread(user, thread):
            return BaseView.send_response(True, "forbidden", {"details": "Forbidden"}, status=403)

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
        existing = ChatReadState.objects.filter(user=user, thread=thread).first()
        if (
            message_id is not None
            and existing is not None
            and existing.last_read_message_id is not None
            and message_id < existing.last_read_message_id
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
        state, _ = ChatReadState.objects.get_or_create(user=user, thread=thread)
        state.last_read_message_id = message_id
        state.last_read_at = timezone.now()
        state.save(update_fields=["last_read_message_id", "last_read_at", "updated_at"])
        data = serializers.ChatReadStateSerializer(state, context={"request": request}).data
        if thread.kind == ChatThreadKind.COURSE:
            broadcast_to_course_chat(
                connection.schema_name,
                thread.id,
                {
                    "event": "read_receipt",
                    "user_id": user.id,
                    "last_read_message_id": message_id,
                },
            )
        return BaseView.send_response(False, "success", {"data": data}, status=status.HTTP_200_OK)


class ChatThreadPresenceGetView(ChatApiView):
    """GET online member user ids for any unified thread (empty for kind=dm,
    which never sends presence heartbeats)."""

    def get(self, request: Request, thread_id: int):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None or not can_access_thread(user, thread):
            return BaseView.send_response(True, "forbidden", {"details": "Forbidden"}, status=403)
        ids = online_user_ids(connection.schema_name, thread_id)
        return BaseView.send_response(
            False, "success", {"data": {"online_user_ids": ids}}, status=status.HTTP_200_OK
        )
```

Add `broadcast_to_dm_chat` (already imported), `can_moderate_chat` (already imported), and `ChatReadStateSerializer` reference (already accessible via `serializers.ChatReadStateSerializer`, already defined in `serializers.py`) — no new imports beyond what Task 6 already added.

- [ ] **Step 6: Add the three URL patterns**

In `app_chat/urls.py`, add:

```python
    path(
        "chat/threads/<int:thread_id>/messages/<int:message_id>",
        views.ChatThreadMessageDetailView.as_view(),
        name="chat-thread-message-detail",
    ),
    path(
        "chat/threads/<int:thread_id>/messages/<int:message_id>/reactions",
        views.ChatThreadMessageReactionToggleView.as_view(),
        name="chat-thread-message-reactions",
    ),
    path(
        "chat/threads/<int:thread_id>/read-state",
        views.ChatThreadReadStatePutView.as_view(),
        name="chat-thread-read-state",
    ),
    path(
        "chat/threads/<int:thread_id>/presence",
        views.ChatThreadPresenceGetView.as_view(),
        name="chat-thread-presence",
    ),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints -v 2`
Expected: PASS (all tests so far)

- [ ] **Step 8: Run the full chat suite to confirm zero regressions**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: PASS, same test count as before this task.

- [ ] **Step 9: Commit**

```bash
git add app_chat/views.py app_chat/urls.py app_chat/realtime_presence.py app_chat/tests/test_thread_endpoints.py
git commit -m "feat(chat): add generic message detail, reaction, read-state, presence endpoints"
```

---

### Task 8: Generic thread create/list endpoint

**Files:**
- Modify: `app_chat/views.py`
- Modify: `app_chat/urls.py`
- Test: `app_chat/tests/test_thread_endpoints.py`

- [ ] **Step 1: Write the failing test**

Append to `app_chat/tests/test_thread_endpoints.py`:

```python
from app_chat.views import ChatThreadListCreateView


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ChatThreadListCreateViewTests(ChatThreadServiceTests):
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
    def test_get_lists_dm_threads(self, mock_auth):
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
            thread_id = thread.id

        factory = APIRequestFactory()
        req = factory.get("/chat/threads?kind=dm")
        mock_auth.return_value = (_jwt_token_user(teacher_a.email), None)
        with schema_context(self.schema_name):
            res = ChatThreadListCreateView.as_view()(req)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data["data"]}
        self.assertIn(thread_id, ids)

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints.ChatThreadListCreateViewTests -v 2`
Expected: FAIL — `ChatThreadListCreateView` doesn't exist.

- [ ] **Step 3: Implement `ChatThreadListCreateView`**

In `app_chat/views.py`, add after `ChatThreadPresenceGetView`:

```python
class ChatThreadListCreateView(ChatApiView):
    """Generic thread list/create. Only kind=dm is operational today; kind=group
    is reserved for Phase 4, and kind=course threads are only created via
    ChatThreadResolveView (courses/<id>/chat/thread)."""

    def get(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        kind = request.query_params.get("kind")
        if kind != ChatThreadKind.DM:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "Unsupported or missing 'kind'; only 'dm' is supported today."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        threads = list_dm_threads_for_user(user)
        data = serializers.ChatThreadSerializer(
            threads, many=True, context={"request": request, "viewer": user}
        ).data
        return BaseView.send_response(False, "success", {"data": data}, status=status.HTTP_200_OK)

    def post(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )
        kind = request.data.get("kind")
        if kind == ChatThreadKind.COURSE:
            return BaseView.send_response(
                True,
                "bad_request",
                {
                    "details": "Course threads are created via GET/POST "
                    "courses/<course_id>/chat/thread, not this endpoint."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if kind != ChatThreadKind.DM:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "Unsupported 'kind'; only 'dm' is supported today."},
                status=status.HTTP_400_BAD_REQUEST,
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
            ChatThread.objects.prefetch_related("participants__user").filter(pk=thread.pk).first()
        )
        thread_data = serializers.ChatThreadSerializer(
            thread, context={"request": request, "viewer": user}
        ).data
        message_data = serializers.ChatThreadMessageSerializer(
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
            {"data": {"thread": thread_data, "message": message_data, "created": created}},
            status=status.HTTP_201_CREATED,
        )
```

- [ ] **Step 4: Add the URL pattern**

In `app_chat/urls.py`, add:

```python
    path(
        "chat/threads",
        views.ChatThreadListCreateView.as_view(),
        name="chat-thread-list-create",
    ),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints -v 2`
Expected: PASS (all tests so far)

- [ ] **Step 6: Run the full chat suite to confirm zero regressions**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: PASS, same test count as before this task.

- [ ] **Step 7: Commit**

```bash
git add app_chat/views.py app_chat/urls.py app_chat/tests/test_thread_endpoints.py
git commit -m "feat(chat): add generic chat/threads list+create endpoint"
```

---

### Task 9: Unify WebSocket consumers

This is the second highest-risk task (spec §4). The legacy consumers must end up byte-for-byte behaviorally identical to today, just implemented via a shared base class, and joining the room group established in Task 1.

**Files:**
- Modify: `app_chat/consumers.py` (near-full rewrite of the consumer classes; the module-level `@database_sync_to_async` helper functions are extended, not replaced)
- Modify: `app_ws/routing.py`

- [ ] **Step 1: Add the thread-generic async helpers**

In `app_chat/consumers.py`, add after `create_chat_message` (keep `create_chat_message` — it's about to be refactored in Step 2 to delegate to a new shared sync helper, not removed):

```python
from app_chat.services import can_access_thread


def _create_message_on_thread_sync(thread, user, content, schema_name, reply_to_id=None):
    """Assumes the caller is already inside ``schema_context(schema_name)``."""
    if thread.kind == ChatThreadKind.COURSE:
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
            normalized = validate_chat_content_payload(content)
            validate_chat_attachment_refs(user, normalized.get("attachments", []))
            validate_mention_user_ids(
                thread.course_id,
                mention_user_ids_from_content_mentions(normalized.get("mentions", [])),
            )
        except DjangoValidationError:
            return None, "mentions_invalid"
        msg = ChatMessage.objects.create(
            thread=thread, user=user, content=normalized, reply_to=reply_to
        )
        msg = ChatMessage.objects.select_related("thread", "user").get(pk=msg.pk)
        queue_course_chat_message_pushes(msg)
        invalidate_course_chat_list_cache(schema_name, thread.course_id)
        return msg, None

    return create_dm_message_service(thread.id, user, content, reply_to_id)


@database_sync_to_async
def create_message_on_thread(thread_id, user, content, schema_name, reply_to_id=None):
    with schema_context(schema_name):
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None:
            return None, "thread_not_found"
        return _create_message_on_thread_sync(
            thread, user, content, schema_name, reply_to_id=reply_to_id
        )


@database_sync_to_async
def resolve_course_thread_id(course_id, schema_name):
    with schema_context(schema_name):
        return get_or_create_course_chat_thread(course_id).id


@database_sync_to_async
def check_thread_access(thread_id, user, schema_name):
    if not user or user.is_anonymous:
        return None, False
    with schema_context(schema_name):
        thread = ChatThread.objects.filter(pk=thread_id).first()
        if thread is None:
            return None, False
        return thread, can_access_thread(user, thread)


@database_sync_to_async
def build_new_thread_message_broadcast_payload(message_id, schema_name, client_message_id=None):
    with schema_context(schema_name):
        message = (
            ChatMessage.objects.select_related("thread", "user", "reply_to", "reply_to__user")
            .prefetch_related("reactions", "reactions__created_by")
            .get(pk=message_id)
        )
        if message.thread.kind == ChatThreadKind.COURSE:
            return build_message_broadcast_payload(
                message,
                serializer_class=CourseChatMessageSerializer,
                client_message_id=client_message_id,
            )
        return build_message_broadcast_payload(
            message,
            serializer_class=DirectMessageSerializer,
            client_message_id=client_message_id,
            include_thread_id=True,
        )
```

Update the imports at the top of `app_chat/consumers.py` to add `DirectMessageSerializer` (add to the existing `from app_chat.serializers import CourseChatMessageSerializer` line — change it to `from app_chat.serializers import CourseChatMessageSerializer, DirectMessageSerializer`) and `chat_thread_group_name` (add `from app_chat.realtime import chat_thread_group_name`).

- [ ] **Step 2: Refactor `create_chat_message` to delegate to the shared sync helper**

Replace the existing `create_chat_message` function body:

```python
@database_sync_to_async
def create_chat_message(course_id, user, content, schema_name, reply_to_id=None):
    with schema_context(schema_name):
        thread = get_or_create_course_chat_thread(course_id)
        return _create_message_on_thread_sync(
            thread, user, content, schema_name, reply_to_id=reply_to_id
        )
```

- [ ] **Step 3: Replace the two consumer classes with a shared base + three thin subclasses**

Replace `CourseChatConsumer` and `DirectMessageConsumer` (and the now-unused `build_new_chat_broadcast_payload`/`build_new_dm_broadcast_payload`/`check_course_membership`/`check_dm_thread_membership`/`create_dm_message` module-level helpers stay — `create_dm_message` is still used by `_create_message_on_thread_sync`'s DM branch; the two `build_new_*_broadcast_payload` functions and the two `check_*_membership` functions become unused and should be removed since nothing calls them anymore) with:

```python
class _BaseChatThreadConsumer(AsyncJsonWebsocketConsumer):
    """Shared connect/receive/broadcast logic for any unified chat thread.

    Subclasses implement ``_resolve_thread_id`` to translate their URL kwargs
    into a concrete ``ChatThread`` id before the shared membership check runs.
    Course-only features (typing, heartbeat/presence, live read-receipt
    broadcasts triggered elsewhere) are gated on ``self.thread_kind`` rather
    than on which subclass/URL was used to connect — matching today's behavior
    where DM never sent these regardless of which future URL reaches it.
    """

    async def _resolve_thread_id(self) -> int | None:
        raise NotImplementedError

    async def connect(self):
        self.tenant_schema = self.scope.get("tenant_schema")
        self.user = self.scope.get("user")

        if not self.tenant_schema:
            await self.close(code=4001)
            return
        if not self.user or isinstance(self.user, AnonymousUser):
            await self.close(code=4002)
            return

        thread_id = await self._resolve_thread_id()
        if thread_id is None:
            await self.close(code=4004)
            return

        thread, allowed = await check_thread_access(thread_id, self.user, self.tenant_schema)
        if not allowed:
            await self.close(code=4003)
            return

        self.thread_id = thread_id
        self.thread_kind = thread.kind
        self.room_group_name = chat_thread_group_name(self.tenant_schema, self.thread_id)

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        if self.thread_kind == ChatThreadKind.COURSE:
            await database_sync_to_async(touch_presence)(
                self.tenant_schema, self.thread_id, self.user.id
            )

    async def disconnect(self, close_code):
        if (
            getattr(self, "thread_kind", None) == ChatThreadKind.COURSE
            and getattr(self, "tenant_schema", None)
            and getattr(self, "user", None)
            and not isinstance(self.user, AnonymousUser)
        ):
            await database_sync_to_async(clear_presence)(
                self.tenant_schema, self.thread_id, self.user.id
            )
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive_json(self, content):
        if not content or not isinstance(content, dict):
            await self.send_json({"error": "invalid_payload"})
            return

        msg_type = content.get("type") or "message"
        course_like = self.thread_kind == ChatThreadKind.COURSE

        if msg_type == "heartbeat":
            if course_like:
                await database_sync_to_async(touch_presence)(
                    self.tenant_schema, self.thread_id, self.user.id
                )
            return

        if msg_type == "typing":
            if not course_like:
                return
            typing_active = bool(content.get("typing"))
            await database_sync_to_async(set_typing)(
                self.tenant_schema, self.thread_id, self.user.id, typing_active
            )
            if typing_active:
                allowed = await database_sync_to_async(should_broadcast_typing_event)(
                    self.tenant_schema, self.thread_id, self.user.id
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

        if course_like:
            allowed, retry_after = await database_sync_to_async(
                lambda: check_rate_limit(self.user.id, self.thread_id)
            )()
            if not allowed:
                await self.send_json(
                    {"error": "rate_limited", "retry_after_seconds": retry_after}
                )
                return

        message, err = await create_message_on_thread(
            self.thread_id, self.user, raw_content, self.tenant_schema, reply_to_id=reply_to_id
        )
        if err:
            await self.send_json({"error": err})
            return

        payload = await build_new_thread_message_broadcast_payload(
            message.id, self.tenant_schema, client_message_id=client_message_id
        )
        await self.channel_layer.group_send(
            self.room_group_name, {"type": "chat.message", "message": payload}
        )

    async def chat_message(self, event):
        """Handle broadcast from group_send (new message)."""
        await self.send_json(event["message"])

    async def chat_event(self, event):
        """Side-channel events (edit, delete, typing, read receipts, reactions)."""
        await self.send_json(event["payload"])


class ChatThreadConsumer(_BaseChatThreadConsumer):
    """New unified consumer. URL: ws/chat/threads/<thread_id>/?token=<jwt>&tenant=<schema>"""

    async def _resolve_thread_id(self):
        return self.scope["url_route"]["kwargs"]["thread_id"]


class CourseChatConsumer(_BaseChatThreadConsumer):
    """Legacy course chat consumer. URL: ws/chat/<course_id>/?token=<jwt>&tenant=<schema>

    Kept for backward compatibility (Phase 2 dual-support) — resolves the
    course's thread id, then behaves identically to ChatThreadConsumer.
    """

    async def _resolve_thread_id(self):
        course_id = self.scope["url_route"]["kwargs"]["course_id"]
        return await resolve_course_thread_id(course_id, self.tenant_schema)


class DirectMessageConsumer(_BaseChatThreadConsumer):
    """Legacy DM consumer. URL: ws/chat/dm/<thread_id>/?token=<jwt>&tenant=<schema>

    Kept for backward compatibility (Phase 2 dual-support) — already
    thread_id-keyed, so this is a thin alias of ChatThreadConsumer.
    """

    async def _resolve_thread_id(self):
        return self.scope["url_route"]["kwargs"]["thread_id"]
```

- [ ] **Step 4: Remove the now-unused module-level helpers**

Delete `check_course_membership`, `check_dm_thread_membership`, `build_new_chat_broadcast_payload`, and `build_new_dm_broadcast_payload` from `app_chat/consumers.py` — nothing calls them after Step 3 (membership is now `check_thread_access`; new-message broadcast payloads are now `build_new_thread_message_broadcast_payload`). Leave `create_dm_message` (the thin `database_sync_to_async` wrapper around `create_dm_message_service`) in place — it's still called from `_create_message_on_thread_sync`'s DM branch... 

Wait — `_create_message_on_thread_sync` is a **plain sync function**, and `create_dm_message` in this module is `@database_sync_to_async`-wrapped (it can't be called synchronously from another sync function). Fix this in the same step: have `_create_message_on_thread_sync`'s DM branch call the **service-layer** function directly instead:

```python
    return create_dm_message_service(thread.id, user, content, reply_to_id)
```

(this is already what Step 1's code block above shows — `create_dm_message_service` is the existing import alias `from app_chat.services import ... create_dm_message as create_dm_message_service` already present at the top of the file). With this in place, the module-level async `create_dm_message` wrapper (`@database_sync_to_async def create_dm_message(thread_id, user, content, schema_name, reply_to_id=None): ...`) becomes unused too — delete it as well, since nothing else calls it after this refactor.

- [ ] **Step 5: Add the new WebSocket route**

In `app_ws/routing.py`:

```python
from django.urls import path

from app_chat.consumers import ChatThreadConsumer, CourseChatConsumer, DirectMessageConsumer

websocket_urlpatterns = [
    path("ws/chat/<int:course_id>/", CourseChatConsumer.as_asgi()),
    path("ws/chat/dm/<int:thread_id>/", DirectMessageConsumer.as_asgi()),
    path("ws/chat/threads/<int:thread_id>/", ChatThreadConsumer.as_asgi()),
]
```

- [ ] **Step 6: Run the full chat suite to confirm zero regressions**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: PASS, same test count as before this task. Note: this repo has no automated `WebsocketCommunicator`-based consumer tests today (Phase 1 also relied on manual smoke testing for consumers), so this task's correctness is additionally verified by Step 7's manual smoke test — do not skip it.

- [ ] **Step 7: Manual smoke test (both legacy and new WS URLs, same thread)**

With the dev server and a local Postgres running (per `python-backend-env-and-tests` rule for the test DB; use the dev/Railway DB for this manual smoke test per `AGENTS.md`), open two WebSocket connections to the **same course**: one at `ws/chat/<course_id>/?token=...&tenant=...` (legacy) and one at `ws/chat/threads/<thread_id>/?token=...&tenant=...` (new — first resolve `thread_id` via `GET courses/<course_id>/chat/thread`). Send a message from each connection and confirm **both** connections receive **both** messages. Then repeat for a DM thread using `ws/chat/dm/<thread_id>/` and `ws/chat/threads/<thread_id>/` with the same `thread_id`. This proves the Task 1 + Task 9 room-group unification works end-to-end (the piece no unit test can fully cover without live sockets).

- [ ] **Step 8: Commit**

```bash
git add app_chat/consumers.py app_ws/routing.py
git commit -m "refactor(chat): unify websocket consumers into a shared thread-based base class"
```

---

### Task 10: Final regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the entire backend test suite** (not just `app_chat`) to catch any cross-app import or signal regressions

Run: `./scripts/run_backend_tests.sh`
Expected: PASS, no new failures.

- [ ] **Step 2: Re-run the Phase 2 parity suite in isolation**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints -v 2`
Expected: PASS (all tests added across Tasks 2-8).

- [ ] **Step 3: Re-run the room-group naming unit test in isolation**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_chat_thread_group_naming_unit -v 2`
Expected: PASS.

- [ ] **Step 4: Confirm `black --check .` passes** (per repo lint convention)

Run (from `schedjuice-reimagined-be`, with venv activated): `black --check app_chat app_ws`
Expected: no reformatting needed (or run `black app_chat app_ws` once if it reports changes, then re-run tests).

- [ ] **Step 5: Manual smoke test — full legacy + new surface side-by-side**

Exercise, against a locally running server: course chat (send via legacy WS, read via new `GET chat/threads/<id>/messages`, and vice versa), DM chat (create via new `POST chat/threads`, send via legacy `POST chat/dm/threads/<id>/messages`, read via new endpoint), reactions, read-state, and presence — for both the legacy and new REST/WS surfaces. This is the spec §8 manual smoke test.

- [ ] **Step 6: Commit** (if not already captured by prior task commits)

```bash
git add -A
git commit -m "test(chat): final regression pass for unified chat API surface (Phase 2)"
```
