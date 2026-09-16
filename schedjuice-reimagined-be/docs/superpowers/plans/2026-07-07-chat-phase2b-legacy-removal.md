# Chat Phase 2b — Legacy Route Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy course-specific and DM-specific chat HTTP/WebSocket surface from `schedjuice-reimagined-be`, leaving only the unified `chat/threads/...` surface, while fixing a real behavior gap (missing mention validation + broadcast on unified course-thread message edits) discovered along the way.

**Architecture:** Two sequential PRs. PR1 adds the missing unified-endpoint test coverage and fixes the `ChatThreadMessageDetailView.patch` parity gap — purely additive, no removal, safe to merge standalone. PR2 removes the 10 legacy HTTP routes, 2 legacy WS routes/consumers, 10 legacy view classes, 3 orphaned serializers, consolidates the legacy-named realtime broadcast helpers into one kind-agnostic function, deletes dead code, and updates the stale doc.

**Tech Stack:** Django 4.2, Django REST Framework, Django Channels (WebSocket), django-tenant-schemas, Python's `unittest`/Django `TestCase` against local Docker Postgres.

**Spec:** [`docs/superpowers/specs/2026-07-07-chat-phase2b-legacy-removal-design.md`](../specs/2026-07-07-chat-phase2b-legacy-removal-design.md)

**Running tests:** Always `./scripts/run_backend_tests.sh app_chat.tests.<module>` (local Docker Postgres, `--keepdb --noinput` baked in). Never omit `--keepdb`. See `.cursor/rules/python-backend-env-and-tests.mdc`.

---

## Verified-at-planning-time corrections to the spec

Reading the actual code turned up two corrections to the design spec's assumptions (both make the removal *safer/smaller* than the spec implied, not larger — no new approval needed, this is exactly the "verify at implementation time" step the spec flagged):

1. **Only 3 of the 5 flagged serializers are actually orphaned.** `CourseChatMessageSerializer` is still used by `app_chat/consumers.py::build_new_thread_message_broadcast_payload` for the unified `ChatThreadConsumer`'s course-kind WS message broadcast. `DirectMessageSerializer` is still used by `app_chat/realtime.py::build_dm_message_broadcast_payload` (called from unified `ChatThreadMessageListCreateView.post` and `ChatThreadListCreateView.post`) and by `app_chat/consumers.py` for DM-kind WS broadcast, plus directly in `test_thread_endpoints.py` and `test_dm_replies.py`. **Only `CourseChatReadStateSerializer`, `DirectMessageReadStateSerializer`, and `DirectMessageThreadSerializer` are safe to remove** — each has exactly one call site, in a legacy view being deleted.
2. **`broadcast_to_course_chat` / `broadcast_to_dm_chat` are called by both legacy AND unified views**, not legacy-only. Unified call sites: `ChatThreadMessageDetailView.delete`, `ChatThreadMessageReactionToggleView.post` (both branches), `ChatThreadReadStatePutView.put`. These need their call sites *updated to the consolidated name*, not just deleted alongside the legacy views.

---

# PR1 — Test coverage + PATCH parity fix (no removal)

## Task 1: Fix course-thread message PATCH parity gap

**Files:**
- Modify: `app_chat/views.py:677-711` (`ChatThreadMessageDetailView.patch`)
- Test: `app_chat/tests/test_course_chat_permissions.py`

- [ ] **Step 1: Write the failing tests**

Add to `app_chat/tests/test_course_chat_permissions.py`. First, add `ChatThreadMessageDetailView` to the existing import from `app_chat.views` (change line 39 from `from app_chat.views import CourseChatMessageDetailView` to):

```python
from app_chat.views import ChatThreadMessageDetailView, CourseChatMessageDetailView
```

Then append these two test methods to `CourseChatPermissionsTests`:

```python
    @patch("app_chat.views.broadcast_to_course_chat")
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_unified_patch_rejects_invalid_mention(self, mock_authenticate, mock_broadcast):
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

    @patch("app_chat.views.broadcast_to_course_chat")
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_unified_patch_broadcasts_message_edited(self, mock_authenticate, mock_broadcast):
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_course_chat_permissions -v 2`
Expected: `test_unified_patch_rejects_invalid_mention` FAILs (PATCH currently succeeds with 200 instead of rejecting the bad mention); `test_unified_patch_broadcasts_message_edited` FAILs (`mock_broadcast.assert_called_once()` fails — broadcast never called).

- [ ] **Step 3: Implement the fix**

In `app_chat/views.py`, replace the `patch` method of `ChatThreadMessageDetailView` (lines 680-711):

```python
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
            if message.thread.kind == ChatThreadKind.COURSE:
                validate_mention_user_ids(
                    message.thread.course_id,
                    mention_user_ids_from_content_mentions(normalized_content["mentions"]),
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
        data = serializers.ChatThreadMessageSerializer(message, context={"request": request}).data
        if message.thread.kind == ChatThreadKind.COURSE:
            invalidate_course_chat_list_cache(connection.schema_name, message.thread.course_id)
            broadcast_to_course_chat(
                connection.schema_name,
                message.thread_id,
                {"event": "message_edited", "data": data},
            )
        return BaseView.send_response(False, "success", {"data": data}, status=status.HTTP_200_OK)
```

No new imports needed — `validate_mention_user_ids`, `mention_user_ids_from_content_mentions`, `invalidate_course_chat_list_cache`, and `broadcast_to_course_chat` are already imported at the top of `app_chat/views.py`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_course_chat_permissions -v 2`
Expected: All tests PASS, including the two new ones.

- [ ] **Step 5: Run the full chat suite to check for regressions**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: All PASS (in particular `test_thread_endpoints.ChatThreadMessageDetailViewTests.test_patch_own_dm_message` must still pass — DM-kind threads skip the new mention-validation branch entirely since `message.thread.kind == ChatThreadKind.COURSE` is false for DM).

- [ ] **Step 6: Commit**

```bash
git add app_chat/views.py app_chat/tests/test_course_chat_permissions.py
git commit -m "$(cat <<'EOF'
fix(chat): validate mentions and broadcast on unified course message edit

