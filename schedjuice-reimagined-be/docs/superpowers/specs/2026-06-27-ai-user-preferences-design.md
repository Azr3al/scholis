# AI User Preferences & Per-User Usage — Design Spec

**Date:** 2026-06-27  
**Status:** Approved  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`

## 1. Summary

Add **persistent, structured per-user AI preferences** (language, tone,
verbosity, preferred name) that apply on **all AI surfaces** (Telegram DM
assistant and web `AIQueryView`). Users can set preferences via **chat** (AI
tool) or a **Memory** form on a new **AI** section of the user record. Admins
with the right permissions can view (and optionally edit) other users'
preferences and usage.

Rolling `TelegramAIExchange` history remains for short-term task context;
preferences live in **system context** so they survive beyond the N-turn
window.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Memory type | **A** — structured preferences only (no free-form facts) |
| Surfaces | **B** — Telegram + web share one preference record |
| Management | **C** — chat tool + settings UI |
| v1 preference fields | **C** — language + style + display name |
| Architecture | **Approach 1** — typed model + `set_ai_preferences` tool + system-context injection |
| Chat updates | Self only via tool; admins edit via API/UI |
| Org usage dashboard | Unchanged (`ai.usage.view`, platform-internal) |

---

## 2. Problem

Today, when a user asks the Telegram assistant to “speak English only,” the
model agrees but the instruction only persists while it remains in the rolling
conversation window (`TelegramAIExchange`, default 5 turns). Web queries have
no history at all. There is no durable per-user layer in `AIService.run()` —
system context is built from org settings only.

---

## 3. Data model

### `UserAIPreferences` (tenant schema, `app_ai/models.py`)

One row per user who has ever set a preference (lazy create on first save).

```python
class UserAIPreferences(BaseModel):
    class ResponseLanguage(models.TextChoices):
        AUTO = "auto", "auto"       # match language of each user message
        EN = "en", "en"             # English only
        MY = "my", "my"             # Burmese only

    class Tone(models.TextChoices):
        DEFAULT = "default", "default"
        FORMAL = "formal", "formal"
        CASUAL = "casual", "casual"

    class Verbosity(models.TextChoices):
        DEFAULT = "default", "default"
        BRIEF = "brief", "brief"
        DETAILED = "detailed", "detailed"

    user = models.OneToOneField(
        "app_auth.User",
        on_delete=models.CASCADE,
        related_name="ai_preferences",
    )
    response_language = models.CharField(
        max_length=8,
        choices=ResponseLanguage.choices,
        default=ResponseLanguage.AUTO,
    )
    tone = models.CharField(
        max_length=16,
        choices=Tone.choices,
        default=Tone.DEFAULT,
    )
    verbosity = models.CharField(
        max_length=16,
        choices=Verbosity.choices,
        default=Verbosity.DEFAULT,
    )
    preferred_name = models.CharField(max_length=64, blank=True, default="")
```

**Defaults when no row exists:** same as model defaults (`auto`, `default`,
`default`, empty preferred name).

**Validation:**

- `preferred_name`: strip whitespace; empty string clears; max 64 chars;
  reject control characters.
- Partial PATCH from API: only supplied fields update; omitted fields unchanged.

---

## 4. System prompt assembly

Extend the existing three-layer org prompt with a **fourth user layer**.

Current layers (`build_system_context`):

1. Platform base (`app_ai/prompts.py`)
2. School context (`Organization.ai_school_context`)
3. Org instructions (`Organization.ai_assistant_instructions`)

**New:** `build_user_preferences_context(user) -> str` in
`app_ai/user_preferences.py`:

- Returns empty string when all values are defaults and `preferred_name` is blank.
- Otherwise appends a block like:

```
User preferences:
- Respond in: English only
- Tone: casual
- Verbosity: be brief
- Address the user as: James
```

**Human-readable labels** (not raw enum codes) for injection.

**Wire-up:** In `AIService.run()`, after `build_system_context(tenant)`:

```python
pref_block = build_user_preferences_context(user)
if pref_block:
    system_context = f"{system_context}\n\n{pref_block}"
```

Applies to Telegram (`run_ai_query` → `AIService`) and web (`AIQueryView`).

### Platform prompt addition (`app_ai/prompts.py`)

Add to `PLATFORM_BASE_TEMPLATE`:

```
User preferences:
- When the user asks to change response language, tone, verbosity, or what you
  call them, call set_ai_preferences before answering.
