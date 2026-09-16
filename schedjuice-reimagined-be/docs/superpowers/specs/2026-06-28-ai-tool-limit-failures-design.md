# AI Tool-Limit Failures Dashboard — Design Spec

**Date:** 2026-06-28  
**Status:** Approved  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`

## 1. Summary

Add ongoing visibility into **Telegram (and future web) AI requests that hit the
tool-call iteration limit** inside the existing platform **AI Usage** area.

Platform operators need to see **what users asked** when the LLM exhausted its
tool loop (`"I could not complete that request within the tool limit."`) so they
can tune prompts, tools, or `ai_max_tool_iterations`.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Goal | **B** — ongoing monitoring, not one-off investigation |
| Surface | Platform-internal dashboard under existing **AI Usage** nav |
| v1 scope | **C** — focused tool-limit failures first; table/model extensible to full request log explorer |
| Data approach | **A** — new public-schema `AIRequestLog` (session-level), not `TelegramAIExchange` scans |
| Permission | Reuse `ai.usage.view` (superadmin default); no new permission |
| Default filter | `outcome=tool_limit_exceeded`, `feature=telegram_query` |
| Historical data | One-time backfill from `TelegramAIExchange` via management command |

### Problem today

- `GeminiClient.generate_with_tools` exits the loop at `max_iterations` without
  recording a session-level outcome; only **per-iteration** `AIUsageLog` rows exist
  (no user prompt).
- Tool-limit replies are **not exceptions** — Telegram delivers the fallback message
  and may persist `TelegramAIExchange`, but detection via `bot_text` string match is
  fragile and lacks tool-chain detail.
- The AI Usage dashboard (2026-06-27) ships monthly aggregates only; request-level
  explorer was explicitly deferred.

---

## 2. Data model

### New model: `AIRequestLog` (public schema, `app_ai`)

One row per completed AI user turn (prompt → outcome).

```python
class AIRequestLog(models.Model):
    class Outcome(models.TextChoices):
        SUCCESS = "success", "success"
        TOOL_LIMIT_EXCEEDED = "tool_limit_exceeded", "tool_limit_exceeded"
        ERROR = "error", "error"
        BLOCKED = "blocked", "blocked"
        RATE_LIMITED = "rate_limited", "rate_limited"

    class Source(models.TextChoices):
        LIVE = "live", "live"
        BACKFILL = "backfill", "backfill"

    tenant = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="ai_request_logs")
    user_id = models.PositiveIntegerField(null=True, blank=True)
    feature = models.CharField(max_length=128)          # e.g. telegram_query, ai_query
    channel_key = models.CharField(max_length=128, blank=True, default="")
    prompt = models.TextField()                         # truncated to 2000 chars on write
    response_text = models.TextField(blank=True, default="")  # truncated to 2000 chars
    outcome = models.CharField(max_length=32, choices=Outcome.choices)
    tool_iterations = models.PositiveSmallIntegerField(default=0)
    tool_calls = models.JSONField(default=list, blank=True)   # [{name, ok, error}]
    model = models.CharField(max_length=128, blank=True, default="")
    total_tokens = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.LIVE)
    error_type = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "created_at"], name="ix_ai_req_tenant_created"),
            models.Index(fields=["outcome", "created_at"], name="ix_ai_req_outcome_created"),
            models.Index(fields=["feature", "outcome", "created_at"], name="ix_ai_req_feat_out_created"),
        ]
```

**Notes:**

- `AIUsageLog` remains the per-Gemini-call billing/telemetry record; unchanged.
- Prompt/response truncation happens in the write helper, not the DB constraint.
- `source=backfill` distinguishes historical rows with no tool-chain data.

---

## 3. Instrumentation

### 3.1 `AIResult` enrichment

Extend `AIResult` dataclass in `app_ai/client.py`:

```python
@dataclass
class AIResult:
    text: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    model: str = ""
    iterations: int = 0
    outcome: str = "success"           # maps to AIRequestLog.Outcome
    total_tokens: int = 0
    latency_ms: int = 0
    error_type: str = ""
