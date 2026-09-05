# Chat Phase 2b — Legacy Route Removal — Design Spec

**Date:** 2026-07-07
**Status:** Approved
**Repo:** `schedjuice-reimagined-be` (backend-only)
**Builds on:**
[Phase 1 — Backend Table Consolidation](2026-07-02-unified-chat-schema-design.md) (implemented),
[Phase 2 — Unified API Surface](2026-07-04-unified-chat-schema-phase2-api-design.md) (implemented),
[Phase 3 — Mobile Client Migration](2026-07-04-unified-chat-schema-phase3-mobile-migration-design.md) (client code complete, uncommitted; not yet merged/released)

## 1. Summary

Phase 2 shipped the unified `chat/threads/...` REST surface and `ChatThreadConsumer`
WebSocket as **dual-support** additions alongside the legacy course-specific and
DM-specific endpoints/consumers. Phase 3 finished the mobile client's move onto the
unified surface (code-complete as of this writing, but uncommitted in the mobile repo
and not yet merged to `master` or released). Web FE has independently migrated onto the
unified surface via its own `feat/migrate-chat-api` effort (merged to `origin/dev`).

This phase (**Phase 2b**) removes the legacy course-specific and DM-specific chat
surface from the backend entirely: HTTP routes, WebSocket routes/consumers, view
classes, orphaned serializers, and legacy-named realtime helpers. It also fixes a
real behavior gap discovered during this work — the unified course-thread message
PATCH is missing mention validation and the `message_edited` broadcast that the
legacy view has.

## 2. Locked decisions (brainstorming)

| Topic | Choice |
| --- | --- |
| Rollout precondition | Overridden. The original Phase 3 spec's "wait until both clients confirmed live" gate is **not** satisfied (mobile's Phase 3 work is uncommitted/unreleased; current production mobile app is still 100% on legacy endpoints). Proceeding anyway is an explicit, accepted decision — current mobile chat (course + DM) will break until mobile ships its Phase 3 work. Web is largely unaffected since it has already migrated. |
| Scope | Backend-only (`schedjuice-reimagined-be`). Finishing/shipping mobile's client-side migration is a separate, already-in-progress workstream, out of scope here. |
| Cleanup depth | Full cleanup: remove routes/views/consumers **and** their now-orphaned legacy-only serializers, consolidate legacy-named `realtime.py` broadcast helpers into one kind-agnostic broadcaster, delete dead code (`create_chat_message(course_id, ...)`), and update the doc referencing the old `ws://` path |
| Removal style | Hard removal — no deprecation/`410 Gone` shim. Routes simply stop resolving (standard Django 404) |
| Test handling | Split each legacy test file: keep tests that exercise shared **service-layer** functions (still in use by the unified views) unchanged; rewrite only the tests that specifically exercise a **removed HTTP view/URL** onto the equivalent unified `chat/threads/...` endpoint, preserving the original assertion intent |
| Course-thread PATCH parity gap | Fix as part of this work: add mention validation + `message_edited` broadcast + course-chat-list cache invalidation to `ChatThreadMessageDetailView.patch` for course threads, matching legacy `CourseChatMessageDetailView.patch`, before the legacy fallback disappears |
| Sequencing | Two small, back-to-back PRs: PR1 adds the missing unified-endpoint test coverage and the PATCH parity fix (no removal, safe to merge standalone); PR2 does the actual removal once PR1 is green |

---

## 3. What gets removed

### 3.1 HTTP routes (`app_chat/urls.py`) — 10 routes

**Course legacy (5):**
- `courses/<course_id>/chat/messages` → `CourseChatMessageListView`
- `courses/<course_id>/chat/messages/<message_id>` → `CourseChatMessageDetailView`
- `courses/<course_id>/chat/messages/<message_id>/reactions` → `CourseChatMessageReactionToggleView`
- `courses/<course_id>/chat/read-state` → `CourseChatReadStatePutView`
- `courses/<course_id>/chat/presence` → `CourseChatPresenceGetView`

**DM legacy (5):**
- `chat/dm/threads` → `DirectMessageThreadListCreateView`
- `chat/dm/threads/<thread_id>/messages` → `DirectMessageListCreateView`
- `chat/dm/messages/<message_id>` → `DirectMessageDetailView`
- `chat/dm/messages/<message_id>/reactions` → `DirectMessageReactionToggleView`
- `chat/dm/threads/<thread_id>/read-state` → `DirectMessageReadStatePutView`

