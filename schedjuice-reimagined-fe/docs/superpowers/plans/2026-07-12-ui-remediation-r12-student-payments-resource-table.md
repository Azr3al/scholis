# R12 — Student-Payments ResourceTable Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate the original (ResourceTable) student-payments report on all report surfaces so column widths, alignment, overflow, hover screenshot preview, inline save feedback without remount/flash, group-row expand/delete/stub semantics, and sticky preview column conform to R3/R4/R5 contracts and Jul 11 table-fix evidence.

**Architecture:** R12 owns the ResourceTable branch of `StudentPaymentsReportShell` and `StudentPaymentsResourceTable`. A prerequisite extraction task stabilizes shell layout APIs so R13 can modify the Glide branch without concurrent edits. Pure helpers (`flatten-payment-report-rows`, `payment-row-utils`, `student-payments-filter-ui` resource constants) receive R3 column metadata. Hover preview uses existing `applyScreenshotPreviewHover` + leave-to-clear; Glide click preview is R13-only.

**Tech Stack:** Next.js App Router, ResourceTable, Tanestack Query, Vitest, Jul 11 plans as historical evidence (`2026-07-11-student-payments-original-table-fixes.md`, `2026-07-11-inline-edit-optimistic-save-feedback.md`, `2026-07-11-payment-status-select-layout.md`).

**Program spec:** `docs/superpowers/specs/2026-07-12-ui-migration-remediation-program-design.md`  
**Planning baseline SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Dependencies (blocking):** R0–R5 merged; **R11 must not be editing shared files**; R13 blocked until R12 Task 0 (shell extraction) merges.

---

## Route assignment (ResourceTable view on these URLs)

| Route pattern | Fixture URL | View mode | Personas |
| --- | --- | --- | --- |
| `/finances/student-payments` | `/finances/student-payments?date=2026-07-01T00:00:00.000Z` | ResourceTable (toggle off Glide) | Admin `payment.view_all` |
| `/finances/student-payments?courseId=N` | course-scoped report | ResourceTable | Admin / teacher with course access |
| `/finances/student-payments/transaction-lookup?transactionId=TXN` | global txn lookup | ResourceTable | Admin |
| `/courses/[id]/student-payments` | `/courses/1/student-payments?date=2026-07-01T00:00:00.000Z` | ResourceTable | Teacher/admin on course hub |

**Glide view on the same URLs is remediated in R13 — not duplicated in this manifest.**

---

## Serialized ownership vs R11/R13/R14

| File | Owner | Notes |
| --- | --- | --- |
| `src/components/finances/student-payments-report-shell.tsx` | **R12** | Task 0 extracts layout; R12 owns lines 92–137, 148–395 (ResourceTable + shared preview wiring) |
| `src/components/finances/student-payments-resource-table.tsx` | **R12** | Full file (975 lines) |
| `src/lib/finances/student-payments-filter-ui.ts` | **R12** | Lines 4–33 resource constants + `paymentEditableFieldInputClassName` |
| `src/lib/finances/flatten-payment-report-rows.ts` | **R12** | Expand/flatten |
| `src/lib/data-sheets/payment-row-utils.ts` | **R12** | Editability + missing-screenshot |
| `src/components/finances/screenshot-preview-column-connected.tsx` | **R12** | Hover path integration |
| `src/lib/finances/apply-screenshot-preview-hover.ts` | **R12** | Hover contract tests |
| `src/components/finances/student-payments-grid.tsx` | **R13** | R12 **forbidden** |
| `src/lib/finances/screenshot-preview-empty-copy.ts` | **R12** | Keeps `"hover"` branch; R13 uses `"click"` in Glide shell only |

**Prerequisite for R13:** R12 Task 0 must merge before any R13 worker checks out `student-payments-report-shell.tsx`.

---

## Forbidden files (R12)

- `src/components/finances/student-payments-grid.tsx`
- `src/app/(internal)/finances/student-payments/upload/page.tsx`
- `src/app/(internal)/finances/student-payments/verification-upload/page.tsx`
- `src/app/(internal)/finances/student-payments/coverage-review/page.tsx`
- `src/app/(internal)/finances/recent-transactions/page.tsx` (R11)
- R3/R4 primitive sources (consume APIs only)

---

## Owned files

