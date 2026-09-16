# Finance internal rail — main sidebar parity

**Status:** approved  
**Date:** 2026-08-10  
**Repo:** `schedjuice-reimagined-fe`  
**Surfaces:** Finance context rail, mobile finance section picker, `isFinanceRecordRoute`, find-page dialog

## Context

The finance **internal rail** (secondary sidebar) appears when browsing `/finances/**`. It groups finance pages into Overview, Payments, Analytics, and Operations. The **main sidebar** Finance section lists additional items that the internal rail omits:

| Item | Route | In internal rail today |
| --- | --- | --- |
| Payment Plans | `/payment-plans` | No |
| Discounts | `/discounts` | No |
| Payment Methods | `/payment-methods` | No |
| Payment Info | `/payment-infos` | No |
| Scan Transaction Screenshots | `/screenshots/create` | No |

Those routes live **outside** `/finances/**`, so navigating to them unmounts `finances/layout.tsx` and the context rail disappears. Users lose section navigation when configuring payment settings.

## Goals

1. Add all five missing items to the internal rail with the same labels, hrefs, permissions, and tenant gates as `nav-routes.tsx`.
2. Introduce a **Configuration** nav group for Payment Plans, Discounts, Payment Methods, and Payment Info; keep Scan Transaction Screenshots in **Payments**.
3. Keep the internal rail visible on config and screenshot routes (full finance workspace parity).
4. Preserve existing URLs — no route moves or redirects.

## Non-goals

- Removing or hiding duplicate links from the main sidebar Finance section.
- Moving config pages under `/finances/**`.
- Changing page-level breadcrumbs on config routes (they keep their existing `usePageHeader` setup).
- Backend or middleware permission changes (already defined in `route-permissions.ts`).

---

## Nav structure

### Group order

```
Overview                    (standalone, top)

PAYMENTS
  Student Payments
  Make Payment              (student only)
  My Payments               (student only)
  Staff Payments
  Recent Transactions
  Receiver Transactions
  Unpaid Students
  Scan Transaction Screenshots

CONFIGURATION               (new group)
  Payment Plans
  Discounts
  Payment Methods
  Payment Info

ANALYTICS
  Cash Flow
  School Overview
  Finance report

OPERATIONS
  Payroll
  Microsoft Payroll Report
  Rates
  Checkin Histories | User Attendance
```

### New entries (mirror `nav-routes.tsx`)

| id | label | href | group | requiredPermissions | canShow |
| --- | --- | --- | --- | --- | --- |
| `payment_plans` | Payment Plans | `/payment-plans` | `configuration` | `payment.configure` | — |
| `discounts` | Discounts | `/discounts` | `configuration` | `payment.configure` | — |
| `payment_methods` | Payment Methods | `/payment-methods` | `configuration` | `payment.configure` | — |
| `payment_infos` | Payment Info | `/payment-infos` | `configuration` | `payment.configure` | — |
| `scan_screenshots` | Scan Transaction Screenshots | `/screenshots/create` | `payments` | `payment.record` | `transaction_screenshot_strategy === admin_upload` |

Insert `scan_screenshots` after `unpaid_students` in the `FINANCE_RECORD_NAV_ENTRIES` array so Payments group order matches the main sidebar.

### Type changes

Extend in `finance-record-nav.ts`:

- `FinanceRecordNavId` — add five new ids above.
- `FinanceRecordNavGroupId` — add `"configuration"`.
- `FINANCE_RECORD_NAV_GROUPS` — insert `{ id: "configuration", label: "Configuration" }` **after** `payments`, **before** `analytics`.

---

## Rail persistence architecture

**Approach:** Shared rail provider + thin per-route layouts (recommended over route-group file moves or parent-layout pathname detection).

### `FinanceRecordRailProvider`

Extract from `finances/layout.tsx`:

- `useContextRail(FinanceSectionRail, …, FINANCE_CONTEXT_PARENT)`
- Mobile `FinanceMobileSections` strip (same visibility gate: `tenant` present, `md:hidden`)

Props: none (reads `pathname`, `user`, `tenant`, `canAny` internally).

### Layout registration