ChatThreadMessageDetailView.patch was missing the mention validation and
message_edited broadcast that the legacy CourseChatMessageDetailView.patch
has, silently regressing course chat edit behavior for any client already
using the unified endpoint (web FE already does).
EOF
)"
```

---

## Task 2: Add RBAC coverage for the unified message-list endpoint

**Files:**
- Modify: `app_chat/tests/test_rbac_chat.py`

- [ ] **Step 1: Write the tests**

Append to `ChatRBACTests` in `app_chat/tests/test_rbac_chat.py`:

```python
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_student_member_can_list_course_chat_via_unified_endpoint(self, mock_authenticate):
        mock_authenticate.return_value = (_jwt_token_user(self.student.email), None)
        with schema_context(self.schema_name):
            from app_chat.services import get_or_create_course_chat_thread

            thread_id = get_or_create_course_chat_thread(self.course.id).id
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.student).get(
                f"/api/v1/chat/threads/{thread_id}/messages"
            )
        self.assertEqual(resp.status_code, 200, resp.content)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_admin_without_participate_permission_denied_via_unified_endpoint(
        self, mock_authenticate
    ):
        mock_authenticate.return_value = (_jwt_token_user(self.admin.email), None)
        with schema_context(self.schema_name):
            from app_chat.services import get_or_create_course_chat_thread

            thread_id = get_or_create_course_chat_thread(self.course.id).id
        with self.settings(RBAC_ENFORCE="enforce"):
            resp = self._client(self.admin).get(
                f"/api/v1/chat/threads/{thread_id}/messages"
            )
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_rbac_chat -v 2`
Expected: All 4 tests PASS (the 2 existing legacy-endpoint tests plus these 2 new ones — the unified endpoint already has identical RBAC wiring via `ChatApiView`'s `required_permissions`, so no implementation change is needed here).

- [ ] **Step 3: Commit**

```bash
git add app_chat/tests/test_rbac_chat.py
git commit -m "$(cat <<'EOF'
test(chat): cover RBAC enforcement on unified message-list endpoint

Locks in RBAC_ENFORCE=enforce behavior on GET chat/threads/{id}/messages
ahead of removing the legacy courses/{id}/chat/messages route.
EOF
)"
```

---

## Task 3: Add cursor-pagination coverage for the unified message-list endpoint

**Files:**
- Modify: `app_chat/tests/test_message_cursor_pagination.py`

- [ ] **Step 1: Write the tests**

Append to `ChatMessageCursorPaginationTests` in `app_chat/tests/test_message_cursor_pagination.py`:

```python
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_course_chat_before_id_returns_older_page_via_unified_endpoint(
        self, mock_authenticate
    ):
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
    def test_dm_list_caps_initial_response_via_unified_endpoint(self, mock_authenticate):
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
    def test_dm_before_id_returns_older_messages_via_unified_endpoint(self, mock_authenticate):
        mock_authenticate.return_value = (_jwt_token_user(self.student.email), None)
        with schema_context(self.schema_name):
            self._seed_dm_messages(120)
            oldest_in_first_page = (
                ChatMessage.objects.filter(thread=self.thread).order_by("-id")[20]
            )
            resp = self._client(self.student).get(
                f"/api/v1/chat/threads/{self.thread.id}/messages"
                f"?before_id={oldest_in_first_page.id}&size=20"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        rows = resp.json()["data"]["results"]
        self.assertEqual(len(rows), 20)
        self.assertTrue(all(row["id"] < oldest_in_first_page.id for row in rows))
```

- [ ] **Step 2: Run to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_message_cursor_pagination -v 2`
Expected: All PASS (7 total: 3 original legacy-endpoint tests, 1 original unit test, 4 new).

- [ ] **Step 3: Commit**

```bash
git add app_chat/tests/test_message_cursor_pagination.py
git commit -m "$(cat <<'EOF'
test(chat): cover cursor pagination on unified message-list endpoint

Adds course + DM before_id/initial-load coverage directly against
chat/threads/{id}/messages ahead of removing the legacy endpoints.
EOF
)"
```

---

## Task 4: Add reaction-toggle coverage for the unified endpoint

**Files:**
- Modify: `app_chat/tests/test_reactions.py`

- [ ] **Step 1: Write the tests**

Add `ChatThreadMessageReactionToggleView` to the import from `app_chat.views` in `app_chat/tests/test_reactions.py` (change line 32):

```python
from app_chat.views import (
    ChatThreadMessageReactionToggleView,
    CourseChatMessageReactionToggleView,
    DirectMessageReactionToggleView,
)
```

Append to `ChatMessageReactionTests`:

```python
    @patch("app_chat.views.broadcast_to_course_chat")
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_course_toggle_broadcasts_via_unified_endpoint(self, mock_authenticate, mock_broadcast):
        with schema_context(self.schema_name):
            course, author, _other = self._create_course_with_students()
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "hello", "mentions": []},
            )
            thread_id, mid = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{thread_id}/messages/{mid}/reactions",
            {"emoji": "👍"},
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(author.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageReactionToggleView.as_view()(
                req, thread_id=thread_id, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_broadcast.assert_called_once()
        payload = mock_broadcast.call_args[0][2]
        self.assertEqual(payload["event"], "reaction_changed")
        self.assertEqual(payload["data"]["message_id"], mid)

    @patch("app_chat.views.broadcast_to_dm_chat")
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_dm_toggle_broadcasts_via_unified_endpoint(self, mock_authenticate, mock_broadcast):
        with schema_context(self.schema_name):
            student = next(u for u in User.objects.iterator(chunk_size=500) if u.is_student())
            teacher = next(u for u in User.objects.iterator(chunk_size=500) if u.is_teacher())
            thread, _ = get_or_create_dm_thread(student, teacher.id)
            dm = ChatMessage.objects.create(
                thread=thread,
                user=student,
                content={"text": "hi", "mentions": []},
            )
            mid, tid = dm.id, thread.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{tid}/messages/{mid}/reactions",
            {"emoji": "🎉"},
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(student.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageReactionToggleView.as_view()(
                req, thread_id=tid, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_broadcast.assert_called_once()
        args = mock_broadcast.call_args[0]
        self.assertEqual(args[1], tid)
        self.assertEqual(args[2]["event"], "reaction_changed")

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_course_toggle_forbidden_non_member_via_unified_endpoint(self, mock_authenticate):
        with schema_context(self.schema_name):
            course, author, other = self._create_course_with_students()
            outsider = User.objects.exclude(pk__in=[author.pk, other.pk]).first()
            self.assertIsNotNone(outsider)
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "hello", "mentions": []},
            )
            thread_id, mid = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{thread_id}/messages/{mid}/reactions",
            {"emoji": "👍"},
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(outsider.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageReactionToggleView.as_view()(
                req, thread_id=thread_id, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_invalid_emoji_returns_400_via_unified_endpoint(self, mock_authenticate):
        with schema_context(self.schema_name):
            course, author, _other = self._create_course_with_students()
            thread = get_or_create_course_chat_thread(course.id)
            msg = ChatMessage.objects.create(
                thread=thread,
                user=author,
                content={"text": "hello", "mentions": []},
            )
            thread_id, mid = thread.id, msg.id

        factory = APIRequestFactory()
        req = factory.post(
            f"/chat/threads/{thread_id}/messages/{mid}/reactions",
            {"emoji": "🦄"},
            format="json",
        )
        mock_authenticate.return_value = (_jwt_token_user(author.email), None)

        with schema_context(self.schema_name):
            res = ChatThreadMessageReactionToggleView.as_view()(
                req, thread_id=thread_id, message_id=mid
            )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
```

- [ ] **Step 2: Run to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_reactions -v 2`
Expected: All PASS (10 total: 6 original, 4 new).

- [ ] **Step 3: Commit**

```bash
git add app_chat/tests/test_reactions.py
git commit -m "$(cat <<'EOF'
test(chat): cover reaction toggle broadcast/forbidden/validation on unified endpoint

Adds course + DM coverage directly against
chat/threads/{id}/messages/{id}/reactions ahead of removing the legacy
reaction endpoints.
EOF
)"
```

---

## Task 5: Add DM thread create/list coverage for the unified endpoint

**Files:**
- Modify: `app_chat/tests/test_dm_permissions.py`

- [ ] **Step 1: Write the tests**

Add `ChatThreadListCreateView` and `ChatThreadMessageListCreateView` to the import from `app_chat.views` in `app_chat/tests/test_dm_permissions.py` (change line 33):

```python
from app_chat.views import (
    ChatThreadListCreateView,
    ChatThreadMessageListCreateView,
    DirectMessageEligibleUsersView,
    DirectMessageThreadListCreateView,
)
```

Append to `DmPermissionsTests`:

```python
    @patch.object(TenantBoundJWTStatelessAuthentication, "authenticate")
    def test_post_threads_without_content_returns_400_via_unified_endpoint(self, mock_auth):
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
    def test_post_threads_with_content_creates_thread_and_message_via_unified_endpoint(
        self, mock_auth
    ):
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
    def test_post_threads_empty_content_rolls_back_new_thread_via_unified_endpoint(
        self, mock_auth
    ):
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
    def test_get_threads_excludes_empty_threads_via_unified_endpoint(self, mock_auth):
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
```

- [ ] **Step 2: Run to verify they pass**

Run: `./scripts/run_backend_tests.sh app_chat.tests.test_dm_permissions -v 2`
Expected: All PASS (14 total: 9 original, 5 new).

- [ ] **Step 3: Commit**

```bash
git add app_chat/tests/test_dm_permissions.py
git commit -m "$(cat <<'EOF'
test(chat): cover DM thread create/list/non-participant on unified endpoint

