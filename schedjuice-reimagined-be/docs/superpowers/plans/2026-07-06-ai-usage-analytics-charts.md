# AI Usage & Requests Analytics Charts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shared four-chart analytics strip on org AI Usage and Requests panes, with cross-tenant platform analytics and an organization filter on the platform profile AI section.

**Architecture:** New `build_ai_usage_analytics()` aggregates `AIRequestLog` + `AIUsageLog` (+ `AITenantUsageMonthly` for monthly cost). Two GET analytics endpoints. Frontend shared `AiAnalyticsSection` uses Recharts via existing `ChartContainer`; channel filter hoisted to `org-ai-section` via `?feature=`.

**Tech Stack:** Django/DRF, django-tenant-schemas, PostgreSQL `TruncDate`, Next.js App Router, TanStack Query, nuqs, Recharts, Zod.

**Spec:** `docs/superpowers/specs/2026-07-06-ai-usage-analytics-charts-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/reporting.py` | `build_ai_usage_analytics()`, helpers for daily zero-fill, monthly trend, top users |
| `app_ai/usage_views.py` | `PlatformAIUsageAnalyticsView` |
| `app_ai/urls.py` | `platform/ai-usage/analytics` route |
| `app_organization/views.py` | `OrganizationAIUsageAnalyticsView` |
| `app_organization/urls.py` | `organizations/<id>/ai-usage/analytics` route |
| `app_ai/tests/test_analytics_reporting.py` | Aggregation unit tests |
| `app_ai/tests/test_analytics_api.py` | API permission + response tests |
| `schedjuice-reimagined-fe/src/types/ai-usage-analytics.ts` | Zod schemas + TS types |
| `schedjuice-reimagined-fe/src/types/__tests__/ai-usage-analytics.test.ts` | Schema parse tests |
| `schedjuice-reimagined-fe/src/app/client-api/ai-usage.ts` | `fetchPlatformAiUsageAnalytics`, `fetchOrgAiUsageAnalytics` |
| `schedjuice-reimagined-fe/src/components/org/ai/ai-analytics-section.tsx` | Filter bar + chart grid |
| `schedjuice-reimagined-fe/src/components/org/ai/charts/daily-activity-chart.tsx` | Composed bar + line |
| `schedjuice-reimagined-fe/src/components/org/ai/charts/outcome-mix-chart.tsx` | Donut with click handler |
| `schedjuice-reimagined-fe/src/components/org/ai/charts/monthly-trend-chart.tsx` | Multi-line dual axis |
| `schedjuice-reimagined-fe/src/components/org/ai/charts/top-users-chart.tsx` | Horizontal bars |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-section.tsx` | Hoist `?feature=` + `?tenant=` |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-usage-pane.tsx` | Render analytics; remove `UsageTrendBars` card |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-requests-pane.tsx` | Render analytics + outcome click |

---

## Conventions

- **BE tests:** Always run with `--keepdb --noinput`:
  ```bash
  cd schedjuice-reimagined-be
  ./scripts/run_backend_tests.sh app_ai.tests.test_analytics_reporting
  ./scripts/run_backend_tests.sh app_ai.tests.test_analytics_api
  ```
- **BE test setup:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="enforce")`, `admin_schema = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData` (copy from `test_requests_api.py`).
- **FE tests:** `cd schedjuice-reimagined-fe && pnpm test -- ai-usage-analytics`
- **Chart reference:** `src/app/(internal)/organizations/user-activity/login-activity/page.tsx` for `ChartContainer` + Recharts line chart pattern.
- **Tenant filter visibility:** Show when `canAccessPlatformOrganizations(ctx.viewer, ctx.tenant)` AND `orgRecordBasePath(mode, orgId) === "/organizations/profile"`. Hide on `/organizations/[id]`.

---

## Task 1: Analytics reporting — daily + outcome totals

**Files:**
- Modify: `app_ai/reporting.py`
- Create: `app_ai/tests/test_analytics_reporting.py`

- [ ] **Step 1: Write failing tests for daily zero-fill and outcome totals**

