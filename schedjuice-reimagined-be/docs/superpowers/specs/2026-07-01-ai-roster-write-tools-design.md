# AI Roster Write Tools — Design Spec

**Date:** 2026-07-01  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`

## 1. Summary

Add four **write tools** so the Telegram and web AI assistant can enroll/remove
students and assign/remove staff on courses, with **mandatory confirmation** before
any mutation, **RBAC enforcement**, and **auditable** membership events tagged
by channel (`telegram_bot`, `web_ai`, `api`).

This builds on the existing AI tool surface (`adjust_staff_points`, intent
routing, A/B/C disambiguation) and mirrors HTTP roster endpoints — not new
business rules.

**Tools:**

| Tool | Verb |
| --- | --- |
| `enroll_student_in_course` | Add student to course roster |
| `remove_student_from_course` | Remove student (delete `UserCourse`) |
| `assign_staff_to_course` | Add staff with role + session scope |
| `remove_staff_from_course` | Remove staff (delete `UserCourse`) |

---

## 2. Locked decisions (brainstorming)

| Topic | Choice |
| --- | --- |
| Architecture | **Approach 1** — two-phase pending write (resolve → confirm → execute) |
| Channels | **Telegram + web** — same tools; Telegram inline Confirm/Cancel; web typed confirm **TBD** |
| RBAC | `course.manage_members` + `check_course_write(actor, course)` |
| Confirmation | **Always** confirm before mutation, even when unambiguous |
| Audit | Extend `CourseMembershipEvent` with `source`; log **staff** join/remove too |
| Staff removal | Full roster removal (delete `UserCourse`) |
| Staff already on course | **Reject** (`already_assigned`) — no update-in-place |
| Role resolution | `MT`/`AT` → seniority; else `course_role_query` by name; ambiguous → A/B/C |
| Sessions (default) | All course events (`UserEvent` for every `Event`) |
| Sessions (optional) | `weekdays: [0–6]` — Sunday=0, JS `Date.getDay()` convention; weekday computed in **org timezone** |
| Natural language weekdays | User speaks NL; model maps to numeric `weekdays` in tool call |
| Ad-hoc session pick | **Not supported** — reject with link to member edit page |
| Web confirm UX | **Deferred** — placeholder in implementation plan |

---

## 3. Problem & constraints

The assistant can **read** rosters (`get_course_roster`) but cannot **mutate**
them. Staff ask in Telegram: “Add James as AT on PET 151 Mondays and
Wednesdays.” Today that fails or loops until `tool_limit_exceeded`.

Write tools add safety risk. Mitigations:

1. **Intent subsetting** — roster writes only on write-intent turns.
2. **Entity disambiguation** — A/B/C for ambiguous user, course, or role.
3. **Mandatory confirmation** — no execution until explicit confirm (inline on
   Telegram; typed on web when defined).
4. **HTTP parity** — shared roster service; same MS Teams / side-effect guards.
5. **Audit** — `CourseMembershipEvent.source` distinguishes bot vs web vs API.

---

## 4. Architecture

```text
User message (NL)
    │
    ▼
Pending disambiguation? ──yes──► Resolve A/B/C ──► retry tool / continue
    │ no
    ▼
Pending write confirmation? ──yes──► Parse confirm/cancel (web) or wait for callback (Telegram)
    │ no
    ▼
Intent router → write tools exposed
    │
    ▼
Write tool called
    │
    ├── RBAC + scope checks
    ├── Resolve entities (user, course, role)
    ├── Business validation (already assigned, ad-hoc, MS pre-checks)
    │
    ▼
Valid? ──no──► error / ambiguous_* (no confirmation stored)
    │
   yes
    ▼
Build preview → save AIPendingWriteConfirmation
    │
    ├── Telegram: bot sends summary + InlineKeyboard [Confirm] [Cancel]
    └── Web: tool returns pending_confirmation; model shows summary + asks confirm (TBD)
    │
    ▼
User confirms
    │
    ▼