### 3.2 WebSocket routes/consumers (`app_ws/routing.py`) — 2

- `ws/chat/<course_id>/` → `CourseChatConsumer`
- `ws/chat/dm/<thread_id>/` → `DirectMessageConsumer`

(`_BaseChatThreadConsumer` and `ChatThreadConsumer` stay — all three currently inherit
from the same base and join the same canonical `chat_thread_{schema}_{thread_id}` room
group, so removing the two legacy subclasses has no effect on the underlying group
mechanics.)

### 3.3 View classes (`app_chat/views.py`) — 10

Paired 1:1 with the routes in §3.1: `CourseChatMessageListView`,
`CourseChatMessageDetailView`, `CourseChatMessageReactionToggleView`,
`CourseChatReadStatePutView`, `CourseChatPresenceGetView`,
`DirectMessageThreadListCreateView`, `DirectMessageListCreateView`,
`DirectMessageDetailView`, `DirectMessageReactionToggleView`,
`DirectMessageReadStatePutView`.

### 3.4 Serializers, realtime helpers, dead code

- Remove `CourseChatMessageSerializer`, `CourseChatReadStateSerializer`,
  `DirectMessageSerializer`, `DirectMessageReadStateSerializer`,
  `DirectMessageThreadSerializer` **if** implementation confirms they are only
  referenced by the removed legacy views. If any are still used for broadcast shaping
  in `consumers.py`, consolidate that usage onto the unified serializer(s) first, then
  remove.
- Consolidate `realtime.py`'s `broadcast_to_course_chat` / `broadcast_to_dm_chat` /
  `dm_room_group_name` into a single kind-agnostic broadcaster (the group name is
  already unified via `chat_thread_group_name`; only the kind-specific *named
  wrappers* are legacy). Update the small number of internal call sites (message
  create/edit/delete, reaction toggle, presence) to call the consolidated function.
- Delete the unused `create_chat_message(course_id, ...)` function in
  `consumers.py` (dead code — confirmed unused, superseded by
  `create_message_on_thread`).
- Update `docs/FRONTEND_COURSE_CHAT_PROMPT.md`, which still documents the legacy
  `ws://chat/<course_id>/` path.

### 3.5 What stays (not touched)

| Surface | Reason |
| --- | --- |
| `chat/threads/...` (6 routes), `ChatThreadListCreateView`, `ChatThreadMessageListCreateView`, `ChatThreadMessageDetailView`, `ChatThreadMessageReactionToggleView`, `ChatThreadReadStatePutView`, `ChatThreadPresenceGetView` | Unified target surface |
| `ws/chat/threads/<thread_id>/`, `ChatThreadConsumer`, `_BaseChatThreadConsumer` | Unified target WebSocket |
| `courses/<course_id>/chat/thread` → `ChatThreadResolveView` | Course→thread resolver; actively used by both mobile and web |
| `courses/chat/last-messages` → `CourseChatLastMessagesBatchView` | Phase 3 batch preview endpoint |
| `chat/dm/eligible-users` → `DirectMessageEligibleUsersView` | Explicitly retained per Phase 3 spec §11; not part of thread migration |

---

## 4. Behavior fix: course-thread message PATCH parity

**Problem found during this work:** legacy `CourseChatMessageDetailView.patch`
validates `@mentions` via `validate_mention_user_ids` and broadcasts a
`message_edited` WS event (plus invalidating the course chat list cache) on edit.
The unified `ChatThreadMessageDetailView.patch` does neither for course-kind threads
today. Since web FE's course chat already edits messages through the unified
endpoint, this is very likely a live behavior gap in production, not just a
migration-cleanup concern — editing a course message to change/add a `@mention`
does not validate the mentioned user is a course member, and other participants
don't get a live update of the edit over WebSocket.

**Fix:** `ChatThreadMessageDetailView.patch`, when the thread's `kind == course`,
gains:
1. `validate_mention_user_ids` on any mentions in the new content (matching legacy
   behavior — reject with the same validation error if a mentioned user isn't a
   course member).