```python
# app_ai/tests/test_analytics_reporting.py
from datetime import datetime, timezone
from app_ai.reporting import build_ai_usage_analytics
from app_ai.models import AIRequestLog

def test_daily_zero_fills_inactive_days(self):
    # Seed one log on 2026-07-10 only
    payload = build_ai_usage_analytics(
        year=2026, month=7, feature="telegram_query", tenant_id=self.org.id
    )
    self.assertEqual(len(payload["daily"]), 31)
    day10 = next(d for d in payload["daily"] if d["date"] == "2026-07-10")
    self.assertEqual(day10["request_count"], 1)
    day01 = next(d for d in payload["daily"] if d["date"] == "2026-07-01")
    self.assertEqual(day01["request_count"], 0)

def test_outcome_totals_match_logs(self):
    payload = build_ai_usage_analytics(
        year=2026, month=7, feature="telegram_query", tenant_id=self.org.id
    )
    self.assertEqual(payload["outcome_totals"]["success"], 1)
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_analytics_reporting.AIUsageAnalyticsReportingTests.test_daily_zero_fills_inactive_days -v 2`

- [ ] **Step 3: Implement `build_ai_usage_analytics` skeleton + daily + outcome**

Add to `app_ai/reporting.py`:

```python
from calendar import monthrange
from django.db.models import Count, Sum, Q
from django.db.models.functions import TruncDate

def _tenant_filter(tenant_id: int | None) -> dict:
    return {"tenant_id": tenant_id} if tenant_id is not None else {}

def _daily_series(*, year, month, feature, tenant_id) -> list[dict]:
    start, end = _month_bounds_utc(year, month)
    qs = AIRequestLog.objects.filter(
        created_at__gte=start,
        created_at__lt=end,
        **_requests_feature_filter(feature),
        **_tenant_filter(tenant_id),
    )
    grouped = {
        row["day"].strftime("%Y-%m-%d"): row
        for row in qs.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(
            request_count=Count("id"),
            success_count=Count("id", filter=Q(outcome=AIRequestLog.Outcome.SUCCESS)),
            total_tokens=Sum("total_tokens"),
        )
    }
    days_in_month = monthrange(year, month)[1]
    daily = []
    for day_num in range(1, days_in_month + 1):
        key = f"{year:04d}-{month:02d}-{day_num:02d}"
        row = grouped.get(key, {})
        daily.append({
            "date": key,
            "request_count": row.get("request_count") or 0,
            "success_count": row.get("success_count") or 0,
            "total_tokens": row.get("total_tokens") or 0,
            "total_cost_usd": "0",  # Task 2
        })
    return daily

def build_ai_usage_analytics(
    *,
    year: int,
    month: int,
    feature: str = DEFAULT_REQUESTS_FEATURE,
    tenant_id: int | None = None,
) -> dict[str, Any]:
    if feature not in (*USER_FACING_FEATURES, REQUESTS_FEATURE_ALL):
        raise ValueError(f"Invalid feature: {feature}")
    start, end = _month_bounds_utc(year, month)
    base_qs = AIRequestLog.objects.filter(
        created_at__gte=start,
        created_at__lt=end,
        **_requests_feature_filter(feature),
        **_tenant_filter(tenant_id),
    )
    by_outcome = _count_by_outcome(base_qs)
    return {
        "year": year,
        "month": month,
        "feature": feature,
        "tenant_id": tenant_id,
        "daily": _daily_series(year=year, month=month, feature=feature, tenant_id=tenant_id),
        "outcome_totals": by_outcome,
        "monthly_trend": [],  # Task 2
        "top_users": [],      # Task 2
    }
```

- [ ] **Step 4: Run tests — expect PASS for Task 1 tests**

- [ ] **Step 5: Commit**

```bash
git add app_ai/reporting.py app_ai/tests/test_analytics_reporting.py
git commit -m "feat(ai): add analytics reporting daily series and outcome totals"
```

---

## Task 2: Analytics reporting — cost, monthly trend, top users

**Files:**
- Modify: `app_ai/reporting.py`
- Modify: `app_ai/tests/test_analytics_reporting.py`

- [ ] **Step 1: Write failing tests**

