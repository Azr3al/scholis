# R11 — Finance Operations (Non–Student-Payments Report) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remediate every finance and finance-nav operational route outside the student-payments report shell so page composition, tokens, table/form contracts, money/status semantics, and inline-save feedback match `DESIGN.md` and merged R0–R5 contracts.

**Architecture:** R11 owns standalone `/finances/*` pages (except `/finances/student-payments/**` sub-routes) plus `/screenshots/create`. Shared student-payments report shell, ResourceTable report component, and Glide grid report internals are explicitly out of scope — serialized in R12 (ResourceTable path) and R13 (Glide path). R11 applies R3 column metadata and R5 page-shell helpers locally per route without forking primitives.

**Tech Stack:** Next.js App Router, React, ResourceTable (`@/components/data-table`), Vitest (`npm run test:unit`), Playwright browser harness from R0, DESIGN.md tokens under `.sj-root`.

**Program spec:** `docs/superpowers/specs/2026-07-12-ui-migration-remediation-program-design.md`  
**Planning baseline SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Dependencies (blocking):** R0 verification baseline, R1 token/theme convergence, R2 overlay stack, R3 table sizing contracts, R4 form/control sizing, R5 page composition — all must be merged on `dev` before R11 starts.

---

## Route assignment (R11 owns exactly these)

| Route pattern | Fixture URL (dev) | Personas | Primary viewport / theme |
| --- | --- | --- | --- |
| `/finances/cash-flow` | `/finances/cash-flow?courseId=1&date=2026-07-01T00:00:00.000Z` | Admin (`analytics.view`) | Desktop 1280×800 light + dark |
| `/finances/school-overview` | `/finances/school-overview?date=2026-07-01T00:00:00.000Z` | Admin | Desktop light |
| `/finances/payroll` | `/finances/payroll` | Teacher (`payroll.view`) + admin (`payroll.view_all`) | Desktop light |
| `/finances/microsoft-payroll` | `/finances/microsoft-payroll` | Admin (`payroll.view_all`, Microsoft tenant) | Desktop light |
| `/finances/rates` | `/finances/rates` | Admin (`rate.manage`) | Desktop light |
| `/finances/checkin-histories` | `/finances/checkin-histories` | Admin (`checkin.view_all`, non-Microsoft tenant) | Desktop light |
| `/finances/user-attendance` | `/finances/user-attendance` | Admin (`checkin.view_all`, Microsoft tenant) | Desktop light |
| `/finances/recent-transactions` | `/finances/recent-transactions` | Admin (`payment.view_all`) | Desktop 1280×800 light + dark |
| `/finances/receiver-transactions` | `/finances/receiver-transactions` | Admin (`payment.view_all`, admin-upload strategy tenant) | Desktop light |
| `/finances/unpaid-students` | `/finances/unpaid-students?date=2026-07-01T00:00:00.000Z` | Teacher/admin unpaid permissions | Desktop light |
| `/finances/make-payment` | `/finances/make-payment` | Student (`payment.make`) | Mobile 390×844 + desktop light |
| `/finances/payment-history` | `/finances/payment-history` | Student (`payment.view`) | Mobile + desktop light |
| `/screenshots/create` | `/screenshots/create` | Admin (`payment.record`, admin-upload strategy) | Desktop light |

**Not in R11 (assigned elsewhere):**

| Route | Owner plan |
| --- | --- |
| `/finances/student-payments` | R12 (ResourceTable view) + R13 (Glide view on same URL) |
| `/finances/student-payments/transaction-lookup` | R12 + R13 |
| `/courses/[id]/student-payments` | R12 + R13 |
| `/finances/student-payments/upload` | R14 |
| `/finances/student-payments/verification-upload` | R14 |
| `/finances/student-payments/coverage-review` | R14 |
| `/payment-plans/**`, `/payment-methods/**`, `/payment-infos/**`, `/discounts/**` | R8 administration cohort |

---

## Serialized ownership vs R12–R14

