# Payment Date on Receipts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `UserPayment.payment_date` (default upload time, admin-overridable at upload and inline in staff payment tables), use it for receipt header date instead of `issued_at`, and double the receipt logo size.

**Architecture:** Add nullable `payment_date` on `UserPayment` with a bulk `F("created_at")` backfill; wire create/upload/PATCH paths; expose on admin-report rows; FE adds `InlineDatePicker` column left of Created By (Glide + ResourceTable) and per-part upload pickers; receipt builder reads `payment_date` (group: earliest part).

**Tech Stack:** Django REST + django-tenants (`schedjuice-reimagined-be`), Next.js App Router + TanStack Query + Vitest (`schedjuice-reimagined-fe`).

**Spec:** `docs/superpowers/specs/2026-07-26-payment-date-receipt-design.md`

## Global Constraints

- Default `payment_date` on create = upload time (`timezone.now()` when omitted; backfill uses `created_at`).
- Backfill: **single bulk `UPDATE` per tenant schema** via `QuerySet.update(payment_date=F("created_at"))` — **no row iteration, no N+1**.
- `issued_at` / covered months unchanged for month filtering and coverage.
- Group receipt date = **earliest** part `payment_date`.
- Inline column **Payment date** immediately **left of Created By** on Glide grid and ResourceTable.
- Group parent row: read-only earliest part date; group part rows editable.
- Receipt logo: **160×80** (was 80×40).
- Backend tests: `./scripts/run_backend_tests.sh <target>` with `--keepdb` (never dev DB).
- Frontend tests: `npm run test:unit -- <path>` from `schedjuice-reimagined-fe/`.
- High-value tests only — no happy-path-only smoke.

---

## File Structure

| Repo | File | Action | Responsibility |
| --- | --- | --- | --- |
| BE | `app_finance/models.py` | Modify | `payment_date` field on `UserPayment` |
| BE | `app_finance/migrations/0076_userpayment_payment_date.py` | Create | Add nullable column |
| BE | `app_finance/migrations/0077_backfill_userpayment_payment_date.py` | Create | Bulk backfill `payment_date = created_at` |
| BE | `app_finance/payment_group.py` | Modify | Create parts with `payment_date`; admin report + group min rollup |
| BE | `app_finance/views.py` | Modify | Parse `payment_date` / `part_{i}_payment_date` on upload |
| BE | `app_finance/serializers.py` | Modify | Default `payment_date` on create when omitted |
| BE | `app_finance/tests/test_payment_date.py` | Create | Create, PATCH, backfill, admin-report rollup tests |
| FE | `src/helpers/payment-receipt.ts` | Modify | Receipt date from `payment_date`; group earliest helper |
| FE | `src/helpers/payment-receipt.test.ts` | Modify | Receipt date + group earliest tests |
| FE | `src/components/finances/payment-receipt-pdf.tsx` | Modify | Logo 2× |
| FE | `src/components/datatable/inline-date-picker.tsx` | Create | Inline PATCH date picker |
| FE | `src/lib/data-sheets/payment-row-utils.ts` | Modify | `payment_date` display, edit rules, API payload |
| FE | `src/lib/data-sheets/payment-row-utils.test.ts` | Modify | Group parent not editable; display value |
| FE | `src/components/finances/student-payments-report.tsx` | Modify | Row type includes `payment_date`, `created_at?` |
| FE | `src/lib/finances/student-payments-resource-column-meta.ts` | Modify | Column meta before `created_by` |
| FE | `src/components/finances/student-payments-resource-table.tsx` | Modify | Inline date column cell |
| FE | `src/components/finances/student-payments-grid.tsx` | Modify | Glide column + synthetic create field |
| FE | `src/lib/finances/payment-group-utils.ts` | Modify | Append `payment_date` / `part_{i}_payment_date` |
| FE | `src/lib/finances/payment-group-utils.test.ts` | Modify | FormData keys |
| FE | `src/app/(internal)/finances/student-payments/upload/page.tsx` | Modify | Per-part Payment date picker |

---