Adds coverage directly against POST/GET chat/threads (kind=dm) and
GET chat/threads/{id}/messages ahead of removing the legacy DM endpoints.
EOF
)"
```

---

## Task 6: Full suite check before opening PR1

- [ ] **Step 1: Run the entire backend test suite**

Run: `./scripts/run_backend_tests.sh`
Expected: All PASS, zero failures, zero errors.

- [ ] **Step 2: Run `black --check .`**

Run: `black --check .` (from `schedjuice-reimagined-be`, with venv activated)
Expected: No reformatting needed. If it flags the edited files, run `black app_chat/views.py app_chat/tests/test_course_chat_permissions.py app_chat/tests/test_rbac_chat.py app_chat/tests/test_message_cursor_pagination.py app_chat/tests/test_reactions.py app_chat/tests/test_dm_permissions.py` and re-commit.

**PR1 is now ready.** No routes, views, or consumers were removed — this PR is safe to merge independently and leaves the legacy surface fully intact.

---

# PR2 — Remove legacy routes, views, consumers (depends on PR1 merged)

## Task 7: Consolidate `realtime.py` broadcast helpers

**Files:**
- Modify: `app_chat/realtime.py`
- Modify: `app_chat/views.py` (4 unified call sites + import)
- Modify: `app_chat/tests/test_chat_thread_group_naming_unit.py`
- Modify: `app_chat/tests/test_reactions.py` (patch target rename)
- Modify: `app_chat/tests/test_course_chat_permissions.py` (patch target rename)

This must happen *before* deleting the legacy views in Task 9, since several legacy views also call these functions — deleting the legacy views first would leave dangling references momentarily, but doing the rename first means Task 9's deletions simply remove call sites for functions that already have their final name.

- [ ] **Step 1: Replace `app_chat/realtime.py` in full**

```python
"""Channel layer helpers for chat (HTTP + WS)."""

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


def chat_thread_group_name(tenant_schema: str, thread_id: int) -> str:
    """Canonical WebSocket room-group name for any unified chat thread."""
    return f"chat_thread_{tenant_schema}_{thread_id}"


def build_dm_message_broadcast_payload(
    message: ChatMessage, client_message_id: str | None = None
) -> dict[str, Any]:
    """WS-shaped payload for a DM row (matches ``ChatThreadConsumer`` broadcasts)."""
    return build_message_broadcast_payload(
        message,
        serializer_class=DirectMessageSerializer,
        client_message_id=client_message_id,
        include_thread_id=True,
    )


