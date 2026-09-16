# AI Tool Surface & Write Tools — Design Spec

**Date:** 2026-06-27  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`

## 1. Summary

Introduce **intent-based tool subsetting** so the LLM-facing surface stays small as
capabilities grow, and ship the **first write tool** — **`adjust_staff_points`**
— wrapping the existing append-only points ledger (`services.post_transaction`).

**Locked decisions from brainstorming:**

| Topic | Choice |
| --- | --- |
| Surface strategy | **Approach 2** — intent router exposes read vs write tool subsets |
| First write tool | **`adjust_staff_points`** (add/deduct via `direction` + `amount`) |
| HTTP parity | Tool calls **`services.post_transaction()` only** — same guards as API |
| Confirmation model | **Disambiguation-only** — no yes/no write confirm when resolution is clear |
| Ambiguity | A/B/C disambiguation for **staff subject** and **point type** |
| Attendance | Not exposed as an AI tool |
| Enroll / announce | Deferred; same infrastructure when added |

---

## 2. Problem & constraints

LLM tool-selection accuracy degrades when:

1. Too many tools are exposed flatly (~20–40+ depending on separability)
2. Read and write verbs on the same entity collide semantically
3. Tool schema tokens crowd the working context

Current registry: **6 read/lookup tools**, all exposed every turn. Planned writes
(staff points first, then enrollment and announcements) would push the surface toward
the gray zone without routing.

Write tools add a **safety** dimension: wrong tool selection on a lookup is a bad
answer; wrong selection on a write is a mutation. Mitigation is **deterministic
entity resolution** with disambiguation when lookup is ambiguous — not blanket
“reply yes to confirm every write.”

---

## 3. Architecture

```text
User message
    │
    ▼
Pending disambiguation? ──yes──► Parse A/B/C or name ──► Execute stored write
    │ no
    ▼
Intent router (read | write)
    │
    ├── read  ──► resolve_tools(exposure=read, feature flags)
    └── write ──► resolve_tools(exposure=read+write, feature flags)
    │
    ▼
GeminiClient.generate_with_tools(subset)
    │
    ▼
Write tool called ──► resolve subject + point type
    │
    ├── unambiguous ──► post_transaction() immediately
    └── ambiguous   ──► store pending disambiguation, return A/B/C payload
```

### 3.1 Components

| Component | Location (proposed) | Role |
| --- | --- | --- |
| `Tool` metadata | `app_ai/tools/base.py` | `exposure`, `requires_feature` |
| Intent router | `app_ai/tools/intent.py` | Classify turn as read/write; detect disambiguation replies |
| Tool resolver | `app_ai/tools/registry.py` | Filter registry by intent + org features |
| Disambiguation store | `app_ai/models.py` + service | One pending disambiguation per user+channel |
| Entity resolvers | `app_ai/tools/resolve.py` | Extend with letter-key candidates + `resolve_point_type` |
| Write tool | `app_ai/tools/adjust_staff_points.py` | Thin wrapper over `post_transaction` |
| Read tools | `app_ai/tools/list_point_types.py`, `get_staff_point_balances.py` | Points lookups |
| Orchestration hook | `app_ai/service.py` | Pre-flight disambiguation + pass `tools=` subset |

The **registry stays flat internally**; only the exposed subset changes per turn.

---

## 4. Intent router (Approach 2)

Runs in `AIService.run()` before `generate_with_tools`.

### 4.1 Turn classification

| Phase | Detection | Action |
| --- | --- | --- |
| **Disambiguation reply** | Pending exists + message matches `A`–`Z`, full name, or explicit ID | Resolve candidate → execute pending write → clear pending |
| **Cancel disambiguation** | Pending exists + `cancel`, `nevermind`, `abort`, `no` | Clear pending; model acknowledges |
| **Write intent** | Heuristics: `award`, `deduct`, `give points`, `remove points`, `add N points`, … | Expose read + write tools |
| **Read intent** | Default | Expose read tools only |

Heuristics-first (same pattern as `app_ai/guardrails/heuristics.py`). Classifier
fallback only when heuristics return `AMBIGUOUS` — avoids an extra Gemini call on
every read query.

### 4.2 Exposed tool counts (v1)

| Turn | `is_staff_points_enabled` | Tools exposed |
| --- | --- | --- |
| Read | yes | 8 (6 core + 2 points read) |
| Read | no | 6 |
| Write | yes | 9 (8 read + 1 write) |
| Write | no | 6 read, 0 write |

All counts are within the ~10–15 comfortable flat-exposure band per turn.

### 4.3 Mis-route handling

- **Write intent hidden on read turn:** model cannot call write tools; should tell
  user it cannot perform the action. User rephrases or sends a clearer write
  request → write intent on next turn.
- **Read intent on write-shaped question:** read bundle includes
  `get_staff_point_balances` for “how many merit points does James have?”

Monitor `tool_call_log` and intent labels in usage reporting for mis-route rate.

---

## 5. Tool metadata

Extend `Tool` dataclass:

```python
@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    run: Callable[[dict[str, Any], Any], list[dict[str, Any]]]
    exposure: Literal["read", "write"] = "read"
    requires_feature: str | None = None  # e.g. "staff_points"
