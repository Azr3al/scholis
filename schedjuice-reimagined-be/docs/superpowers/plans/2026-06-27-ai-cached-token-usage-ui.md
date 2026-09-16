# AI Cached Token Usage UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose cached input token volume, cache hit rate, and estimated savings on existing AI Usage pages (platform overview, org detail, user record panel), including 6-month trend points.

**Architecture:** Add cache metric helpers in `app_ai/pricing.py` (rates + markup) and wire them through `app_ai/reporting.py` so all three existing GET endpoints return four new fields on month totals/trends and selective row fields. Frontend extends Zod schemas, `UsageTrendBars` dual-row trend, and the three AI Usage surfaces.

**Tech Stack:** Django/DRF, django-tenant-schemas, Next.js App Router, TanStack Query, Zod, shadcn UI.

**Spec:** `docs/superpowers/specs/2026-06-27-ai-cached-token-usage-ui-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/pricing.py` | `compute_cache_savings_usd`, `cache_hit_rate` helpers |
| `app_ai/reporting.py` | Extend `_empty_month_totals`, `aggregate_monthly_rows`, builders |
| `app_ai/tests/test_usage_reporting.py` | Cache metric unit tests |
| `app_ai/tests/test_usage_api.py` | API response key assertions |
| `app_ai/tests/test_user_ai_api.py` | User usage cache key assertions |
| `schedjuice-reimagined-fe/src/types/ai-usage.ts` | Extended Zod schemas + `formatCacheHitRate` |
| `schedjuice-reimagined-fe/src/types/ai-user-preferences.ts` | Align user usage schema with shared totals |
| `schedjuice-reimagined-fe/src/types/__tests__/ai-usage.test.ts` | Formatter unit test (create if missing) |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/_components/usage-trend-bars.tsx` | Dual-row cost + cache savings trend |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/page.tsx` | Platform cache cards + table columns |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/[id]/ai-usage/page.tsx` | Org cache cards + table columns |
| `schedjuice-reimagined-fe/src/components/users/ai/ai-usage-panel.tsx` | User cache stats + trend |

---

## Conventions

- **BE tests:** `@unittest.skipUnless(_database_reachable())`, `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData`.
- **Run BE tests:** `cd schedjuice-reimagined-be && python manage.py test app_ai.tests.test_usage_reporting app_ai.tests.test_usage_api app_ai.tests.test_user_ai_api -v 2`
- **Run FE tests:** `cd schedjuice-reimagined-fe && npm test -- ai-usage`
- **Deploy order:** Backend before frontend (Zod requires new API fields).
- **Do not commit** unless user asks (repo rule).

---

## Task 1: Cache metric helpers (pricing)

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/pricing.py`
- Create: `schedjuice-reimagined-be/app_ai/tests/test_cache_metrics.py`

- [ ] **Step 1: Write failing tests**

Create `app_ai/tests/test_cache_metrics.py`:

```python
from decimal import Decimal

from django.test import SimpleTestCase, override_settings

from app_ai.pricing import cache_hit_rate, compute_cache_savings_usd


class CacheMetricsTests(SimpleTestCase):
    def test_hit_rate_zero_when_no_input(self):
        self.assertEqual(cache_hit_rate(input_tokens=0, cached_input_tokens=0), 0.0)
        self.assertEqual(cache_hit_rate(input_tokens=0, cached_input_tokens=100), 0.0)

    def test_hit_rate_computed(self):
        rate = cache_hit_rate(input_tokens=45000, cached_input_tokens=12000)
        self.assertAlmostEqual(rate, 12000 / 57000, places=4)

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_savings_for_known_model(self):
        savings = compute_cache_savings_usd(
            "gemini-3.1-flash-lite",
            cached_input_tokens=1_000_000,
        )
        # input 0.25 - cached 0.0625 = 0.1875 per 1M
        self.assertEqual(savings, Decimal("0.18750000"))

    @override_settings(AI_BILLING_MARKUP=1.0)
    def test_savings_zero_when_no_cached_tokens(self):
        savings = compute_cache_savings_usd("gemini-3.1-flash-lite", cached_input_tokens=0)
        self.assertEqual(savings, Decimal("0"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_cache_metrics -v 2`  
Expected: FAIL — `ImportError: cannot import name 'cache_hit_rate'`

