# Course student payments: month selector + wider txn/description columns

**Date:** 2026-07-11  
**Status:** Approved  
**Surfaces:** `/courses/[id]/student-payments` (month selector); finance + course student-payments ResourceTable and Glide bodies (column widths)

## Problem

1. **Missing month control on course page.** `/courses/[id]/student-payments` no longer shows a year-month selector. Pre-T3 UI had “Filter by month” for course-scoped reports; the Glide migration and later report shell kept the finance-only guard (`!fixedCourseId`), so course staff cannot browse previous months even though `useStudentPaymentsAdminReport` still filters by the `date` query param.
2. **Cramped editable fields.** In the original ResourceTable view, Transaction ID and Description inputs use `min-w-0` and shrink until values clip (e.g. “Paymen…”). Glide column widths (`180` / `200`) are also tight for typical values.

## Goals

- Show `YearMonthSelector` in the **shared filter bar** on the course student-payments page (same placement pattern as finance).
- Widen Transaction ID and Description in **both** ResourceTable (original) and Glide (new look).

## Non-goals

- Do not add a ResourceTable column `size` / `minSize` API.
- Do not restore the old course sidebar “Filter by month” layout.
- Do not change admin-report / month-bound backend filter logic.
- Do not show a month selector in global transaction-lookup mode.

## Approach

Local-only UI tweaks in the existing shell, grid, and resource table — no shared-table framework work.

## Design

### Course month selector

**Visibility**

| Mode | Month selector |
|---|---|
| Course page (`fixedCourseId`) | Show |
| Finance page (no fixed course) | Show (unchanged) |
| Global transaction lookup | Hide (unchanged) |

**Implementation**

- In `StudentPaymentsReportShell` and `StudentPaymentsGrid` report filter controls, change the guard from `!fixedCourseId && !globalTransactionLookup` to `!globalTransactionLookup`.
- Keep the course combobox hidden when `fixedCourseId` is set.
- Pass `monthType` from `courseMeta?.start_date` via `getCourseMonthType` (same as today when course meta is available).
- Changing month updates the existing `date` URL state and refetches through `useStudentPaymentsAdminReport` (already wired).

**Lofi — course filter bar**

```
[ Transaction ID ____ ]  [ Month: ◀ Jul 2026 ▶ ]  [ Status ▾ ]  [ Clear ]  [ Share link … ]
```

**Clear filters**

- On course page, Clear still resets month to current and clears txn/status; it must not clear the fixed course scope.

### Wider Transaction ID / Description

**Glide (`student-payments-grid.tsx`)**

- Bump column widths from `180` / `200` to approximately **240** (Transaction ID) and **280** (Description).
- Column resize remains enabled.

**ResourceTable (`student-payments-resource-table.tsx`)**

- On editable `PaymentEditableFieldCell` inputs, replace shrink-to-nothing (`min-w-0`) with a real floor: about **`min-w-[12rem]`** for Transaction ID and **`min-w-[14rem]`** for Description (±1rem acceptable in implementation).
- Prefer horizontal table scroll on narrow viewports over mid-value clipping.

**Applies to** both finance and course student-payments surfaces (shared components).

**Lofi — before / after (original)**

```
Before:  [0100417] [Paymen…]
After:   [0100417        ] [Payment for June tuition…]
```

## Error handling & edge cases

- Missing `?date=` on course page → default current month (existing hook behavior).
- Transaction-lookup mode → no month selector; widths still apply if those columns render.
- Synthetic / non-editable rows → unchanged (plain text, not inputs).

## Testing

- Manual: open `/courses/[id]/student-payments` — month control visible; change month → rows update.
- Manual: original + Glide views — Transaction ID / Description no longer clip typical values.
- No new backend tests expected.

## Success criteria

1. Course student-payments filter bar includes a working year-month selector.
2. Changing month loads that month’s payments for the fixed course.
3. Transaction ID and Description are comfortably readable in both views without routine truncation.
4. Finance page month + course combobox behavior unchanged aside from shared width improvements.

## Implementation notes

- Touch only: `student-payments-report-shell.tsx`, `student-payments-grid.tsx`, `student-payments-resource-table.tsx`.
- Prefer mirroring the shell and grid filter guards so original and Glide stay in sync.
- `PaymentEditableFieldCell` should apply field-specific min-widths (`transaction_id` vs `description`), not one shared floor for both.