2. A `message_edited` broadcast to the thread's WS group with the updated message
   payload (matching the existing `message_edited` event shape already defined in
   the unified consumer's inbound event types).
3. Course chat list cache invalidation, mirroring legacy's behavior, if applicable
   given the unified list surface (`courses/chat/last-messages`) — verify at
   implementation time whether this cache exists server-side or is purely
   client-managed; if client-managed, no server action is needed here.

DM-kind threads are unaffected (legacy DM PATCH never had mention validation, since
DMs don't support mentions).

---

## 5. Test migration plan

Per-file split: keep tests that exercise shared **service-layer** functions
unchanged (the underlying functions remain in use by the unified views regardless of
route removal); rewrite only tests that specifically hit a **removed HTTP
view/URL**.

### `test_course_chat_permissions.py`

- **Keep unchanged:** `test_non_dropped_member_count_zero_without_enrollments`,
  `test_validate_mention_user_ids_rejects_non_member`,
  `test_can_moderate_chat_teacher_not_student`,
  `test_dm_get_or_create_returns_single_thread_for_pair`,
  `test_validate_chat_content_payload_requires_text_or_attachment`
- **Rewrite onto unified endpoint:** `test_patch_message_forbidden_when_not_author`
  → `PATCH chat/threads/{thread_id}/messages/{message_id}` for a course-kind thread,
  non-author enrolled student → 403
- **Add (verifies §4 fix):** PATCH with an invalid mention → validation error;
  PATCH broadcasts `message_edited` (mock assertion) for a course-kind thread

### `test_rbac_chat.py`

- **Rewrite both tests** onto `GET chat/threads/{thread_id}/messages` (course-kind
  thread): enrolled student with `RBAC_ENFORCE=enforce` → 200; admin without
  `chat.participate` → 403

### `test_message_cursor_pagination.py`

- **Keep unchanged:** `test_cursor_helpers_return_ascending_rows` (unit test on
  shared cursor helpers, not endpoint-specific)
- **Rewrite onto unified endpoint:**
  `test_course_chat_before_id_returns_older_page`,
  `test_dm_list_caps_initial_response`, `test_dm_before_id_returns_older_messages`
  → all become `GET chat/threads/{thread_id}/messages` calls against course-kind or
  DM-kind threads respectively, same assertions (page size, `has_more`, ascending
  IDs)
- **Add:** initial-load cap test (`size` default, `has_more`) for a course-kind
  unified thread, since the unified surface always uses cursor pagination (unlike
  legacy course's page-based initial load) — this documents the unified surface's
  actual (already-shipped) behavior, not a new behavior change

### `test_reactions.py`

- **Keep unchanged:** `test_toggle_add_remove_replace_course_message`,
  `test_reject_invalid_emoji_and_deleted_message`, `test_aggregate_reacted_by_me`
- **Rewrite onto unified endpoint:** `test_course_toggle_broadcasts`,
  `test_dm_toggle_broadcasts`, `test_course_toggle_forbidden_non_member` → all hit
  `POST chat/threads/{thread_id}/messages/{message_id}/reactions` for the
  appropriate thread kind, same assertions (broadcast fired once, `reaction_changed`
  event, 403 for non-member)
- **Add:** DM-kind reaction toggle test and invalid-emoji test on the unified
  endpoint (currently only covered at the service layer)

### `test_dm_permissions.py`

- **Keep unchanged:** `test_student_cannot_dm_student`, `test_student_can_dm_teacher`,
  `test_teacher_can_dm_teacher`, `test_staff_can_dm_staff`,
  `test_start_dm_conversation_service`, `test_eligible_users_excludes_pure_students_for_student_caller`,
  `test_eligible_users_teacher_sees_students` (the `eligible-users` endpoint stays,
  untouched)
- **Rewrite onto unified endpoint:** `test_post_threads_without_content_returns_400`,
  `test_post_threads_with_content_creates_thread_and_message`,
  `test_post_threads_empty_content_rolls_back_new_thread`,
  `test_get_threads_excludes_empty_threads` → `POST chat/threads` (`kind=dm`) /
  `GET chat/threads?kind=dm`, same assertions. Skip re-adding
  `test_get_threads_excludes_empty_threads` if `test_thread_endpoints.py`'s existing
  `test_list_dm_threads_for_user_excludes_empty_threads` already covers it at the
  HTTP level — verify at implementation time and dedupe rather than duplicate.
- **Add:** DM non-participant → 403 HTTP test on
  `GET chat/threads/{thread_id}/messages` (currently only covered at the service
  layer via `test_can_access_thread_false_for_dm_non_participant`)

**Note on a minor, accepted behavior difference:** legacy course reaction toggle
returns 404 for a missing message; the unified view returns 403 (message resolves to
`None`, treated as an access failure). This is not being changed as part of this
work — no test asserts the legacy 404 specifically, and no client depends on the
distinction.

---

## 6. Sequencing

**PR1 (test coverage + parity fix, no removal):**
- Implement the §4 PATCH parity fix
- Add all new unified-endpoint test coverage listed in §5 (additions only — legacy
  tests untouched, still green)
- Merges independently; safe, no route changes

**PR2 (removal, depends on PR1 merged):**
- Remove routes, views, consumers per §3.1–3.3
- Rewrite the legacy-HTTP-specific tests per §5, delete the now-superseded legacy
  assertions
- Consolidate serializers/realtime helpers/dead code per §3.4
- Update the stale doc

---

## 7. Risks and accepted tradeoffs

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| Current production mobile app (course + DM chat) breaks entirely once PR2 ships | High impact, explicitly accepted | Mobile's client-side Phase 3 migration is code-complete and tested (uncommitted); breakage window lasts until that work is committed, merged to `master`, and released |
| Any other undiscovered legacy-endpoint consumers outside mobile/web (e.g. internal scripts, stress-test tooling) break | Low — `scripts/stress_test_chat_apis.py` already confirmed on unified endpoints; no other backend app imports legacy views | Grep-verify zero remaining internal references before merging PR2 |
| Orphaned serializers turn out to be shared with unified broadcast shaping | Low-medium — flagged as a verification step, not assumed | Implementation-time check before deleting; consolidate onto unified serializer if shared |
| PATCH parity fix changes course message edit behavior clients don't expect (e.g. an edit that removes a valid mention no longer needed) | Low | Matches already-existing legacy behavior exactly; not a new behavior, just extending it to the unified endpoint |

---

## 8. Out of scope

- Finishing, committing, merging, or releasing mobile's Phase 3 client-side work
  (separate, already-in-progress workstream).
- Any further web FE changes (already migrated independently).
- Fixing the minor 404-vs-403 discrepancy on reaction toggle for a missing message.
- Group chat (Phase 4).

---

## 9. Files touched (indicative, not exhaustive)

| File | Change |
| --- | --- |
| `app_chat/urls.py` | Remove 10 legacy route entries |
| `app_ws/routing.py` | Remove 2 legacy WS route entries |
| `app_chat/views.py` | Remove 10 legacy view classes; extend `ChatThreadMessageDetailView.patch` (§4) |
| `app_chat/consumers.py` | Remove `CourseChatConsumer`, `DirectMessageConsumer`, unused `create_chat_message` |
| `app_chat/serializers.py` | Remove orphaned legacy-only serializers (pending verification) |
| `app_chat/realtime.py` | Consolidate to one kind-agnostic broadcaster |
| `app_chat/tests/test_course_chat_permissions.py` | Split: keep service tests, rewrite HTTP test, add PATCH parity tests |
| `app_chat/tests/test_rbac_chat.py` | Rewrite both tests onto unified endpoint |
| `app_chat/tests/test_message_cursor_pagination.py` | Split: keep unit test, rewrite HTTP tests, add initial-load test |
| `app_chat/tests/test_reactions.py` | Split: keep service tests, rewrite HTTP tests, add DM/invalid-emoji coverage |
| `app_chat/tests/test_dm_permissions.py` | Split: keep service + eligible-users tests, rewrite HTTP tests, add non-participant test |
| `docs/FRONTEND_COURSE_CHAT_PROMPT.md` | Update stale `ws://` reference |

---

## 10. Future phases

- Once mobile's Phase 3 work ships (commit → merge to `master` → release), this
  Phase 2b removal becomes fully safe with no remaining legacy consumers on any
  known client.
- No further backend chat phases are currently planned beyond Phase 4 (group chat),
  which builds on the already-unified surface.
