# AI Guardrails — Design Spec

**Date:** 2026-06-27  
**Status:** Implemented (2026-06-27)  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`

## 1. Summary

Add guardrails to the Schedjuice AI assistant so it refuses off-topic requests
(general knowledge, math, trivia, creative writing) and blocks abusive/trivial
prompts before they consume full Gemini tool-loop quota.

Guardrails apply to **Telegram DM** (`run_ai_query`) and **web** (`AIQueryView`)
via a shared module invoked from `AIService.run()`.

School and platform admins can **view the full system prompt** on the org AI
settings page. Orgs may **extend** behavior via existing fields
(`ai_school_context`, `ai_assistant_instructions`); platform guardrail rules
are read-only.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Goals | Scope enforcement + cost/abuse prevention |
| Surfaces | Telegram DM + web `AIQueryView` (shared rules) |
| Scope detection | Hybrid — heuristics → classifier on uncertainty → strengthened system prompt |
| Classifier | Heuristics first; flash-lite structured call only when `UNCERTAIN` |
| Architecture | Centralized in `AIService`; Telegram webhook may call shared heuristics synchronously before enqueue |
| Rate limiting | Per-user sliding window (reuse Django cache pattern) |
| Refusal copy | Tenant name, not "Schedjuice" — e.g. "I can only help with {org.name} operations…" |
| Admin UX | Read-only platform base + editable org fields + live assembled preview on AI settings page |
| Platform base prompt editing | Code/deploy in v1 (no platform admin UI) |

---

## 2. Guardrail pipeline

```
User prompt (+ optional conversation history)
  → [1] Rate limit check (per user, per tenant)
  → [2] Heuristic scan → REJECT | ALLOW | UNCERTAIN
  → [3] If UNCERTAIN → cheap classifier Gemini call (flash-lite, structured JSON)
  → [4] If blocked → return refusal (no main AI / tool loop)
  → [5] If allowed → AIService.run() with strengthened system prompt
```

### 2.1 Heuristic REJECT (no API call)

Block locally when the prompt clearly falls outside school operations:

- **Pure arithmetic / math trivia** — e.g. `what is 2 + 2525`, `2+2=?`, `calculate 15*3`
- **General knowledge / trivia** — e.g. `capital of France`, `who won the world cup`
- **Creative / general-assistant requests** — e.g. `write a poem`, `explain quantum physics`, `help me with my homework essay`
- **Empty / whitespace-only** prompts

Implementation: regex + small pattern library in `app_ai/guardrails/heuristics.py`.
Patterns are conservative — when in doubt, return `UNCERTAIN` not `REJECT`.

### 2.2 Heuristic ALLOW (skip classifier)

Fast-path when prompt clearly relates to school operations:

- Keyword signals: student, teacher, staff, course, class, schedule, attendance,
  payment, enroll, grade, program, intake, roster, subject, section, parent, etc.
- **Follow-up allowance:** if `history` contains a recent in-scope exchange (prior
  turn was not blocked and assistant replied with school data), short follow-ups
  like "what about their courses?" or "tell me more" are `ALLOW` even without
  keywords.

### 2.3 Heuristic UNCERTAIN → classifier

When heuristics neither reject nor allow:

- Run one **flash-lite** call with structured JSON output:
  `{ "allowed": boolean, "reason": string }`
- Classifier system prompt includes org name and in-scope topic list.
- Feature tag: `ai_guardrail_classify` (recorded in usage; counts toward quota).
- On classifier failure (timeout, API error): **fail open** to main AI call with
  strengthened system prompt (log warning). Rationale: availability over perfect
  blocking; system prompt still instructs refusal.

### 2.4 Blocked user message

Single template, `{org_name}` substituted from `Organization.name`:

> I can only help with **{org_name}** operations — things like students, staff,
> courses, schedules, and attendance. Try rephrasing your question.

- **Telegram:** sent as bot reply (same threading as normal answers).
- **Web:** HTTP 422 with body `{ "code": "prompt_blocked", "message": "…" }`.
- Blocked prompts do **not** invoke the main tool loop; classifier usage (if any)
  is the only quota consumed.

### 2.5 Rate limiting

Per-user sliding window using Django cache (same pattern as
`app_auth.views._check_rate_limit`):

| Setting | Default |
| --- | --- |
| `AI_RATE_LIMIT_PER_USER` | 30 |
| `AI_RATE_LIMIT_WINDOW_SECONDS` | 3600 (1 hour) |

Cache key: `ai_query_rate:{schema_name}:{user_id}`.

Rate-limited message:

> You're sending requests too quickly. Please wait {retry_after} seconds and try again.

- **Telegram:** reply with message above.
- **Web:** HTTP 429 `{ "code": "rate_limited", "retry_after_seconds": N }`.

Rate limit runs **before** heuristics (cheapest check first).

---

## 3. System prompt structure

Three layers assembled by `build_system_context()`:

| Layer | Source | School admin editable? |
| --- | --- | --- |
| Platform base | `app_ai/prompts.py` constant | No |
| School context | `Organization.ai_school_context` | Yes |
| Additional instructions | `Organization.ai_assistant_instructions` | Yes |

### 3.1 Platform base prompt (read-only)

```text
You are the assistant for {org_name}.

