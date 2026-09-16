# Recent Transactions — Infinite Scroll, Date Dividers & Drawer Fix

**Date:** 2026-08-10  
**Status:** Approved for planning  
**Surface:** `/finances/recent-transactions` — ResourceTable only (Glide retired on this page)  
**Approach:** Dedicated timeline list + infinite query hook (Approach B)

## Summary

Redesign the Recent Transactions page as a single **ResourceTable-style timeline** with **infinite scroll**, **sticky date section headers**, and a **month filter with optional day drill-down**. Retire the Glide grid variant on this page. Fix the student detail drawer so it no longer shows an infinite skeleton when row context is missing.

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Primary view | ResourceTable only — remove Glide toggle and `StudentPaymentsGrid` `variant="recent-transactions"` from this page |
| Date filter | `YearMonthSelector` (default: current month) + optional day `DatePicker` within that month |
| Custom date range | **Out of scope** — no from/to range picker |
| List order | Newest first; scroll down loads older transactions |
| Date dividers | Sticky section headers per calendar day (bank-app / iMessage style) |
| Student drawer scope | Row-scoped: payments for that student in **that row's course + month** (from row `issued_at` or `billing_start_date`) |
| Backend | No API changes — reuse `POST user-payments/search` and `POST user-payments/admin-report` |

## Goals / non-goals

**Goals**

- Replace pagination with infinite scroll for a continuous transaction feed.
- Group transactions under sticky per-day headers in the tenant timezone.
- Replace single-day-only filter with month-first filtering and optional day narrowing.
- Fix drawer stuck-loading bug (`!enabled` treated as loading).
- Preserve existing inline editing (status, transaction ID), receipt download, screenshot view, and bank/course/status filters.

**Non-goals**

- Glide grid on recent-transactions (variant removed or dead-coded off).
- Custom from/to date range.
- Drawer showing all courses for a student in a month (row-scoped only).
- URL persistence for month/day/course filters (matches existing local-state behavior).
- Summary strip with verified totals (defer to v2 unless trivial).
- Virtualized list (`@tanstack/react-virtual`) — not needed at page size 30.
- Generic infinite-scroll mode on shared `ResourceTable`.

## Architecture

```
RecentTransactionsPage
  ├─ FilterToolbar
  │    ├─ YearMonthSelector (month anchor)
  │    ├─ DatePicker (optional day, constrained to month)
  │    ├─ Course / Status / Transaction ID / Bank filters (unchanged)
  │    └─ Search / Clear
  │
  ├─ useRecentTransactionsInfinite
  │    └─ useInfiniteQuery → POST user-payments/search
  │         sort: -issued_at (or -billing_start_date for user_upload)
  │         page size: 30
  │
  ├─ groupTransactionsByDay(flatRows, tenantTimezone)
  │
  ├─ RecentTransactionsTimeline
  │    ├─ sticky column header row
  │    ├─ per-day sticky section headers
  │    ├─ TransactionRow (reused cell renderers)
  │    └─ IntersectionObserver sentinel → fetchNextPage
  │
  └─ StudentPaymentsDrawer
       └─ useStudentPaymentsDetail(studentId, drawerCourseId, drawerMonthDate)
            row context only — no page-level course fallback
```

### Lofi — page layout

```
┌─ Sticky toolbar ─────────────────────────────────────────────────┐
│ [Year ▾] [Month ▾]  [Day (optional) 📅 ×]  [Course ▾] [Status ▾] │
│ [Transaction ID]  [Bank chips]              [Search] [Clear]       │
└────────────────────────────────────────────────────────────────────┘
┌─ Column headers (sticky below toolbar) ────────────────────────────┐
│ Student │ Course │ Amount │ Status │ Txn ID │ …                    │
└────────────────────────────────────────────────────────────────────┘
┌─ Scroll area (infinite) ───────────────────────────────────────────┐
│ ┌─ sticky ── Monday, Aug 10 ──────────────────────────────────┐ │
│ │ Ada Lee    │ Math 1 │ Ks 50,000 │ Verified │ …               │ │
│ │ Bob Tan    │ Eng 2  │ Ks 30,000 │ Pending  │ …               │ │
│ ┌─ sticky ── Sunday, Aug 9 ───────────────────────────────────┐ │
│ │ Carol Win  │ Sci 3  │ Ks 45,000 │ Verified │ …               │ │
│ │ … more rows …                                                  │ │
│ │ [spinner] loading older…                                       │ │
└────────────────────────────────────────────────────────────────────┘
```

