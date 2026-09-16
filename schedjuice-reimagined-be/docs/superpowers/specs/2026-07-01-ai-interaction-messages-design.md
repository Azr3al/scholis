# AI Interaction Messages — Design Spec

**Date:** 2026-07-01  
**Status:** Approved (pending implementation)  
**Repo:** `schedjuice-reimagined-be`  
**Related:** `2026-07-01-ai-roster-write-tools-design.md`

## 1. Summary

Improve the Telegram and web AI assistant **interaction copy** for all flows that
wait on user input: roster write confirmations, entity disambiguation (person,
course, role, point type), and staff role selection before assign.

Today the model generates verbose, formal prose (“I have initiated the removal…”),
often **claims success before execution**, and Telegram confirm **inline buttons**
are easy to miss (separate follow-up message; text `confirm` does not execute on
Telegram). Staff assign also **guesses roles** (e.g. Coordinator) when the user
did not specify one.

**Approach:** Hybrid messaging — **deterministic, tone-aware templates** for
critical UX states; **prompt guardrails** so the model does not duplicate or
contradict system messages.

---

## 2. Locked decisions (brainstorming)

| Topic | Choice |
| --- | --- |
| Scope | **A + B** — roster confirmations + all pending-input flows (disambiguation, reminders) |
| Tone | **C** — respect `UserAIPreferences.Tone`; friendly default when `DEFAULT` or unset |
| Architecture | **Hybrid** — templates for pending states; model for read-only answers |
| Telegram confirm | **One message** with inline Confirm/Cancel + **text fallback** (`yes` / `confirm` / `cancel`) |
| Role on assign | **Always ask** when user did not specify role; never guess |
| Mid-flow role change | Clear pending confirm → re-run assign with new role → fresh confirm |
| Session scope in confirm | When `assign_staff` and no `weekdays` were requested, confirm must say **“Adding to all course sessions.”** When weekdays were specified, name them explicitly |
| Web confirm execution | Keep `WEB_ROSTER_CONFIRM_ENABLED = False`; improve reminder copy only |
| i18n | English templates only in v1; `response_language` prefs unchanged |

---

## 3. Problems observed

### 3.1 Verbose / misleading model prose

- Confirm turns produce stiff admin language and repeat name + email every line.
- Model says “confirmed and processed” after user types `confirm` even when
  Telegram execution did not run (no `status: ok` tool result).

### 3.2 Telegram confirm UX

Current flow in `app_telegram/tasks.py`:

1. Deliver model reply (markdown).
2. If pending write exists, send **second** message with `pending.summary` + keyboard.

Issues:

- Users may not notice the second message.
- If pending row is missing (deploy/migration) or send fails, no buttons at all.
- `try_resolve_pending_confirmation` on Telegram **does not** execute on text
  `confirm` — only reminds to use buttons.

### 3.3 Staff assign without role

When user says “add him to KET 152” without a role:

- Tool returns `validation_error` if model omits role fields — but model often
  passes a guessed `course_role_query` (e.g. Coordinator).
- Flow skips role selection and goes straight to `pending_confirmation`.
- Follow-up “add as AT” fails because confirm is already pending with wrong role.

---

## 4. Architecture

```text
User message
    │
    ▼
try_resolve_pending_confirmation (text yes/cancel on all channels)
    │
    ▼
try_resolve_pending_turn (disambiguation A/B/C)
    │
    ▼
AIService.run → tools
    │
    ├── ambiguous_* / role_required → save AIDisambiguationPending
    ├── pending_confirmation → save AIPendingWriteConfirmation
    └── ok / error → model may answer (read-only)
    │
    ▼
Post-process (Telegram run_ai_query / web AIQueryView)
    │
    ├── If get_active_write_confirmation(...) OR get_active_pending(...):
    │       Replace/suppress model prose
    │       Send deterministic template (tone-aware)
    │       Attach inline keyboard when write confirm pending (Telegram)
    │
    └── Else: deliver model text as today
```

### 4.1 New module: `app_ai/messages.py`

Responsibilities:

| Function | Purpose |
| --- | --- |
| `resolve_message_tone(user)` | Map `UserAIPreferences.Tone` → `default` \| `casual` \| `formal` |
| `format_candidate_list(candidates)` | Lettered lines from disambiguation candidates |
| `build_disambiguation_message(...)` | Person, course, role, point-type variants |
| `build_role_required_message(...)` | Assign-staff role picker |
| `build_confirm_message(pending, tone)` | Enroll/remove/assign/remove confirm prompts |
| `format_session_scope(weekdays, labels, count)` | Assign-staff scope line for confirm copy |
| `build_confirm_success(action, result, tone)` | Post-execute success (callbacks + text confirm) |
| `build_confirm_cancelled(tone)` | User cancelled |
| `build_confirm_expired(tone)` | TTL elapsed |
| `build_pending_reminder(pending, channel, tone)` | Injected dynamic context + optional resend |