- `src/components/finances/student-payments-report-shell.tsx`
- `src/components/finances/student-payments-report-shell-layout.tsx` (created in Task 0)
- `src/components/finances/student-payments-resource-table.tsx`
- `src/lib/finances/student-payments-filter-ui.ts` (resource-table constants)
- `src/app/(internal)/finances/student-payments/page.tsx`
- `src/app/(internal)/finances/student-payments/student-payment-page-content.tsx`
- `src/app/(internal)/finances/student-payments/transaction-lookup/page.tsx`
- `src/app/(internal)/courses/[id]/student-payments/page.tsx`

R12 may adjust shared-shell page chrome on the three report routes above while leaving the Glide branch untouched (R13 owns Glide-only changes).

---

## Evidence / current behavior (`05ac447b`)

### `student-payments-report-shell.tsx` (396 lines)

- Lines 49–395: `useGridViewPreference("student-payments")` branches at line 204 — Glide returns early; ResourceTable path lines 224–395.
- Lines 92–97: `handleRowHover` calls `applyScreenshotPreviewHover` — correct for ResourceTable.
- Lines 116–118: `screenshotPreviewEmptyCopy(useGlideView ? "click" : "hover")` — ResourceTable should pass `"hover"` only from R12-owned branch.
- Lines 327–389: Table in `overflow-auto` left pane; preview `sticky top-0` right pane — Jul 11 sticky intent present; verify preview does not scroll away on long tables.
- Lines 231–325: Filter bar uses mixed `text-muted-foreground` and fixed widths `w-52`, `w-[11.25rem]`, `min-w-[16rem]` — needs R4 alignment.

### `student-payments-resource-table.tsx` (975 lines)

- Lines 541–776: Column defs — Student uses `STUDENT_PAYMENT_RESOURCE_STUDENT_CELL_CLASS`; txn/description use `paymentEditableFieldInputClassName` via `PaymentEditableFieldCell` (lines 158–251).
- Lines 184–211: Optimistic cache patch + `softRefetchStudentPaymentsReport` on save — Jul 11 `d48a1ee3` behavior; must not regress to remount flash.
- Lines 456–515: Synthetic stub create via `buildSyntheticPaymentStubFormData`.
- Lines 404–454: Group expand fetches `user-payment-groups/${gid}`.
- Missing: explicit R3 `ColumnLayoutMeta` on all columns; horizontal scroll may crush editable inputs below min widths.

### Jul 11 specs/commits (re-read at execution)

- `2026-07-11-student-payments-original-table-fixes-design.md` — expand, delete, stub, sticky preview, per-part description on upload (upload = R14).
- `6d12ec24` original payments table expand/delete/stub.
- `0703d939` / `51f9c7f9` optimistic save + status select mounted.

---

## File structure

| File | Action |
| --- | --- |
| `src/components/finances/student-payments-report-shell-layout.tsx` | Create — shared chrome extracted in Task 0 |
| `src/components/finances/student-payments-report-shell.tsx` | Modify — wire layout; ResourceTable branch |
| `src/lib/finances/student-payments-resource-column-meta.ts` | Create |
| `src/lib/finances/student-payments-resource-column-meta.test.ts` | Create |
| `src/lib/finances/student-payments-filter-ui.ts` | Modify — width floors |
| `src/lib/finances/student-payments-filter-ui.test.ts` | Modify |
| `src/components/finances/student-payments-resource-table.tsx` | Modify — apply metadata, overflow |
| `src/components/datatable/user-payment-status-inline-form.tsx` | Modify — R4 `PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS` verify |
| `src/lib/finances/student-payments-report-shell-layout.test.ts` | Create — pure class helper tests |

---

## Stop conditions

1. R13 or R14 has modified `student-payments-report-shell.tsx` on the branch — stop; rebase and refresh plan.
2. R0–R5 browser/typecheck gate fails.
3. Required admin-report fixture cannot load group rows — block route; do not skip expand tests.
4. Task requires editing `student-payments-grid.tsx` — stop; belongs to R13.

## Rollback / data safety

- Inline edits and deletes call production APIs — use staging tenant and test students only.
- `deleteEntity("user-payments", id)` is destructive — manual QA uses disposable payment rows.
- Optimistic cache patches must keep `restoreQueryCacheSnapshots` on failure (already in `PaymentEditableFieldCell`).

---

### Task 0: Extract shell layout module (R13 prerequisite — must merge first)

**Files:**
- Create: `src/components/finances/student-payments-report-shell-layout.tsx`
- Modify: `src/components/finances/student-payments-report-shell.tsx:327-344` (header chrome)

- [ ] **Step 1: Write failing test for layout class helper**