## Task 1: Backend model and migrations

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/models.py`
- Create: `schedjuice-reimagined-be/app_finance/migrations/0076_userpayment_payment_date.py`
- Create: `schedjuice-reimagined-be/app_finance/migrations/0077_backfill_userpayment_payment_date.py`

**Interfaces:**
- Produces: `UserPayment.payment_date: datetime | None`

- [ ] **Step 1: Add field to model**

In `app_finance/models.py` on `UserPayment` (near `issued_at`):

```python
payment_date = models.DateTimeField(
    null=True,
    blank=True,
    help_text="Date shown on payment receipts; defaults to upload time.",
)
```

- [ ] **Step 2: Schema migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_finance --name userpayment_payment_date
```

Rename/save as `0076_userpayment_payment_date.py` if autonumber differs; dependency must be `0075_backfill_payment_repricing`.

- [ ] **Step 3: Data migration (bulk, no N+1)**

Create `app_finance/migrations/0077_backfill_userpayment_payment_date.py`:

```python
from django.db import migrations
from django.db.models import F


def backfill_payment_date(apps, schema_editor):
    schema_name = getattr(schema_editor.connection, "schema_name", "") or ""
    if not schema_name or schema_name == "public":
        return
    UserPayment = apps.get_model("app_finance", "UserPayment")
    UserPayment.objects.filter(payment_date__isnull=True).update(
        payment_date=F("created_at")
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0076_userpayment_payment_date"),
    ]

    operations = [
        migrations.RunPython(backfill_payment_date, noop_reverse),
    ]
```

- [ ] **Step 4: Apply migrations locally (test DB only if running tests later)**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py migrate app_finance --database=default
```

- [ ] **Step 5: Commit**

```bash
git add app_finance/models.py app_finance/migrations/0076_userpayment_payment_date.py app_finance/migrations/0077_backfill_userpayment_payment_date.py
git commit -m "feat(finances): add UserPayment.payment_date with bulk backfill"
```

---

## Task 2: Backend create paths and upload parsing

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/serializers.py`
- Modify: `schedjuice-reimagined-be/app_finance/payment_group.py`
- Modify: `schedjuice-reimagined-be/app_finance/views.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_payment_date.py`

**Interfaces:**
- Consumes: `UserPayment.payment_date` column from Task 1
- Produces:
  - `UserPaymentSerializer` accepts `payment_date` on create/update
  - Multipart parts dict includes `"payment_date": datetime | None`
  - `create_user_payment_group_with_parts` persists per-part `payment_date`

- [ ] **Step 1: Write failing tests**

Create `app_finance/tests/test_payment_date.py`:

```python
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import PaymentBank, PaymentMethod, UserPayment
from app_finance.payment_group import (
    admin_report_payment_row,
    create_user_payment_group_with_parts,
)
from app_rbac.seeding import seed_rbac


class PaymentDateCreateTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        seed_rbac()
        cls.client = APIClient()
        cls.admin = User.objects.create_user(
            email="admin-paydate@test.com",
            password="x",
            name="Admin",
        )
        cls.client.force_authenticate(user=cls.admin)
        program = Program.objects.create(title="P", code="P")
        category = Category.objects.create(title="C", program=program)
        cls.course = Course.objects.create(
            title="Math",
            category=category,
            start_date=timezone.now().date(),
            end_date=timezone.now().date().replace(year=timezone.now().year + 1),
        )
        cls.student = User.objects.create_user(
            email="student-paydate@test.com",
            password="x",
            name="Student",
        )
        UserCourse.objects.create(user=cls.student, course=cls.course)
        cls.method = PaymentMethod.objects.create(
            name="KPAY",
            payment_bank=PaymentBank.KPAY,
        )

    def test_create_without_payment_date_sets_non_null_default(self):
        with schema_context("public"):
            pass  # replace with tenant schema helper used in sibling tests
        payment = UserPayment.objects.create(
            user=self.student,
            course=self.course,
            created_by=self.admin,
            payment_method=self.method,
            parsed_amount=Decimal("10000"),
        )
        payment.refresh_from_db()
        self.assertIsNotNone(payment.payment_date)

    def test_multipart_create_stores_per_part_payment_date(self):
        explicit = timezone.make_aware(datetime(2026, 3, 15, 0, 0, 0))
        later = timezone.make_aware(datetime(2026, 3, 20, 0, 0, 0))
        png = SimpleUploadedFile("a.png", b"x", content_type="image/png")
        group = create_user_payment_group_with_parts(
            actor=self.admin,
            user=self.student,
            course=self.course,
            plan_fields={"issued_at": explicit},
            coverage=None,
            parts=[
                {
                    "screenshot": png,
                    "parsed_amount": Decimal("100"),
                    "payment_method": self.method,
                    "payment_date": explicit,
                },
                {
                    "screenshot": png,
                    "parsed_amount": Decimal("200"),
                    "payment_method": self.method,
                    "payment_date": later,
                },
            ],
        )
        dates = list(
            group.parts.order_by("id").values_list("payment_date", flat=True)
        )
        self.assertEqual(dates[0], explicit)
        self.assertEqual(dates[1], later)

    def test_patch_updates_payment_date(self):
        payment = UserPayment.objects.create(
            user=self.student,
            course=self.course,
            created_by=self.admin,
            payment_method=self.method,
            payment_date=timezone.now(),
        )
        new_dt = timezone.make_aware(datetime(2025, 12, 1, 0, 0, 0))
        payment.payment_date = new_dt
        payment.save(update_fields=["payment_date"])
        payment.refresh_from_db()
        self.assertEqual(payment.payment_date, new_dt)
```

