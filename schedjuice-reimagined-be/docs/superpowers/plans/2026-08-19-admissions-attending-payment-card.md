# Admissions attending payment card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admissions attending cards show the latest payment of any status (status, uploader, notes, explicit covered months), and the People Name cell shows legal name plus alt name.

**Architecture:** Amend `GET /api/v1/admissions/people/:id/attending` in place: `last_verified_payment` becomes `latest_payment` (newest part for that user+course, any status). Frontend types, the attending card, and the People Name cell consume that payload. No Finance API widening.

**Tech Stack:** Django 4.2 + DRF, Next.js App Router, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-19-admissions-attending-payment-card-design.md`

## Global Constraints

- `admissions.view` remains the only gate. Do not widen Finance or `/users` / `/courses` search.
- Latest payment is the `UserPayment` **part** for that user+course, `order_by("-id")`, any status.
- Period: explicit `covered_months` only. Do not pass billing dates or `issued_at` into `formatPaymentReceiptBillingPeriod`.
- Drop `verified_at` / `verified_by`. Never render **Automatic**.
- Status is the raw `UserPayment.status` string. Ink text, no chip.
- Notes = `remarks`; omit the row when blank after trim.
- Copy: English, admin voice, no exclamation marks, no `text-transform: uppercase`.
- BE tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- FE tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`
- Always `vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn(), post: vi.fn() } }))` before importing modules that pull nav / finance-record-nav / permissions.
- High-value tests only. No “renders People” smoke.
- Never touch the Railway/dev database.
- Two git repos: commit BE files in `schedjuice-reimagined-be`, FE files in `schedjuice-reimagined-fe`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `schedjuice-reimagined-be/app_admissions/services.py` | Modify | `latest_payment` query + serialize (`payment_date`, `status`, `created_by`, `remarks`, `covered_months`) |
| `schedjuice-reimagined-be/app_admissions/tests/test_attending.py` | Modify | Replace verified-only cases; add latest-any-status + null + field shape |
| `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-attending.ts` | Modify | `AdmissionsLatestPayment` / `latest_payment` |
| `schedjuice-reimagined-fe/src/components/admissions/people/person-attending-panel.tsx` | Modify | Card fields: Date, Notes, Status, Uploaded by; **No payment** |
| `schedjuice-reimagined-fe/src/components/admissions/people/person-attending-panel.test.tsx` | Create | Card behavior |
| `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.tsx` | Modify | Two-line Name cell |
| `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.test.tsx` | Modify | Name + alt name |

**Do not modify:** Finance views/serializers, People search API, person panel header, `formatPaymentReceiptBillingPeriod` itself.

---

### Task 1: Attending API — `latest_payment`

**Files:**
- Modify: `schedjuice-reimagined-be/app_admissions/tests/test_attending.py`
- Modify: `schedjuice-reimagined-be/app_admissions/services.py`
- Test: `app_admissions.tests.test_attending`

**Interfaces:**
- Consumes: `UserPayment` (any status), `covered_months`, `created_by`, `remarks`, `payment_date`, `receipt`
- Produces: each class dict key `latest_payment: null | { payment_date, amount, receipt_number, covered_months, status, created_by, remarks, screenshot }` — no `verified_at` / `verified_by`

- [ ] **Step 1: Replace verified-only tests**

In `test_attending.py`, add `UserPaymentCoveredMonth` to the finance import:

```python
from app_finance.models import UserPayment, UserPaymentCoveredMonth
```

Delete `test_unverified_ignored_latest_verified_wins` and `test_verified_by_null_serializes_null`. Add:

```python
    def test_latest_payment_null_when_none(self):
        with schema_context(self.schema_name):
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.planned.id
            )
        self.assertIsNone(row["latest_payment"])

    def test_latest_verified_in_setup_serializes_shape(self):
        with schema_context(self.schema_name):
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.active.id
            )
        pay = row["latest_payment"]
        self.assertEqual(pay["status"], UserPayment.Status.VERIFIED)
        self.assertIsNone(pay["created_by"])
        self.assertIsNone(pay["remarks"])
        self.assertEqual(pay["covered_months"], [])
        self.assertEqual(pay["receipt_number"], self.newer_receipt_number)
        self.assertNotEqual(pay["receipt_number"], self.newer_payment_id)
        self.assertIn("payment_date", pay)
        self.assertNotIn("verified_by", pay)
        self.assertNotIn("verified_at", pay)

    def test_latest_any_status_wins_by_id(self):
        with schema_context(self.schema_name):
            pending = UserPayment.objects.create(
                user=self.student,
                course=self.active,
                transaction_id=f"later-pend-{self.suffix}",
                parsed_amount=Money(75, "USD"),
                actual_amount=Money(75, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
                created_by=self.officer,
                remarks="Paid in two transfers",
            )
            UserPaymentCoveredMonth.objects.create(
                user_payment=pending,
                year=2026,
                month_index=7,
            )
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.active.id
            )
        pay = row["latest_payment"]
        self.assertEqual(pay["status"], UserPayment.Status.PENDING_VERIFICATION)
        self.assertEqual(
            pay["created_by"],
            {"id": self.officer.id, "name": self.officer.name},
        )
        self.assertEqual(pay["remarks"], "Paid in two transfers")
        self.assertEqual(
            pay["covered_months"],
            [{"year": 2026, "month_index": 7}],
        )
        self.assertNotIn("verified_by", pay)
        self.assertNotIn("verified_at", pay)
```

