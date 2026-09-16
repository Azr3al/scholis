# Roster Workflow Intent Routing — Design Spec

**Date:** 2026-07-06  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`  
**Related:** `2026-07-01-ai-roster-write-tools-design.md`, `2026-07-01-ai-interaction-messages-design.md`

## 1. Summary

Fix Telegram (and web) AI assistant failures during **roster write workflows**
(assign, remove, enroll, unenroll, role selection, confirm) where users get
trapped in stale pending states or the model picks the wrong tool (e.g. role
picker after *"remove me from KET 152"*).

**Approach:** Deterministic **roster intent router** in Python (no LLM) for
workflow state, pending hygiene, and mid-flow intent switches. Gemini
3.1 Flash Lite handles only natural-language → tool args on fresh write turns,
with a slim write-only prompt block and improved tool descriptions.

**Model:** `gemini-3.1-flash-lite` (org default). Agentic benchmarks (~31%
TAU-bench) justify minimizing LLM responsibility for state machines.

---

## 2. Locked decisions (brainstorming)

| Topic | Choice |
| --- | --- |
| Scope | **Roster only** — assign, remove, enroll, unenroll, role pick, confirm |
| Mid-flow intent change | **Ask first** — *"Cancel pending assign and remove you from KET 152 WE instead?"* |
| After switch approval | **Depends on explicitness (C)** — explicit new command skips second confirm; vague → normal confirm flow |
| Architecture | **Approach 2** — pending-layer intent router + pending hygiene; not prompt-only, not unified state-machine rewrite |
| Switch yes/no | **Code only** — never delegated to LLM |
| Web confirm | Keep `WEB_ROSTER_CONFIRM_ENABLED = False`; router applies to web channel_key too |
| i18n | English templates only in v1 |

---

## 3. Problem observed

### 3.1 Screenshot reproduction (assign → remove)

1. User picks **A** (Assistant Teacher) → assign succeeds on KET 152 WE.
2. User: *"now, remove me from KET 152"* → bot shows role picker (wrong workflow).
3. User: *"remove me!!"* → remove succeeds.

The role-picker copy (*"Which role should this staff member have on this course?"*)
comes from `build_role_required_message` via `AIDisambiguationPending` with
`pending_field=course_role` — the **assign** path, not remove.

Root causes:

1. **Stale pending intercept** — `try_resolve_pending_turn` runs before the LLM;
   non–A/B/C messages get a disambiguation **reminder** instead of a new intent.
2. **Incomplete pending metadata** — fallback *"this staff member / this course"*
   when `_staff_name` / `_course_title` missing from `partial_args`.
3. **Pending hygiene gaps** — Telegram callback confirm clears
   `AIPendingWriteConfirmation` but not `AIDisambiguationPending`; write confirm
   creation does not clear disambiguation.
4. **LLM tool selection** — Flash Lite agentic scores (~31%) make assign-vs-remove
   mistakes likely when the model does run.

### 3.2 Spec vs implementation gap

`2026-06-27-ai-tool-surface-write-tools-design.md` says *"New write attempt while
pending → clear old pending"*. Not fully implemented; unrelated messages re-show
old prompts.

---

## 4. Architecture

```text
User message
    │
    ▼
[NEW] try_resolve_roster_switch (deterministic)
    ├── switch_confirm pending? → parse yes / no / cancel
    ├── roster pending + conflicting explicit command? → save switch_confirm, send switch prompt
    └── else → continue
    │
    ▼
try_resolve_pending_confirmation (yes / cancel / role override on assign confirm)
    │
    ▼
try_resolve_pending_turn (A / B / C disambiguation)
    │
    ▼
classify_turn_intent → Gemini 3.1 Flash Lite (write tools on WRITE intent only)
    │
    ▼
