# Student Payments Out-of-Range Month — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the selected calendar month falls outside a course's start/end dates, hide payment rows and stat pills and show an empty state with a button to jump to the smart-default eligible month.

**Architecture:** Add overlap + suggested-month helpers in `payment_coverage.py`, short-circuit `admin-report` with `month_applicable` metadata, then wire FE hook + empty-state component into both Glide and ResourceTable report paths via shared summary strip.

**Tech Stack:** Django REST (`schedjuice-reimagined-be`), Next.js App Router + TanStack Query + Vitest (`schedjuice-reimagined-fe`).

**Spec:** `docs/superpowers/specs/2026-07-26-student-payments-out-of-range-month-design.md`

## Global Constraints

- Eligibility: calendar month overlap — `start_date ≤ last_day_of_month AND end_date ≥ first_day_of_month`.
- Missing course dates → month applicable (no behavior change).
- Stat pills hidden when `month_applicable === false`; course meta strip remains.
- Jump target: smart default (today's month if today in range, else course start or end month).
- Guard bypass when transaction-ID exact lookup **or** any `transaction_id__*`, `status__*`, `user_id__*` filter.
- Backend tests: `./scripts/run_backend_tests.sh <target>` with `--keepdb` (never dev DB).
- Frontend tests: `npm run test:unit -- <path>` from `schedjuice-reimagined-fe/`.
- High-value tests only — no happy-path-only smoke.

---

## File Structure

| Repo | File | Action | Responsibility |
| --- | --- | --- | --- |
| BE | `app_finance/payment_coverage.py` | Modify | `calendar_month_overlaps_course`, `resolve_suggested_payment_month`, `last_calendar_day` |
| BE | `app_finance/views.py` | Modify | Early exit + `_empty_admin_report_payload` in `UserPaymentAdminReportView` |
| BE | `app_finance/tests/test_payment_coverage_month_eligibility.py` | Create | Pure helper unit tests |
| BE | `app_finance/tests/test_admin_report_month_applicable.py` | Create | Admin-report integration tests |
| FE | `src/helpers/student-payments-month-eligibility.ts` | Create | FE overlap + suggested month helpers |
| FE | `src/helpers/student-payments-month-eligibility.test.ts` | Create | Helper unit tests |
| FE | `src/hooks/finances/use-student-payments-admin-report.ts` | Modify | Parse `month_applicable` / `suggested_month` |
| FE | `src/components/finances/student-payments-month-not-applicable.tsx` | Create | Empty state UI |
| FE | `src/components/finances/student-payments-month-not-applicable.test.tsx` | Create | Component behavior test |
| FE | `src/components/finances/payments-grid/payment-grid-summary-strip.tsx` | Modify | Hide stats when inapplicable |
| FE | `src/components/finances/payments-grid/payment-grid-summary-strip.test.tsx` | Create | Strip stats visibility test |
| FE | `src/components/finances/payments-grid/payment-grid-summary.ts` | Modify | Muted header line when inapplicable |
| FE | `src/components/finances/student-payments-report-shell.tsx` | Modify | Conditional table vs empty state |
| FE | `src/components/finances/student-payments-grid.tsx` | Modify | Same for Glide path |

---

## Task 1: Backend pure helpers

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/payment_coverage.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_payment_coverage_month_eligibility.py`

**Interfaces:**
- Produces:
  - `last_calendar_day(year: int, month: int) -> date`
  - `calendar_month_overlaps_course(course, year: int, month: int) -> bool`
  - `resolve_suggested_payment_month(course, *, today: date | None = None) -> MonthTuple | None`

- [ ] **Step 1: Write the failing tests**

Create `app_finance/tests/test_payment_coverage_month_eligibility.py`:

```python
import unittest
from datetime import date
from types import SimpleNamespace

from django.test import TestCase

from app_finance.payment_coverage import (
    calendar_month_overlaps_course,
    resolve_suggested_payment_month,
)


def _course(start: date | None, end: date | None):
    return SimpleNamespace(start_date=start, end_date=end)


class CalendarMonthOverlapsCourseTests(TestCase):
    def test_july_before_october_start_course(self):
        course = _course(date(2026, 10, 3), date(2027, 2, 28))
        self.assertFalse(calendar_month_overlaps_course(course, 2026, 7))

    def test_october_overlaps_october_start_course(self):
        course = _course(date(2026, 10, 3), date(2027, 2, 28))
        self.assertTrue(calendar_month_overlaps_course(course, 2026, 10))

    def test_missing_dates_treated_as_applicable(self):
        course = _course(None, date(2027, 2, 28))
        self.assertTrue(calendar_month_overlaps_course(course, 2026, 7))
        course = _course(date(2026, 10, 3), None)
        self.assertTrue(calendar_month_overlaps_course(course, 2026, 7))


class ResolveSuggestedPaymentMonthTests(TestCase):
    def test_before_course_returns_start_month(self):
        course = _course(date(2026, 10, 3), date(2027, 2, 28))
        self.assertEqual(
            resolve_suggested_payment_month(course, today=date(2026, 7, 15)),
            (2026, 10),
        )

    def test_after_course_returns_end_month(self):
        course = _course(date(2026, 1, 1), date(2026, 6, 30))
        self.assertEqual(
            resolve_suggested_payment_month(course, today=date(2027, 1, 5)),
            (2026, 6),
        )

    def test_today_in_range_returns_today_month_even_if_selected_would_be_before(self):
        course = _course(date(2026, 3, 1), date(2026, 12, 31))
        self.assertEqual(
            resolve_suggested_payment_month(course, today=date(2026, 6, 10)),
            (2026, 6),
        )

    def test_missing_dates_returns_none(self):
        self.assertIsNone(resolve_suggested_payment_month(_course(None, None)))


@unittest.skipUnless(True, "placeholder for db reachability if needed")
class Placeholder(TestCase):
    pass
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_coverage_month_eligibility
```

Expected: FAIL — `ImportError` for missing functions.

- [ ] **Step 3: Implement helpers**

Append to `app_finance/payment_coverage.py` (after imports, near other date helpers):

```python
from calendar import monthrange


def last_calendar_day(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def calendar_month_overlaps_course(course, year: int, month: int) -> bool:
    """True when calendar month overlaps course start/end (inclusive)."""
    if not course or not course.start_date or not course.end_date:
        return True
    first_day = date(year, month, 1)
    last_day = last_calendar_day(year, month)
    return course.start_date <= last_day and course.end_date >= first_day


def resolve_suggested_payment_month(
    course,
    *,
    today: date | None = None,
) -> MonthTuple | None:
    if not course or not course.start_date or not course.end_date:
        return None
    today = today or dj_timezone.localdate()
    start = course.start_date
    end = course.end_date
    if today < start:
        return (start.year, start.month)
    if today > end:
        return (end.year, end.month)
    return (today.year, today.month)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_coverage_month_eligibility
```

Expected: PASS (4–5 tests).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_finance/payment_coverage.py app_finance/tests/test_payment_coverage_month_eligibility.py
git commit -m "feat(finance): add course month overlap helpers for admin-report"
```

---

## Task 2: Backend admin-report guard

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/views.py` (`UserPaymentAdminReportView`)
- Create: `schedjuice-reimagined-be/app_finance/tests/test_admin_report_month_applicable.py`

**Interfaces:**
- Consumes: `calendar_month_overlaps_course`, `resolve_suggested_payment_month` from `app_finance.payment_coverage`
- Produces response fields on `POST /api/v1/user-payments/admin-report`:
  - `month_applicable: bool`
  - `suggested_month: { "year": int, "month": int } | omitted`

- [ ] **Step 1: Write the failing integration tests**

Create `app_finance/tests/test_admin_report_month_applicable.py` (mirror setup from `test_admin_report_scope.py`):

```python
import unittest
from datetime import date, datetime, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import UserPayment
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AdminReportMonthApplicableTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.finance = None
        self.student = None
        with schema_context(self.schema_name):
            seed_rbac()
            self.finance = User.objects.create_user(
                email=f"fin-mappl-{suffix}@example.com",
                password="x",
                name="Finance",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            self.student = User.objects.create_user(
                email=f"stu-mappl-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat mappl {suffix}")
            prog = Program.objects.create(
                name=f"P mappl {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Future course {suffix}",
                code=f"FC{suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 10, 3),
                end_date=date(2027, 2, 28),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _payload(self, *, year: int, month: int, extra_filters=None):
        month_start = timezone.make_aware(datetime(year, month, 1, 12, 0, 0))
        filters = [
            {
                "field_name": "course_id",
                "operator": "exact",
                "value": self.course.id,
            },
            {
                "field_name": "issued_at",
                "operator": "gte",
                "value": month_start.isoformat(),
            },
            {
                "field_name": "issued_at",
                "operator": "lte",
                "value": month_start.isoformat(),
            },
        ]
        if extra_filters:
            filters.extend(extra_filters)
        return {"filter_params": filters, "exclude_params": []}

    def test_month_before_course_returns_empty_with_metadata(self):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            self._payload(year=2026, month=7),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertEqual(body["data"]["data"], [])
        self.assertFalse(body["data"]["month_applicable"])
        self.assertEqual(body["data"]["suggested_month"], {"year": 2026, "month": 10})
        self.assertEqual(body["data"]["summary"]["active_student_row_count"], 0)

    def test_month_within_course_returns_applicable_true(self):
        month_start = timezone.make_aware(datetime(2026, 10, 1, 12, 0, 0))
        month_end = timezone.make_aware(datetime(2026, 10, 31, 12, 0, 0))
        with schema_context(self.schema_name):
            UserPayment.objects.create(
                user=self.student,
                course=self.course,
                created_by=self.finance,
                issued_at=month_start,
                billing_start_date=month_start,
                billing_end_date=month_end,
                status=UserPayment.Status.PENDING_VERIFICATION,
                transaction_id=f"txn-in-{uuid4().hex[:6]}",
            )
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            self._payload(year=2026, month=10),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertTrue(body["data"]["month_applicable"])
        self.assertGreaterEqual(len(body["data"]["data"]), 1)

    def test_transaction_id_filter_bypasses_month_guard(self):
        resp = self._client(self.finance).post(
            "/api/v1/user-payments/admin-report",
            self._payload(
                year=2026,
                month=7,
                extra_filters=[
                    {
                        "field_name": "transaction_id",
                        "operator": "exact",
                        "value": "does-not-exist",
                    }
                ],
            ),
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertNotIn("month_applicable", body["data"])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_admin_report_month_applicable
```

Expected: FAIL on `month_applicable` assertions (rows returned for July).

- [ ] **Step 3: Implement guard in `UserPaymentAdminReportView.post`**

Add import at top of `views.py`:

```python
from app_finance.payment_coverage import (
    apply_month_scope,
    calendar_month_overlaps_course,
    resolve_suggested_payment_month,
)
```

Add static helper on `UserPaymentAdminReportView`:

```python
@staticmethod
def _empty_admin_report_payload(*, suggested_month: tuple[int, int] | None) -> dict:
    payload = {
        "data": [],
        "summary": {
            "verified_total": "0",
            "unuploaded_count": 0,
            "uploaded_count": 0,
            "verified_count": 0,
            "row_count": 0,
            "removed_count": 0,
            "active_student_row_count": 0,
        },
        "month_applicable": False,
    }
    if suggested_month is not None:
        y, m = suggested_month
        payload["suggested_month"] = {"year": y, "month": m}
    return payload
```

Insert **after RBAC block** (after line ~868) and **before** `qs = scope_payments_for_user(...)`:

```python
filter_has_transaction_id = any(
    k.startswith("transaction_id__") for k in filter_params
)
filter_has_status = any(k.startswith("status__") for k in filter_params)
filter_has_user_id = any(k.startswith("user_id__") for k in filter_params)
should_check_month_applicable = (
    not txn_exact_lookup
    and course_id_exact is not None
    and year_month is not None
    and not filter_has_transaction_id
    and not filter_has_status
    and not filter_has_user_id
)
if should_check_month_applicable:
    from app_course.models import Course

    course = Course.objects.filter(id=int(course_id_exact)).only(
        "start_date", "end_date"
    ).first()
    y, m = year_month
    if course and not calendar_month_overlaps_course(course, y, m):
        suggested = resolve_suggested_payment_month(course)
        return self.send_response(
            False,
            "ok",
            self._empty_admin_report_payload(suggested_month=suggested),
        )
```

At successful end of `post`, add `"month_applicable": True` to payload dict (before `return self.send_response`):

```python
payload = {"data": user_payments, "summary": summary, "month_applicable": True}
```

Remove duplicate `filter_has_transaction_id` / `filter_has_status` / `filter_has_user_id` definitions later in the method if now defined earlier — reuse the same variables for `include_unpaid_users`.

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_admin_report_month_applicable
./scripts/run_backend_tests.sh app_finance.tests.test_admin_report_scope
```

Expected: PASS on both modules.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_finance/views.py app_finance/tests/test_admin_report_month_applicable.py
git commit -m "feat(finance): skip admin-report rows for out-of-range course months"
```

---

## Task 3: Frontend eligibility helpers

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/student-payments-month-eligibility.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/student-payments-month-eligibility.test.ts`

**Interfaces:**
- Produces:
  - `calendarMonthOverlapsCourse(startDate, endDate, year, month): boolean`
  - `resolveSuggestedPaymentMonth(startDate, endDate, today?: Date): { year, month } | null`
  - `formatMonthYearLabel(year, month): string`

- [ ] **Step 1: Write the failing tests**

Create `src/helpers/student-payments-month-eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  calendarMonthOverlapsCourse,
  formatMonthYearLabel,
  resolveSuggestedPaymentMonth,
} from "./student-payments-month-eligibility";

describe("calendarMonthOverlapsCourse", () => {
  it("returns false when selected month is before course start", () => {
    expect(
      calendarMonthOverlapsCourse("2026-10-03", "2027-02-28", 2026, 7),
    ).toBe(false);
  });

  it("returns true when selected month overlaps course", () => {
    expect(
      calendarMonthOverlapsCourse("2026-10-03", "2027-02-28", 2026, 10),
    ).toBe(true);
  });

  it("returns true when dates missing", () => {
    expect(calendarMonthOverlapsCourse(null, null, 2026, 7)).toBe(true);
  });
});

describe("resolveSuggestedPaymentMonth", () => {
  it("returns start month when today is before course", () => {
    expect(
      resolveSuggestedPaymentMonth(
        "2026-10-03",
        "2027-02-28",
        new Date(2026, 6, 15),
      ),
    ).toEqual({ year: 2026, month: 10 });
  });

  it("returns today month when today is within course", () => {
    expect(
      resolveSuggestedPaymentMonth(
        "2026-03-01",
        "2026-12-31",
        new Date(2026, 5, 10),
      ),
    ).toEqual({ year: 2026, month: 6 });
  });
});

describe("formatMonthYearLabel", () => {
  it("formats month label for button copy", () => {
    expect(formatMonthYearLabel(2026, 10)).toMatch(/October 2026/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/student-payments-month-eligibility.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

Create `src/helpers/student-payments-month-eligibility.ts`:

```ts
import { formatMonthLong } from "@/helpers/payment-coverage-months";

export type SuggestedMonth = { year: number; month: number };

function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

export function calendarMonthOverlapsCourse(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  year: number,
  month: number,
): boolean {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return true;
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = lastDayOfMonth(year, month);
  const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return startOnly <= lastDay && endOnly >= firstDay;
}

export function resolveSuggestedPaymentMonth(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  today = new Date(),
): SuggestedMonth | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return null;
  const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (todayOnly < startOnly) {
    return { year: startOnly.getFullYear(), month: startOnly.getMonth() + 1 };
  }
  if (todayOnly > endOnly) {
    return { year: endOnly.getFullYear(), month: endOnly.getMonth() + 1 };
  }
  return { year: todayOnly.getFullYear(), month: todayOnly.getMonth() + 1 };
}

export function formatMonthYearLabel(year: number, month: number): string {
  return formatMonthLong(year, month);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/student-payments-month-eligibility.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/student-payments-month-eligibility.ts src/helpers/student-payments-month-eligibility.test.ts
git commit -m "feat(finance): add student payments month eligibility helpers"
```

---

## Task 4: Hook — parse API metadata

**Files:**
- Modify: `schedjuice-reimagined-fe/src/hooks/finances/use-student-payments-admin-report.ts`

**Interfaces:**
- Consumes: API `month_applicable`, `suggested_month`
- Produces on `StudentPaymentsAdminReportModel`:
  - `monthApplicable: boolean`
  - `suggestedMonth: { year: number; month: number } | null`

- [ ] **Step 1: Extend types and queryFn return**

In `StudentPaymentsAdminReportModel` type, add:

```ts
monthApplicable: boolean;
suggestedMonth: { year: number; month: number } | null;
```

Add state:

```ts
const [monthApplicable, setMonthApplicable] = useState(true);
const [suggestedMonth, setSuggestedMonth] = useState<{
  year: number;
  month: number;
} | null>(null);
```

Update `queryFn` return:

```ts
return {
  rows: (res.data?.data ?? []) as StudentPaymentAdminReportRow[],
  summary: res.data?.summary as StudentPaymentsAdminReportSummary | undefined,
  monthApplicable: res.data?.month_applicable !== false,
  suggestedMonth:
    res.data?.suggested_month &&
    typeof res.data.suggested_month.year === "number" &&
    typeof res.data.suggested_month.month === "number"
      ? {
          year: res.data.suggested_month.year,
          month: res.data.suggested_month.month,
        }
      : null,
};
```

Update `useEffect` on `dataQuery.data`:

```ts
setMonthApplicable(dataQuery.data.monthApplicable);
setSuggestedMonth(dataQuery.data.suggestedMonth);
```

Return `monthApplicable` and `suggestedMonth` from hook.

- [ ] **Step 2: Verify TypeScript**

```bash
cd schedjuice-reimagined-fe
npm run typecheck
```

Expected: PASS (or no new errors in modified file).

- [ ] **Step 3: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/hooks/finances/use-student-payments-admin-report.ts
git commit -m "feat(finance): expose month applicability from admin-report"
```

---

## Task 5: Empty state component

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/finances/student-payments-month-not-applicable.tsx`
- Create: `schedjuice-reimagined-fe/src/components/finances/student-payments-month-not-applicable.test.tsx`

**Interfaces:**
- Consumes: `formatMonthYearLabel`, `resolveSuggestedPaymentMonth` (fallback if API omits suggested month)
- Props:
  - `selectedMonth: Date`
  - `courseStartDate?: string | null`
  - `courseEndDate?: string | null`
  - `suggestedMonth: { year: number; month: number } | null`
  - `onGoToMonth: (date: Date) => void`

- [ ] **Step 1: Write the failing test**

Create `student-payments-month-not-applicable.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentPaymentsMonthNotApplicable } from "./student-payments-month-not-applicable";

describe("StudentPaymentsMonthNotApplicable", () => {
  it("calls onGoToMonth with suggested month when button clicked", async () => {
    const user = userEvent.setup();
    const onGoToMonth = vi.fn();
    render(
      <StudentPaymentsMonthNotApplicable
        selectedMonth={new Date(2026, 6, 1)}
        courseStartDate="2026-10-03"
        courseEndDate="2027-02-28"
        suggestedMonth={{ year: 2026, month: 10 }}
        onGoToMonth={onGoToMonth}
      />,
    );
    await user.click(screen.getByRole("button", { name: /go to october 2026/i }));
    expect(onGoToMonth).toHaveBeenCalledWith(new Date(2026, 9, 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/finances/student-payments-month-not-applicable.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement component**

Create `student-payments-month-not-applicable.tsx`:

```tsx
"use client";

import { Button } from "@/components/primitives";
import { CourseRange } from "@/components/course/course-range";
import {
  formatMonthYearLabel,
  resolveSuggestedPaymentMonth,
} from "@/helpers/student-payments-month-eligibility";

type StudentPaymentsMonthNotApplicableProps = {
  selectedMonth: Date;
  courseStartDate?: string | null;
  courseEndDate?: string | null;
  suggestedMonth: { year: number; month: number } | null;
  onGoToMonth: (date: Date) => void;
};

export function StudentPaymentsMonthNotApplicable({
  selectedMonth,
  courseStartDate,
  courseEndDate,
  suggestedMonth,
  onGoToMonth,
}: StudentPaymentsMonthNotApplicableProps) {
  const target =
    suggestedMonth ??
    resolveSuggestedPaymentMonth(courseStartDate, courseEndDate);
  const selectedLabel = formatMonthYearLabel(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
  );

  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 border-b border-border-subtle py-12 text-center">
      <p className="text-sm font-medium text-foreground">Not applicable this month</p>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">
        {selectedLabel} is outside this course&apos;s schedule
        {courseStartDate || courseEndDate ? (
          <>
            {" "}
            (
            <CourseRange
              startDate={courseStartDate}
              endDate={courseEndDate}
              className="inline text-muted-foreground"
            />
            ).
          </>
        ) : (
          "."
        )}
      </p>
      {target ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onGoToMonth(new Date(target.year, target.month - 1, 1))}
        >
          Go to {formatMonthYearLabel(target.year, target.month)}
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/finances/student-payments-month-not-applicable.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/finances/student-payments-month-not-applicable.tsx src/components/finances/student-payments-month-not-applicable.test.tsx
git commit -m "feat(finance): add out-of-range month empty state for student payments"
```

---

## Task 6: Summary strip — hide stat pills

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finances/payments-grid/payment-grid-summary-strip.tsx`
- Create: `schedjuice-reimagined-fe/src/components/finances/payments-grid/payment-grid-summary-strip.test.tsx`

**Interfaces:**
- Consumes: `monthApplicable?: boolean` prop (default `true`)

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentGridSummaryStrip } from "./payment-grid-summary-strip";

describe("PaymentGridSummaryStrip monthApplicable", () => {
  it("hides stat pills when month is not applicable", () => {
    render(
      <PaymentGridSummaryStrip
        rows={[]}
        currencySymbol="Ks"
        fixedCourseId="1"
        courseMeta={{
          id: 1,
          title: "ACCA AA",
          start_date: "2026-10-03",
          end_date: "2027-02-28",
        }}
        monthAnchor={new Date(2026, 6, 1)}
        monthApplicable={false}
      />,
    );
    expect(screen.queryByText("Total")).toBeNull();
    expect(screen.getByText("ACCA AA")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/finances/payments-grid/payment-grid-summary-strip.test.tsx
```

Expected: FAIL — still shows "Total".

- [ ] **Step 3: Implement**

Add to props type:

```ts
monthApplicable?: boolean;
```

Default `monthApplicable = true` in destructuring.

In course-context branch, replace:

```tsx
<StatsRow stats={stats} fixedCourseId={fixedCourseId} />
```

with:

```tsx
{monthApplicable ? (
  <StatsRow stats={stats} fixedCourseId={fixedCourseId} />
) : null}
```

When `!monthApplicable`, use single-column layout (drop `lg:grid-cols-[minmax(0,1fr)_auto]` — use `className` override or conditional grid class).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/finances/payments-grid/payment-grid-summary-strip.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/finances/payments-grid/payment-grid-summary-strip.tsx src/components/finances/payments-grid/payment-grid-summary-strip.test.tsx
git commit -m "feat(finance): hide payment stat pills for inapplicable months"
```

---

## Task 7: Wire shell + grid + header summary line

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-report-shell.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-grid.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/finances/payments-grid/payment-grid-summary.ts`

**Interfaces:**
- Consumes: `report.monthApplicable`, `report.suggestedMonth`, `report.setDate`

- [ ] **Step 1: Update `buildPaymentSummaryLine`**

Add optional 5th param `monthApplicable = true`. When false, return muted string:

```ts
if (!monthApplicable) {
  return "Month not applicable for this course";
}
```

- [ ] **Step 2: Wire ResourceTable path (`student-payments-report-shell.tsx`)**

Pass `monthApplicable={report.monthApplicable}` to `PaymentGridSummaryStrip`.

Replace table main content:

```tsx
report.monthApplicable ? (
  <StudentPaymentsResourceTable ... />
) : (
  <StudentPaymentsMonthNotApplicable
    selectedMonth={report.monthDate}
    courseStartDate={
      report.selectedCourseEntity?.start_date ?? courseMeta?.start_date
    }
    courseEndDate={
      report.selectedCourseEntity?.end_date ?? courseMeta?.end_date
    }
    suggestedMonth={report.suggestedMonth}
    onGoToMonth={report.setDate}
  />
)
```

Update `buildPaymentSummaryLine` calls to pass `report.monthApplicable`.

- [ ] **Step 3: Wire Glide path (`student-payments-grid.tsx`)**

Same pattern:
- Pass `monthApplicable` to strip
- When `!report.monthApplicable`, render `StudentPaymentsMonthNotApplicable` instead of grid body (not search/table chrome)
- Update header `summaryLine` with `monthApplicable`

- [ ] **Step 4: Manual smoke check**

1. Open `/finances/student-payments`, select a future-start course, pick a month before start.
2. Confirm: course meta visible, no stat pills, empty state + button.
3. Click button → month jumps to suggested month, rows appear.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/finances/student-payments-report-shell.tsx src/components/finances/student-payments-grid.tsx src/components/finances/payments-grid/payment-grid-summary.ts
git commit -m "feat(finance): wire out-of-range month empty state into student payments report"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run backend finance tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_coverage_month_eligibility app_finance.tests.test_admin_report_month_applicable app_finance.tests.test_admin_report_scope
```

Expected: all PASS.

- [ ] **Step 2: Run frontend unit tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/student-payments-month-eligibility.test.ts src/components/finances/student-payments-month-not-applicable.test.tsx src/components/finances/payments-grid/payment-grid-summary-strip.test.tsx
```

Expected: all PASS.

- [ ] **Step 3: Typecheck frontend**

```bash
cd schedjuice-reimagined-fe
npm run typecheck
```

Expected: PASS.

---

## Plan self-review

| Spec requirement | Task |
| --- | --- |
| Backend overlap guard | Task 1–2 |
| `month_applicable` + `suggested_month` fields | Task 2 |
| Bypass txn/status/user filters | Task 2 |
| Hide stat pills | Task 6 |
| Empty state + button | Task 5, 7 |
| Both Glide + ResourceTable | Task 7 |
| Smart-default month | Task 1, 3 |
| Missing dates → applicable | Task 1, 3 |
| High-value tests | All test steps |

No placeholders remain. Type names consistent across tasks.
