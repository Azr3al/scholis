# Unified Chat Schema — Phase 3 Mobile Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `schedjuice-reimagined-mobile` chat (course chat + DM) onto the Phase 2 generic `/chat/threads/...` REST + `ws/chat/threads/<id>/` WebSocket surface, unify mobile routes/hooks/API around `threadId`, switch new attachment uploads to `foreignKey = threadId`, and add two small backend additions (a batch course-chat-preview endpoint and `thread_id` on course push payloads) that the mobile migration needs.

**Architecture:** Two small, additive backend endpoints/fields (no breaking changes, legacy endpoints untouched) unblock a mobile-only refactor. On mobile, `useChatThread` (the WebSocket/outbox engine) is already kind-agnostic — the refactor replaces the two thin per-kind wrappers (`useCourseChat`/`useDmChat`, `useCourseChatReadState`/`useDmChatReadState`) and the two per-kind API modules with single thread-centric equivalents, replaces the two conversation routes (`/chat/[id]`, `/chat/dm/[threadId]`) with one dispatcher route (`/chat/threads/[threadId]`) that renders one of two extracted screen components based on a `kind` param supplied by every navigation call site, and switches the course chat list to one batched backend call instead of N per-course HTTP requests.

**Tech Stack:** Django 4.2 + DRF (backend), Expo Router + React Native + TanStack Query v4 + Zustand (mobile), Jest (backend `manage.py test`, mobile `pnpm test`).

**Related docs:**
- Design spec for this phase: `docs/superpowers/specs/2026-07-04-unified-chat-schema-phase3-mobile-migration-design.md`
- Phase 2 API spec: `docs/superpowers/specs/2026-07-04-unified-chat-schema-phase2-api-design.md`
- Phase 1 schema spec: `docs/superpowers/specs/2026-07-02-unified-chat-schema-design.md`

---

## File Structure Overview

### Backend (`schedjuice-reimagined-be/`)

| File | Responsibility |
|---|---|
| `app_chat/services.py` | Rename `bulk_dm_unread_counts` → `bulk_thread_unread_counts` (generic; used by DM list today, course batch preview after this plan). |
| `app_chat/message_preview.py` (new) | Shared "last message" preview dict shape, extracted from two duplicated serializer methods, reused by the new batch view. |
| `app_chat/serializers.py` | `ChatThreadSerializer.get_last_message` / `DirectMessageThreadSerializer.get_last_message` delegate to `message_preview.build_message_preview`. |
| `app_chat/views.py` | New `CourseChatLastMessagesBatchView`. |
| `app_chat/urls.py` | New route `courses/chat/last-messages`. |
| `app_chat/notifications.py` | `queue_course_chat_message_pushes` adds `thread_id` to push `data`. |
| `app_chat/tests/test_thread_endpoints.py` | New unit test for generic `bulk_thread_unread_counts`. |
| `app_chat/tests/test_course_chat_last_messages_batch.py` (new) | View tests for the batch endpoint. |
| `app_chat/tests/test_notifications.py` | Update 3 existing assertions to expect `thread_id` in push `data`. |

### Mobile (`schedjuice-reimagined-mobile/`)

| File | Responsibility |
|---|---|
| `types/chat.ts` | Add `ChatThreadKind`, `CourseChatLastMessagePreview`, `CourseChatLastMessagesResponse`. |
| `lib/chat/chat-thread-messages-query.ts` (new) | Unified cursor-paginated message query key/fetcher for `chat/threads/<id>/messages` (replaces the course/DM-specific message-fetch halves of `course-chat-messages-query.ts` / `dm-chat-messages-query.ts`). |
| `lib/api/chat-threads.ts` (new) | Unified message PATCH/DELETE/reaction-toggle/read-state/presence calls against `chat/threads/<id>/...` (replaces the course/DM-specific per-message API functions in `lib/api/chat.ts` / `lib/api/dm-chat.ts`). |
| `lib/api/course-chat-previews.ts` (new) | `fetchCourseChatLastMessages(courseIds)` — one batched call to the new backend endpoint (replaces the N+1 `fetchLastChatMessagesBatch` in `lib/api/chat.ts`). |
| `lib/chat/use-thread-chat.ts` (new) | Replaces `use-course-chat.ts` + `use-dm-chat.ts`: builds a `ChatThreadConfig` for `useChatThread` from `(threadId, kind, currentUserId)`. `useChatThread` itself is unchanged. |
| `lib/chat/use-thread-read-state.ts` (new) | Replaces `use-course-chat-read-state.ts` + `use-dm-chat-read-state.ts`. |
| `store/active-chat.ts` | Thread-centric: `{ threadId, kind }` instead of separate `courseId`/`threadId` fields. |
| `components/chat/chat-conversation/course-chat-conversation-screen.tsx` (new) | Course conversation UI, extracted from `app/(protected)/chat/[id].tsx`, now prop-driven (`threadId`, `courseId`). |
| `components/chat/chat-conversation/dm-chat-conversation-screen.tsx` (new) | DM conversation UI, extracted from `app/(protected)/chat/dm/[threadId].tsx`, now prop-driven. |
| `app/(protected)/chat/threads/[threadId].tsx` (new) | Thin dispatcher route: reads `kind`/`courseId`/`participantUserId`/`title` params, renders one of the two screens above. Replaces `app/(protected)/chat/[id].tsx` and `app/(protected)/chat/dm/[threadId].tsx` (deleted). |
| `app/(protected)/chat/threads/[threadId]/info.tsx` (new) | Thin dispatcher for chat info, replaces `chat/course-info/[id].tsx` + `chat/dm-info/[threadId].tsx` (deleted). |
| `lib/chat/use-chat-info-attachments.ts` | Attachment gallery fetch unified onto `fetchChatThreadMessagesPage` for both modes. |
| `app/(protected)/(tabs)/chat/index.tsx` | List screen: one batched course-preview call (real unread counts), new route params on every push. |
| `components/profile/staff-member-profile-screen.tsx` | Update DM navigation call to new route shape. |
| `lib/notifications/chat-notification.ts` | Route builder targets `/chat/threads/[threadId]`; `course_chat` requires `thread_id` now. |
| `lib/notifications/use-push-notifications.ts` | `invalidateChatQueries` uses the unified query key. |
| `lib/api/chat.ts` (deleted) | Fully superseded; deleted in cleanup task once all call sites are migrated. |
| `lib/chat/use-course-chat.ts`, `use-dm-chat.ts`, `use-course-chat-read-state.ts`, `use-dm-chat-read-state.ts` (deleted) | Superseded by `use-thread-chat.ts` / `use-thread-read-state.ts`. |
| `lib/chat/course-chat-messages-query.ts` (deleted), `lib/chat/dm-chat-messages-query.ts` (message-fetch exports removed, thread-list-cache exports kept) | Message-fetch responsibility moves to `chat-thread-messages-query.ts`. |
| `__tests__/lib/notifications/chat-notification.test.ts` (new) | Parse + route-build tests for the updated notification contract. |
| `__tests__/lib/chat/chat-thread-messages-query.test.ts` (new) | Query key + URL builder tests. |

---

## Milestone 1 — Backend addenda (`schedjuice-reimagined-be`)

All backend tasks run from `schedjuice-reimagined-be/`. Use:

```bash
./scripts/run_backend_tests.sh app_chat.tests.<module>
```

(local Docker Postgres, `--keepdb --noinput` — never the Railway dev DB; see `.cursor/rules/python-backend-env-and-tests.mdc`.)

### Task 1: Rename `bulk_dm_unread_counts` → `bulk_thread_unread_counts` (make it explicitly generic)

The function has no DM-specific logic today (it only filters `ChatReadState`/`ChatMessage` by `thread_id`), but its name implies it's DM-only. Task 3 needs to call it for course threads too — rename first so the batch view doesn't call a function named "dm" for course previews.

**Files:**
- Modify: `app_chat/services.py:214-239`
- Test: `app_chat/tests/test_thread_endpoints.py`

- [ ] **Step 1: Write the failing test**

Add to `app_chat/tests/test_thread_endpoints.py`, inside `class ChatThreadServiceTests(ChatThreadFixturesMixin, TestCase):` (after `test_list_dm_threads_for_user_excludes_empty_threads`):

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints.ChatThreadServiceTests.test_bulk_thread_unread_counts_works_for_course_threads`
Expected: FAIL with `ImportError: cannot import name 'bulk_thread_unread_counts'`

- [ ] **Step 3: Rename the function and its call site**

In `app_chat/services.py`, rename the function (keep body identical) and update its docstring and the one call site inside `list_dm_threads_for_user`:

```python
def bulk_thread_unread_counts(thread_ids: list[int], reader_user_id: int) -> dict[int, int]:
    """Unread count per thread: messages from others after reader's last_read_message_id.

    Kind-agnostic — used for DM thread lists and the course chat last-messages
    batch preview (`CourseChatLastMessagesBatchView`).
    """
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
```

And inside `list_dm_threads_for_user` (same file), change the call:

```python
    counts = bulk_thread_unread_counts([t.id for t in threads], user.id)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints`
Expected: PASS (all tests in the module, including the pre-existing `test_list_dm_threads_for_user_matches_legacy_query_shape`, which exercises the same function under its new name).

- [ ] **Step 5: Commit**

```bash
git add app_chat/services.py app_chat/tests/test_thread_endpoints.py
git commit -m "refactor(chat): rename bulk_dm_unread_counts to bulk_thread_unread_counts"
```

### Task 2: Extract shared `build_message_preview` helper

`ChatThreadSerializer.get_last_message` and `DirectMessageThreadSerializer.get_last_message` in `app_chat/serializers.py` currently duplicate the same "shape a message into `{id, created_at, user, content}`" logic. Extract it once so the new batch view (Task 3) can reuse it instead of writing a third copy.

**Files:**
- Create: `app_chat/message_preview.py`
- Modify: `app_chat/serializers.py:286-307` (`DirectMessageThreadSerializer.get_last_message`), `app_chat/serializers.py:351-367` (`ChatThreadSerializer.get_last_message`)
- Test: `app_chat/tests/test_thread_endpoints.py`

- [ ] **Step 1: Write the failing test**

Add a new test class to `app_chat/tests/test_thread_endpoints.py` (after `ChatThreadGenericSerializerTests`):

```python
@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class MessagePreviewHelperTests(ChatThreadFixturesMixin, TestCase):
    def test_build_message_preview_shape(self):
        from app_chat.message_preview import build_message_preview
        from app_chat.serializers import ChatThreadMessageSerializer

        with schema_context(self.schema_name):
            course, member = self._create_course_with_member()
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread, user=member, content={"text": "hi", "mentions": []}
            )
            preview = build_message_preview(
                msg, ChatThreadMessageSerializer, {"request": None}
            )
        self.assertEqual(preview["id"], msg.id)
        self.assertEqual(preview["user"], {"id": member.id, "name": member.name})
        self.assertEqual(preview["content"]["text"], "hi")
        self.assertEqual(set(preview.keys()), {"id", "created_at", "user", "content"})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints.MessagePreviewHelperTests`
Expected: FAIL with `ModuleNotFoundError: No module named 'app_chat.message_preview'`

- [ ] **Step 3: Create the helper module**

Create `app_chat/message_preview.py`:

```python
"""Shared 'last message' preview shape used by thread list/preview payloads.

Reused by ``ChatThreadSerializer.get_last_message``,
``DirectMessageThreadSerializer.get_last_message``, and
``CourseChatLastMessagesBatchView`` so all three surfaces agree on the shape
of a message preview without copy-pasting the same four-field dict.
"""

