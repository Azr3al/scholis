# Student Payments — Out-of-Range Month Empty State — Design Spec

**Date:** 2026-07-26  
**Status:** Approved for planning  
**Surface:** Student payments report (`/finances/student-payments`, `/courses/[id]/student-payments`) — Glide grid **and** ResourceTable  
**Related:** `calendar_months_for_course` (`payment_coverage.py`), `resolveDefaultMonth` (`attendance-dashboard.ts`), `course_ids_overlapping_range` (`unpaid_helpers.py`)

## Summary

When the selected calendar month falls **outside** a course's `start_date`–`end_date` range, the student payments report must not show payment rows or summary stat pills. Instead, show an empty state explaining the month is not applicable, with a button to jump to the smart-default eligible month (current month if today is in range, otherwise course start or end month).

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Stat pills | **Hidden** when month is out of range; course title/meta strip remains |
| Jump target | **Smart default** — same semantics as attendance `resolveDefaultMonth` |
| Enforcement | **Backend + frontend** — API returns empty data + metadata; UI renders empty state |
| Approach | **A** — backend guard + response metadata (not frontend-only, not month-picker restriction alone) |
| Eligibility rule | Calendar month overlap: `start_date ≤ last_day_of_month AND end_date ≥ first_day_of_month` |
| Missing course dates | Treat month as applicable (preserve current behavior) |

## Goals / non-goals

**Goals**

- Stop showing misleading synthetic unpaid rows for months before a course starts or after it ends (e.g. July 2026 for an Oct 2026–Feb 2027 course).
- Give finance staff a clear explanation and one-click navigation to a useful month.
- Keep course context visible (title, date range, month type, Teams indicator) so the page still orients the user.

**Non-goals**

- Restricting which months appear in `YearMonthSelector` (future polish; deep links may still land on out-of-range months).
- Changing payment coverage / installment logic (already enforces course months elsewhere).
- Affecting global transaction-ID exact lookup or filtered searches (see bypass rules below).

## When the guard applies

Apply the out-of-range check in `UserPaymentAdminReportView.post` when **all** of:

- `course_id__exact` is present
- Month filter is present (`issued_at__gte` or `billing_start_date__gte`)
- Not global transaction-ID exact lookup
- No `transaction_id__*` filter
- No `status__*` filter
- No `user_id__*` filter

**Bypass** (keep current behavior): transaction lookup, status/txn/user filters — user is intentionally searching, not browsing a month.

## Backend design

### Helpers (`app_finance/payment_coverage.py`)

```python
def calendar_month_overlaps_course(
    course,
    year: int,
    month: int,
) -> bool:
    """True when the calendar month overlaps course start/end dates."""

def resolve_suggested_payment_month(
    course,
    *,
    today: date | None = None,
) -> tuple[int, int] | None:
    """Smart-default month for navigation (year, month). None if no course dates."""
```

**Overlap logic** mirrors `course_ids_overlapping_range`:

- `first_day = date(year, month, 1)`
- `last_day = last calendar day of (year, month)`
- Overlap when `course.start_date <= last_day and course.end_date >= first_day`
- If `start_date` or `end_date` is missing → return `True` (applicable)

**Suggested month logic** mirrors FE `resolveDefaultMonth`:

- If `today < start_date` → `(start_date.year, start_date.month)`
- Elif `today > end_date` → `(end_date.year, end_date.month)`
- Else → `(today.year, today.month)`

### Admin-report early exit

After RBAC/scoping and before payment query + synthetic unpaid append:

1. Load course by `course_id_exact` (single query, already needed for context).
2. If not `calendar_month_overlaps_course(course, y, m)`:
   - Return `data: []`
   - Return zeroed `summary` (same keys as `_admin_report_summary` would produce for empty rows, with `active_student_row_count: 0`)
   - Return `month_applicable: false`
   - Return `suggested_month: { "year": Y, "month": M }` when course dates exist; omit or `null` when dates missing

When applicable, include `month_applicable: true` (explicit) for consistent FE parsing. Omit `suggested_month`.

### Response shape (additive)

```json
{
  "data": [],
  "summary": { "verified_total": "0", "unuploaded_count": 0, "...": 0 },
  "month_applicable": false,
  "suggested_month": { "year": 2026, "month": 10 }
}
```

Backward-compatible: existing clients ignore new fields.

## Frontend design

### Data hook (`use-student-payments-admin-report.ts`)

- Parse `month_applicable` (default `true` when absent for backward compat during rollout).
- Parse `suggested_month` when present.
- Expose on report model:
  - `monthApplicable: boolean`
  - `suggestedMonth: { year: number; month: number } | null`