def broadcast_dm_chat_message(tenant_schema: str, thread_id: int, payload: dict[str, Any]) -> None:
    """Notify a DM thread's room with the same envelope as websocket ``chat.message``."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            chat_thread_group_name(tenant_schema, thread_id),
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
    """Load a DM row in tenant schema and broadcast it to subscribers."""
    with schema_context(tenant_schema):
        message = ChatMessage.objects.select_related(
            "thread", "user", "reply_to", "reply_to__user"
        ).prefetch_related("reactions", "reactions__created_by").get(pk=message_id)
        payload = build_dm_message_broadcast_payload(message, client_message_id)
    broadcast_dm_chat_message(tenant_schema, message.thread_id, payload)


def broadcast_to_chat_thread(tenant_schema: str, thread_id: int, payload: dict[str, Any]) -> None:
    """Notify a chat thread's room with a ``chat.event`` side-channel event
    (edits, deletes, reactions, read receipts, typing)."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            chat_thread_group_name(tenant_schema, thread_id),
            {"type": "chat.event", "payload": payload},
        )
    except Exception:
        logger.exception(
            "broadcast_to_chat_thread failed tenant=%s thread=%s event=%s",
            tenant_schema,
            thread_id,
            payload.get("event"),
        )
```

- [ ] **Step 2: Update `app_chat/views.py` import**

Replace lines 23-27:

```python
from app_chat.realtime import (
    broadcast_dm_message_from_db,
    broadcast_to_course_chat,
    broadcast_to_dm_chat,
)
```

with:

```python
from app_chat.realtime import (
    broadcast_dm_message_from_db,
    broadcast_to_chat_thread,
)
```

- [ ] **Step 3: Update the 4 unified call sites in `app_chat/views.py`**

In `ChatThreadMessageDetailView.delete` (around line 757-762), replace:

```python
        if message.thread.kind == ChatThreadKind.COURSE:
            broadcast_to_course_chat(
                connection.schema_name,
                message.thread_id,
                {"event": "message_deleted", "data": data},
            )
```

with:

```python
        if message.thread.kind == ChatThreadKind.COURSE:
            broadcast_to_chat_thread(
                connection.schema_name,
                message.thread_id,
                {"event": "message_deleted", "data": data},
            )
```

In `ChatThreadMessageReactionToggleView.post` (around line 784-792), replace:

```python
        def _broadcast(reactions):
            payload = {
                "event": "reaction_changed",
                "data": {"message_id": message.id, "reactions": reactions},
            }
            if message.thread.kind == ChatThreadKind.COURSE:
                broadcast_to_course_chat(connection.schema_name, message.thread_id, payload)
            else:
                broadcast_to_dm_chat(connection.schema_name, message.thread_id, payload)
```

with:

```python
        def _broadcast(reactions):
            payload = {
                "event": "reaction_changed",
                "data": {"message_id": message.id, "reactions": reactions},
            }
            broadcast_to_chat_thread(connection.schema_name, message.thread_id, payload)
```

In `ChatThreadReadStatePutView.put` (around line 847-856), replace:

```python
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
```

with:

```python
        if thread.kind == ChatThreadKind.COURSE:
            broadcast_to_chat_thread(
                connection.schema_name,
                thread.id,
                {
                    "event": "read_receipt",
                    "user_id": user.id,
                    "last_read_message_id": message_id,
                },
            )
```

Also update the call inside the Task 1 PATCH fix (in `ChatThreadMessageDetailView.patch`), replacing:

```python
            broadcast_to_course_chat(
                connection.schema_name,
                message.thread_id,
                {"event": "message_edited", "data": data},
            )
```

with:

```python
            broadcast_to_chat_thread(
                connection.schema_name,
                message.thread_id,
                {"event": "message_edited", "data": data},
            )
```

- [ ] **Step 4: Update `test_chat_thread_group_naming_unit.py`**

Replace the file in full — `room_group_name` and `dm_room_group_name` no longer exist, both group-naming aliases collapse to the one function they always delegated to:

```python
"""Locks the shared WebSocket room-group naming invariant (no DB needed)."""

from __future__ import annotations

import unittest

from app_chat.realtime import chat_thread_group_name


class ChatThreadGroupNamingUnitTests(unittest.TestCase):
    def test_generic_group_name_format(self):
        self.assertEqual(
            chat_thread_group_name("xschedjuice", 7),
            "chat_thread_xschedjuice_7",
        )

    def test_group_name_is_stable_for_same_inputs(self):
        self.assertEqual(
            chat_thread_group_name("xschedjuice", 99),
            chat_thread_group_name("xschedjuice", 99),
        )
```

- [ ] **Step 5: Update the PR1-added broadcast-patch targets**

In `app_chat/tests/test_reactions.py`, the two tests added in Task 4 patch the old names — update both decorators:

`test_course_toggle_broadcasts_via_unified_endpoint`: change `@patch("app_chat.views.broadcast_to_course_chat")` to `@patch("app_chat.views.broadcast_to_chat_thread")`.

`test_dm_toggle_broadcasts_via_unified_endpoint`: change `@patch("app_chat.views.broadcast_to_dm_chat")` to `@patch("app_chat.views.broadcast_to_chat_thread")`.

In `app_chat/tests/test_course_chat_permissions.py`, the two Task 1 tests patch the old name — update both decorators from `@patch("app_chat.views.broadcast_to_course_chat")` to `@patch("app_chat.views.broadcast_to_chat_thread")`.

- [ ] **Step 6: Run the full chat suite**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: All PASS. (The legacy tests that still patch `app_chat.views.broadcast_to_course_chat` / `broadcast_to_dm_chat` for the *legacy* views — `test_course_toggle_broadcasts`, `test_dm_toggle_broadcasts` in `test_reactions.py`, and `test_patch_message_forbidden_when_not_author` which doesn't patch broadcast — will fail at this point if their target view still calls the old name. Since Task 9 hasn't deleted the legacy views yet, and the legacy views' calls to `broadcast_to_course_chat`/`broadcast_to_dm_chat` were only in code paths already removed by this step's edit — re-check: the legacy views' own broadcast calls, e.g. in `CourseChatMessageDetailView.patch/delete`, `CourseChatReadStatePutView.put`, `CourseChatMessageReactionToggleView.post`, `DirectMessageReactionToggleView.post`, still reference `broadcast_to_course_chat`/`broadcast_to_dm_chat` by name in their own function bodies — those names no longer exist in `realtime.py` after Step 1, so these legacy views will now raise `ImportError`/`NameError` at call time. This is expected and resolved by Task 9, which deletes these legacy views in the same PR. If running tests between Task 7 and Task 9 in isolation, expect the legacy-view tests (`test_course_toggle_broadcasts`, `test_dm_toggle_broadcasts`, `test_patch_message_forbidden_when_not_author`, `test_course_toggle_forbidden_non_member`) to fail — proceed directly to Task 8/9 before running the full suite again.)

- [ ] **Step 7: Commit**

```bash
git add app_chat/realtime.py app_chat/views.py app_chat/tests/test_chat_thread_group_naming_unit.py app_chat/tests/test_reactions.py app_chat/tests/test_course_chat_permissions.py
git commit -m "$(cat <<'EOF'
refactor(chat): consolidate broadcast_to_course_chat/broadcast_to_dm_chat