| File | R11 | R12 | R13 | R14 |
| --- | --- | --- | --- | --- |
| `src/app/(internal)/finances/recent-transactions/page.tsx` | **owns** | forbidden | forbidden (grid variant fixes in `student-payments-grid.tsx` only) | forbidden |
| `src/components/finances/student-payments-grid.tsx` | forbidden | forbidden | **owns** | forbidden |
| `src/components/finances/student-payments-report-shell.tsx` | forbidden | **owns** | read-only after R12 shell extraction merges | forbidden |
| `src/components/finances/student-payments-resource-table.tsx` | forbidden | **owns** | forbidden | forbidden |
| `src/app/(internal)/finances/student-payments/upload/page.tsx` | forbidden | forbidden | forbidden | **owns** |
| `src/lib/finances/student-payments-filter-ui.ts` | forbidden | **owns** resource-table constants | **owns** glide width constants only | forbidden |

**Execution order:** Finance waves are intentionally serialized: R11 merges before R12, R12 merges before R13, and R13 merges before R14 starts. R11 must not edit `student-payments-grid.tsx` or `student-payments-report-shell.tsx`. R11 `recent-transactions` ResourceTable work therefore completes before R13 touches `variant="recent-transactions"` grid behavior.

---

## Forbidden files (R11 must not modify)

- `src/components/finances/student-payments-report-shell.tsx`
- `src/components/finances/student-payments-resource-table.tsx`
- `src/components/finances/student-payments-grid.tsx` (except: zero edits; R13 owns)
- `src/components/finances/screenshot-preview-*.tsx`
- `src/lib/finances/screenshot-preview-*.ts`
- `src/app/(internal)/finances/student-payments/**` (all sub-routes)
- `src/app/(internal)/courses/[id]/student-payments/page.tsx`
- Shared primitives: `src/components/data-table/resource-table.tsx`, `src/components/primitives/**`, `src/components/edit-kit/**` (R3/R4 owners)
- `DESIGN.md`, R0–R5 contract modules

---

## Evidence / current behavior (baseline `05ac447b`)

1. **Split tokens on finance pages:** `coverage-review` and other routes mix `text-text-muted` / `bg-surface` with `text-muted-foreground` / `bg-background` (R1 must converge first).
2. **`recent-transactions/page.tsx` (lines 122–661):** Dual view via `useGridViewPreference("recent-transactions")`; ResourceTable path uses inline column defs without R3 `contentRole` metadata; `TransactionIdCell` (lines 66–119) uses `CellSaveFeedback` but column lacks `minWidth` contract; filter bar uses ad-hoc `w-60` widths; header actions float outside `PageHeader` pattern from R5.
3. **`unpaid-students/page.tsx`:** Uses `TypographyH1` + `ResourceTable` but filter controls lack R4 full-width combobox contract; money not shown (N/A) but date/course filters use legacy spacing.
4. **`receiver-transactions/page.tsx`:** Matched filter `Select` may clip under R2 overlay rules; columns lack numeric/date role metadata.
5. **`cash-flow/page.tsx` / `school-overview/page.tsx`:** Aggregate cards and tables need R5 page title + section spacing; money via `formatDecimalString` / `formatMoney` must preserve decimal semantics.
6. **`payroll/page.tsx`:** Session table + optional course grouping; money columns need right-align + `tabular-nums`.
7. **`make-payment/page.tsx` / `payment-history/page.tsx`:** Student flows; file upload + status display; mobile viewport regressions on card stack.
8. **Jul 11 payment commits (historical intent, re-verify at execution):** `d48a1ee3` soft-refetch after optimistic save; `b17f549e` `CellSaveFeedback` on resource table and recent transactions; `0703d939` payment status select stays mounted — R11 verifies these hold under R3/R4 sizing.

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/recent-transactions-column-meta.ts` | Create | R3 column role + width metadata for recent-transactions ResourceTable |
| `src/lib/finances/recent-transactions-column-meta.test.ts` | Create | Pure metadata tests |
| `src/app/(internal)/finances/recent-transactions/page.tsx` | Modify | Apply metadata, R5 header, preserve money/status semantics |
| `src/app/(internal)/finances/unpaid-students/unpaid-student-columns.tsx` | Modify | Column metadata + alignment |
| `src/app/(internal)/finances/receiver-transactions/page.tsx` | Modify | Column metadata + filter layout |
| `src/app/(internal)/finances/cash-flow/page.tsx` | Modify | R5 page shell + table money alignment |
| `src/app/(internal)/finances/school-overview/page.tsx` | Modify | R5 composition |
| `src/app/(internal)/finances/payroll/page.tsx` | Modify | Money column contracts |
| `src/app/(internal)/finances/rates/page.tsx` | Modify | Grid/editor layout |
| `src/app/(internal)/finances/checkin-histories/page.tsx` | Modify | Table overflow |
| `src/app/(internal)/finances/user-attendance/page.tsx` | Modify | Table overflow |
| `src/app/(internal)/finances/microsoft-payroll/page.tsx` | Modify | Export table layout |
| `src/app/(internal)/finances/make-payment/page.tsx` | Modify | Form width + mobile layout |
| `src/app/(internal)/finances/payment-history/page.tsx` | Modify | List/table layout |
| `src/app/(internal)/screenshots/create/page.tsx` | Modify | Upload layout (not multipart student-payments) |
| `src/app/(internal)/finances/_components/aggregate-cards.tsx` | Modify | Token + spacing only |
| `src/app/(internal)/finances/_components/ongoing-month-banner.tsx` | Modify | Banner z-index consumes R2 layer |

---

## Stop conditions

1. **Baseline drift:** `git merge-base HEAD 05ac447b` shows owned files changed on `dev` by R12/R13/R14 — stop and request plan refresh.
2. **R0–R5 regression:** `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, or R0 browser harness fails — stop all R11 work; escalate to contract owner.
3. **Missing fixture data:** Cannot load cash-flow course, payroll user, or receiver-transactions rows — mark route blocked in manifest; do not weaken assertions.
4. **Temptation to patch student-payments shell:** Any required change touches `student-payments-report-shell.tsx` — stop R11; file belongs to R12.