execute_roster_write(pending) → shared service → CourseMembershipEvent(source=…)
```

### 4.1 Components

| Component | Location | Role |
| --- | --- | --- |
| `AIPendingWriteConfirmation` | `app_telegram/models.py` | Resolved args + summary; one per `(user, channel_key)` |
| `confirmation.py` | `app_ai/` | Save/get/clear pending; web confirm/cancel pre-flight (when defined) |
| `roster_writes.py` | `app_course/roster_writes.py` | Execute enroll/remove/assign/remove; HTTP parity |
| `resolve_course_role` | `app_ai/tools/resolve.py` | Seniority/name role lookup with A/B/C |
| Roster write tools | `app_ai/tools/enroll_*.py`, etc. | Validate + return `pending_confirmation` |
| Telegram inline UI | `app_telegram/client.py`, `binding.py`, webhook | Confirm/Cancel callbacks |
| `CourseMembershipEvent.source` | migration + `membership_history.py` | Audit channel |

### 4.2 Pending state ordering

| State | Priority |
| --- | --- |
| `AIDisambiguationPending` | Handled first (existing flow) |
| `AIPendingWriteConfirmation` | Second — unrelated messages get reminder; cancel clears |

**One pending confirmation per `(user_id, channel_key)`**. TTL: 10 minutes (same
as disambiguation). New write attempt clears expired or stale pending rows.

---

## 5. Audit — `CourseMembershipEvent.source`

### 5.1 Migration

Add nullable `source` to `CourseMembershipEvent`:

| Value | When |
| --- | --- |
| `api` | HTTP views (default for existing code paths after migration) |
| `web_ai` | Confirmed web assistant write |
| `telegram_bot` | Confirmed Telegram assistant write |
| `import` | Bulk import commands |
| `null` | Historical backfill rows (pre-migration) |

### 5.2 Staff events

Extend instrumentation to **teachers**:

- **JOINED** — new teacher `UserCourse` created (assign or bulk management create)
- **REMOVED** — teacher `UserCourse` deleted

Update `record_membership_event` / `record_membership_events_bulk` to accept
optional `source=`. Roster write service always passes the appropriate source.
HTTP views pass `source="api"`.

---

## 6. Shared roster service

New module `app_course/roster_writes.py` — **single execution path** for AI
confirmed writes and (optionally later) HTTP refactors. v1: AI calls this
directly; HTTP views unchanged except `source=` on membership events.

### 6.1 `execute_enroll_student`

Mirrors `CourseStudentListCreateView.post`:

- `check_course_write(actor, course)`
- MS Teams roster sync pre-checks when `tenant_syncs_course_team_roster`
- `UserCourse.get_or_create(..., assigned_as=STUDENT)`
- `record_membership_event(JOINED, actor=actor, source=source)` on create
- `refresh_course_member_counts_now`

Returns `{status: "ok", ...}` or structured error (`teams_link_required`, etc.).

### 6.2 `execute_remove_student`

Mirrors `CourseStudentRemoveView.delete`:

- Verify student `UserCourse` exists → else `not_enrolled`
- MS remove member task when applicable
- `record_membership_event(REMOVED, ...)` then delete `UserCourse`

### 6.3 `execute_assign_staff`

Mirrors `TeacherAssignView.post`:

- `check_teacher_event_assignment(actor, staff_id, course)`
- Reject if `UserCourse` already exists for `(user, course)` → `already_assigned`
- Resolve `assigned_as_role_id` from caller (already resolved in tool layer)
- Compute `new_events` from course events (all or weekday-filtered); `removed_events=[]`
- Create/update `UserCourse` (teacher) + `UserEvent` rows in transaction
- MS Teams / meeting attendee side effects per existing view logic
- `record_membership_event(JOINED, source=source)` when **new** teacher row created
- Telegram roster sync signals (existing) fire via model save paths

**Weekday filter:**

```python
def event_weekday(event, tz_name: str) -> int:
    """Return 0=Sunday … 6=Saturday in org timezone (JS getDay convention)."""
```

If `weekdays` omitted or empty → assign **all** course `Event` rows.

### 6.4 `execute_remove_staff`

Full removal:

- `check_course_write(actor, course)`
- Verify teacher `UserCourse` exists → else `not_on_roster`
- MS / Telegram cleanup per existing delete paths (`UserCourseManagementView` pattern)
- `record_membership_event(REMOVED, source=source)` then delete `UserCourse`
- Delete associated `UserEvent` rows (existing cascade / explicit cleanup)

### 6.5 Member edit URL helper

```python
def course_member_edit_url(org, course_id: int) -> str:
    return build_frontend_url(org, f"/courses/{course_id}/edit?tab=edit-members")