```

| Field | Meaning |
| --- | --- |
| `exposure="read"` | Included on read turns; also included on write turns (resolution) |
| `exposure="write"` | Write turns only |
| `requires_feature="staff_points"` | Omitted unless `org.is_staff_points_enabled` |

Registry helpers:

```python
def list_tools_for_turn(*, intent: ToolIntent, org: Organization) -> list[Tool]
```

---

## 6. Disambiguation gate (replaces write confirmation)

### 6.1 Policy

| Resolution outcome | Behavior |
| --- | --- |
| **Single clear match** (subject or point type) | Proceed (or execute if both resolved) |
| **Zero matches** | Return `not_found`; no pending |
| **Multiple matches** | Return `ambiguous_*` with A/B/C keys; store pending |
| **Both resolved unambiguously** | Call `post_transaction()` **immediately** — no yes/no confirm |

There is **no** “Reply yes to confirm deducting 5 points” step when the subject
and point type are already unambiguous.

### 6.2 Pending disambiguation record

`AIPendingDisambiguation` (tenant-scoped):

| Field | Type | Notes |
| --- | --- | --- |
| `user_id` | FK | Acting admin/teacher |
| `channel_key` | string | e.g. `telegram:{chat_id}` or `web:{session_id}` |
| `tool_name` | string | `adjust_staff_points` |
| `partial_args` | JSON | Resolved fields + unresolved query fragments |
| `pending_field` | string | `subject` \| `point_type` — which field is being disambiguated |
| `candidates` | JSON | `[{key, id, name, email?}, …]` |
| `expires_at` | datetime | TTL ~10 minutes |
| `created_at` | datetime | |

**One pending disambiguation per `(user_id, channel_key)`**.

| Event | Behavior |
| --- | --- |
| New write attempt while pending | Clear old pending; start fresh resolution |
| Unrelated read/message while pending | Do not clear; inject pending context into turn so model reminds user to pick A/B/C or cancel |
| TTL expired | Clear silently; next turn has no pending |
| Cancel phrase | Clear pending |

### 6.3 Ambiguous response shape

**Subject ambiguity:**

```json
{
  "status": "ambiguous_subject",
  "query": "James",
  "message": "3 ambiguous users found with name \"James\". Reply with A, B, C or state their full name.",
  "candidates": [
    {"key": "A", "id": 12, "name": "Jamey", "email": "jamey@school.com"},
    {"key": "B", "id": 34, "name": "James", "email": "james@school.com"},
    {"key": "C", "id": 56, "name": "Jamess", "email": "jamess@school.com"}
  ]
}
```

**Point type ambiguity:**

```json
{
  "status": "ambiguous_point_type",
  "query": "merit",
  "message": "2 point types match \"merit\". Reply with A, B or state the full name.",
  "candidates": [
    {"key": "A", "id": 1, "name": "Merit", "description": "General merit"},
    {"key": "B", "id": 2, "name": "Merit Plus", "description": "Bonus merit"}
  ]
}
```

Resolve **subject first**, then **point type**, then execute. If subject is
ambiguous, do not evaluate point type yet — store partial args and pending field
`subject`.

### 6.4 Disambiguation reply parsing (deterministic)

Pre-flight before Gemini when pending exists:

1. Single letter `A`–`Z` (case-insensitive, optional `:` or `.`) → that candidate
2. Exact case-insensitive match on candidate `name`
3. Explicit numeric `user_id` / `point_type_id` in message
4. Otherwise: treat as cancel if cancel phrase; else pass through to model with
   pending context injected

On successful parse → merge resolved ID into `partial_args` → if other field still
unresolved, run that resolver; else execute write.

### 6.5 Letter keys

Assign `A`, `B`, `C`, … in stable order (query sort order). Max **5 candidates**
(same limit as `resolve.py` today).

---

## 7. Tool inventory

### 7.1 Existing read tools (unchanged)

| Tool | Purpose |
| --- | --- |
| `search_users` | Staff/student lookup |
| `search_courses` | Course lookup |
| `count_organization` | Org-wide totals |
| `count_teacher_courses` | Teacher assignment count |
| `count_course_roster` | Roster size |
| `list_user_courses` | Courses for a user |

### 7.2 New read tools (`requires_feature="staff_points"`)

#### `list_point_types`

**Use when:** User asks what point types exist, or model needs IDs before a write.

Returns active point types: `{id, name, description, color}`.

**Permission:** `points.view` (or self-view rules consistent with API — caller must
hold `points.view` for org-wide listing).

#### `get_staff_point_balances`

**Use when:** User asks how many points a staff member has.

| Field | Type | Required |
| --- | --- | --- |
| `user_id` | int | one of id/query |
| `query` | string | one of id/query |

Uses `resolve_staff_user` + `services.get_balances`. Subject ambiguity returns the
same A/B/C shape (read path — no pending write stored unless a concurrent write
partial exists; for pure reads, model presents choices and user re-asks).

**Permission:** `points.view` for other users; staff may view own balances per API
rules.

### 7.3 Write tool — `adjust_staff_points`

**Use when:** User asks to award or deduct staff points.

**Do not use for:** students, viewing balances, configuring point types.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `query` | string | one of subject id/query | Staff name/email/code |
| `user_id` | int | one of subject id/query | From prior resolution |
| `point_type_query` | string | one of type id/query | e.g. “merit” |
| `point_type_id` | int | one of type id/query | From `list_point_types` |
| `direction` | `"add"` \| `"deduct"` | yes | Maps to signed delta |
| `amount` | int | yes | Positive integer, min 1 |
| `note` | string | yes | Min 3 chars after strip |

**Delta mapping:** `add` → `+amount`, `deduct` → `-amount`.

#### Execution path (must follow exactly)

```python
# 1. Feature + RBAC
if not org.is_staff_points_enabled:
    return {"error": "feature_disabled", ...}