Click student name → `StudentPaymentsDrawer` slides in from right with course + month from that row.

## Filter behavior

### Month picker

- Reuse `YearMonthSelector` with `layout="toolbar"`.
- Default: **current calendar month** on first visit.
- Sets list bounds via `getCalendarMonthUtcFilterBounds(monthDate, tenant.timezone)` in `buildRecentTxnFilterParams`.
- Date field: `issued_at` for standard tenants; `billing_start_date` for `user_upload` tenants (existing behavior).

### Day drill-down (optional)

- `DatePicker` labeled **Day**, placed beside month picker.
- When set: narrow filter to that single calendar day **within the selected month** (same gte/lte day bounds as today's single-day filter).
- `minDate` / `maxDate` on picker = first/last day of selected month.
- Clearing day restores full-month results.
- Changing month clears day if the selected day falls outside the new month.

### Other filters (unchanged)

- Course (`EntityCombobox` with `getActiveCourseFilterParams`)
- Status (`Selector`)
- Transaction ID (contains)
- Bank multi-select (non–`user_upload` tenants only)

### Search / Clear

- **Search** — applies pending text/status/course/bank filters, resets scroll to top, refetches from page 1.
- **Clear** — resets month to current month, clears day and all other filters, scrolls to top.

### `buildRecentTxnFilterParams` changes

Replace optional single `date?: Date` with:

```ts
type BuildRecentTxnFilterParamsOpts = {
  monthDate: Date;           // required month anchor
  day?: Date;                // optional; must fall within monthDate's month
  // ... existing fields
};
```

Emit month bounds when `day` is unset; emit single-day bounds when `day` is set.

## Infinite scroll & date grouping

### Hook: `useRecentTransactionsInfinite`

- Location: `src/hooks/finances/use-recent-transactions-infinite.ts`
- Uses `useInfiniteQuery` with `userPaymentsSearch` (same fields/expand as current list).
- `queryKey`: `["recent-transactions-infinite", filterParams, user?.id]`
- `getNextPageParam`: `lastPage.data.links.next ? pages.length + 1 : undefined` (same as `CourseFeedList`).
- Page size: **30**.
- Sort: `-issued_at` (or `-billing_start_date` for `user_upload`).
- On filter change: invalidate query, scroll container to top.

### Utility: `groupTransactionsByDay`

- Location: `src/lib/finances/group-transactions-by-day.ts`
- Input: flat `UserPayment[]`, tenant timezone, date field name.
- Output: `{ dateKey: string; label: string; rows: UserPayment[] }[]` sorted **newest day first**.
- `label`: formatted via `useDateFormatter` pattern — e.g. `"Monday, Aug 10"` (reuse course-feed label style).
- Rows within a section preserve API sort order.
- Rows missing a date field go in a trailing `"Unknown date"` section.

### Timeline: `RecentTransactionsTimeline`

- Location: `src/components/finances/recent-transactions-timeline.tsx`
- Renders a scrollable table with:
  - Sticky column header row (`top: 0` within scroll container, below page toolbar).
  - Per-day `<tr>` divider rows with `position: sticky`, `top` = toolbar + header height, `bg-surface/95 backdrop-blur`.
  - Data rows using extracted cell components.
  - Sentinel `<tr>` at bottom; `IntersectionObserver` triggers `fetchNextPage`.
- **Initial load:** `TableSkeleton` in scroll area.
- **Empty:** existing empty copy — "No transactions for this period."
- **End of list:** subtle "No more transactions" when `!hasNextPage && rows.length > 0`.
- **Fetching next page:** small spinner row at bottom.

### Cell renderers

Extract from `page.tsx` into `src/components/finances/recent-transactions-cells.tsx`:

- Student name link → `onOpenStudentFromRow(row)`
- Status inline form, transaction ID autosave, amount, receipt actions, screenshot, bank column, etc.

No behavior change to inline editing or cache patching.

## Student drawer fix

### Root cause

`StudentPaymentsDrawer` renders skeleton when `!enabled || query.isLoading`. When `courseId` is missing (Glide click without row context, or row without `course.id`), `enabled` is false but the query never runs → **infinite skeleton**.

### Fix

**1. Drawer states** — split disabled vs loading:

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
) : query.isError ? ( ... ) : rows.length === 0 ? ( ... ) : ( ... )}
```

**2. Single open path from timeline** — always `openStudentFromRow(row)`:

```ts
function openStudentFromRow(row: UserPayment) {
  const uid = row.user?.id;
  if (uid == null) return;
  setStudentId(String(uid));
  const cid = row.course?.id;
  setDrawerCourseId(cid != null ? String(cid) : "");
  const raw = row.issued_at ?? row.billing_start_date ?? null;
  const parsed = raw ? new Date(raw) : new Date();
  setDrawerMonthDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
}
```

**3. No page-level fallback** — drawer props:

```tsx
<StudentPaymentsDrawer
  studentId={studentId}
  courseId={drawerCourseId}      // not drawerCourseId || courseId
  monthDate={drawerMonthDate}
  courseTitle={drawerCourseTitle} // optional, from row.course.title
  ...