- Confirm the change briefly in your reply.
```

---

## 5. Chat updates — `set_ai_preferences` tool

New write tool in `app_ai/tools/set_ai_preferences.py`.

| Property | Value |
| --- | --- |
| `name` | `set_ai_preferences` |
| `exposure` | `write` |
| `requires_feature` | `None` (any AI user) |

**Parameters** (all optional; at least one required):

| Arg | Type | Notes |
| --- | --- | --- |
| `response_language` | enum `auto \| en \| my` | |
| `tone` | enum `default \| formal \| casual` | |
| `verbosity` | enum `default \| brief \| detailed` | |
| `preferred_name` | string | set display name |
| `clear_preferred_name` | boolean | if true, clear preferred name |

**Authorization:** Tool always updates **the calling user's** preferences only
(`user` passed to `AIService.run()`). Attempts to pass a `user_id` arg are
**not** exposed in the schema.

**Returns:**

```json
{
  "status": "ok",
  "preferences": {
    "response_language": "en",
    "tone": "default",
    "verbosity": "brief",
    "preferred_name": "James"
  }
}
```

**Registration:** Add to `TOOL_REGISTRY` in `app_ai/tools/registry.py`.
Include in default tool list for assistant turns (same as read tools).

**Tests:** Unit tests for create/update/clear; integration test that
`AIService.run()` injects updated language into system context after tool call.

---

## 6. Permissions

New **school-tier** permissions in `app_rbac/catalog.py`:

| Code | Label | Default roles |
| --- | --- | --- |
| `ai.usage.view_own` | View own AI usage | admin, manager, teacher, finance, hr |
| `ai.usage.view_all` | View any user's AI usage | admin, manager |
| `ai.memory.view_own` | View own AI memory | admin, manager, teacher, finance, hr |
| `ai.memory.manage_own` | Edit own AI memory | admin, manager, teacher, finance, hr |
| `ai.memory.view_all` | View any user's AI memory | admin, manager |
| `ai.memory.manage_all` | Edit any user's AI memory | admin |

Add to `DEFAULT_MATRIX` in `app_rbac/defaults.py` and seed migration for
existing tenants.

**Not granted by default:** student role (students use Telegram/web AI only
via `ai.telegram_use` / future web AI permission — preferences follow whoever
has AI access).

**Existing permissions unchanged:**

- `ai.telegram_use` — gate for Telegram assistant
- `ai.usage.view` — platform org rollup (superadmin); separate from per-user

### Access matrix

| Action | Self (`target_id == request.user.id`) | Other user |
| --- | --- | --- |
| GET usage | `ai.usage.view_own` | `ai.usage.view_all` |
| GET preferences | `ai.memory.view_own` | `ai.memory.view_all` |
| PATCH preferences | `ai.memory.manage_own` | `ai.memory.manage_all` |
| Chat tool | always self | N/A |

Deny with 403 when permission missing. Do not leak existence via 404 for
preferences on users the caller cannot view.

---

## 7. Backend API

Base path: `/api/v1/users/{user_id}/…` (tenant-scoped, alongside
`UserDetailsView`).

### 7.1 `GET /api/v1/users/{user_id}/ai-usage`

Query params: `year`, `month` (UTC calendar month; default current month).

**Permission:** `ai.usage.view_own` (self) or `ai.usage.view_all` (other).

**Response:**

```json
{
  "user_id": 42,
  "year": 2026,
  "month": 6,
  "month_summary": {
    "total_cost_usd": "0.12345678",
    "total_tokens": 5000,
    "request_count": 12,
    "by_feature": [
      { "feature": "telegram_query", "total_cost_usd": "0.10", "request_count": 8 },
      { "feature": "ai_query", "total_cost_usd": "0.02", "request_count": 4 }
    ]
  },
  "trend": [
    { "year": 2026, "month": 1, "total_cost_usd": "0.01", "total_tokens": 100, "request_count": 1 }
  ]
}
```

**Aggregation:** Query public-schema `AIUsageLog` filtered by
`tenant_id = current org` and `user_id`. Month bounds UTC. Trend: last 6
calendar months inclusive. Reuse aggregation helpers from org AI usage views
where possible (`app_ai/usage_queries.py` or shared module).

### 7.2 `GET /api/v1/users/{user_id}/ai-preferences`

**Permission:** `ai.memory.view_own` or `ai.memory.view_all`.

**Response:**

```json
{
  "user_id": 42,
  "response_language": "en",
  "tone": "default",
  "verbosity": "brief",
  "preferred_name": "James",
  "updated_at": "2026-06-27T06:39:00Z"
}
```

Returns defaults when no row exists (`updated_at: null`).

### 7.3 `PATCH /api/v1/users/{user_id}/ai-preferences`

**Permission:** `ai.memory.manage_own` or `ai.memory.manage_all`.

**Body:** partial fields from GET shape (excluding `user_id`, `updated_at`).

**Response:** same as GET after save.

**Files:**

- `app_ai/views.py` — `UserAIUsageView`, `UserAIPreferencesView`
- `app_ai/serializers.py` — request/response serializers
- `app_ai/urls.py` — register under `users/<int:user_id>/ai-usage`, `ai-preferences`
- `app_auth/urls.py` — include ai url patterns or nest routes

---

## 8. Frontend

### 8.1 User record — new **AI** section

Extend `RecordSectionId` with `"ai"` in
`src/components/record/record-sections.ts`.

**Visibility:** Section visible when viewer has either:

- `ai.usage.view_own` or `ai.memory.view_own` (viewing self), or
- `ai.usage.view_all` or `ai.memory.view_all` (viewing another user)

Hide section entirely when viewer lacks both relevant own/all pairs for the
target user.

**Sub-sections** (tabs or stacked cards on the same page):

1. **Usage** — visible if viewer has `ai.usage.view_own` (self) or
   `ai.usage.view_all` (other)
2. **Memory** — visible if viewer has `ai.memory.view_own` or
   `ai.memory.view_all`

### 8.2 Usage UI

- Month selector (`?date=` via nuqs, match org AI usage pages)
- Summary cards: cost, tokens, requests
- 6-month trend bars (reuse `UsageTrendBars`)
- Optional feature breakdown table (`telegram_query` vs `ai_query`)

### 8.3 Memory UI

Form fields:

| Field | Control |
| --- | --- |
| Response language | Select: Auto / English / Burmese |
| Tone | Select: Default / Formal / Casual |
| Verbosity | Select: Default / Brief / Detailed |
| Preferred name | Text input + clear button |

- Editable when viewer has `manage_own` (self) or `manage_all` (other)
- Read-only otherwise
- Save via PATCH; toast on success/error
- Empty preferred name = use profile name (helper text)

### 8.4 Routes & navigation

| URL | Behavior |
| --- | --- |
| `/users/[id]?section=ai` | AI section on user record (primary) |
| `/profile?section=ai` | Redirect to `/users/{ownId}?section=ai` |

**Route permissions** (`route-permissions.ts`):

```typescript
{ prefix: "/users/", anyOf: [
  "ai.usage.view_own", "ai.usage.view_all",
  "ai.memory.view_own", "ai.memory.view_all",
  /* existing user.view rules */
] },
```

Client-side: hide AI section rail item when permissions fail for target user.

No new top-level nav item.

### 8.5 New frontend files

| File | Purpose |
| --- | --- |
| `src/types/ai-user-preferences.ts` | Zod + TS types |
| `src/app/client-api/ai-user-preferences.ts` | fetch/patch helpers |
| `src/components/record/sections/record-ai.tsx` | AI section (usage + memory) |
| `src/components/users/ai/ai-usage-panel.tsx` | Usage sub-panel |
| `src/components/users/ai/ai-memory-form.tsx` | Memory sub-panel |

---

## 9. Data flow

```
User message (Telegram or web)
  → AIService.run(prompt, user, ...)
      → build_system_context(org)
      → build_user_preferences_context(user)   # NEW
      → Gemini with tools (incl. set_ai_preferences)
      → on tool call: upsert UserAIPreferences for calling user
  → response