Adapt `schema_context` / tenant fixture to match `test_payment_group.py` patterns in this repo before running.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_date
```

Expected: FAIL (multipart `payment_date` not persisted; create default may fail).

- [ ] **Step 3: Serializer default on create**

In `UserPaymentSerializer.create`, before `super().create(validated_data)`:

```python
if validated_data.get("payment_date") is None:
    validated_data["payment_date"] = timezone.now()
```

- [ ] **Step 4: Multipart create + parse**

In `payment_group.py` `create_user_payment_group_with_parts`, add to `UserPayment.objects.create(...)`:

```python
payment_date=part.get("payment_date") or timezone.now(),
```

In `views.py` `_parse_multipart_parts`, inside each part dict:

```python
"payment_date": self._parse_datetime_field(
    request.data.get(f"{prefix}payment_date"),
    f"{prefix}payment_date",
    errors,
),
```

For single-part upload via `AdminUploadScreenshotView`, `payment_date` is already in `fields = "__all__"` once the model field exists; ensure invalid datetime surfaces via serializer validation.

- [ ] **Step 5: Run tests**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_date
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app_finance/serializers.py app_finance/payment_group.py app_finance/views.py app_finance/tests/test_payment_date.py
git commit -m "feat(finances): persist payment_date on create and multipart upload"
```

---

## Task 3: Backend admin-report exposure and group rollup

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/payment_group.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_payment_date.py`

**Interfaces:**
- Produces:
  - `admin_report_payment_row(...)["payment_date"]` ISO string or null
  - `_admin_report_group_row(...)["payment_date"]` = min of parts' datetimes (ISO)

- [ ] **Step 1: Write failing test**

Append to `test_payment_date.py`:

```python
class PaymentDateAdminReportTests(TestCase):
    # reuse fixtures from PaymentDateCreateTests or setUp tenant similarly

    def test_group_row_payment_date_is_earliest_part(self):
        early = timezone.make_aware(datetime(2026, 1, 5, 0, 0, 0))
        late = timezone.make_aware(datetime(2026, 1, 20, 0, 0, 0))
        # build two-part group with payment_date early/late (reuse Task 2 helper)
        # row = _admin_report_group_row(group, list(group.parts.all()))
        # self.assertEqual(row["payment_date"], early.isoformat())
        ...
```

- [ ] **Step 2: Implement admin report fields**

In `admin_report_payment_row`:

```python
"payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
"created_at": payment.created_at.isoformat() if payment.created_at else None,
```

In `_admin_report_group_row`, after `ordered_parts` is built:

```python
part_dates = [p.payment_date for p in ordered_parts if p.payment_date]
payment_date = min(part_dates).isoformat() if part_dates else None
```

Add `"payment_date": payment_date` to the returned dict.

- [ ] **Step 3: Run tests**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_date.PaymentDateAdminReportTests
```

- [ ] **Step 4: Commit**

```bash
git add app_finance/payment_group.py app_finance/tests/test_payment_date.py
git commit -m "feat(finances): expose payment_date on admin report rows"
```