```

### 3.2 Tool-limit detection

In `GeminiClient.generate_with_tools`, when the `while iterations < loop_limit`
loop exits **without** returning a final text answer:

```python
return AIResult(
    text=final_text or "I could not complete that request within the tool limit.",
    tool_calls=tool_call_log,
    model=model_name,
    iterations=iterations,
    outcome="tool_limit_exceeded",
    total_tokens=...,   # sum usage across iterations in this request
    latency_ms=...,     # wall time for full loop
)
```

Successful early return keeps `outcome="success"`. Exception paths in the loop
already call `record_usage` with `status=error`; the outer `AIService.run()`
try/except maps uncaught exceptions to `outcome=error`.

### 3.3 Session log writer

New module `app_ai/request_log.py`:

```python
def record_request_log(
    *,
    user_id: int | None,
    feature: str,
    channel_key: str | None,
    prompt: str,
    result: AIResult | None,
    outcome: str,
    response_text: str = "",
    error_type: str = "",
    source: str = "live",
) -> AIRequestLog | None:
    ...
```

Called from **`AIService.run()`** in a `finally`-style path so every user turn
produces exactly one row:

| Path | `outcome` | `response_text` |
| --- | --- | --- |
| Normal completion | `success` | `result.text` |
| Tool limit | `tool_limit_exceeded` | fallback message |
| Guardrail block | `blocked` | guard message (no Gemini call) |
| Rate limit | `rate_limited` | rate-limit message |
| Uncaught exception | `error` | empty or generic |

Guardrail blocks and rate limits are logged for future explorer use but **excluded
from the v1 failures UI** by API default filter.

### 3.4 Token/latency aggregation

For live requests, accumulate `TokenUsage.total_tokens` and per-iteration latency
inside `generate_with_tools` and attach to the final `AIResult`. The session writer
persists the aggregate on `AIRequestLog`.

---

## 4. Historical backfill

Management command: `backfill_ai_request_logs_from_telegram`

**Behavior:**

1. Iterate all tenant schemas (same pattern as other cross-tenant commands).
2. Query `TelegramAIExchange` where `bot_text` contains
   `"within the tool limit"` (exact substring of the current fallback message).
3. For each row, insert `AIRequestLog` in public schema with:
   - `outcome=tool_limit_exceeded`
   - `feature=telegram_query`
   - `channel_key=telegram:{chat_id}`
   - `prompt=user_text` (truncated)
   - `response_text=bot_text` (truncated)
   - `tool_iterations=0`, `tool_calls=[]`
   - `source=backfill`
   - `created_at` = exchange `created_at`
4. Skip duplicates: match on `(tenant_id, user_id, created_at, prompt[:500])`.
5. Flags: `--dry-run`, optional `--schema=`.

Run once after deploy. Not required for the dashboard to function for new failures.

---

## 5. API

### Endpoints

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/v1/platform/ai-usage/failures` | `ai.usage.view` + `RequiresPlatformAdminTenant` |
| `GET` | `/api/v1/organizations/{id}/ai-usage/failures` | `ai.usage.view` + platform admin tenant (v1) |

Register in `app_ai/urls.py` (platform) and `app_organization/urls.py` (org detail),
mirroring existing AI usage summary/detail split.

### Query parameters

| Param | Default | Notes |
| --- | --- | --- |
| `year`, `month` | required | Same `parse_year_month` validation as existing usage API |
| `outcome` | `tool_limit_exceeded` | v1 fixed default; future: comma-separated or `all` |
| `feature` | `telegram_query` | v1 default; `all` later |
| `page` | `1` | |
| `page_size` | `25` | max `100` |

Filter `created_at` to UTC calendar month bounds (consistent with `reporting.py`).

### Response

```json
{
  "year": 2026,
  "month": 6,
  "total_count": 42,
  "page": 1,
  "page_size": 25,
  "summary": {
    "failure_count": 42,
    "organizations_affected": 5,
    "by_org": [
      { "organization_id": 1, "name": "Demo School", "count": 7 }
    ]
  },
  "items": [
    {
      "id": 123,
      "created_at": "2026-06-15T10:22:00Z",
      "organization_id": 1,
      "organization_name": "Demo School",
      "user_id": 55,
      "user_display_name": "Jane Doe",
      "user_email": "jane@example.com",
      "feature": "telegram_query",
      "channel_key": "telegram:987654",
      "prompt": "How many students are in every course this term?",
      "response_text": "I could not complete that request within the tool limit.",
      "tool_iterations": 5,
      "tool_calls": [{ "name": "search_courses", "ok": true, "error": "" }],
      "model": "gemini-3.1-flash-lite",
      "total_tokens": 12400,
      "latency_ms": 8200,
      "source": "live"
    }
  ]
}
```

**User resolution:** batch-fetch users from tenant schema by `user_id` (same approach
as `build_org_detail` user ranking in `app_ai/reporting.py`). Deleted users →
`display_name: "User #{id}"`, empty email.

**Reporting helper:** `build_failures_list(...)` in `app_ai/reporting.py` (or
`request_log_reporting.py` if reporting.py grows too large).

