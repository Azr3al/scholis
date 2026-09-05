# Multi-course payment month coverage

Date: 2026-07-29

## Problem

The multi-course payment upload page (`/finances/student-payments/enrollment-payment`)
never records which months a payment covers. It sends only `issued_at` and
`billing_start_date`, both set to the tenant's current date:

```ts
// schedjuice-reimagined-fe/src/app/(internal)/finances/student-payments/enrollment-payment/page.tsx
const ymd = getTenantTodayYmd(tenantTimezone);
const { startIso } = getTenantDayBoundariesIso(tenantTimezone, ymd);
const planFields: Record<string, string> = {
  issued_at: startIso,
  billing_start_date: startIso,
};
```

The backend decides which calendar month a payment belongs to with explicit
coverage rows first, falling back to the `issued_at` month:

```python
# schedjuice-reimagined-be/app_finance/payment_coverage.py
def month_visibility_q(year: int, month: int) -> Q:
    has_any = Exists(UserPaymentCoveredMonth.objects.filter(user_payment_id=OuterRef("pk")))
    covers = Exists(
        UserPaymentCoveredMonth.objects.filter(
            user_payment_id=OuterRef("pk"), year=year, month_index=month,
        )
    )
    return covers | (~has_any & Q(issued_at__year=year, issued_at__month=month))
```

So a multi-course payment recorded in July 2026 for courses running
Oct 2026 - Feb 2027 is invisible in every month of those courses. The student
appears as an unpaid synthetic row, the operator re-uploads, and the second
attempt is flagged `duplicated` because it reuses the transaction ID.

Observed case: student Nan Thiri, courses ACCA AA and ACCA FR
(2026 Oct - 2027 Mar), transaction `01004227000494038080`. Four payment rows
exist (two `pending_verification`, two `duplicated`) but the October 2026
ACCA FR table shows her with no payment and a remaining balance.

## Goals

1. Let the operator choose per-course month coverage when uploading a
   multi-course payment, at full parity with the single-course form
   (single month, multiple months, installment).
2. Default the choice to a month that is actually inside each course's
   schedule, so the failure mode above cannot recur silently.
3. Repair existing multi-course payments that have no coverage.

## Non-goals

- Changing how coverage works for single-course or split-screenshot uploads.
- Changing verification, duplicate detection, or receipt numbering.
- Reworking the student payments table itself.

## Existing support

The backend already accepts and applies per-course coverage. `_parse_course_specs`
in `app_finance/views.py` reads `course_{i}_covered_months`, and
`create_multi_course_payment_group` passes `coverage_by_course` down to
`_create_group_payment_row`, which calls `sync_user_payment_covered_months`.
The frontend builder already accepts the field:

```ts
// schedjuice-reimagined-fe/src/lib/finances/payment-group-utils.ts
export type MultiCoursePaymentCourseInput = {
  courseId: number;
  discountIds: number[] | null;
  clearDiscount: boolean;
  autoEnroll?: boolean;
  coveredMonths?: { year: number; month_index: number }[];
};
```

Only the UI is missing. Installment, by contrast, is genuinely group-level today
and needs backend work.

## Design

### 1. Extract a shared coverage component

The single-course upload page already implements the exact UI needed, inline
across roughly 250 lines of
`schedjuice-reimagined-fe/src/app/(internal)/finances/student-payments/upload/page.tsx`.
Extract it rather than duplicating it.

**`src/lib/finances/payment-coverage-plan.ts`** - pure, unit-testable helpers:

- `type CoveragePlanState = { mode: DefaultStudentPaymentPlan; monthDate: Date; selectedMonthKeys: Set<string>; installmentThroughKey: string; installmentPercent: string }`
- `defaultCoveragePlanForCourse(courseStart, courseEnd, preferredMonth)` - returns
  a `single_month` plan clamped into the course range: a preferred month before
  the course start yields the start month, after the end yields the end month,
  otherwise it passes through. Mirrors the backend's
  `resolve_suggested_payment_month`. This is the fix that prevents recurrence.
- `resolveCoveragePayload(plan, selectableMonths)` → `{ coveredMonths, issuedAnchor, periodCount, installmentThroughMonth }`
- `validateCoveragePlan(plan, selectableMonths)` - wraps the existing
  `validateUploadPlan` in `src/lib/finances/upload-part-validation.ts`.

