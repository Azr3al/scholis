# AI Cached Token Usage UI — Design Spec

**Date:** 2026-06-27  
**Status:** Approved (brainstorming)  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Extends:** [AI Usage Dashboard](2026-06-27-ai-usage-dashboard-design.md)

## 1. Summary

Expose **cached input token usage metrics** on the existing AI Usage surfaces. Users
with `ai.usage.view` (platform) or `ai.usage.view_all` / `ai.usage.view_own`
(user panel) see how much input was served from Gemini context cache, the **cache
hit rate**, and **estimated cost savings** vs billing those tokens at full input
rates.

This is a **usage/billing visibility** feature — not live Gemini cache health
(Redis cache entries, TTL, blocked signatures). Operational cache debugging
remains log-only.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Scope | **B** — usage metrics for `cached_input_tokens`, not live cache status |
| Surfaces | **A** — extend existing AI Usage pages (platform overview, org detail, user record panel) |
| Metrics (summary) | Cached token count, cache hit rate, estimated savings (USD) |
| Top spenders table | Cached tokens + hit rate **only** — no per-user savings column |
| Trend | Include cache metrics on **6-month trend** points (all surfaces that show trend) |
| Permissions | No new permission — same gates as existing AI Usage |
| API approach | **Extend existing reporting endpoints in place** (no parallel cache-metrics routes) |

---

## 2. Metrics definitions

Data already exists on `AIUsageLog` and `AITenantUsageMonthly` (`input_tokens`,
`cached_input_tokens`). Reporting does not aggregate or return these fields today.

### Cached tokens

Sum of `cached_input_tokens` for the selected scope (platform, org, user, model row).

### Cache hit rate

```
cache_hit_rate = cached_input_tokens / (input_tokens + cached_input_tokens)
```

When the denominator is `0`, return `0.0`. Stored as a float in `[0, 1]` (same
convention as `budget.used_pct`). Frontend formats as a percentage (e.g. `42.3%`).

`input_tokens` here is **fresh** prompt tokens only (not output/thinking), matching
`TokenUsage` in `app_ai/pricing.py`.

### Estimated cache savings (USD)

Per model row, using rates from `MODEL_PRICING` and `AI_BILLING_MARKUP`:

```
savings = cached_input_tokens × (input_rate − cached_rate) × markup / 1_000_000
```

Sum across models for aggregates. This is the **counterfactual** cost difference:
what those cached tokens would have cost at full input rate minus what was actually
billed for the cached portion. Uses the same pricing helpers as `compute_cost` /
`apply_billing_markup` — **computed on the backend only**.

Return `cache_savings_usd` as a decimal string (same shape as `total_cost_usd`).

---

## 3. Backend API changes

Extend payloads from existing endpoints — **no new routes**.

| Endpoint | Permission |
| --- | --- |
| `GET /api/v1/platform/ai-usage/summary` | `ai.usage.view` + platform admin tenant |
| `GET /api/v1/organizations/{id}/ai-usage` | `ai.usage.view` (+ existing org access rules) |
| `GET /api/v1/users/{user_id}/ai-usage` | `ai.usage.view_own` / `ai.usage.view_all` |

### 3.1 New shared fields on month totals

Every object that currently uses `_empty_month_totals()` / `aggregate_monthly_rows()`
gains four fields:

```json
{
  "input_tokens": 50000,
  "cached_input_tokens": 12000,
  "cache_hit_rate": 0.1935,
  "cache_savings_usd": "0.00468750"
}
```

Applied to:

- Platform `totals`
- Each org `selected_month`
- Each org `trend[]` point
- Org `month_summary`
- Org `trend[]` points
- User `month_summary`
- User `trend[]` points

### 3.2 Row-level extensions

**Org `month_summary.by_model[]`** — add all four cache fields per model (hit rate
and savings computed per model row).

**Org `users[]` (top spenders)** — add `cached_input_tokens` and `cache_hit_rate`
only. Savings omitted per locked decision #1.

**User `month_summary.by_feature[]`** — add `cached_input_tokens` and
`cache_hit_rate` only (optional display in user panel; API parity keeps shape
consistent).

### 3.3 Implementation helpers

Add to `app_ai/reporting.py` (or `app_ai/pricing.py` if cleaner):

```python
def compute_cache_metrics_for_monthly_rows(rows: list[AITenantUsageMonthly]) -> dict
def compute_cache_metrics_from_model_aggregates(
    aggregates: list[dict],  # each: model, input_tokens, cached_input_tokens
) -> dict
```

- `aggregate_monthly_rows()` calls the monthly-rows helper after summing token
  counts across models.
- User/org log-based aggregates use a **by-model sub-query** on `AIUsageLog` for
  accurate savings (multiple models per user/org), then roll up hit rate from
  totals.

### 3.4 Example trend point (extended)

```json
{
  "year": 2026,
  "month": 6,
  "total_cost_usd": "1.23456789",
  "total_tokens": 100000,
  "request_count": 42,
  "input_tokens": 45000,
  "cached_input_tokens": 12000,
  "cache_hit_rate": 0.2105,
  "cache_savings_usd": "0.00393750"
}
```

### 3.5 Backward compatibility

Additive JSON fields only. Existing clients ignore new keys. Update API tests in
`test_usage_reporting.py` and `test_usage_api.py`.