from __future__ import annotations

from typing import Any


def build_message_preview(message, serializer_class, context: dict) -> dict[str, Any]:
    data = serializer_class(message, context=context).data
    return {
        "id": data["id"],
        "created_at": data["created_at"],
        "user": {"id": message.user_id, "name": getattr(message.user, "name", "") or ""},
        "content": data["content"],
    }
```

- [ ] **Step 4: Refactor the two serializer methods to use it**

In `app_chat/serializers.py`, add the import near the top:

```python
from app_chat.message_preview import build_message_preview
```

Replace `DirectMessageThreadSerializer.get_last_message`:

```python
    def get_last_message(self, obj):
        mid = getattr(obj, "latest_message_id", None)
        if mid is None:
            return None
        latest_map = self.context.get("latest_messages_by_id") or {}
        msg = latest_map.get(mid)
        if msg is None:
            return None
        return build_message_preview(msg, DirectMessageSerializer, self.context)
```

Replace `ChatThreadSerializer.get_last_message`:

```python
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
        return build_message_preview(msg, ChatThreadMessageSerializer, self.context)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_thread_endpoints`
Expected: PASS, including the pre-existing `test_thread_serializer_exposes_participants_array` and any DM thread-list tests in `test_dm_permissions.py` (run that module too: `./scripts/run_backend_tests.sh app_chat.tests.test_dm_permissions`).

- [ ] **Step 6: Commit**

```bash
git add app_chat/message_preview.py app_chat/serializers.py app_chat/tests/test_thread_endpoints.py
git commit -m "refactor(chat): extract shared build_message_preview helper"
```

### Task 3: Add `GET courses/chat/last-messages` batch preview endpoint

Replaces the mobile chat list's N sequential per-course HTTP calls with one request. Returns, per course, the last message preview (same shape as the unified thread contract) and a real unread count (previously the mobile list always showed `0` for course unread).

**Files:**
- Modify: `app_chat/views.py` (imports + new view class, appended after `CourseChatMessageListView`)
- Modify: `app_chat/urls.py`
- Create: `app_chat/tests/test_course_chat_last_messages_batch.py`

- [ ] **Step 1: Write the failing tests**

Create `app_chat/tests/test_course_chat_last_messages_batch.py`:

```python
"""Tests for the batched course chat preview endpoint added in Phase 3
(mobile migration). See
docs/superpowers/specs/2026-07-04-unified-chat-schema-phase3-mobile-migration-design.md
section "Backend addendum 1".
"""

from __future__ import annotations

import unittest

from django.db import connection
from rest_framework import status
from rest_framework.test import APIRequestFactory
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from schedjuice_backend.test_tenant_helpers import ensure_public_schema
from tenant_schemas.utils import schema_context
from unittest.mock import patch