```

Used in `adhoc_not_supported` responses.

---

## 7. Tool contracts

All tools:

- `exposure="write"`
- Callable only on write-intent turns
- Return a **single dict** (consistent with existing tools)
- **Never mutate** on first call — return `pending_confirmation` when validation passes

### 7.1 `enroll_student_in_course`

**Use when:** User asks to enroll/add a student to a course.

| Field | Type | Required |
| --- | --- | --- |
| `course_id` | integer | one of id/query |
| `course_query` | string | one of id/query |
| `user_id` | integer | one of id/query |
| `student_query` | string | one of id/query |

**Guards:** student role; `already_enrolled` if active `UserCourse` exists.

**Preview:** “Enroll **[Name](profile_url)** in **[Title](url)**?”

### 7.2 `remove_student_from_course`

Same resolution fields. **Guards:** `not_enrolled` if no student `UserCourse`.

**Preview:** “Remove **[Name](profile_url)** from **[Title](url)**?”

### 7.3 `remove_staff_from_course`

Same resolution; `resolve_user(..., role="staff")`.

**Preview:** “Remove **[Name](profile_url)** from **[Title](url)** staff roster?”

### 7.4 `assign_staff_to_course`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `course_id` / `course_query` | int / string | one of | |
| `user_id` / `staff_query` | int / string | one of | |
| `role_seniority` | `"MT"` \| `"AT"` | one of seniority/name | |
| `course_role_query` | string | one of seniority/name | Required when not MT/AT |
| `weekdays` | integer[] | no | 0–6; omit = all sessions |
| `specific_event_ids` | integer[] | no | If non-empty → `adhoc_not_supported` |

**Role resolution (`resolve_course_role`):**

1. `role_seniority="MT"` → `AssignedAsRole` where `seniority=MAIN_TEACHER`
2. `role_seniority="AT"` → `seniority=ASSISTANT_TEACHER`
3. Else require `course_role_query` — case-insensitive substring on `name`
4. 0 matches → `not_found`; >1 → `ambiguous_course_role` with A/B/C

**Guards:**

- `already_assigned` if staff `UserCourse` exists
- `specific_event_ids` present → `adhoc_not_supported` + `member_edit_url`
- MS Teams pre-check failures → same errors as HTTP (block before confirm)

**Preview:** “Assign **[Name](profile_url)** as **[Role name]** on **[Title](url)**, sessions: **all** / **Mon, Wed**?”

### 7.5 `pending_confirmation` response

```json
{
  "status": "pending_confirmation",
  "tool_name": "assign_staff_to_course",
  "summary": "Assign Jane Doe as Assistant Teacher on PET 151, sessions: Mon + Wed?",
  "preview": {
    "staff": {"id": 34, "name": "Jane Doe", "profile_url": "..."},
    "course": {"id": 123, "title": "PET 151", "url": "..."},
    "role": {"id": 2, "name": "Assistant Teacher"},
    "weekdays": [1, 3],
    "weekday_labels": ["Mon", "Wed"],
    "session_count": 24
  },
  "message": "Please confirm to proceed."
}
```

Orchestration stores `partial_args` (resolved IDs + execution payload) in
`AIPendingWriteConfirmation`.

### 7.6 Success response (after confirm)

```json
{
  "status": "ok",
  "action": "assign_staff",
  "staff": {"id": 34, "name": "Jane Doe"},
  "course": {"id": 123, "title": "PET 151", "url": "..."},
  "role": {"id": 2, "name": "Assistant Teacher"},
  "sessions_assigned": 24
}
```

---

## 8. Telegram inline confirmation

### 8.1 Client extensions (`TelegramClient`)

- `send_message(..., reply_markup=...)`
- `edit_message_text(..., reply_markup=...)`
- `answer_callback_query(callback_query_id, text=...)`

### 8.2 Inline keyboard

```json
{
  "inline_keyboard": [
    [
      {"text": "Confirm", "callback_data": "ai:confirm:{pending_id}"},
      {"text": "Cancel", "callback_data": "ai:cancel:{pending_id}"}
    ]
  ]
}
```

Payload ≤ 64 bytes; use numeric `pending_id` (PK).

### 8.3 Webhook

- Add `callback_query` to `WEBHOOK_ALLOWED_UPDATES` in `app_telegram/config.py`
- Re-register webhooks via existing `telegram-set-webhooks` command
- Dispatch in webhook view → `handle_callback_query(tenant, payload)`

### 8.4 Handler behavior

| Event | Action |
| --- | --- |
| Confirm, valid pending | `execute_roster_write()`; edit message to success; clear pending |
| Confirm, expired | Answer callback “Expired”; edit message |
| Cancel | Clear pending; edit message “Cancelled.” |
| Wrong user | Answer callback “Not authorized” |
| Execute error | Edit message with error; clear pending |

**Delivery:** When tool returns `pending_confirmation` on Telegram channel,
`run_ai_query` sends a **deterministic** bot message with inline keyboard (in
addition to or instead of model prose) so `message_id` is known for edits.

---

## 9. Web confirmation (deferred)

Placeholder until product defines UX:

- Tool returns `pending_confirmation` same as Telegram
- Model presents summary and asks user to confirm
- Pre-flight in `AIService.run()` parses confirm/cancel before Gemini (pattern
  TBD — exact keyword vs `confirm`/`cancel`)

Implementation plan should include a **follow-up task** or stub with feature
flag `web_roster_confirm_enabled=False` until wording is locked.

---

## 10. Intent router & prompts

### 10.1 Write intent heuristics

Extend `app_ai/tools/intent.py` `_WRITE_PATTERN` with roster verbs:

`enroll`, `add student`, `remove student`, `unenroll`, `assign teacher`,
`add teacher`, `remove teacher`, `assign staff`, etc.

Roster writes and points writes both expose on write-intent turns.

### 10.2 Prompt additions (`PLATFORM_BASE_TEMPLATE`)

- Use roster write tools only for enroll/remove/assign requests on write turns.
- Map natural language weekdays to `weekdays` integers (Sun=0 … Sat=6).
- For MT/AT shorthand, pass `role_seniority`; for named roles pass
  `course_role_query`.
- When tool returns `ambiguous_*`, present lettered options; do not guess.
- When tool returns `pending_confirmation`, present summary and wait for confirm
  — never claim the roster changed until execute returns `status: ok`.
- For ad-hoc session requests, do not pass `specific_event_ids`; explain limit and
  share `member_edit_url`.
- When `already_assigned`, suggest remove first or the member edit page.

---

## 11. Error handling

| Code | When |
| --- | --- |
| `permission_denied` | Missing `course.manage_members` or course scope |
| `not_found` | User, course, or role not found |
| `ambiguous_subject` | Multiple user matches |
| `ambiguous_course` | Multiple course matches |
| `ambiguous_course_role` | Multiple role matches |
| `already_enrolled` | Student already on roster |
| `already_assigned` | Staff already on roster |
| `not_enrolled` / `not_on_roster` | Remove when no assignment |
| `adhoc_not_supported` | Specific event/date request |
| `pending_confirmation` | Awaiting user confirm (not an error) |
| `teams_link_required` | User not linked to Microsoft 365 |
| `ms_team_required` | Course has no Teams group |
| `validation_error` | Schema / invalid weekdays |
| `confirmation_expired` | Pending TTL elapsed |
| `confirmation_cancelled` | User cancelled |

Never return `status: ok` when the mutation did not run.

---

## 12. Testing

Use PostgreSQL, tenant schema, `--keepdb --noinput`, `RBAC_ENFORCE=log_only`
where consistent with existing AI tests.

### 12.1 `resolve_course_role`

| Case | Expected |
| --- | --- |
| MT, single role | `ok` |
| AT, multiple roles | `ambiguous_course_role` + A/B/C |
| Name query "Lead" | substring match |
| No match | `not_found` |

### 12.2 Weekday session filter

| Case | Expected |
| --- | --- |
| No weekdays | all events |
| `[1, 3]` | Mon+Wed events only in org TZ |
| Empty course | `validation_error` or zero sessions warning in preview |

### 12.3 Write tools (each)

| Case | Expected |
| --- | --- |
| RBAC deny | `permission_denied` |
| Unambiguous resolve | `pending_confirmation`, no DB mutation |
| Confirm + execute | membership row + `UserCourse` / `UserEvent` as expected |
| `already_assigned` / `already_enrolled` | reject before pending |
| Ad-hoc `specific_event_ids` | `adhoc_not_supported` + URL |
| Audit | `CourseMembershipEvent.source` = `telegram_bot` / `web_ai` |

### 12.4 Telegram callback

| Case | Expected |
| --- | --- |
| Confirm | executes; edits message |
| Cancel | clears pending |
| Expired pending | no mutation |
| Other user's callback | denied |

### 12.5 Integration

Extend `app_telegram/tests/test_ai_query.py`: mock Gemini →
`assign_staff_to_course` → pending → simulate callback → assert roster state.

---

## 13. Out of scope (v1)

- Web confirm wording and enablement (deferred)
- Bulk enroll/remove multiple users in one tool call
- Update-in-place for staff already on roster
- Ad-hoc per-event assignment via bot
- Student soft drop-out (hard delete matches HTTP)
- Changing `adjust_staff_points` confirmation policy
- Refactoring HTTP views to call `roster_writes.py` (optional follow-up)

---

## 14. Open items for implementation plan

1. Web confirm UX (keyword vs typed confirm/cancel)
2. Whether confirm message **replaces** or **supplements** model reply on Telegram
3. HTTP view backfill: add `source="api"` to all existing `record_membership_event` call sites
4. Staff JOINED events on HTTP teacher assign paths (align with new audit policy)
5. Webhook re-registration rollout note for `callback_query`
