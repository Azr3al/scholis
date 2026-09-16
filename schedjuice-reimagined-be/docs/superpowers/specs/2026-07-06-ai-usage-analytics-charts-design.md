# AI Usage & Requests Analytics Charts — Design Spec

**Date:** 2026-07-06  
**Status:** Approved (brainstorming)  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Approach:** Dedicated analytics API (Approach A)

## 1. Summary

Add a shared **analytics chart strip** to the org AI **Usage** and **Requests** panes, plus
cross-tenant analytics on the **platform profile** AI section with an **organization filter**.
Charts balance three goals equally: **adoption** (volume, top users), **health** (outcomes,
success rate), and **cost** (USD, tokens).

Four charts:

1. **Daily activity** — requests per day in the selected month (cost overlay)
2. **Outcome mix** — breakdown of all request outcomes for the month
3. **6-month trend** — requests, success rate %, and cost over time
4. **Top users** — top 8 users by request count (with cost in tooltip)

Existing KPI cards and data tables stay unchanged below the charts.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Goals | Adoption + health + cost (equal weight) |
| Chart delivery | New dedicated analytics endpoints |
| Org panes | Same chart strip on **Usage** and **Requests** (shared component) |
| Platform | Cross-tenant analytics with **tenant filter** dropdown |
| Tenant filter visibility | Platform profile AI section only (`mode=platform` on own org record) |
| Specific org record | No tenant filter — scoped to that org |
| Channel filter | Reuse `telegram_query \| ai_query \| all` (same as Requests table) |
| Chart library | Recharts via existing `ChartContainer` (login-activity pattern) |
| Usage 6-month CSS bars | Replaced by Recharts trend chart in analytics strip; legacy `UsageTrendBars` card removed from Usage pane |
| Outcome chart interaction | Click segment → set Requests outcome filter (Requests pane only) |
| Failures tab | Out of scope (separate work) |

---

## 2. Problem

Today:

- **Usage** pane has monthly KPI cards, CSS 6-month cost bars, by-model table, and top spenders —
  no daily patterns, no success-rate view, no outcome visibility.
- **Requests** pane has four summary KPI cards and a paginated table — **no charts or trends**.
- **Platform** has `GET platform/ai-usage/summary` and list endpoints for failures/requests, but
  no aggregated chart payloads and no tenant filter in the UI.
- List APIs return only point-in-time `summary.by_outcome` counts for the selected month — not
  daily series or multi-month outcome trends.

Admins cannot answer at a glance: Is volume growing? Is the assistant succeeding? Where is spend
going? Who uses it most?

---

## 3. Layout

### 3.1 Filter bar

Shared across charts (inside `AiAnalyticsSection`):

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Month ▼ Jul 2026]  [Channel ▼ Telegram]  [Organization ▼ All]    │
└─────────────────────────────────────────────────────────────────────┘
```

| Control | Org record (`/organizations/[id]`) | Platform profile (`/organizations/profile`) |
| --- | --- | --- |
| Month | `YearMonthSelector` + `?date=` (existing) | Same |
| Channel | `telegram_query` (default), `ai_query`, `all` | Same |
| Organization | Hidden | Dropdown: **All organizations** + org list |

**Organization filter (platform only):**

- Default: **All organizations** — aggregate across all tenants with AI activity
- Single org selected — same data as that org's analytics endpoint
- URL param: `?tenant=123` (omit or `tenant=all` for cross-tenant)
- Org list source: organizations from `GET platform/ai-usage/summary` for the selected month
  (reuse React Query cache key `["aiUsageSummary", year, month]`)

When viewing a **specific org record** as platform admin (`/organizations/[id]?section=ai`), the
tenant filter is hidden; analytics use the org endpoint for that `id`.

### 3.2 Chart grid

Two rows × two columns on `md+`; stacked on mobile.

```
┌─ Daily activity ────────────────┬─ Outcome mix ─────────────────────┐
│  Bar: requests/day              │  Stacked horizontal bar or donut  │
│  Line overlay: daily cost USD   │  6 outcome categories             │
└─────────────────────────────────┴───────────────────────────────────┘
┌─ 6-month trend ─────────────────┬─ Top users ───────────────────────┐
│  Lines: requests, success %,    │  Horizontal bars, top 8         │
│         cost USD                │  by request_count                 │
└─────────────────────────────────┴───────────────────────────────────┘