Both functions resolved to the same chat_thread_group_name mechanics;
replaced with one kind-agnostic broadcast_to_chat_thread used by all
unified views. Legacy views (deleted next) are the only remaining
callers of the old names.
EOF
)"
```

---

## Task 8: Remove legacy WebSocket routes and consumers

**Files:**
- Modify: `app_ws/routing.py`
- Modify: `app_chat/consumers.py`

- [ ] **Step 1: Replace `app_ws/routing.py`**

```python
from django.urls import path

from app_chat.consumers import ChatThreadConsumer

websocket_urlpatterns = [
    path("ws/chat/threads/<int:thread_id>/", ChatThreadConsumer.as_asgi()),
]
```

- [ ] **Step 2: Remove the legacy consumer classes and dead `create_chat_message` from `app_chat/consumers.py`**

Delete the `create_chat_message` function (lines 94-100):

```python
@database_sync_to_async
def create_chat_message(course_id, user, content, schema_name, reply_to_id=None):
    with schema_context(schema_name):
        thread = get_or_create_course_chat_thread(course_id)
        return _create_message_on_thread_sync(
            thread, user, content, schema_name, reply_to_id=reply_to_id
        )
```

Delete the `CourseChatConsumer` and `DirectMessageConsumer` classes at the end of the file (lines 306-318):

```python
class CourseChatConsumer(_BaseChatThreadConsumer):
    """Legacy course chat consumer. URL: ws/chat/<course_id>/?token=<jwt>&tenant=<schema>"""

    async def _resolve_thread_id(self):
        course_id = self.scope["url_route"]["kwargs"]["course_id"]
        return await resolve_course_thread_id(course_id, self.tenant_schema)


class DirectMessageConsumer(_BaseChatThreadConsumer):
    """Legacy DM consumer. URL: ws/chat/dm/<thread_id>/?token=<jwt>&tenant=<schema>"""

    async def _resolve_thread_id(self):
        return self.scope["url_route"]["kwargs"]["thread_id"]
```

`resolve_course_thread_id` (used only by the now-deleted `CourseChatConsumer._resolve_thread_id`) becomes unused — delete it too (lines 114-117):

```python
@database_sync_to_async
def resolve_course_thread_id(course_id, schema_name):
    with schema_context(schema_name):
        return get_or_create_course_chat_thread(course_id).id
```

Before deleting `resolve_course_thread_id`, confirm nothing else calls it:

Run: `rg -n "resolve_course_thread_id" app_chat/ app_ws/`
Expected: only the definition (about to be deleted) and its one call site inside `CourseChatConsumer` (also about to be deleted).

- [ ] **Step 3: Run the full chat suite**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: Same failures as end of Task 7 (legacy HTTP-view tests still reference deleted `broadcast_to_course_chat`/`broadcast_to_dm_chat` internally) — no new failures from this step, since no test imports `CourseChatConsumer`, `DirectMessageConsumer`, or `create_chat_message` directly (confirm with `rg -n "CourseChatConsumer|DirectMessageConsumer|create_chat_message\b" app_chat/tests/`, expected: no matches).

- [ ] **Step 4: Commit**

```bash
git add app_ws/routing.py app_chat/consumers.py
git commit -m "$(cat <<'EOF'
refactor(chat): remove legacy CourseChatConsumer/DirectMessageConsumer

ws/chat/<course_id>/ and ws/chat/dm/<thread_id>/ are removed; only the
unified ws/chat/threads/<thread_id>/ (ChatThreadConsumer) remains. Also
removes the now-unused create_chat_message and resolve_course_thread_id
helpers.
EOF
)"
```

---

## Task 9: Remove legacy HTTP routes and view classes

**Files:**
- Modify: `app_chat/urls.py`
- Modify: `app_chat/views.py`

- [ ] **Step 1: Replace `app_chat/urls.py`**

```python
from django.urls import path

from app_chat import views

