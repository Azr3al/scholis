# Unified Chat Schema (Phase 2: Unified API Surface) — Design Spec

**Date:** 2026-07-04
**Status:** Approved
**Repo:** `schedjuice-reimagined-be` (backend-only)
**Builds on:** [Phase 1 — Backend Table Consolidation](2026-07-02-unified-chat-schema-design.md) (implemented; migrations `0010`-`0013`)

## 1. Summary

Phase 1 replaced six near-duplicate tables with a unified `ChatThread` / `ChatThreadParticipant`
/ `ChatMessage` / `ChatReadState` / `ChatMessageReaction` schema, and the service layer
(`app_chat/services.py`) already operates on threads rather than course/DM separately. However,
the **presentation layer** — REST views, serializers, URLs, and WebSocket consumers — still
duplicates itself into course-specific and DM-specific classes hitting two different URL/consumer
schemes (`courses/<id>/chat/...` + `ws/chat/<course_id>/` vs. `chat/dm/...` + `ws/chat/dm/<id>/`).

This phase generalizes that presentation layer into a single, kind-aware, `thread_id`-keyed
surface (`/chat/threads/<id>/...`, `ws/chat/threads/<id>/`), laying groundwork for group chat
(Phase 4). **The existing endpoints and WebSocket URLs keep working, unchanged, as thin wrappers**
over the same shared logic — this is a dual-support rollout, not a hard cutover. No mobile or web
frontend code changes are required for this phase to ship safely.

---

## 2. Locked decisions (brainstorming)

| Topic | Choice |
| --- | --- |
| Unification depth | Full: generic `/chat/threads/<id>/...` for messages/reactions/read-state/presence, plus a generic `POST /chat/threads` / `GET /chat/threads?kind=` for thread creation/listing (DM today; `kind=group` rejected until Phase 4) |
| WebSocket consolidation | One consumer class (`ChatThreadConsumer`), one URL (`ws/chat/threads/<thread_id>/`), branching internally on `thread.kind` for membership checks and feature gating |
| Course thread resolution | New resolver endpoint `GET/POST /courses/<course_id>/chat/thread` (get-or-create), returns `{id, kind, course}` — clients call it once, then use `thread_id` everywhere else |
| Message creation symmetry | **Not changed**: course chat stays WebSocket-only for sending (REST `POST` still 405); DM/group get REST + WS, same as today |
| Rollout strategy | Dual-support: old endpoints/consumers become thin wrappers over the same shared handler functions, kept alive indefinitely until a later, separate cleanup phase |
| Legacy removal trigger | Manual: removed in a dedicated follow-up phase once **both** mobile (`schedjuice-reimagined-mobile`) and web (`schedjuice-reimagined-fe`) have migrated to the new endpoints and that's confirmed live in production. No fixed calendar deadline, no traffic-based automation in this phase. |
| `chat/dm/eligible-users` | Left exactly as-is; revisit only when group chat (Phase 4) needs multi-recipient search |
| Presence | Generalized to `GET /chat/threads/<thread_id>/presence`; cache re-keyed by `thread_id` instead of `course_id`. DM threads report empty (DM never sends heartbeats), matching today's behavior. |
| New message payload shape | Nested `"thread": {"id": ..., "kind": ..., "course": ...}` object (self-describing, group-ready) — **new endpoints only**; legacy endpoints keep their exact current `course` / `thread` field shape |
| New DM thread payload shape | Group-ready `"participants": [...]` array; drops `user_low`/`user_high` — **new endpoints only** |
| Phase 3 scope correction | Phase 1's spec (§9) only mentioned mobile for the client migration phase. During Phase 2 brainstorming we found `schedjuice-reimagined-fe` also has its own independent chat WS client hitting today's endpoints. Phase 3 must cover **both** repos (see §9 below). |

---

## 3. New REST API surface

All new routes live under the existing `api/v1/` prefix (same as today — no version bump).