┌─ Existing KPI cards (unchanged) ─────────────────────────────────────┐
┌─ Existing tables (unchanged) ────────────────────────────────────────┐
```

### 3.3 Pane integration

| Pane | Charts | Notes |
| --- | --- | --- |
| Usage | `<AiAnalyticsSection scope="org" orgId={…} />` | Remove standalone `UsageTrendBars` card (superseded by 6-month trend chart) |
| Requests | Same component | Outcome chart segments wire to `?outcome=` filter |
| Settings | None | Unchanged |
| Failures | None | Out of scope |

On platform profile, pass `scope="platform"` and show organization filter.

---

## 4. Charts (detail)

### 4.1 Daily activity

- **Type:** Composed chart — bars (requests) + line (cost USD)
- **X-axis:** Calendar days in selected month (UTC), zero-filled for inactive days
- **Y-axis left:** Request count; **Y-axis right:** Cost USD
- **Tooltip:** date, request_count, success_count, total_tokens, total_cost_usd
- **Goals:** Adoption (volume), health (success_count in tooltip), cost (line)

### 4.2 Outcome mix

- **Type:** Donut or horizontal stacked bar (implementer picks; donut preferred for ≤6 segments)
- **Segments:** success, capability_gap, tool_limit_exceeded, error, blocked, rate_limited
- **Colors:** Match existing `RequestOutcomeBadge` semantic colors / `--chart-1`…`5` + muted variants
- **Center label (donut):** total request_count + success rate %
- **Interaction (Requests pane only):** clicking a segment sets `?outcome=<value>` and resets `?page=1`
- **Goals:** Health

### 4.3 6-month trend

- **Type:** Multi-line chart with dual Y-axes
- **X-axis:** Last 6 calendar months ending at selected month (inclusive), same window as existing usage trend
- **Lines:**
  - `request_count` (left axis, solid)
  - `success_rate` 0–1 displayed as % (right axis, dashed)
  - `total_cost_usd` (left axis, dotted)
- **Legend:** Toggle lines (login-activity pattern)
- **Goals:** Adoption + health + cost

### 4.4 Top users

- **Type:** Horizontal bar chart
- **Data:** Top 8 users by `request_count`, tie-break `total_cost_usd` desc
- **Y-axis:** display_name (truncate with tooltip for full name + email)
- **X-axis:** request_count
- **Tooltip:** request_count, total_cost_usd, total_tokens
- **Goals:** Adoption (+ cost in tooltip)

---

## 5. Backend API

### 5.1 Endpoints

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/v1/platform/ai-usage/analytics` | `ai.usage.view` + platform admin tenant |
| `GET` | `/api/v1/organizations/{id}/ai-usage/analytics` | `ai.usage.view` + platform admin tenant **or** `{id}` equals request tenant (future org admin) |

Register in `app_ai/urls.py` and org URL pattern alongside existing ai-usage routes.

### 5.2 Query parameters

| Param | Default | Notes |
| --- | --- | --- |
| `year` | current UTC year | Selected month |
| `month` | current UTC month | 1–12 |
| `feature` | `telegram_query` | `telegram_query`, `ai_query`, or `all` |
| `tenant_id` | — | **Platform endpoint only.** Omit = all tenants. Integer = single org. |

Org endpoint ignores `tenant_id`; scope is always `{id}`.

### 5.3 Response shape