urlpatterns = [
    path(
        "courses/chat/last-messages",
        views.CourseChatLastMessagesBatchView.as_view(),
        name="course-chat-last-messages-batch",
    ),
    path(
        "courses/<int:course_id>/chat/thread",
        views.ChatThreadResolveView.as_view(),
        name="chat-thread-resolve",
    ),
    path(
        "chat/threads",
        views.ChatThreadListCreateView.as_view(),
        name="chat-thread-list-create",
    ),
    path(
        "chat/threads/<int:thread_id>/messages",
        views.ChatThreadMessageListCreateView.as_view(),
        name="chat-thread-message-list-create",
    ),
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
    path(
        "chat/dm/eligible-users",
        views.DirectMessageEligibleUsersView.as_view(),
        name="dm-eligible-users",
    ),
]
```

- [ ] **Step 2: Remove the 10 legacy view classes from `app_chat/views.py`**

Line numbers below are from the pre-Task-1/pre-Task-7 file and will have drifted by the time this task runs (Task 1 added lines to `ChatThreadMessageDetailView.patch`; Task 7 changed the import block and a few broadcast call sites). Treat the **class name boundaries** as authoritative: each class starts at its `class <Name>(ChatApiView):` (or, for the first one, `class <Name>(RBACListView):`) line and ends on the blank line immediately before the next `class` definition in the file. Delete, in file order:

1. `CourseChatMessageListView` (originally lines 105-188) — ends right before `class ChatApiView(APIView):`
2. `CourseChatMessageDetailView` (originally lines 291-388) — starts right after `class CourseChatLastMessagesBatchView(ChatApiView):` ends, ends right before `class CourseChatReadStatePutView(ChatApiView):`
3. `CourseChatReadStatePutView` (originally lines 459-537) — ends right before `class CourseChatPresenceGetView(ChatApiView):`
4. `CourseChatPresenceGetView` (originally lines 540-563) — ends right before `class ChatThreadResolveView(ChatApiView):`
5. `DirectMessageThreadListCreateView` (originally lines 1038-1136) — starts right after `class DirectMessageEligibleUsersView(ChatApiView):` ends (that class is **kept**), ends right before `class DirectMessageListCreateView(ChatApiView):`
6. `DirectMessageListCreateView` (originally lines 1139-1215) — ends right before `class DirectMessageDetailView(ChatApiView):`
7. `DirectMessageDetailView` (originally lines 1218-1289) — ends right before `class CourseChatMessageReactionToggleView(ChatApiView):`
8. `CourseChatMessageReactionToggleView` (originally lines 1292-1337) — ends right before `class DirectMessageReactionToggleView(ChatApiView):`
9. `DirectMessageReactionToggleView` (originally lines 1340-1373) — ends right before `class DirectMessageReadStatePutView(ChatApiView):`
10. `DirectMessageReadStatePutView` (originally lines 1376-1408) — this is the last class in the file; ends at end-of-file.

`DirectMessageEligibleUsersView` is **not** in this list — it stays.

Also delete the now-unused `_course_chat_message_patch_broadcast_dict` helper function (originally lines 55-93, immediately above the `_CHAT_PARTICIPATE = {...}` dict — identify it by its `def _course_chat_message_patch_broadcast_dict(message: ChatMessage) -> dict:` signature and delete through its closing `}` before `_CHAT_PARTICIPATE`) and the now-unused `RBACListView` import if nothing else in the file uses it — check first:

Run: `rg -n "RBACListView" app_chat/views.py`
Expected after deleting `CourseChatMessageListView` (the only class extending it): no remaining matches except the import line — remove `RBACListView` from the `from app_rbac.views import RBACListView, RBACPermission` import, leaving `from app_rbac.views import RBACPermission`.

Also check whether `parse_before_id` (imported from `app_chat.message_cursor`) is still used elsewhere in the file — it was only called inside `CourseChatMessageListView.get`:

Run: `rg -n "parse_before_id" app_chat/views.py`
Expected after deletion: no remaining matches — remove the `from app_chat.message_cursor import parse_before_id` import line.

Also check `can_send_course_chat_message` (only used in the deleted `CourseChatMessageDetailView.patch`) and `dm_thread_pair_policy_allows`/`user_is_dm_participant`/`create_dm_message` usage — these remain used by unified views (`ChatThreadMessageListCreateView.post`, `create_dm_message`), so only remove `can_send_course_chat_message` from the `app_chat.services` import if it has zero remaining call sites:

Run: `rg -n "can_send_course_chat_message" app_chat/views.py`
Expected after deletion: no remaining matches — remove it from the import block.

The final import block at the top of `app_chat/views.py` should read:

```python
from django.core.exceptions import BadRequest, ValidationError as DjangoValidationError
from django.db import connection
from django.db.models import OuterRef, Q, QuerySet, Subquery
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
from app_chat.message_preview import build_message_preview
from app_chat.message_list_helpers import fetch_thread_messages_page, serialize_message_rows
from app_chat.models import ChatMessage, ChatReadState, ChatThread, ChatThreadKind
from app_chat.notifications import queue_course_chat_message_pushes
from app_chat.reaction_helpers import aggregate_reactions_for_message
from app_chat.reaction_toggle_helpers import handle_chat_reaction_toggle_post
from app_chat.realtime import (
    broadcast_dm_message_from_db,
    broadcast_to_chat_thread,
)
from app_chat.realtime_presence import online_user_ids
from app_chat.services import (
    bulk_thread_unread_counts,
    can_access_thread,
    can_create_dm_thread,
    can_moderate_chat,
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
from app_course.models import UserCourse
from app_rbac.views import RBACPermission
from utilitas.renderer import CustomRenderer
from utilitas.views import BaseView
```

(`QuerySet` from `django.db.models` becomes unused once `CourseChatMessageListView.augment_search_queryset` is deleted — check and remove if so: `rg -n "QuerySet" app_chat/views.py` should show zero remaining matches after deletion; if so, drop `QuerySet` from the `django.db.models` import, leaving `from django.db.models import OuterRef, Q, Subquery`.)

Verify no remaining view class references `is_course_member` incorrectly — it's still used by `ChatThreadResolveView`, `CourseChatLastMessagesBatchView`'s membership filter uses `UserCourse` directly (not `is_course_member`), so no change needed there.

- [ ] **Step 3: Grep-verify no dangling references**

Run: `rg -n "CourseChatMessageListView|CourseChatMessageDetailView|CourseChatReadStatePutView|CourseChatPresenceGetView|DirectMessageThreadListCreateView|DirectMessageListCreateView|DirectMessageDetailView|CourseChatMessageReactionToggleView|DirectMessageReactionToggleView|DirectMessageReadStatePutView" app_chat/ app_ws/ --type py -g '!tests/*'`
Expected: no matches outside `app_chat/tests/` (those are addressed in Task 12).

- [ ] **Step 4: Commit**

```bash
git add app_chat/urls.py app_chat/views.py
git commit -m "$(cat <<'EOF'
feat(chat): remove legacy course/DM HTTP routes and view classes

Removes 10 legacy routes/views (5 course, 5 DM). Only the unified
chat/threads/... surface, the course->thread resolver, the batch preview
endpoint, and chat/dm/eligible-users remain.
EOF
)"
```

---

## Task 10: Remove orphaned serializers

**Files:**
- Modify: `app_chat/serializers.py`
- Modify: `app_chat/message_preview.py` (docstring reference only)

- [ ] **Step 1: Confirm each is truly orphaned**

Run: `rg -n "CourseChatReadStateSerializer|DirectMessageReadStateSerializer|DirectMessageThreadSerializer" --type py .`
Expected: each name appears only in its own class definition in `app_chat/serializers.py` and in the docstring comment in `app_chat/message_preview.py` (no other call sites, since their only callers — the legacy views — were deleted in Task 9).

- [ ] **Step 2: Delete the three classes from `app_chat/serializers.py`**

Delete `CourseChatReadStateSerializer` (lines 202-212):

```python
class CourseChatReadStateSerializer(ChatReadStateSerializer):
    """Course chat read-state API contract: exposes `course` instead of `thread`."""

    course = serializers.SerializerMethodField(read_only=True)

    class Meta(ChatReadStateSerializer.Meta):
        fields = ("id", "created_at", "updated_at", "user", "course", "last_read_message_id")
        read_only_fields = fields

    def get_course(self, obj):
        return obj.thread.course_id