from app_chat.models import ChatMessage
from app_chat.services import get_or_create_course_chat_thread
from app_chat.tests.test_thread_endpoints import (
    ChatThreadFixturesMixin,
    _database_reachable,
    _jwt_token_user,
)
from app_chat.views import CourseChatLastMessagesBatchView
from app_course.models import UserCourse
from django.test import TestCase


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseChatLastMessagesBatchViewTests(ChatThreadFixturesMixin, TestCase):
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_returns_last_message_and_unread_count_per_course(self, mock_auth):
        with schema_context(self.schema_name):
            course_a, member = self._create_course_with_member()
            course_b, _ = self._create_course_with_member()
            UserCourse.objects.create(
                user=member, course=course_b, assigned_as=UserCourse.AssignedAs.STUDENT
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
            outsider_course, _ = self._create_course_with_member()
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_course_chat_last_messages_batch`
Expected: FAIL with `ImportError: cannot import name 'CourseChatLastMessagesBatchView' from 'app_chat.views'`

- [ ] **Step 3: Add imports to `app_chat/views.py`**

At the top of `app_chat/views.py`, update the `django.db.models` import (line 3) and the `app_chat.services` import block:

```python
from django.db.models import OuterRef, Q, QuerySet, Subquery
```

Add `bulk_thread_unread_counts` to the existing `from app_chat.services import (...)` block (alphabetical, after `broadcast...` imports section — insert into the existing multi-line import):

```python
from app_chat.services import (
    bulk_thread_unread_counts,
    can_access_thread,
    can_create_dm_thread,
    can_moderate_chat,
    can_send_course_chat_message,
    create_dm_message,
    dm_thread_pair_policy_allows,
    get_or_create_course_chat_thread,
    is_course_member,
    list_dm_threads_for_user,
    start_dm_conversation,
    mention_user_ids_from_content_mentions,
    user_is_dm_participant,
    validate_chat_attachment_refs,
    validate_chat_content_payload,
    validate_mention_user_ids,
)
```

And add the helper import alongside the other `app_chat` imports:

```python
from app_chat.message_preview import build_message_preview
```

- [ ] **Step 4: Add the view**

Append to `app_chat/views.py`, directly after `class CourseChatMessageListView(...)` (i.e. after the `post` method that returns `405`, before `class ChatApiView`):

```python
class CourseChatLastMessagesBatchView(ChatApiView):
    """GET last-message preview + real unread count for many courses in one call.

    Replaces the mobile chat list's previous N sequential per-course requests
    (see `fetchLastChatMessagesBatch` removal in the Phase 3 mobile migration
    plan). ``course_ids`` not backed by an active `UserCourse` membership for
    the requesting user are silently dropped rather than causing a 403, since
    this is a list-preview endpoint over a caller-supplied id set.
    """

    def get(self, request: Request):
        user = User.get_user_from_request(request)
        if not user:
            return BaseView.send_response(
                True, "unauthorized", {"details": "Authentication required"}, status=401
            )

        raw_ids = (request.query_params.get("course_ids") or "").strip()
        if not raw_ids:
            return BaseView.send_response(False, "success", {"data": {}}, status=status.HTTP_200_OK)
        try:
            course_ids = [int(x) for x in raw_ids.split(",") if x.strip()]
        except ValueError:
            return BaseView.send_response(
                True,
                "bad_request",
                {"details": "course_ids must be a comma-separated list of integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not course_ids:
            return BaseView.send_response(False, "success", {"data": {}}, status=status.HTTP_200_OK)

        member_course_ids = set(
            UserCourse.objects.filter(user=user, course_id__in=course_ids).values_list(
                "course_id", flat=True
            )
        )
        allowed_ids = [cid for cid in course_ids if cid in member_course_ids]
        if not allowed_ids:
            return BaseView.send_response(False, "success", {"data": {}}, status=status.HTTP_200_OK)

        threads_by_course = {
            t.course_id: t
            for t in ChatThread.objects.filter(kind=ChatThreadKind.COURSE, course_id__in=allowed_ids)
        }
        if not threads_by_course:
            return BaseView.send_response(False, "success", {"data": {}}, status=status.HTTP_200_OK)

        thread_ids = [t.id for t in threads_by_course.values()]
        latest_subq = (
            ChatMessage.objects.filter(thread_id=OuterRef("pk"))
            .order_by("-created_at", "-id")
            .values("id")[:1]
        )
        latest_id_by_thread_id = dict(
            ChatThread.objects.filter(pk__in=thread_ids)
            .annotate(latest_message_id=Subquery(latest_subq))
            .values_list("id", "latest_message_id")
        )
        latest_ids = [mid for mid in latest_id_by_thread_id.values() if mid]
        latest_messages_by_id = (
            {m.id: m for m in ChatMessage.objects.filter(pk__in=latest_ids).select_related("user")}
            if latest_ids
            else {}
        )
        unread_counts = bulk_thread_unread_counts(thread_ids, user.id)

        data: dict[str, dict] = {}
        for course_id, thread in threads_by_course.items():
            latest_id = latest_id_by_thread_id.get(thread.id)
            msg = latest_messages_by_id.get(latest_id) if latest_id else None
            data[str(course_id)] = {
                "last_message": (
                    None
                    if msg is None
                    else build_message_preview(
                        msg, serializers.ChatThreadMessageSerializer, {"request": request}
                    )
                ),
                "unread_count": unread_counts.get(thread.id, 0),
            }
        return BaseView.send_response(False, "success", {"data": data}, status=status.HTTP_200_OK)
```

- [ ] **Step 5: Wire up the URL**

In `app_chat/urls.py`, add before the `courses/<int:course_id>/chat/messages` entry (so all course-chat routes stay grouped):

```python
    path(
        "courses/chat/last-messages",
        views.CourseChatLastMessagesBatchView.as_view(),
        name="course-chat-last-messages-batch",
    ),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_course_chat_last_messages_batch`
Expected: PASS (all 4 tests)

Then run the full chat suite to check for regressions:

Run: `./scripts/run_backend_tests.sh app_chat`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app_chat/views.py app_chat/urls.py app_chat/tests/test_course_chat_last_messages_batch.py
git commit -m "feat(chat): add batched course chat last-messages endpoint"
```

### Task 4: Add `thread_id` to course chat push notification payload

Mobile's push-tap deep link currently can't jump straight to the thread for course chat pushes (only `course_id` is present). DM pushes already carry `thread_id`.

**Files:**
- Modify: `app_chat/notifications.py:88-95`
- Modify: `app_chat/tests/test_notifications.py` (3 existing assertions)

- [ ] **Step 1: Update the 3 existing test assertions to expect `thread_id` (red)**

In `app_chat/tests/test_notifications.py`, update each of the three `mock_enqueue.assert_called_once_with(...)` calls for course chat (`test_course_chat_excludes_sender_and_includes_data_payload`, `test_course_chat_voice_message_preview`, `test_course_chat_attachment_preview`) to add `"thread_id": "1"` to the expected `data` dict (the fixture threads in these tests all use `thread = SimpleNamespace(id=1, course_id=5, course=course, kind="course")`, so `thread_id` is `"1"` in every case). Example for the first:

```python
        mock_enqueue.assert_called_once_with(
            [20, 30],
            title="Algebra 101",
            body="Hello class",
            data={
                "type": "course_chat",
                "course_id": "5",
                "thread_id": "1",
                "message_id": "99",
                "sender_name": "Jane Doe",
            },
        )
```

Apply the same `"thread_id": "1",` addition to the `data` dicts in `test_course_chat_voice_message_preview` and `test_course_chat_attachment_preview`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_notifications`
Expected: FAIL — 3 assertion mismatches (actual `data` dict missing `thread_id`)

- [ ] **Step 3: Add `thread_id` to the push data**

In `app_chat/notifications.py`, update `queue_course_chat_message_pushes`:

```python
    queue_chat_message_pushes(
        message,
        sender_id=message.user_id,
        resolve_candidate_ids=resolve_candidate_ids,
        resolve_read_states=resolve_read_states,
        resolve_title=resolve_title,
        push_data={
            "type": "course_chat",
            "course_id": str(course_id),
            "thread_id": str(thread.id),
        },
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_notifications`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_chat/notifications.py app_chat/tests/test_notifications.py
git commit -m "feat(chat): include thread_id in course chat push payload"
```

**Milestone 1 checkpoint:** run the full backend chat suite once more (`./scripts/run_backend_tests.sh app_chat`) before starting mobile work — mobile Milestones 2–7 assume `courses/chat/last-messages` and push `thread_id` already exist. Deploy or otherwise make this backend change available to the environment mobile will test against before Milestone 5 (list screen) and Milestone 6 (notifications).

---

## Milestone 2 — Mobile: types, query-key, and API layers (`schedjuice-reimagined-mobile`)

Mobile tasks run from `schedjuice-reimagined-mobile/`. Use `pnpm test`, `pnpm test:watch`, `npx tsc --noEmit`, `pnpm lint`.

### Task 5: Add thread-kind and batch-preview types

**Files:**
- Modify: `types/chat.ts`

- [ ] **Step 1: Add the new types**

Add to `types/chat.ts`, after the `ChatMessageApi` type (around line 74):

```typescript
export type ChatThreadKind = 'course' | 'dm';
```

Add near the end of the file (after `DmEligibleUser`):

```typescript
/** Preview shape returned by GET courses/chat/last-messages for one course. */
export type CourseChatLastMessagePreview = {
  last_message: DmLastMessagePreview | null;
  unread_count: number;
};

/** GET courses/chat/last-messages response: course id (string key) -> preview. */
export type CourseChatLastMessagesResponse = Record<string, CourseChatLastMessagePreview>;
```

(`DmLastMessagePreview` already has the exact `{id, created_at, user: {id, name}, content}` shape the backend's `build_message_preview` returns, so it's reused rather than duplicated.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no consumers yet, so this is purely additive)

- [ ] **Step 3: Commit**

```bash
git add types/chat.ts
git commit -m "feat(chat): add ChatThreadKind and course chat batch preview types"
```

### Task 6: Unified thread message query module

**Files:**
- Create: `lib/chat/chat-thread-messages-query.ts`
- Test: `__tests__/lib/chat/chat-thread-messages-query.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/chat/chat-thread-messages-query.test.ts`:

```typescript
import {
  chatThreadMessagesQueryKey,
  CHAT_THREAD_MESSAGES_GC_TIME_MS,
  CHAT_THREAD_MESSAGES_STALE_MS,
} from '@/lib/chat/chat-thread-messages-query';

describe('chatThreadMessagesQueryKey', () => {
  it('builds a stable, prefix-scoped key from a thread id', () => {
    expect(chatThreadMessagesQueryKey(42)).toEqual(['chat-thread-messages', 42]);
  });

  it('produces different keys for different thread ids', () => {
    expect(chatThreadMessagesQueryKey(1)).not.toEqual(chatThreadMessagesQueryKey(2));
  });
});

describe('cache tuning constants', () => {
  it('reuses the shared chat message staleness/gc defaults', () => {
    expect(CHAT_THREAD_MESSAGES_STALE_MS).toBeGreaterThan(0);
    expect(CHAT_THREAD_MESSAGES_GC_TIME_MS).toBeGreaterThan(CHAT_THREAD_MESSAGES_STALE_MS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/lib/chat/chat-thread-messages-query.test.ts`
Expected: FAIL — `Cannot find module '@/lib/chat/chat-thread-messages-query'`

- [ ] **Step 3: Create the module**

Create `lib/chat/chat-thread-messages-query.ts`:

```typescript
import {
  CHAT_MESSAGES_GC_TIME_MS,
  CHAT_MESSAGES_STALE_MS,
  createChatMessagesQuery,
  extractChatMessagesArray,
  normalizeChatMessageRow,
  sortChatMessages,
} from '@/lib/chat/chat-messages-query';

export { extractChatMessagesArray, normalizeChatMessageRow, sortChatMessages };

export const CHAT_THREAD_MESSAGES_STALE_MS = CHAT_MESSAGES_STALE_MS;
export const CHAT_THREAD_MESSAGES_GC_TIME_MS = CHAT_MESSAGES_GC_TIME_MS;

/**
 * Message history for any unified chat thread (course or DM), backed by
 * `GET chat/threads/<id>/messages`. Replaces the course- and DM-specific
 * message-fetch halves of `course-chat-messages-query.ts` / `dm-chat-messages-query.ts`.
 */
const chatThreadQuery = createChatMessagesQuery({
  queryKeyPrefix: 'chat-thread-messages',
  buildMessagesUrl: (threadId, params) => `chat/threads/${threadId}/messages?${params.toString()}`,
});

export const chatThreadMessagesQueryKey = chatThreadQuery.messagesQueryKey;
export const fetchChatThreadMessagesPage = chatThreadQuery.fetchMessagesPage;
export const fetchChatThreadMessages = chatThreadQuery.fetchMessages;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/lib/chat/chat-thread-messages-query.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/chat/chat-thread-messages-query.ts __tests__/lib/chat/chat-thread-messages-query.test.ts
git commit -m "feat(chat): add unified chat-thread messages query module"
```

### Task 7: Unified thread message API module

**Files:**
- Create: `lib/api/chat-threads.ts`
- Test: `__tests__/lib/api/chat-threads.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/api/chat-threads.test.ts`:

```typescript
jest.mock('@/lib/api', () => ({
  axiosClient: { get: jest.fn(), patch: jest.fn(), delete: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

import { axiosClient } from '@/lib/api';
import {
  deleteChatThreadMessage,
  getChatThreadPresence,
  patchChatThreadMessage,
  putChatThreadReadCursor,
  resolveCourseChatThread,
  toggleChatThreadReaction,
} from '@/lib/api/chat-threads';

const mockAxios = axiosClient as jest.Mocked<typeof axiosClient>;

describe('chat-threads API', () => {
  afterEach(() => jest.clearAllMocks());

  it('patches a message on the unified thread endpoint', async () => {
    mockAxios.patch.mockResolvedValueOnce({ data: {} });
    await patchChatThreadMessage(7, 99, { text: 'edited' });
    expect(mockAxios.patch).toHaveBeenCalledWith('chat/threads/7/messages/99', {
      content: { text: 'edited' },
    });
  });

  it('deletes a message on the unified thread endpoint', async () => {
    mockAxios.delete.mockResolvedValueOnce({ data: {} });
    await deleteChatThreadMessage(7, 99);
    expect(mockAxios.delete).toHaveBeenCalledWith('chat/threads/7/messages/99');
  });

  it('toggles a reaction and returns the parsed payload', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { data: { message_id: 99, reactions: [{ emoji: '👍', count: 1, user_ids: [1], reacted_by_me: true }] } },
    });
    const result = await toggleChatThreadReaction(7, 99, '👍');
    expect(mockAxios.post).toHaveBeenCalledWith('chat/threads/7/messages/99/reactions', { emoji: '👍' });
    expect(result.message_id).toBe(99);
  });

  it('throws on an invalid reaction response', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    await expect(toggleChatThreadReaction(7, 99, '👍')).rejects.toThrow('Invalid reaction response');
  });

  it('puts the read cursor on the unified thread endpoint', async () => {
    mockAxios.put.mockResolvedValueOnce({ data: {} });
    await putChatThreadReadCursor(7, 42);
    expect(mockAxios.put).toHaveBeenCalledWith('chat/threads/7/read-state', {
      last_read_message_id: 42,
    });
  });

  it('fetches presence for a thread', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { data: { online_user_ids: [1, 2] } } });
    const ids = await getChatThreadPresence(7);
    expect(mockAxios.get).toHaveBeenCalledWith('chat/threads/7/presence');
    expect(ids).toEqual([1, 2]);
  });

  it('resolves the course chat thread id', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { data: { id: 7, kind: 'course', course: 3 } } });
    const thread = await resolveCourseChatThread(3);
    expect(mockAxios.get).toHaveBeenCalledWith('courses/3/chat/thread');
    expect(thread).toEqual({ id: 7, kind: 'course', course: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/lib/api/chat-threads.test.ts`
Expected: FAIL — `Cannot find module '@/lib/api/chat-threads'`

- [ ] **Step 3: Create the module**

Create `lib/api/chat-threads.ts`:

```typescript
import { axiosClient } from '@/lib/api';
import type { ChatMessageContent, ChatReactionSummary, ChatThreadKind } from '@/types/chat';

function unwrapData<T>(body: unknown): T | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const r = body as Record<string, unknown>;
  const inner = r.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as T;
  }
  return undefined;
}

/**
 * Message CRUD, reactions, read-state, and presence for any unified chat
 * thread (course or DM), backed by `chat/threads/<id>/...`. Replaces the
 * course- and DM-specific per-message API functions previously split across
 * `lib/api/chat.ts` and `lib/api/dm-chat.ts`.
 */
export async function patchChatThreadMessage(
  threadId: number,
  messageId: number,
  content: ChatMessageContent
): Promise<void> {
  await axiosClient.patch(`chat/threads/${threadId}/messages/${messageId}`, { content });
}

export async function deleteChatThreadMessage(threadId: number, messageId: number): Promise<void> {
  await axiosClient.delete(`chat/threads/${threadId}/messages/${messageId}`);
}

export async function toggleChatThreadReaction(
  threadId: number,
  messageId: number,
  emoji: string
): Promise<{ message_id: number; reactions: ChatReactionSummary[] }> {
  const { data } = await axiosClient.post(`chat/threads/${threadId}/messages/${messageId}/reactions`, {
    emoji,
  });
  const inner = unwrapData<{ message_id: number; reactions: ChatReactionSummary[] }>(data);
  if (!inner || typeof inner.message_id !== 'number') {
    throw new Error('Invalid reaction response');
  }
  return inner;
}

export async function putChatThreadReadCursor(threadId: number, lastReadMessageId: number): Promise<void> {
  await axiosClient.put(`chat/threads/${threadId}/read-state`, {
    last_read_message_id: lastReadMessageId,
  });
}

export async function getChatThreadPresence(threadId: number): Promise<number[]> {
  const { data } = await axiosClient.get(`chat/threads/${threadId}/presence`);
  const payload = unwrapData<{ online_user_ids?: unknown }>(data);
  const ids = payload?.online_user_ids;
  return Array.isArray(ids) ? (ids as number[]) : [];
}

/** Get-or-create the ChatThread for a course (used to resolve threadId for navigation). */
export async function resolveCourseChatThread(
  courseId: number
): Promise<{ id: number; kind: ChatThreadKind; course: number | null }> {
  const { data } = await axiosClient.get(`courses/${courseId}/chat/thread`);
  const inner = unwrapData<{ id: number; kind: ChatThreadKind; course: number | null }>(data);
  if (!inner) throw new Error('Invalid thread-resolve response');
  return inner;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/lib/api/chat-threads.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/api/chat-threads.ts __tests__/lib/api/chat-threads.test.ts
git commit -m "feat(chat): add unified chat-threads API module"
```

### Task 8: Batched course chat preview API call

**Files:**
- Create: `lib/api/course-chat-previews.ts`
- Test: `__tests__/lib/api/course-chat-previews.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/api/course-chat-previews.test.ts`:

```typescript
jest.mock('@/lib/api', () => ({
  axiosClient: { get: jest.fn() },
}));

import { axiosClient } from '@/lib/api';
import { fetchCourseChatLastMessages } from '@/lib/api/course-chat-previews';

const mockAxios = axiosClient as jest.Mocked<typeof axiosClient>;

describe('fetchCourseChatLastMessages', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns an empty map without calling the API for an empty course id list', async () => {
    const result = await fetchCourseChatLastMessages([]);
    expect(result).toEqual({});
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('makes one batched request for many course ids', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          '1': { last_message: null, unread_count: 0 },
          '2': {
            last_message: {
              id: 5,
              created_at: '2026-01-01T00:00:00Z',
              user: { id: 9, name: 'Ada' },
              content: { text: 'hi', mentions: [] },
            },
            unread_count: 3,
          },
        },
      },
    });

    const result = await fetchCourseChatLastMessages([1, 2]);

    expect(mockAxios.get).toHaveBeenCalledTimes(1);
    expect(mockAxios.get).toHaveBeenCalledWith('courses/chat/last-messages?course_ids=1%2C2');
    expect(result['1'].unread_count).toBe(0);
    expect(result['2'].last_message?.content.text).toBe('hi');
    expect(result['2'].unread_count).toBe(3);
  });

  it('returns an empty map when the response has no data payload', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: {} });
    const result = await fetchCourseChatLastMessages([1]);
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/lib/api/course-chat-previews.test.ts`
Expected: FAIL — `Cannot find module '@/lib/api/course-chat-previews'`

- [ ] **Step 3: Create the module**

Create `lib/api/course-chat-previews.ts`:

```typescript
import { axiosClient } from '@/lib/api';
import type { CourseChatLastMessagesResponse } from '@/types/chat';

/**
 * Last-message preview + unread count for many courses in a single request.
 * Replaces the previous client-side N+1 pattern (`fetchLastChatMessagesBatch`,
 * which issued one `GET courses/<id>/chat/messages` per course) with one call
 * to the batched backend endpoint `GET courses/chat/last-messages`.
 */
export async function fetchCourseChatLastMessages(
  courseIds: number[]
): Promise<CourseChatLastMessagesResponse> {
  if (courseIds.length === 0) return {};
  const { data } = await axiosClient.get(`courses/chat/last-messages?course_ids=${courseIds.join(',')}`);
  const inner = data?.data;
  return inner && typeof inner === 'object' && !Array.isArray(inner)
    ? (inner as CourseChatLastMessagesResponse)
    : {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/lib/api/course-chat-previews.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/api/course-chat-previews.ts __tests__/lib/api/course-chat-previews.test.ts
git commit -m "feat(chat): add batched course chat last-messages API call"
```

---

## Milestone 3 — Mobile: hook and store consolidation

### Task 9: Unified `useThreadChat` hook

`useChatThread` (`lib/chat/use-chat-thread.ts`) is already fully generic over a `ChatThreadConfig` object — it needs **no changes**. `useCourseChat`/`useDmChat` are two ~30-line wrappers that build slightly different configs; replace both with one wrapper parameterized by `kind`.

**Files:**
- Create: `lib/chat/use-thread-chat.ts`
- Delete: `lib/chat/use-course-chat.ts`, `lib/chat/use-dm-chat.ts` (after call sites migrate in Task 12/13 — see Task 21)
- Test: `__tests__/lib/chat/use-thread-chat.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/chat/use-thread-chat.test.ts`. This tests the *config-building* behavior (which API/WS-path/features get selected per kind) rather than re-testing `useChatThread`'s WebSocket internals (already implicitly covered by existing course/DM screen usage):

```typescript
jest.mock('@/lib/chat/use-chat-thread', () => ({
  useChatThread: jest.fn(() => ({ putReadCursor: undefined })),
}));
jest.mock('@/lib/api/chat-threads', () => ({
  patchChatThreadMessage: jest.fn(),
  deleteChatThreadMessage: jest.fn(),
  toggleChatThreadReaction: jest.fn(),
  putChatThreadReadCursor: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/chat/dm-chat-messages-query', () => ({
  invalidateDmThreadsQuery: jest.fn(),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({})),
}));

import { renderHook } from '@testing-library/react-native';
import { useChatThread } from '@/lib/chat/use-chat-thread';
import { useThreadChat } from '@/lib/chat/use-thread-chat';

const mockUseChatThread = useChatThread as jest.Mock;

describe('useThreadChat', () => {
  afterEach(() => jest.clearAllMocks());

  it('enables typing + read receipts for course threads', () => {
    renderHook(() => useThreadChat(10, 'course', 1));
    const config = mockUseChatThread.mock.calls[0][0];
    expect(config.features).toEqual({ typing: true, readReceipts: true });
    expect(config.buildWsPath(10)).toBe('/ws/chat/threads/10/');
    expect(config.membershipError403).toBe('Not a course member');
  });

  it('disables typing + read receipts for DM threads', () => {
    renderHook(() => useThreadChat(10, 'dm', 1));
    const config = mockUseChatThread.mock.calls[0][0];
    expect(config.features).toBeUndefined();
    expect(config.membershipError403).toBe('You cannot access this direct message.');
  });

  it('provides a no-op putReadCursor fallback when useChatThread does not expose one', () => {
    const { result } = renderHook(() => useThreadChat(10, 'dm', 1));
    expect(typeof result.current.putReadCursor).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/lib/chat/use-thread-chat.test.ts`
Expected: FAIL — `Cannot find module '@/lib/chat/use-thread-chat'`

- [ ] **Step 3: Create the hook**

Create `lib/chat/use-thread-chat.ts`:

```typescript
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  deleteChatThreadMessage,
  patchChatThreadMessage,
  putChatThreadReadCursor,
  toggleChatThreadReaction,
} from '@/lib/api/chat-threads';
import {
  chatThreadMessagesQueryKey,
  CHAT_THREAD_MESSAGES_GC_TIME_MS,
  CHAT_THREAD_MESSAGES_STALE_MS,
  fetchChatThreadMessagesPage,
} from '@/lib/chat/chat-thread-messages-query';
import { invalidateDmThreadsQuery } from '@/lib/chat/dm-chat-messages-query';
import { useChatThread, type ChatThreadFeatures } from '@/lib/chat/use-chat-thread';
import type { ChatMessageContent, ChatThreadKind } from '@/types/chat';

const CHAT_THREAD_WS_PATH = (id: number) => `/ws/chat/threads/${id}/`;
const COURSE_THREAD_FEATURES: ChatThreadFeatures = { typing: true, readReceipts: true };

const MEMBERSHIP_ERROR_BY_KIND: Record<ChatThreadKind, string> = {
  course: 'Not a course member',
  dm: 'You cannot access this direct message.',
};

/**
 * Single entry point for both course chat and DM chat, replacing the
 * previously separate `useCourseChat` / `useDmChat` wrappers. `useChatThread`
 * (the WebSocket + outbox engine) is kind-agnostic already; this hook only
 * selects the per-kind API functions, feature flags, and the DM-only
 * "refresh the thread list after marking read" side effect.
 */
export function useThreadChat(
  threadId: number | null,
  kind: ChatThreadKind,
  currentUserId: number | undefined
) {
  const queryClient = useQueryClient();

  const api = useMemo(
    () => ({
      patchMessage: (messageId: number, content: ChatMessageContent) =>
        patchChatThreadMessage(threadId!, messageId, content),
      deleteMessage: (messageId: number) => deleteChatThreadMessage(threadId!, messageId),
      toggleReaction: (messageId: number, emoji: string) =>
        toggleChatThreadReaction(threadId!, messageId, emoji),
      putReadCursor: async (messageId: number) => {
        await putChatThreadReadCursor(threadId!, messageId);
        if (kind === 'dm') invalidateDmThreadsQuery(queryClient, currentUserId);
      },
    }),
    [threadId, kind, queryClient, currentUserId]
  );

  const thread = useChatThread({
    conversationId: threadId,
    currentUserId,
    disabledQueryKey: ['chat-thread-messages', 'disabled'],
    messagesQueryKey: chatThreadMessagesQueryKey,
    staleTime: CHAT_THREAD_MESSAGES_STALE_MS,
    gcTime: CHAT_THREAD_MESSAGES_GC_TIME_MS,
    fetchMessagesPage: fetchChatThreadMessagesPage,
    buildWsPath: CHAT_THREAD_WS_PATH,
    membershipError403: MEMBERSHIP_ERROR_BY_KIND[kind],
    api,
    features: kind === 'course' ? COURSE_THREAD_FEATURES : undefined,
  });

  const sendTyping = useCallback(
    (active: boolean) => {
      thread.sendTyping?.(active);
    },
    [thread]
  );

  return {
    ...thread,
    sendTyping: kind === 'course' ? sendTyping : undefined,
    lastReadByUserId: thread.lastReadByUserId ?? {},
    typingPeers: thread.typingPeers ?? new Map(),
    putReadCursor: thread.putReadCursor ?? (async () => {}),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/lib/chat/use-thread-chat.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/chat/use-thread-chat.ts __tests__/lib/chat/use-thread-chat.test.ts
git commit -m "feat(chat): add unified useThreadChat hook"
```

(`use-course-chat.ts` / `use-dm-chat.ts` are deleted in Task 21 once Tasks 12–13 remove their last call sites — deleting them now would break the still-unmigrated screens.)

### Task 10: Unified `useThreadReadState` hook

`useChatReadState` (`lib/chat/use-chat-read-state.ts`) is already generic. Replace the two 15-line kind-specific wrappers with one.

**Files:**
- Create: `lib/chat/use-thread-read-state.ts`
- Delete: `lib/chat/use-course-chat-read-state.ts`, `lib/chat/use-dm-chat-read-state.ts` (Task 21)
- Test: `__tests__/lib/chat/use-thread-read-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/chat/use-thread-read-state.test.ts`:

```typescript
const mockPut = jest.fn().mockResolvedValue(undefined);
const mockClearUnread = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('@/lib/api/chat-threads', () => ({
  putChatThreadReadCursor: (...args: unknown[]) => mockPut(...args),
}));
jest.mock('@/lib/auth/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { id: number } }) => unknown) => selector({ user: { id: 55 } }),
}));
jest.mock('@/lib/chat/dm-chat-messages-query', () => ({
  clearDmThreadUnreadInCache: (...args: unknown[]) => mockClearUnread(...args),
  invalidateDmThreadsQuery: (...args: unknown[]) => mockInvalidate(...args),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => 'the-query-client'),
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import { useThreadReadState } from '@/lib/chat/use-thread-read-state';

describe('useThreadReadState', () => {
  afterEach(() => jest.clearAllMocks());

  it('reports read without touching DM thread-list caches for course kind', async () => {
    const { result } = renderHook(() => useThreadReadState(10, 'course'));
    result.current.reportRead(5);
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith(10, 5));
    expect(mockClearUnread).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('clears and invalidates the DM thread list cache for dm kind', async () => {
    const { result } = renderHook(() => useThreadReadState(10, 'dm'));
    result.current.reportRead(5);
    await waitFor(() => expect(mockClearUnread).toHaveBeenCalledWith('the-query-client', 55, 10));
    await waitFor(() => expect(mockInvalidate).toHaveBeenCalledWith('the-query-client', 55));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/lib/chat/use-thread-read-state.test.ts`
Expected: FAIL — `Cannot find module '@/lib/chat/use-thread-read-state'`

- [ ] **Step 3: Create the hook**

Create `lib/chat/use-thread-read-state.ts`:

```typescript
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { putChatThreadReadCursor } from '@/lib/api/chat-threads';
import { useAuthStore } from '@/lib/auth/auth-store';
import { clearDmThreadUnreadInCache, invalidateDmThreadsQuery } from '@/lib/chat/dm-chat-messages-query';
import { useChatReadState } from '@/lib/chat/use-chat-read-state';
import type { ChatThreadKind } from '@/types/chat';

/**
 * Single entry point for reporting the read cursor on any unified chat
 * thread, replacing `useCourseChatReadState` / `useDmChatReadState`. Only DM
 * threads need the "optimistically clear + then invalidate the DM thread
 * list" side effect (course chat has no unread badge on that same list
 * screen surface prior to Task 16; after Task 16 it does, but via the batch
 * preview query, not this per-thread cache).
 */
export function useThreadReadState(threadId: number | null, kind: ChatThreadKind) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const putReadCursor = useCallback(
    (messageId: number) => putChatThreadReadCursor(threadId!, messageId),
    [threadId]
  );

  return useChatReadState({
    conversationId: threadId,
    putReadCursor,
    onBeforePut:
      kind === 'dm'
        ? () => {
            if (threadId != null) clearDmThreadUnreadInCache(queryClient, userId, threadId);
          }
        : undefined,
    onAfterPut: kind === 'dm' ? () => invalidateDmThreadsQuery(queryClient, userId) : undefined,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/lib/chat/use-thread-read-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/chat/use-thread-read-state.ts __tests__/lib/chat/use-thread-read-state.test.ts
git commit -m "feat(chat): add unified useThreadReadState hook"
```

### Task 11: Thread-centric active-chat store

Used only to suppress a chat's own push notification/toast while the user has that conversation open (see `push-notification-state.ts` consumer). Simplify to one `{ threadId, kind }` pair.

**Files:**
- Modify: `store/active-chat.ts`
- Modify: `lib/notifications/push-notification-state.ts` (consumer — read current shape first)
- Test: `__tests__/store/active-chat.test.ts` (new if none exists — check first)

- [ ] **Step 1: Check the current consumer contract**

Before changing the store, read `lib/notifications/push-notification-state.ts` to see exactly which fields of `useActiveChatStore.getState()` it reads (`kind`, `courseId`, `threadId`) so the replacement keeps `shouldSuppressChatNotification` correct. Confirm whether a test file for the store already exists (`__tests__/store/active-chat.test.ts`); if it does, update it in Step 4 instead of creating a new one.

- [ ] **Step 2: Write/update the failing test**

Create (or update) `__tests__/store/active-chat.test.ts`:

```typescript
import { useActiveChatStore } from '@/store/active-chat';

describe('useActiveChatStore', () => {
  beforeEach(() => {
    useActiveChatStore.getState().clearActiveChat();
  });

  it('starts with no active chat', () => {
    const state = useActiveChatStore.getState();
    expect(state.kind).toBeNull();
    expect(state.threadId).toBeNull();
    expect(state.courseId).toBeNull();
  });

  it('sets an active course thread, including the course id for legacy consumers', () => {
    useActiveChatStore.getState().setActiveThreadChat(10, 'course', 3);
    const state = useActiveChatStore.getState();
    expect(state).toMatchObject({ kind: 'course', threadId: 10, courseId: 3 });
  });

  it('sets an active DM thread with no course id', () => {
    useActiveChatStore.getState().setActiveThreadChat(10, 'dm');
    const state = useActiveChatStore.getState();
    expect(state).toMatchObject({ kind: 'dm', threadId: 10, courseId: null });
  });

  it('clears the active chat', () => {
    useActiveChatStore.getState().setActiveThreadChat(10, 'dm');
    useActiveChatStore.getState().clearActiveChat();
    const state = useActiveChatStore.getState();
    expect(state).toMatchObject({ kind: null, threadId: null, courseId: null });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test __tests__/store/active-chat.test.ts`
Expected: FAIL — `setActiveThreadChat is not a function`

- [ ] **Step 4: Update the store**

Replace `store/active-chat.ts`:

```typescript
import { create } from 'zustand';

import type { ChatThreadKind } from '@/types/chat';

interface ActiveChatState {
  kind: ChatThreadKind | null;
  threadId: number | null;
  /** Kept for the course-chat-specific push-suppression check; null for DM. */
  courseId: number | null;
  setActiveThreadChat: (threadId: number, kind: ChatThreadKind, courseId?: number) => void;
  clearActiveChat: () => void;
}

export const useActiveChatStore = create<ActiveChatState>((set) => ({
  kind: null,
  threadId: null,
  courseId: null,
  setActiveThreadChat: (threadId, kind, courseId) =>
    set({ kind, threadId, courseId: kind === 'course' ? (courseId ?? null) : null }),
  clearActiveChat: () => set({ kind: null, threadId: null, courseId: null }),
}));
```

- [ ] **Step 5: Update the consumer in `push-notification-state.ts`**

Read the file's current `shouldSuppressChatNotification` implementation and adjust any `setActiveCourseChat`/`setActiveDmChat` field reads to the new shape (`kind`, `threadId`, `courseId`). If it currently branches on `data.type === 'course_chat' && state.courseId === data.course_id`, change the course branch to compare `state.kind === 'course' && state.threadId === data.thread_id` once `thread_id` is available (Task 4 backend addition + Task 19 mobile parsing), falling back to `state.courseId === data.course_id` only if `data.thread_id` is absent. Keep the DM branch (`state.kind === 'dm' && state.threadId === data.thread_id`) unchanged — it already matches the new shape.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test __tests__/store/active-chat.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: Errors only in files not yet migrated (`app/(protected)/chat/[id].tsx`, `app/(protected)/chat/dm/[threadId].tsx` still call the old `setActiveCourseChat`/`setActiveDmChat`) — these are fixed in Tasks 12–13. Confirm the error list contains only those two files' `useActiveChatStore` calls before proceeding.

- [ ] **Step 7: Commit**

```bash
git add store/active-chat.ts lib/notifications/push-notification-state.ts __tests__/store/active-chat.test.ts
git commit -m "refactor(chat): make active-chat store thread-centric"
```

---

## Milestone 4 — Mobile: screens and routes

### Task 12: Extract the course conversation screen into a prop-driven component

Moves the entire body of `app/(protected)/chat/[id].tsx` into a reusable component that takes `threadId` explicitly instead of resolving `courseId` from route params, and swaps `useCourseChat`/`useCourseChatReadState` for `useThreadChat`/`useThreadReadState`.

**Files:**
- Create: `components/chat/chat-conversation/course-chat-conversation-screen.tsx`
- Delete: `app/(protected)/chat/[id].tsx` (once Task 14's dispatcher route exists and renders this component)

- [ ] **Step 1: Create the component**

Create `components/chat/chat-conversation/course-chat-conversation-screen.tsx` with the full contents of `app/(protected)/chat/[id].tsx` (`c:\schedjuice\schedjuice-reimagined-mobile\app\(protected)\chat\[id].tsx`), applying these targeted changes on top:

1. Rename the default export to `CourseChatConversationScreen` and change it to accept props instead of reading route params:

```typescript
export function CourseChatConversationScreen({
  threadId,
  courseId,
}: {
  threadId: number;
  courseId: number;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDarkColorScheme, colors } = useColorScheme();
  const user = useAuthStore((s) => s.user);
```

(remove the `useLocalSearchParams<{ id: string }>()` line and the `const courseId = id ? parseInt(id, 10) : null;` line — both parameters are now props. Delete the `!courseId` early-return block at the bottom since the dispatcher route in Task 14 guarantees a valid `courseId`/`threadId` before rendering this component.)

2. Replace the import and call for the chat hook:

```typescript
import { useThreadChat } from '@/lib/chat/use-thread-chat';
import { useThreadReadState } from '@/lib/chat/use-thread-read-state';
```

(remove the `useCourseChat` and `useCourseChatReadState` imports)

```typescript
  const {
    messages,
    outbox,
    retryOutbox,
    isLoading,
    connectionStatus,
    wsError,
    isRateLimited,
    sendMessage,
    sendTyping,
    refetch: refetchMessages,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
    lastReadByUserId,
    typingPeers,
    editMessage,
    deleteMessage,
    toggleReaction,
  } = useThreadChat(threadId, 'course', user?.id);
```

```typescript
  const { reportRead } = useThreadReadState(threadId, 'course');
```

3. Replace the presence and attachment-composer calls (both previously keyed by `courseId`, now keyed by `threadId` for presence per the unified endpoint, and `threadId` for the attachment `foreignKey` per the Phase 3 design decision):

```typescript
import { getChatThreadPresence } from '@/lib/api/chat-threads';
```

```typescript
  const { data: onlineIds = [], isSuccess: presenceLoaded } = useQuery({
    queryKey: ['chat-thread-presence', threadId],
    queryFn: () => getChatThreadPresence(threadId),
    staleTime: 30_000,
  });
```

```typescript
  const {
    attachmentRefs,
    pendingFiles,
    hasAttachments,
    isUploading: isUploadingAttachments,
    error: attachmentError,
    pickFiles,
    pickImages,
    pickCamera,
    removeAttachment,
    clearAttachments,
    prepareAttachmentsForSend,
    canSendWithAttachments,
  } = useChatAttachmentComposer({
    foreignKey: String(threadId),
  });
```

4. Replace the `sendVoiceAttachment` call site's foreign-key argument:

```typescript
        await sendVoiceAttachment(asset, String(threadId), sendMessage, replyToId);
```

(the surrounding `if (!asset || courseId == null) return;` guard becomes `if (!asset) return;` since `courseId`/`threadId` are now always-defined props)

5. Replace the active-chat-store effect:

```typescript
import { useActiveChatStore } from '@/store/active-chat';
```

```typescript
  useFocusEffect(
    useCallback(() => {
      useActiveChatStore.getState().setActiveThreadChat(threadId, 'course', courseId);
      void refetchMessages();
      return () => {
        useActiveChatStore.getState().clearActiveChat();
      };
    }, [threadId, courseId, refetchMessages])
  );
```

6. Replace the `onTitlePress` navigation target (info route moves under `/chat/threads/`, see Task 15):

```typescript
      onTitlePress={() =>
        router.push({
          pathname: '/chat/threads/[threadId]/info',
          params: { threadId: String(threadId), kind: 'course', courseId: String(courseId) },
        } as never)
      }
```

7. Every other remaining reference to the removed `courseId == null` nullability (e.g. in `handleVoiceRecordingComplete`'s dependency array, `showVoiceMic`, `canSend`, `useChatVoiceRecorder`'s `disabled`) can drop the `|| courseId == null` / `courseId != null &&` checks since `courseId`/`threadId` are now non-nullable props — leave the rest of the ~500 lines (mention composer, timeline rows, message-context menu, `ChatConversationShell` JSX) unchanged.

- [ ] **Step 2: Typecheck the new component in isolation**

Run: `npx tsc --noEmit`
Expected: Errors only about `app/(protected)/chat/[id].tsx` still existing with duplicate/unused imports, and about the not-yet-created `/chat/threads/[threadId]/info` route type — both resolved by Tasks 14–15. No errors should originate from inside the new component file itself; if there are, fix them now (most likely a leftover `id`/`courseId` nullable reference that Step 1.7 missed).

- [ ] **Step 3: Commit**

```bash
git add components/chat/chat-conversation/course-chat-conversation-screen.tsx
git commit -m "refactor(chat): extract course conversation screen into a prop-driven component"
```

(`app/(protected)/chat/[id].tsx` is deleted in Task 14, once the dispatcher route renders this component.)

### Task 13: Extract the DM conversation screen into a prop-driven component

Same pattern as Task 12, applied to `app/(protected)/chat/dm/[threadId].tsx`.

**Files:**
- Create: `components/chat/chat-conversation/dm-chat-conversation-screen.tsx`
- Delete: `app/(protected)/chat/dm/[threadId].tsx` (Task 14)

- [ ] **Step 1: Create the component**

Create `components/chat/chat-conversation/dm-chat-conversation-screen.tsx` with the full contents of `app/(protected)/chat/dm/[threadId].tsx` (`c:\schedjuice\schedjuice-reimagined-mobile\app\(protected)\chat\dm\[threadId].tsx`), applying these changes:

1. Rename the export and accept props instead of `useLocalSearchParams`. The draft-mode logic (starting a brand-new DM before a thread exists) is preserved as-is — it's DM-specific and stays inside this component per the "consolidate hooks/API, not course+DM UI logic" decision:

```typescript
export function DmChatConversationScreen({
  threadId: initialThreadId,
  participantUserId,
  titleParam,
}: {
  threadId: number | null;
  participantUserId: number | null;
  titleParam?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isDarkColorScheme, colors } = useColorScheme();
  const user = useAuthStore((s) => s.user);

  const isDraftMode = initialThreadId == null && participantUserId != null;
  const [resolvedThreadId, setResolvedThreadId] = useState<number | null>(initialThreadId);
  const threadId = resolvedThreadId;
```

(remove the `useLocalSearchParams<{...}>()` block, `isDraftRoute`, `parsedThreadId` — the dispatcher route in Task 14 does that parsing once and passes clean `threadId: number | null` / `participantUserId: number | null` / `titleParam?: string` props. Keep `isStartingConversation`, `message`, `messageRef`, `composerInputRef`, `replyToId`, `editModal`, `messageContext`, and every other piece of local state unchanged.)

2. Replace the chat hook:

```typescript
import { useThreadChat } from '@/lib/chat/use-thread-chat';
import { useThreadReadState } from '@/lib/chat/use-thread-read-state';
```

```typescript
  const {
    messages,
    outbox,
    retryOutbox,
    isLoading,
    connectionStatus,
    wsError,
    isRateLimited,
    sendMessage,
    refetch: refetchMessages,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
    editMessage,
    deleteMessage,
    toggleReaction,
  } = useThreadChat(threadId, 'dm', user?.id);
```

```typescript
  const { reportRead } = useThreadReadState(threadId, 'dm');
```

3. Attachment composer: `foreignKey` was already `String(threadId)` for DM (matches the Phase 3 design — no change needed there), keep as-is:

```typescript
  const {
    attachmentRefs,
    pendingFiles,
    hasAttachments,
    isUploading: isUploadingAttachments,
    error: attachmentError,
    pickFiles,
    pickImages,
    pickCamera,
    removeAttachment,
    clearAttachments,
    prepareAttachmentsForSend,
    canSendWithAttachments,
  } = useChatAttachmentComposer({
    foreignKey: threadId != null ? String(threadId) : '',
    disabled: isDraftMode,
  });
```

4. Active-chat-store effect:

```typescript
import { useActiveChatStore } from '@/store/active-chat';
```

```typescript
  useFocusEffect(
    useCallback(() => {
      if (threadId == null || Number.isNaN(threadId)) return;
      useActiveChatStore.getState().setActiveThreadChat(threadId, 'dm');
      void refetchMessages();
      return () => {
        useActiveChatStore.getState().clearActiveChat();
      };
    }, [threadId, refetchMessages])
  );
```

5. Draft-mode `router.replace` after the thread is created, and the `onTitlePress` info-route navigation, both move under `/chat/threads/`:

```typescript
        router.replace({
          pathname: '/chat/threads/[threadId]',
          params: { threadId: String(thread.id), kind: 'dm', title: titleParam ?? '' },
        } as never);
```

```typescript
      onTitlePress={
        threadId != null && !isDraftMode
          ? () =>
              router.push({
                pathname: '/chat/threads/[threadId]/info',
                params: { threadId: String(threadId), kind: 'dm' },
              } as never)
          : undefined
      }
```

6. Remove the two `if (!isDraftMode && (threadId == null...))` / `if (isDraftMode && (participantUserId == null...))` invalid-state early returns — the dispatcher route in Task 14 validates params before rendering this component, so by the time it mounts, either `threadId` or `participantUserId` is guaranteed valid. Everything else (composer JSX, timeline rows, message-context menu, `ChatConversationShell` props) is unchanged.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Same expected-error state as Task 12 Step 2 (resolved by Tasks 14–15).

- [ ] **Step 3: Commit**

```bash
git add components/chat/chat-conversation/dm-chat-conversation-screen.tsx
git commit -m "refactor(chat): extract DM conversation screen into a prop-driven component"
```

### Task 14: Thin dispatcher route `/chat/threads/[threadId]`

Every navigation call site (list screen, profile "message" button, push notifications) now knows the thread's `kind` (and `courseId` for course) at the point of navigation, so the dispatcher route reads those as query params instead of doing an extra network round-trip to resolve `kind` — no third backend endpoint needed.

**Files:**
- Create: `app/(protected)/chat/threads/[threadId].tsx`
- Delete: `app/(protected)/chat/[id].tsx`, `app/(protected)/chat/dm/[threadId].tsx`

- [ ] **Step 1: Create the dispatcher route**

Create `app/(protected)/chat/threads/[threadId].tsx`:

```typescript
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourseChatConversationScreen } from '@/components/chat/chat-conversation/course-chat-conversation-screen';
import { DmChatConversationScreen } from '@/components/chat/chat-conversation/dm-chat-conversation-screen';
import type { ChatThreadKind } from '@/types/chat';

export default function ChatThreadRoute() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { threadId, kind, courseId, participantUserId, title } = useLocalSearchParams<{
    threadId: string;
    kind: ChatThreadKind;
    courseId?: string;
    participantUserId?: string;
    title?: string;
  }>();

  const isDraft = threadId === 'new';
  const parsedThreadId = isDraft ? null : threadId ? parseInt(threadId, 10) : null;
  const parsedParticipantUserId = participantUserId ? parseInt(participantUserId, 10) : null;
  const parsedCourseId = courseId ? parseInt(courseId, 10) : null;

  if (kind === 'dm') {
    const validThread = parsedThreadId != null && !Number.isNaN(parsedThreadId);
    const validDraft =
      isDraft && parsedParticipantUserId != null && !Number.isNaN(parsedParticipantUserId);
    if (!validThread && !validDraft) {
      return (
        <SafeAreaView edges={['left', 'right']} className="flex-1" style={{ paddingTop: insets.top }}>
          <View className="flex-1 items-center justify-center">
            <Text className="text-muted-foreground">{t('chat.invalidDmThread')}</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <DmChatConversationScreen
        threadId={validThread ? parsedThreadId : null}
        participantUserId={validDraft ? parsedParticipantUserId : null}
        titleParam={title}
      />
    );
  }

  if (kind === 'course' && parsedThreadId != null && !Number.isNaN(parsedThreadId) && parsedCourseId != null) {
    return <CourseChatConversationScreen threadId={parsedThreadId} courseId={parsedCourseId} />;
  }

  return (
    <SafeAreaView edges={['left', 'right']} className="flex-1" style={{ paddingTop: insets.top }}>
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted-foreground">{t('chat.invalidCourse')}</Text>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Delete the two legacy route files**

```bash
git rm "app/(protected)/chat/[id].tsx" "app/(protected)/chat/dm/[threadId].tsx"
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Remaining errors should now only be about call sites still pushing to the old `/chat/[id]` or `/chat/dm/[threadId]` route shapes (list screen, profile screen, notification route builder — fixed in Milestone 5) and about `/chat/threads/[threadId]/info` not existing yet (fixed in Task 15).

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/chat/threads/[threadId].tsx"
git commit -m "feat(chat): add unified /chat/threads/[threadId] dispatcher route"
```

### Task 15: Consolidate chat-info routes and unify the attachment gallery fetch

`app/(protected)/chat/course-info/[id].tsx` and `app/(protected)/chat/dm-info/[threadId].tsx` are already thin one-line dispatchers to `ChatInfoScreen`; merge them into one route under `/chat/threads/`. While here, simplify `useChatInfoAttachments` to always use the unified cursor-paginated `chat/threads/<id>/messages` fetch (both modes can now share one pagination strategy, since course chat is reachable by `threadId` too) instead of branching between page-based (`fetchChatMessages`) and cursor-based (`fetchDmThreadMessagesPage`) fetchers.

**Files:**
- Create: `app/(protected)/chat/threads/[threadId]/info.tsx`
- Delete: `app/(protected)/chat/course-info/[id].tsx`, `app/(protected)/chat/dm-info/[threadId].tsx`
- Modify: `lib/chat/use-chat-info-attachments.ts`
- Modify: `components/chat/chat-info/chat-info-screen.tsx` (pass `threadId` through)

- [ ] **Step 1: Create the dispatcher info route**

Create `app/(protected)/chat/threads/[threadId]/info.tsx`:

```typescript
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ChatInfoScreen } from '@/components/chat/chat-info/chat-info-screen';
import { Text } from '@/components/ui/text';
import type { ChatThreadKind } from '@/types/chat';

export default function ChatThreadInfoRoute() {
  const { threadId, kind, courseId } = useLocalSearchParams<{
    threadId: string;
    kind: ChatThreadKind;
    courseId?: string;
  }>();
  const { t } = useTranslation();
  const parsedThreadId = threadId ? parseInt(threadId, 10) : null;
  const parsedCourseId = courseId ? parseInt(courseId, 10) : null;

  if (parsedThreadId == null || Number.isNaN(parsedThreadId)) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-center text-muted-foreground">
          {kind === 'course' ? t('chat.invalidCourse') : t('chat.invalidDmThread')}
        </Text>
      </View>
    );
  }

  if (kind === 'course') {
    if (parsedCourseId == null || Number.isNaN(parsedCourseId)) {
      return (
        <View className="flex-1 items-center justify-center bg-background px-6">
          <Text className="text-center text-muted-foreground">{t('chat.invalidCourse')}</Text>
        </View>
      );
    }
    return <ChatInfoScreen mode="course" courseId={parsedCourseId} threadId={parsedThreadId} />;
  }

  return <ChatInfoScreen mode="dm" threadId={parsedThreadId} />;
}
```

- [ ] **Step 2: Delete the two legacy info routes**

```bash
git rm "app/(protected)/chat/course-info/[id].tsx" "app/(protected)/chat/dm-info/[threadId].tsx"
```

- [ ] **Step 3: Update `ChatInfoScreen`'s props to accept `threadId` for course mode**

In `components/chat/chat-info/chat-info-screen.tsx`, change the props union (currently `{ mode: 'course'; courseId: number } | { mode: 'dm'; threadId: number }`) to always carry `threadId` and make `courseId` course-only metadata:

```typescript
type ChatInfoScreenProps =
  | { mode: 'course'; courseId: number; threadId: number }
  | { mode: 'dm'; threadId: number };
```

Update the `attachmentsState` call (previously branching `{ mode: 'course', courseId } : { mode: 'dm', threadId }`) to always pass `threadId`:

```typescript
  const attachmentsState = useChatInfoAttachments({ threadId: props.threadId });
```

- [ ] **Step 4: Simplify `useChatInfoAttachments` to a single unified fetch path**

Replace `lib/chat/use-chat-info-attachments.ts` in full:

```typescript
import { useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import {
  CHAT_ATTACHMENT_GROUP_ORDER,
  collectChatAttachmentsFromMessages,
  groupChatSharedAttachments,
  type ChatAttachmentGroupKey,
  type ChatSharedAttachment,
  type ChatSharedAttachmentGroups,
} from '@/lib/chat/collect-chat-attachments-from-messages';
import { fetchChatThreadMessagesPage } from '@/lib/chat/chat-thread-messages-query';
import { useHydratedChatMessages } from '@/lib/chat/use-hydrated-chat-messages';
import type { ChatMessage } from '@/types/chat';

export const chatInfoAttachmentsQueryKey = (threadId: number) =>
  ['chat-info-attachments', threadId] as const;

export function useChatInfoAttachments({ threadId }: { threadId: number | null }): {
  attachments: ChatSharedAttachment[];
  groups: ChatSharedAttachmentGroups;
  nonEmptyGroupKeys: ChatAttachmentGroupKey[];
  isLoading: boolean;
  isFetchingMore: boolean;
  isComplete: boolean;
} {
  const enabled = threadId != null && Number.isFinite(threadId) && threadId > 0;

  const query = useInfiniteQuery({
    queryKey: enabled ? chatInfoAttachmentsQueryKey(threadId!) : ['chat-info-attachments', 'disabled'],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      fetchChatThreadMessagesPage(threadId!, pageParam as number | undefined),
    enabled,
    getNextPageParam: () => undefined,
    getPreviousPageParam: (firstPage) => {
      if (!firstPage.hasMore || firstPage.messages.length === 0) return undefined;
      return firstPage.messages[0]?.id;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (query.hasPreviousPage && !query.isFetchingPreviousPage && !query.isLoading) {
      void query.fetchPreviousPage();
    }
  }, [query.hasPreviousPage, query.isFetchingPreviousPage, query.isLoading, query.fetchPreviousPage]);

  const allMessages: ChatMessage[] = useMemo(() => {
    const pages = query.data?.pages ?? [];
    return pages.flatMap((page) => page.messages);
  }, [query.data?.pages]);

  const hydratedMessages = useHydratedChatMessages(allMessages);

  const attachments = useMemo(
    () => collectChatAttachmentsFromMessages(hydratedMessages),
    [hydratedMessages]
  );

  const groups = useMemo(() => groupChatSharedAttachments(attachments), [attachments]);

  const nonEmptyGroupKeys = useMemo(
    () => CHAT_ATTACHMENT_GROUP_ORDER.filter((key) => groups[key].length > 0),
    [groups]
  );

  const isComplete = enabled && !query.isLoading && !query.hasPreviousPage && !query.isFetchingPreviousPage;

  return {
    attachments,
    groups,
    nonEmptyGroupKeys,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingPreviousPage || (query.hasPreviousPage && !query.isLoading),
    isComplete,
  };
}
```

- [ ] **Step 5: Typecheck and run existing attachment tests**

Run: `npx tsc --noEmit`
Expected: No errors in `use-chat-info-attachments.ts` or `chat-info-screen.tsx`. If `collect-chat-attachments-from-messages.test.ts` or any other test imports `chatInfoAttachmentsQueryKey` with the old `(mode, id)` signature, update it to the new `(threadId)` signature.

Run: `pnpm test __tests__/lib/chat/collect-chat-attachments-from-messages.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "app/(protected)/chat/threads/[threadId]/info.tsx" lib/chat/use-chat-info-attachments.ts components/chat/chat-info/chat-info-screen.tsx
git commit -m "feat(chat): unify chat-info route and attachment gallery fetch on threadId"
```

---

## Milestone 5 — Mobile: list screen and remaining navigation call sites

### Task 16: Chat list screen — batched preview + new route params

**Files:**
- Modify: `app/(protected)/(tabs)/chat/index.tsx`

- [ ] **Step 1: Swap the batch-preview data source**

In `app/(protected)/(tabs)/chat/index.tsx`, replace the import:

```typescript
import { fetchCourseChatLastMessages } from '@/lib/api/course-chat-previews';
```

(remove `import { fetchLastChatMessagesBatch } from '@/lib/api/chat';`)

Replace the query (previously `fetchLastChatMessagesBatch`, `queryKey: ['chat-last-messages-batch', courseIdsKey]`):

```typescript
  const { data: lastMessageByCourse = {}, refetch: refetchLastMessages } = useQuery({
    queryKey: ['course-chat-last-messages', courseIdsKey],
    queryFn: () => fetchCourseChatLastMessages(courseIds),
    enabled: courseIds.length > 0,
    staleTime: 0,
  });
```

(query key renamed from `'chat-last-messages-batch'` to `'course-chat-last-messages'` — Task 20 updates the notification-triggered invalidation to match.)

- [ ] **Step 2: Update the course preview mapping to the new response shape and real unread count**

Replace the `courseItems` mapping inside `filteredConversations`:

```typescript
    const courseItems: ConversationListItem[] = courses.map((item) => {
      const preview = lastMessageByCourse[String(item.course.id)];
      const lastMsg = preview?.last_message;
      const lastMs = lastMsg ? new Date(lastMsg.created_at).getTime() : 0;
      const hasAttachments = Boolean(lastMsg?.content?.attachments?.length);

      const previewText =
        lastMsg?.content?.text?.trim() ||
        (hasAttachments && isAudioOnlyChatAttachmentMessage(lastMsg!.content)
          ? t('chat.voiceMessagePreview')
          : '') ||
        (hasAttachments ? t('chat.dmAttachmentPreview') : '') ||
        t('chat.noMessagesYet');

      return {
        kind: 'course' as const,
        key: `course-${item.course.id}`,
        courseId: item.course.id,
        name: item.course.title,
        lastMessage: previewText,
        timestamp: lastMsg ? new Date(lastMsg.created_at).getTime() : undefined,
        unreadCount: preview?.unread_count ?? 0,
        sortMs: lastMs,
      };
    });
```

- [ ] **Step 3: Update the course tap handler to pass `kind`/`courseId`/`threadId`**

Course rows previously navigated straight to `/chat/${courseId}` using only the `courseId` (the backend resolved-or-created the thread lazily on WS connect). The new merged route needs `threadId` up front. Resolve it once on tap via the existing `courses/<id>/chat/thread` GET-or-create endpoint (already exposed via `resolveCourseChatThread` from Task 7):

```typescript
import { resolveCourseChatThread } from '@/lib/api/chat-threads';
```

```typescript
  const handleChatPress = useCallback(
    async (courseId: number) => {
      try {
        const thread = await resolveCourseChatThread(courseId);
        router.push({
          pathname: '/chat/threads/[threadId]',
          params: { threadId: String(thread.id), kind: 'course', courseId: String(courseId) },
        } as never);
      } catch {
        Toast.show({ type: 'error', text1: t('chat.couldNotOpenChat') });
      }
    },
    [router, t]
  );
```

(add `import { Toast } from 'toastify-react-native';` if not already imported in this file, and add the `chat.couldNotOpenChat` key to the locale files per Task 22's i18n check — see `.cursor/rules/i18n.mdc`: add the same English string to `lib/i18n/locales/my.ts` as a placeholder.)

- [ ] **Step 4: Update the DM tap handlers to pass `kind`**

```typescript
  const handleDmPress = useCallback(
    (thread: DmThread, titleOverride?: string) => {
      clearDmThreadUnreadInCache(queryClient, user?.id, thread.id);
      const title = titleOverride ?? thread.other_participant?.name ?? t('chat.directMessage');
      router.push({
        pathname: '/chat/threads/[threadId]',
        params: { threadId: String(thread.id), kind: 'dm', title },
      } as never);
    },
    [queryClient, router, t, user?.id]
  );
```

```typescript
      router.push({
        pathname: '/chat/threads/[threadId]',
        params: {
          threadId: 'new',
          kind: 'dm',
          participantUserId: String(participant.id),
          title: participant.name,
        },
      } as never);
```

(this second snippet is inside `openComposeDm` — same file, replaces its existing `router.push` call.)

- [ ] **Step 5: Manual verification**

Run: `npx tsc --noEmit`
Expected: No errors in `app/(protected)/(tabs)/chat/index.tsx`.

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "app/(protected)/(tabs)/chat/index.tsx" lib/i18n/locales/en.ts lib/i18n/locales/my.ts
git commit -m "feat(chat): list screen uses batched course preview and unified thread routes"
```

### Task 17: Update the remaining DM navigation call site

**Files:**
- Modify: `components/profile/staff-member-profile-screen.tsx`

- [ ] **Step 1: Update both `router.push` calls**

In `components/profile/staff-member-profile-screen.tsx`, replace:

```typescript
    if (existing) {
      router.push({
        pathname: '/chat/threads/[threadId]',
        params: { threadId: String(existing.id), kind: 'dm', title: subject.name },
      } as never);
      return;
    }
    router.push({
      pathname: '/chat/threads/[threadId]',
      params: {
        threadId: 'new',
        kind: 'dm',
        participantUserId: String(subject.id),
        title: subject.name,
      },
    } as never);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors in this file.

- [ ] **Step 3: Commit**

```bash
git add components/profile/staff-member-profile-screen.tsx
git commit -m "feat(chat): update profile message button to unified thread route"
```

---

## Milestone 6 — Mobile: notifications

### Task 18: Update notification parsing/routing to the unified thread route

**Files:**
- Modify: `lib/notifications/chat-notification.ts`
- Test: `__tests__/lib/notifications/chat-notification.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/notifications/chat-notification.test.ts`:

```typescript
import {
  getChatNotificationRoute,
  parseChatNotificationData,
} from '@/lib/notifications/chat-notification';

describe('parseChatNotificationData', () => {
  it('requires both course_id and thread_id for course_chat', () => {
    expect(
      parseChatNotificationData({ type: 'course_chat', course_id: '5', thread_id: '9' })
    ).toMatchObject({ type: 'course_chat', courseId: 5, threadId: 9 });
    expect(parseChatNotificationData({ type: 'course_chat', course_id: '5' })).toBeNull();
    expect(parseChatNotificationData({ type: 'course_chat', thread_id: '9' })).toBeNull();
  });

  it('requires thread_id for dm', () => {
    expect(parseChatNotificationData({ type: 'dm', thread_id: '9' })).toMatchObject({
      type: 'dm',
      threadId: 9,
    });
    expect(parseChatNotificationData({ type: 'dm' })).toBeNull();
  });

  it('returns null for unknown types', () => {
    expect(parseChatNotificationData({ type: 'something_else' })).toBeNull();
  });
});

describe('getChatNotificationRoute', () => {
  it('builds the unified thread route for course_chat with kind and courseId params', () => {
    const route = getChatNotificationRoute({ type: 'course_chat', courseId: 5, threadId: 9 });
    expect(route).toEqual({
      pathname: '/chat/threads/[threadId]',
      params: { threadId: '9', kind: 'course', courseId: '5' },
    });
  });

  it('builds the unified thread route for dm with kind and optional title', () => {
    const route = getChatNotificationRoute({ type: 'dm', threadId: 9, senderName: 'Ada' });
    expect(route).toEqual({
      pathname: '/chat/threads/[threadId]',
      params: { threadId: '9', kind: 'dm', title: 'Ada' },
    });
  });

  it('omits title when senderName is absent', () => {
    const route = getChatNotificationRoute({ type: 'dm', threadId: 9 });
    expect(route).toEqual({
      pathname: '/chat/threads/[threadId]',
      params: { threadId: '9', kind: 'dm' },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test __tests__/lib/notifications/chat-notification.test.ts`
Expected: FAIL — course_chat currently validates on `courseId` alone (missing-`threadId` case wrongly passes), and the route shape still points at `/chat/${courseId}` / `/chat/dm/[threadId]`.

- [ ] **Step 3: Update the module**

Replace `lib/notifications/chat-notification.ts` in full:

```typescript
import type { Href } from 'expo-router';

export type ChatNotificationType = 'course_chat' | 'dm';

export type ChatNotificationData = {
  type: ChatNotificationType;
  courseId?: number;
  threadId?: number;
  messageId?: number;
  senderId?: number;
  senderName?: string;
};

function parsePositiveInt(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseChatNotificationData(raw: unknown): ChatNotificationData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (data.type !== 'course_chat' && data.type !== 'dm') return null;

  const courseId = parsePositiveInt(data.course_id);
  const threadId = parsePositiveInt(data.thread_id);
  const messageId = parsePositiveInt(data.message_id);
  const senderId = parsePositiveInt(data.sender_id);
  const senderName = typeof data.sender_name === 'string' ? data.sender_name.trim() : undefined;

  // Both course_chat and dm now route through /chat/threads/[threadId], so both
  // require thread_id. course_chat additionally requires course_id (used as a
  // route param so the destination screen can fetch course-specific metadata
  // without a second network round-trip).
  if (data.type === 'course_chat' && (!courseId || !threadId)) return null;
  if (data.type === 'dm' && !threadId) return null;

  return {
    type: data.type,
    courseId,
    threadId,
    messageId,
    senderId,
    senderName: senderName || undefined,
  };
}

export function isChatNotification(raw: unknown): boolean {
  return parseChatNotificationData(raw) !== null;
}

export function getChatNotificationRoute(data: ChatNotificationData): Href | null {
  if (data.type === 'course_chat' && data.threadId && data.courseId) {
    return {
      pathname: '/chat/threads/[threadId]',
      params: {
        threadId: String(data.threadId),
        kind: 'course',
        courseId: String(data.courseId),
      },
    } as Href;
  }
  if (data.type === 'dm' && data.threadId) {
    const params: { threadId: string; kind: 'dm'; title?: string } = {
      threadId: String(data.threadId),
      kind: 'dm',
    };
    if (data.senderName) params.title = data.senderName;
    return { pathname: '/chat/threads/[threadId]', params } as Href;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test __tests__/lib/notifications/chat-notification.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/chat-notification.ts __tests__/lib/notifications/chat-notification.test.ts
git commit -m "feat(chat): route chat push notifications to the unified thread route"
```

**Note:** this requires the backend Task 4 change (course chat pushes now include `thread_id`) to already be deployed — a course chat push sent by a not-yet-updated backend will fail `parseChatNotificationData`'s new `!threadId` check and the tap will silently no-op (no crash, just no navigation). Confirm Milestone 1 is deployed before releasing this mobile build.

### Task 19: Update push-triggered query invalidation to the unified query key

**Files:**
- Modify: `lib/notifications/use-push-notifications.ts`

- [ ] **Step 1: Update `invalidateChatQueries`**

Replace the imports:

```typescript
import { chatThreadMessagesQueryKey } from '@/lib/chat/chat-thread-messages-query';
```

(remove `import { courseChatMessagesQueryKey } from '@/lib/chat/course-chat-messages-query';` and `import { dmThreadMessagesQueryKey } from '@/lib/chat/dm-chat-messages-query';`)

Replace the function body:

```typescript
function invalidateChatQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: number | undefined,
  parsed: ChatNotificationData
): void {
  queryClient.invalidateQueries({ queryKey: ['course-chat-last-messages'] });
  if (userId != null) {
    queryClient.invalidateQueries({ queryKey: ['dm-threads', userId] });
  }
  if (parsed.threadId != null) {
    queryClient.invalidateQueries({ queryKey: chatThreadMessagesQueryKey(parsed.threadId) });
  }
}
```

(query key `'chat-last-messages-batch'` → `'course-chat-last-messages'` matches the rename in Task 16 Step 1; both `course_chat` and `dm` notifications now always carry `threadId` after Task 18, so the single `chatThreadMessagesQueryKey` branch replaces the previous two kind-specific branches.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors in `use-push-notifications.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/use-push-notifications.ts
git commit -m "feat(chat): invalidate the unified thread messages query key on push"
```

---

## Milestone 7 — Cleanup and verification

### Task 20: Delete superseded files and fix remaining references

**Files:**
- Delete: `lib/chat/use-course-chat.ts`, `lib/chat/use-dm-chat.ts`, `lib/chat/use-course-chat-read-state.ts`, `lib/chat/use-dm-chat-read-state.ts`, `lib/api/chat.ts`, `lib/chat/course-chat-messages-query.ts`
- Modify: `lib/chat/dm-chat-messages-query.ts` (remove message-fetch exports, keep thread-list-cache exports)

- [ ] **Step 1: Grep for any remaining references before deleting**

```bash
grep -rn "use-course-chat\b\|use-dm-chat\b\|use-course-chat-read-state\|use-dm-chat-read-state\|lib/api/chat'\|course-chat-messages-query" --include="*.ts" --include="*.tsx" app components lib store
```

Expected: only self-references inside the files about to be deleted, plus `lib/chat/dm-chat-messages-query.ts`'s own file (kept) and any test files exercising the now-dead modules directly (delete those test files too, e.g. if `__tests__/lib/chat/use-course-chat*.test.ts` exists — none was found during planning, but re-check since the codebase may have changed).

- [ ] **Step 2: Trim `dm-chat-messages-query.ts` to only the thread-list-cache helpers**

Replace `lib/chat/dm-chat-messages-query.ts` in full (message-fetch responsibility now lives in `chat-thread-messages-query.ts`; this file keeps only the DM-thread-*list* cache helpers, which have no course-chat equivalent):

```typescript
import type { QueryClient } from '@tanstack/react-query';

import type { DmThread } from '@/types/chat';

export const dmThreadsQueryKey = (userId: number | undefined) => ['dm-threads', userId] as const;

export function clearDmThreadUnreadInCache(
  queryClient: QueryClient,
  userId: number | undefined,
  threadId: number
): void {
  if (!userId) return;
  queryClient.setQueryData<DmThread[]>(dmThreadsQueryKey(userId), (prev) => {
    if (!prev) return prev;
    return prev.map((thread) => (thread.id === threadId ? { ...thread, unread_count: 0 } : thread));
  });
}

export function invalidateDmThreadsQuery(queryClient: QueryClient, userId?: number): void {
  if (userId != null) {
    void queryClient.invalidateQueries({ queryKey: dmThreadsQueryKey(userId) });
    return;
  }
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'dm-threads',
  });
}
```

- [ ] **Step 3: Delete the superseded files**

```bash
git rm lib/chat/use-course-chat.ts lib/chat/use-dm-chat.ts lib/chat/use-course-chat-read-state.ts lib/chat/use-dm-chat-read-state.ts lib/api/chat.ts lib/chat/course-chat-messages-query.ts
```

- [ ] **Step 4: Full typecheck and lint**

Run: `npx tsc --noEmit`
Expected: PASS (zero errors)

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/chat/dm-chat-messages-query.ts
git commit -m "chore(chat): delete course/DM-specific chat modules superseded by unified thread modules"
```

### Task 21: Full mobile test suite + manual smoke check

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `pnpm test:unit`
Expected: PASS (all suites, including every new test file added in this plan)

- [ ] **Step 2: Run coverage and check for regressions**

Run: `pnpm test:coverage`
Expected: No coverage regression versus the pre-migration baseline for `lib/chat/`, `lib/api/`, `lib/notifications/`, `store/`.

- [ ] **Step 3: Manual smoke test (dev build against a backend with Milestone 1 deployed)**

Exercise, in order:
1. Chat list screen loads with correct unread badges for both course and DM rows, and course previews (no console errors about `fetchLastChatMessagesBatch`).
2. Tap a course row → lands on `/chat/threads/<id>` with `kind=course`, sends/receives a message over WS, typing indicator and read receipts still work.
3. Tap a DM row → lands on `/chat/threads/<id>` with `kind=dm`, sends/receives a message.
4. Start a brand-new DM from a profile screen ("message" button) → draft mode still works, thread resolves and `router.replace`s to the real thread id.
5. Open chat info (both course and DM) from the conversation header → attachment gallery still loads and paginates.
6. Send an attachment in both a course and a DM conversation → confirm upload succeeds (new `foreignKey` is the thread id for both).
7. Background the app, send a course chat push and a DM push from another account, tap each → both deep-link straight into the correct `/chat/threads/<id>` conversation.

- [ ] **Step 4: Final commit (if any smoke-test fixes were needed)**

Only if Step 3 surfaced issues; otherwise this task ends at Step 3 with no additional commit.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-04-unified-chat-schema-phase3-mobile-migration-design.md`):
- Mobile-first scope, web/legacy cleanup deferred → respected; no `schedjuice-reimagined-fe` files touched.
- Thread-centric routes (`/chat/threads/[threadId]`), breaking change accepted → Tasks 12–17.
- Hooks/API consolidated (`useThreadChat`, `useThreadReadState`, `lib/api/chat-threads.ts`) → Tasks 9, 10, 7.
- Attachment `foreignKey` = `threadId` for both kinds, no backfill → Task 12 Step 1.3 (course now uses `threadId`), Task 13 (DM already did).
- New batch course preview endpoint + real unread counts → Tasks 3, 8, 16.
- `thread_id` on course push payloads → Task 4, consumed in Task 18.
- Two-endpoint list design (no merged DM+course list endpoint) → Task 16 keeps `fetchDmThreads` and `fetchCourseChatLastMessages` as two separate calls, per the locked decision.

**Placeholder scan:** no `TBD`/`later`/"similar to Task N" placeholders; every step has literal file paths and complete code. The one intentionally-lighter step (Task 12 Step 1.7 "leave the rest of the ~500 lines unchanged") is a deliberate scope limiter for an already-fully-quoted source file, not a placeholder for unwritten logic.

**Type consistency:** `ChatThreadKind` (`'course' | 'dm'`) is defined once in `types/chat.ts` (Task 5) and used identically in `use-thread-chat.ts`, `use-thread-read-state.ts`, `store/active-chat.ts`, both route dispatcher files, and `chat-notification.ts`. `threadId`/`kind`/`courseId` route param names are identical across every `router.push` call site (Tasks 14, 16, 17) and both dispatcher routes (Tasks 14, 15). Backend `bulk_thread_unread_counts` (Task 1) is the single rename target referenced by both `list_dm_threads_for_user` (existing call site) and `CourseChatLastMessagesBatchView` (Task 3) — no leftover `bulk_dm_unread_counts` references remain after Task 1.