- [ ] **Step 3: Implement helpers in `pricing.py`**

Add after `apply_billing_markup`:

```python
def cache_hit_rate(*, input_tokens: int, cached_input_tokens: int) -> float:
    denominator = input_tokens + cached_input_tokens
    if denominator <= 0:
        return 0.0
    return cached_input_tokens / denominator


def compute_cache_savings_usd(model: str, *, cached_input_tokens: int) -> Decimal:
    if cached_input_tokens <= 0:
        return Decimal("0")
    input_rate, _, _, cached_rate = _rates_for_model(model)
    markup = Decimal(str(getattr(settings, "AI_BILLING_MARKUP", 1.0)))
    million = Decimal("1000000")
    delta = input_rate - cached_rate
    savings = Decimal(cached_input_tokens) * delta * markup / million
    return savings.quantize(Decimal("0.00000001"))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_ai.tests.test_cache_metrics -v 2`  
Expected: PASS (4 tests)

---

## Task 2: Reporting rollup helpers

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/reporting.py`
- Modify: `schedjuice-reimagined-be/app_ai/tests/test_usage_reporting.py`

- [ ] **Step 1: Write failing test for monthly row aggregation**

Add to `AIUsageReportingTests` in `test_usage_reporting.py`:

```python
from app_ai.pricing import apply_billing_markup, compute_cache_savings_usd

@override_settings(AI_BILLING_MARKUP=1.0)
def test_aggregate_monthly_rows_includes_cache_metrics(self):
    with schema_context(get_public_schema_name()):
        AITenantUsageMonthly.objects.create(
            tenant=self.org,
            year=2026,
            month=6,
            model="gemini-3.1-flash-lite",
            input_tokens=45000,
            cached_input_tokens=12000,
            total_billed_usd=Decimal("1.00"),
            total_tokens=57000,
            request_count=2,
        )
        rows = list(
            AITenantUsageMonthly.objects.filter(
                tenant=self.org, year=2026, month=6
            )
        )
    totals = aggregate_monthly_rows(rows)
    self.assertEqual(totals["input_tokens"], 45000)
    self.assertEqual(totals["cached_input_tokens"], 12000)
    self.assertAlmostEqual(totals["cache_hit_rate"], 12000 / 57000, places=4)
    expected_savings = compute_cache_savings_usd(
        "gemini-3.1-flash-lite", cached_input_tokens=12000
    )
    self.assertEqual(totals["cache_savings_usd"], format(expected_savings, "f"))
```

Add `from django.test import override_settings` to imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_ai.tests.test_usage_reporting.AIUsageReportingTests.test_aggregate_monthly_rows_includes_cache_metrics -v 2`  
Expected: FAIL — `KeyError: 'input_tokens'`

- [ ] **Step 3: Extend `_empty_month_totals` and `aggregate_monthly_rows`**

In `reporting.py`, import helpers:

```python
from app_ai.pricing import cache_hit_rate, compute_cache_savings_usd
```

Update `_empty_month_totals`:

```python
def _empty_month_totals() -> dict[str, Any]:
    return {
        "total_cost_usd": "0",
        "total_tokens": 0,
        "request_count": 0,
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "cache_hit_rate": 0.0,
        "cache_savings_usd": "0",
    }
```

Add helper:

```python
def _cache_fields_from_monthly_rows(rows) -> dict[str, Any]:
    input_tokens = sum((r.input_tokens for r in rows), 0)
    cached_input_tokens = sum((r.cached_input_tokens for r in rows), 0)
    savings = sum(
        (
            compute_cache_savings_usd(r.model, cached_input_tokens=r.cached_input_tokens)
            for r in rows
        ),
        Decimal("0"),
    )
    return {
        "input_tokens": input_tokens,
        "cached_input_tokens": cached_input_tokens,
        "cache_hit_rate": cache_hit_rate(
            input_tokens=input_tokens,
            cached_input_tokens=cached_input_tokens,
        ),
        "cache_savings_usd": _decimal_str(savings),
    }
```

Update `aggregate_monthly_rows`:

