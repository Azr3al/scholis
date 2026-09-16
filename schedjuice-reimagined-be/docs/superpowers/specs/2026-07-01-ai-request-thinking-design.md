# AI Request Thinking Summaries — Design Spec

**Date:** 2026-07-01  
**Status:** Approved  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`

## 1. Summary

Capture Gemini **thinking summaries** (reasoning text returned when
`include_thoughts` is enabled) for user-facing AI turns, persist them per tool-loop
iteration on `AIRequestLog`, and expose them in a new **Requests** tab under org AI
Usage alongside the existing Failures explorer.

Platform operators need to inspect how the model reasoned through Telegram/web
queries — especially multi-step tool loops — without relying on token counts alone.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Problem | Thinking **token counts** are stored; thinking **text** is not |
| Explorer scope | **All** user-facing requests (not failures-only) |
| Request types | User-facing turns only (`telegram_query`, `ai_query`) |
| Thinking storage | **Per-iteration** JSON array on `AIRequestLog` |
| Approach | **A** — `thinking_steps` field on `AIRequestLog` (not separate table) |
| Permission | Reuse `ai.usage.view`; no new permission |
| Historical data | **No backfill** — thinking text was never captured |
| Failures tab | Also surface `thinking_steps` in failures API/UI expanded rows |

### Problem today

- `AIUsageLog.thinking_tokens` records Gemini `thoughts_token_count` per API call.
- `GeminiClient.generate_with_tools` does not set `thinking_config.include_thoughts`
  and only reads `part.text`, ignoring `part.thought` parts.
- `AIRequestLog` stores prompt, response, and tool calls but has no reasoning field.
- The Failures dashboard expanded row has no “Reasoning” section.
- There is no request explorer for successful or blocked turns — only failure outcomes.

---

## 2. Data model

Add to `AIRequestLog` (public schema, `app_ai`):

```python
thinking_steps = models.JSONField(default=list, blank=True)
```

Each element:

```python
{
    "iteration": int,           # 1-based Gemini loop index
    "text": str,                # truncated thought summary text
    "thinking_tokens": int,     # from usage_metadata.thoughts_token_count
}
```

**Rules:**

- Truncate each step’s `text` with existing `truncate_text()` (2000 chars).
- Cap at **10 steps** per request (matches practical max tool iterations).
- Empty list for: pre-deploy rows, blocked/rate-limited turns (no Gemini call),
  iterations where the model returns no thought parts.

`AIUsageLog` is unchanged.

---

## 3. Capture pipeline

### 3.1 Enable thinking in user-facing tool loops

In `GeminiClient.generate_with_tools`, add to every `GenerateContentConfig`:

```python
thinking_config=types.ThinkingConfig(include_thoughts=True)
```

Apply to both cached and non-cached config paths. Do **not** enable for
`classify_prompt_scope` or `judge_capability_gap`.

### 3.2 Extract per iteration

After each successful `generate_content` response:

```python
thought_text = "".join(
    p.text for p in parts
    if getattr(p, "thought", False) and getattr(p, "text", None)
)
```

Append to accumulator on `AIResult`:

```python
{"iteration": iterations, "text": truncate_text(thought_text), "thinking_tokens": usage.thinking_tokens}
```

Run extraction on both tool-call branches and final-text branch before
`record_usage`.

### 3.3 Persist

Extend `AIResult`:

```python
thinking_steps: list[dict[str, Any]] = field(default_factory=list)
```

Pass through `record_request_log` → `AIRequestLog.thinking_steps`.

---

## 4. API

### 4.1 New request explorer endpoints

| Endpoint | Scope |
| --- | --- |
| `GET /platform/ai-usage/requests` | All orgs |
| `GET /organizations/{id}/ai-usage/requests` | Single org |

**Query params**

| Param | Default | Notes |
| --- | --- | --- |
| `year`, `month` | required | Same validation as failures |
| `feature` | `telegram_query` | `ai_query`, or `all` for both user-facing features |
| `outcome` | `all` | `success`, `tool_limit_exceeded`, `capability_gap`, `error`, `blocked`, `rate_limited`, or `all` |
| `page`, `page_size` | 1, 25 | Max page size 100 |
| `sort` | `-created_at` | Also `tool_iterations`, `-tool_iterations`, `total_tokens`, `-total_tokens` |

**Response item fields** — same as failures list items, plus:

```json
"thinking_steps": [
  {"iteration": 1, "text": "...", "thinking_tokens": 120}
]
```

**Summary block** (month-level):

```json
"summary": {
  "request_count": 42,
  "by_outcome": {"success": 30, "tool_limit_exceeded": 5, ...},
  "organizations_affected": 3
}
```

Implement `build_requests_list()` in `app_ai/reporting.py`. Reuse user-name
resolution and row serialization from `build_failures_list` via a shared helper.

### 4.2 Failures API enrichment

Add `thinking_steps` to `build_failures_list` item payload (no new endpoint).

---

## 5. Frontend

### 5.1 New “Requests” tab

Add to org AI section tabs: Settings | Usage | Failures | **Requests**

- Paginated table: When, User, Question, Outcome, Iterations, Tokens
- Filters: outcome (default **all**), feature, month (reuse `YearMonthSelector`)
- Expandable row:
  - **Reasoning** — numbered steps with text and token count per step; show
    “No reasoning captured” when empty
  - Full question, response, tool calls (reuse failures expand layout)

### 5.2 Failures tab

Add **Reasoning** section to expanded failure rows using existing
`thinking_steps` field once API returns it.

### 5.3 Types and API client

- `AiUsageThinkingStepSchema` and `thinking_steps` on request/failure item schemas
- `fetchOrgAiUsageRequests()` in `client-api/ai-usage.ts`

Platform-level requests page is out of v1 scope (API wired; org tab is priority).

---

## 6. Edge cases

| Case | Behavior |
| --- | --- |
| Model thinks but returns no thought parts | Step with empty `text`; `thinking_tokens` may still be > 0 |
| Blocked / rate-limited before Gemini | `thinking_steps = []` |
| Pre-deploy historical rows | Empty array; UI shows “No reasoning captured” |
| Very long thinking | Truncated per step at 2000 chars |
| Privacy | Same `ai.usage.view` gate as prompt/response |

---

## 7. Testing

**Backend**

- Unit: thought extraction from mocked Gemini parts
- Unit: `record_request_log` persists `thinking_steps`
- Unit: `build_requests_list` filters (feature, outcome, pagination)
- API: permission + pagination for org and platform requests endpoints

**Frontend**

- Zod schema tests for `thinking_steps`
- Manual: expand request row shows numbered reasoning steps

---

## 8. Out of scope (v1)

- Backfill of historical thinking text
- Platform-level Requests UI page
- Storing thinking on internal Gemini calls (guardrail, capability-gap judge)
- Separate retention/TTL for thinking text