Scope: Only answer questions about this school's operations — students, staff,
courses, schedules, attendance, payments, and related admin tasks. Refuse general
knowledge, math, trivia, creative writing, and anything outside school
operations.

Be concise and accurate. Use available tools to look up live data. Do not invent
records.
```

`{org_name}` is substituted at assembly time from `Organization.name`.

### 3.2 Assembly order

```text
{platform_base}

School context:
{ai_school_context or "No additional school context provided."}

Instructions:
{ai_assistant_instructions or default_behavior_line}
```

Replace `_DEFAULT_INSTRUCTIONS` in `tenant_context.py` — scope rules move into
platform base; org `ai_assistant_instructions` is purely additive (tone, priorities).

### 3.3 API additions

`OrganizationAISettingsSerializer` GET response adds read-only fields:

- `ai_platform_base_prompt` — platform base with `{org_name}` filled in
- `ai_system_prompt_preview` — full assembled prompt as sent to Gemini

PATCH unchanged — only existing editable fields.

---

## 4. Integration points

### 4.1 New module: `app_ai/guardrails/`

```
app_ai/guardrails/
  __init__.py       # evaluate_prompt() entry point
  heuristics.py     # REJECT / ALLOW / UNCERTAIN
  classifier.py     # flash-lite structured call
  messages.py       # refusal + rate-limit templates
  rate_limit.py     # per-user cache check
  types.py          # GuardrailResult dataclass
```

```python
@dataclass
class GuardrailResult:
    allowed: bool
    reason: str  # "allowed" | "heuristic_reject" | "classifier_reject" | "rate_limited"
    message: str | None  # user-facing text when blocked
    retry_after_seconds: int | None
```

```python
def evaluate_prompt(
    prompt: str,
    *,
    user,
    org: Organization,
    history: list[dict] | None = None,
) -> GuardrailResult:
    ...
```

### 4.2 `AIService.run()`

Before quota check / Gemini call:

1. Call `evaluate_prompt(prompt, user=user, org=tenant, history=history)`
2. If not allowed, raise new `AIPromptBlocked` or return early with blocked message
   (prefer exception for clean handling in views/tasks)
3. If allowed, proceed as today

New exception:

```python
class AIPromptBlocked(Exception):
    def __init__(self, message: str, reason: str = "prompt_blocked"): ...
