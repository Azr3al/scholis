# AI Usage Dashboard — Design Spec

**Date:** 2026-06-27  
**Status:** Approved — implemented 2026-06-27  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`

## 1. Summary

Add platform-facing AI usage visibility under **Platform** nav, gated by a new
`ai.usage.view` permission (superadmin-only by default). Surfaces:

1. **Cross-tenant overview** — all organizations, selected month totals, 6-month
   trend per org, sorted by spend.
2. **Org drill-down** — monthly totals for one org plus **per-user spend ranking**
   (top spenders).

Routes follow the **org-scoped pattern** (like billing and AI settings), not
`/platform/ai-usage/*`. The same org detail URL works later for org admins
viewing their own school.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Architecture | **C** — org-scoped routes; no `/platform/ai-usage` tree |
| Overview route | `/organizations/ai-usage` (Platform nav target) |
| Detail route | `/organizations/[id]/ai-usage` |
| Time navigation | Month picker + 6-month trend (prior “C” on time scope) |
| Permission | New `ai.usage.view` (`PLATFORM_INTERNAL`; superadmin default) |
| v1 scope | Monthly org totals + per-user ranking; no request log explorer |
| Future | Org admins get `/organizations/ai-usage` for own tenant only |

---

## 2. Permission & access

### New permission

Add to `app_rbac/catalog.py`:

```python
_p(
    "ai.usage.view",
    "View AI usage",
    "view AI usage and spend reports",
    "Operational",
    tier=PLATFORM_INTERNAL,
)
```

- Included in `ALL_CODES` → superadmin receives it automatically.
- Not in tenant role matrix in v1 (same as `debug.access`, `billing.manage`).

### Frontend gates

| Layer | Rule |
| --- | --- |
| Nav | Platform → **AI Usage** → `/organizations/ai-usage`, `requiredPermissions: ["ai.usage.view"]` |
| Middleware | See route rules below |

**Route rules (`route-permissions.ts`):**

```typescript
// Overview (exact prefix; longer than /organizations)
{ prefix: "/organizations/ai-usage", anyOf: ["ai.usage.view"] },
// Detail + future org-admin paths under /organizations/:id/ai-usage
{ prefix: "/organizations/", anyOf: ["ai.usage.view", "org.configure", "org.manage_all"] },
```

Extend the existing `/organizations` rule’s `anyOf` to include `ai.usage.view` so
org detail URLs work for holders of the new permission alone (needed for future
org-admin access). Overview uses the longer `/organizations/ai-usage` prefix.
Detail pages also check `ai.usage.view` client-side.

### `org-route-access.ts`

Exclude `/organizations/ai-usage` from cross-tenant platform org management
paths (same as `ai-settings` and `profile`):

```typescript
if (pathname.startsWith("/organizations/ai-usage")) {
  return false;
}
```

For `/organizations/[id]/ai-usage` when `id !== tenantId`, treat as platform
cross-org access (superadmin viewing another school) — existing `[id]` match
already handles this.

### Backend gates

| Endpoint | v1 access |
| --- | --- |
| `GET /api/v1/platform/ai-usage/summary` | `ai.usage.view` + `RequiresPlatformAdminTenant` |
| `GET /api/v1/organizations/{id}/ai-usage` | `ai.usage.view` + platform admin tenant **or** `{id}` equals request tenant (future org admin) |

v1 ships platform-admin-only on the org endpoint; future org-admin path is
designed in but can defer relaxing the platform-tenant check until the org-facing
page ships.

---

## 3. Routes & navigation

### Platform sidebar

Insert after **Billing**, before **Overview**:

```typescript
{
  title: "AI Usage",
  icon: Sparkles, // or BarChart3 — match nav-icons
  href: "/organizations/ai-usage",
  requiredPermissions: ["ai.usage.view"],
},
```

### Page map

| URL | Audience (v1) | Purpose |
| --- | --- | --- |
| `/organizations/ai-usage` | Superadmin | All-org overview, month picker, 6-mo trend |
| `/organizations/[id]/ai-usage` | Superadmin (any org) | Org monthly summary + top spenders |

Detail pages link back to overview; optional link to
`/organizations/ai-settings` is out of scope (settings uses current tenant only).

### Future org admin (not v1)

| URL | Audience | Purpose |
| --- | --- | --- |
| `/organizations/ai-usage` | Org admin with `ai.usage.view` on school role | Redirect or render own-org detail inline |
| `/organizations/[id]/ai-usage` | Org admin | Only when `id === current tenant` |

---

## 4. Backend API

All usage data lives in the **public schema** (`AIUsageLog`, `AITenantUsageMonthly`).
User display names require a **tenant schema context** lookup on `app_auth.User`.

### 4.1 Platform summary

**`GET /api/v1/platform/ai-usage/summary`**

Query params:

| Param | Default | Notes |
| --- | --- | --- |
| `year` | current UTC year | Selected snapshot month |
| `month` | current UTC month | 1–12 |

Response shape:

```json
{
  "year": 2026,
  "month": 6,
  "totals": {
    "total_cost_usd": "12.34567890",
    "total_tokens": 1234567,
    "request_count": 890,
    "organization_count": 15
  },
  "organizations": [
    {
      "organization_id": 1,
      "name": "Example School",
      "schema_name": "xexample",
      "selected_month": {
        "total_cost_usd": "1.23456789",
        "total_tokens": 100000,
        "request_count": 42
      },
      "budget": {
        "monthly_usd_limit": "50.0000",
        "used_pct": 0.0247
      },
      "trend": [
        { "year": 2026, "month": 1, "total_cost_usd": "0.50", "total_tokens": 5000, "request_count": 10 }
      ]
    }
  ]
}
```

**Aggregation:**

- `selected_month` and `trend`: sum `AITenantUsageMonthly` rows per tenant
  (aggregate across `model` dimension).
- `trend`: always last **6 calendar months** ending at selected month (inclusive).
- `budget`: from org AI budget fields on `Organization` (same source as
  `get_tenant_budget`); `used_pct = selected_month.total_cost_usd / limit` when
  limit set, else `null`.
- Sort `organizations` by `selected_month.total_cost_usd` descending.

**Files:** `app_ai/views.py`, `app_ai/serializers.py` (new), `app_ai/urls.py`,
register under `api/v1/platform/ai-usage/`.

### 4.2 Org detail

**`GET /api/v1/organizations/{id}/ai-usage`**

Query params: same `year`, `month` defaults.

Response shape:

```json
{
  "organization": { "id": 1, "name": "Example School" },
  "year": 2026,
  "month": 6,
  "month_summary": {
    "total_cost_usd": "1.23456789",
    "total_tokens": 100000,
    "request_count": 42,
    "by_model": [
      { "model": "gemini-3.1-flash-lite", "total_cost_usd": "1.00", "total_tokens": 80000, "request_count": 35 }
    ]
  },
  "trend": [ /* same 6-month shape as summary */ ],
  "users": [
    {
      "user_id": 42,
      "display_name": "Jane Admin",
      "email": "jane@school.edu",
      "total_cost_usd": "0.87654321",
      "total_tokens": 70000,
      "request_count": 28
    }
  ]
}
```

**Aggregation:**

- `month_summary` / `trend`: `AITenantUsageMonthly` for tenant (same as summary).
- `by_model`: optional breakdown from monthly rows (not rolled up) — cheap since
  few models per tenant.
- `users`: aggregate `AIUsageLog` for `tenant_id`, filter `created_at` to UTC
  month bounds, `GROUP BY user_id`, order by `sum(billed_cost_usd)` desc.
  Resolve names via `schema_context(org.schema_name)` batch fetch on `User`.
  Include rows with `user_id IS NULL` as `"Unknown user"` at bottom.

**Files:** add view on `OrganizationAIUsageView` in `app_organization/views.py`
or `app_ai/views.py`; URL alongside existing ai-settings pattern:

```
organizations/<int:obj_id>/ai-usage
```

---

## 5. Frontend UI

### 5.1 Shared components

- `YearMonthSelector` + `nuqs` `?date=` query param (match billing / school-overview).
- Format USD with 2–4 decimal places for small amounts; tokens with `toLocaleString()`.
- React Query keys: `["aiUsageSummary", year, month]`, `["aiUsageOrg", orgId, year, month]`.

### 5.2 Overview — `/organizations/ai-usage`

Layout:

1. Page title **AI Usage**
2. Month selector
3. Aggregate cards: platform total cost, total tokens, total requests, org count
4. Table (sortable, default cost desc):
   - Organization (link → `/organizations/{id}/ai-usage?date=…`)
   - Cost / tokens / requests (selected month)
   - Budget used % (if limit configured)
   - Mini 6-month sparkline or inline bar strip (CSS, no chart library)

Empty state: “No AI usage recorded for this month.”

Access guard: require `ai.usage.view` (via middleware + optional client redirect).

### 5.3 Org detail — `/organizations/[id]/ai-usage`

Layout (mirror billing page structure):

1. Back button → `/organizations/ai-usage`
2. Org name heading
3. Month selector (preserve `?date=` in links)
4. Summary cards: cost, tokens, requests; budget bar if configured
5. 6-month trend (simple horizontal bars)
6. **Top spenders** table: rank, name, email, cost, tokens, requests

Access guard: superadmin role check (defense in depth, same as debug pages) plus
permission check.

### 5.4 New frontend files

| File | Purpose |
| --- | --- |
| `src/types/ai-usage.ts` | Zod schemas + TS types |
| `src/app/client-api/ai-usage.ts` | `fetchAiUsageSummary`, `fetchOrgAiUsage` |
| `src/app/(internal)/organizations/ai-usage/page.tsx` | Overview |
| `src/app/(internal)/organizations/[id]/ai-usage/page.tsx` | Org detail |

### 5.5 Tests

- `nav-routes.test.ts` — AI Usage item visible with `ai.usage.view`
- `route-permissions.test.ts` — `/organizations/ai-usage` rule
- `org-route-access` test — `/organizations/ai-usage` not platform cross-tenant path

---

## 6. Error handling

| Case | Behavior |
| --- | --- |
| No permission | Middleware redirect; client shows loader then home |
| Org not found | 404 from API; toast + back link |
| No usage data | Empty states on cards/tables, not an error |
| User deleted but logs remain | Show user_id fallback label |
| API failure | React Query error state + retry |

---

## 7. Out of scope (v1)

- Request-level log explorer (`AIUsageLog` row browser)
- Feature breakdown (`ai_query` vs `telegram_query`)
- Export CSV
- Org-admin self-service page (API shape supports it; UI deferred)
- Editing budgets from usage pages (stay on AI settings)
- Real-time updates / websockets

---

## 8. Implementation checklist

### Backend

- [ ] Add `ai.usage.view` to RBAC catalog + defaults tests
- [ ] `GET platform/ai-usage/summary` view + tests
- [ ] `GET organizations/{id}/ai-usage` view + tests (aggregation, user ranking, permissions)
- [ ] URL registration

### Frontend

- [ ] Permission + nav + route-permissions + org-route-access
- [ ] Types + client API
- [ ] Overview page + org detail page
- [ ] Nav/route tests

---

## 9. Future: org-admin access

When enabling school-level visibility:

1. Add `ai.usage.view` to tenant role matrix (school tier or setup tier — TBD).
2. Relax org detail endpoint: allow when `obj_id == request.tenant.organization_id`
   without `RequiresPlatformAdminTenant`.
3. `/organizations/ai-usage` for non-platform users: redirect to
   `/organizations/{tenantId}/ai-usage` or embed same component with single-org API.
4. Link from org profile hub next to **AI settings**.