```python
def aggregate_monthly_rows(rows) -> dict[str, Any]:
    total_cost = sum((r.total_billed_usd for r in rows), Decimal("0"))
    total_tokens = sum((r.total_tokens for r in rows), 0)
    request_count = sum((r.request_count for r in rows), 0)
    cache_fields = _cache_fields_from_monthly_rows(rows) if rows else {
        k: v for k, v in _empty_month_totals().items()
        if k not in {"total_cost_usd", "total_tokens", "request_count"}
    }
    return {
        "total_cost_usd": _decimal_str(total_cost),
        "total_tokens": total_tokens,
        "request_count": request_count,
        **cache_fields,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_ai.tests.test_usage_reporting.AIUsageReportingTests.test_aggregate_monthly_rows_includes_cache_metrics -v 2`  
Expected: PASS

---

## Task 3: Org detail — by_model and top spenders

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/reporting.py`
- Modify: `schedjuice-reimagined-be/app_ai/tests/test_usage_reporting.py`

- [ ] **Step 1: Write failing tests**

Add to `test_usage_reporting.py`:

```python
@override_settings(AI_BILLING_MARKUP=1.0)
def test_build_org_detail_by_model_includes_cache_fields(self):
    with schema_context(get_public_schema_name()):
        AITenantUsageMonthly.objects.create(
            tenant=self.org,
            year=2026,
            month=6,
            model="gemini-3.1-flash-lite",
            input_tokens=1000,
            cached_input_tokens=500,
            total_billed_usd=Decimal("1.00"),
            total_tokens=1500,
            request_count=1,
        )
    detail = build_org_detail(self.org, 2026, 6)
    row = detail["month_summary"]["by_model"][0]
    self.assertEqual(row["cached_input_tokens"], 500)
    self.assertAlmostEqual(row["cache_hit_rate"], 500 / 1500, places=4)
    self.assertIn("cache_savings_usd", row)