## Rollback / data safety

- UI-only changes; no migrations. Inline edits on `recent-transactions` use the existing `updateEntity("user-payments", row.id, { transaction_id: next })` call — optimistic cache patch already shipped; R11 must not remove rollback paths.
- `make-payment` POST is irreversible business-side — manual QA uses test student fixtures only; no production uploads.
- CSV batch `/screenshots/create` triggers backend jobs — QA uses staging tenant.

---

### Task 1: Recent-transactions column metadata helper (TDD)

**Files:**
- Create: `src/lib/finances/recent-transactions-column-meta.ts`
- Create: `src/lib/finances/recent-transactions-column-meta.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  recentTransactionsColumnLayout,
  RECENT_TXN_TXN_ID_MIN_WIDTH,
} from "./recent-transactions-column-meta";

describe("recentTransactionsColumnLayout", () => {
  it("assigns transaction_id a wide identifier role with left alignment", () => {
    const layout = recentTransactionsColumnLayout({
      canVerify: true,
      canViewScreenshots: true,
      userUploadStrategy: false,
    });
    const txn = layout.find((c) => c.id === "transaction_id");
    expect(txn).toMatchObject({
      contentRole: "identifier",
      minWidth: RECENT_TXN_TXN_ID_MIN_WIDTH,
      align: "left",
      truncate: false,
    });
  });

  it("assigns parsed_amount numeric right alignment when verifier", () => {
    const layout = recentTransactionsColumnLayout({ canVerify: true, canViewScreenshots: false, userUploadStrategy: false });
    const amount = layout.find((c) => c.id === "parsed_amount");
    expect(amount).toMatchObject({
      contentRole: "money",
      align: "right",
      minWidth: "7.5rem",
    });
  });

  it("omits parsed_amount when user cannot verify", () => {
    const layout = recentTransactionsColumnLayout({ canVerify: false, canViewScreenshots: true, userUploadStrategy: false });
    expect(layout.some((c) => c.id === "parsed_amount")).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/finances/recent-transactions-column-meta.test.ts`

Expected: FAIL with `Cannot find module './recent-transactions-column-meta'` or missing exports.

- [x] **Step 3: Implement**