```

Delete `DirectMessageReadStateSerializer` (lines 215-217):

```python
class DirectMessageReadStateSerializer(ChatReadStateSerializer):
    """DM read-state API contract: identical to the base serializer."""
```

Delete `DirectMessageThreadSerializer` (lines 219-299, the entire class through `get_unread_count`).

- [ ] **Step 3: Update the stale docstring reference in `app_chat/message_preview.py`**

Read the file's module docstring first (`Read app_chat/message_preview.py`, lines 1-10) and replace any mention of `DirectMessageThreadSerializer.get_last_message` with `ChatThreadSerializer.get_last_message` (its unified successor), since that class no longer exists.

- [ ] **Step 4: Run the full chat suite**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: no import errors from the serializer deletions (confirm no test file imports the three deleted serializers — checked in Step 1).

- [ ] **Step 5: Commit**

```bash
git add app_chat/serializers.py app_chat/message_preview.py
git commit -m "$(cat <<'EOF'
refactor(chat): remove orphaned legacy read-state/thread serializers

CourseChatReadStateSerializer, DirectMessageReadStateSerializer, and
DirectMessageThreadSerializer had exactly one caller each, all in the
legacy views removed in the previous commit.
EOF
)"
```

---

## Task 11: Delete the now-superseded legacy tests

**Files:**
- Modify: `app_chat/tests/test_course_chat_permissions.py`
- Modify: `app_chat/tests/test_rbac_chat.py`
- Modify: `app_chat/tests/test_message_cursor_pagination.py`
- Modify: `app_chat/tests/test_reactions.py`
- Modify: `app_chat/tests/test_dm_permissions.py`

Each legacy-HTTP-specific test method is deleted (its target view/URL no longer exists); every service-level test stays untouched.

- [ ] **Step 1: `test_course_chat_permissions.py`**

Delete `test_patch_message_forbidden_when_not_author` (it tested `CourseChatMessageDetailView` directly — superseded by Task 1's `test_unified_patch_broadcasts_message_edited` and `test_unified_patch_rejects_invalid_mention`, which already exercise the unified view's PATCH permission/validation path; add one more targeted replacement so the "non-author forbidden" case itself is still directly asserted):

```python
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
```

Remove the now-unused `CourseChatMessageDetailView` import (change the import line to `from app_chat.views import ChatThreadMessageDetailView`).

- [ ] **Step 2: `test_rbac_chat.py`**

Delete `test_student_member_can_list_course_chat` and `test_admin_without_participate_permission_denied` (the original two testing `courses/{id}/chat/messages`) — the Task 2 `..._via_unified_endpoint` versions are the sole remaining coverage. Rename the two remaining tests to drop the `_via_unified_endpoint` suffix now that they're the only version:

`test_student_member_can_list_course_chat_via_unified_endpoint` → `test_student_member_can_list_course_chat`
`test_admin_without_participate_permission_denied_via_unified_endpoint` → `test_admin_without_participate_permission_denied`

- [ ] **Step 3: `test_message_cursor_pagination.py`**

Delete `test_course_chat_before_id_returns_older_page`, `test_dm_list_caps_initial_response`, `test_dm_before_id_returns_older_messages` (the three originals hitting legacy URLs). Keep `test_cursor_helpers_return_ascending_rows` (unit-level, unaffected) and all 4 Task 3 additions. Rename the Task 3 additions to drop `_via_unified_endpoint`:

`test_course_chat_before_id_returns_older_page_via_unified_endpoint` → `test_course_chat_before_id_returns_older_page`
`test_dm_list_caps_initial_response_via_unified_endpoint` → `test_dm_list_caps_initial_response`
`test_dm_before_id_returns_older_messages_via_unified_endpoint` → `test_dm_before_id_returns_older_messages`
`test_course_chat_initial_load_caps_at_default_size_via_unified_endpoint` stays as-is (no legacy equivalent existed).

- [ ] **Step 4: `test_reactions.py`**

Delete `test_course_toggle_broadcasts`, `test_dm_toggle_broadcasts`, `test_course_toggle_forbidden_non_member` (the three originals using `CourseChatMessageReactionToggleView`/`DirectMessageReactionToggleView` directly — those classes no longer exist, so these tests would now fail to import). Keep the 3 service-level tests (`test_toggle_add_remove_replace_course_message`, `test_reject_invalid_emoji_and_deleted_message`, `test_aggregate_reacted_by_me`) and all 4 Task 4 additions. Remove the now-unused import `from app_chat.views import CourseChatMessageReactionToggleView, DirectMessageReactionToggleView` — the import line should read `from app_chat.views import ChatThreadMessageReactionToggleView`. Rename the Task 4 additions to drop `_via_unified_endpoint`:

`test_course_toggle_broadcasts_via_unified_endpoint` → `test_course_toggle_broadcasts`
`test_dm_toggle_broadcasts_via_unified_endpoint` → `test_dm_toggle_broadcasts`
`test_course_toggle_forbidden_non_member_via_unified_endpoint` → `test_course_toggle_forbidden_non_member`
`test_invalid_emoji_returns_400_via_unified_endpoint` stays as-is (no legacy HTTP-level equivalent existed — invalid emoji was only tested at the service layer before).

- [ ] **Step 5: `test_dm_permissions.py`**

Delete `test_post_threads_without_content_returns_400`, `test_post_threads_with_content_creates_thread_and_message`, `test_post_threads_empty_content_rolls_back_new_thread`, `test_get_threads_excludes_empty_threads` (the four originals using `DirectMessageThreadListCreateView` directly — deleted class). Keep all service-level tests (`test_student_cannot_dm_student`, `test_student_can_dm_teacher`, `test_teacher_can_dm_teacher`, `test_staff_can_dm_staff`, `test_start_dm_conversation_service`) and the two `eligible_users` tests (endpoint stays). Remove `DirectMessageThreadListCreateView` from the import — the import line should read `from app_chat.views import ChatThreadListCreateView, ChatThreadMessageListCreateView, DirectMessageEligibleUsersView`. Rename the Task 5 additions to drop `_via_unified_endpoint`:

`test_post_threads_without_content_returns_400_via_unified_endpoint` → `test_post_threads_without_content_returns_400`
`test_post_threads_with_content_creates_thread_and_message_via_unified_endpoint` → `test_post_threads_with_content_creates_thread_and_message`
`test_post_threads_empty_content_rolls_back_new_thread_via_unified_endpoint` → `test_post_threads_empty_content_rolls_back_new_thread`
`test_get_threads_excludes_empty_threads_via_unified_endpoint` → `test_get_threads_excludes_empty_threads`
`test_dm_non_participant_forbidden_via_unified_endpoint` stays as-is (no legacy equivalent existed as an HTTP test — it was service-level only before, in `test_thread_endpoints.py::test_can_access_thread_false_for_dm_non_participant`, which is untouched).

- [ ] **Step 6: Run the full chat suite**

Run: `./scripts/run_backend_tests.sh app_chat.tests -v 2`
Expected: All PASS, zero failures, zero errors.

- [ ] **Step 7: Run the full backend suite**

Run: `./scripts/run_backend_tests.sh`
Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add app_chat/tests/test_course_chat_permissions.py app_chat/tests/test_rbac_chat.py app_chat/tests/test_message_cursor_pagination.py app_chat/tests/test_reactions.py app_chat/tests/test_dm_permissions.py
git commit -m "$(cat <<'EOF'
test(chat): remove tests for deleted legacy course/DM views

Service-level tests (RBAC policy, mention validation, reaction toggle,
DM pair policy) are untouched -- only HTTP tests whose target view was
just deleted are removed, with unified-endpoint coverage already in
place from the PR1 additions.
EOF
)"
```