if "points.award" not in effective_permissions(caller):
    return {"error": "permission_denied", ...}

# 2. Resolve subject (resolve_staff_user + letter keys on ambiguous)
# 3. Resolve point type (resolve_point_type — active types only for writes)
# 4. Append-only write — same as HTTP API
tx = services.post_transaction(
    subject=resolved_user,
    actor=caller,
    point_type=resolved_type,
    delta=signed_delta,
    note=note,
)
return {"status": "ok", "transaction": {...}, "balances": {...}}
```

#### HTTP / service guards inherited via `post_transaction`

| Guard | Behavior |
| --- | --- |
| Append-only ledger | Creates `PointTransaction` row only; deduct = negative delta |
| Staff-only subject | `is_staff_user(subject)` — students rejected |
| Non-zero delta | `amount >= 1` enforced at tool layer; delta never 0 |
| Active point type | Inactive types rejected at service layer |
| Note length | `validate_note()` — min 3 characters |
| Actor attribution | `actor=caller` |

**The tool must not** call `PointTransaction.objects.create` directly or expose
update/delete paths.

#### Success response

```json
{
  "status": "ok",
  "transaction": {
    "id": 101,
    "delta": 5,
    "note": "Great teamwork",
    "point_type": {"id": 1, "name": "Merit"}
  },
  "subject": {"id": 34, "name": "James"},
  "balances": {"1": 12}
}
```

---

## 8. `resolve_point_type` (new)

Add to `app_ai/tools/resolve.py`:

```python
def resolve_point_type(
    *,
    point_type_id: int | None,
    query: str | None,
    limit: int = 5,
    active_only: bool = True,
) -> dict[str, Any]:
```

- **`point_type_id`:** load by PK; if `active_only` and inactive → `not_found`
- **`query`:** case-insensitive substring match on `PointType.name` among
  `active_only` queryset; order by `sort_order`, `id`
- **0 matches** → `not_found`
- **>1 matches** → `ambiguous` with letter keys (same helper as user resolution)
- **1 match** → `ok`

For writes, always call with `active_only=True` (matches API).

---

## 9. Letter-key helper (shared)

Extend `resolve.py` to attach keys:

```python
def _with_letter_keys(candidates: list[dict]) -> list[dict]:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    for i, c in enumerate(candidates):
        c["key"] = letters[i]
    return candidates