### 3.1 Thread resource

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`/`POST` | `courses/<course_id>/chat/thread` | Get-or-create the course's `ChatThread`; returns `{id, kind, course}`. Wraps `get_or_create_course_chat_thread`. |
| `POST` | `chat/threads` | Body: `{kind, participant_user_id, content, reply_to_id?, client_message_id?}`. Today only `kind="dm"` is accepted (get-or-create a DM thread + first message, replacing `POST chat/dm/threads`); `kind="group"` returns `400 unsupported_kind` until Phase 4; `kind="course"` returns `400 use_course_resolver` (course threads are only created via the resolver above). |
| `GET` | `chat/threads?kind=dm` | List the current user's threads of that kind (replaces `GET chat/dm/threads`). Only `kind=dm` supported; other values return `400 unsupported_kind`. |

### 3.2 Messages, reactions, read-state, presence (thread_id-keyed)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `chat/threads/<thread_id>/messages` | Same cursor params as today (`before_id`, `size`); replaces both `courses/<id>/chat/messages` and `chat/dm/threads/<id>/messages` GET. |
| `POST` | `chat/threads/<thread_id>/messages` | Creates a message. **Still `405` for `kind=course` threads** (matches today's course-chat-is-WS-only-for-sending rule). Works for `kind=dm` (and future `group`). |
| `PATCH` | `chat/threads/<thread_id>/messages/<message_id>` | Edit own, non-deleted message. |
| `DELETE` | `chat/threads/<thread_id>/messages/<message_id>` | Soft-delete (author or moderator for course threads). |
| `POST` | `chat/threads/<thread_id>/messages/<message_id>/reactions` | Toggle reaction. |
| `PUT` | `chat/threads/<thread_id>/read-state` | Monotonic read cursor. |
| `GET` | `chat/threads/<thread_id>/presence` | Online member ids from WS presence heartbeats; cache keyed by `thread_id`. |

Permission checks dispatch on `thread.kind`: `UserCourse` membership for `course`, `ChatThreadParticipant` for `dm`/`group` — via one shared `can_access_thread(user, thread)` helper (new, in `app_chat/services.py`) rather than duplicated per-view checks.

### 3.3 Payload shapes (new endpoints only)

Unified message payload adds a nested `thread` object instead of a bare `course` or `thread` id:

```json
{
  "id": 501,
  "thread": { "id": 12, "kind": "course", "course": 7 },
  "user": { "id": 3, "email": "...", "name": "..." },
  "content": { "text": "...", "mentions": [], "attachments": [] },
  "created_at": "...",
  "edited_at": null,
  "deleted_at": null,
  "deleted_by": null,
  "reply_to": null,
  "reactions": []
}
```

Unified thread payload (`kind=dm` today) drops `user_low`/`user_high`/`other_participant` in favor of a group-ready array:

```json
{
  "id": 12,
  "kind": "dm",
  "created_at": "...",
  "updated_at": "...",
  "participants": [
    { "id": 3, "name": "...", "email": "...", "profile_image": null },
    { "id": 9, "name": "...", "email": "...", "profile_image": null }
  ],
  "last_message": { "id": 501, "created_at": "...", "user": { "id": 3, "name": "..." }, "content": {} },
  "unread_count": 2
}
```

### 3.4 Untouched

`chat/dm/eligible-users` — no changes.

---

## 4. WebSocket consolidation

### 4.1 New unified consumer

`ChatThreadConsumer` at `ws/chat/threads/<thread_id>/?token=<jwt>&tenant=<schema>`. On connect:

1. Load `ChatThread` by `thread_id`.
2. Dispatch membership check on `thread.kind` via the same `can_access_thread` helper used by REST.
3. Join room group `chat_thread_<tenant_schema>_<thread_id>` (see §4.2).
4. Feature gating unchanged from today: `typing` and `heartbeat` message types, and the live
   `read_receipt` WS event, remain enabled only for `kind=course` (and, architecturally, future
   `group`) — not `dm`. This is not a new restriction; it mirrors today's behavior where
   `DirectMessageConsumer` never handles `typing`/`heartbeat` and DM's read-state `PUT` never
   broadcasts.

### 4.2 Room-group naming (critical for dual-support)

Every broadcast — from legacy and new consumers alike — must reach every subscriber regardless of
which URL/consumer they connected through. The room-group name becomes a single function of
`(tenant_schema, thread_id)`:

```python
def chat_thread_group_name(tenant_schema: str, thread_id: int) -> str:
    return f"chat_thread_{tenant_schema}_{thread_id}"