Templates are **multi-line strings** keyed by `(flow, tone)`. No external i18n files in v1.

**Tone mapping:**

| Preference | Template set |
| --- | --- |
| `DEFAULT` or no prefs row | Friendly, direct (default) |
| `CASUAL` | Shorter, warmer phrasing |
| `FORMAL` | Professional, still actionable |

`build_user_preferences_context` behavior unchanged; templates implement tone for
system-owned copy.

### 4.2 Message ownership

| Situation | Speaker |
| --- | --- |
| Read-only answers (lists, counts, lookups) | Model |
| `role_required` | Template |
| `ambiguous_*` | Template |
| `pending_confirmation` | Template + Telegram keyboard |
| Confirm success / cancel / expired | Template |
| Model during pending state | **Suppressed** — at most empty or omitted when template sent |

### 4.3 Telegram delivery (`run_ai_query`)

Replace two-message confirm flow:

1. After `AIService.run`, call `get_active_write_confirmation` and `get_active_pending`.
   If either exists, the tool already persisted state (`pending_confirmation`,
   `role_required`, or `ambiguous_*`).
2. If confirm pending: set `reply_text = build_confirm_message(...)` and send **one**
   message with `reply_markup=build_roster_confirm_keyboard(pending.id)`.
3. Store `telegram_chat_id` / `telegram_message_id` on pending row.
4. If disambiguation or `role_required`: send template only (no keyboard).
5. On `send_message` failure with keyboard: log warning; send same template without
   keyboard (text fallback still works after confirmation.py change).

**DM ack edit:** When `ack_message_id` is set, **edit the ack message** to the
template + keyboard instead of editing to model prose then sending a second message.

### 4.4 Text confirm on Telegram (`confirmation.py`)

Change `try_resolve_pending_confirmation` for `channel_key.startswith("telegram:")`:

- `confirm` / `yes` / `y` → execute (same as web when enabled).
- `cancel` / `no` / `n` → clear pending (existing).
- Other text → reminder template via `build_pending_reminder`.

After text execute on Telegram: edit stored confirm message to success template;
clear keyboard (reuse callback edit path or shared helper).

### 4.5 Prompt updates (`app_ai/prompts.py`)

Add **Interaction copy** block to `PLATFORM_BASE_TEMPLATE`:

- Never claim roster membership changed until a tool result includes
  `status: ok` from execution (not from `pending_confirmation`).
- When a tool returns `pending_confirmation`, `role_required`, or `ambiguous_*`,
  keep the reply **minimal** — the system sends the interactive message.
- Do **not** re-list A/B/C options if the system message already did.
- **Staff assign:** never pass `role_seniority` or `course_role_query` unless the
  user explicitly stated a role in the conversation. “Add X to course Y” is not
  sufficient to infer Coordinator, MT, or AT.
- Resolve order for assign: person → course → **role** → confirm.

### 4.6 Staff role selection (`assign_staff_to_course`)

When course + staff resolved and **none** of `role_seniority`, `course_role_query`,
`course_role_id` are provided:

1. Load all `AssignedAsRole` rows ordered: MAIN_TEACHER → ASSISTANT_TEACHER → OTHER,
   then by name.
2. Cap at 26 candidates (A–Z); if more exist, include note to use member edit page
   for uncommon roles.
3. Return status **`role_required`** (new, not an error):

```json
{
  "status": "role_required",
  "message": "...",
  "candidates": [{"key": "A", "id": 1, "name": "Main Teacher", "seniority": "..."}]
}
```

4. `save_pending` with `pending_field=course_role`, `partial_args` including resolved
   `course_id` and staff `user_id`.
5. Do **not** call `_pending_confirmation_response`.

Existing `ambiguous_course_role` path unchanged when role **is** specified but ambiguous.

**Mid-flow role change:** In `try_resolve_pending_confirmation`, when pending
`action == assign_staff` and user message matches role intent (MT/AT shorthand or
role name from org roles):

1. `clear_write_confirmation`.
2. Merge role into `partial_args` from disambiguation pending if any.
3. Do not treat message as confirm/cancel.
4. Let normal turn processing re-invoke tool (or call tool directly in service pre-flight).

Alternatively implement in `AIService.run` pre-flight before confirm check: detect
role override on pending assign → clear confirm → set disambiguation or direct args.

### 4.7 Disambiguation reminders (`disambiguation.py`)

Replace `_build_reminder` body with `build_disambiguation_message` / shared helper
using stored `candidates` and `pending_field`.