```json
{
  "year": 2026,
  "month": 7,
  "feature": "telegram_query",
  "tenant_id": null,
  "daily": [
    {
      "date": "2026-07-01",
      "request_count": 12,
      "success_count": 8,
      "total_tokens": 450000,
      "total_cost_usd": "0.05230000"
    }
  ],
  "outcome_totals": {
    "success": 51,
    "capability_gap": 30,
    "tool_limit_exceeded": 13,
    "error": 2,
    "blocked": 3,
    "rate_limited": 1
  },
  "monthly_trend": [
    {
      "year": 2026,
      "month": 2,
      "request_count": 80,
      "success_count": 60,
      "success_rate": 0.75,
      "total_cost_usd": "0.50000000",
      "total_tokens": 1200000
    }
  ],
  "top_users": [
    {
      "user_id": 42,
      "display_name": "Soe Sandar Moe",
      "email": "jane@school.edu",
      "request_count": 24,
      "total_cost_usd": "0.45000000",
      "total_tokens": 980000
    }
  ]
}
```

All USD fields are decimal strings (existing convention). `success_rate` is float 0–1.

### 5.4 Aggregation

Implement `build_ai_usage_analytics(...)` in `app_ai/reporting.py`.

**Filters (all queries):**

- UTC month bounds via `_month_bounds_utc(year, month)` for daily/outcome/top_users
- `feature` via existing `_requests_feature_filter(feature)`
- `tenant_id` filter on `AIRequestLog.tenant_id` / `AIUsageLog.tenant_id` when set; omit for all tenants

**Daily series** — from `AIRequestLog`:

- Group by `TruncDate('created_at', tz=UTC)` (Django `TruncDate`)
- Annotate: `Count('id')` as request_count, conditional count for success outcome, `Sum('total_tokens')`
- Daily cost: separate query on `AIUsageLog` grouped by date (`Sum('billed_cost_usd')`), merged into daily rows by date key
- Zero-fill all calendar days in the month

**Outcome totals** — from `AIRequestLog` for the full month (reuse `_count_by_outcome` logic)

**Monthly trend (6 months)** — from `AIRequestLog`:

- For each month in `iter_months_ending(year, month, 6)`:
  - request_count, success_count, success_rate = success / total (0 if total is 0)
  - total_tokens from request log sum
- Cost per month:
  - Single tenant: prefer `AITenantUsageMonthly` aggregate (existing `aggregate_monthly_rows`)
  - All tenants: sum `AITenantUsageMonthly` across tenants for that month, or sum `AIUsageLog` if monthly rollup missing

**Top users** — from `AIRequestLog`:

- Group by `user_id`, order by `-request_count`, `-total_tokens`, limit 8
- Cost per user: join aggregate from `AIUsageLog` for same month/user/tenant scope
- Resolve display names via `_resolve_users_by_tenant` pattern (batch tenant schema lookup)

**Performance:** Use DB aggregation only; no Python iteration over full log tables beyond bounded top-users query.

### 5.5 Tests

Add `app_ai/tests/test_analytics_reporting.py` and `app_ai/tests/test_analytics_api.py`:

- Daily zero-fill
- Outcome totals match seeded logs
- 6-month trend ordering (oldest first)
- Platform all-tenant vs single-tenant filter
- Org endpoint scoped to org id
- Permission gates (401/403)
- Invalid year/month/feature → 400

---

## 6. Frontend

### 6.1 Types & API

| File | Purpose |
| --- | --- |
| `src/types/ai-usage-analytics.ts` | Zod schemas + TS types |
| `src/app/client-api/ai-usage.ts` | `fetchPlatformAiUsageAnalytics`, `fetchOrgAiUsageAnalytics` |

React Query keys:

- `["aiUsageAnalytics", "platform", year, month, feature, tenantId]`
- `["aiUsageAnalytics", "org", orgId, year, month, feature]`

### 6.2 Components