```ts
// src/lib/finances/student-payments-report-shell-layout.test.ts
import { describe, expect, it } from "vitest";
import { studentPaymentsReportShellClassName } from "@/components/finances/student-payments-report-shell-layout";

describe("studentPaymentsReportShellClassName", () => {
  it("returns full-width bordered shell with min height", () => {
    expect(studentPaymentsReportShellClassName()).toContain("min-h-[75dvh]");
    expect(studentPaymentsReportShellClassName()).toContain("overflow-hidden");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:unit -- src/lib/finances/student-payments-report-shell-layout.test.ts`

- [ ] **Step 3: Implement layout module**

```tsx
// src/components/finances/student-payments-report-shell-layout.tsx
"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function studentPaymentsReportShellClassName(): string {
  return cn(
    "flex min-h-[75dvh] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background",
    "shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]",
  );
}

export type StudentPaymentsReportHeaderProps = {
  title: string;
  summaryLine: string;
  actions?: ReactNode;
};

export function StudentPaymentsReportHeader({
  title,
  summaryLine,
  actions,
}: StudentPaymentsReportHeaderProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold tracking-tight">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{summaryLine}</p>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export type StudentPaymentsSplitPaneProps = {
  main: ReactNode;
  side?: ReactNode;
  showSide: boolean;
};

export function StudentPaymentsSplitPane({
  main,
  side,
  showSide,
}: StudentPaymentsSplitPaneProps) {
  return (
    <div
      className={cn(
        "grid min-h-0 flex-1 overflow-hidden",
        showSide
          ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)]"
          : "grid-cols-1",
      )}
    >
      <div className="min-h-0 min-w-0 overflow-auto p-3">{main}</div>
      {showSide && side ? (
        <div className="sticky top-0 self-start max-h-[min(100%,75dvh)]">{side}</div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Refactor shell ResourceTable branch to use layout**

In `student-payments-report-shell.tsx`, replace lines 329–389 wrapper with:

```tsx
import {
  studentPaymentsReportShellClassName,
  StudentPaymentsReportHeader,
  StudentPaymentsSplitPane,
} from "@/components/finances/student-payments-report-shell-layout";

// inside ResourceTable return:
<div className={studentPaymentsReportShellClassName()}>
  <StudentPaymentsReportHeader
    title="Student payments"
    summaryLine={summaryLine}
    actions={headerActions}
  />
  <div className="shrink-0 border-b border-border bg-muted/20">
    <div className="px-4 py-3">{filterControls}</div>
  </div>
  <PaymentGridSummaryStrip
    rows={report.rows}
    apiSummary={report.apiSummary}
    currencySymbol={currencySymbol}
    fixedCourseId={fixedCourseId}
    courseMeta={courseMeta}
    selectedCourse={report.selectedCourseEntity}
    monthAnchor={report.monthDate}
    variant="report"
  />
  <StudentPaymentsSplitPane
    showSide={Boolean(previewColumn)}
    main={
      <StudentPaymentsResourceTable
        rows={report.rows}
        isLoading={report.showSkeleton}
        isError={report.isError}
        error={report.isError ? new Error("Failed to load payments.") : null}
        refetch={report.refetch}
        hideCourseColumn={report.hideCourseColumn}
        monthDate={report.monthDate}
        onOpenStudent={openStudent}
        onViewScreenshot={(url) => setViewImageUrl(url)}
        onEditCoverage={openCoverageEdit}
        tableUid={tableUid}
        onRowHover={handleRowHover}
      />
    }
    side={previewColumn ?? undefined}
  />
</div>
```

R12 must not edit the Glide return branch at baseline lines 204–221. R13 adopts the extracted layout imports after Task 0 merges.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm run test:unit -- src/lib/finances/student-payments-report-shell-layout.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/components/finances/student-payments-report-shell-layout.tsx src/components/finances/student-payments-report-shell.tsx src/lib/finances/student-payments-report-shell-layout.test.ts
git commit -m "$(cat <<'EOF'
refactor(finances): extract student payments report shell layout for R12/R13 serialization

EOF
)"
```

---

### Task 1: ResourceTable column metadata (TDD)

