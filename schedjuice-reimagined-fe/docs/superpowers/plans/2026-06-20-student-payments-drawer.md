# Student Payments Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped ~256px inline student-detail panel on the Recent Transactions page with a single roomy right-side drawer (shadcn `Sheet`, ~720–820px) shared by both the Glide grid view and the legacy DataTable view.

**Architecture:** Extract the duplicated detail-query helpers into a pure utils module + a `useStudentPaymentsDetail` hook, build a `StudentPaymentsDrawer` on top of the existing `Sheet` primitive (mirroring `LeadDetailDrawer`), then rewire the page so both views open this one drawer. The page keeps `?studentId=` URL sync. The old `recent-transactions-side-panel.tsx` and legacy inline split are deleted.

**Tech Stack:** Next.js (App Router, client components), React, TypeScript, TanStack React Query v4, shadcn/ui (`Sheet`), Tailwind v4, lucide-react, Vitest (`test:unit`).

---

## File Structure

- Create: `src/lib/finances/student-payments-detail-utils.ts` — pure helpers (filter params, sort, summary).
- Create: `src/lib/finances/student-payments-detail-utils.test.ts` — Vitest unit tests for the helpers.
- Create: `src/hooks/finances/use-student-payments-detail.ts` — React Query hook wrapping the helpers.
- Create: `src/components/finances/student-payments-drawer.tsx` — the drawer UI.
- Modify: `src/app/(internal)/finances/recent-transactions/page.tsx` — render the drawer in both branches; delete duplicated detail logic + legacy split JSX.
- Delete: `src/components/finances/recent-transactions-side-panel.tsx`.

All commands run from `schedjuice-reimagined-fe/`.

---

## Task 1: Pure detail utils + tests

**Files:**
- Create: `src/lib/finances/student-payments-detail-utils.ts`
- Test: `src/lib/finances/student-payments-detail-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/finances/student-payments-detail-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { UserPaymentStatus } from "@/types/finance";
import { operatorEnum } from "@/types/api";
import {
  buildStudentDetailFilterParams,
  sortStudentPaymentDetailRows,
  summarizeStudentPayments,
} from "@/lib/finances/student-payments-detail-utils";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import type { accountType } from "@/types/user";

const adminUser = { id: 1, role: "admin" } as unknown as accountType;

function row(
  over: Partial<StudentPaymentAdminReportRow>,
): StudentPaymentAdminReportRow {
  return {
    id: 1,
    status: UserPaymentStatus.pending_verification,
    user: { id: 10, name: "Nyein Chan" },
    ...over,
  };
}

describe("student-payments-detail-utils", () => {
  it("returns empty filter params when studentId is blank", () => {
    expect(buildStudentDetailFilterParams(adminUser, "").filter_params).toEqual(
      [],
    );
  });

  it("adds user_id filter for an unscoped admin", () => {
    const params = buildStudentDetailFilterParams(adminUser, "10");
    expect(params.filter_params).toEqual([
      { field_name: "user_id", operator: operatorEnum.exact, value: "10" },
    ]);
  });

  it("sorts rows by billing_start_date descending, newest first", () => {
    const rows = [
      row({ id: 1, billing_start_date: "2026-01-01" }),
      row({ id: 2, billing_start_date: "2026-03-01" }),
      row({ id: 3, billing_start_date: "2026-02-01" }),
    ];
    expect(sortStudentPaymentDetailRows(rows).map((r) => r.id)).toEqual([
      2, 3, 1,
    ]);
  });

  it("summarizes count, verified count, and total verified amount", () => {
    const rows = [
      row({ id: 1, status: UserPaymentStatus.verified, parsed_amount: "2000" }),
      row({ id: 2, status: UserPaymentStatus.verified, parsed_amount: "500.5" }),
      row({
        id: 3,
        status: UserPaymentStatus.pending_verification,
        parsed_amount: "999",
      }),
    ];
    expect(summarizeStudentPayments(rows)).toEqual({
      count: 3,
      verifiedCount: 2,
      totalVerifiedAmount: 2500.5,
    });
  });

  it("treats null/blank verified amounts as zero", () => {
    const rows = [
      row({ id: 1, status: UserPaymentStatus.verified, parsed_amount: null }),
      row({ id: 2, status: UserPaymentStatus.verified, parsed_amount: "" }),
    ];
    expect(summarizeStudentPayments(rows)).toEqual({
      count: 2,
      verifiedCount: 2,
      totalVerifiedAmount: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/finances/student-payments-detail-utils.test.ts`