```python
def test_monthly_trend_six_months_oldest_first(self):
    payload = build_ai_usage_analytics(year=2026, month=7, tenant_id=self.org.id)
    self.assertEqual(len(payload["monthly_trend"]), 6)
    self.assertEqual(payload["monthly_trend"][0]["month"], 2)
    self.assertEqual(payload["monthly_trend"][-1]["month"], 7)

def test_top_users_ordered_by_request_count(self):
    # seed 2 users with different counts
    payload = build_ai_usage_analytics(year=2026, month=7, tenant_id=self.org.id)
    self.assertLessEqual(len(payload["top_users"]), 8)
    if len(payload["top_users"]) >= 2:
        self.assertGreaterEqual(
            payload["top_users"][0]["request_count"],
            payload["top_users"][1]["request_count"],
        )

def test_daily_cost_merged_from_usage_log(self):
    # seed AIUsageLog on same day as request
    payload = build_ai_usage_analytics(year=2026, month=7, tenant_id=self.org.id)
    day10 = next(d for d in payload["daily"] if d["date"] == "2026-07-10")
    self.assertNotEqual(day10["total_cost_usd"], "0")
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement**

Add helpers:

```python
def _merge_daily_cost(*, year, month, tenant_id, daily: list[dict]) -> list[dict]:
    start, end = _month_bounds_utc(year, month)
    cost_by_day = {
        row["day"].strftime("%Y-%m-%d"): row["total_cost_usd"]
        for row in AIUsageLog.objects.filter(
            created_at__gte=start,
            created_at__lt=end,
            **_tenant_filter(tenant_id),
        )
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total_cost_usd=Sum("billed_cost_usd"))
    }
    for row in daily:
        row["total_cost_usd"] = _decimal_str(cost_by_day.get(row["date"]) or Decimal("0"))
    return daily

def _monthly_trend_series(*, year, month, feature, tenant_id) -> list[dict]:
    trend = []
    for y, m in iter_months_ending(year, month, 6):
        start, end = _month_bounds_utc(y, m)
        qs = AIRequestLog.objects.filter(
            created_at__gte=start,
            created_at__lt=end,
            **_requests_feature_filter(feature),
            **_tenant_filter(tenant_id),
        )
        request_count = qs.count()
        success_count = qs.filter(outcome=AIRequestLog.Outcome.SUCCESS).count()
        total_tokens = qs.aggregate(t=Sum("total_tokens"))["t"] or 0
        if tenant_id is not None:
            org = Organization.objects.get(id=tenant_id)
            cost = aggregate_monthly_rows(_monthly_rows_for_tenant(org, y, m))["total_cost_usd"]
        else:
            cost = _decimal_str(
                sum(
                    aggregate_monthly_rows(_monthly_rows_for_tenant(o, y, m))["total_cost_usd"]
                    for o in Organization.objects.all()
                    # OR sum AITenantUsageMonthly directly — prefer monthly table aggregate
                )
            )
        trend.append({
            "year": y,
            "month": m,
            "request_count": request_count,
            "success_count": success_count,
            "success_rate": (success_count / request_count) if request_count else 0.0,
            "total_cost_usd": cost,
            "total_tokens": total_tokens,
        })
    return trend
```

For cross-tenant cost, aggregate `AITenantUsageMonthly` in public schema:

```python
rows = AITenantUsageMonthly.objects.filter(year=y, month=m)
if tenant_id:
    rows = rows.filter(tenant_id=tenant_id)
cost = _decimal_str(sum(r.total_billed_usd for r in rows))
```

Top users:

```python
def _top_users_for_month(*, year, month, feature, tenant_id, limit=8) -> list[dict]:
    start, end = _month_bounds_utc(year, month)
    rows = list(
        AIRequestLog.objects.filter(
            created_at__gte=start,
            created_at__lt=end,
            **_requests_feature_filter(feature),
            **_tenant_filter(tenant_id),
        )
        .values("tenant_id", "user_id")
        .annotate(
            request_count=Count("id"),
            total_tokens=Sum("total_tokens"),
        )
        .order_by("-request_count", "-total_tokens")[:limit]
    )
    # Batch cost from AIUsageLog per (tenant_id, user_id)
    # Resolve names: group by tenant_id, schema_context lookup (reuse user_usage_for_month pattern)