**Files:**
- Create: `src/lib/finances/student-payments-resource-column-meta.ts`
- Create: `src/lib/finances/student-payments-resource-column-meta.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  studentPaymentsResourceColumnLayout,
  STUDENT_PAYMENT_TXN_COL_MIN,
  STUDENT_PAYMENT_DESC_COL_MIN,
} from "./student-payments-resource-column-meta";

describe("studentPaymentsResourceColumnLayout", () => {
  it("sets transaction_id identifier floor to 18rem", () => {
    const layout = studentPaymentsResourceColumnLayout({
      hideCourseColumn: false,
      userUploadStrategy: false,
      canVerify: true,
      canViewScreenshots: true,
    });
    expect(layout.find((c) => c.id === "transaction_id")?.minWidth).toBe(
      STUDENT_PAYMENT_TXN_COL_MIN,
    );
    expect(STUDENT_PAYMENT_TXN_COL_MIN).toBe("18rem");
  });

  it("sets description prose floor to 20rem left aligned", () => {
    const layout = studentPaymentsResourceColumnLayout({
      hideCourseColumn: true,
      userUploadStrategy: false,
      canVerify: true,
      canViewScreenshots: false,
    });
    const desc = layout.find((c) => c.id === "description");
    expect(desc).toMatchObject({
      minWidth: STUDENT_PAYMENT_DESC_COL_MIN,
      align: "left",
      truncate: false,
    });
  });

  it("sets parsed_amount money column right aligned", () => {
    const layout = studentPaymentsResourceColumnLayout({
      hideCourseColumn: false,
      userUploadStrategy: false,
      canVerify: true,
      canViewScreenshots: false,
    });
    expect(layout.find((c) => c.id === "parsed_amount")).toMatchObject({
      contentRole: "money",
      align: "right",
    });
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npm run test:unit -- src/lib/finances/student-payments-resource-column-meta.test.ts`

- [ ] **Step 3: Implement**

```ts
import type { ColumnLayoutMeta } from "@/components/data-table/column-layout";

export const STUDENT_PAYMENT_TXN_COL_MIN = "18rem";
export const STUDENT_PAYMENT_DESC_COL_MIN = "20rem";
export const STUDENT_PAYMENT_STUDENT_COL_MIN = "12rem";
export const STUDENT_PAYMENT_STATUS_COL_MIN = "11rem";

export type StudentPaymentsResourceLayoutOpts = {
  hideCourseColumn: boolean;
  userUploadStrategy: boolean;
  canVerify: boolean;
  canViewScreenshots: boolean;
};

export function studentPaymentsResourceColumnLayout(
  opts: StudentPaymentsResourceLayoutOpts,
): ColumnLayoutMeta[] {
  const cols: ColumnLayoutMeta[] = [
    { id: "_serial", contentRole: "identifier", minWidth: "3rem", align: "center" },
    {
      id: "user__name",
      contentRole: "person",
      minWidth: STUDENT_PAYMENT_STUDENT_COL_MIN,
      preferredWidth: "14rem",
      align: "left",
      truncate: false,
    },
  ];
  if (!opts.hideCourseColumn) {
    cols.push({
      id: "course",
      contentRole: "prose",
      minWidth: "10rem",
      align: "left",
      truncate: true,
    });
  }
  cols.push(
    {
      id: "parsed_amount",
      contentRole: "money",
      minWidth: "7.5rem",
      align: "right",
      truncate: false,
    },
    {
      id: "payment_method",
      contentRole: "prose",
      minWidth: "10rem",
      align: "left",
      truncate: false,
    },
    {
      id: "status",
      contentRole: "status",
      minWidth: STUDENT_PAYMENT_STATUS_COL_MIN,
      align: "left",
      truncate: false,
    },
    {
      id: "transaction_id",
      contentRole: "identifier",
      minWidth: STUDENT_PAYMENT_TXN_COL_MIN,
      preferredWidth: "20rem",
      align: "left",
      truncate: false,
    },
    {
      id: "description",
      contentRole: "prose",
      minWidth: STUDENT_PAYMENT_DESC_COL_MIN,
      preferredWidth: "22rem",
      align: "left",
      truncate: false,
    },
  );
  if (opts.canViewScreenshots) {
    cols.push({
      id: "screenshot",
      contentRole: "action",
      minWidth: "5rem",
      align: "center",
    });
  }
  cols.push({
    id: "actions",
    contentRole: "action",
    minWidth: "8rem",
    align: "right",
  });
  return cols;
}
```

- [ ] **Step 4: PASS + commit**

```bash
git add src/lib/finances/student-payments-resource-column-meta.ts src/lib/finances/student-payments-resource-column-meta.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): student payments ResourceTable column layout metadata

EOF
)"
```

---