```ts
import type { ColumnLayoutMeta } from "@/components/data-table/column-layout";

export const RECENT_TXN_TXN_ID_MIN_WIDTH = "18rem";
export const RECENT_TXN_DESCRIPTION_MIN_WIDTH = "20rem";
export const RECENT_TXN_STUDENT_MIN_WIDTH = "12rem";

export type RecentTxnLayoutOpts = {
  canVerify: boolean;
  canViewScreenshots: boolean;
  userUploadStrategy: boolean;
};

export function recentTransactionsColumnLayout(
  opts: RecentTxnLayoutOpts,
): ColumnLayoutMeta[] {
  const cols: ColumnLayoutMeta[] = [
    {
      id: "user__name",
      contentRole: "person",
      minWidth: RECENT_TXN_STUDENT_MIN_WIDTH,
      preferredWidth: "14rem",
      align: "left",
      truncate: true,
    },
    {
      id: "course",
      contentRole: "prose",
      minWidth: "10rem",
      preferredWidth: "12rem",
      align: "left",
      truncate: true,
    },
    {
      id: "transaction_id",
      contentRole: "identifier",
      minWidth: RECENT_TXN_TXN_ID_MIN_WIDTH,
      preferredWidth: "20rem",
      align: "left",
      truncate: false,
    },
    {
      id: "status",
      contentRole: "status",
      minWidth: "10rem",
      preferredWidth: "11rem",
      align: "left",
      truncate: false,
    },
    {
      id: "description",
      contentRole: "prose",
      minWidth: RECENT_TXN_DESCRIPTION_MIN_WIDTH,
      preferredWidth: "22rem",
      align: "left",
      truncate: false,
    },
    {
      id: "remarks",
      contentRole: "prose",
      minWidth: "14rem",
      preferredWidth: "16rem",
      align: "left",
      truncate: false,
    },
    {
      id: "created_by",
      contentRole: "person",
      minWidth: "9rem",
      align: "left",
      truncate: true,
    },
  ];

  if (opts.userUploadStrategy) {
    cols.splice(4, 0, {
      id: "billing_start_date",
      contentRole: "date",
      minWidth: "11rem",
      align: "left",
      truncate: false,
    });
  } else {
    cols.splice(4, 0, {
      id: "payment_method__name",
      contentRole: "prose",
      minWidth: "10rem",
      align: "left",
      truncate: true,
    });
    cols.splice(5, 0, {
      id: "date_on_screenshot",
      contentRole: "date",
      minWidth: "9rem",
      align: "left",
      truncate: false,
    });
  }

  if (opts.canVerify) {
    const statusIdx = cols.findIndex((c) => c.id === "status");
    cols.splice(statusIdx, 0, {
      id: "parsed_amount",
      contentRole: "money",
      minWidth: "7.5rem",
      preferredWidth: "8.5rem",
      align: "right",
      truncate: false,
    });
  }

  if (opts.canViewScreenshots) {
    cols.push({
      id: "screenshot",
      contentRole: "action",
      minWidth: "6.5rem",
      align: "center",
      truncate: false,
    });
  }

  return cols;
}
```

- [x] **Step 4: Run test — expect PASS**

Run: `npm run test:unit -- src/lib/finances/recent-transactions-column-meta.test.ts`

Expected: `Tests 3 passed`

- [x] **Step 5: Commit**

```bash
git add src/lib/finances/recent-transactions-column-meta.ts src/lib/finances/recent-transactions-column-meta.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): add recent-transactions column layout metadata helper

EOF
)"
```

---

### Task 2: Apply R3 metadata + R5 header to recent-transactions ResourceTable path

**Files:**
- Modify: `src/app/(internal)/finances/recent-transactions/page.tsx:321-502` (columns), `552-611` (filters), `637-660` (layout)

- [x] **Step 1: Import layout helper and R5 header**

At top of `page.tsx`, add:

```ts
import { PageHeader } from "@/components/layout/page-header";
import { applyColumnLayoutMeta } from "@/components/data-table/column-layout";
import { recentTransactionsColumnLayout } from "@/lib/finances/recent-transactions-column-meta";
```

- [x] **Step 2: Wrap columns with metadata**

Make these two exact edits without replacing any cell renderer:

1. Immediately after the existing guard at lines 321–323:

```ts
const columns: Column<UserPayment>[] = useMemo(() => {
  if (!tenant || !user) return [];

  const layout = recentTransactionsColumnLayout({
    canVerify: canVerifyPayments(user),
    canViewScreenshots: canViewPaymentScreenshots(user),
    userUploadStrategy:
      tenant.transaction_screenshot_strategy ===
      TransactionScreenshotStrategy.user_upload,
  });
```