Leave `test_planned_included_ended_excluded`, `test_admissions_only_ok`, `test_teacher_forbidden`, and `test_unknown_person_404` unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_admissions.tests.test_attending
```

Expected: FAIL — `latest_payment` KeyError (payload still has `last_verified_payment`).

- [ ] **Step 3: Implement `latest_payment`**

In `app_admissions/services.py`, replace `_verified_at_field` / `_verified_by_json` / `serialize_last_verified_payment` / `last_verified_payment` with:

```python
_payment_date_field = DateTimeField()


def _created_by_json(payment: UserPayment) -> dict | None:
    staff = payment.created_by
    if staff is None:
        return None
    return {"id": staff.id, "name": staff.name}


def serialize_latest_payment(payment: UserPayment) -> dict:
    remarks = (payment.remarks or "").strip() or None
    return {
        "payment_date": _payment_date_field.to_representation(payment.payment_date),
        "amount": _amount_json(payment),
        "receipt_number": payment.receipt.number if payment.receipt_id else None,
        "covered_months": [
            {"year": cm.year, "month_index": cm.month_index}
            for cm in payment.covered_months.all()
        ],
        "status": payment.status,
        "created_by": _created_by_json(payment),
        "remarks": remarks,
        "screenshot": payment_screenshot_url(payment),
    }


def latest_payment(user_id: int, course_id: int) -> dict | None:
    payment = (
        UserPayment.objects.filter(
            user_id=user_id,
            course_id=course_id,
        )
        .select_related("receipt", "created_by", "group")
        .prefetch_related("covered_months", "group__parts")
        .order_by("-id")
        .first()
    )
    if payment is None:
        return None
    return serialize_latest_payment(payment)
```

In `attending_classes_for_user`, set `"latest_payment": latest_payment(user.id, uc.course_id)`.

Keep `_file_url`, `payment_screenshot_url`, `_amount_json`, and `ATTENDING_STATUSES` as they are. Remove unused `_verified_at_field` if nothing else references it.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_admissions.tests.test_attending
```

Expected: PASS (all tests in the module).

- [ ] **Step 5: Commit (BE repo)**

```bash
cd schedjuice-reimagined-be
git add app_admissions/services.py app_admissions/tests/test_attending.py
git commit -m "feat(admissions): return latest payment of any status on attending"
```

---

### Task 2: Attending card — status, uploader, notes, period

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/admissions/people/person-attending-panel.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-attending.ts`
- Modify: `schedjuice-reimagined-fe/src/components/admissions/people/person-attending-panel.tsx`

**Interfaces:**
- Consumes: Task 1 `latest_payment` shape
- Produces: `AdmissionsLatestPayment`; panel reads `row.latest_payment`

- [ ] **Step 1: Write failing panel tests**

Create `person-attending-panel.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  axiosClient: { get: vi.fn(), post: vi.fn() },
}));

const useAdmissionsAttending = vi.fn();

vi.mock("@/hooks/admissions/use-admissions-attending", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/hooks/admissions/use-admissions-attending")
    >();
  return {
    ...actual,
    useAdmissionsAttending: (...args: unknown[]) =>
      useAdmissionsAttending(...args),
  };
});

import { PersonAttendingPanel } from "./person-attending-panel";
import type { AdmissionsLatestPayment } from "@/hooks/admissions/use-admissions-attending";

afterEach(() => {
  cleanup();
  useAdmissionsAttending.mockReset();
});

function pay(
  overrides: Partial<AdmissionsLatestPayment> = {},
): AdmissionsLatestPayment {
  return {
    payment_date: "2026-07-07T00:00:00.000Z",
    amount: "150000.0000",
    receipt_number: null,
    covered_months: [],
    status: "pending_verification",
    created_by: { id: 2, name: "Aye Aye" },
    remarks: null,
    screenshot: null,
    ...overrides,
  };
}