```

Wire into `build_ai_usage_analytics` — replace empty `monthly_trend` / `top_users` and call `_merge_daily_cost`.

- [ ] **Step 4: Run full reporting test module — expect PASS**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_analytics_reporting -v 2`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ai): add analytics monthly trend, top users, and daily cost"
```

---

## Task 3: Analytics API endpoints

**Files:**
- Modify: `app_ai/usage_views.py`
- Modify: `app_ai/urls.py`
- Modify: `app_organization/views.py`
- Modify: `app_organization/urls.py`
- Create: `app_ai/tests/test_analytics_api.py`

- [ ] **Step 1: Write failing API tests**

```python
class AIUsageAnalyticsApiTests(TestCase):
    def test_org_analytics_endpoint(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/analytics",
            {"year": 2026, "month": 7, "feature": "telegram_query"},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body["isError"])
        self.assertIn("daily", body)
        self.assertEqual(len(body["daily"]), 31)

    def test_platform_analytics_all_tenants(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/platform/ai-usage/analytics",
            {"year": 2026, "month": 7},
        )
        self.assertEqual(resp.status_code, 200)

    def test_invalid_feature_returns_400(self):
        resp = self._client(self.superadmin, self.admin_schema).get(
            f"{self.api_prefix}/organizations/{self.org.id}/ai-usage/analytics",
            {"year": 2026, "month": 7, "feature": "bogus"},
        )
        self.assertEqual(resp.status_code, 400)
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Add views**

`app_ai/usage_views.py`:

```python
class PlatformAIUsageAnalyticsView(RBACView):
    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "ai.usage.view"}

    def get(self, request: Request):
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        feature = request.query_params.get("feature") or DEFAULT_REQUESTS_FEATURE
        tenant_raw = request.query_params.get("tenant_id")
        tenant_id = int(tenant_raw) if tenant_raw else None
        try:
            payload = build_ai_usage_analytics(
                year=year, month=month, feature=feature, tenant_id=tenant_id
            )
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(False, "success", payload, status=200)
```

`app_organization/views.py`:

```python
class OrganizationAIUsageAnalyticsView(RBACDetailsView):
    name = "Organization AI usage analytics"
    model = models.Organization
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresSuperadminAiUsageOrgAccess]
    required_permissions = {"GET": "ai.usage.view"}

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        feature = request.query_params.get("feature") or DEFAULT_REQUESTS_FEATURE
        try:
            payload = build_ai_usage_analytics(
                year=year, month=month, feature=feature, tenant_id=obj.id
            )
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(False, "success", payload, status=200)
```

URLs:

```python
# app_ai/urls.py
path("platform/ai-usage/analytics", usage_views.PlatformAIUsageAnalyticsView.as_view()),

# app_organization/urls.py
path(
    "organizations/<int:obj_id>/ai-usage/analytics",
    views.OrganizationAIUsageAnalyticsView.as_view(),
    name="organization-ai-usage-analytics",
),
```

- [ ] **Step 4: Run API tests — expect PASS**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_analytics_api -v 2`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ai): expose platform and org AI usage analytics endpoints"
```

---

## Task 4: Frontend types and client API

**Files:**
- Create: `schedjuice-reimagined-fe/src/types/ai-usage-analytics.ts`
- Create: `schedjuice-reimagined-fe/src/types/__tests__/ai-usage-analytics.test.ts`
- Modify: `schedjuice-reimagined-fe/src/app/client-api/ai-usage.ts`

- [ ] **Step 1: Add Zod schemas**

```typescript
// src/types/ai-usage-analytics.ts
import { z } from "zod";

export const aiUsageAnalyticsDailySchema = z.object({
  date: z.string(),
  request_count: z.number(),
  success_count: z.number(),
  total_tokens: z.number(),
  total_cost_usd: z.string(),
});

export const aiUsageAnalyticsOutcomeTotalsSchema = z.object({
  success: z.number(),
  capability_gap: z.number(),
  tool_limit_exceeded: z.number(),
  error: z.number(),
  blocked: z.number(),
  rate_limited: z.number(),
});

export const aiUsageAnalyticsMonthlyTrendSchema = z.object({
  year: z.number(),
  month: z.number(),
  request_count: z.number(),
  success_count: z.number(),
  success_rate: z.number(),
  total_cost_usd: z.string(),
  total_tokens: z.number(),
});

export const aiUsageAnalyticsTopUserSchema = z.object({
  user_id: z.number().nullable(),
  display_name: z.string(),
  email: z.string(),
  request_count: z.number(),
  total_cost_usd: z.string(),
  total_tokens: z.number(),
});

export const aiUsageAnalyticsSchema = z.object({
  year: z.number(),
  month: z.number(),
  feature: z.string(),
  tenant_id: z.number().nullable(),
  daily: z.array(aiUsageAnalyticsDailySchema),
  outcome_totals: aiUsageAnalyticsOutcomeTotalsSchema,
  monthly_trend: z.array(aiUsageAnalyticsMonthlyTrendSchema),
  top_users: z.array(aiUsageAnalyticsTopUserSchema),
});

export type AiUsageAnalytics = z.infer<typeof aiUsageAnalyticsSchema>;
```

