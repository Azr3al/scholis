# Student payments revert toggle + compact DataSheet toolbar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a real “Revert to original” ResourceTable view (full ops parity) on finance + course student-payments, and make the global DataSheet toolbar collapse to icon-only when narrow so it never horizontal-scrolls.

**Architecture:** (1) Pure compact-width helper + ResizeObserver-driven `compact` flag on `SheetToolbar` / display menus. (2) Extract admin-report filter+query into a shared hook; introduce a report shell that switches DataSheet vs page-owned `ResourceTable` on `useGridViewPreference("student-payments")`; wire student drawer on both bodies.

**Tech Stack:** Next.js App Router, React, Vitest (`npm run test:unit`), TanStack Query, existing `ResourceTable` / `Table` + `column.*`, `useGridViewPreference`, Glide `DataSheet`, Iconoir.

**Spec:** `docs/superpowers/specs/2026-07-11-student-payments-revert-and-toolbar-design.md`

**Scope note:** Toolbar (Tasks 1–3) is independently shippable. Dual-view (Tasks 4–8) depends on the shared report hook. Keep as one plan; commit after each task.

All commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/components/data-sheet/lib/toolbar-compact.ts` | Create | Pure `shouldCompactToolbar(containerWidth, contentWidth)` |
| `src/components/data-sheet/lib/toolbar-compact.test.ts` | Create | Unit tests for compact decision |
| `src/hooks/use-container-overflow-compact.ts` | Create | ResizeObserver → `compact` boolean |
| `src/components/data-sheet/menu-bar/sheet-toolbar.tsx` | Modify | Measure + hide labels when compact; `aria-label` |
| `src/components/data-sheet/menu-bar/display-menu.tsx` | Modify | Accept `compact?: boolean` |
| `src/components/data-sheet/menu-bar/columns-menu.tsx` | Modify | Accept `compact?: boolean` |
| `src/components/data-sheet/menu-bar/goto-row-popover.tsx` | Modify | Accept `compact?: boolean` |
| `src/components/data-sheet/data-sheet.tsx` | Modify | Pass `compact` into leading menus |
| `src/hooks/finances/use-student-payments-admin-report.ts` | Create | URL filters + admin-report query + rows/summary |
| `src/components/finances/student-payments-resource-table.tsx` | Create | Original-view table body (ResourceTable + ops cells) |
| `src/components/finances/student-payments-report-shell.tsx` | Create | Preference toggle + chrome + body switch + drawer |
| `src/components/finances/student-payments-grid.tsx` | Modify | Consume shared hook when used as Glide body; drop duplicated chrome when `chrome="external"` |
| `src/components/finances/student-payments-report.tsx` | Modify | Compose shell |
| `src/app/(internal)/finances/student-payments/student-payment-page-content.tsx` | Modify | Thin page → shell |
| `src/app/(internal)/courses/[id]/student-payments/page.tsx` | Modify | Unchanged layout; shell comes via `CourseStudentPaymentsReport` |

---

### Task 1: Toolbar compact helper (TDD)

**Files:**
- Create: `src/components/data-sheet/lib/toolbar-compact.ts`
- Test: `src/components/data-sheet/lib/toolbar-compact.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { shouldCompactToolbar } from "./toolbar-compact";