```

This replaces the two existing naming schemes (`course_chat_<schema>_<course_id>` and
`dm_chat_<schema>_<thread_id>`) everywhere — in `realtime.py`'s broadcast helpers and in both
consumers. This is a single atomic change deployed as part of Phase 2; it cannot be rolled out
gradually, because a mobile client on the legacy course URL and a web client already on the new
thread URL must land in the same group from the moment Phase 2 ships, or messages will silently
stop reaching one side.

### 4.3 Legacy consumers as thin wrappers

- `CourseChatConsumer` (`ws/chat/<course_id>/`): `connect` resolves `course_id` →
  `get_or_create_course_chat_thread(course_id).id`, then delegates to the same base
  connect/receive/broadcast logic as `ChatThreadConsumer` (shared via a base class or shared
  functions) using the resolved `thread_id`.
- `DirectMessageConsumer` (`ws/chat/dm/<thread_id>/`): already thread_id-keyed; becomes a thin
  routing alias to the same base logic.

### 4.4 Feature gating unchanged

No behavior changes to which features are available per thread kind — only the URL/consumer
architecture changes. (See §4.1, point 4.)

---

## 5. Legacy compatibility layer (dual-support)

- Shared handler functions (new module `app_chat/thread_handlers.py`) implement the actual
  list/create/patch/delete/toggle-reaction/read-state/presence logic once, parameterized by
  `thread_id` (or a resolved `ChatThread` instance).
- **New** views (`app_chat/views.py`) call these handlers and serialize with the **new** unified
  serializers (nested `thread` object, `participants` array).
- **Legacy** views are refactored to thin wrappers: resolve their legacy URL kwargs
  (`course_id` / `thread_id` / `message_id`) to a thread/message, call the **same** shared
  handlers, then serialize with the **existing** serializers
  (`CourseChatMessageSerializer`, `DirectMessageSerializer`, `DirectMessageThreadSerializer`,
  `CourseChatReadStateSerializer`, `DirectMessageReadStateSerializer`) to preserve the exact
  legacy payload shape byte-for-byte.
- No new migrations. This phase touches `views.py`, `serializers.py`, `urls.py`, `consumers.py`,
  `realtime.py`, `app_ws/routing.py`, and adds `thread_handlers.py`.
- **Removal is not scheduled in this phase.** There is no fixed timeline and no traffic-based
  automation triggering it — see §2 and §6 for the accepted tradeoff.

---

## 6. Risks and accepted tradeoffs

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| Room-group rename must be atomic and correct | High impact if wrong: a mid-rollout mismatch would silently split a conversation across two unreachable groups | Single coordinated deploy (§4.2); dedicated cross-consumer broadcast test (§7) proves legacy and new consumers share a group before shipping |
| Indefinite dual-support has no forcing function | Two parallel code paths (legacy wrapper views/consumers + new generic ones) accrue as maintenance/tech debt for as long as Phase 3 (both mobile and web) is deferred | Accepted tradeoff, explicitly chosen over a hard cutover or a time-boxed deadline; Phase 4 (group chat) is easiest once the duplication is gone, which is incentive enough without forcing a deadline now |
| Presence cache re-keying (`course_id` → `thread_id`) | Existing course presence heartbeats are keyed by `course_id` today; re-keying by `thread_id` changes the cache key shape | Straightforward one-time key format change since presence is ephemeral (short TTL, no historical data to migrate) |
| `chat/threads` generic list only supports `kind=dm` today | Course threads have no "list of threads" client use case (course context comes from navigation, not a thread list) | Explicitly rejecting other `kind` values with `400` avoids a silently-empty, misleading list response |

---

## 7. Out of scope (this phase)

- Any mobile (`schedjuice-reimagined-mobile`) or web frontend (`schedjuice-reimagined-fe`) code
  changes — see Phase 3.
- Building the group chat feature itself (Phase 4) — `kind=group` is rejected, not implemented.
- Any change to `chat/dm/eligible-users`.
- Any change to the attachment upload flow (attachments continue to be referenced by
  `attachment_id` inside `content.attachments`).
- Legacy endpoint/consumer removal or usage instrumentation — deferred to an unscheduled future
  cleanup phase (see §2, "Legacy removal trigger").
- Changing which thread kinds may create messages via REST (course chat stays WS-only for
  sending).

---

## 8. Testing

- **Parity tests**: for each new generic endpoint/consumer behavior, assert it produces the same
  outcome (status codes, persisted rows, broadcast events) as today's course/DM-specific
  equivalent, for both `kind=course` and `kind=dm`.
- **Legacy contract-lock**: all existing `app_chat/tests/*` suites must keep passing **unchanged**
  (no fixture/assertion updates expected, unlike Phase 1) — they prove the legacy wrappers are
  byte-for-byte backward compatible.
- **Cross-consumer broadcast test**: a WebSocket client connected via the legacy URL
  (`ws/chat/<course_id>/` or `ws/chat/dm/<thread_id>/`) and a client connected via the new URL
  (`ws/chat/threads/<thread_id>/`) on the *same* thread both receive a message sent by either
  side — proves the shared room-group naming (§4.2) works across old and new consumers.
- **Presence re-keying test**: presence set via a heartbeat on the legacy course WS URL is
  visible via the new `GET /chat/threads/<thread_id>/presence` endpoint, and vice versa.
- Manual smoke test (local Docker Postgres, per `python-backend-env-and-tests` rule): exercise
  course chat + DM through both the legacy and new REST/WS surfaces side-by-side.

---

## 9. Future phases (revisit when starting)

- **Phase 3 — Mobile + Web FE migration.** Update **both** `schedjuice-reimagined-mobile`
  (`lib/chat/use-course-chat.ts`, `lib/chat/use-dm-chat.ts`, etc.) **and**
  `schedjuice-reimagined-fe` (`src/hooks/useCourseChat.ts`, `src/hooks/useDmChat.ts`, etc. — each
  currently has its own independent WebSocket client implementation) to consume the Phase 2
  generic `/chat/threads/...` endpoints and `ws/chat/threads/<id>/` WebSocket. Corrects Phase 1
  spec §9, which only mentioned mobile.
- **Phase 4 — Group chat feature.** Build the actual feature on `ChatThreadKind.GROUP` and
  `ChatThreadParticipant`, including defining the generic thread-creation payload for
  multi-participant threads (`POST /chat/threads` with `kind=group`) and multi-recipient
  `eligible-users`-style search.
- **Phase 2b (unscheduled) — Legacy endpoint/consumer removal.** Once Phase 3 has shipped for
  both mobile and web and is confirmed live in production, remove the legacy views/consumers/URLs
  and the shared-handler indirection they required, in a dedicated cleanup pass.
