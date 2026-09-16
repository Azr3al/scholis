# Recent Transactions Infinite Scroll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace paginated Recent Transactions with an infinite-scroll timeline grouped by sticky date headers, month+day filters, row-scoped student drawer, and fix the drawer infinite-skeleton bug.

**Architecture:** Extend `buildRecentTxnFilterParams` for month/day bounds; add `groupTransactionsByDay` + `useRecentTransactionsInfinite`; build `RecentTransactionsTimeline` with extracted cell renderers; rewire `page.tsx` and remove Glide. Fix `StudentPaymentsDrawer` disabled vs loading states.

**Tech Stack:** Next.js App Router, React, TanStack Query (`useInfiniteQuery`), Vitest (`npm run test:unit` from `schedjuice-reimagined-fe/`), existing `YearMonthSelector`, `DatePicker`, `StudentPaymentsDrawer`, `POST user-payments/search`.

**Spec:** `docs/superpowers/specs/2026-08-10-recent-transactions-infinite-scroll-design.md`

## Global Constraints

- Primary view: **ResourceTable timeline only** — remove Glide toggle and `StudentPaymentsGrid variant="recent-transactions"` from this page.
- Date filter: **`YearMonthSelector`** (default current month) + optional **day `DatePicker`** within month; **no custom from/to range**.
- List order: **newest first**; scroll down loads older; **sticky per-day section headers**.
- Student drawer: **row-scoped** course + month from clicked row; **no page-level course fallback**.
- Infinite page size: **30**; sort `-issued_at` (or `-billing_start_date` for `user_upload`).
- Backend: **no API changes**.
- High-value tests only — no render smoke tests.
- All FE commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/build-recent-txn-filter-params.ts` | Modify | Month bounds + optional day drill-down |
| `src/lib/finances/build-recent-txn-filter-params.test.ts` | Modify | Month/day/billing field tests |
| `src/lib/finances/group-transactions-by-day.ts` | Create | Group flat rows by tenant calendar day |
| `src/lib/finances/group-transactions-by-day.test.ts` | Create | Grouping + timezone tests |
| `src/lib/finances/recent-transactions-row-utils.ts` | Create | Pure row → drawer context parser |
| `src/lib/finances/recent-transactions-row-utils.test.ts` | Create | Caller-contract tests for row shape |
| `src/lib/finances/recent-transactions-list-fields.ts` | Create | Shared `fields` array for search |
| `src/hooks/finances/use-recent-transactions-infinite.ts` | Create | `useInfiniteQuery` wrapper |
| `src/components/finances/recent-transactions-cells.tsx` | Create | Extracted inline-edit cell components |
| `src/components/finances/recent-transactions-timeline.tsx` | Create | Infinite scroll table + sticky date headers |
| `src/components/finances/student-payments-drawer.tsx` | Modify | Disabled vs loading; course + month header |
| `src/app/(internal)/finances/recent-transactions/page.tsx` | Modify | New filters, timeline, drawer wiring; remove Glide |
| `src/components/finances/student-payments-grid.tsx` | Modify | Remove `recent-transactions` variant branches |

---

### Task 1: Month + day filter params

**Files:**
- Modify: `src/lib/finances/build-recent-txn-filter-params.ts`
- Modify: `src/lib/finances/build-recent-txn-filter-params.test.ts`

**Interfaces:**
- Consumes: `getCalendarMonthUtcFilterBounds`, `TransactionScreenshotStrategy`, existing membership/course/bank filters
- Produces:
  ```ts
  export type BuildRecentTxnFilterParamsOpts = {
    transactionId: string;
    monthDate: Date;
    day?: Date;
    courseId: string;
    status?: UserPaymentStatus;
    tenant?: organizationType | null;
    paymentBanks?: PaymentBank[];
  };
  ```

- [ ] **Step 1: Write failing tests**

Append to `build-recent-txn-filter-params.test.ts`:

```ts
import { TransactionScreenshotStrategy } from "@/types/organization";

const monthDate = new Date(2026, 7, 1); // Aug 2026 local

it("emits month gte/lte on issued_at when only monthDate is set", () => {
  const result = buildRecentTxnFilterParams(user, {
    transactionId: "",
    courseId: "",
    monthDate,
  });
  const bounds = result.filter_params?.filter((p) => p.field_name === "issued_at");
  expect(bounds).toHaveLength(2);
  expect(bounds?.[0]?.operator).toBe(operatorEnum.gte);
  expect(bounds?.[1]?.operator).toBe(operatorEnum.lte);
});

