# Unified Chat Schema (Phase 3: Mobile Client Migration) — Design Spec

**Date:** 2026-07-04
**Status:** Approved
**Repos:** `schedjuice-reimagined-mobile` (primary), `schedjuice-reimagined-be` (small additive backend addenda)
**Builds on:**
[Phase 1 — Backend Table Consolidation](2026-07-02-unified-chat-schema-design.md) (implemented),
[Phase 2 — Unified API Surface](2026-07-04-unified-chat-schema-phase2-api-design.md) (implemented)

## 1. Summary

Phase 2 shipped a generic, kind-aware `/chat/threads/...` REST surface and a single
`ChatThreadConsumer` WebSocket (`ws/chat/threads/<thread_id>/`) as **dual-support**
additions — the legacy course-specific and DM-specific endpoints/consumers keep working
unchanged. No client has moved onto the new surface yet.

This phase migrates the **mobile app** (`schedjuice-reimagined-mobile`) onto the Phase 2
surface: consolidating the split course/DM hooks and API modules into one thread-centric
implementation, moving routes to `/chat/threads/[threadId]`, and fixing a pre-existing
N+1 pattern in the chat list screen's course preview fetching along the way.

**Web FE migration is a separate, later effort** (unscheduled) — mobile ships
independently, and backend dual-support (and Phase 2b legacy cleanup) waits until **both**
clients have migrated and are confirmed live.

---

## 2. Locked decisions (brainstorming)

| Topic | Choice |
| --- | --- |
| Rollout sequencing | Mobile first, decoupled from web — either client may ship independently; backend dual-support (and Phase 2b legacy removal) stays until **both** are confirmed live |
| Route strategy | Fully thread-centric: `/chat/threads/[threadId]` for **both** course and DM. Breaking route changes are acceptable (app-release model, not a live web migration) |
| Refactor depth | Consolidate hooks + API layer (not a full feature merge): one `useChatThread(threadId, kind)`, one `lib/api/chat-threads.ts`; `use-course-chat.ts` / `use-dm-chat.ts` are removed, not kept as wrappers. Course-only features (mentions, presence UI, moderation, read-receipt UI) stay as separate feature-flagged logic — **not** merged into a single code path this phase |
| Attachment `foreignKey` | New uploads use `foreignKey = String(threadId)` for both course and DM going forward. Historical course attachments keep their old `courseId`-keyed bookkeeping metadata — no backfill, no functional impact (see §6) |
| Course list preview mechanism | Add a new dedicated backend endpoint, `GET courses/chat/last-messages?course_ids=...`, replacing the client-side N+1 loop (`fetchLastChatMessagesBatch`). Chosen over overloading `chat/threads?kind=` (different semantics/response shape) or over re-pointing the N+1 loop at thread-scoped calls (would double the round-trips and fix nothing) |
| Push notification deep-linking | Add `thread_id` to the course chat push payload (`app_chat/notifications.py`), additive alongside the existing `course_id` field — avoids an extra resolver round-trip on notification tap |

---

## 3. Backend addenda (small, additive, non-breaking)

These are the only backend changes in this phase. Both are purely additive — no schema
changes, no changes to existing dual-support endpoints, no effect on Phase 2b timing.

### 3.1 Course chat batch preview endpoint

```
GET courses/chat/last-messages?course_ids=1,2,3
```

- Auth-scoped to the requesting user's own courses (same membership check as
  `can_access_thread` for `kind=course`).
- For each `course_id`, resolves (get-or-create, mirroring `ChatThreadResolveView`) the
  course's `ChatThread` and returns its preview:

```json
{
  "data": [
    {
      "course_id": 7,
      "thread_id": 12,
      "last_message": { "id": 501, "created_at": "...", "content": {} },
      "unread_count": 3
    }
  ]
}
```

- `last_message` is `null` and `unread_count` is `0` for courses with no chat activity
  (no thread row exists yet — matches today's lazy-creation behavior; this endpoint does
  **not** force-create threads for courses with zero messages).