| File | Purpose |
| --- | --- |
| `src/components/org/ai/ai-analytics-section.tsx` | Filter bar + chart grid + loading/error states |
| `src/components/org/ai/charts/daily-activity-chart.tsx` | Daily bar + cost line |
| `src/components/org/ai/charts/outcome-mix-chart.tsx` | Donut / stacked bar |
| `src/components/org/ai/charts/monthly-trend-chart.tsx` | 6-month multi-line |
| `src/components/org/ai/charts/top-users-chart.tsx` | Horizontal bars |

**Props for `AiAnalyticsSection`:**

```typescript
type AiAnalyticsSectionProps = {
  scope: "org" | "platform";
  orgId?: string | number;
  mode: OrgRecordMode;
  monthDate: Date;
  feature: "telegram_query" | "ai_query" | "all";
  onFeatureChange?: (feature: ...) => void;
  onOutcomeSelect?: (outcome: RequestsOutcomeFilter) => void; // Requests pane only
};
```

Channel filter is hoisted to `org-ai-section` via shared `?feature=` query param (`nuqs`, default
`telegram_query`) so Usage and Requests panes and analytics stay in sync when switching tabs.
`AiAnalyticsSection` receives `feature` + `onFeatureChange` from the parent section shell.

### 6.3 Pane changes

- `org-ai-usage-pane.tsx` — render `<AiAnalyticsSection />` above KPI cards; remove `UsageTrendBars` card
- `org-ai-requests-pane.tsx` — render `<AiAnalyticsSection onOutcomeSelect={…} />` above KPI cards; pass shared feature state
- `org-ai-section.tsx` — optional: hoist `feature` query param for cross-pane sync

### 6.4 Styling

- Use `ChartContainer`, `ChartTooltip`, `ChartLegend` from `@/components/ui/chart`
- Chart height: `h-[min(280px,40vh)]` per chart (match login-activity density)
- `--chart-1` through `--chart-5` for series colors; outcome segments use badge-adjacent semantic hues
- Empty state: "No AI activity for this month" (not an error)

### 6.5 Frontend tests

- Zod schema tests for analytics payload
- Optional: smoke render test for `AiAnalyticsSection` with fixture data

---

## 7. Error handling

| Case | Behavior |
| --- | --- |
| No permission | Existing pane guards unchanged |
| No data for month | Empty chart states; KPI cards show 0 |
| Analytics API failure | Error card with retry inside chart grid; KPI cards + table still load independently |
| Unknown user in top users | display_name fallback `"User #{id}"` or `"Unknown user"` |
| Platform tenant filter + org with no data | Valid empty response |

---

## 8. Out of scope (v1)

- Failures tab charts
- Hourly / heatmap views
- CSV export
- Top-users bar click → filter table by user
- New platform route tree (`/organizations/ai-usage`) — platform entry remains profile AI section
- Org-admin self-service without `ai.usage.view` (future)
- Caching layer / materialized views

---

## 9. Implementation checklist

### Backend

- [ ] `build_ai_usage_analytics()` in `reporting.py`
- [ ] `PlatformAIUsageAnalyticsView` + `OrganizationAIUsageAnalyticsView`
- [ ] URL registration
- [ ] Tests (`test_analytics_reporting.py`, `test_analytics_api.py`)

### Frontend

- [ ] Types + client API functions
- [ ] Four chart components + `AiAnalyticsSection`
- [ ] Wire into Usage and Requests panes; remove legacy `UsageTrendBars` card
- [ ] Platform organization filter on profile AI section
- [ ] Hoist shared `feature` query param in `org-ai-section`
- [ ] Schema unit tests

---

## 10. Future enhancements

- Hoist analytics above pane tabs (show once for Usage/Requests/Failures)
- Top-users click → filter requests table
- Failures tab: likely-cause and capability-gap trend charts
- Dedicated `/organizations/ai-usage` platform overview page with org ranking table + analytics