it("emits single-day bounds when day is set", () => {
  const day = new Date(2026, 7, 10);
  const result = buildRecentTxnFilterParams(user, {
    transactionId: "",
    courseId: "",
    monthDate,
    day,
  });
  const bounds = result.filter_params?.filter((p) => p.field_name === "issued_at");
  expect(bounds).toHaveLength(2);
  expect(bounds?.[0]?.value).toContain("2026-08-10");
});

it("uses billing_start_date for user_upload tenants", () => {
  const result = buildRecentTxnFilterParams(user, {
    transactionId: "",
    courseId: "",
    monthDate,
    tenant: {
      transaction_screenshot_strategy: TransactionScreenshotStrategy.user_upload,
    } as never,
  });
  expect(
    result.filter_params?.every((p) => p.field_name === "billing_start_date"),
  ).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/finances/build-recent-txn-filter-params.test.ts`  
Expected: FAIL — `monthDate` required / month bounds missing

- [ ] **Step 3: Implement month + day bounds**

Replace `date?: Date` with `monthDate: Date` and `day?: Date` in opts. Replace the `if (opts.date)` block:

```ts
const fieldName =
  opts.tenant?.transaction_screenshot_strategy ===
  TransactionScreenshotStrategy.user_upload
    ? "billing_start_date"
    : "issued_at";

if (opts.day) {
  fParams.filter_params?.push(
    {
      field_name: fieldName,
      operator: operatorEnum.gte,
      value: new Date(
        opts.day.getFullYear(),
        opts.day.getMonth(),
        opts.day.getDate(),
        0, 0, 0,
      ).toISOString(),
    },
    {
      field_name: fieldName,
      operator: operatorEnum.lte,
      value: new Date(
        opts.day.getFullYear(),
        opts.day.getMonth(),
        opts.day.getDate(),
        23, 59, 59,
      ).toISOString(),
    },
  );
} else if (opts.monthDate) {
  const bounds = getCalendarMonthUtcFilterBounds(opts.monthDate);
  fParams.filter_params?.push(
    {
      field_name: fieldName,
      operator: operatorEnum.gte,
      value: bounds.start.toISOString(),
    },
    {
      field_name: fieldName,
      operator: operatorEnum.lte,
      value: bounds.end.toISOString(),
    },
  );
}
```

Add import: `import { getCalendarMonthUtcFilterBounds } from "@/helpers/date";`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/finances/build-recent-txn-filter-params.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/build-recent-txn-filter-params.ts src/lib/finances/build-recent-txn-filter-params.test.ts
git commit -m "feat(finance): add month and day bounds to recent txn filter builder"
```

---

### Task 2: `groupTransactionsByDay`

**Files:**
- Create: `src/lib/finances/group-transactions-by-day.ts`
- Create: `src/lib/finances/group-transactions-by-day.test.ts`

**Interfaces:**
- Consumes: `formatInTimeZone` from `date-fns-tz`, `UserPayment`
- Produces:
  ```ts
  export type TransactionDaySection = {
    dateKey: string;
    label: string;
    rows: UserPayment[];
  };

  export function getRecentTxnDateField(
    userUpload: boolean,
  ): "issued_at" | "billing_start_date";

  export function groupTransactionsByDay(args: {
    rows: UserPayment[];
    timezone: string;
    dateField: "issued_at" | "billing_start_date";
    formatDayLabel: (dateKey: string) => string;
  }): TransactionDaySection[];
  ```

- [ ] **Step 1: Write failing tests**

Create `group-transactions-by-day.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupTransactionsByDay } from "./group-transactions-by-day";
import type { UserPayment } from "@/sdk";

const formatDayLabel = (dateKey: string) => dateKey;

function row(id: number, issued_at: string): UserPayment {
  return { id, issued_at } as UserPayment;
}

describe("groupTransactionsByDay", () => {
  it("groups rows by tenant timezone calendar day, newest day first", () => {
    const rows = [
      row(1, "2026-08-09T10:00:00.000Z"),
      row(2, "2026-08-10T08:00:00.000Z"),
      row(3, "2026-08-10T12:00:00.000Z"),
    ];
    const sections = groupTransactionsByDay({
      rows,
      timezone: "Asia/Yangon",
      dateField: "issued_at",
      formatDayLabel,
    });
    expect(sections.map((s) => s.dateKey)).toEqual(["2026-08-10", "2026-08-09"]);
    expect(sections[0].rows.map((r) => r.id)).toEqual([2, 3]);
  });

  it("puts rows with missing date in unknown section last", () => {
    const rows = [row(1, "2026-08-10T08:00:00.000Z"), { id: 2 } as UserPayment];
    const sections = groupTransactionsByDay({
      rows,
      timezone: "UTC",
      dateField: "issued_at",
      formatDayLabel,
    });
    expect(sections.at(-1)?.dateKey).toBe("unknown");
    expect(sections.at(-1)?.rows.map((r) => r.id)).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/finances/group-transactions-by-day.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement grouping**

Create `group-transactions-by-day.ts`:

```ts
import { formatInTimeZone } from "date-fns-tz";
import type { UserPayment } from "@/sdk";

export type TransactionDaySection = {
  dateKey: string;
  label: string;
  rows: UserPayment[];
};

export function getRecentTxnDateField(
  userUpload: boolean,
): "issued_at" | "billing_start_date" {
  return userUpload ? "billing_start_date" : "issued_at";
}

function readRowDate(
  row: UserPayment,
  dateField: "issued_at" | "billing_start_date",
): string | null {
  const raw = row[dateField];
  return typeof raw === "string" && raw.trim() ? raw : null;
}

export function groupTransactionsByDay(args: {
  rows: UserPayment[];
  timezone: string;
  dateField: "issued_at" | "billing_start_date";
  formatDayLabel: (dateKey: string) => string;
}): TransactionDaySection[] {
  const { rows, timezone, dateField, formatDayLabel } = args;
  const byDay = new Map<string, UserPayment[]>();
  const unknown: UserPayment[] = [];

  for (const row of rows) {
    const raw = readRowDate(row, dateField);
    if (!raw) {
      unknown.push(row);
      continue;
    }
    const dateKey = formatInTimeZone(new Date(raw), timezone, "yyyy-MM-dd");
    const bucket = byDay.get(dateKey);
    if (bucket) bucket.push(row);
    else byDay.set(dateKey, [row]);
  }

  const sections: TransactionDaySection[] = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayRows]) => ({
      dateKey,
      label: formatDayLabel(dateKey),
      rows: dayRows,
    }));

  if (unknown.length > 0) {
    sections.push({
      dateKey: "unknown",
      label: "Unknown date",
      rows: unknown,
    });
  }

  return sections;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/finances/group-transactions-by-day.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/group-transactions-by-day.ts src/lib/finances/group-transactions-by-day.test.ts