---

## Task 12: Update the stale frontend prompt doc

**Files:**
- Modify: `docs/FRONTEND_COURSE_CHAT_PROMPT.md`

- [ ] **Step 1: Add a deprecation banner**

Insert immediately after the title (line 1) in `docs/FRONTEND_COURSE_CHAT_PROMPT.md`:

```markdown
# Frontend Prompt: Course Group Chat

> **Deprecated.** This document describes the legacy course-only chat surface
> (`ws/chat/<course_id>/`, `courses/<course_id>/chat/...`), which has been
> removed from the backend. Use the unified thread-centric surface instead:
> `ws/chat/threads/<thread_id>/` and `chat/threads/...` (see
> [`docs/superpowers/specs/2026-07-04-unified-chat-schema-phase2-api-design.md`](superpowers/specs/2026-07-04-unified-chat-schema-phase2-api-design.md)).
> Kept for historical reference only.
```

- [ ] **Step 2: Commit**

```bash
git add docs/FRONTEND_COURSE_CHAT_PROMPT.md
git commit -m "$(cat <<'EOF'
docs(chat): mark legacy course-chat frontend prompt as deprecated

The ws/chat/<course_id>/ and courses/<course_id>/chat/... surfaces it
describes no longer exist; points readers to the unified thread surface.
EOF
)"
```

---

## Task 13: Final verification before opening PR2

- [ ] **Step 1: Grep-verify zero remaining references to removed symbols**

Run: `rg -n "CourseChatConsumer|DirectMessageConsumer|broadcast_to_course_chat|broadcast_to_dm_chat|room_group_name|dm_room_group_name|CourseChatMessageListView|CourseChatMessageDetailView|CourseChatReadStatePutView|CourseChatPresenceGetView|DirectMessageThreadListCreateView|DirectMessageListCreateView|DirectMessageDetailView|CourseChatMessageReactionToggleView|DirectMessageReactionToggleView|DirectMessageReadStatePutView|CourseChatReadStateSerializer|DirectMessageReadStateSerializer|DirectMessageThreadSerializer|create_chat_message\b|resolve_course_thread_id" --type py .`
Expected: no matches anywhere in the repo.

- [ ] **Step 2: Run the full backend test suite one more time**

Run: `./scripts/run_backend_tests.sh`
Expected: All PASS.

- [ ] **Step 3: Run `black --check .`**

Run: `black --check .`
Expected: no reformatting needed (or run `black .` and re-commit if it flags anything).

- [ ] **Step 4: Manual smoke test**

Per the `python-backend-env-and-tests` rule and this spec's testing section: start the backend (`python manage.py runserver 0.0.0.0:8000` with the injected `DATABASE_URL`), and using a REST client (curl/Postman) against `chat/threads/...` and `courses/chat/last-messages` with a valid JWT + `X-Tenant` header, confirm: course chat send/edit/delete/react, DM chat send/edit/delete/react, and that `courses/<id>/chat/messages` and `chat/dm/threads` now 404.

**PR2 is now ready.**