---

## 6. Frontend

### Routes

| URL | Purpose |
| --- | --- |
| `/organizations/ai-usage/failures` | Cross-tenant tool-limit failures |
| `/organizations/[id]/ai-usage/failures` | Single-org failures |

No new sidebar item. Add **tab switcher** on both overview and org detail AI
Usage pages:

```
[ Overview ]   [ Tool limit failures ]
```

Overview tab links to `/organizations/ai-usage?date=…`. Failures tab links to
`/organizations/ai-usage/failures?date=…`. Org detail mirrors with `[id]` prefix.

### Page layout

Reuse existing patterns: `PageContainer width="wide"`, `YearMonthSelector`,
React Query, shadcn `Card` + `Table`.

**Summary cards (failures page):**

- Failures this month (count)
- Organizations affected
- Most affected org (name + count; overview only)

**Table columns:**

| Column | Notes |
| --- | --- |
| When | Localized datetime |
| Organization | Overview only; link to org failures tab |
| User | Display name |
| Question | Prompt truncated ~120 chars |
| Tools | Badge per tool name from `tool_calls` |
| Iterations | `tool_iterations` |
| Tokens | Formatted with existing `formatAiTokens` |

**Row expand:** inline accordion showing full prompt, full `tool_calls` JSON,
response text. Backfilled rows (`source=backfill`) show badge
**Historical (no tool detail)** when `tool_calls` is empty.

### Client API & types

Extend `src/app/client-api/ai-usage.ts`:

- `fetchAiUsageFailures(params)`
- `fetchOrgAiUsageFailures(orgId, params)`

Add Zod schemas to `src/types/ai-usage.ts`.

### Route permissions

```typescript
{ prefix: "/organizations/ai-usage/failures", anyOf: ["ai.usage.view"] },
```

`org-route-access.ts`:

```typescript
if (pathname.startsWith("/organizations/ai-usage")) {
  return false;  // already excludes /organizations/ai-usage/failures
}
```

Org detail failures covered by existing `/organizations/` prefix rule.

---

## 7. Error handling

| Case | Behavior |
| --- | --- |
| No failures in month | Empty table + copy: "No tool limit failures this month." |
| Backfilled row | Tools column shows "—"; expand shows historical badge |
| User deleted | `"User #55"` display name |
| No permission | Middleware redirect; client guard same as overview |
| API failure | Error card + retry button |

---

## 8. Out of scope (v1)

- Full request log explorer (all outcomes / features via UI filters)
- CSV export
- Real-time / websocket updates
- Org-admin self-service failures view
- Alerting on failure spikes
- Changing `ai_max_tool_iterations` from failures page

---

## 9. Future: full request log explorer

The same `AIRequestLog` table and list endpoints become the foundation:

1. Add `outcome=all` and `feature=all` query params.
2. Replace tab label with **Request log**; add filter bar (outcome, feature, user).
3. Optionally link each row to related `AIUsageLog` iteration rows by timestamp
   + tenant + user (no FK required in v1).

No schema migration needed for this upgrade.

---

## 10. Testing

### Backend

- `AIRequestLog` model migration applies cleanly.
- `generate_with_tools` sets `outcome=tool_limit_exceeded` when loop exhausts.
- `AIService.run()` writes one log row per turn (success, tool limit, blocked).
- `GET platform/ai-usage/failures` — pagination, month filter, default outcome filter.
- `GET organizations/{id}/ai-usage/failures` — org scoping, permissions.
- Backfill command — dry-run, dedupe, truncates prompt.

### Frontend

- `route-permissions.test.ts` — `/organizations/ai-usage/failures`.
- `org-route-access.test.ts` — not a cross-tenant org management path.
- Failures page renders summary + table; tab navigation preserves `date` query param.

---

## 11. Implementation checklist

### Backend

- [ ] Add `AIRequestLog` model + migration
- [ ] Extend `AIResult`; tool-limit outcome in `GeminiClient`
- [ ] `record_request_log()` + wire in `AIService.run()`
- [ ] `build_failures_list()` reporting helper
- [ ] `PlatformAIUsageFailuresView` + `OrganizationAIUsageFailuresView`
- [ ] URL registration
- [ ] `backfill_ai_request_logs_from_telegram` management command
- [ ] Tests

### Frontend

- [ ] Types + client API
- [ ] Tab component shared between overview/org detail
- [ ] `/organizations/ai-usage/failures` page
- [ ] `/organizations/[id]/ai-usage/failures` page
- [ ] Route permissions + tests