---

## 4. Frontend UI

### 4.1 Types & formatters (`src/types/ai-usage.ts`)

Extend Zod schemas:

- `aiUsageMonthTotalsSchema` — four new fields
- `aiUsageTrendPointSchema` — inherits via extend
- `aiUsageModelBreakdownSchema` — four new fields on by_model rows
- `aiUsageUserRowSchema` — `cached_input_tokens`, `cache_hit_rate` only

Add:

```typescript
export function formatCacheHitRate(rate: number): string
// e.g. (0.2105) → "21.1%"
```

Reuse `formatAiTokens` and `formatAiUsd`.

Update `ai-user-preferences.ts` user usage schema to match extended month/trend
shapes (or import shared totals schema).

### 4.2 Shared trend component

Extend or companion to `UsageTrendBars`:

- **Cost trend** (existing): billed cost bars — unchanged primary visual.
- **Cache trend row** (new): second bar strip below cost trend showing
  `cache_savings_usd` per month (or `cached_input_tokens` if savings bars are
  too flat — prefer **savings** as bar height with tooltip:
  `{month}/{year}: {savings} saved · {cached tokens} cached · {hit rate}`).

Used on platform org table mini-trend, org detail 6-month section, and user panel.

### 4.3 Platform overview — `/organizations/ai-usage`

**Summary cards** — add second row of three cards:

| Card | Value |
| --- | --- |
| Cached tokens | `totals.cached_input_tokens` |
| Cache hit rate | `formatCacheHitRate(totals.cache_hit_rate)` |
| Est. savings | `formatAiUsd(totals.cache_savings_usd)` |

**Organizations table** — new columns after Tokens:

| Column | Field |
| --- | --- |
| Cached | `selected_month.cached_input_tokens` |
| Hit rate | `selected_month.cache_hit_rate` |
| Savings | `selected_month.cache_savings_usd` |

**Mini trend** — extend inline trend to show cache savings row (tooltip includes
hit rate + cached count).

### 4.4 Org detail — `/organizations/[id]/ai-usage`

**Summary** — second row: same three cache cards as platform (org `month_summary`).

**6-month trend card** — cost bars + cache savings bars (dual row).

**By model table** — columns: Cached, Hit rate, Savings.

**Top spenders table** — columns: Cached, Hit rate (**no savings**).

### 4.5 User record panel — `AiUsagePanel`

Below existing Cost / Tokens / Requests row, compact three-stat row:

- Cached tokens
- Hit rate
- Est. savings

If `trend` is shown, add cache savings mini-trend below cost trend (same dual-row
pattern).

### 4.6 Empty / zero states

When `cached_input_tokens === 0`: show `0`, `0%`, `$0.00`. No special empty
state — cache metrics are supplementary to existing usage views.

---

## 5. Error handling

| Case | Behavior |
| --- | --- |
| No cached usage in month | Zeros in all cache fields; trend bars at minimum height |
| Unknown model in rollup | Fall back to `gemini-3.1-flash-lite` rates (same as `compute_cost`) |
| API failure | Existing React Query error + retry — no change |
| Old backend without new fields | Zod parse fails — deploy BE before FE (or make fields optional with defaults during rollout; prefer coordinated deploy) |

---

## 6. Testing

### Backend (`app_ai/tests/test_usage_reporting.py`)

- Hit rate: `12000 / (45000 + 12000) ≈ 0.2105`
- Savings: known model + token counts → assert `cache_savings_usd` against manual
  calculation with markup
- Zero-cache month → all cache fields zero
- User aggregate with two models → savings sum matches per-model breakdown
- Trend points include cache fields for each of 6 months

### Backend API tests (`test_usage_api.py`, `test_user_ai_api.py`)

- Response JSON includes new keys on summary, org detail, user detail

### Frontend

- Zod schema tests for extended shapes (if present)
- `formatCacheHitRate` unit test
- Optional snapshot of formatter output

---

## 7. Out of scope

- Live Gemini context cache status (Redis keys, expiry, blocked signatures)
- Request-level log explorer
- CSV export of cache metrics
- New permissions or nav entries
- Per-user savings in top spenders table
- Org-admin-only rollout changes (inherits future work from AI Usage dashboard spec)

---

## 8. Implementation checklist

### Backend

- [ ] `compute_cache_metrics_*` helpers using `app_ai/pricing.py` rates + markup
- [ ] Extend `aggregate_monthly_rows`, `_empty_month_totals`, all reporting builders
- [ ] User log aggregates: by-model sub-aggregation for savings
- [ ] Top spenders: cached + hit rate only
- [ ] Tests in `test_usage_reporting.py`, `test_usage_api.py`, `test_user_ai_api.py`

### Frontend

- [ ] Extend `ai-usage.ts` + `ai-user-preferences.ts` schemas and formatters
- [ ] Cache trend row component (extend `UsageTrendBars` or sibling)
- [ ] Platform overview: summary cards + table columns + trend
- [ ] Org detail: summary cards + by_model + top spenders + trend
- [ ] User `AiUsagePanel`: cache stats + trend

---

## 9. Deployment note

Ship backend first (or same release). New Zod fields are required — frontend must
not deploy against an API that omits the new keys.
