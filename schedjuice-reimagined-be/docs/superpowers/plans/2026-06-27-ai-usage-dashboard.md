# AI Usage Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Platform → AI Usage pages (org-scoped routes) with cross-tenant monthly overview, 6-month trends, and per-org top-spender tables, gated by new `ai.usage.view` permission.

**Architecture:** Add `ai.usage.view` to RBAC catalog. Backend aggregation module reads public-schema `AITenantUsageMonthly` + `AIUsageLog`, resolves user names in tenant schema. Two GET endpoints; FE overview at `/organizations/ai-usage`, detail at `/organizations/[id]/ai-usage`.

**Tech Stack:** Django/DRF, django-tenant-schemas, Next.js 15 App Router, TanStack Query, Zod, nuqs, shadcn UI.

**Spec:** `docs/superpowers/specs/2026-06-27-ai-usage-dashboard-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `app_rbac/catalog.py` | `ai.usage.view` permission |
| `app_ai/reporting.py` | Month ranges, rollup aggregation, user ranking |
| `app_ai/usage_views.py` | Platform summary + org detail API views |
| `app_ai/urls.py` | `platform/ai-usage/summary` route |
| `app_organization/views.py` | `OrganizationAIUsageView` |
| `app_organization/urls.py` | `organizations/<id>/ai-usage` route |
| `app_ai/tests/test_usage_reporting.py` | Aggregation unit tests |
| `app_ai/tests/test_usage_api.py` | API permission + response tests |
| `schedjuice-reimagined-fe/src/config/nav-routes.tsx` | Platform nav item |
| `schedjuice-reimagined-fe/src/config/route-permissions.ts` | Middleware rules |
| `schedjuice-reimagined-fe/src/lib/org-route-access.ts` | Exclude ai-usage overview |
| `schedjuice-reimagined-fe/src/types/ai-usage.ts` | Zod + TS types |
| `schedjuice-reimagined-fe/src/app/client-api/ai-usage.ts` | API helpers |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/ai-usage/page.tsx` | Overview |
| `schedjuice-reimagined-fe/src/app/(internal)/organizations/[id]/ai-usage/page.tsx` | Detail |

---

## Conventions

- **BE tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="enforce")` for permission tests, `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData`.
- **Run BE test:** `python manage.py test app_ai.tests.test_usage_api -v 2`
- **Run FE test:** `npm test -- route-permissions nav-routes org-route-access`
- **Do not commit** unless user asks (repo rule).

---

## Task 1: RBAC permission

**Files:** Modify `app_rbac/catalog.py`, `app_rbac/tests/test_catalog.py`

- [ ] Add `ai.usage.view` under PLATFORM_INTERNAL block (before `debug.access`)
- [ ] Verify `test_platform_internal_not_in_school_matrix` still passes

---

## Task 2: Reporting module

**Files:** Create `app_ai/reporting.py`, `app_ai/tests/test_usage_reporting.py`

- [ ] `iter_months_ending(year, month, count=6) -> list[tuple[int,int]]`
- [ ] `aggregate_monthly_rows(queryset) -> dict` (sum cost/tokens/requests across models)
- [ ] `monthly_trend_for_tenant(tenant, end_year, end_month) -> list`
- [ ] `user_usage_for_month(tenant, year, month) -> list` with schema_context user lookup
- [ ] Tests with factory-created `AITenantUsageMonthly` + `AIUsageLog` rows

---

## Task 3: Platform summary API

**Files:** Create `app_ai/usage_views.py`, modify `app_ai/urls.py`

- [ ] `PlatformAIUsageSummaryView` — `GET`, `ai.usage.view`, `RequiresPlatformAdminTenant`
- [ ] Query params `year`, `month` (default UTC now)
- [ ] Response per spec; sort orgs by cost desc
- [ ] Register `platform/ai-usage/summary`

---

## Task 4: Org detail API

**Files:** Modify `app_organization/views.py`, `app_organization/urls.py`

- [ ] `OrganizationAIUsageView` — `GET`, `ai.usage.view`, `RequiresPlatformAdminTenant` (v1)
- [ ] Returns month_summary, by_model, trend, users
- [ ] Register `organizations/<int:obj_id>/ai-usage`

---

## Task 5: API tests

**Files:** Create `app_ai/tests/test_usage_api.py`

- [ ] Superadmin on admin tenant → 200 summary + org detail
- [ ] Admin without permission → 403
- [ ] Superadmin on customer tenant → 403
- [ ] User ranking order verified

---

## Task 6: FE routing & nav

**Files:** `nav-routes.tsx`, `route-permissions.ts`, `org-route-access.ts`, tests

- [ ] Nav item after Billing
- [ ] Route rules for `/organizations/ai-usage` and extend `/organizations` anyOf
- [ ] Exclude ai-usage from platform org management paths
- [ ] Update vitest files

---

## Task 7: FE types & client API

**Files:** `src/types/ai-usage.ts`, `src/app/client-api/ai-usage.ts`

- [ ] Zod schemas matching API envelopes (`data` wrapper)
- [ ] `fetchAiUsageSummary({ year, month })`
- [ ] `fetchOrgAiUsage(orgId, { year, month })`

---

## Task 8: Overview page

**Files:** `organizations/ai-usage/page.tsx`

- [ ] YearMonthSelector + aggregate cards + org table with trend bars
- [ ] Links to detail with `?date=`

---

## Task 9: Org detail page

**Files:** `organizations/[id]/ai-usage/page.tsx`

- [ ] Mirror billing layout: back link, month picker, summary, trend, top spenders table
- [ ] Superadmin client guard

---

## Task 10: Manual verification

- [ ] `python manage.py test app_ai.tests.test_usage_reporting app_ai.tests.test_usage_api -v 2`
- [ ] `npm test -- route-permissions nav-routes org-route-access`
- [ ] Load `/organizations/ai-usage` as superadmin on admin tenant