resolve_interaction_message (templates suppress model prose when pending)
```

### 4.1 New module: `app_ai/roster_intent.py`

| Function | Purpose |
| --- | --- |
| `parse_roster_command(prompt, *, user)` | Detect action verb, self-reference, course query; return `RosterCommand \| None` |
| `is_explicit_roster_command(cmd)` | True when action + resolvable course + resolvable person (or self) |
| `conflicts_with_pending(cmd, pending)` | True when pending tool/action differs from new command |
| `try_resolve_roster_switch(...)` | Returns `PendingTurnResult \| None`; handles switch prompt + execution |
| `clear_all_roster_pending(user, channel_key)` | Deletes disambiguation + write confirm + switch confirm rows |

### 4.2 Switch confirm pending

Reuse `AIDisambiguationPending` with new `pending_field=switch_confirm` (no migration).

`partial_args` stores:

```json
{
  "new_tool_name": "remove_staff_from_course",
  "new_args": {"user_id": 123, "course_query": "KET 152"},
  "new_summary": "remove you from KET 152 WE",
  "prior_tool_name": "assign_staff_to_course",
  "prior_pending_kind": "disambiguation",
  "prior_snapshot": {}
}
```

On **yes** + explicit: `clear_all_roster_pending` → run target tool → if
explicit, execute via existing roster service (skip `pending_confirmation`).

On **yes** + vague: clear prior → inject context for LLM + normal tool flow.

On **no**: clear switch row only; re-show prior pending reminder.

### 4.3 Pending hygiene (always)

| Event | Action |
| --- | --- |
| Write confirm created (`save_write_confirmation`) | `clear_pending` disambiguation for same channel |
| Roster execute success (text confirm or Telegram callback) | `clear_all_roster_pending` |
| Switch execute success | `clear_all_roster_pending` |
| Cancel phrase | Clear active pending kind(s) as today + switch if present |
| TTL expiry | Existing behavior |

Modify `app_telegram/callbacks.py` confirm handler to call
`clear_all_roster_pending` after successful execute.

### 4.4 Explicit command definition

**Explicit** (skip second confirm after switch yes):

- Named action: remove / assign / enroll / unenroll (and synonyms in parser)
- Course resolvable unambiguously OR `course_id` present
- Person: `user_id` or self-reference (`me`, `myself`, `my`) mapped to actor

**Not explicit** (normal confirm after switch yes):

- Missing course (*"remove me"*)
- Ambiguous course (multiple matches — stay in course disambiguation)
- Vague intent (*"something else"*, *"never mind"* without action)

### 4.5 Explicit fast-path execution

When executing explicit remove/assign/enroll after switch approval:

1. Call existing tool `run` function directly.
2. If result is `pending_confirmation` and command was explicit → immediately
   call `execute_pending_write_confirmation` (same as user tapping Confirm).
3. Return success template via `build_confirm_success` / error message.
4. Do **not** invoke Gemini on this path (`disambiguation_fast_path` pattern).

---

## 5. Prompt strategy (Gemini 3.1 Flash Lite)

### 5.1 Benchmark context

| Benchmark | 3.1 Flash Lite | Notes |
| --- | --- | --- |
| IFBench | ~77% | Improved vs 2.5 Flash Lite (~50%); still ~23% miss on complex rules |
| TAU-bench / Terminal-Bench | ~31% | Weak on multi-step agentic workflows |
| GPQA Diamond | ~87% | Strong reasoning for lite tier |

**Design rule:** workflow state in code; model picks tools/args only.

### 5.2 Prompt layering

**Keep in cached system prompt** (`app_ai/prompts.py`):

- Scope, concision, read tools, link formatting, actor self-reference (`user_id` for "me")
- Trim duplicate roster/interaction bullets (currently duplicated at lines 66–68 and 78–81)

**Remove from system prompt** (move to write-only dynamic block):

- Detailed roster write rules
- *"Do not re-list options"* (enforced by `resolve_interaction_message`)

**New: `build_roster_write_context()`** in `app_ai/prompts.py` — injected via
`dynamic_context` in `AIService.run` when `TurnIntent.WRITE` only.

Target: **≤ 400 tokens** (~8 bullets):

```
Roster writes — pick exactly one tool:
- remove / unassign / take off roster → remove_staff_from_course
- assign / add teacher → assign_staff_to_course
- enroll student → enroll_student_in_course
- remove student → remove_student_from_course

Self ("me", "myself"): pass user_id from Current user block.
Assign: never pass role unless user said one.
Never claim roster changed unless tool result status is ok.
When status is pending_confirmation, role_required, or ambiguous_*: reply briefly or not at all — system sends templates.
```

### 5.3 Tool description updates

Lead each roster write tool description with when-to-use verbs:

- `remove_staff_from_course`: *"Use when the user wants to remove, unassign, or take someone off a course roster…"*
- `assign_staff_to_course`: *"Use when the user wants to assign or add staff…"*

### 5.4 Thinking level

In `GeminiClient._build_generate_config`, when `turn_intent == TurnIntent.WRITE`:

```python
ThinkingConfig(include_thoughts=True, thinking_level="low")
```

Read turns: keep current config (thoughts only, default level). Add optional
org setting later; v1 uses platform default `low` for write turns.

---

## 6. Message templates

Add to `app_ai/messages.py`:

| Function | Example |
| --- | --- |
| `build_switch_prompt(...)` | *"You have a pending assign on KET 152 WE. Cancel it and remove you from KET 152 WE instead? Reply yes or no."* |
| `build_switch_declined(tone)` | *"OK — continuing with the pending assign."* + prior reminder |
| `build_switch_cancelled(tone)` | *"Cancelled."* |

Tone via existing `resolve_message_tone`.

---

## 7. Parser patterns (`app_ai/roster_intent.py`)

Extend `app_ai/tools/intent.py` or colocate in `roster_intent.py`:

```python
_REMOVE_RE = re.compile(r"\b(remove|unassign|take off|drop)\b", re.I)
_ASSIGN_RE = re.compile(r"\b(assign|add)\b.+\b(as|to|on)\b|\bassign\b", re.I)
_ENROLL_RE = re.compile(r"\b(enroll|add student)\b", re.I)
_UNENROLL_RE = re.compile(r"\b(unenroll|remove student)\b", re.I)
_SELF_RE = re.compile(r"\b(me|myself|my)\b", re.I)
_SWITCH_YES = frozenset({"yes", "y", "yeah", "confirm"})
_SWITCH_NO = frozenset({"no", "n", "nope"})
```

`parse_roster_command` returns:

```python
@dataclass
class RosterCommand:
    action: Literal["assign_staff", "remove_staff", "enroll_student", "remove_student"]
    user_id: int | None  # set when self-reference
    staff_query: str | None
    student_query: str | None
    course_query: str | None
    course_id: int | None
    role_hint: str | None  # MT/AT if present; not required for conflict detection