`role_required` uses the same `save_pending` / `course_role` path as
`ambiguous_course_role`; no separate disambiguation handler needed.

### 4.8 Callback messages (`app_telegram/callbacks.py`)

Replace `_success_message` hardcoded strings with `build_confirm_success(..., tone)`.
Use `resolve_message_tone(user)` from linked user. Cancel/expired strings use
template helpers.

### 4.9 Web channel (`app_ai/views.py` / `AIService`)

When `AIQueryView` returns JSON, include optional `interaction_message` field when
template overrides model text (for future UI). v1: replace `result.text` with
template text when pending/disambiguation/role_required active so web chat shows
friendly copy even without buttons.

---

## 5. Template examples (DEFAULT tone)

### 5.1 Role required

```text
Which role should Thiha have on KET 152 WE?

A) Main Teacher
B) Assistant Teacher
C) Coordinator

Reply A, B, C, the role name, or cancel.
```

### 5.2 Confirm remove staff

```text
Remove Thiha from KET 152 WE?

Tap Confirm or reply yes. Reply cancel to abort.
```

### 5.3 Disambiguation (person)

```text
I found a few matches for "Thiha". Which one?

A) Thiha Swan Htet (james@teachersucenter.com)
B) Thiha Myint (other@school.com)

Reply A, B, the full name, or cancel.
```

### 5.4 Success (remove staff)

```text
Done — removed Thiha from KET 152 WE.
```

CASUAL and FORMAL variants adjust phrasing length and formality; same facts.

### 5.5 Confirm assign staff (all sessions — default)

When the user did not mention weekdays, omitting `weekdays` in the tool call means
**all course sessions**. The confirm message must state that explicitly:

```text
Assign Thiha as Assistant Teacher on KET 152 WE?

Adding to all course sessions.

Tap Confirm or reply yes. Reply cancel to abort.
```

### 5.6 Confirm assign staff (specific weekdays)

When the user asked for particular days, repeat them in the confirm:

```text
Assign Thiha as Assistant Teacher on KET 152 WE?

Adding to Monday and Wednesday sessions (4 slots).

Tap Confirm or reply yes. Reply cancel to abort.
```

Implementation: derive the scope line from `preview.weekdays` / `preview.weekday_labels`
/ `preview.session_count` on the pending row. If `weekdays` is null or empty → all
sessions wording; otherwise join `weekday_labels` and include `session_count` when > 0.

---

## 6. Error handling

| Case | Behavior |
| --- | --- |
| Confirm message send fails | Log; text-only template; text confirm still works |
| Expired pending | Template “expired”; ask user to start over |
| Wrong user clicks Confirm | Callback “Not authorized” (unchanged) |
| Execute error | Edit message to error text from `result.message` |
| >26 roles | `role_required` with first 26 + message to use member edit page |
| Model claims success without execute | Prevented by prompt + template suppression |

---

## 7. Testing

| Test file | Coverage |
| --- | --- |
| `app_ai/tests/test_messages.py` | Tone variants; candidate formatting; each template builder |
| `app_ai/tests/test_assign_staff_role_required.py` | No role → `role_required`; with role → confirm |
| `app_ai/tests/test_confirmation.py` | Telegram text `yes` executes; cancel clears |
| `app_telegram/tests/test_ai_query.py` | One send/edit with `reply_markup`; no duplicate summary message |
| `app_telegram/tests/test_callbacks.py` | Success copy uses templates |
| `app_ai/tests/test_disambiguation.py` | Reminder uses new copy |

Regression: after `pending_confirmation` tool return, model text must not appear
when template override is active.

---

## 8. Out of scope

- Burmese (`response_language=MY`) template translations
- Web inline confirm UI (execution still gated by flag)
- Changing `adjust_staff_points` to require confirmation
- Rewriting all read-only assistant answers

---

## 9. Ops notes

- Ensure migration `app_telegram/migrations/0005_aipendingwriteconfirmation.py` applied on deploy.
- After deploy, run `python manage.py telegram-set-webhooks` per tenant so
  `callback_query` updates are delivered (buttons display without this; clicks need it).

---

## 10. Success criteria

1. User sees **one** clear confirm message with visible Confirm/Cancel on Telegram.
2. Typing **yes** / **confirm** works when buttons are missing.
3. Model does **not** claim roster changed before execution.
4. “Add to course” without role always shows role picker before confirm.
5. “Add as AT” after wrong default role recovers without “unable to process” dead end.
6. Disambiguation and confirm copy respect user tone preference.
7. Staff assign confirm states session scope: **“Adding to all course sessions.”** when
   no weekdays were requested; named days when they were.