Expected: FAIL — cannot resolve `@/lib/finances/student-payments-detail-utils`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/finances/student-payments-detail-utils.ts`:

```ts
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { isPaymentMembershipScoped } from "@/helpers/authorization";
import { filterParamsBody, operatorEnum } from "@/types/api";
import { UserPaymentStatus } from "@/types/finance";
import type { accountType } from "@/types/user";

export function buildStudentDetailFilterParams(
  u: accountType | undefined,
  studentUserId: string,
): filterParamsBody {
  const f: filterParamsBody = { filter_params: [] };
  if (!u || !studentUserId.trim()) return f;
  if (isPaymentMembershipScoped(u)) {
    f.filter_params?.push({
      field_name: "course__user_courses__user_id",
      operator: operatorEnum.exact,
      value: String(u.id),
    });
  }
  f.filter_params?.push({
    field_name: "user_id",
    operator: operatorEnum.exact,
    value: studentUserId,
  });
  return f;
}

export function sortStudentPaymentDetailRows(
  rows: StudentPaymentAdminReportRow[],
): StudentPaymentAdminReportRow[] {
  return [...rows].sort((a, b) => {
    const ta = a.billing_start_date
      ? new Date(a.billing_start_date).getTime()
      : Number.NEGATIVE_INFINITY;
    const tb = b.billing_start_date
      ? new Date(b.billing_start_date).getTime()
      : Number.NEGATIVE_INFINITY;
    if (ta !== tb) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });
}

export type StudentPaymentsSummary = {
  count: number;
  verifiedCount: number;
  totalVerifiedAmount: number;
};