Settings UI
  → PATCH /users/{id}/ai-preferences
  → next AI call picks up changes via build_user_preferences_context
```

Telegram rolling history (`build_telegram_ai_history`) unchanged — task
follow-ups only. Language preference no longer depends on history retention.

---

## 10. Error handling

| Case | Behavior |
| --- | --- |
| No permission | 403 from API; AI section hidden in UI |
| User not found | 404 |
| Invalid enum on PATCH | 400 with field errors |
| Tool called with no args | Tool returns validation error; model retries or apologizes |
| Target user has no AI usage | Usage panel empty state, not error |
| Deleted user, logs remain | Usage still aggregates by `user_id`; name fallback |

---

## 11. Testing

### Backend

- Model defaults and validation
- `build_user_preferences_context` — empty vs populated
- `set_ai_preferences` tool — create, update, clear name, self-only
- `AIService.run()` includes preference block after save
- API permission matrix (own vs other, view vs manage)
- Usage aggregation for single user (month + trend)

### Frontend

- AI section visibility by permission + self/other
- Memory form save/read-only modes
- Route permission tests for `/users/:id?section=ai`

---

## 12. Out of scope (v1)

- Free-form memory facts (“user usually asks about MT courses”)
- Request-level log explorer on per-user page
- Admin changing another user's prefs via chat (API/UI only)
- Org-admin changes to platform `ai.usage.view` rollup
- CSV export
- Student default grant of memory permissions (explicit matrix config)
- Additional languages beyond `en` / `my` (extend enum later)

---

## 13. Implementation checklist

### Backend

- [ ] `UserAIPreferences` model + migration
- [ ] `build_user_preferences_context` + `AIService` wire-up
- [ ] Platform prompt update
- [ ] `set_ai_preferences` tool + registry
- [ ] RBAC catalog + defaults + seed migration
- [ ] `GET/PATCH ai-preferences` + `GET ai-usage` views + tests
- [ ] URL registration

### Frontend

- [ ] Types + client API
- [ ] `record-ai` section + usage/memory panels
- [ ] Permission gates + route rules
- [ ] `/profile?section=ai` redirect
- [ ] Tests (nav, route-permissions, section visibility)

---

## 14. Future extensions

- Grant `ai.memory.view_own` to student role when web AI ships for students
- More `ResponseLanguage` choices (e.g. `zh`, `th`)
- Audit log of preference changes (who/when/channel)
- Org default preferences applied until user overrides