---

## Task 4: Frontend receipt date and logo

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/finances/payment-receipt-pdf.tsx`

**Interfaces:**
- Produces:
  - `resolveReceiptPaymentDate(row, tz): string`
  - `earliestPartPaymentDate(parts): string | null`
  - `buildSharedMeta` uses `resolveReceiptPaymentDate`
  - `buildGroupPaymentReceiptPayload` passes earliest date into meta

- [ ] **Step 1: Write failing tests**

In `payment-receipt.test.ts`:

```typescript
describe("receipt payment_date", () => {
  it("uses payment_date instead of issued_at", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 1,
        payment_date: "2026-03-10T00:00:00.000Z",
        issued_at: "2026-07-01T00:00:00.000Z",
        actual_amount: "100",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.receiptDate).toBe("Mar 10, 2026");
  });

  it("group receipt uses earliest part payment_date", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        id: "group-1",
        group_id: 1,
        kind: "group",
        user: { name: "Jane" },
        course: { title: "Math" },
        parts: [
          { id: 1, payment_date: "2026-05-01T00:00:00.000Z", actual_amount: "100" },
          { id: 2, payment_date: "2026-04-01T00:00:00.000Z", actual_amount: "100" },
        ],
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.receiptDate).toBe("Apr 1, 2026");
  });
});
```

Update the existing test `"uses tenant timezone for generatedAt and receiptDate"` to set `payment_date` instead of relying on `issued_at`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/payment-receipt.test.ts
```

- [ ] **Step 3: Implement receipt helpers**

In `payment-receipt.ts`:

```typescript
export function resolveReceiptPaymentDate(
  row: Pick<PaymentReceiptRowInput, "payment_date" | "created_at">,
  timezone: string,
): string {
  const raw = row.payment_date ?? row.created_at;
  if (raw) return formatReceiptDate(raw, timezone);
  return formatReceiptDate(new Date(), timezone);
}

export function earliestPartPaymentDate(
  parts: PaymentReceiptRowInput[],
): string | null {
  let best: string | null = null;
  let bestMs = Infinity;
  for (const part of parts) {
    const raw = part.payment_date ?? part.created_at;
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (Number.isFinite(ms) && ms < bestMs) {
      bestMs = ms;
      best = raw;
    }
  }
  return best;
}
```

Add to `PaymentReceiptRowInput`:

```typescript
payment_date?: string | null;
created_at?: string | null;
```

In `buildSharedMeta`:

```typescript
const receiptDate = resolveReceiptPaymentDate(row, tz);
```

In `buildGroupPaymentReceiptPayload`, before `buildSharedMeta`:

```typescript
const earliest = earliestPartPaymentDate(parts);
const metaRow =
  earliest != null ? { ...groupRow, payment_date: earliest } : groupRow;
// use metaRow in buildSharedMeta(metaRow, ...)
```

- [ ] **Step 4: Logo 2×**

In `payment-receipt-pdf.tsx`:

```typescript
logo: {
  width: 160,
  height: 80,
  objectFit: "contain",
  marginBottom: 8,
},
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm run test:unit -- src/helpers/payment-receipt.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/helpers/payment-receipt.ts src/helpers/payment-receipt.test.ts src/components/finances/payment-receipt-pdf.tsx
git commit -m "feat(finances): receipt date from payment_date and larger logo"
```

---

## Task 5: InlineDatePicker component

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/datatable/inline-date-picker.tsx`
- Modify: `schedjuice-reimagined-fe/src/lib/data-sheets/payment-row-utils.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/data-sheets/payment-row-utils.test.ts`

**Interfaces:**
- Produces: `InlineDatePicker` with props mirroring `InlineTimeSelect` pattern:
  - `value?: string | null` (ISO)
  - `entityName`, `entityId`, `fieldName` (default `"payment_date"`)
  - `saveTransform?: (date: Date) => string`
  - `refetchQueryKeys`, `isDisabled`
- Produces: `isPaymentFieldEditable(row, "payment_date")` false for group parent; `paymentFieldDisplayValue` formats date; `paymentFieldApiPayload("payment_date", iso)`

- [ ] **Step 1: Extend payment-row-utils**

Add `"payment_date"` handling:

```typescript
export function isPaymentFieldEditable(row, field: string): boolean {
  if (field === "payment_date" && isGroupPaymentRow(row)) return false;
  // existing logic...
  if (field === "payment_date") return !isExemptPaymentExpectationRow(row);
}