export function summarizeStudentPayments(
  rows: StudentPaymentAdminReportRow[],
): StudentPaymentsSummary {
  let verifiedCount = 0;
  let totalVerifiedAmount = 0;
  for (const r of rows) {
    if (r.status === UserPaymentStatus.verified) {
      verifiedCount++;
      const n = parseFloat(String(r.parsed_amount ?? ""));
      if (!Number.isNaN(n)) totalVerifiedAmount += n;
    }
  }
  return { count: rows.length, verifiedCount, totalVerifiedAmount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/finances/student-payments-detail-utils.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/student-payments-detail-utils.ts src/lib/finances/student-payments-detail-utils.test.ts
git commit -m "feat: add student payments detail utils"
```

---

## Task 2: useStudentPaymentsDetail hook

**Files:**
- Create: `src/hooks/finances/use-student-payments-detail.ts`

> No unit test: this hook is a thin React Query wrapper around the Task 1 helpers (which are tested). It is verified via the manual checks in Task 5. The project has no React-hook test harness.

- [ ] **Step 1: Write the implementation**

Create `src/hooks/finances/use-student-payments-detail.ts`:

```ts
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { makePostRequest } from "@/app/client-api/utils";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { queryParamDefault } from "@/config/defaults";
import { isPaymentMembershipScoped } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import {
  buildStudentDetailFilterParams,
  sortStudentPaymentDetailRows,
} from "@/lib/finances/student-payments-detail-utils";

export function useStudentPaymentsDetail(studentId: string) {
  const { user } = useUser();

  const filterParams = useMemo(
    () => buildStudentDetailFilterParams(user, studentId),
    [user, studentId],
  );

  const enabled =
    Boolean(user) &&
    Boolean(studentId.trim()) &&
    (user && isPaymentMembershipScoped(user)
      ? (filterParams.filter_params?.length ?? 0) >= 2
      : (filterParams.filter_params?.length ?? 0) >= 1);

  const query = useQuery({
    queryKey: ["student-payments-detail", studentId, user?.id],
    queryFn: async () => {
      const sid = studentId.trim();
      const res = await makePostRequest(
        "user-payments/admin-report",
        {
          filter_params: [...(filterParams.filter_params ?? [])],
          exclude_params: [],
        },
        { ...queryParamDefault, size: -1, sorts: ["-billing_start_date"] },
      );
      const raw = res.data?.data;
      if (!Array.isArray(raw)) return [] as StudentPaymentAdminReportRow[];
      const rows = raw as StudentPaymentAdminReportRow[];
      const scoped =
        sid === ""
          ? rows
          : rows.filter((r) => String(r.user?.id ?? "") === sid);
      return sortStudentPaymentDetailRows(scoped);
    },
    enabled,
  });

  const rows = query.data ?? [];

  const studentName = useMemo(() => {
    const sid = studentId.trim();
    if (!rows.length || !sid) return null;
    const match = rows.find((r) => String(r.user?.id ?? "") === sid);
    return match?.user?.name ?? rows[0]?.user?.name ?? null;
  }, [rows, studentId]);

  return { query, rows, studentName, enabled };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors referencing the new file).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/finances/use-student-payments-detail.ts
git commit -m "feat: add useStudentPaymentsDetail hook"
```

---

## Task 3: StudentPaymentsDrawer component

**Files:**
- Create: `src/components/finances/student-payments-drawer.tsx`

> No unit test: rendering/UI verified manually in Task 5; presentation logic (summary, sort) is already unit-tested in Task 1.

- [ ] **Step 1: Write the implementation**

Create `src/components/finances/student-payments-drawer.tsx`:

```tsx
"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { formatDate } from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import { snakeToTitle } from "@/helpers/formatters";
import { useStudentPaymentsDetail } from "@/hooks/finances/use-student-payments-detail";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { summarizeStudentPayments } from "@/lib/finances/student-payments-detail-utils";
import { TransactionScreenshotStrategy } from "@/types/organization";
import { ImageIcon } from "lucide-react";

function billingPeriod(row: StudentPaymentAdminReportRow): string {
  if (row.billing_start_date && row.billing_end_date) {
    return `${formatDate(row.billing_start_date)} – ${formatDate(row.billing_end_date)}`;
  }
  if (row.issued_at) return formatDate(row.issued_at);
  return "—";
}

function PaymentCard({
  row,
  currencySymbol,
  userUpload,
  onViewScreenshot,
}: {
  row: StudentPaymentAdminReportRow;
  currencySymbol: string;
  userUpload: boolean;
  onViewScreenshot: (url: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {row.course?.title ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{billingPeriod(row)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {snakeToTitle(row.status)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-400">Amount</dt>
          <dd className="font-mono text-slate-700">
            {row.parsed_amount
              ? formatMoney(row.parsed_amount, currencySymbol)
              : "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-slate-400">Transaction ID</dt>
          <dd className="break-all font-mono text-slate-700">
            {row.transaction_id ?? "—"}
          </dd>
        </div>
        {!userUpload ? (
          <>
            <div>
              <dt className="text-slate-400">Payment account</dt>
              <dd className="text-slate-700">
                {row.payment_method?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Date on screenshot</dt>
              <dd className="text-slate-700">
                {row.date_on_screenshot ?? "—"}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      {row.screenshot ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-8 active:scale-[0.98]"
          onClick={() => onViewScreenshot(row.screenshot!)}
        >
          <ImageIcon className="mr-1.5 size-4" aria-hidden />
          View screenshot
        </Button>
      ) : null}
    </div>
  );
}

export function StudentPaymentsDrawer({
  studentId,
  onClose,
  onViewScreenshot,
}: {
  studentId: string;
  onClose: () => void;
  onViewScreenshot: (url: string) => void;
}) {
  const open = Boolean(studentId.trim());
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const { query, rows, studentName, enabled } =
    useStudentPaymentsDetail(studentId);

  const userUpload =
    tenant?.transaction_screenshot_strategy ===
    TransactionScreenshotStrategy.user_upload;
  const summary = summarizeStudentPayments(rows);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[720px] lg:w-[820px]"
      >
        <SheetHeader className="space-y-1 border-b border-slate-200 px-6 py-5 pr-12 text-left">
          <SheetTitle className="text-lg font-semibold text-slate-900">
            {studentName ?? "Student"}
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-500">
            All payments for this student across all classes.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-6 border-b border-slate-200 px-6 py-3">
          <div>
            <p className="text-xs text-slate-400">Payments</p>
            <p className="font-mono text-sm text-slate-700">{summary.count}</p>
          </div>
          <div className="border-l border-slate-200 pl-6">
            <p className="text-xs text-slate-400">Verified</p>
            <p className="font-mono text-sm text-slate-700">
              {summary.verifiedCount}
            </p>
          </div>
          <div className="border-l border-slate-200 pl-6">
            <p className="text-xs text-slate-400">Total verified</p>
            <p className="font-mono text-sm text-slate-700">
              {formatMoney(summary.totalVerifiedAmount, currencySymbol)}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {!enabled || query.isLoading ? (
            <TableSkeleton columns={4} rows={5} />
          ) : query.isError ? (
            <p className="text-sm text-destructive" role="alert">
              Failed to load. Please try again.
            </p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No payments found for this student.
            </p>
          ) : (
            rows.map((row) => (
              <PaymentCard
                key={String(row.id)}
                row={row}
                currencySymbol={currencySymbol}
                userUpload={userUpload}
                onViewScreenshot={onViewScreenshot}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/finances/student-payments-drawer.tsx`
Expected: PASS (no errors). If `ImageIcon` is unavailable from `lucide-react`, replace the import with `Image as ImageIcon`.

- [ ] **Step 3: Commit**

```bash
git add src/components/finances/student-payments-drawer.tsx
git commit -m "feat: add StudentPaymentsDrawer"
```

---

## Task 4: Rewire the Glide grid branch

**Files:**
- Modify: `src/app/(internal)/finances/recent-transactions/page.tsx`

- [ ] **Step 1: Add the drawer import**

In the import block of `src/app/(internal)/finances/recent-transactions/page.tsx`, replace:

```tsx
import { RecentTransactionsSidePanel } from "@/components/finances/recent-transactions-side-panel";
```

with:

```tsx
import { StudentPaymentsDrawer } from "@/components/finances/student-payments-drawer";
```

- [ ] **Step 2: Replace the Glide-view return block**

Replace the entire `if (hydrated && useGlideView) { ... }` return (the block that renders `<StudentPaymentsGrid ... sidePanel={...} />`) with:

```tsx
  if (hydrated && useGlideView) {
    if (isTenantLoading) {
      return (
        <PageContainer width="wide">
          <TableSkeleton columns={8} rows={6} />
        </PageContainer>
      );
    }

    return (
      <PageContainer width="wide">
        <div className="min-h-[75dvh]">
          <StudentPaymentsGrid
            variant="recent-transactions"
            onOpenStudent={openStudentById}
            headerActions={headerActions}
          />
          {screenshotDialog}
          <StudentPaymentsDrawer
            studentId={studentId}
            onClose={clearStudentId}
            onViewScreenshot={(url) => setViewImageUrl(url)}
          />
        </div>
      </PageContainer>
    );
  }
```

Note: `sidePanel`, `onRowsChange`, and `gridRows` are intentionally dropped from this branch (the drawer is single-focus and fetches its own data).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only about now-unused symbols (`gridRows`, `setGridRows`, the student-switcher state, etc.) — these are removed in Task 5. No errors about `StudentPaymentsDrawer` props.

- [ ] **Step 4: Commit**

```bash
git add src/app/(internal)/finances/recent-transactions/page.tsx
git commit -m "feat: open student payments drawer from glide view"
```

---

## Task 5: Rewire the legacy DataTable branch + delete dead code

**Files:**
- Modify: `src/app/(internal)/finances/recent-transactions/page.tsx`
- Delete: `src/components/finances/recent-transactions-side-panel.tsx`

- [ ] **Step 1: Replace the legacy return block**

In the legacy `return ( <PageContainer width="wide"> ... )` (the non-Glide branch), make the table always visible and render the drawer instead of the inline split. Replace the `{tenant && ( ... )}` block's table wrapper and the entire `{isDetailOpen && ( ... )}` block with:

```tsx
      {tenant && (
        <div className="w-full min-w-0">
          <DataTable
            columnPinning={{ left: ["user__name"] }}
            customComponentOnTable={(t, apiBody) => {
              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <p className="text-sm">Search by Transaction ID</p>
                      <Input
                        className="w-60"
                        defaultValue={""}
                        value={transactionId}
                        onChange={(e) => {
                          e.preventDefault();
                          setTransactionId(e.target.value);
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-sm">Filter by Date</p>
                      <DatePicker date={date} setDate={setDate} />
                    </div>
                    {user && (
                      <div className="w-60 min-w-56 max-w-full">
                        <EntityCombobox
                          filterParams={{
                            filter_params: getFilterParams(user).filter_params,
                          }}
                          queryParams={{
                            fields: ["title", "id"],
                            sorts: ["title"],
                          }}
                          displayFunction={(e) => e.title}
                          entity={"courses"}
                          value={courseId}
                          onChange={(v) => setCourseId(v)}
                          label="Select a course"
                          containerClassName="w-full"
                        />
                      </div>
                    )}
                    <Selector
                      options={Object.keys(UserPaymentStatus).map((o) => ({
                        value: o,
                        label: snakeToTitle(o),
                      }))}
                      value={status}
                      onChange={(v) => setStatus(v as UserPaymentStatus)}
                      label="Search by Status"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        if (user) {
                          makeFilterParams(user);
                        }
                      }}
                      type="button"
                    >
                      Search
                    </Button>
                    <Button
                      onClick={() => {
                        setTransactionId("");
                        setDate(undefined);
                        setCourseId("");
                        setFilterParams({});
                        setStatus(undefined);
                      }}
                      type="button"
                      variant="outline"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              );
            }}
            getDataFilterParams={filterParams}
            uid="student-payments"
            entity="user-payments"
            baseDetailsPath={""}
            queryParams={{
              fields: [
                "id",
                "user.id",
                "user.name",
                "course.title",
                "transaction_id",
                "status",
                "description",
                "remarks",
                "created_by.name",
                "billing_start_date",
                "billing_end_date",
                "date_on_screenshot",
                "payment_method.name",
                "parsed_amount",
                "screenshot",
              ],
              expand: ["user", "course", "payment_method", "created_by"],
              sorts: ["-updated_at", "-created_at"],
            }}
            hideActionColumn={true}
            columns={getColumns(tenant)}
            enabled={
              user && isPaymentMembershipScoped(user)
                ? (filterParams.filter_params?.length ?? 0) > 0
                : true
            }
          />
        </div>
      )}

      <StudentPaymentsDrawer
        studentId={studentId}
        onClose={clearStudentId}
        onViewScreenshot={(url) => setViewImageUrl(url)}
      />

      {screenshotDialog}
```

This removes: the `cn(... isDetailOpen && "max-h-0 ...")` table-collapse wrapper, the `customComponentOnTable` `tableApiRows` fingerprint side effect, and the entire mobile-select + desktop sidebar/detail split block.

- [ ] **Step 2: Delete now-dead code in the page**

Remove these now-unused declarations and helpers from `page.tsx`:

- `buildStudentDetailFilterParams` (top-level function)
- `sortStudentPaymentDetailRows` (top-level function)
- `UniqueStudent` type
- State: `gridRows`/`setGridRows`, `sidebarSearch`/`setSidebarSearch`, `tableApiRows`/`setTableApiRows`, `lastTableRowsFingerprintRef`
- Memos: `uniqueStudents`, `filteredStudents`, `studentDetailFilterParams`, `studentDetailPanelName`
- `studentDetailQueryEnabled` + `studentDetailQuery`
- `renderStudentDetailContent`
- `isDetailOpen`

Also remove imports that become unused after deletion. Verify with the typecheck/lint in Step 3; likely unused after this task: `useRef`, `Table`/`TableBody`/`TableCell`/`TableHead`/`TableHeader`/`TableRow`, `TableSkeleton` (only if no longer used — it IS still used by the Glide `isTenantLoading` branch, so keep it), `ArrowLeft`, `X`, `queryParamDefault`, `makePostRequest`, `useQuery`, `cn` (keep if still referenced). Do not guess — let the linter list the unused ones.

- [ ] **Step 3: Delete the old side panel + typecheck/lint**

```bash
git rm src/components/finances/recent-transactions-side-panel.tsx
```

Run: `npx tsc --noEmit && npx eslint src/app/(internal)/finances/recent-transactions/page.tsx`
Expected: PASS with zero errors and zero unused-var warnings. Fix any remaining unused imports the linter reports.

- [ ] **Step 4: Manual verification**

Run: `npm run dev` and open `/finances/recent-transactions`.

Verify:
- Glide view: clicking a student name opens a wide right-side drawer; grid is full width (no narrow column). Header shows the name; summary shows payments / verified / total verified (mono). Cards list the student's payments.
- URL gains `?studentId=<id>`; refresh reopens the drawer; Escape and the X close it and clear the param.
- Toggle to legacy DataTable view (`GridViewToggle`): table stays visible; clicking a student name opens the same drawer; close returns to the table.
- "View screenshot" opens the image dialog above the drawer and closes back to it.
- As a membership-scoped (teacher) account, the drawer shows only that student's in-scope payments; loading skeleton, error, and empty states render.

- [ ] **Step 5: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS (includes the new `student-payments-detail-utils` tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/(internal)/finances/recent-transactions/page.tsx
git commit -m "feat: replace legacy student split with shared payments drawer"
```

---

## Notes / Risks

- **Nested dialogs:** the screenshot `Dialog` opens over the `Sheet` (both Radix). `SheetOverlay` is `z-250`; if the screenshot renders behind the sheet, bump the screenshot `DialogContent` z-index. Verify in Task 5 Step 4.
- **`tableApiRows` removal:** it only fed the old in-panel student switcher. Confirm the legacy table still loads after removing the `customComponentOnTable` fingerprint effect (Task 5 Step 4).
- **`onRowsChange`/`sidePanel` props on `StudentPaymentsGrid`** remain in the component API (used by the report variant); we simply stop passing them here. No grid changes in this plan.
```