- Optionally mirror overlap check client-side from `selectedCourseEntity` dates for instant UI when switching course before refetch completes (must defer to API flag once loaded).

### Shared empty state component

New: `StudentPaymentsMonthNotApplicable` (under `components/finances/`)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              Not applicable this month                  │
│                                                         │
│   July 2026 is outside this course's schedule           │
│   (Oct 3, 2026 – Feb 28, 2027).                        │
│                                                         │
│              [ Go to October 2026 ]                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Use existing `EmptyCopy` / centered layout pattern from `attendance-marking-table-states.tsx`.
- Button label: `Go to {Month YYYY}` from `suggested_month` (e.g. "Go to October 2026").
- Button action: `setDate(new Date(year, month - 1, 1))` via existing URL month state (`nuqs`).
- Description includes selected month + course range from `CourseRange` formatting.

### Summary strip (`payment-grid-summary-strip.tsx`)

When `monthApplicable === false` and `courseContext` is present:

- Render **course meta only** (`CourseMetaInline` + Teams line) — **no** `StatsRow`
- Layout: single column (no stats column on the right)

Prop: add `monthApplicable?: boolean` (default `true`).

### Table area

Both render paths check `monthApplicable`:

| View | File | Change |
|------|------|--------|
| ResourceTable | `student-payments-report-shell.tsx` | Replace `StudentPaymentsResourceTable` with `StudentPaymentsMonthNotApplicable` when inapplicable |
| Glide grid | `student-payments-grid.tsx` | Same — replace grid body with empty state |

Do **not** render search bar / table chrome when inapplicable (empty state replaces the whole table region).

Header summary line (`buildPaymentSummaryLine`) should show nothing or a muted "Month not applicable" when inapplicable — avoid "1 student · Ks 0" from stale local state.

### Surfaces

- `/finances/student-payments` (course combobox)
- `/courses/[id]/student-payments` (fixed course via `courseMeta`)

Both use shared shell/grid — one implementation covers both.

## Architecture

```
YearMonthSelector + course picker
        │
        ▼
useStudentPaymentsAdminReport
        │
        POST user-payments/admin-report
        │
        ├─ month_applicable: true  → rows + stats (current)
        │
        └─ month_applicable: false → data: []
                │
                ├─ PaymentGridSummaryStrip (meta only, no stats)
                └─ StudentPaymentsMonthNotApplicable
                      └─ setDate(suggested_month)
```

## Testing

### Backend (`schedjuice-reimagined-be`)

High-value cases only:

| Test | Assert |
|------|--------|
| Month before course start | `data: []`, `month_applicable: false`, `suggested_month` = start month when today also before start |
| Month after course end | Same with end month when today after end |
| Month within range | Normal rows returned, `month_applicable: true` |
| Today within course, selected month out of range | `suggested_month` = today's month |
| Transaction-ID filter active | Guard bypassed — existing search behavior |
| Missing course dates | Guard skipped — existing behavior |

Use `./scripts/run_backend_tests.sh app_finance.tests.test_admin_report_scope` (or new dedicated test module).

### Frontend (`schedjuice-reimagined-fe`)

| Test | Assert |
|------|--------|
| `calendarMonthOverlapsCourse` helper | Overlap boundary cases (July vs Oct start, etc.) |
| `resolveSuggestedPaymentMonth` (FE mirror or imported) | Matches attendance `resolveDefaultMonth` cases |
| `PaymentGridSummaryStrip` | Hides stat pills when `monthApplicable={false}` |
| `StudentPaymentsMonthNotApplicable` | Renders copy + button calls `setDate` with suggested month |

## Files to touch

| Repo | File | Change |
|------|------|--------|
| BE | `app_finance/payment_coverage.py` | `calendar_month_overlaps_course`, `resolve_suggested_payment_month` |
| BE | `app_finance/views.py` | Early exit in `UserPaymentAdminReportView.post` |
| BE | `app_finance/tests/test_admin_report_month_applicable.py` | New tests |
| FE | `src/helpers/student-payments-month-eligibility.ts` | FE helpers + unit tests |
| FE | `src/hooks/finances/use-student-payments-admin-report.ts` | Parse + expose new fields |
| FE | `src/components/finances/student-payments-month-not-applicable.tsx` | Empty state |
| FE | `src/components/finances/payments-grid/payment-grid-summary-strip.tsx` | Hide stats |
| FE | `src/components/finances/student-payments-report-shell.tsx` | Conditional table |
| FE | `src/components/finances/student-payments-grid.tsx` | Conditional grid body |

## Rollout / compatibility

- New API fields are optional; no migration required.
- Deploy backend first so FE never receives synthetic rows for inapplicable months once both are live.
- If backend lags, FE client-side overlap check can hide rows defensively (optional v1.1).