```

Update existing `ambiguous` returns in `resolve_staff_user` (and optionally
`resolve_user` / `resolve_accessible_course`) to include `key` for consistent
A/B/C UX across tools.

---

## 10. Prompt updates

Extend `PLATFORM_BASE_TEMPLATE` in `app_ai/prompts.py`:

- Use **`get_staff_point_balances`** / **`list_point_types`** for points questions.
- Use **`adjust_staff_points`** only on write intent turns for award/deduct requests.
- When a tool returns `ambiguous_subject` or `ambiguous_point_type`, present the
  lettered list exactly and wait for the user's choice — do not guess.
- When a tool returns `status: ok` after a write, confirm what was recorded (type,
  amount, subject, note).
- Never claim points changed until the tool returns `status: ok`.

---

## 11. Error handling contract

Write tools return a **single dict** (consistent with count tools).

| Code | When |
| --- | --- |
| `permission_denied` | Missing `points.award` or read permission |
| `feature_disabled` | `is_staff_points_enabled` is false |
| `not_found` | Zero matches for subject or point type |
| `ambiguous_subject` | Multiple staff matches — pending stored |
| `ambiguous_point_type` | Multiple type matches — pending stored |
| `validation_error` | Schema / note length / amount < 1 |

Never return `status: ok` when the transaction was not created.

---

## 12. Growth conventions

When adding future write tools (enroll, unenroll, announce):

1. **One tool = one verb + one entity** — no composite CRUD enums
2. **`exposure="write"`** — only on write-intent turns
3. **Reuse disambiguation gate** for any entity resolved by name query
4. **Call existing service layer** — same path as HTTP API
5. **Disjoint descriptions** from read counterparts
6. **Intent subsetting** until ~15+ tools or measured selection errors
7. **Retrieval layer** (deferred tool loading) only if registry exceeds ~20–25
   distinguishable tools or eval shows confusable pairs

Future writes may add **content confirmation** (e.g. announcements) as a separate
policy — not part of v1 points work.

---

## 13. Testing

### 13.1 Intent router — `app_ai/tests/test_tool_intent.py`

| Case | Expected |
| --- | --- |
| “how many students” | read intent |
| “award James 5 merit points” | write intent |
| “yes” without pending | read intent (not confirm) |
| “B” with pending disambiguation | disambiguation reply |

### 13.2 Tool resolver — `app_ai/tests/test_tool_registry.py`

| Case | Expected |
| --- | --- |
| read + points enabled | 8 tools, includes `list_point_types` |
| read + points disabled | 6 tools, no points tools |
| write + points enabled | 9 tools, includes `adjust_staff_points` |

### 13.3 Points write tool — `app_ai/tests/test_adjust_staff_points.py`

| Case | Expected |
| --- | --- |
| Unambiguous subject + type | `post_transaction` called; balance updated |
| Ambiguous subject | `ambiguous_subject` + pending stored |
| Ambiguous point type | `ambiguous_point_type` + pending stored |
| Disambiguation reply `B` | Executes with candidate B's ID |
| Student subject | `validation_error` / subject error from service |
| Inactive point type | Rejected |
| Note too short | Rejected |
| Missing `points.award` | `permission_denied` |
| Points feature off | `feature_disabled` |
| Deduct 3 points | delta = -3, append-only new row |

### 13.4 Integration — extend `app_telegram/tests/test_ai_query.py`

Mock Gemini to call `adjust_staff_points`; verify disambiguation message shape and
execute-on-clear-match behavior.

Use existing conventions: PostgreSQL, `xschedjuice` schema, `RBAC_ENFORCE=log_only`.

---

## 14. Out of scope (v1)

- Attendance mark/write tool
- Enrollment / announcement write tools (infrastructure only)
- Yes/no confirmation for unambiguous point adjustments
- Telegram inline Confirm/Cancel buttons
- Per-role tool visibility beyond intent + feature flags
- Tool retrieval / deferred loading layer
- Point type configuration via AI
- Editing or deleting existing transactions

---

## 15. Future extensions

- `enroll_student_in_course` / `unenroll_student_from_course` — write exposure,
  disambiguation on student + course resolution
- `post_course_announcement` — may add content confirmation separate from identity
  disambiguation
- Intent classifier fine-tuning from logged mis-routes
- Org-configurable disambiguation TTL