**`src/components/finances/payment-upload/coverage-fields.tsx`** - a fully
controlled component rendering the mode radio group and the three bodies:
`YearMonthSelector` for single month, the checkbox grid with select/clear all
for multiple months, and the "Paid through" select plus percent presets for
installment. Takes `selectableMonths`, a `CoveragePlanState`, a disabled flag,
and an optional error message.

`upload/page.tsx` consumes both and drops the inline block. Behavior is
unchanged there; this is a pure extraction.

### 2. Multi-course page

`CourseMeta` gains `start_date` and `end_date`. No extra request is needed:
the page's existing courses search returns them because `CourseSerializer`
uses `fields = "__all__"`.

`CourseSelection` gains `startDate`, `endDate`, `coverage: CoveragePlanState`,
and `coverageTouched: boolean`.

A shared "Default billing month" `YearMonthSelector` sits at the top of the
Courses section, defaulting to the tenant's current month. Each newly selected
course seeds its coverage from it through `defaultCoveragePlanForCourse`,
clamped to that course's own schedule. Changing the default re-seeds only
courses whose coverage the operator has not touched.

When a course's default is clamped, the card shows an inline note naming the
adjustment, for example "Course starts October 2026 - adjusted from July 2026."
A course with no start/end dates falls back to the current month and shows the
same "no schedule dates set" message the single-course form uses.

Layout:

```
Courses                                        [Select courses v]
Default billing month:  [2026 v] [October v]
[x] Enroll student automatically

+- ACCA AA - 2026 Oct - 2027 Mar ------------------------- [x] -+
|  Ks 410,000 - Whole term          Discount: [None v]          |
|  Coverage  (o) Single month  ( ) Multiple months  ( ) Instal. |
|    Billing month  [2026 v] [October v]                        |
|    Course starts October 2026 - adjusted from July 2026.      |
|  Suggested amount: Ks 410,000                                 |
+---------------------------------------------------------------+

+- ACCA FR - 2026 Oct - 2027 Mar ------------------------- [x] -+
|  Coverage  ( ) Single month  (o) Multiple months  ( ) Instal. |
|    Months covered            [Select all] [Clear all]         |
|    [x] October 2026     [x] November 2026                     |
|    [ ] December 2026    [ ] January 2027   ...                |
|  Suggested amount: Ks 380,000  (2 months)                     |
+---------------------------------------------------------------+
```

The coverage controls live inside each course card, directly under the discount
picker, so everything about one course stays in one place.

Submit builds per-course fields through the existing
`buildMultiCoursePaymentFormData`: `course_{i}_covered_months` for single and
multiple month modes, and the new installment fields described below.
`validateCoveragePlan` runs per course and blocks submit, surfacing the message
on the offending card.

### 3. Amounts and allocation

`EnrollmentCourseCard` currently hardcodes `periodCount: 1` in both
`resolveTermFeeFromDiscounts` and `computeEnrollmentFeeBreakdown`. It becomes
the resolved covered-month count. Whole-term plans still collapse to a single
period inside those helpers, so a whole-term course's suggested amount is
unchanged. Because `autoAllocate` seeds from `invoicedAmount`, the allocation
matrix follows automatically.

Installment percent stays metadata and does not scale the suggested amount,
matching the single-course form. For installment mode the suggested amount is
the term fee across the months the installment unlocks. To compute that count,
and to show "already covered through November 2026" in the card, each course
card fetches that student's existing payments for that course, alongside the
per-course enrollment lookup the page already performs.

### 4. Backend: per-course installment

Installment fields are group-level today and copied verbatim onto every part:

```python
# schedjuice-reimagined-be/app_finance/payment_group.py
issued_at=plan_fields.get("issued_at"),
billing_start_date=plan_fields.get("billing_start_date"),
billing_end_date=plan_fields.get("billing_end_date"),
is_installment=plan_fields.get("is_installment", False),
installment_percent=plan_fields.get("installment_percent"),
```

Changes:

- `_parse_course_specs` accepts `course_{i}_is_installment`,
  `course_{i}_installment_percent`, and `course_{i}_installment_through_month`.
  When a course sends a through-month instead of explicit months, resolve
  coverage with `compute_incremental_installment_months(user_id=..., course_id=...)`,
  which already raises "Student is already covered through X" and "Target month
  must fall within the course schedule". Errors are keyed per course
  (`course_{i}_installment_through_month`) so the right card can show them.
- `_create_group_payment_row` gains an optional per-row plan override for
  `is_installment`, `installment_percent`, `billing_start_date`, and
  `billing_end_date`, falling back to `plan_fields` when absent. Per-course
  billing dates derive from the first and last covered month.
- After parts are created, `create_multi_course_payment_group` sets
  `group.issued_at` to the earliest part `issued_at` (the split-screenshot path
  in `views.py` already does this), sets `group.is_installment` only when every
  part is an installment, and sets `group.installment_percent` only when all
  parts agree on a value.

### 5. Backfill command

Existing multi-course payments recorded without coverage stay stranded in the
month they were uploaded. A management command repairs them.

Name: `backfill-multi-course-payment-coverage`
File: `schedjuice-reimagined-be/app_finance/management/commands/backfill-multi-course-payment-coverage.py`

Arguments, mirroring `reset-payment-receipt-numbering`:

- `--schema-name` (required; raise `CommandError` when omitted or when no
  organization matches, so the command can never fan out across every tenant by
  accident)
- `--dry-run` (preview only, no writes)

Behavior, per tenant schema:

1. Select `UserPayment` rows whose `group__group_kind` is `MULTI_COURSE` and
   which have no `UserPaymentCoveredMonth` rows. Payments that already have
   coverage are never touched, so hand-corrected data is safe.
2. For each such part, compute the full calendar month range of its course via
   `calendar_months_for_course` and write it with
   `sync_user_payment_covered_months`. That helper also moves the part's
   `issued_at` to the first covered month, so the payment becomes visible from
   the course start onward.
3. Skip parts whose course has no start or end date, and report them.
4. After processing a group, set `group.issued_at` to the earliest part
   `issued_at`, consistent with the create path.
5. Print a per-tenant summary: parts updated, groups touched, parts skipped for
   missing course dates. Under `--dry-run` print the same summary and write
   nothing.

Registration:

- Add `"backfill-multi-course-payment-coverage"` to `MS_TEAMS_COMMANDS` in
  `schedjuice-reimagined-be/app_tasks/views.py`.
- Add a matching entry to the `COMMANDS` array in
  `schedjuice-reimagined-fe/src/app/(platform-internal)/internal/management-commands/page.tsx`
  under the `Finance` category, with a required `schema_name` string param and a
  `dry_run` boolean param defaulting to `true`.

## Testing

Backend, run against the Docker test DB with `--keepdb` via
`./scripts/run_backend_tests.sh`:

- Multi-course upload with `course_{i}_covered_months` while the current date
  falls outside the course range: parts get coverage rows, `issued_at` moves to
  the first covered month, and the admin report for that course-month returns
  the row. This is the reported regression.
- Per-course installment targeting a month the student is already covered
  through returns 400 keyed to that course's field.
- Mixed plans in one payment (course A single month, course B installment):
  each part gets its own coverage and installment flags, and the group flags
  roll up correctly.
- Malformed `course_{i}_covered_months` JSON returns 400 keyed to that field.
- Backfill command with `--dry-run` writes nothing; without it, an uncovered
  multi-course part gains the full course month range and a part that already
  had coverage is left untouched.

Frontend (Vitest), targeting the pure helpers rather than the rendered form:

- `defaultCoveragePlanForCourse` clamps a preferred month before the course
  start, clamps one after the course end, and passes through an in-range month.
- `resolveCoveragePayload` returns the correct month count for each mode.
- Submit omits `course_{i}_covered_months` for a course with no schedule dates,
  and blocks when multiple-months mode has nothing selected.

## Risks

- Extracting the coverage UI touches a working single-course form. Mitigated by
  keeping the extraction behavior-preserving and relying on the existing
  `upload-part-validation` tests.
- The backfill assumes an uncovered multi-course payment was meant to cover the
  whole course. That matches how these payments are recorded in practice
  (one bank transfer settling several courses up front), and `--dry-run` plus
  the skip-if-covered rule keep it reversible in review.