```

Course resolution for explicitness uses existing `resolve_accessible_course` —
explicit only when status is `ok` (not `ambiguous`).

---

## 8. Integration in `AIService.run`

Order in `app_ai/service.py` (before `try_resolve_pending_confirmation`):

```python
switch_turn = try_resolve_roster_switch(
    prompt=prompt, user=user, channel_key=channel_key, org=tenant
)
if switch_turn is not None:
    # same handling as confirm_turn / pending_turn (fast path when executed)
```

When `switch_turn` shows switch prompt → set `disambiguation_fast_path = True`,
tools=[], model formats brief acknowledgment only (or empty — template wins via
`resolve_interaction_message`).

Inject `build_roster_write_context()` into `dynamic_context` when
`classify_turn_intent(...) == TurnIntent.WRITE` and not in fast path.

---

## 9. Error handling

| Case | Behavior |
| --- | --- |
| Switch yes + explicit + execute error | Show tool error message; all pending cleared |
| Switch yes + explicit + not on roster (remove) | `not_on_roster` message |
| Switch yes + explicit + already_assigned (assign) | `already_assigned` message |
| Pending expired mid-switch | Clear switch; ask user to repeat |
| User says yes but switch row missing | Treat as normal message |
| Concurrent messages | Last `update_or_create` wins; acceptable for v1 |

---

## 10. Testing

| Test file | Cases |
| --- | --- |
| `app_ai/tests/test_roster_intent.py` | Parser: remove me from X, assign as AT, self-reference, non-roster ignored |
| `app_ai/tests/test_roster_switch.py` | Role pending + explicit remove → switch prompt; yes → removed; no → role reminder |
| `app_ai/tests/test_roster_switch.py` | Confirm pending + explicit remove → switch prompt |
| `app_ai/tests/test_roster_pending_hygiene.py` | Callback confirm clears disambiguation; write confirm clears disambiguation |
| `app_ai/tests/test_prompts.py` | Write block ≤ 400 tokens; no duplicate roster rules in platform prompt |
| `app_telegram/tests/test_ai_query.py` | End-to-end assign → remove regression (mock AIService) |

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_roster_intent app_ai.tests.test_roster_switch app_ai.tests.test_roster_pending_hygiene`

---

## 11. Files to change

| File | Change |
| --- | --- |
| `app_ai/roster_intent.py` | **Create** — parser + switch resolver |
| `app_ai/service.py` | Wire router; inject write context |
| `app_ai/prompts.py` | Trim platform prompt; add `build_roster_write_context()` |
| `app_ai/messages.py` | Switch prompt templates |
| `app_ai/confirmation.py` | `clear_all_roster_pending`; clear disambiguation on save |
| `app_ai/disambiguation.py` | Switch confirm field handling in `_build_reminder` if needed |
| `app_ai/tools/intent.py` | Optional: shared cancel/switch word sets |
| `app_ai/tools/*_course.py` | Tool description verb leads |
| `app_ai/client.py` | Write-turn thinking_level low |
| `app_telegram/callbacks.py` | clear_all on success |
| `app_ai/tests/*` | New tests above |

---

## 12. Out of scope

- Points adjustment pending flows
- Unified pending state machine / migration
- Web roster confirm execution (`WEB_ROSTER_CONFIRM_ENABLED`)
- Non-English switch templates
- Auto-cancel without confirmation (user chose B)

---

## 13. Success criteria

1. *"now, remove me from KET 152"* immediately after assign shows switch prompt or
   remove confirm — **never** role picker.
2. Stale `course_role` pending never survives successful roster execute.
3. Write-turn dynamic prompt ≤ 400 tokens; platform prompt has no duplicate roster rules.
4. All new tests pass with `--keepdb`.