```

### 4.3 Telegram (`app_telegram/`)

**Optional sync optimization in `binding.py`:**

Before `run_ai_query.delay()`, call heuristics-only path (no classifier in webhook).
If `REJECT`, reply immediately and skip enqueue. Classifier + rate limit still run
in the async task for `UNCERTAIN` / rate-limited cases.

**`run_ai_query` task:**

Catch `AIPromptBlocked` → send refusal reply.  
Catch rate limit → send rate-limit reply.  
Do not persist `TelegramAIExchange` for blocked/rate-limited prompts.

### 4.4 Web (`AIQueryView`)

Catch `AIPromptBlocked` → 422 with `prompt_blocked`.  
Catch rate limit → 429 with `rate_limited`.

---

## 5. Frontend — AI settings page

Add **System prompt** card (above General):

1. **Platform rules** — read-only textarea showing `ai_platform_base_prompt`
2. **School context** — existing editable field (move here)
3. **Additional instructions** — existing editable field (move here)
4. **Preview** — read-only textarea showing `ai_system_prompt_preview`; refresh
   after save (v1). Debounced live preview is optional follow-up.

Copy for read-only sections:

- Platform rules label: "Platform rules (read-only)"
- Preview label: "Preview — full prompt sent to the AI"

No new permissions — existing `org.configure` on AI settings endpoint.

---

## 6. Configuration

Django settings (with env overrides):

| Setting | Default | Purpose |
| --- | --- | --- |
| `AI_RATE_LIMIT_PER_USER` | 30 | Max prompts per user per window |
| `AI_RATE_LIMIT_WINDOW_SECONDS` | 3600 | Sliding window |
| `AI_GUARDRAIL_CLASSIFIER_MODEL` | `gemini-3.1-flash-lite` | Classifier model |
| `AI_GUARDRAIL_FAIL_OPEN` | `True` | Classifier errors allow main call |

Heuristic patterns live in code (not per-tenant configurable in v1).

---

## 7. Error handling & logging

| Scenario | Behavior |
| --- | --- |
| Heuristic REJECT | Block, log at info with `reason=heuristic_reject` |
| Classifier REJECT | Block, log at info with `reason=classifier_reject` |
| Classifier API error | Fail open if `AI_GUARDRAIL_FAIL_OPEN`; else block with generic unavailable |
| Rate limited | Block, log at info |
| Empty prompt | Block before any API call |

Structured log fields: `user_id`, `org_schema`, `guardrail_reason`, `prompt_length`
(not full prompt — avoid PII in logs).

---

## 8. Testing

### Backend

| Test file | Coverage |
| --- | --- |
| `app_ai/tests/test_guardrails_heuristics.py` | REJECT/ALLOW/UNCERTAIN cases (math, trivia, school keywords, follow-ups) |
| `app_ai/tests/test_guardrails_classifier.py` | Mock Gemini; allowed/blocked JSON |
| `app_ai/tests/test_guardrails_rate_limit.py` | Window enforcement, retry_after |
| `app_ai/tests/test_tenant_context.py` | Updated assembly; preview fields |
| `app_telegram/tests/test_ai_query.py` | Blocked math prompt → refusal with org name; no AIService call |
| `app_ai/tests/test_views.py` (or existing) | Web 422/429 responses |
| `app_organization/tests/test_ai_settings_api.py` | Read-only preview fields in GET |

Example assertions:

- `"what is 2 + 2525"` → blocked, message contains org name, no tool loop
- `"find students named Sarah"` → allowed
- `"find Sarah"` → classifier called (mock), allowed
- 31st request in hour → 429 / rate-limit message

### Frontend

- AI settings page renders read-only platform prompt and preview from API
- Existing save flow unchanged for editable fields

---

## 9. Out of scope (v1)

- Per-tenant customizable guardrail rules or keyword lists
- Platform admin UI to edit base prompt (code/deploy only)
- Group Telegram AI guardrails
- Safety/moderation beyond scope (harmful content) — deferred unless added later
- Removing ack reaction when prompt is blocked synchronously in webhook
- Debounced live preview while typing

---

## 10. Files to touch

| Area | Files |
| --- | --- |
| Guardrails core | `app_ai/guardrails/*` (new) |
| Prompts | `app_ai/prompts.py` (new), `app_ai/tenant_context.py` |
| Service | `app_ai/service.py`, `app_ai/exceptions.py` |
| Classifier | `app_ai/client.py` (minimal helper or method on GeminiClient) |
| Telegram | `app_telegram/binding.py`, `app_telegram/tasks.py` |
| Web | `app_ai/views.py` |
| API | `app_organization/serializers.py` |
| Settings | `schedjuice_backend/settings.py` |
| FE types | `src/types/organization-ai-settings.ts` |
| FE page | `src/app/(internal)/organizations/ai-settings/page.tsx` |
| Tests | files listed in §8 |