/>
```

**4. Drawer header copy** — when enabled and loaded:

> Payments for **{studentName}** in **{courseTitle}** — **{monthLabel}**

**5. Deep link** — keep optional `?studentId=`; also require `courseId` and `month` (`YYYY-MM`) query params to auto-open drawer. Without them, ignore `studentId` param.

Remove `openStudentById` and Glide wiring.

## Glide retirement on this page

| Item | Action |
|------|--------|
| `useGridViewPreference("recent-transactions")` on page | Remove |
| `GridViewToggle` on page | Remove |
| `StudentPaymentsGrid variant="recent-transactions"` branch | Remove from page |
| `student-payments-grid.tsx` recent variant | Remove variant code paths or leave guarded dead code with comment if report variant still uses shared pieces — prefer deleting recent-only branches |

Report variant (`variant="report"`) on Student Payments page is **unchanged**.

## Components & files

| File | Change |
|------|--------|
| `src/app/(internal)/finances/recent-transactions/page.tsx` | Remove Glide branch; month/day filter state; wire timeline + drawer |
| `src/components/finances/recent-transactions-timeline.tsx` | **New** — infinite scroll table with sticky date headers |
| `src/components/finances/recent-transactions-cells.tsx` | **New** — extracted cell renderers |
| `src/hooks/finances/use-recent-transactions-infinite.ts` | **New** — `useInfiniteQuery` wrapper |
| `src/lib/finances/group-transactions-by-day.ts` | **New** — date grouping utility |
| `src/lib/finances/group-transactions-by-day.test.ts` | **New** — grouping + timezone tests |
| `src/lib/finances/build-recent-txn-filter-params.ts` | Month bounds + optional day; update opts type |
| `src/lib/finances/build-recent-txn-filter-params.test.ts` | Extend tests for month/day bounds |
| `src/components/finances/student-payments-drawer.tsx` | Disabled vs loading; header shows course + month |
| `src/components/finances/student-payments-grid.tsx` | Remove `recent-transactions` variant (if no other consumers) |

## Edge cases

| Case | Behavior |
|------|----------|
| Row missing `course.id` | Student name still clickable; drawer shows "Can't load payments" empty state |
| Day selected outside month after month change | Day auto-cleared |
| `user_upload` tenant | Date field = `billing_start_date`; sort and grouping use same field |
| No transactions in month | Empty state in scroll area |
| Filter changes mid-scroll | Scroll to top, reset infinite query |
| All pages loaded | Show "No more transactions" footer |
| Membership-scoped user | Existing filter-param count gate unchanged |
| Inline edit on row | Cache patch + invalidate `recent-transactions-infinite` query key |

## Testing

High-value only (per project test rules):

**FE unit — `buildRecentTxnFilterParams`**

- Emits month gte/lte bounds when only `monthDate` set.
- Emits single-day bounds when `day` is set within month.
- Uses `billing_start_date` for `user_upload` tenants.

**FE unit — `groupTransactionsByDay`**

- Groups rows by tenant timezone calendar day.
- Newest day section first.
- Handles rows with missing date (unknown section).

**FE unit — drawer enabled gate**

- `enabled=false` with valid `studentId` but empty `courseId` → not treated as loading (caller-contract or drawer render test).

**FE unit — `openStudentFromRow`**

- Sets `drawerCourseId` and `drawerMonthDate` from row fields.

No happy-path-only "timeline renders" smoke tests. No backend changes.

## Out of scope

- Glide grid on recent-transactions
- Custom from/to date range
- URL persistence for month/day filters
- Summary strip with verified totals (v2)
- Virtualization
- Drawer showing cross-course payments for a month
- Changes to Student Payments report page