### Task 2: Apply metadata in StudentPaymentsResourceTable

**Files:**
- Modify: `src/components/finances/student-payments-resource-table.tsx:541-776`

- [ ] **Step 1: Import and apply**

```ts
import { applyColumnLayoutMeta } from "@/components/data-table/column-layout";
import { studentPaymentsResourceColumnLayout } from "@/lib/finances/student-payments-resource-column-meta";
```

At end of `columns` useMemo:

```ts
const layout = studentPaymentsResourceColumnLayout({
  hideCourseColumn,
  userUploadStrategy,
  canVerify,
  canViewScreenshots,
});
return applyColumnLayoutMeta(cols, layout);
```

- [ ] **Step 2: Wrap ResourceTable in horizontal scroll container**

```tsx
<div className="min-w-0 overflow-x-auto">
  <ResourceTable
    list={list}
    tableState={tableState}
    columns={columns}
    getRowId={(row) => String(row.id)}
    onRowMouseEnter={(row) => onRowHover?.(row)}
    onRowMouseLeave={() => onRowHover?.(null)}
  />
</div>
```

- [ ] **Step 3: Verify save feedback without remount**

In `PaymentEditableFieldCell`, ensure `Input` has stable `key={`${row.id}-${field}`}` only on id+field, not on `saveStatus`.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/lib/finances/student-payments-resource-column-meta.test.ts src/lib/data-sheets/payment-row-utils.test.ts src/lib/finances/flatten-payment-report-rows.test.ts`

Expected: PASS

- [ ] **Step 5: Manual browser — ResourceTable path**

1. `/finances/student-payments` — toggle OFF Glide (original view).
2. Expand a group row — parts inline; delete on part only.
3. Hover part — screenshot preview updates; mouse leave clears preview.
4. Edit description — spinner→tick, no flash.
5. Narrow viewport 1024px — horizontal scroll, txn column not crushed.
6. Screenshots: `docs/superpowers/evidence/r12-student-payments-table-light.png`, `r12-student-payments-table-dark.png`, `r12-course-student-payments-table.png`.

- [ ] **Step 6: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
fix(finances): apply ResourceTable column contracts and hover preview scroll

EOF
)"
```

---

### Task 3: Filter bar width alignment (R4)

**Files:**
- Modify: `src/lib/finances/student-payments-filter-ui.ts:28-33`
- Modify: `src/lib/finances/student-payments-filter-ui.test.ts`
- Modify: `src/components/finances/student-payments-report-shell.tsx:231-325`

- [ ] **Step 1: Test width floors**

```ts
it("paymentEditableFieldInputClassName uses 18rem txn and 20rem description", () => {
  expect(paymentEditableFieldInputClassName("transaction_id")).toContain("min-w-[18rem]");
  expect(paymentEditableFieldInputClassName("description")).toContain("min-w-[20rem]");
});
```

- [ ] **Step 2: Shell filter controls — unify EntityCombobox container**

`containerClassName="w-full min-w-0"` on course combobox; status selector `fullWidth` with `min-w-[11.25rem]`.

- [ ] **Step 3: PASS tests + commit**

```bash
git add src/lib/finances/student-payments-filter-ui.ts src/lib/finances/student-payments-filter-ui.test.ts src/components/finances/student-payments-report-shell.tsx
git commit -m "$(cat <<'EOF'
fix(finances): student payments filter bar control sizing

EOF
)"
```

---

### Task 4: Status select layout + money display preservation

**Files:**
- Modify: `src/components/datatable/user-payment-status-inline-form.tsx:80-124`

- [ ] **Step 1: Verify PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS applied**

Replace the complete return block at baseline lines 90–120 with:

```tsx
return (
  <div
    className={cn(
      PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS,
      "flex w-full max-w-full items-center gap-2",
    )}
  >
    <div className="min-w-0 flex-1">
      <Selector
        fullWidth
        containerClassName="min-w-0"
        className={cn({
          "border-success":
            displayValue === UserPaymentStatus.verified,
          "border-warning":
            displayValue === UserPaymentStatus.pending_verification,
        })}
        isDisabled={
          isDisabled || !isUserPaymentStatusManuallyEditable(status)
        }
        options={statusOptions}
        value={displayValue}
        onChange={(v) => {
          setLocalValue(v as UserPaymentStatus);
          void commit();
        }}
      />
    </div>
    <CellSaveFeedback status={saveStatus} showSavedTick={showSavedTick} />
  </div>
);
```