2. Replace the single existing statement at line 493:

```ts
return cols;
```

with:

```ts
return applyColumnLayoutMeta(cols, layout);
```

Keep the current dependency array exactly:

```ts
[
  tenant,
  user,
  currencySymbol,
  openStudentById,
  router,
  pathname,
  searchParams,
]
```

Preserve `TransactionIdCell` `CellSaveFeedback` wrapper (lines 104–118) — do not remount `Input` on save; `useCellAutosave` identity must remain stable.

- [x] **Step 3: Replace ad-hoc page chrome with PageHeader**

Replace lines 639–642:

```tsx
<PageHeader
  title="Recent transactions"
  actions={headerActions}
  className="mb-6"
/>
```

Remove duplicate floating header `mb-7 flex items-center justify-end` wrapper.

- [x] **Step 4: Normalize filter control widths (R4 contract)**

In `filterSlot`, change Transaction ID input `className="w-60"` to `className="h-9 w-full min-w-[13rem] max-w-xs"` and wrap in `div className="flex w-52 min-w-0 flex-col gap-1.5"` matching student-payments filter rhythm.

- [x] **Step 5: Run verification**

Run: `npm run test:unit -- src/lib/finances/recent-transactions-column-meta.test.ts`
Run: `npm run lint`
Run: `npm run typecheck`

Expected: all PASS (typecheck assumes R0 added script).

- [x] **Step 6: Manual browser check**

Role: admin with `payment.view_all`. Viewport: 1280×800. Themes: light and dark.

1. Open `/finances/recent-transactions`.
2. Confirm page title uses R5 serif scale.
3. Horizontal scroll appears before transaction ID column shrinks below ~18rem.
4. Edit transaction ID — saving spinner → tick without input remount flash.
5. Toggle status — select stays mounted (Jul 11 behavior).
6. Screenshot: `docs/superpowers/evidence/r11-recent-transactions-light.png`, `r11-recent-transactions-dark.png`.

- [x] **Step 7: Commit**

```bash
git add src/app/(internal)/finances/recent-transactions/page.tsx
git commit -m "$(cat <<'EOF'
fix(finances): apply column layout and page header to recent transactions

EOF
)"
```

---

### Task 3: Unpaid students column alignment + overflow

**Files:**
- Modify: `src/app/(internal)/finances/unpaid-students/unpaid-student-columns.tsx`
- Modify: `src/app/(internal)/finances/unpaid-students/page.tsx:80-180` (filter + table wrapper)

- [x] **Step 1: Add column metadata to unpaid columns**

In `unpaid-student-columns.tsx`, export layout alongside columns:

```ts
import type { ColumnLayoutMeta } from "@/components/data-table/column-layout";

export const unpaidStudentColumnLayout: ColumnLayoutMeta[] = [
  { id: "user__name", contentRole: "person", minWidth: "12rem", align: "left", truncate: true },
  { id: "course__title", contentRole: "prose", minWidth: "10rem", align: "left", truncate: true },
  { id: "billing_month", contentRole: "date", minWidth: "9rem", align: "left", truncate: false },
];
```

Apply `applyColumnLayoutMeta` in page when building `columns` prop.

- [x] **Step 2: Run unit tests**

Run: `npm run test:unit -- src/config/__tests__/route-permissions.test.ts`

Expected: PASS (permissions unchanged).

- [x] **Step 3: Manual check**

Route: `/finances/unpaid-students?date=2026-07-01T00:00:00.000Z`. Screenshot: `docs/superpowers/evidence/r11-unpaid-students.png`.

- [x] **Step 4: Commit**

```bash
git add src/app/(internal)/finances/unpaid-students/
git commit -m "$(cat <<'EOF'
fix(finances): unpaid students table column layout and filter spacing

EOF
)"
```

---

### Task 4: Receiver transactions — matched filter overlay + columns

**Files:**
- Modify: `src/app/(internal)/finances/receiver-transactions/page.tsx:23-120`

- [x] **Step 1: Add `filterSlot` with R4-sized Select**

Ensure matched filter `Select` uses `size="sm"` + `className="min-w-[10rem]"` from R4 contract and portal layer from R2 (no `z-400` local overrides).

- [x] **Step 2: Money/status columns**