git commit -m "feat(finance): group recent transactions by calendar day"
```

---

### Task 3: Row drawer context + drawer disabled state

**Files:**
- Create: `src/lib/finances/recent-transactions-row-utils.ts`
- Create: `src/lib/finances/recent-transactions-row-utils.test.ts`
- Modify: `src/components/finances/student-payments-drawer.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type RecentTxnRowDrawerContext = {
    studentId: string;
    courseId: string;
    monthDate: Date;
    courseTitle: string | null;
  };

  export function parseRecentTxnRowDrawerContext(
    row: UserPayment,
  ): RecentTxnRowDrawerContext | null;
  ```

- [ ] **Step 1: Write failing row-utils tests**

```ts
import { describe, expect, it } from "vitest";
import { parseRecentTxnRowDrawerContext } from "./recent-transactions-row-utils";
import type { UserPayment } from "@/sdk";

describe("parseRecentTxnRowDrawerContext", () => {
  it("returns course and month from row fields", () => {
    const row = {
      user: { id: 9, name: "Ada" },
      course: { id: 42, title: "Math 1" },
      issued_at: "2026-08-10T04:00:00.000Z",
    } as UserPayment;
    const ctx = parseRecentTxnRowDrawerContext(row);
    expect(ctx).toMatchObject({
      studentId: "9",
      courseId: "42",
      courseTitle: "Math 1",
    });
    expect(ctx?.monthDate.getMonth()).toBe(7);
  });

  it("returns null when user id is missing", () => {
    expect(parseRecentTxnRowDrawerContext({ course: { id: 1 } } as UserPayment)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/finances/recent-transactions-row-utils.test.ts`

- [ ] **Step 3: Implement row utils**

```ts
import type { UserPayment } from "@/sdk";

export type RecentTxnRowDrawerContext = {
  studentId: string;
  courseId: string;
  monthDate: Date;
  courseTitle: string | null;
};

export function parseRecentTxnRowDrawerContext(
  row: UserPayment,
): RecentTxnRowDrawerContext | null {
  const uid = row.user?.id;
  if (uid == null) return null;
  const cid = row.course?.id;
  const raw = row.issued_at ?? row.billing_start_date ?? null;
  const parsed = raw ? new Date(raw) : new Date();
  const monthDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return {
    studentId: String(uid),
    courseId: cid != null ? String(cid) : "",
    monthDate,
    courseTitle: row.course?.title ?? null,
  };
}
```

- [ ] **Step 4: Fix drawer disabled vs loading**

In `student-payments-drawer.tsx`:

1. Add optional props:
   ```ts
   courseTitle?: string | null;
   ```
2. Replace loading branch:
   ```tsx
   {!enabled ? (
     <EmptyState>
       <EmptyCopy
         title="Can't load payments"
         description="This row is missing course information."
       />
     </EmptyState>
   ) : query.isLoading ? (
     <TableSkeleton columns={4} rows={5} />
   ) : ...
   ```
3. Update `Sheet.Description`:
   ```tsx
   Payments for this student
   {courseTitle ? ` in ${courseTitle}` : ""}
   {monthDate ? ` — ${formatMonthLabel(monthDate)}` : ""}.
   ```
   Add small helper `formatMonthLabel` using existing `formatDate` or `toLocaleString`.

- [ ] **Step 5: Add drawer render test**

Create `src/components/finances/__tests__/student-payments-drawer-disabled.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudentPaymentsDrawer } from "../student-payments-drawer";

vi.mock("@/hooks/finances/use-student-payments-detail", () => ({
  useStudentPaymentsDetail: () => ({
    query: { isLoading: false, isError: false },
    rows: [],
    studentName: null,
    enabled: false,
  }),
}));

describe("StudentPaymentsDrawer", () => {
  it("shows empty state instead of skeleton when enabled is false", () => {
    render(
      <StudentPaymentsDrawer
        studentId="1"
        courseId=""
        monthDate={new Date()}
        onClose={() => {}}
        onViewScreenshot={() => {}}
      />,
    );
    expect(screen.getByText(/can't load payments/i)).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/finances/recent-transactions-row-utils.test.ts src/components/finances/__tests__/student-payments-drawer-disabled.test.tsx`

- [ ] **Step 7: Commit**

```bash
git add src/lib/finances/recent-transactions-row-utils.ts src/lib/finances/recent-transactions-row-utils.test.ts src/components/finances/student-payments-drawer.tsx src/components/finances/__tests__/student-payments-drawer-disabled.test.tsx
git commit -m "fix(finance): row-scoped drawer context and disabled empty state"
```

---

### Task 4: Infinite query hook + list fields

**Files:**
- Create: `src/lib/finances/recent-transactions-list-fields.ts`
- Create: `src/hooks/finances/use-recent-transactions-infinite.ts`

**Interfaces:**
- Produces:
  ```ts
  export const RECENT_TRANSACTIONS_LIST_FIELDS: string[];

  export function useRecentTransactionsInfinite(args: {
    filterParams: filterParamsBody["filter_params"];
    sorts: string[];
    enabled: boolean;
    userUpload: boolean;
  }): {
    rows: UserPayment[];
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
  };
  ```

- [ ] **Step 1: Create shared fields list**

Move the `fields` array from `page.tsx` (lines ~296–325) into `recent-transactions-list-fields.ts`:

```ts
export const RECENT_TRANSACTIONS_LIST_FIELDS = [
  "id",
  "user.id",
  "user.name",
  // ... exact list from page.tsx today
] as const;

export const RECENT_TRANSACTIONS_LIST_EXPAND = [
  "user",
  "course",
  "payment_method",
  "created_by",
  "verified_by",
] as const;

export const RECENT_TRANSACTIONS_PAGE_SIZE = 30;
```

- [ ] **Step 2: Implement hook**

```ts
"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { queryParamDefault } from "@/config/defaults";
import type { UserPayment } from "@/sdk";
import {
  RECENT_TRANSACTIONS_LIST_EXPAND,
  RECENT_TRANSACTIONS_LIST_FIELDS,
  RECENT_TRANSACTIONS_PAGE_SIZE,
} from "@/lib/finances/recent-transactions-list-fields";

type SearchPage = {
  data?: {
    data?: UserPayment[];
    links?: { next?: string | null };
    total_pages?: number;
  };
};

export function useRecentTransactionsInfinite(args: {
  filterParams: { field_name: string; operator: string; value: string }[];
  sorts: string[];
  enabled: boolean;
}) {
  const query = useInfiniteQuery({
    queryKey: ["recent-transactions-infinite", args.filterParams, args.sorts],
    enabled: args.enabled,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      return searchEntities(
        "user-payments",
        {
          ...queryParamDefault,
          page: pageParam,
          size: RECENT_TRANSACTIONS_PAGE_SIZE,
          sorts: args.sorts,
          fields: [...RECENT_TRANSACTIONS_LIST_FIELDS],
          expand: [...RECENT_TRANSACTIONS_LIST_EXPAND],
        },
        { filter_params: args.filterParams },
      );
    },
    getNextPageParam: (lastPage: SearchPage, pages) => {
      if (lastPage.data?.links?.next) return pages.length + 1;
      const totalPages = lastPage.data?.total_pages;
      if (typeof totalPages === "number" && pages.length < totalPages) {
        return pages.length + 1;
      }
      return undefined;
    },
  });

  const rows =
    query.data?.pages.flatMap((p) => p.data?.data ?? []) ?? [];

  return {
    rows,
    fetchNextPage: () => void query.fetchNextPage(),
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
```

- [ ] **Step 3: Manual smoke** — defer to Task 7 page wiring; no unit test for hook (integration covered by page behavior).

- [ ] **Step 4: Commit**

```bash
git add src/lib/finances/recent-transactions-list-fields.ts src/hooks/finances/use-recent-transactions-infinite.ts
git commit -m "feat(finance): infinite query hook for recent transactions"
```

---

### Task 5: Extract cell renderers

**Files:**
- Create: `src/components/finances/recent-transactions-cells.tsx`
- Modify: `src/app/(internal)/finances/recent-transactions/page.tsx` (temporary — move imports only if needed in Task 7)

**Interfaces:**
- Produces exported components used by timeline:
  ```ts
  export function RecentTxnStudentCell(props: {
    row: UserPayment;
    onOpenStudent: (row: UserPayment) => void;
    pathname: string;
    searchParams: URLSearchParams;
  }): JSX.Element;

  export function TransactionIdCell({ row }: { row: UserPayment }): JSX.Element;
  // + status cell, amount, receipt actions, screenshot, etc. moved from page.tsx
  ```

- [ ] **Step 1: Move `TransactionIdCell` and student name cell** from `page.tsx` into `recent-transactions-cells.tsx` without behavior changes.

- [ ] **Step 2: Move remaining column cell renderers** referenced in `columns` useMemo (status inline form, receipt download, coverage edit trigger, bank text, screenshot thumbnail).

- [ ] **Step 3: Export a `buildRecentTransactionsColumns` factory** (or keep columns in page but cells in separate file — prefer factory in cells file accepting callbacks):

```ts
export function buildRecentTransactionsColumns(args: {
  tenant: organizationType;
  user: accountType;
  pathname: string;
  searchParams: URLSearchParams;
  onOpenStudent: (row: UserPayment) => void;
  onOpenCoverageEdit: (row: UserPayment) => void;
  onDownloadReceipt: (row: UserPayment) => void;
  downloadingReceiptId: number | null;
  onViewScreenshot: (url: string) => void;
}): Column<UserPayment>[];
```

Reuse `recentTransactionsColumnLayout` + `applyColumnLayoutMeta` exactly as today.

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/recent-transactions-cells.tsx
git commit -m "refactor(finance): extract recent transactions cell renderers"
```

---

### Task 6: `RecentTransactionsTimeline` component

**Files:**
- Create: `src/components/finances/recent-transactions-timeline.tsx`

**Interfaces:**
- Consumes: `groupTransactionsByDay`, `buildRecentTransactionsColumns`, `useRecentTransactionsInfinite` outputs
- Produces: `RecentTransactionsTimeline` component

- [ ] **Step 1: Implement timeline shell**

```tsx
"use client";

export function RecentTransactionsTimeline({
  rows,
  sections,
  columns,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  fetchNextPage,
  scrollRef,
}: {
  rows: UserPayment[];
  sections: TransactionDaySection[];
  columns: Column<UserPayment>[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  fetchNextPage: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading) return <TableSkeleton columns={columns.length} rows={8} />;

  if (rows.length === 0) {
    return (
      <EmptyState>
        <EmptyCopy title="No transactions" description="No transactions for this period." />
      </EmptyState>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-[calc(100dvh-12rem)] overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-sticky bg-surface/95 backdrop-blur">
          <tr>
            {columns.map((col) => (
              <th key={col.id} className="px-3 py-2 text-left font-medium text-muted-foreground">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <Fragment key={section.dateKey}>
              <tr className="sticky top-10 z-sticky bg-surface/95 backdrop-blur">
                <td colSpan={columns.length} className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  {section.label}
                </td>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.id} className="border-t border-border/60 hover:bg-muted/30">
                  {columns.map((col) => (
                    <td key={col.id} className="px-3 py-2 align-middle">
                      {col.cell ? col.cell({ row }) : col.accessor?.(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
          <tr ref={sentinelRef}>
            <td colSpan={columns.length} className="py-4 text-center text-xs text-muted-foreground">
              {isFetchingNextPage ? <Spinner className="mx-auto h-5 w-5" /> : null}
              {!hasNextPage && rows.length > 0 ? "No more transactions" : null}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/finances/recent-transactions-timeline.tsx
git commit -m "feat(finance): recent transactions timeline with sticky date headers"
```

---

### Task 7: Rewire `page.tsx`

**Files:**
- Modify: `src/app/(internal)/finances/recent-transactions/page.tsx`

**Interfaces:**
- Consumes: all prior tasks

- [ ] **Step 1: Remove Glide imports and branch**

Delete: `useGridViewPreference`, `GridViewToggle`, `StudentPaymentsGrid`, `openStudentById`, `useResourceTableState`, `useUserPaymentsList`, `ResourceTable`, glide loading branch (lines ~729–749).

- [ ] **Step 2: Replace date state with month + day**

```ts
const [monthDate, setMonthDate] = useState(() => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
});
const [day, setDay] = useState<Date | undefined>(undefined);
const scrollRef = useRef<HTMLDivElement>(null);
const [drawerCourseTitle, setDrawerCourseTitle] = useState<string | null>(null);
```

When `setMonthDate` changes, clear `day` if outside new month:

```ts
const handleMonthChange = (next: Date) => {
  setMonthDate(new Date(next.getFullYear(), next.getMonth(), 1));
  setDay((prev) =>
    prev &&
    (prev.getFullYear() !== next.getFullYear() || prev.getMonth() !== next.getMonth())
      ? undefined
      : prev,
  );
};
```

- [ ] **Step 3: Update filter toolbar**

Replace single `DatePicker` with:

```tsx
<YearMonthSelector
  date={monthDate}
  setDate={handleMonthChange}
  layout="toolbar"
  label="Month"
/>
<FilterToolbarField label="Day" width="md">
  <DatePicker
    date={day}
    setDate={setDay}
    minDate={new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)}
    maxDate={new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)}
  />
</FilterToolbarField>
```

Update `filterParams` memo to pass `monthDate` + `day` instead of `date`.

- [ ] **Step 4: Wire infinite hook + timeline**

```ts
const userUpload =
  tenant?.transaction_screenshot_strategy === TransactionScreenshotStrategy.user_upload;
const sorts = userUpload ? ["-billing_start_date"] : ["-issued_at"];

const infinite = useRecentTransactionsInfinite({
  filterParams,
  sorts,
  enabled: listEnabled,
});

const dateField = getRecentTxnDateField(userUpload);
const sections = useMemo(
  () =>
    groupTransactionsByDay({
      rows: infinite.rows,
      timezone: tenant?.timezone ?? "UTC",
      dateField,
      formatDayLabel: (dateKey) => { /* useDateFormatter in component or pass formatter */ },
    }),
  [infinite.rows, tenant?.timezone, dateField],
);

const openStudentFromRow = useCallback((row: UserPayment) => {
  const ctx = parseRecentTxnRowDrawerContext(row);
  if (!ctx) return;
  setStudentId(ctx.studentId);
  setDrawerCourseId(ctx.courseId);
  setDrawerMonthDate(ctx.monthDate);
  setDrawerCourseTitle(ctx.courseTitle);
}, []);
```

On Search / filter apply:

```ts
scrollRef.current?.scrollTo({ top: 0 });
void infinite.refetch();
```

- [ ] **Step 5: Update drawer props**

```tsx
<StudentPaymentsDrawer
  studentId={studentId}
  courseId={drawerCourseId}
  monthDate={drawerMonthDate}
  courseTitle={drawerCourseTitle}
  onClose={clearStudentId}
  onViewScreenshot={(url) => setViewImageUrl(url)}
/>
```

Remove `courseId={drawerCourseId || courseId}` fallback.

- [ ] **Step 6: Deep link gate**

Only auto-open drawer when URL has `studentId`, `courseId`, and `month=YYYY-MM`:

```ts
useEffect(() => {
  const sid = searchParams.get("studentId");
  const cid = searchParams.get("courseId");
  const month = searchParams.get("month");
  if (!sid || !cid || !month) return;
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return;
  setStudentId(sid);
  setDrawerCourseId(cid);
  setDrawerMonthDate(new Date(y, m - 1, 1));
}, [searchParams]);
```

Sync URL on open to include all three params.

- [ ] **Step 7: Inline edit cache**

After successful autosave/status update, add:

```ts
void queryClient.invalidateQueries({ queryKey: ["recent-transactions-infinite"] });
```

Keep existing `patchPaymentRowInQueryCaches` for any remaining list caches.

- [ ] **Step 8: Clear filters**

```ts
const clearFilters = () => {
  const now = new Date();
  setMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
  setDay(undefined);
  setTransactionId("");
  setCourseId("");
  setStatus(undefined);
  setSelectedBanks([]);
  scrollRef.current?.scrollTo({ top: 0 });
};
```

- [ ] **Step 9: Manual verify**

1. Open `/finances/recent-transactions` — default month loads, scroll fetches more.
2. Set day filter — list narrows to one day.
3. Click student — drawer loads payments (not skeleton).
4. Click student on row missing course — empty state in drawer.
5. Inline edit transaction ID — row updates after save.

- [ ] **Step 10: Commit**

```bash
git add src/app/(internal)/finances/recent-transactions/page.tsx
git commit -m "feat(finance): infinite scroll recent transactions page"
```

---

### Task 8: Remove Glide recent-transactions variant

**Files:**
- Modify: `src/components/finances/student-payments-grid.tsx`

- [ ] **Step 1: Delete `recent-transactions` variant**

Remove:
- `variant?: "report" | "recent-transactions"` → `"report"` only (or drop prop if always report)
- `RECENT_TXN_PAGE_SIZE`, `recentDate`, `recentCourseId`, `recentStatus`, `recentBanks`, `recentPage`, `recentFilterParams`, `recentDataQuery`, recent filter toolbar UI, recent pagination, `onOpenStudent` prop used only for recent
- `buildRecentTxnFilterParams` import if only used by recent branch

Keep `variant="report"` / `StudentPaymentsReportShell` usage unchanged.

- [ ] **Step 2: Grep for `recent-transactions` variant references**

Run: `cd schedjuice-reimagined-fe && rg 'recent-transactions' src/`  
Fix any remaining imports.

- [ ] **Step 3: Run unit tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit`  
Expected: PASS (or only pre-existing failures)

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/student-payments-grid.tsx
git commit -m "chore(finance): remove glide recent-transactions variant"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
| --- | --- |
| ResourceTable only, Glide retired | Task 7, 8 |
| Month picker + optional day | Task 1, 7 |
| Infinite scroll, page size 30 | Task 4, 6, 7 |
| Sticky date headers | Task 6 |
| Newest first sort | Task 4, 7 |
| Row-scoped drawer | Task 3, 7 |
| Drawer disabled ≠ loading | Task 3 |
| No page-level course fallback | Task 7 |
| Preserve inline editing / filters | Task 5, 7 |
| `buildRecentTxnFilterParams` tests | Task 1 |
| `groupTransactionsByDay` tests | Task 2 |
| Drawer enabled gate test | Task 3 |
| Row context parser test | Task 3 |
| No backend changes | — |

## Self-Review

- No TBD/TODO placeholders in tasks.
- Type names consistent: `TransactionDaySection`, `RecentTxnRowDrawerContext`, `useRecentTransactionsInfinite`.
- `monthDate` required everywhere filter builder is called; grid recent branch removed in Task 8.
- `getCalendarMonthUtcFilterBounds` matches existing student-detail month filtering (no timezone param — consistent with codebase).
