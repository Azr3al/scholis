# Unified Chat Schema (Phase 1: Backend Table Consolidation) — Design Spec

**Date:** 2026-07-02
**Status:** Approved
**Repo:** `schedjuice-reimagined-be` (Phase 1 is backend-only; see §9 for related repos)

## 1. Summary

Course chat and DM chat currently live in six near-duplicate tables:

| Table | Role |
| --- | --- |
| `CourseChatMessage` | Course chat message |
| `CourseChatReadState` | Per-user read cursor for a course |
| `DirectMessageThread` | 1:1 DM thread (normalized user pair) |
| `DirectMessage` | DM message |
| `DirectMessageReadState` | Per-user read cursor for a DM thread |
| `ChatMessageReaction` | Reaction row, already shared via two nullable FKs (`course_chat_message`, `direct_message`) with an XOR constraint |

`CourseChatMessage`/`DirectMessage` and `CourseChatReadState`/`DirectMessageReadState`
are structurally identical except for which "container" they point at (`course` vs.
`thread`). Course chat also has no thread row at all — it's just keyed by `course_id`
directly. This spec replaces the six tables with five generic ones, laying groundwork
for a future group-chat feature without committing to building it now.

**Decision:** Full physical merge (not just code-level DRY) into a generic
`ChatThread` / `ChatThreadParticipant` / `ChatMessage` / `ChatReadState` /
`ChatMessageReaction` schema, migrated in a maintenance window. **The existing
REST/WebSocket API contracts (URLs, payload shapes) do not change in this phase** —
only the underlying models and internal code do.

---

## 2. Locked decisions (brainstorming)

| Topic | Choice |
| --- | --- |
| Scope | Full DB table merge, not just shared code/base classes |
| Data safety | Real data exists; a brief maintenance window for migration is acceptable (no zero-downtime dual-write needed) |
| Course "thread" concept | Yes — course chat gets a real `ChatThread(kind=course)` row, same as DM, for parity |
| Future thread kinds | Group chat is planned next — design the participant model for it now, but don't build the feature |
| Participant model | Proper `ChatThreadParticipant` (thread × user) table now, not fixed `user_low`/`user_high` columns — avoids a second migration when group chat lands |
| DM pair uniqueness | Enforced via a computed `dm_pair_key` (`"{min_id}:{max_id}"`) with a partial unique constraint, since there's no `user_low`/`user_high` pair to key off anymore |
| Course thread participants | **Not** materialized into `ChatThreadParticipant` — derived live from `UserCourse` via `ChatThread.course_id` (single source of truth; avoids drift) |
| Migration mechanics | Fresh tables (Approach B): both course-side and DM-side rows get remapped IDs uniformly, rather than reusing/renaming one existing table and only remapping the other side |
| API surface | Stays stable in this phase — no URL/payload changes, no mobile/FE changes required |

---

## 3. Schema design

### 3.1 New models (`app_chat/models.py`)

```python
class ChatThreadKind(models.TextChoices):
    COURSE = "course", "course"
    DM = "dm", "dm"
    GROUP = "group", "group"  # reserved for a future phase; unused for now


class ChatThread(BaseModel):
    kind = models.CharField(max_length=10, choices=ChatThreadKind.choices)
    course = models.ForeignKey(
        "app_course.Course", null=True, blank=True,
        on_delete=models.CASCADE, related_name="chat_threads",
    )
    dm_pair_key = models.CharField(max_length=40, null=True, blank=True)  # kind=dm only

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["course"], condition=models.Q(kind="course"),
                name="uniq_chat_thread_course",
            ),
            models.UniqueConstraint(
                fields=["dm_pair_key"], condition=models.Q(kind="dm"),
                name="uniq_chat_thread_dm_pair",
            ),
        ]
        indexes = [models.Index(fields=["kind"])]


class ChatThreadParticipant(BaseModel):
    """Explicit participants for kind=dm/group threads only. Course threads derive
    membership from UserCourse via ChatThread.course_id — not duplicated here."""

    thread = models.ForeignKey(ChatThread, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="chat_thread_participations"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["thread", "user"], name="uniq_chat_thread_participant"),
        ]
        indexes = [models.Index(fields=["user", "thread"])]


class ChatMessage(BaseModel):  # replaces CourseChatMessage + DirectMessage
    thread = models.ForeignKey(ChatThread, on_delete=models.CASCADE, related_name="messages")
    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE, related_name="chat_messages")
    content = models.JSONField()
    reply_to = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="replies"
    )
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        "app_auth.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="chat_messages_deleted",
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["thread", "created_at"])]


class ChatReadState(BaseModel):  # replaces CourseChatReadState + DirectMessageReadState
    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE, related_name="chat_read_states")
    thread = models.ForeignKey(ChatThread, on_delete=models.CASCADE, related_name="read_states")
    last_read_message_id = models.BigIntegerField(null=True, blank=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "thread"], name="uniq_chat_read_user_thread"),
        ]
        indexes = [models.Index(fields=["thread", "user"])]
```