| Route segment | Layout action |
| --- | --- |
| `finances/` | Refactor existing layout to use `FinanceRecordRailProvider` + keep `FinanceLayoutHeader` fallback |
| `payment-plans/` | New `layout.tsx` → `FinanceRecordRailProvider` only |
| `discounts/` | New `layout.tsx` → `FinanceRecordRailProvider` only |
| `payment-methods/` | New `layout.tsx` → `FinanceRecordRailProvider` only |
| `payment-infos/` | New `layout.tsx` → `FinanceRecordRailProvider` only |
| `screenshots/` | New `layout.tsx` → `FinanceRecordRailProvider` only |

Config layouts do **not** register `FinanceLayoutHeader`; those pages already set their own headers.

### `isFinanceRecordRoute`

Expand `src/lib/is-finance-record-route.ts` to return true for:

```ts
/finances
/finances/**
/payment-plans/**
/discounts/**
/payment-methods/**
/payment-infos/**
/screenshots/**
```

Used by find-page dialog and any other record-mode checks. Add unit tests alongside existing nav tests.

---

## Active state & breadcrumbs

### `financeRecordNavActive`

Existing logic handles prefix matching for `/finances/**`. Extend so config entries highlight on nested routes:

- `/payment-plans` → Payment Plans; `/payment-plans/create`, `/payment-plans/[id]/edit` → active
- Same pattern for discounts, payment-methods, payment-infos
- `/screenshots/create` → Scan Transaction Screenshots (exact or prefix under `/screenshots/`)

Implementation: keep special case for overview (`pathname === "/finances"` only). For all other entries, use `pathname === entry.href || pathname.startsWith(\`${entry.href}/\`)` **or** for entries whose list href is a sub-path (e.g. scan → `/screenshots/create`), also match `pathname.startsWith` on the segment root (`/screenshots`).

For `scan_screenshots` with href `/screenshots/create`, active when `pathname === "/screenshots/create"` or `pathname.startsWith("/screenshots/")`.

### Rail back link

`FinanceSectionRail` already shows `← Overview` when `pathname !== "/finances"`. Config and screenshot routes correctly show the back link.

### Page titles (optional enhancement)

`financeRecordPageTitle` / `activeFinanceRecordEntry` will resolve titles for config routes once entries exist. Config pages that use custom `usePageHeader` are unaffected; finance sub-pages under `/finances/**` benefit automatically.

---

## Files to change

| File | Change |
| --- | --- |
| `src/config/finance-record-nav.ts` | New group, five entries, extended types |
| `src/lib/is-finance-record-route.ts` | Expanded route prefixes |
| `src/lib/is-finance-record-route.test.ts` | **New** — prefix coverage |
| `src/components/finances/record/finance-record-rail-provider.tsx` | **New** — extracted provider |
| `src/app/(internal)/finances/layout.tsx` | Use provider + keep header |
| `src/app/(internal)/payment-plans/layout.tsx` | **New** |
| `src/app/(internal)/discounts/layout.tsx` | **New** |
| `src/app/(internal)/payment-methods/layout.tsx` | **New** |
| `src/app/(internal)/payment-infos/layout.tsx` | **New** |
| `src/app/(internal)/screenshots/layout.tsx` | **New** |
| `src/config/__tests__/finance-record-nav.test.ts` | New entries, groups, active states, visibility |

No changes to `nav-routes.tsx` (main sidebar already correct).

---

## Testing

Extend `finance-record-nav.test.ts`:

1. **Visibility** — user with `payment.configure` sees all four Configuration entries; user without does not.
2. **Scan gate** — hidden unless `transaction_screenshot_strategy === admin_upload`.
3. **Group order** — `visibleFinanceRecordNavSections` returns groups `[payments, configuration, analytics, operations]` when all visible.
4. **Active state** — `/discounts/create` highlights Discounts; `/payment-plans/abc/edit` highlights Payment Plans; `/screenshots/create` highlights Scan Transaction Screenshots.

Add `is-finance-record-route.test.ts`:

- True for each new prefix and nested paths.
- False for unrelated routes (`/courses`, `/users`).

Manual smoke:

- From `/finances`, rail shows Configuration group; links navigate and rail persists.
- On `/discounts`, rail visible, Discounts active, `← Overview` works.
- Mobile section picker includes Configuration on small viewports.

---

## Rollout / risk

- **Low risk:** additive nav entries + layout wrappers; no API or URL changes.
- **Regression surface:** context rail mount/unmount on route transitions; verify no double rail or flash when crossing `/finances` ↔ `/discounts`.
- **Permissions:** unchanged; middleware already guards config routes.