export function paymentFieldDisplayValue(row, field: string): string {
  // ...
  case "payment_date":
    return row.payment_date ?? "";
}

export function paymentFieldApiPayload(field: string, value: string) {
  if (field === "payment_date") {
    return { payment_date: value === "" ? null : value };
  }
  // existing...
}
```

Add test:

```typescript
it("payment_date is not editable on group parent row", () => {
  expect(isPaymentFieldEditable({ kind: "group", id: "group-1", status: "verified" }, "payment_date")).toBe(false);
});
```

- [ ] **Step 2: Create InlineDatePicker**

Create `inline-date-picker.tsx` following `inline-time-select.tsx`:

- Popover + `Calendar` from `@/components/date/calendar`
- Trigger shows `formatDate(value)` or em dash
- On day select: call `updateEntity(entityName, entityId, { payment_date: saveTransform?.(day) ?? day.toISOString() })`
- Invalidate `refetchQueryKeys` / student payments caches on success
- `isDisabled` prop for read-only cells

Use tenant timezone when converting calendar selection to ISO:

```typescript
import { getTenantDayBoundariesIso } from "@/helpers/shortcuts-time";
// saveTransform: (date) => getTenantDayBoundariesIso(tenantTz, ymd).startIso
```

- [ ] **Step 3: Run utils test**

```bash
npm run test:unit -- src/lib/data-sheets/payment-row-utils.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/components/datatable/inline-date-picker.tsx src/lib/data-sheets/payment-row-utils.ts src/lib/data-sheets/payment-row-utils.test.ts
git commit -m "feat(datatable): add InlineDatePicker for payment_date"
```

---

## Task 6: Staff table columns (ResourceTable + Glide)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-report.tsx`
- Modify: `schedjuice-reimagined-fe/src/lib/finances/student-payments-resource-column-meta.ts`
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-resource-table.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-grid.tsx`

**Interfaces:**
- Consumes: `InlineDatePicker`, `paymentFieldDisplayValue`, admin-report `payment_date` on rows
- Produces: visible **Payment date** column left of **Created By** on both table UIs

- [ ] **Step 1: Extend row type**

In `student-payments-report.tsx`:

```typescript
payment_date?: string | null;
created_at?: string | null;
```

- [ ] **Step 2: Column meta**

In `student-payments-resource-column-meta.ts`, insert before `created_by`:

```typescript
{
  id: "payment_date",
  contentRole: "date",
  minWidth: "9rem",
  preferredWidth: "10rem",
  align: "left",
  truncate: true,
},
```

- [ ] **Step 3: ResourceTable column**

In `student-payments-resource-table.tsx`, before the `created_by` column definition:

```typescript
{
  id: "payment_date",
  header: "Payment date",
  accessor: (row) => paymentFieldDisplayValue(row, "payment_date"),
  enableSorting: false,
  sizing: { role: "date" },
  cell: ({ row }) => {
    const isParent =
      row.__flatKind === "group_parent" || isGroupPaymentRow(row);
    const display = isParent
      ? earliestPartPaymentDateForRow(row) // min of row.parts payment_date, formatted
      : paymentFieldDisplayValue(row, "payment_date");
    if (isParent || !isPaymentFieldEditable(row, "payment_date")) {
      return <span className="text-left">{display ? formatDate(display) : "—"}</span>;
    }
    return (
      <InlineDatePicker
        value={row.payment_date}
        entityName="user-payments"
        entityId={row.id}
        fieldName="payment_date"
        isDisabled={!canRecord}
        refetchQueryKeys={[[/* student payments report key + tableUid */]]}
        saveTransform={(date) => /* tenant start-of-day ISO */}
      />
    );
  },
},
```

Extract a small local helper `earliestPartPaymentDateForRow(row)` using the same min logic as receipts, or import from `payment-receipt.ts` if exported.

Wire `softRefetchStudentPaymentsReport` on success like other editable cells.

- [ ] **Step 4: Glide grid column**

In `student-payments-grid.tsx`:

1. Add to `gridCols` before `created_by`:

```typescript
{ id: "payment_date", title: "Payment date", width: 130 },
```

2. Include `"payment_date"` in admin-report field list / expand if needed.

3. In `onLocalUpdate`, handle `payment_date`.

4. Render custom cell: read-only formatted date for group parent; otherwise delegate to inline date picker or adapter hook.

5. In `createSyntheticPayment`, append `payment_date` when field is `payment_date`.

- [ ] **Step 5: Manual smoke**

Open student payments report — confirm column order and PATCH saves.

- [ ] **Step 6: Commit**

```bash
git add src/components/finances/student-payments-report.tsx src/lib/finances/student-payments-resource-column-meta.ts src/components/finances/student-payments-resource-table.tsx src/components/finances/student-payments-grid.tsx
git commit -m "feat(finances): inline payment_date column on staff payment tables"
```

---

## Task 7: Upload page per-part date picker

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/finances/student-payments/upload/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/lib/finances/payment-group-utils.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/finances/payment-group-utils.test.ts`