For `parsed_amount` / `is_matched` cells, use `tabular-nums` and `contentRole: "status" | "money"` via `applyColumnLayoutMeta`.

- [x] **Step 3: Verification**

Run: `npm run lint && npm run test:unit`

- [x] **Step 4: Screenshot** `docs/superpowers/evidence/r11-receiver-transactions.png`

- [x] **Step 5: Commit**

```bash
git add src/app/(internal)/finances/receiver-transactions/page.tsx
git commit -m "$(cat <<'EOF'
fix(finances): receiver transactions table layout and filter overlay

EOF
)"
```

---

### Task 5: Cash flow + school overview composition

**Files:**
- Modify: `src/app/(internal)/finances/cash-flow/page.tsx:57-235`
- Modify: `src/app/(internal)/finances/school-overview/page.tsx`
- Modify: `src/app/(internal)/finances/_components/aggregate-cards.tsx`

- [x] **Step 1: Replace raw `TypographyH1` usage with `PageHeader`**

Add this import:

```ts
import { PageHeader } from "@/components/layout/page-header";
```

Delete the `TypographyH1` import. Replace lines 166–174 with this complete header:

```tsx
<PageHeader
  title="Cash flow"
  actions={
    <Link
      href={`/finances/school-overview?date=${encodeURIComponent(date.toISOString())}`}
      className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
    >
      School Overview
    </Link>
  }
/>
```

Keep the ongoing-month banner invocation at its current position after `CashFlowNotes` with these exact props:

```tsx
<OngoingMonthBanner show={isOngoingMonth && courseId !== ""} />
```

Keep aggregate cards inside the successful non-empty result branch with these exact props:

```tsx
<AggregateCards
  aggregate={aggregate}
  currencySymbol={currencySymbol}
/>
```

- [x] **Step 2: Table money columns**

Ensure cash-flow `Table` columns use `formatDecimalString` / `formatMoney` without stripping decimals; align numeric cells `text-right tabular-nums`.

- [x] **Step 3: Document horizontal overflow**

Assert no `document.documentElement.scrollWidth > clientWidth` at 1280px via R0 browser test snippet for `/finances/cash-flow?courseId=1`.

- [x] **Step 4: Screenshots** `r11-cash-flow-light.png`, `r11-school-overview-light.png`

- [x] **Step 5: Commit**

```bash
git add src/app/(internal)/finances/cash-flow/page.tsx src/app/(internal)/finances/school-overview/page.tsx src/app/(internal)/finances/_components/
git commit -m "$(cat <<'EOF'
fix(finances): cash flow and school overview page composition

EOF
)"
```

---

### Task 6: Payroll family (payroll, microsoft-payroll, rates)

**Files:**
- Modify: `src/app/(internal)/finances/payroll/page.tsx`
- Modify: `src/app/(internal)/finances/microsoft-payroll/page.tsx`
- Modify: `src/app/(internal)/finances/rates/page.tsx`
- Modify: `src/components/finances/employee-rates-grid.tsx`
- Modify: `src/components/finances/course-rates-editor.tsx`

- [x] **Step 1: Payroll earnings columns**

Add `contentRole: "money"` metadata; cells:

```tsx
<span className="block text-right tabular-nums">{formatMoney(value, currencySymbol)}</span>
```

- [x] **Step 2: Rates editor full-width exception**

Document dense-grid exception in file comment; use R5 `PageContainer width="wide"` consistently.

- [x] **Step 3: Manual role matrix**

Teacher on `/finances/payroll` (own payroll only); admin selects another user.

- [x] **Step 4: Screenshots** `r11-payroll-teacher.png`, `r11-rates-admin.png`

- [x] **Step 5: Commit**

```bash
git add src/app/(internal)/finances/payroll/page.tsx src/app/(internal)/finances/microsoft-payroll/page.tsx src/app/(internal)/finances/rates/page.tsx src/components/finances/employee-rates-grid.tsx src/components/finances/course-rates-editor.tsx
git commit -m "$(cat <<'EOF'
fix(finances): payroll and rates money alignment and page layout

EOF
)"
```

---

### Task 7: Checkin histories + user attendance tables

**Files:**
- Modify: `src/app/(internal)/finances/checkin-histories/page.tsx`
- Modify: `src/app/(internal)/finances/user-attendance/page.tsx`