- This is the first time course chat exposes a real `unread_count` in a list context
  (today it's hardcoded to `0` on the client) — computed the same way DM's
  `unread_count` already is (via `ChatReadState.last_read_message_id` vs. latest message).

### 3.2 `thread_id` on course chat push payloads

`app_chat/notifications.py`'s course chat push `push_data` dict gains a `thread_id` field
(the thread object is already in scope at the call site):

```python
push_data={"type": "course_chat", "course_id": str(course_id), "thread_id": str(thread.id)}
```

`course_id` is kept for backward compatibility with any in-flight notifications and for
clients that haven't migrated (web FE, until its own Phase 3). This is a pure addition —
no existing field changes shape or is removed.

---

## 4. Mobile: API & hooks consolidation

- **New `lib/api/chat-threads.ts`** replaces `lib/api/chat.ts` and `lib/api/dm-chat.ts`.
  All message/reaction/read-state/presence calls become thread-scoped:
  - `GET/POST chat/threads/{threadId}/messages`
  - `PATCH/DELETE chat/threads/{threadId}/messages/{messageId}`
  - `POST chat/threads/{threadId}/messages/{messageId}/reactions`
  - `PUT chat/threads/{threadId}/read-state`
  - `GET chat/threads/{threadId}/presence`
  - `GET/POST courses/{courseId}/chat/thread` (course thread resolver, get-or-create)
  - `POST chat/threads` (body `{kind: "dm", participant_user_id, content, ...}`, replaces
    `POST chat/dm/threads`)
  - `GET chat/threads?kind=dm` (replaces `GET chat/dm/threads`)
  - `GET courses/chat/last-messages?course_ids=...` (new, §3.1)
  - `chat/dm/eligible-users` stays exactly as-is (untouched per Phase 2)
- **`use-chat-thread.ts`** becomes the single realtime hook, parameterized by `threadId`
  and a `kind`-driven `features` config (typing/heartbeat/read-receipts enabled for
  `course`, disabled for `dm` — the same flag shape it already supports today).
- **`use-course-chat.ts` and `use-dm-chat.ts` are deleted.** Screens resolve `threadId`
  (via the course resolver, cached per `courseId`, or directly from route params for DM)
  and call `useChatThread(threadId, kind)` directly.
- **`chat-messages-query.ts`** collapses to one factory keyed by `threadId`;
  `course-chat-messages-query.ts` and `dm-chat-messages-query.ts` are removed.
- **Query keys** move to a single thread-based scheme:
  - `['chat-thread-messages', threadId]` (replaces `course-chat-messages` /
    `dm-thread-messages`)
  - `['chat-threads', 'dm']` (replaces `dm-threads`)
  - `['chat-thread-presence', threadId]` (replaces `chat-presence`)
  - `['chat-course-last-messages', courseIdsKey]` (replaces `chat-last-messages-batch`)
  - `['chat-course-thread', courseId]` (new — caches the resolved `threadId` per course)
- **`use-chat-read-state.ts`** stays as the shared debounced-cursor hook, now always
  thread-keyed; `use-course-chat-read-state.ts` / `use-dm-chat-read-state.ts` adapters are
  removed.
- **Not changed this phase**: course-only logic (`course-conversation-mention.ts`,
  `course-chat-read-receipt.ts`, presence UI, moderation) — these already branch on
  `features`/`mode` inside shared components (`ChatConversationShell`, `ChatInfoScreen`)
  and continue to do so.

---

## 5. Mobile: routes & navigation

- `app/(protected)/chat/[id].tsx` (course) and `app/(protected)/chat/dm/[threadId].tsx`
  collapse into **`app/(protected)/chat/threads/[threadId].tsx`**. The screen loads the
  thread, reads `kind` from it, and renders course-specific chrome (mentions, presence,
  moderation) only when `kind === "course"`.
- `chat-info/[id].tsx` and `dm-info/[threadId].tsx` collapse into
  `chat/threads/[threadId]/info.tsx`, keeping `ChatInfoScreen`'s existing `mode` branching.
- **Course tap flow**: list screen tap → resolve `courseId → threadId` (via the resolver;
  React-Query-cached per `courseId`, so repeat taps are instant) → navigate to
  `/chat/threads/[threadId]`. First-ever open for a course with no prior thread costs one
  resolver round-trip (get-or-create); every subsequent open is cache-hit.
- **DM tap flow**: same target route, `/chat/threads/[threadId]`; the existing
  `threadId=new` + `participantUserId` draft-compose flow is preserved — first send calls
  `POST chat/threads` (`kind=dm`) instead of `POST chat/dm/threads`, then
  `router.replace`s to the real `threadId`.
- **`store/active-chat.ts`** simplifies from `{kind, courseId?, threadId?}` to
  `{kind, threadId}` — push-suppression logic keys off `threadId` for both kinds, matching
  the new push payload shape (§3.2).

---

## 6. Mobile: list screen, WebSocket, attachments, notifications

### 6.1 List screen

- **Course rows**: replace the client-side N+1 loop (`fetchLastChatMessagesBatch`) with a
  single call to `GET courses/chat/last-messages?course_ids=...` (§3.1).
  `ConversationListItem` for `kind: "course"` gains a `threadId` field and a real
  `unreadCount` (previously hardcoded to `0`).
- **DM rows**: `fetchDmThreads()` → `GET chat/threads?kind=dm`, consuming the new
  `participants` array instead of `user_low`/`user_high`/`other_participant`. "The other
  participant" is derived locally by filtering the current user out of `participants`
  (a 1:1 DM thread always has exactly one remaining entry — this is forward-compatible
  with group chat's `participants` shape without behaving differently today).
- Both rows navigate via one unified `handleThreadPress(threadId)`, replacing the
  separate `handleChatPress(courseId)` / `handleDmPress(thread)` handlers.
- Polling cadence for course previews is unchanged (25s while focused).

### 6.2 WebSocket

- Single URL builder: `ws/chat/threads/{threadId}/?token=...&tenant=...`, for both kinds.
  The existing `features` config (typing/heartbeat/read-receipts for `course`; off for
  `dm`) is unchanged in behavior, just no longer duplicated across two hook files.

### 6.3 Attachments

- Composer/upload always passes `foreignKey = String(threadId)` (locked decision, §2).
  See §7 for the full explanation of why this has no functional impact on historical
  attachments.

### 6.4 Push notifications

- `lib/notifications/chat-notification.ts` reads the new `thread_id` field on course
  payloads (§3.2) and routes directly to `/chat/threads/{thread_id}`. If `thread_id` is
  absent (an in-flight notification sent before this ships, carrying only `course_id`),
  it falls back to resolving `course_id → threadId` client-side before navigating — a
  transient, self-resolving edge case.
- DM payloads already carry `thread_id` today; no change needed there.
- `use-push-notifications.ts` cache-invalidation keys move to the single
  `['chat-thread-messages', threadId]` scheme (§4).

---

## 7. What happens to existing attachments

This section exists because it's a common point of confusion during the migration.

**Historical (already-sent) attachments are completely unaffected.** Chat has never
resolved attachments by scanning JuiceBox's `table_name`/`foreign_key` columns — every
message's attachments are referenced by `attachment_id`s embedded directly in
`ChatMessage.content.attachments` (JSON), resolved via `POST /attachments/resolve` with
those IDs. The Phase 1 data migration already copied that `content` JSON over verbatim.
So old messages render their attachments identically before and after this phase — no
re-linking, no backfill, no risk.

**New attachments uploaded after this ships** only change at write time: JuiceBox records
`foreign_key = String(threadId)` instead of `String(courseId)` for course chat uploads.
That's purely bookkeeping metadata on the JuiceBox side — never read back by either
client or by JuiceBox's own cleanup cron (`delete_media.cron.ts`, which sweeps by
`is_deleted` across all tenant schemas, not by `table_name`/`foreign_key`). No backend
code cascades or cleans up chat attachments by matching `foreign_key` to a course/thread.

**Net effect**: the only observable change is that a raw inspection of JuiceBox's
attachment table would show old chat attachments keyed by `courseId` and new ones keyed
by `threadId`, mixed together — a cosmetic inconsistency in one audit-only column, with
zero effect on what users see or how anything resolves.

---

## 8. Types

- `types/chat.ts`: `DmThread` is replaced by a unified `ChatThread`:

```ts
type ChatThread = {
  id: number;
  kind: "course" | "dm" | "group";
  course?: number;
  participants?: { id: number; name: string; email: string; profile_image: string | null }[];
  last_message: ChatMessageApi | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
};
```

- `ChatMessageApi.thread` becomes the canonical nested `{ id, kind, course }` object
  (matching the new backend payload) rather than separate `course` / `thread` fields.

---

## 9. Testing

- **Mobile unit/component tests** (`__tests__/lib/chat/*`, `__tests__/components/chat/*`):
  updated to the consolidated hooks/types. Fixture/assertion updates are expected here
  (unlike Phase 2's backend contract-lock) since this phase intentionally changes client
  behavior (URLs, query keys, route structure).
- **New coverage**:
  - Course thread resolver caching (repeat opens don't re-fetch).
  - `courses/chat/last-messages` batch preview mapping (course → thread → preview,
    including the "no thread yet" null case).
  - DM `participants` → "other participant" derivation.
  - Push payload `thread_id` routing, including the `course_id`-only fallback path.
- **Backend tests** (new, small): `courses/chat/last-messages` endpoint (auth scoping,
  batch resolution, empty-course case), `thread_id` present in course push `push_data`.
- **Manual smoke test** (per `python-backend-env-and-tests` rule for the backend piece;
  dev build for mobile): course chat send/edit/delete/react/typing/read-receipt, DM chat
  send/edit/delete/react, notification tap deep-link for both kinds, cold-start list
  screen previews with real unread counts.

---

## 10. Risks and accepted tradeoffs

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| First-ever course chat open per course costs one resolver round-trip | Low impact, one-time per course per app session | Cached client-side (React Query) keyed by `courseId`; instant on repeat opens |
| Old app versions in the wild keep hitting legacy endpoints after this ships | Expected, by design | Backend dual-support (Phase 2) keeps legacy endpoints/consumers alive indefinitely; no forced-upgrade mechanism |
| In-flight push notifications sent just before release lack `thread_id` | Low impact, transient | Client falls back to resolving `course_id → threadId` only when `thread_id` is absent; self-resolves after the in-flight window passes |
| Historical course attachments keep old `courseId`-keyed bookkeeping metadata | No functional impact (see §7) | None needed |
| Mobile and web now diverge in which chat surface they use for an unscheduled period | Accepted tradeoff, explicitly chosen (mobile-first sequencing) | Backend dual-support already designed for exactly this; no forcing function needed until web's own Phase 3 |

---

## 11. Out of scope (this phase)

- Web FE (`schedjuice-reimagined-fe`) migration — separate, unscheduled future effort;
  not coordinated with this phase.
- Phase 2b — legacy endpoint/consumer removal (waits for both clients to migrate and be
  confirmed live).
- Phase 4 — building the group chat feature itself.
- Any change to `chat/dm/eligible-users`.
- Merging course-only features (mentions, presence UI, moderation, read-receipt UI) into
  a single kind-agnostic code path — these remain separate, feature-flagged logic.
- Backfilling or re-keying historical attachment `foreign_key` values.

---

## 12. Files touched (indicative, not exhaustive)

### Backend

| File | Change |
| --- | --- |
| `app_chat/views.py` | New `CourseChatLastMessagesBatchView` |
| `app_chat/urls.py` | New route: `courses/chat/last-messages` |
| `app_chat/thread_handlers.py` / `services.py` | Batch course-thread resolution + preview helper |
| `app_chat/notifications.py` | Add `thread_id` to course chat `push_data` |
| `app_chat/tests/*` | New tests for the batch endpoint and push payload |

### Mobile

| File | Change |
| --- | --- |
| `lib/api/chat-threads.ts` | New — replaces `lib/api/chat.ts`, `lib/api/dm-chat.ts` |
| `lib/chat/use-chat-thread.ts` | Becomes the single realtime hook (kind-aware `features`) |
| `lib/chat/use-course-chat.ts`, `use-dm-chat.ts` | Removed |
| `lib/chat/chat-messages-query.ts` | Collapsed factory, thread-keyed |
| `lib/chat/course-chat-messages-query.ts`, `dm-chat-messages-query.ts` | Removed |
| `lib/chat/use-chat-read-state.ts` | Stays; course/DM adapter wrappers removed |
| `app/(protected)/chat/threads/[threadId].tsx` | New — replaces `chat/[id].tsx`, `chat/dm/[threadId].tsx` |
| `app/(protected)/chat/threads/[threadId]/info.tsx` | New — replaces `chat-info/[id].tsx`, `dm-info/[threadId].tsx` |
| `app/(protected)/(tabs)/chat/index.tsx` | List screen: new batch endpoint, unified `participants`, unified press handler |
| `store/active-chat.ts` | Simplifies to `{kind, threadId}` |
| `types/chat.ts` | `DmThread` → unified `ChatThread`; `ChatMessageApi.thread` nested object |
| `lib/notifications/chat-notification.ts` | Reads `thread_id`, fallback to `course_id` resolve |
| `lib/notifications/use-push-notifications.ts` | Updated invalidation keys |
| `lib/chat/find-dm-thread-by-participant.ts` | Updated for `participants` array shape |
| `__tests__/lib/chat/*`, `__tests__/components/chat/*` | Updated fixtures/assertions |

---

## 13. Future phases

- **Phase 3b (unscheduled) — Web FE migration.** Update `schedjuice-reimagined-fe`
  (`useCourseChat.ts`, `useDmChat.ts`, and their split query/reaction/read-state helpers)
  to consume the same Phase 2 surface, following the same consolidation approach as this
  phase where applicable to that codebase's structure.
- **Phase 4 — Group chat feature.** Build on `ChatThreadKind.GROUP` and
  `ChatThreadParticipant`. The unified `participants` array shape adopted by mobile in
  this phase (§6.1, §8) is already group-chat-ready.
- **Phase 2b (unscheduled) — Legacy cleanup.** Remove Phase 2's dual-support legacy
  endpoints/consumers once **both** mobile (this phase) and web (Phase 3b) have shipped
  and are confirmed live in production.