@override_settings(AI_BILLING_MARKUP=1.0)
def test_user_usage_for_month_includes_cache_not_savings(self):
    with schema_context(get_public_schema_name()):
        AIUsageLog.objects.create(
            tenant=self.org,
            user_id=self.user_a.id,
            model="gemini-3.1-flash-lite",
            pricing_version="v1",
            input_tokens=800,
            cached_input_tokens=200,
            billed_cost_usd=Decimal("1.00"),
            total_tokens=1000,
            created_at=datetime(2026, 6, 15, tzinfo=timezone.utc),
        )
    users = user_usage_for_month(self.org, 2026, 6)
    self.assertEqual(users[0]["cached_input_tokens"], 200)
    self.assertAlmostEqual(users[0]["cache_hit_rate"], 200 / 1000, places=4)
    self.assertNotIn("cache_savings_usd", users[0])
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python manage.py test app_ai.tests.test_usage_reporting.AIUsageReportingTests.test_build_org_detail_by_model_includes_cache_fields app_ai.tests.test_usage_reporting.AIUsageReportingTests.test_user_usage_for_month_includes_cache_not_savings -v 2`

- [ ] **Step 3: Update `build_org_detail` by_model loop**

Replace each by_model dict construction with:

```python
cache_fields = _cache_fields_from_monthly_rows([row])
by_model.append(
    {
        "model": row.model or "(default)",
        "total_cost_usd": _decimal_str(row.total_billed_usd),
        "total_tokens": row.total_tokens,
        "request_count": row.request_count,
        **cache_fields,
    }
)
```

- [ ] **Step 4: Update `user_usage_for_month` aggregate**

Extend `.annotate(...)` with:

```python
input_tokens=Sum("input_tokens"),
cached_input_tokens=Sum("cached_input_tokens"),
```

In entry dict:

```python
input_t = row["input_tokens"] or 0
cached_t = row["cached_input_tokens"] or 0
entry = {
    ...
    "cached_input_tokens": cached_t,
    "cache_hit_rate": cache_hit_rate(
        input_tokens=input_t,
        cached_input_tokens=cached_t,
    ),
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run same test command as Step 2.

---

## Task 4: User usage detail + trend cache fields

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/reporting.py`
- Modify: `schedjuice-reimagined-be/app_ai/tests/test_usage_reporting.py`

- [ ] **Step 1: Write failing test**

```python
@override_settings(AI_BILLING_MARKUP=1.0)
def test_build_user_usage_detail_includes_cache_on_summary_and_trend(self):
    with schema_context(get_public_schema_name()):
        AIUsageLog.objects.create(
            tenant=self.org,
            user_id=self.user_a.id,
            feature="ai_query",
            model="gemini-3.1-flash-lite",
            pricing_version="v1",
            input_tokens=900,
            cached_input_tokens=100,
            billed_cost_usd=Decimal("0.50"),
            total_tokens=1000,
            created_at=datetime(2026, 6, 20, tzinfo=timezone.utc),
        )
    from app_ai.reporting import build_user_usage_detail

    detail = build_user_usage_detail(self.org, self.user_a.id, 2026, 6)
    summary = detail["month_summary"]
    self.assertEqual(summary["cached_input_tokens"], 100)
    self.assertAlmostEqual(summary["cache_hit_rate"], 100 / 1000, places=4)
    self.assertIn("cache_savings_usd", summary)
    self.assertIn("cached_input_tokens", detail["trend"][-1])
    feature_row = summary["by_feature"][0]
    self.assertEqual(feature_row["cached_input_tokens"], 100)
    self.assertNotIn("cache_savings_usd", feature_row)
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Update `build_user_usage_detail`**

For `month_agg`, also sum `input_tokens` and `cached_input_tokens`.

For savings on summary, add by-model sub-query:

```python
by_model = list(
    base_qs.values("model")
    .annotate(
        input_tokens=Sum("input_tokens"),
        cached_input_tokens=Sum("cached_input_tokens"),
    )
)
savings = sum(
    (
        compute_cache_savings_usd(
            row["model"],
            cached_input_tokens=row["cached_input_tokens"] or 0,
        )
        for row in by_model
    ),
    Decimal("0"),
)
```

Set on `month_summary`:

```python
"input_tokens": month_agg["input_tokens"] or 0,
"cached_input_tokens": month_agg["cached_input_tokens"] or 0,
"cache_hit_rate": cache_hit_rate(...),
"cache_savings_usd": _decimal_str(savings),
```

For `by_feature` rows, annotate `input_tokens` + `cached_input_tokens`; add cached + hit rate only.

For trend loop, include same four fields via log aggregate (reuse pattern from month_agg per month).

- [ ] **Step 4: Run test — expect PASS**

Run: `python manage.py test app_ai.tests.test_usage_reporting -v 2`

---

## Task 5: Platform summary trend cache fields

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/reporting.py`
- Modify: `schedjuice-reimagined-be/app_ai/tests/test_usage_reporting.py`

- [ ] **Step 1: Write failing test**

```python
@override_settings(AI_BILLING_MARKUP=1.0)
def test_build_platform_summary_trend_includes_cache_fields(self):
    with schema_context(get_public_schema_name()):
        AITenantUsageMonthly.objects.create(
            tenant=self.org,
            year=2026,
            month=6,
            model="gemini-3.1-flash-lite",
            input_tokens=400,
            cached_input_tokens=100,
            total_billed_usd=Decimal("2.00"),
            total_tokens=500,
            request_count=1,
        )
    summary = build_platform_summary(2026, 6)
    self.assertEqual(summary["totals"]["cached_input_tokens"], 100)
    org_row = next(
        o for o in summary["organizations"] if o["organization_id"] == self.org.id
    )
    june_trend = org_row["trend"][-1]
    self.assertEqual(june_trend["cached_input_tokens"], 100)
    self.assertIn("cache_savings_usd", june_trend)
```

- [ ] **Step 2: Run test — expect FAIL** (trend points missing cache keys)

- [ ] **Step 3: Verify `build_platform_summary` trend uses `aggregate_monthly_rows`**

Trend construction already spreads `**trend_totals` from `aggregate_monthly_rows` — after Task 2 this should pass automatically. If platform `totals` lack cache fields, sum org `selected_month` cache fields or aggregate all rows into platform totals in the loop.

Add to platform totals accumulation in `build_platform_summary`:

```python
platform_input_tokens = 0
platform_cached_tokens = 0
platform_savings = Decimal("0")
# inside org loop:
platform_input_tokens += selected.get("input_tokens", 0)
platform_cached_tokens += selected.get("cached_input_tokens", 0)
platform_savings += Decimal(selected.get("cache_savings_usd", "0"))
# in return totals:
"input_tokens": platform_input_tokens,
"cached_input_tokens": platform_cached_tokens,
"cache_hit_rate": cache_hit_rate(
    input_tokens=platform_input_tokens,
    cached_input_tokens=platform_cached_tokens,
),
"cache_savings_usd": _decimal_str(platform_savings),
```

- [ ] **Step 4: Run full reporting test suite — expect PASS**

Run: `python manage.py test app_ai.tests.test_usage_reporting app_ai.tests.test_cache_metrics -v 2`

---

## Task 6: API response assertions

**Files:**
- Modify: `schedjuice-reimagined-be/app_ai/tests/test_usage_api.py`
- Modify: `schedjuice-reimagined-be/app_ai/tests/test_user_ai_api.py`

- [ ] **Step 1: Extend API tests**

In `test_superadmin_on_admin_tenant_can_fetch_summary`, after 200:

```python
self.assertIn("cached_input_tokens", body["totals"])
self.assertIn("cache_hit_rate", body["totals"])
self.assertIn("cache_savings_usd", body["totals"])
org = body["organizations"][0]
self.assertIn("cached_input_tokens", org["selected_month"])
self.assertIn("cache_savings_usd", org["trend"][0])
```

In `test_superadmin_on_admin_tenant_can_fetch_org_detail`:

```python
self.assertIn("cached_input_tokens", body["month_summary"])
if body["users"]:
    self.assertIn("cache_hit_rate", body["users"][0])
    self.assertNotIn("cache_savings_usd", body["users"][0])
```

In `test_self_get_usage`, seed one `AIUsageLog` with cached tokens first, then:

```python
self.assertIn("cached_input_tokens", body["data"]["month_summary"])
self.assertIn("cache_savings_usd", body["data"]["month_summary"])
self.assertIn("cached_input_tokens", body["data"]["trend"][0])
```

- [ ] **Step 2: Run API tests**

Run: `python manage.py test app_ai.tests.test_usage_api app_ai.tests.test_user_ai_api -v 2`  
Expected: PASS

---

## Task 7: Frontend types and formatters

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/ai-usage.ts`
- Modify: `schedjuice-reimagined-fe/src/types/ai-user-preferences.ts`
- Create: `schedjuice-reimagined-fe/src/types/__tests__/ai-usage.test.ts`

- [ ] **Step 1: Write failing formatter test**

Create `src/types/__tests__/ai-usage.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatCacheHitRate } from "@/types/ai-usage";

describe("formatCacheHitRate", () => {
  it("formats as percentage with one decimal", () => {
    expect(formatCacheHitRate(0.2105)).toBe("21.1%");
  });

  it("formats zero", () => {
    expect(formatCacheHitRate(0)).toBe("0.0%");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm test -- ai-usage.test`

- [ ] **Step 3: Extend schemas in `ai-usage.ts`**

Add shared fragment:

```typescript
const aiUsageCacheMetricsSchema = z.object({
  input_tokens: z.number(),
  cached_input_tokens: z.number(),
  cache_hit_rate: z.number(),
  cache_savings_usd: z.string(),
});
```

Extend `aiUsageMonthTotalsSchema` with `.merge(aiUsageCacheMetricsSchema)`.

Extend `aiUsageModelBreakdownSchema` with cache fields.

Extend `aiUsageUserRowSchema`:

```typescript
cached_input_tokens: z.number(),
cache_hit_rate: z.number(),
```

Add formatter:

```typescript
export function formatCacheHitRate(rate: number): string {
  if (!Number.isFinite(rate)) return "0.0%";
  return `${(rate * 100).toFixed(1)}%`;
}
```

- [ ] **Step 4: Update `ai-user-preferences.ts`**

Import `aiUsageMonthTotalsSchema` pieces or duplicate cache fields on `month_summary` and reuse extended trend schema from `ai-usage.ts`.

Extend `by_feature` items:

```typescript
cached_input_tokens: z.number(),
cache_hit_rate: z.number(),
```

- [ ] **Step 5: Run test — expect PASS**

---

## Task 8: Dual-row trend component

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/_components/usage-trend-bars.tsx`

- [ ] **Step 1: Add cache savings row below cost bars**

```tsx
const maxSavings = Math.max(
  ...trend.map((point) => Number(point.cache_savings_usd)),
  0,
);

// After existing cost bar row, add:
<div className="mt-2 flex h-6 items-end gap-1">
  {trend.map((point) => {
    const savings = Number(point.cache_savings_usd);
    const heightPct =
      maxSavings > 0 ? Math.max((savings / maxSavings) * 100, 4) : 4;
    return (
      <div
        key={`cache-${point.year}-${point.month}`}
        className="group flex flex-1 flex-col items-center gap-1"
        title={`${point.month}/${point.year}: ${formatAiUsd(savings)} saved · ${point.cached_input_tokens.toLocaleString()} cached · ${formatCacheHitRate(point.cache_hit_rate)}`}
      >
        <div
          className="w-full rounded-sm bg-emerald-500/60 transition-colors group-hover:bg-emerald-500/80"
          style={{ height: `${heightPct}%`, minHeight: "3px" }}
        />
      </div>
    );
  })}
</div>
```

Import `formatCacheHitRate` from `@/types/ai-usage`.

- [ ] **Step 2: Manual check**

Load any AI Usage page with trend data; hover cache bars for tooltip.

---

## Task 9: Platform overview UI

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/page.tsx`

- [ ] **Step 1: Add second summary card row**

After existing 4-card grid, add 3-card grid:

```tsx
<Card>
  <CardHeader><CardTitle className="text-base">Cached tokens</CardTitle></CardHeader>
  <CardContent>
    <p className="text-2xl font-semibold tabular-nums">
      {formatAiTokens(summaryQuery.data.totals.cached_input_tokens)}
    </p>
  </CardContent>
</Card>
// + Cache hit rate + Est. savings cards
```

- [ ] **Step 2: Extend org table headers and cells**

Add after Tokens column:

```tsx
<TableHead className="text-right">Cached</TableHead>
<TableHead className="text-right">Hit rate</TableHead>
<TableHead className="text-right">Savings</TableHead>
```

Cells use `org.selected_month.cached_input_tokens`, `formatCacheHitRate(...)`, `formatAiUsd(...)`.

- [ ] **Step 3: Verify page renders with backend running**

Navigate to `/organizations/ai-usage`.

---

## Task 10: Org detail + user panel UI

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/organizations/[id]/ai-usage/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/users/ai/ai-usage-panel.tsx`

- [ ] **Step 1: Org detail — cache summary row**

Same 3-card pattern as platform, sourced from `detailQuery.data.month_summary`.

- [ ] **Step 2: Org detail — by_model table columns**

Add Cached, Hit rate, Savings columns (all four cache fields on model rows).

- [ ] **Step 3: Org detail — top spenders columns**

Add Cached + Hit rate only:

```tsx
<TableHead className="text-right">Cached</TableHead>
<TableHead className="text-right">Hit rate</TableHead>
```

- [ ] **Step 4: User panel — cache stats row**

Below Cost/Tokens/Requests grid, add `sm:grid-cols-3` row with cached, hit rate, savings from `usageQuery.data.month_summary`.

Trend section already uses `UsageTrendBars` — dual row appears automatically after Task 8.

- [ ] **Step 5: Run FE tests**

Run: `npm test -- ai-usage`

---

## Task 11: End-to-end verification

- [ ] **Backend:** `python manage.py test app_ai.tests.test_cache_metrics app_ai.tests.test_usage_reporting app_ai.tests.test_usage_api app_ai.tests.test_user_ai_api -v 2`
- [ ] **Frontend:** `npm test -- ai-usage`
- [ ] **Manual:** Platform overview shows cache cards + table columns + dual trend
- [ ] **Manual:** Org detail shows by_model cache columns; top spenders has cached + hit rate only
- [ ] **Manual:** User record AI panel shows cache row + dual trend
- [ ] **Manual:** Month with zero cached usage shows `0`, `0.0%`, `$0.00`

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| Cache helpers with pricing + markup | Task 1 |
| Extend month totals (4 fields) | Task 2 |
| Platform totals + org selected_month + trend | Tasks 2, 5 |
| Org month_summary + trend | Task 2 |
| by_model all four fields | Task 3 |
| Top spenders cached + hit rate only | Task 3 |
| User month_summary + trend all four | Task 4 |
| User by_feature cached + hit rate only | Task 4 |
| API tests | Task 6 |
| Zod schemas + formatCacheHitRate | Task 7 |
| Dual-row trend | Task 8 |
| Platform overview UI | Task 9 |
| Org detail UI | Task 10 |
| User panel UI | Task 10 |
| Zero states | Task 11 manual |
| Deploy BE before FE | Conventions section |

No placeholders remain. Type names consistent across tasks.