describe("shouldCompactToolbar", () => {
  it("stays expanded when content fits", () => {
    expect(shouldCompactToolbar(800, 400)).toBe(false);
  });

  it("compacts when content exceeds container", () => {
    expect(shouldCompactToolbar(400, 401)).toBe(true);
  });

  it("stays expanded when equal", () => {
    expect(shouldCompactToolbar(400, 400)).toBe(false);
  });

  it("stays expanded for non-positive widths (pre-measure)", () => {
    expect(shouldCompactToolbar(0, 100)).toBe(false);
    expect(shouldCompactToolbar(100, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/components/data-sheet/lib/toolbar-compact.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
/** True when labeled toolbar content would overflow its container. */
export function shouldCompactToolbar(
  containerWidth: number,
  contentWidth: number,
): boolean {
  if (containerWidth <= 0 || contentWidth <= 0) return false;
  return contentWidth > containerWidth;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/components/data-sheet/lib/toolbar-compact.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/data-sheet/lib/toolbar-compact.ts src/components/data-sheet/lib/toolbar-compact.test.ts
git commit -m "$(cat <<'EOF'
feat(data-sheet): add toolbar compact width helper

EOF
)"
```

---

### Task 2: Overflow compact hook

**Files:**
- Create: `src/hooks/use-container-overflow-compact.ts`

- [ ] **Step 1: Implement hook**

```ts
"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { shouldCompactToolbar } from "@/components/data-sheet/lib/toolbar-compact";

/**
 * Measures a container vs an inner content row.
 * Defaults to expanded (false) until a positive measurement shows overflow.
 */
export function useContainerOverflowCompact(
  containerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
): boolean {
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      const next = shouldCompactToolbar(
        container.clientWidth,
        content.scrollWidth,
      );
      setCompact((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(content);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remeasure when layout deps change
  }, [containerRef, contentRef, ...deps]);

  return compact;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-container-overflow-compact.ts
git commit -m "$(cat <<'EOF'
feat(hooks): measure container overflow for compact toolbars

EOF
)"
```

---

### Task 3: Wire compact mode into SheetToolbar + menus

**Files:**
- Modify: `src/components/data-sheet/menu-bar/sheet-toolbar.tsx`
- Modify: `src/components/data-sheet/menu-bar/display-menu.tsx`
- Modify: `src/components/data-sheet/menu-bar/columns-menu.tsx`
- Modify: `src/components/data-sheet/menu-bar/goto-row-popover.tsx`
- Modify: `src/components/data-sheet/data-sheet.tsx`

- [ ] **Step 1: Add `compact?: boolean` to menu triggers**

In `display-menu.tsx` and `columns-menu.tsx`, add optional `compact?: boolean` to props. When `compact` is true, omit the text node after the icon and set `aria-label` / `title` to the menu name (`"Density"`, `"Font"`, `"Columns"`). Keep icon.

Example trigger class stays `h-6 gap-1 px-2 text-[11px]…`; when compact use `px-1.5` and no label `<span>`.

In `goto-row-popover.tsx`, when `compact`, hide the `"Go to row"` text; keep `title` / `aria-label`.

- [ ] **Step 2: Update `SheetToolbar`**

Replace the root with a measured container:

```tsx
"use client";
import { Button } from "@/components/primitives";
import type { ReactNode } from "react";
import { useRef } from "react";
import { /* existing icons */ } from "iconoir-react";
import { cn } from "@/lib/utils";
import { useContainerOverflowCompact } from "@/hooks/use-container-overflow-compact";

export interface ToolbarAction {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  node?: ReactNode;
}

export function SheetToolbar({
  actions,
  leading,
  right,
  compact: compactProp,
}: {
  actions: ToolbarAction[];
  leading?: ReactNode;
  right?: ReactNode;
  /** When provided by parent, skip internal measurement. */
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const measuredCompact = useContainerOverflowCompact(
    containerRef,
    contentRef,
    [actions.length, Boolean(leading), Boolean(right)],
  );
  const compact = compactProp ?? measuredCompact;

  if (actions.length === 0 && !right && !leading) return null;

  return (
    <div
      ref={containerRef}
      className="flex h-7 shrink-0 items-center overflow-hidden border-b border-border bg-muted/30 px-1.5 py-0"
    >
      <div
        ref={contentRef}
        className="flex min-w-0 flex-1 items-center gap-0.5"
      >
        {leading}
        {actions.map((a) =>
          a.node ? (
            <span key={a.id}>{a.node}</span>
          ) : (
            <Button
              key={a.id}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 gap-1 text-[11px] text-foreground/70 active:scale-[0.96]",
                compact ? "px-1.5" : "px-2",
              )}
              disabled={a.disabled}
              title={a.label}
              aria-label={a.label}
              onClick={a.onClick}
            >
              {a.icon}
              {!compact ? <span>{a.label}</span> : null}
            </Button>
          ),
        )}
        {right ? (
          <div className={cn("ml-auto flex items-center gap-1.5")}>{right}</div>
        ) : null}
      </div>
    </div>
  );
}

// keep TOOLBAR_ICONS export unchanged
```

**Important:** `leading` menus must receive `compact`. Do not leave labels on Columns/Density/Font while actions are icon-only.

- [ ] **Step 3: Pass `compact` from `data-sheet.tsx`**

Lift measurement into `data-sheet.tsx` (cleaner than SheetToolbar owning leading):

1. In `data-sheet.tsx`, create `toolbarRef` / `toolbarContentRef` and `const compact = useContainerOverflowCompact(...)`.
2. Pass `compact` into `ColumnsMenu`, `DensityMenu`, `FontSizeMenu`, and into `GotoRowPopover` via toolbar action `node`.
3. Pass `compact` to `SheetToolbar` as `compact={compact}` and **disable** SheetToolbar’s internal measurement when `compact` prop is set (already handled by `compactProp ?? measuredCompact`). Prefer: SheetToolbar only measures when `compact` prop is omitted; data-sheet always passes `compact`.

Simplest approach that matches the spec:

- `SheetToolbar` always measures and exposes compact via render-prop **or**
- `data-sheet` measures once and passes `compact` into both toolbar actions and leading menus.

Choose **data-sheet owns measurement**:

```tsx
const toolbarMeasureRef = useRef<HTMLDivElement>(null);
const toolbarContentRef = useRef<HTMLDivElement>(null);
const compact = useContainerOverflowCompact(
  toolbarMeasureRef,
  toolbarContentRef,
  [toolbarActions.length, density, fontSize, hasColumnMenu],
);

// SheetToolbar accepts containerRef/contentRef OR wrap:
<div ref={toolbarMeasureRef}>
  <SheetToolbar
    compact={compact}
    contentRef={toolbarContentRef}
    leading={... menus with compact={compact} ...}
    actions={toolbarActions /* goto node gets compact */}
  />
</div>
```

Update `SheetToolbar` props to accept optional `contentRef` and `compact` (required from parent when parent measures). If `compact` is passed, skip internal hook.

Update goto action construction:

```tsx
node: (
  <GotoRowPopover
    compact={compact}
    open={gotoOpen}
    onOpenChange={setGotoOpen}
    rowCount={adapter.rowCount}
    onGo={scrollToRow}
    icon={TOOLBAR_ICONS.goto}
    label="Go to row"
  />
),
```

Add `compact` to the `toolbarActions` `useMemo` dependency list.

- [ ] **Step 4: Manual check**

Run the app, open any DataSheet (student payments Glide view). Narrow the window until labels disappear; confirm no horizontal scrollbar on the toolbar row; hover shows native `title` tooltips.

- [ ] **Step 5: Commit**

```bash
git add src/components/data-sheet/menu-bar/sheet-toolbar.tsx \
  src/components/data-sheet/menu-bar/display-menu.tsx \
  src/components/data-sheet/menu-bar/columns-menu.tsx \
  src/components/data-sheet/menu-bar/goto-row-popover.tsx \
  src/components/data-sheet/data-sheet.tsx \
  src/hooks/use-container-overflow-compact.ts
git commit -m "$(cat <<'EOF'
fix(data-sheet): collapse toolbar labels when narrow

EOF
)"
```

---

### Task 4: Shared admin-report hook

**Files:**
- Create: `src/hooks/finances/use-student-payments-admin-report.ts`
- Modify: `src/components/finances/student-payments-grid.tsx` (consume hook for report variant)

- [ ] **Step 1: Extract hook**

Move from `student-payments-grid.tsx` (report path only) into `useStudentPaymentsAdminReport(opts)`:

- Inputs: `{ fixedCourseId?: string; courseMeta?: StudentPaymentsCourseMeta | null; globalTransactionLookup?: boolean; tableUid: string }`
- Owns: `useQueryState` for transactionId / status / courseId / month date (same keys as today), `reportFilterParams`, `dataQuery` against `user-payments/admin-report`, local `rows` + `apiSummary` synced from query, `setRows` for optimistic edits, `queryEnabled`, `showSkeleton`, `monthDate` / `setDate`, filter setters, `selectedCourseEntity`, courses list query used by combobox, invalidate helper.

Export a stable return type, e.g.:

```ts
export type StudentPaymentsAdminReportModel = {
  rows: StudentPaymentAdminReportRow[];
  setRows: React.Dispatch<React.SetStateAction<StudentPaymentAdminReportRow[]>>;
  apiSummary: StudentPaymentsAdminReportSummary | null;
  showSkeleton: boolean;
  isError: boolean;
  refetch: () => void;
  tableUid: string;
  // filter UI state
  transactionId: string;
  setTransactionId: (v: string | null) => void;
  status: string | null;
  setStatus: (v: string | null) => void;
  courseIdFromUrl: string | null;
  setCourseIdFromUrl: (v: string | null) => void;
  monthDate: Date;
  setDate: (d: Date) => void;
  selectedCourseEntity: StudentPaymentsCourseMeta | null;
  setSelectedCourseEntity: (c: StudentPaymentsCourseMeta | null) => void;
  clearFilters: () => void;
  // ...any other values the filter chrome needs
};
```

Keep **recent-transactions** path inside the grid for now (do not force it through this hook).

- [ ] **Step 2: Refactor grid report path to call the hook**

`StudentPaymentsGrid` when `variant === "report"` calls the hook and uses returned rows/filters. Behavior must be unchanged (same query key `["searchuser-payments", tableUid, ...]`).

- [ ] **Step 3: Smoke**

Open `/finances/student-payments`, change month/course/status — grid still loads and filters.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/finances/use-student-payments-admin-report.ts \
  src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
refactor(finances): extract student payments admin-report hook

EOF
)"
```

---

### Task 5: Original ResourceTable body

**Files:**
- Create: `src/components/finances/student-payments-resource-table.tsx`

- [ ] **Step 1: Build table body component**

```tsx
"use client";

import {
  ResourceTable,
  useResourceTableState,
  column,
  type Column,
  type ResourceListResult,
} from "@/components/data-table";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import UserPaymentStatusInlineForm from "@/components/datatable/user-payment-status-inline-form";
import { Button, buttonVariants } from "@/components/primitives";
import { formatDate } from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import {
  canRecordStudentPayments,
  canVerifyPayments,
} from "@/helpers/authorization";
import {
  isDroppedEnrollmentRow,
  isExemptPaymentExpectationRow,
  isGroupPaymentRow,
  isPaymentFieldEditable,
  isSyntheticPaymentRow,
  paymentFieldDisplayValue,
  syntheticAllowsInlineCreate,
} from "@/lib/data-sheets/payment-row-utils";
import { updateEntity } from "@/app/client-api/utils";
import { UserPaymentStatus } from "@/types/finance";
import { useUser } from "@/hooks/useUser";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export function StudentPaymentsResourceTable({
  rows,
  isLoading,
  isError,
  error,
  refetch,
  hideCourseColumn,
  monthDate,
  onOpenStudent,
  onViewScreenshot,
  onEditCoverage,
  tableUid,
}: {
  rows: StudentPaymentAdminReportRow[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hideCourseColumn: boolean;
  monthDate: Date;
  onOpenStudent: (userId: number) => void;
  onViewScreenshot: (url: string) => void;
  onEditCoverage: (row: StudentPaymentAdminReportRow) => void;
  tableUid: string;
}) {
  const { user } = useUser();
  const currencySymbol = useTenantCurrencySymbol();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tableState = useResourceTableState({
    namespace: "student-payments-original",
    syncUrl: false,
    initial: { pageSize: 50 },
  });

  const list: ResourceListResult<StudentPaymentAdminReportRow> = useMemo(
    () => ({
      rows,
      total: rows.length,
      isLoading,
      isError,
      error,
      refetch,
    }),
    [rows, isLoading, isError, error, refetch],
  );

  const canVerify = Boolean(user && canVerifyPayments(user));
  const canRecord = Boolean(user && canRecordStudentPayments(user));

  const columns: Column<StudentPaymentAdminReportRow>[] = useMemo(() => {
    const cols: Column<StudentPaymentAdminReportRow>[] = [
      {
        id: "_serial",
        header: "No.",
        accessor: (_row, index?: number) => index,
        enableSorting: false,
        cell: ({ row }) => {
          const idx = rows.indexOf(row);
          return <span>{idx >= 0 ? idx + 1 : "—"}</span>;
        },
      },
      {
        id: "user__name",
        header: "Student",
        accessor: (row) => row.user?.name,
        enableSorting: false,
        cell: ({ row }) => {
          const name = row.user?.name ?? "—";
          const uid = row.user?.id;
          if (uid == null) return <span>{name}</span>;
          return (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => onOpenStudent(Number(uid))}
            >
              {name}
            </button>
          );
        },
      },
    ];

    if (!hideCourseColumn) {
      cols.push(
        column.text({
          id: "course",
          header: "Course",
          accessor: (row) => row.course?.title,
          enableSorting: false,
        }),
      );
    }

    if (canVerify) {
      cols.push({
        id: "parsed_amount",
        header: "Amount",
        accessor: (row) => paymentFieldDisplayValue(row, "parsed_amount"),
        enableSorting: false,
        cell: ({ row, value }) => {
          const raw = value == null || value === "" ? null : String(value);
          return (
            <span>{raw ? formatMoney(raw, currencySymbol) : "—"}</span>
          );
        },
      });
    }

    cols.push(
      column.text({
        id: "payment_method__name",
        header: "Payment Account",
        accessor: (row) => row.payment_method?.name,
        enableSorting: false,
      }),
      {
        id: "date_on_screenshot",
        header: "Date on Screenshot",
        accessor: (row) => row.date_on_screenshot,
        enableSorting: false,
        cell: ({ value }) => (
          <span>
            {value ? formatDate(String(value)) : "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessor: (row) => row.status,
        enableSorting: false,
        cell: ({ row }) => {
          if (isDroppedEnrollmentRow(row)) {
            return <span className="text-muted-foreground">Dropped</span>;
          }
          if (syntheticAllowsInlineCreate(row)) {
            if (!canRecord || isExemptPaymentExpectationRow(row)) {
              return <span>—</span>;
            }
            return (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const qs = new URLSearchParams({
                    courseId: String(row.course?.id ?? ""),
                    userId: String(row.user?.id ?? ""),
                    date: monthDate.toISOString(),
                  });
                  router.push(`/finances/student-payments/upload?${qs}`);
                }}
              >
                Upload
              </Button>
            );
          }
          if (isGroupPaymentRow(row) || isSyntheticPaymentRow(row)) {
            return <span>{row.status}</span>;
          }
          return (
            <UserPaymentStatusInlineForm
              userId={row.user?.id != null ? String(row.user.id) : ""}
              isDisabled={Boolean(user && !canVerifyPayments(user))}
              status={row.status as UserPaymentStatus}
              userPaymentId={row.id}
            />
          );
        },
      },
    );

    cols.push({
      id: "transaction_id",
      header: "Transaction ID",
      accessor: (row) => row.transaction_id ?? "",
      enableSorting: false,
      editable: {
        kind: "text",
        onSave: async (row, value) => {
          if (!isPaymentFieldEditable(row, "transaction_id")) return;
          await updateEntity("user-payments", row.id, {
            transaction_id: String(value ?? ""),
          });
        },
      },
    });

    cols.push({
      id: "description",
      header: "Description",
      accessor: (row) => row.description ?? "",
      enableSorting: false,
      editable: {
        kind: "text",
        onSave: async (row, value) => {
          if (!isPaymentFieldEditable(row, "description")) return;
          await updateEntity("user-payments", row.id, {
            description: String(value ?? ""),
          });
        },
      },
    });

    cols.push({
      id: "_actions",
      header: "Actions",
      accessor: () => "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.screenshot ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onViewScreenshot(String(row.screenshot))}
            >
              View
            </Button>
          ) : null}
          {canRecord &&
          !isExemptPaymentExpectationRow(row) &&
          (syntheticAllowsInlineCreate(row) || !row.screenshot) ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const qs = new URLSearchParams({
                  courseId: String(row.course?.id ?? ""),
                  userId: String(row.user?.id ?? ""),
                  date: monthDate.toISOString(),
                });
                router.push(`/finances/student-payments/upload?${qs}`);
              }}
            >
              Upload
            </Button>
          ) : null}
          {!isSyntheticPaymentRow(row) && !isGroupPaymentRow(row) ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onEditCoverage(row)}
            >
              Coverage
            </Button>
          ) : null}
        </div>
      ),
    });

    return cols;
  }, [
    rows,
    hideCourseColumn,
    canVerify,
    canRecord,
    currencySymbol,
    monthDate,
    onOpenStudent,
    onViewScreenshot,
    onEditCoverage,
    router,
    user,
  ]);

  return (
    <ResourceTable
      list={list}
      tableState={tableState}
      columns={columns}
      getRowId={(row) => String(row.id)}
    />
  );
}
```

Add `onEditCoverage` to props (already in the signature above). Remove unused imports (`buttonVariants`, `cn`, `pathname`, `searchParams`, `tableUid` if unused).

- [ ] **Step 2: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
feat(finances): add student payments ResourceTable original view

EOF
)"
```

---

### Task 6: Report shell + preference switch

**Files:**
- Create: `src/components/finances/student-payments-report-shell.tsx`
- Modify: `src/components/finances/student-payments-report.tsx`
- Modify: `src/components/finances/student-payments-grid.tsx` (optional `embedChrome?: boolean` — when false, render only grid pane + overlays/dialogs owned by shell)

- [ ] **Step 1: Implement shell**

```tsx
"use client";

import { GridViewToggle } from "@/components/finances/grid-view-toggle";
import { StudentPaymentsGrid } from "@/components/finances/student-payments-grid";
import { StudentPaymentsResourceTable } from "@/components/finances/student-payments-resource-table";
import { StudentPaymentsDrawer } from "@/components/finances/student-payments-drawer";
import { PaymentCoverageEditDialog } from "@/components/finances/payment-coverage-edit-dialog";
import { PaymentGridSummaryStrip } from "@/components/finances/payments-grid/payment-grid-summary-strip";
import { useGridViewPreference } from "@/hooks/use-grid-view-preference";
import { useStudentPaymentsAdminReport } from "@/hooks/finances/use-student-payments-admin-report";
import { ReportSkeleton } from "@/components/loading/structured-skeletons";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { StudentPaymentsReportProps } from "@/components/finances/student-payments-report";

export function StudentPaymentsReportShell({
  fixedCourseId,
  courseMeta,
  verificationUploadHref = "/finances/student-payments/verification-upload",
  globalTransactionLookup = false,
}: StudentPaymentsReportProps) {
  const { useGlideView, toggleView, hydrated } =
    useGridViewPreference("student-payments");

  const report = useStudentPaymentsAdminReport({
    fixedCourseId,
    courseMeta,
    globalTransactionLookup,
    tableUid: fixedCourseId
      ? `course-payments-${fixedCourseId}`
      : "student-payments-report",
  });

  const [studentId, setStudentId] = useState("");
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [coverageEdit, setCoverageEdit] = useState<null | {
    paymentIds: (string | number)[];
    courseStartDate?: string;
    courseEndDate?: string;
  }>(null);

  const openStudent = useCallback((uid: number) => {
    setStudentId(String(uid));
  }, []);

  const headerActions = (
    <>
      <GridViewToggle useGlideView={useGlideView} onToggle={toggleView} />
      <Link
        href={verificationUploadHref}
        className={cn(buttonVariants({ variant: "primary" }))}
      >
        Upload Verification File
      </Link>
    </>
  );

  if (!hydrated) {
    return <ReportSkeleton tableColumns={8} tableRows={8} />;
  }

  // Render shared chrome (title, filters from report.*, summary strip) once.
  // Body:
  //   useGlideView ? <StudentPaymentsGrid embedChrome={false} ... shared rows /> 
  //                : <StudentPaymentsResourceTable ... />

  return (
    <>
      {/* shell chrome + body — implement fully using existing filterControls JSX moved from grid */}
      <StudentPaymentsDrawer
        studentId={studentId}
        onClose={() => setStudentId("")}
        onViewScreenshot={(url) => setViewImageUrl(url)}
      />
      <PaymentCoverageEditDialog
        open={coverageEdit !== null}
        onOpenChange={(open) => {
          if (!open) setCoverageEdit(null);
        }}
        paymentIds={coverageEdit?.paymentIds ?? []}
        courseStartDate={coverageEdit?.courseStartDate}
        courseEndDate={coverageEdit?.courseEndDate}
        onSaved={() => report.refetch()}
      />
      {/* screenshot Dialog — copy from grid */}
    </>
  );
}
```

**Chrome move:** Cut the header / `filterControls` / `PaymentGridSummaryStrip` JSX from the grid’s report path into the shell (or a `StudentPaymentsReportChrome` child). Grid with `embedChrome={false}` renders only the DataSheet + cell overlays; fullscreen remains Glide-only (hide fullscreen when `!useGlideView`).

**Glide student click:** Update grid `handleCellClicked` so report mode also calls `onOpenStudent` when provided (today only recent-transactions does). Shell always passes `onOpenStudent={openStudent}`.

- [ ] **Step 2: Point `StudentPaymentsReport` at the shell**

```tsx
export function StudentPaymentsReport(props: StudentPaymentsReportProps) {
  return <StudentPaymentsReportShell {...props} />;
}
```

Remove the dead `newLookSlot` passthrough or map it to nothing (shell owns toggle).

- [ ] **Step 3: Thin finance page**

`student-payment-page-content.tsx`:

```tsx
"use client";

import { StudentPaymentsReport } from "@/components/finances/student-payments-report";

export default function StudentPaymentPage() {
  return <StudentPaymentsReport />;
}
```

Course page already uses `CourseStudentPaymentsReport` → gets shell automatically.

- [ ] **Step 4: Verify toggle**

1. `/finances/student-payments` — “Try the new look” shows DataSheet; “Revert to original” shows ResourceTable.
2. `/courses/[id]/student-payments` — same toggle; preference shared.
3. Filters apply in both views; Upload on synthetic rows works on original; student name opens drawer.

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/student-payments-report-shell.tsx \
  src/components/finances/student-payments-report.tsx \
  src/components/finances/student-payments-grid.tsx \
  src/app/(internal)/finances/student-payments/student-payment-page-content.tsx
git commit -m "$(cat <<'EOF'
feat(finances): restore student payments original ResourceTable view

EOF
)"
```

---

### Task 7: Parity polish + regression checks

**Files:**
- Modify as needed: resource table columns (billing-period strategy branch like grid `userUploadStrategy`), group row display, invalidate queries after status save (`["searchuser-payments"]` already used by `UserPaymentStatusInlineForm`).

- [ ] **Step 1: Match column set to screenshot strategy**

If `tenant.transaction_screenshot_strategy === user_upload`, show Billing Period instead of Payment Account + Date on Screenshot (same as grid). Read strategy from `useTenant()`.

- [ ] **Step 2: Ensure query invalidation**

After editable saves in the ResourceTable, invalidate `["searchuser-payments", tableUid]` (or broad `["searchuser-payments"]`) so the shared hook refreshes both views.

- [ ] **Step 3: Run unit tests**

Run: `npm run test:unit -- src/components/data-sheet/lib/toolbar-compact.test.ts`

Expected: PASS

- [ ] **Step 4: Commit if changes**

```bash
git add -u src/components/finances src/hooks/finances
git commit -m "$(cat <<'EOF'
fix(finances): align original payments table with sheet columns

EOF
)"
```

---

### Task 8: Final smoke checklist (no commit unless fixes)

- [ ] **Step 1: Toolbar** — At ~900px and ~500px wide, DataSheet toolbar never shows a horizontal scrollbar; labels visible when wide; icons + `title` when narrow.
- [ ] **Step 2: Toggle** — Finance + course pages; both preference labels flip real UI.
- [ ] **Step 3: Original ops** — Filter by status; Upload navigates; status change on real payment; student drawer opens; verification upload link present.
- [ ] **Step 4: Glide ops** — Existing sheet edit/upload/fullscreen still work; fullscreen control absent on original view.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Responsive global toolbar (labels ↔ icons) | 1–3 |
| Shared preference key `student-payments` | 6 |
| Dual body DataSheet / ResourceTable | 5–6 |
| Finance + course entry points | 6 |
| Full ops parity (filters, summary, upload, drawer, edits) | 4–7 |
| Glide-only fullscreen | 6 |
| No legacy DataTable revival | 5 (ResourceTable / page-owned list) |
| Tests for compact helper | 1 |
| Hydration gate | 6 |

## Placeholder / consistency fixes applied while writing

- ResourceTable uses fabricated `ResourceListResult` from admin-report rows (not SDK list search).
- Synthetic status “Upload” navigates to `/finances/student-payments/upload` (same as sheet action).
- Report-mode student click gains drawer via `onOpenStudent` (parity gap vs today’s grid).