- [x] **Step 1: Apply R3 defaults for date/time columns**

`contentRole: "date"`, `minWidth: "9rem"`, horizontal scroll on table wrapper `min-w-0 overflow-x-auto`.

- [x] **Step 2: Verification + screenshot** per route.

- [x] **Step 3: Commit**

```bash
git add src/app/(internal)/finances/checkin-histories/page.tsx src/app/(internal)/finances/user-attendance/page.tsx
git commit -m "$(cat <<'EOF'
fix(finances): checkin and attendance table overflow contracts

EOF
)"
```

---

### Task 8: Student payment surfaces (make-payment, payment-history, screenshots/create)

**Files:**
- Modify: `src/app/(internal)/finances/make-payment/page.tsx`
- Modify: `src/app/(internal)/finances/payment-history/page.tsx`
- Modify: `src/app/(internal)/screenshots/create/page.tsx`

- [x] **Step 1: make-payment mobile layout**

Wrap `PaymentMethodCard` grid in `grid grid-cols-1 gap-4 sm:grid-cols-2`; file upload obeys R4 full-width field measure.

- [x] **Step 2: payment-history status semantics**

Preserve `UserPaymentStatus` display via `snakeToTitle`; no local status vocabulary.

- [x] **Step 3: screenshots/create**

Align `FileDragAndDrop` + submit button spacing with R5; do not implement multipart UX (R14 scope).

- [x] **Step 4: Mobile manual pass** 390×844 on make-payment.

- [x] **Step 5: Commit**

```bash
git add src/app/(internal)/finances/make-payment/page.tsx src/app/(internal)/finances/payment-history/page.tsx src/app/(internal)/screenshots/create/page.tsx
git commit -m "$(cat <<'EOF'
fix(finances): student payment and batch screenshot page layout

EOF
)"
```

---

## Final verification gate

Run from `schedjuice-reimagined-fe/`:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:browser -- --grep "R11 finance"
```

**Worker-only (local implementation aid — not QA signoff):** the `--grep "R11 finance"` subset above narrows browser coverage during development; independent QA must run the full `npm run test:browser` gate.

Expected: exit code 0 on all; browser suite covers recent-transactions geometry from R0 harness.

No `test.skip`, `describe.skip`, `it.skip`, CLI skip flag, test exclusion, or omitted browser project is acceptable.

---

## Independent QA prompt (paste-ready)

```
You are an independent QA agent. Do NOT patch code.

Repository: schedjuice-reimagined-fe
Baseline: merge commit containing R11 finance operations remediation
Plan: docs/superpowers/plans/2026-07-12-ui-remediation-r11-finance-operations.md

Acceptance criteria:
1. Every R11 route loads without console errors for the listed personas.
2. No document-level horizontal overflow at 1280×800 on table routes.
3. recent-transactions: transaction ID column ≥18rem effective width; inline save shows spinner→tick without input remount; status select remains mounted during save.
4. Money columns use right-aligned tabular numerals; status values match UserPaymentStatus vocabulary.
5. Light and dark themes use single semantic token vocabulary (no raw legacy palette classes in touched routes).
6. Forbidden routes unchanged: /finances/student-payments/** report views (delegate to R12/R13 QA).

Execute (full gate required — skipped/focused/grep subsets are not acceptable for QA signoff):
npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:browser

Manual matrix:
- /finances/recent-transactions — admin, 1280×800, light+dark, screenshot required
- /finances/unpaid-students — teacher, 1280×800, light, screenshot required
- /finances/cash-flow — admin with course fixture, light, screenshot required
- /finances/make-payment — student, 390×844, light, screenshot required
- /finances/payroll — teacher + admin, light

Return: pass/fail per route with screenshot paths, repro steps for failures, suspected owning plan.
```

---

## Spec coverage self-review

| Spec section | Task |
| --- | --- |
| 8.4 Page layout | Tasks 2, 5, 6, 8 |
| 8.5 Form sizing | Tasks 2, 8 |
| 8.6 Table contract | Tasks 1–4, 6, 7 |
| 9.3 Browser assertions | Tasks 2, 5 manual + R0 grep |
| 10.3 Failure report format | QA prompt |
| Finance serialization | Serialized ownership section |