- [ ] **Step 2: Schema test with fixture JSON**

- [ ] **Step 3: Add fetch helpers**

```typescript
type AnalyticsParams = MonthParams & {
  feature?: "telegram_query" | "ai_query" | "all";
  tenant_id?: number | null;
};

export async function fetchOrgAiUsageAnalytics(
  orgId: number | string,
  params: AnalyticsParams,
): Promise<AiUsageAnalytics> {
  const res = await axiosClient.get(`organizations/${orgId}/ai-usage/analytics`, { params });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) throw new Error(message ?? "Failed to load AI analytics");
  return aiUsageAnalyticsSchema.parse(payload);
}

export async function fetchPlatformAiUsageAnalytics(
  params: AnalyticsParams,
): Promise<AiUsageAnalytics> {
  const res = await axiosClient.get("platform/ai-usage/analytics", { params });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) throw new Error(message ?? "Failed to load AI analytics");
  return aiUsageAnalyticsSchema.parse(payload);
}
```

- [ ] **Step 4: Run `pnpm test -- ai-usage-analytics` — expect PASS**

- [ ] **Step 5: Commit**

---

## Task 5: Chart components

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/org/ai/charts/daily-activity-chart.tsx`
- Create: `schedjuice-reimagined-fe/src/components/org/ai/charts/outcome-mix-chart.tsx`
- Create: `schedjuice-reimagined-fe/src/components/org/ai/charts/monthly-trend-chart.tsx`
- Create: `schedjuice-reimagined-fe/src/components/org/ai/charts/top-users-chart.tsx`

- [ ] **Step 1: `DailyActivityChart`** — `ComposedChart` with `Bar` (request_count) + `Line` (Number(total_cost_usd)), dual YAxis, `ChartTooltipContent`, x tick format `d MMM`.

- [ ] **Step 2: `OutcomeMixChart`** — `PieChart` + `Pie` with `innerRadius` donut; map outcome keys to `--chart-*` colors; center text `{total} requests · {successRate}% success`; optional `onSliceClick(outcome)`.

- [ ] **Step 3: `MonthlyTrendChart`** — `LineChart` with three `Line` series; right YAxis for `success_rate * 100`; x label `{month}/{year}`.

- [ ] **Step 4: `TopUsersChart`** — `BarChart` layout="vertical"; `YAxis type="category" dataKey="display_name"`; truncate long names in tick formatter.

- [ ] **Step 5: Each chart accepts `data` + `emptyMessage="No AI activity for this month"` when all zeros.**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(fe): add AI analytics chart components"
```

---

## Task 6: `AiAnalyticsSection` shell

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/org/ai/ai-analytics-section.tsx`

- [ ] **Step 1: Props**

```typescript
export type AiAnalyticsSectionProps = {
  scope: "org" | "platform";
  orgId?: string | number;
  monthDate: Date;
  feature: "telegram_query" | "ai_query" | "all";
  onFeatureChange: (feature: "telegram_query" | "ai_query" | "all") => void;
  showTenantFilter: boolean;
  tenantId: number | null;
  onTenantChange: (tenantId: number | null) => void;
  tenantOptions: { id: number; name: string }[];
  onOutcomeSelect?: (outcome: RequestsOutcomeFilter) => void;
};
```

- [ ] **Step 2: React Query**

```typescript
const analyticsQuery = useQuery({
  queryKey: [
    "aiUsageAnalytics",
    scope,
    orgId ?? tenantId ?? "all",
    year,
    month,
    feature,
  ],
  queryFn: () =>
    scope === "platform" && showTenantFilter && tenantId == null
      ? fetchPlatformAiUsageAnalytics({ year, month, feature })
      : scope === "platform" && tenantId != null
        ? fetchPlatformAiUsageAnalytics({ year, month, feature, tenant_id: tenantId })
        : fetchOrgAiUsageAnalytics(orgId!, { year, month, feature }),
});
```

- [ ] **Step 3: Render 2×2 `Card` grid with skeletons while loading; error card with Retry button.**

- [ ] **Step 4: Channel `Select` in filter row (same options as Requests pane).**

- [ ] **Step 5: Organization `Select` when `showTenantFilter` — options: "All organizations" (value `all`) + tenant list.**

- [ ] **Step 6: Commit**

---

## Task 7: Hoist filters in `org-ai-section`

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-section.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-usage-pane.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/sections/org-ai-requests-pane.tsx`