- [ ] **Step 2: Preserve UserPaymentStatus enum — no string invention**

`statusOptions` must map `MANUAL_USER_PAYMENT_STATUSES` only.

- [ ] **Step 3: Manual — change status on synthetic + real row; select stays mounted.**

- [ ] **Step 4: Commit**

```bash
git add src/components/datatable/user-payment-status-inline-form.tsx
git commit -m "$(cat <<'EOF'
fix(finances): payment status inline select width and save stability

EOF
)"
```

---

### Task 5: Transaction lookup + course hub ResourceTable pass

**Files:**
- Modify: `src/app/(internal)/finances/student-payments/transaction-lookup/page.tsx` (title/spacing only if needed)
- Modify: `src/app/(internal)/finances/student-payments/page.tsx` (shared-shell page chrome on the real route)
- Modify: `src/app/(internal)/courses/[id]/student-payments/page.tsx` (shared-shell page chrome on the real route)
- Verify: `src/app/(internal)/finances/student-payments/student-payment-page-content.tsx` (propagate shell chrome if present)

**Scope:** R12 may adjust shared-shell page chrome (`PageContainer`, outer spacing, title delegation) on the three real report routes above. Do **not** edit the Glide branch in `student-payments-report-shell.tsx` — R13 owns that path.

- [ ] **Step 1: Transaction lookup hides header actions** — already `globalTransactionLookup` hides actions; verify month selector hidden via `shouldShowStudentPaymentsMonthSelector({ globalTransactionLookup: true })`.

- [ ] **Step 2: Manual screenshots**

- `docs/superpowers/evidence/r12-transaction-lookup-table.png`
- `docs/superpowers/evidence/r12-course-student-payments-month-selector.png` (month selector visible on course route per `c2df9122`)

- [ ] **Step 3: Commit** (if page chrome or title spacing changed on any owned route)

```bash
git add src/app/(internal)/finances/student-payments/page.tsx \
  src/app/(internal)/finances/student-payments/transaction-lookup/page.tsx \
  src/app/(internal)/courses/[id]/student-payments/page.tsx \
  src/app/(internal)/finances/student-payments/student-payment-page-content.tsx
git commit -m "$(cat <<'EOF'
fix(finances): ResourceTable report route page chrome composition

EOF
)"
```

---

## Final verification

```bash
npm run lint && npm run typecheck && npm run test:unit && npm run build
npm run test:browser -- --grep "R12 student-payments ResourceTable"
```

**Worker-only (local implementation aid — not QA signoff):** the `--grep "R12 student-payments ResourceTable"` subset above narrows browser coverage during development; independent QA must run the full `npm run test:browser` gate.

No `test.skip`, `describe.skip`, `it.skip`, CLI skip flag, test exclusion, or omitted browser project is acceptable.

---

## Independent QA prompt (paste-ready)

```
Independent QA — R12 Student-Payments ResourceTable Path

Repo: schedjuice-reimagined-fe
Plan: docs/superpowers/plans/2026-07-12-ui-remediation-r12-student-payments-resource-table.md
Do NOT patch failures.

 Preconditions: R12 merged; Glide view toggle available; admin payment.view_all on staging.

ResourceTable view (Glide OFF) on:
1. /finances/student-payments?date=2026-07-01T00:00:00.000Z
2. /courses/<courseId>/student-payments?date=2026-07-01T00:00:00.000Z
3. /finances/student-payments/transaction-lookup?transactionId=<known-txn>

Acceptance:
- Txn ID column effective width ≥18rem; description ≥20rem; horizontal scroll before crush.
- Group row expand shows parts; delete only on leaves; stub create when amount+method set.
- Hover preview updates on row hover; clears on mouse leave; sticky preview column while table scrolls.
- Inline edit: spinner→tick without value flash; status select not remounted during save.
- formatMoney preserves decimal semantics on parsed_amount display.
- Light+dark 1280×800 screenshots required per route.

Commands (full gate required — skipped/focused/grep subsets are not acceptable for QA signoff):
npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:browser

Report pass/fail, screenshots path, repro, suspect plan if fail (R13 for Glide-only defects).
```

---

## Spec coverage self-review

| Requirement | Task |
| --- | --- |
| R3 table metadata | 1, 2 |
| Hover preview / sticky | 0, 2 |
| Save without remount | 2, 4 |
| Jul 11 table fixes | 2 |
| R13 shell prerequisite | 0 |
| Money/status semantics | 1, 4 |