`ChatMessageReaction` keeps its name and its own PK space (no ID collision to solve)
but is simplified to a single FK:

```python
class ChatMessageReaction(BaseModel):
    emoji = models.CharField(max_length=10)
    created_by = models.ForeignKey(
        "app_auth.User", on_delete=models.CASCADE, related_name="chat_message_reactions"
    )
    message = models.ForeignKey(ChatMessage, on_delete=models.CASCADE, related_name="reactions")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["created_by", "message"], name="uniq_chat_reaction_user_message"),
        ]
        indexes = [models.Index(fields=["message"])]
```

### 3.2 Removed models

`CourseChatMessage`, `CourseChatReadState`, `DirectMessageThread`, `DirectMessage`,
`DirectMessageReadState` are removed from the ORM after cutover. Their tables are
renamed with a `legacy_` prefix (not dropped) for a rollback window, then dropped in
a follow-up migration once confidence is high (see §5).

---

## 4. Migration plan (maintenance window, per-tenant schema)

1. **Schema migration** — create `ChatThread`, `ChatThreadParticipant`, `ChatMessage`,
   `ChatReadState`; add `message` FK to `ChatMessageReaction`.
2. **Data migration** (Django data migration, run inside `schema_context(schema)` per
   tenant):
   - For each `DirectMessageThread` → new `ChatThread(kind=dm, dm_pair_key=f"{low}:{high}")`
     + 2 `ChatThreadParticipant` rows (`user_low`, `user_high`).
   - For each distinct `course_id` with ≥1 `CourseChatMessage` or `CourseChatReadState`
     row → new `ChatThread(kind=course, course_id=...)`. (Courses that never used chat
     get no thread row — matches today's implicit lazy-creation feel and avoids
     creating dead rows for every course in the school.)
   - Copy `CourseChatMessage` + `DirectMessage` into `ChatMessage` in two passes:
     - Pass 1: insert rows (`content`, `user`, `created_at`, `edited_at`, `deleted_at`,
       `deleted_by`) with `reply_to=NULL`, building an `{old_id: new_id}` map per
       source table (`course_message_id_map`, `dm_message_id_map`).
     - Pass 2: backfill `reply_to` using the relevant map now that every row exists
       (a reply's parent always comes from the same source table/thread).
   - Copy `CourseChatReadState` + `DirectMessageReadState` → `ChatReadState`, remapping
     `last_read_message_id` via the same ID maps.
   - Backfill `ChatMessageReaction.message_id` from whichever of
     `course_chat_message_id` / `direct_message_id` was set, via the ID maps; then
     drop those two old columns and the old XOR constraint.
3. **Application deploy** — swap `views.py`, `serializers.py`, `services.py`,
   `consumers.py`, `realtime.py`, `notifications.py`, `signals.py`, `admin.py` to the
   new models. **URLs and request/response payload shapes stay identical**: e.g. the
   `course_id`-keyed course chat endpoints resolve
   `ChatThread.objects.get(kind=course, course_id=course_id)` internally; DM
   thread-keyed endpoints work the same as today against the new table.
   - `signals.py` (currently keyed on `CourseChatMessage` for course chat list-cache
     invalidation) moves to `ChatMessage` post_save/post_delete, filtered to
     `thread.kind == ChatThreadKind.COURSE`.
   - Course chat thread lookup on first message becomes lazy `get_or_create`
     (mirrors today's `get_or_create_dm_thread` pattern) rather than requiring a
     pre-existing row.
4. **Verification** — row-count parity checks (old vs. new tables per tenant),
   spot-check message content/reply chains/reactions/read cursors, full
   `app_chat/tests/*` suite green (see §7), manual WS smoke test (send/edit/delete/
   react/read-receipt for both course and DM chat).
5. **Rollback window** — keep old tables renamed (`legacy_app_chat_coursechatmessage`,
   etc.), not dropped, for ~1-2 weeks post-cutover. Drop them in a dedicated follow-up
   migration once confidence is high.

---

## 5. Risks and accepted tradeoffs

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| `ChatMessage.id` changes for all existing messages | Low impact — mobile client (`lib/chat/use-chat-thread.ts`) keeps message/thread data only in React Query's in-memory cache, refetched on mount; nothing persisted to `SecureStore`/`AsyncStorage` | None needed |
| `DirectMessageThread.id` → `ChatThread.id` also changes | Push notifications queued/sent before cutover carry `thread_id` (DM) or `message_id` in their payload (`app_chat/notifications.py`). A user tapping a pre-cutover notification after cutover could hit a stale ID | Accepted, transient risk — self-resolves after the in-flight notification window passes. Recommend the client fail gracefully (fall back to chat list) on a 404 rather than engineering ID preservation for this narrow case |
| Chat attachments | Not affected — attachments are referenced by `attachment_id` embedded in the message's `content` JSON (not the generic `Attachment.table_name`/`foreign_key` pattern used elsewhere), and that JSON copies over verbatim | None needed |
| `message_cursor.py` / `reaction_toggle_helpers.py` | Already generic over any queryset/model with `id`/`created_at` — no changes expected beyond call-site model swaps | Covered by existing tests |

---

## 6. Out of scope (this phase)

- Any change to REST/WS URLs or payload shapes (see §9, Phase 2)
- Mobile or web frontend changes (see §9, Phase 3)
- Building the group chat feature itself (see §9, Phase 4) — this phase only ensures
  `ChatThreadParticipant` won't need a second migration when that lands
- Zero-downtime/dual-write migration tooling — a maintenance window is accepted

---

## 7. Testing

- **Migration test**: seed old-schema fixtures (course + DM messages, replies,
  reactions, read states, across ≥2 tenant schemas), run the data migration, assert:
  - Row counts match (old vs. new) per table per tenant
  - Reply chains (`reply_to`) resolve correctly post-remap
  - Reaction ownership (`created_by`, `emoji`) and message linkage are preserved
  - Read cursors (`last_read_message_id`) point at the correct remapped message
- **Existing suites**: `app_chat/tests/*` (permissions, reactions, cursor pagination,
  RBAC, WebSocket tenant auth) updated to the new models — behavior/contracts should
  not change, so these are mostly fixture/assertion updates, not new test logic.
- **Manual smoke test**: on local Docker Postgres (per `python-backend-env-and-tests`
  rule), exercise course chat + DM: send, edit, delete, react, read-receipt, reply,
  over WebSocket.

---

## 8. Files touched (indicative, not exhaustive)

| File | Change |
| --- | --- |
| `app_chat/models.py` | Replace 6 models with `ChatThread`, `ChatThreadParticipant`, `ChatMessage`, `ChatReadState`, simplified `ChatMessageReaction` |
| `app_chat/migrations/00XX_*.py` | Schema migration (new tables) |
| `app_chat/migrations/00XX_data_migration.py` | Data migration (per §4.2) |
| `app_chat/migrations/00XX_legacy_cleanup.py` | Follow-up: drop renamed legacy tables |
| `app_chat/views.py` | Swap model/queryset references; resolve `ChatThread` by `kind` |
| `app_chat/serializers.py` | Update `CourseChatMessageSerializer`/`DirectMessageSerializer` (likely collapse toward one `ChatMessageSerializer`) |
| `app_chat/services.py` | Update DM thread get-or-create to use `ChatThread`/`ChatThreadParticipant`; add course thread get-or-create |
| `app_chat/consumers.py`, `realtime.py` | Swap model references |
| `app_chat/notifications.py` | Swap model references; `thread_id`/`message_id` payload fields unaffected in shape |
| `app_chat/signals.py` | Re-key cache invalidation signal to `ChatMessage` filtered by `thread.kind` |
| `app_chat/admin.py` | Register new models, remove old |
| `app_chat/reaction_helpers.py`, `reaction_toggle_helpers.py` | Minimal/no changes (already generic) |
| `app_chat/tests/*` | Update fixtures/assertions to new models |

---

## 9. Future phases

This project was decomposed into phases during brainstorming.

- **Phase 2 — Unified API surface.** ✅ Speced:
  [2026-07-04-unified-chat-schema-phase2-api-design.md](2026-07-04-unified-chat-schema-phase2-api-design.md).
  Generic thread-based REST endpoints and a single WebSocket consumer/routing scheme
  for course + DM, built on top of this Phase 1 schema, shipped as a **dual-support**
  rollout (old endpoints/consumers keep working as thin wrappers — not a hard breaking
  change requiring immediate coordinated client updates).
- **Phase 3 — Mobile + Web FE migration.** Update **both** `schedjuice-reimagined-mobile`
  and `schedjuice-reimagined-fe` to consume the Phase 2 generic endpoints, retiring the
  separate course/DM query hooks and each repo's independent chat WebSocket client in
  favor of the unified `/chat/threads/...` surface. (Corrected during Phase 2
  brainstorming — the web frontend was found to have its own independent chat client
  too, not just mobile as originally noted here.)
- **Phase 4 — Group chat feature.** Build the actual group chat feature using
  `ChatThreadKind.GROUP` and `ChatThreadParticipant`, which Phase 1 already prepares
  the schema for.
- **Phase 2b (unscheduled) — Legacy cleanup.** Remove the Phase 2 dual-support legacy
  endpoints/consumers once Phase 3 has shipped for both clients and is confirmed live.