function renderWithClasses(
  classes: Array<{
    course_id: number;
    title: string;
    latest_payment: AdmissionsLatestPayment | null;
  }>,
) {
  useAdmissionsAttending.mockReturnValue({
    data: {
      id: 11,
      name: "Aung",
      email: "a@x",
      phone_number: "09",
      is_active: true,
      classes,
    },
    isLoading: false,
    isError: false,
    error: null,
  });
  return render(
    <PersonAttendingPanel personId={11} onNotFound={() => undefined} />,
  );
}

describe("PersonAttendingPanel payment card", () => {
  it("shows status and uploaded by instead of Automatic", () => {
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay(),
      },
    ]);
    expect(screen.queryByText("Automatic")).toBeNull();
    expect(screen.queryByText("Verified by")).toBeNull();
    expect(screen.getByText("Status").nextElementSibling?.textContent).toBe(
      "pending_verification",
    );
    expect(
      screen.getByText("Uploaded by").nextElementSibling?.textContent,
    ).toBe("Aye Aye");
  });

  it("omits Notes when remarks are empty and shows them when set", () => {
    const { unmount } = renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay({ remarks: null }),
      },
    ]);
    expect(screen.queryByText("Notes")).toBeNull();
    unmount();
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay({ remarks: "Paid in two transfers" }),
      },
    ]);
    expect(screen.getByText("Notes").nextElementSibling?.textContent).toBe(
      "Paid in two transfers",
    );
  });

  it("shows em dash for Uploaded by when created_by is null", () => {
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay({ created_by: null }),
      },
    ]);
    expect(
      screen.getByText("Uploaded by").nextElementSibling?.textContent,
    ).toBe("—");
    expect(screen.queryByText("Automatic")).toBeNull();
  });

  it("shows em dash for Period when covered_months is empty", () => {
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: pay({ covered_months: [] }),
      },
    ]);
    expect(screen.getByText("Period").nextElementSibling?.textContent).toBe(
      "—",
    );
  });

  it("says No payment when latest_payment is null", () => {
    renderWithClasses([
      {
        course_id: 1,
        title: "FCE Reading and Writing",
        latest_payment: null,
      },
    ]);
    expect(screen.getByText("No payment")).toBeTruthy();
    expect(screen.queryByText("No verified payment")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/admissions/people/person-attending-panel.test.tsx
```

Expected: FAIL — `AdmissionsLatestPayment` is not exported and/or the card still shows **Verified by** / **Automatic** / **No verified payment**.

- [ ] **Step 3: Update the hook types**

Replace the payment types in `use-admissions-attending.ts`:

```ts
export type AdmissionsLatestPayment = {
  payment_date: string | null;
  amount: string | number | null;
  receipt_number: number | string | null;
  covered_months?: { year: number; month_index: number }[];
  status: string;
  created_by: { id: number; name: string } | null;
  remarks: string | null;
  screenshot: string | null;
};

export type AdmissionsAttendingClass = {
  course_id: number;
  title: string;
  latest_payment: AdmissionsLatestPayment | null;
};
```

Delete `AdmissionsVerifiedPayment`. Leave `useAdmissionsAttending` and `isAttendingNotFound` unchanged.

- [ ] **Step 4: Update the attending panel**

In `person-attending-panel.tsx`, import `AdmissionsLatestPayment` instead of `AdmissionsVerifiedPayment`. Rewrite `PaymentBlock` and the class list:

```tsx
function PaymentBlock({ pay }: { pay: AdmissionsLatestPayment }) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const uploader = pay.created_by?.name?.trim() || "—";
  const period = formatPaymentReceiptBillingPeriod({
    covered_months: pay.covered_months,
  });
  const notes = pay.remarks?.trim() || "";

  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-text-muted">Date</dt>
      <dd className="tabular-nums">
        {pay.payment_date ? formatDate(pay.payment_date) : "—"}
      </dd>
      <dt className="text-text-muted">Amount</dt>
      <dd className="tabular-nums">{paymentAmount(pay)}</dd>
      <dt className="text-text-muted">Receipt</dt>
      <dd className="tabular-nums">{pay.receipt_number ?? "—"}</dd>
      <dt className="text-text-muted">Period</dt>
      <dd>{period}</dd>
      {notes ? (
        <>
          <dt className="text-text-muted">Notes</dt>
          <dd>{notes}</dd>
        </>
      ) : null}
      <dt className="text-text-muted">Status</dt>
      <dd>{pay.status}</dd>
      <dt className="text-text-muted">Uploaded by</dt>
      <dd>{uploader}</dd>
      <dt className="text-text-muted">Screenshot</dt>
      <dd>
        {pay.screenshot ? (
          <button
            type="button"
            className="text-left text-text-primary underline-offset-2 hover:underline"
            onClick={() => setViewUrl(pay.screenshot)}
          >
            View screenshot
          </button>
        ) : (
          "—"
        )}
      </dd>
      <FullScreenImageViewer
        imageUrl={viewUrl}
        title="Payment screenshot"
        onClose={() => setViewUrl(null)}
      />
    </dl>
  );
}
```

In the class list, use `row.latest_payment` and copy **No payment**:

```tsx
          {row.latest_payment ? (
            <PaymentBlock pay={row.latest_payment} />
          ) : (
            <p className="mt-1 text-sm text-text-muted">No payment</p>
          )}
```

Keep `paymentAmount` taking the same amount field. Do not pass `billing_start_date`, `billing_end_date`, or `issued_at` into the period formatter.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/admissions/people/person-attending-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit (FE repo)**

```bash
cd schedjuice-reimagined-fe
git add src/hooks/admissions/use-admissions-attending.ts \
  src/components/admissions/people/person-attending-panel.tsx \
  src/components/admissions/people/person-attending-panel.test.tsx
git commit -m "feat(admissions): show payment status, uploader, and notes"
```

---

### Task 3: People Name cell — legal + alt

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.tsx`

**Interfaces:**
- Consumes: existing search row `name` + `alternative_name` (already in `AdmissionsPersonRow`)
- Produces: Name cell with legal name on line 1; muted alt on line 2 when non-blank and ≠ `name`

- [ ] **Step 1: Write failing Name-cell tests**

Append to `describe("AdmissionsPeoplePage"` in `admissions-people-page.test.tsx` (keep existing tests; default fixture stays `name: "Aung"` with no alt):

```tsx
  it("shows legal name and muted alt name", async () => {
    searchEntities.mockResolvedValue({
      data: {
        data: [
          {
            id: 11,
            name: "Maung Maung",
            alternative_name: "aung aung",
            email: "a@x",
            phone_number: "09",
            is_active: true,
          },
        ],
        count: 1,
        total_pages: 1,
      },
    });
    renderPage();
    const btn = await screen.findByRole("button", { name: /maung maung/i });
    expect(btn).toHaveTextContent("Maung Maung");
    expect(btn).toHaveTextContent("aung aung");
    expect(screen.getByText("aung aung").className).toMatch(/text-text-muted/);
  });

  it("omits alt name when blank or equal to name", async () => {
    searchEntities.mockResolvedValue({
      data: {
        data: [
          {
            id: 11,
            name: "Aung",
            alternative_name: "Aung",
            email: "a@x",
            phone_number: "09",
            is_active: true,
          },
        ],
        count: 1,
        total_pages: 1,
      },
    });
    renderPage();
    const btn = await screen.findByRole("button", { name: /^aung$/i });
    expect(btn.querySelectorAll("span").length).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/admissions/people/admissions-people-page.test.tsx
```

Expected: FAIL — Name cell still prefers `alternative_name` (or shows a single string with no muted second line).

- [ ] **Step 3: Two-line Name cell**

In `admissions-people-page.tsx`, change only the Name column (`id: "name"`). Leave Email / Phone / Status alone. Do not change the person panel header.

```tsx
        accessor: (row) => row.name,
        sizing: { role: "person" },
        enableSorting: false,
        cell: ({ row }) => {
          const alt = row.alternative_name?.trim() ?? "";
          const showAlt = alt !== "" && alt !== row.name;
          return (
            <button
              type="button"
              aria-pressed={personId === row.id}
              onClick={() => void setPersonId(row.id)}
              className={cn(
                "text-left font-medium text-text-primary",
                personId === row.id && "underline",
              )}
            >
              <span className="block">{row.name}</span>
              {showAlt ? (
                <span className="block text-sm font-normal text-text-muted">
                  {alt}
                </span>
              ) : null}
            </button>
          );
        },
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/admissions/people/admissions-people-page.test.tsx
```

Expected: PASS (including existing Create / search / attending-URL cases).

- [ ] **Step 5: Commit (FE repo)**

```bash
cd schedjuice-reimagined-fe
git add src/components/admissions/people/admissions-people-page.tsx \
  src/components/admissions/people/admissions-people-page.test.tsx
git commit -m "feat(admissions): show name and alt name in People table"
```
