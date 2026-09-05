# AI Tenant Capability Packs — Design Spec

**Date:** 2026-07-18  
**Status:** Approved  
**Repos:** `schedjuice-reimagined-be` (+ org AI settings UI in `schedjuice-reimagined-fe`)  
**Approach:** Capability packs (code-owned) with staff-assigned enablement, schema binders, and short pack prompt snippets

## 1. Summary

Make the Gemini bot (Telegram today, web via `POST /ai/query` later) **per-tenant**: different tools and params, different short system-prompt fragments, while keeping each turn’s **tool surface tight** and the **system prompt short**.

Today: tools are global (`TOOL_REGISTRY`); tenants only customize school context / assistant instructions / limits.  
Target: **minimal core + opt-in packs** assigned by Schedjuice platform staff; school admins see a **read-only tool list** and keep editing light knobs.

Motivating example: *“How many [subject] courses?”* via a pack-gated tool whose subject param is bound from the tenant `Subject` table.

## 2. Problem

| Need | Current state | Gap |
| --- | --- | --- |
| Different capabilities per school | All 19 tools declared (minus feature/intent filters) | No pack/allowlist — every tenant pays prompt/tool cost for unused skills |
| Tenant-specific params (subjects) | Static tool schemas | No binder from `Subject` / course relations |
| Short prompts | Platform base + school text always; tools always large | No pack-scoped prompt snippets; tool declarations stay fat |
| Visibility | Admins can’t see which tools the bot has | Need read-only catalog in org AI settings |
| Safe configuration | School admins edit AI settings | Pack assignment must be Schedjuice staff only |

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Approach | **Capability packs** (code-owned definitions; org stores enabled pack ids) |
| Config ownership | Hybrid: packs/schemas/snippets in code; school knobs remain `ai_school_context` / `ai_assistant_instructions` |
| Pack assignment | **Schedjuice platform staff only** — `RequiresPlatformAdminTenant` (superadmin on admin tenant) |
| School admin UX | Read-only **available tools** list (+ existing knobs); cannot PATCH packs |
| Default surface | **Minimal core** always on; everything else opt-in via packs |
| Migration | Existing AI-enabled orgs get a **legacy full pack set** so Telegram does not regress; new orgs get `core` only |
| Subjects | From tenant `Subject` table; count via `Course.subject` and/or `CourseSubject` (see §5.3) |
| Channels | Same resolution for Telegram and web (`AIService`) |
| Out of scope | School-invented tools; free-form schemas in UI; web chat UI; per-user pack overrides |

## 4. Architecture

```
Organization.ai_enabled_packs
        │
        ▼
   PACK_REGISTRY ──► prompt snippets (enabled only)
        │
        ▼
 resolve_tools_for_org(org) ──► schema binders (e.g. subject enum)
        │
        ▼
 list_tools_for_turn (intent × feature) ──► Gemini
        │
        ▼
 tool.run (RBAC at execution)
```

### 4.1 Runtime filter order

1. Always include **`core`** (and `always_available` tools such as `set_ai_preferences`).
2. Union tools from `Organization.ai_enabled_packs`.
3. Existing **feature** gates (`requires_feature`, e.g. staff points).
4. Existing **turn intent** (read vs write).
5. **RBAC** inside each tool at execution (unchanged).

### 4.2 Prompt assembly (short)

1. Shortened / existing platform base (`build_platform_base_prompt`).
2. **Only** prompt snippets for enabled packs (empty snippet → omit section).
3. School context + FM/HM flag + assistant instructions (existing).
4. Session context (datetime, actor, prefs, pending turns) — unchanged; not part of pack cache identity beyond today’s rules.

### 4.3 Context cache

Cache key / signature must include:

- System context used for cache (incl. pack snippets)
- Bound tool declaration signature (incl. subject enum contents or a hash of subject names)

Invalidate on: AI settings save that touches packs or school prompt fields; prefer also hashing subjects so catalog edits refresh bindings.

## 5. Components & data model

### 5.1 Pack registry (code)

New module e.g. `app_ai/packs.py` (or `app_ai/packs/`).

```python
@dataclass(frozen=True)
class Pack:
    id: str
    title: str
    description: str
    tool_names: tuple[str, ...]
    prompt_snippet: str = ""
    # Optional: mutate/copy Tool schemas for this org before Gemini sees them
    # bind_schemas(org, tools: list[Tool]) -> list[Tool]
```

`PACK_REGISTRY: dict[str, Pack]` is the single source of truth.  
`core` is always applied (not required in `ai_enabled_packs`; if present, treat as no-op duplicate).

### 5.2 Organization field

- `ai_enabled_packs`: `JSONField` default `list`, storing pack id strings.
- Validate on write: every id ∈ `PACK_REGISTRY` and ≠ reserved handling for `core`.
- Reject unknown ids with 400.

### 5.3 Initial pack cut (v1)

Exact tool membership may be adjusted in the implementation plan; intent is:

| Pack id | Purpose | Tools (approx.) |
| --- | --- | --- |
| `core` | Always on | `search_users`, `search_courses`, `set_ai_preferences` |
| `course_counts` | Headcounts | `count_organization`, `count_teacher_courses`, `count_course_roster` |
| `course_queries` | Calendar / user course lists | `query_courses`, `query_courses_starting`, `list_user_courses` |
| `roster_read` | Roster names | `get_course_roster` |
| `roster_write` | Mutating roster | enroll/remove student, assign/remove staff |
| `finance` | Payments | `get_unpaid_students` |
| `staff_points` | Points | list/get/adjust (still needs `is_staff_points_enabled`) |
| `subject_analytics` | Subject questions | new `count_courses_by_subject` |