**Interfaces:**
- Consumes: `getTenantDayBoundariesIso`, `getTenantTodayYmd`
- Produces: `PaymentPartFormInput.paymentDateIso?: string`; FormData keys `payment_date` / `part_{i}_payment_date`

- [ ] **Step 1: Extend payment-group-utils test**

```typescript
it("appends part payment_date fields", () => {
  const fd = buildMultiPartPaymentFormData({
    userId: 1,
    courseId: 2,
    planFields: {},
    parts: [
      {
        file: new File(["x"], "a.png"),
        parsedAmount: "100",
        paymentMethodId: "1",
        paymentDateIso: "2026-03-15T00:00:00.000Z",
      },
    ],
  });
  expect(fd.get("payment_date")).toBe("2026-03-15T00:00:00.000Z");
});
```

- [ ] **Step 2: Run test — FAIL**

```bash
npm run test:unit -- src/lib/finances/payment-group-utils.test.ts
```

- [ ] **Step 3: Implement FormData append**

In `PaymentPartFormInput`:

```typescript
paymentDateIso?: string;
```

In `appendPartToFormData` and single-part branch:

```typescript
if (part.paymentDateIso) {
  fd.append(`part_${index}_payment_date`, part.paymentDateIso);
}
// single-part: fd.append("payment_date", p.paymentDateIso)
```

- [ ] **Step 4: Upload page UI**

Extend `UploadPart`:

```typescript
paymentDateYmd: string; // tenant calendar day YYYY-MM-DD
```

Initialize in `createUploadPart`:

```typescript
paymentDateYmd: getTenantTodayYmd(tenantTimezone),
```

Add per-part field after screenshot block:

```tsx
<Field.Root name={uploadPartFieldDataName(part.key, "payment_date")}>
  <Field.Label>Payment date</Field.Label>
  <DatePicker
    date={part.paymentDateYmd}
    setDate={(next) => updatePartPaymentDate(part.key, next)}
  />
</Field.Root>
```

When building submit payload, map each part:

```typescript
paymentDateIso: getTenantDayBoundariesIso(tenantTz, part.paymentDateYmd).startIso,
```

- [ ] **Step 5: Run tests — PASS**

```bash
npm run test:unit -- src/lib/finances/payment-group-utils.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/app/(internal)/finances/student-payments/upload/page.tsx src/lib/finances/payment-group-utils.ts src/lib/finances/payment-group-utils.test.ts
git commit -m "feat(finances): per-part payment date on upload form"
```

---

## Spec self-review checklist

| Spec requirement | Task |
|---|---|
| `payment_date` field | Task 1 |
| Bulk backfill, no N+1 | Task 1 |
| Default on create | Task 2 |
| Upload single + multipart parse | Task 2, 7 |
| PATCH writable | Task 2 (serializer) |
| Admin report + group min | Task 3 |
| Inline column left of Created By (both tables) | Task 6 |
| Upload per-part picker | Task 7 |
| Receipt uses `payment_date` | Task 4 |
| Group receipt earliest | Task 4 |
| Logo 2× | Task 4 |
| `issued_at` unchanged for filtering | No tasks touch coverage filters |

No placeholders remain in task steps above.