- [ ] **Step 1: Add nuqs state in `org-ai-section.tsx`**

```typescript
const [feature, setFeature] = useQueryState(
  "feature",
  parseAsString.withDefault("telegram_query"),
);
const [tenant, setTenant] = useQueryState("tenant", parseAsString.withDefault("all"));

const showTenantFilter =
  canAccessPlatformOrganizations(ctx.viewer, ctx.tenant) &&
  orgRecordBasePath(mode, orgId) === "/organizations/profile";

const tenantId = tenant === "all" ? null : Number(tenant);
```

- [ ] **Step 2: Fetch org list for tenant dropdown when `showTenantFilter`**

```typescript
const summaryQuery = useQuery({
  queryKey: ["aiUsageSummary", year, month],
  enabled: showTenantFilter && (pane === "usage" || pane === "requests"),
  queryFn: () => fetchAiUsageSummary({ year, month }),
});
const tenantOptions = summaryQuery.data?.organizations.map((o) => ({
  id: o.organization_id,
  name: o.name,
})) ?? [];
```

- [ ] **Step 3: Pass shared props to Usage and Requests panes; remove duplicate channel `Select` from `org-ai-requests-pane.tsx`.**

- [ ] **Step 4: Render `<AiAnalyticsSection />` at top of Usage and Requests pane content (only when `canViewUsage`).**

- [ ] **Step 5: Requests pane — wire `onOutcomeSelect` to `setOutcome` + `setPage(1)`.**

- [ ] **Step 6: Usage pane — remove `UsageTrendBars` import and the 6-month trend `Card` block (lines ~168–176 in `org-ai-usage-pane.tsx`).**

- [ ] **Step 7: Manual smoke test**

1. Open `/organizations/profile?section=ai&pane=requests`
2. Confirm four charts load, tenant filter visible, channel filter works
3. Open `/organizations/{id}?section=ai&pane=usage` — no tenant filter, charts scoped to org
4. Click outcome donut segment on Requests — table filters

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(fe): wire AI analytics charts into Usage and Requests panes"
```

---

## Task 8: Cleanup and verification

- [ ] **Step 1: Confirm `UsageTrendBars` still exported only if used elsewhere — grep; delete file if unused.**

- [ ] **Step 2: Run full backend AI test slice**

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_analytics_reporting app_ai.tests.test_analytics_api app_ai.tests.test_requests_api -v 2
```

- [ ] **Step 3: Run FE tests**

```bash
cd schedjuice-reimagined-fe && pnpm test -- ai-usage-analytics
```

- [ ] **Step 4: Final commit if any cleanup**

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Dedicated analytics API | Task 3 |
| Daily activity chart | Tasks 1, 5 |
| Outcome mix + click filter | Tasks 5, 7 |
| 6-month trend (replaces CSS bars) | Tasks 2, 5, 7 |
| Top users chart | Task 2, 5 |
| Shared strip on Usage + Requests | Task 7 |
| Platform tenant filter | Tasks 6, 7 |
| Channel filter hoisted | Task 7 |
| KPI cards + tables unchanged | Task 7 (no table changes) |
| Failures tab out of scope | — |
| Empty states | Task 5, 6 |

---

## Execution handoff

Plan complete and saved to `schedjuice-reimagined-be/docs/superpowers/plans/2026-07-06-ai-usage-analytics-charts.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach?