**Legacy full set** (migration for existing AI orgs): all packs above except that `subject_analytics` may be opt-in only (new capability). Locked: legacy = every pack that reproduces today’s tool list; `subject_analytics` is **not** in legacy unless we add the tool and choose to enable it — **default: legacy = today’s tools only; `subject_analytics` staff-enabled per tenant.**

### 5.4 Subject analytics tool

New tool `count_courses_by_subject`:

- **Param:** `subject` (string) — binder prefers JSON Schema `enum` of tenant `Subject.name` values when count ≤ cap (e.g. 100).
- **Over cap:** no enum (or truncated enum) + description instructs exact catalog names; `run` validates against DB and returns a clear error listing a sample of valid names if unknown.
- **Query:** count distinct courses linked to that subject via:
  - `Course.subject_id` **or**
  - `CourseSubject` rows  
  Use **OR / union** so neither association path is missed (tenants may use either).
- **RBAC:** same breadth as other admin course counts (`require_course_read_breadth` or shared helper used by `count_organization` / `query_courses`).
- **Exposure:** read.

### 5.5 Schema binders

- Invoked inside `resolve_tools_for_org` after pack union.
- Must return Tool copies (do not mutate global registry instances).
- First binder: subject enum for `count_courses_by_subject`.

### 5.6 API / serializer

Extend `OrganizationAISettingsSerializer`:

| Field | Read | Write |
| --- | --- | --- |
| `ai_enabled_packs` | yes | platform staff only |
| `ai_available_packs` | yes (id, title, description, tool_names) | no |
| `available_tools` | yes (`name`, `description`, `pack_id`, `exposure`) | no |
| existing knobs | unchanged | unchanged for org AI editors |

Write rules for `ai_enabled_packs`:

- If request user fails `RequiresPlatformAdminTenant` and body includes `ai_enabled_packs` → **403** (prefer explicit error over silent drop).
- Platform staff may PATCH packs on any org (same pattern as other platform org ops via admin tenant).

`ai_system_prompt_preview` must reflect pack snippets so staff can verify shortness.

On successful update of packs or cache-relevant prompt fields: invalidate org Gemini context cache (extend existing invalidation in serializer `update`).

### 5.7 Frontend

`OrgAiSettingsPane`:

- **Available tools:** read-only list/table from `available_tools` (always visible to anyone who can open AI settings).
- **Capability packs:** checklist/multi-select bound to `ai_enabled_packs`, visible and editable **only** when the API indicates can_edit_packs (e.g. response flag `can_edit_ai_packs: true`) or equivalent client-side knowledge of platform admin; if not editable, show enabled pack titles read-only.
- School context / instructions / budgets: unchanged.

## 6. Data flow

### 6.1 Staff assigns packs

1. Platform superadmin (admin tenant) opens org AI settings for target org.
2. Toggles packs → `PATCH` `ai_enabled_packs`.
3. Validation + save + cache invalidate.
4. School admins later see updated read-only tool list.

### 6.2 User query (Telegram / web)

1. Ingress resolves tenant + user (unchanged).
2. `AIService.run` builds pack-aware system context and resolved tools.
3. Intent/feature filter → Gemini function-calling loop.
4. Tools not in resolved set never appear in declarations; stale names → existing unknown-tool error path.

### 6.3 Subject question

1. Tenant has `subject_analytics` enabled.
2. Binder loads subjects; tool schema constrained.
3. User asks “How many IELTS courses?”
4. Model calls `count_courses_by_subject`; tool returns count (+ optional short metadata).
5. Without pack: tool absent; model should not claim capability (capability-gap judge remains available).

## 7. Errors & edge cases

| Case | Behavior |
| --- | --- |
| Unknown pack id | 400 validation |
| Non-staff PATCH packs | 403 |
| Empty `ai_enabled_packs` | `core` only |
| Subject list huge | Cap enum; validate in `run` |
| Pack on but feature off (`staff_points`) | Tools still filtered by `requires_feature` |
| Model calls disabled tool | No execution; error payload to model |
| Subject renamed/deleted | Next resolve/cache miss picks up new names; in-flight args validated in `run` |

## 8. Testing

- Pack resolution: core-only; multi-pack union; unknown pack rejected.
- Prompt: only enabled pack snippets present.
- Subject binder + `count_courses_by_subject` (FK and `CourseSubject` paths).
- API: platform staff PATCH packs OK; school admin 403; GET returns `available_tools` / packs catalog.
- `list_tools_for_turn`: packs × intent × feature.
- Migration: legacy orgs retain prior tool surface; new orgs core-only.
- Cache invalidation on pack change.
- FE: read-only tools render; pack editor hidden without edit flag.

## 9. Success criteria

- Tenant with only `core` never receives roster/finance/subject tool declarations.
- Tenant with `subject_analytics` can answer subject course counts from the Subject catalog.
- Org AI settings shows an accurate read-only tool list.
- Enabled pack snippets keep system prompt shorter than “document every global tool.”
- No Telegram regression for migrated legacy orgs.

## 10. Implementation notes (for planning)

Primary touch points:

- `app_ai/packs.py`, `app_ai/tools/base.py` / registry resolution, `app_ai/service.py`, `app_ai/tenant_context.py`, `app_ai/context_cache.py`
- New tool module + registry entry for `count_courses_by_subject`
- `app_organization/models.py` + migration + `OrganizationAISettingsSerializer` / permissions
- FE: `organization-ai-settings` types + `org-ai-settings-pane.tsx`

Do not invent tools in the database. Pack membership and schemas stay in code.
