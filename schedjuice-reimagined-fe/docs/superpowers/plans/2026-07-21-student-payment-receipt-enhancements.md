# Student Payment Receipt Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich client-side student payment receipts with discount/amount breakdown, contiguous multi-month billing ranges, centered school branding, combined group receipts, and download entry points on ResourceTable + Payment History.

**Architecture:** Keep `@react-pdf/renderer` client PDF generation. Expose existing `UserPayment` amount/discount fields on admin-report (and `discount_label` on list serializer). FE pure helpers build single/group payloads; staff grids + Payment History call the same download helpers.

**Tech Stack:** Django admin-report projection (`payment_group.py`), DRF `UserPaymentSerializer`, Next.js, `@react-pdf/renderer`, Vitest, existing `formatMoney` / `formatMonthLong`.

## Global Constraints

- Spec: `schedjuice-reimagined-fe/docs/superpowers/specs/2026-07-21-student-payment-receipt-enhancements-design.md`
- No new receipt snapshot columns / migrations on `UserPayment`
- No server-side PDF endpoint
- Backend tests: always `--keepdb --noinput` via `./scripts/run_backend_tests.sh <target>`
- Do not create git commits unless the user explicitly asks
- Two repos: BE work under `schedjuice-reimagined-be/`, FE under `schedjuice-reimagined-fe/`

---

## File Structure

**Backend**

| File | Responsibility |
|---|---|
| `app_finance/payment_group.py` | Add amount fields + `discount_label` on payment/group admin-report rows; group rollups |
| `app_finance/views.py` | `select_related("enrollment_discount__discount")` on admin-report queryset |
| `app_finance/serializers.py` | `discount_label` method field on `UserPaymentSerializer` |
| `app_finance/tests/test_payment_group.py` | Assert new report fields + group rollups |
| `app_finance/tests/test_payment_create_discount.py` or small new test | Serializer / create path already sets amounts — add label assertion if needed |

**Frontend**

| File | Responsibility |
|---|---|
| `src/helpers/payment-receipt.ts` | Paid-amount resolver, contiguous months, payload builders, download entrypoints |
| `src/helpers/payment-receipt.test.ts` | Unit tests for pure helpers |
| `src/components/finances/payment-receipt-pdf.tsx` | Centered header + amount breakdown + parts list |
| `src/components/finances/student-payments-report.tsx` | Extend `StudentPaymentAdminReportRow` types |
| `src/components/finances/student-payments-grid.tsx` | Receipt on verified group rows; keep hidden on grouped parts |
| `src/components/finances/student-payments-resource-table.tsx` | Receipt action column |
| `src/app/(internal)/finances/payment-history/page.tsx` | Student download |
| `src/components/datatable/payment-history-action-cell.tsx` | Receipt button (+ loading) for history |

---

### Task 1: Backend — amount fields on admin-report payment rows

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/payment_group.py`
- Test: `schedjuice-reimagined-be/app_finance/tests/test_payment_group.py`

**Interfaces:**
- Consumes: `UserPayment.base_amount`, `discount_amount`, `invoiced_amount`, `actual_amount`, `enrollment_discount.discount.name`
- Produces: payment row dict keys `base_amount`, `discount_amount`, `invoiced_amount`, `actual_amount`, `discount_label` (Decimal/None for money amounts matching `parsed_amount` style; `str | None` for label)

- [ ] **Step 1: Write the failing test**

In `test_payment_group.py`, add a test that creates a verified standalone payment with base/discount/invoiced/actual set and an enrollment discount (reuse patterns from `test_payment_create_discount.py` if fixtures are heavy — minimal approach: set Money fields directly on `UserPayment` and attach `enrollment_discount` with a `Discount(name="Sibling")`).

```python
def test_admin_report_includes_amount_and_discount_fields(self):
    with schema_context(self.schema_name):
        # create Discount + EnrollmentDiscount + UserPayment with:
        # base_amount=500, discount_amount=50, invoiced_amount=450,
        # actual_amount=450, parsed_amount=450, enrollment_discount linked
        ...
    rows = self._admin_report_rows_for_student_course()
    row = next(r for r in rows if r.get("kind") == "payment" and r.get("transaction_id") == "RECEIPT-AMT-1")
    self.assertEqual(Decimal(str(row["base_amount"])), Decimal("500"))
    self.assertEqual(Decimal(str(row["discount_amount"])), Decimal("50"))
    self.assertEqual(Decimal(str(row["invoiced_amount"])), Decimal("450"))
    self.assertEqual(Decimal(str(row["actual_amount"])), Decimal("450"))
    self.assertEqual(row["discount_label"], "Sibling")
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group.PaymentGroupTests.test_admin_report_includes_amount_and_discount_fields
```

Expected: FAIL — KeyError or assertion on missing keys.

- [ ] **Step 3: Implement helpers + extend `admin_report_payment_row`**

In `payment_group.py`:

```python
def _money_amount(value):
    if value is None:
        return None
    return value.amount


def _discount_label(payment: UserPayment) -> str | None:
    ed = getattr(payment, "enrollment_discount", None)
    if ed is None:
        return None
    discount = getattr(ed, "discount", None)
    if discount is not None and getattr(discount, "name", None):
        return discount.name
    return None
```

In `admin_report_payment_row` return dict, add:

```python
"base_amount": _money_amount(getattr(payment, "base_amount", None)),
"discount_amount": _money_amount(getattr(payment, "discount_amount", None)),
"invoiced_amount": _money_amount(getattr(payment, "invoiced_amount", None)),
"actual_amount": _money_amount(getattr(payment, "actual_amount", None)),
"discount_label": _discount_label(payment),
```

- [ ] **Step 4: Run test to verify it passes**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Checkpoint**

Stop for review. Do not commit unless asked.

---

### Task 2: Backend — group rollup + prefetch

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/payment_group.py` (`_admin_report_group_row`)
- Modify: `schedjuice-reimagined-be/app_finance/views.py` (admin-report `select_related`)
- Test: `schedjuice-reimagined-be/app_finance/tests/test_payment_group.py`

**Interfaces:**
- Consumes: part rows from Task 1
- Produces: group row with summed money fields + rolled-up `discount_label` (`None` / shared name / `"Multiple"`)

- [ ] **Step 1: Write the failing test**

```python
def test_admin_report_group_rolls_up_amounts_and_discount_label(self):
    # Create a 2-part group; set base/discount/invoiced/actual on each part
    # Same discount label "Sibling" on both
    rows = self._admin_report_rows_for_student_course()
    row = next(r for r in rows if r.get("kind") == "group")
    self.assertEqual(Decimal(str(row["base_amount"])), Decimal("1000"))
    self.assertEqual(Decimal(str(row["discount_amount"])), Decimal("100"))
    self.assertEqual(row["discount_label"], "Sibling")
    self.assertEqual(row["parts"][0]["discount_label"], "Sibling")
```

Add a second assertion case (same test or sibling) where labels differ → `"Multiple"`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group.PaymentGroupTests.test_admin_report_group_rolls_up_amounts_and_discount_label
```

Expected: FAIL on missing group keys.

- [ ] **Step 3: Implement group rollup**

In `_admin_report_group_row`, after `part_rows = ...`:

```python
def _sum_amounts(attr: str):
    total = Decimal("0")
    has = False
    for part in ordered_parts:
        money = getattr(part, attr, None)
        if money is not None:
            total += money.amount
            has = True
    return total if has else None

labels = [p.get("discount_label") for p in part_rows]
nonzero_labels = [x for x in labels if x]
if not nonzero_labels:
    discount_label = None
elif len(set(nonzero_labels)) == 1:
    discount_label = nonzero_labels[0]
else:
    discount_label = "Multiple"
```

Add to group return dict:

```python
"base_amount": _sum_amounts("base_amount"),
"discount_amount": _sum_amounts("discount_amount"),
"invoiced_amount": _sum_amounts("invoiced_amount"),
"actual_amount": _sum_amounts("actual_amount"),
"discount_label": discount_label,
```

In `UserPaymentAdminReportView` queryset `select_related`, add `"enrollment_discount", "enrollment_discount__discount"`.

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group
```

Expected: PASS (including prior Task 1 test).

- [ ] **Step 5: Checkpoint**

Stop for review. Do not commit unless asked.

---

### Task 3: Backend — `discount_label` on `UserPaymentSerializer`

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/serializers.py`
- Test: add method in `app_finance/tests/test_payment_create_discount.py` **or** a focused serializer test that GETs `user-payments/<id>` and asserts `discount_label`

**Interfaces:**
- Produces: read-only `discount_label: str | null` on payment detail/list JSON (amounts already exposed via `fields = "__all__"`)

- [ ] **Step 1: Write failing test**

Create a payment with enrollment discount named `"Sibling"`, GET detail, assert:

```python
self.assertEqual(resp.json()["data"]["discount_label"], "Sibling")
```

(Adjust response envelope to match this codebase’s `BaseResponse` shape.)

- [ ] **Step 2: Run to verify fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.<module>.<test_name>
```

Expected: FAIL — missing `discount_label`.

- [ ] **Step 3: Implement**

In `UserPaymentSerializer`:

```python
discount_label = SerializerMethodField()

def get_discount_label(self, obj):
    ed = getattr(obj, "enrollment_discount", None)
    if ed is None:
        return None
    discount = getattr(ed, "discount", None)
    if discount is not None and discount.name:
        return discount.name
    return None
```

Ensure `discount_label` is included (declared `SerializerMethodField` with `fields = "__all__"` already picks up `covered_months` the same way).

If list/search queryset used by Payment History omits the relation, add `select_related("enrollment_discount__discount")` on the relevant view queryset (same pattern as admin-report).

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Checkpoint**

---

### Task 4: Frontend — pure helpers (TDD)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-report.tsx` (row type fields only)

**Interfaces:**
- Produces:
  - `resolvePaymentReceiptPaidAmount(row): string | null`
  - `formatPaymentReceiptBillingPeriod(row): string` (updated contiguous behavior)
  - `buildPaymentReceiptPayload(...)` / `buildGroupPaymentReceiptPayload(...)`
  - `buildGroupPaymentReceiptFilename(groupId: number | string): string`
  - `downloadGroupPaymentReceipt(...)`
  - `PaymentReceiptPayload` shape (locked for Task 5):
    - existing: `orgName`, `orgLogoUrl`, `receiptNumber`, `receiptDate`, `studentName`, `courseTitle`, `transactionId`, `paymentMethod`, `billingPeriod`, `installmentNote`, `remarks`, `generatedAt`
    - `baseAmount: string | null`
    - `discountLine: string | null` — e.g. `"Sibling (−$50.00)"`
    - `invoicedAmount: string | null`
    - `amountPaid: string` — formatted paid or `"—"`
    - `parts: { label: string; transactionId: string; amountPaid: string }[] | null`
    - deprecate unused `amount` field (remove from type + PDF; use `amountPaid` only)

- [ ] **Step 1: Extend row type**

In `student-payments-report.tsx` on `StudentPaymentAdminReportRow` add:

```ts
base_amount?: string | number | null;
discount_amount?: string | number | null;
invoiced_amount?: string | number | null;
actual_amount?: string | number | null;
discount_label?: string | null;
```

- [ ] **Step 2: Write failing tests** in `payment-receipt.test.ts`

```ts
import {
  resolvePaymentReceiptPaidAmount,
  formatPaymentReceiptBillingPeriod,
  buildPaymentReceiptPayload,
  buildGroupPaymentReceiptFilename,
  buildGroupPaymentReceiptPayload,
} from "@/helpers/payment-receipt";

describe("resolvePaymentReceiptPaidAmount", () => {
  it("prefers actual, then parsed, then invoiced", () => {
    expect(
      resolvePaymentReceiptPaidAmount({
        id: 1,
        actual_amount: "10",
        parsed_amount: "20",
        invoiced_amount: "30",
      }),
    ).toBe("10");
    expect(
      resolvePaymentReceiptPaidAmount({
        id: 1,
        actual_amount: null,
        parsed_amount: "20",
        invoiced_amount: "30",
      }),
    ).toBe("20");
    expect(
      resolvePaymentReceiptPaidAmount({
        id: 1,
        actual_amount: null,
        parsed_amount: null,
        invoiced_amount: "30",
      }),
    ).toBe("30");
  });
});

describe("formatPaymentReceiptBillingPeriod contiguous", () => {
  it("formats contiguous months as a range", () => {
    expect(
      formatPaymentReceiptBillingPeriod({
        id: 1,
        covered_months: [
          { year: 2026, month_index: 1 },
          { year: 2026, month_index: 2 },
          { year: 2026, month_index: 3 },
        ],
      }),
    ).toBe("January 2026 – March 2026");
  });

  it("comma-separates gapped months", () => {
    expect(
      formatPaymentReceiptBillingPeriod({
        id: 1,
        covered_months: [
          { year: 2026, month_index: 1 },
          { year: 2026, month_index: 3 },
        ],
      }),
    ).toBe("January 2026, March 2026");
  });
});

describe("buildPaymentReceiptPayload amounts", () => {
  it("includes discount and invoiced when they apply", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        user: { name: "Jane" },
        course: { title: "Math" },
        base_amount: "500",
        discount_amount: "50",
        discount_label: "Sibling",
        invoiced_amount: "450",
        actual_amount: "400",
        parsed_amount: "400",
      },
      { name: "Acme", logo: null },
      "$",
    );
    expect(payload.baseAmount).toMatch(/500/);
    expect(payload.discountLine).toMatch(/Sibling/);
    expect(payload.discountLine).toMatch(/50/);
    expect(payload.invoicedAmount).toMatch(/450/);
    expect(payload.amountPaid).toMatch(/400/);
  });

  it("omits invoiced when equal to paid", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        invoiced_amount: "450",
        actual_amount: "450",
      },
      { name: "Acme", logo: null },
      "$",
    );
    expect(payload.invoicedAmount).toBeNull();
  });
});

describe("group receipt", () => {
  it("builds group filename", () => {
    expect(buildGroupPaymentReceiptFilename(12)).toBe("receipt-group-12.pdf");
  });
});
```

Update the existing contiguous test that currently expects `"January 2026, February 2026"` for two contiguous months — change expectation to `"January 2026 – February 2026"`.

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd schedjuice-reimagined-fe
npx vitest run src/helpers/payment-receipt.test.ts
```

- [ ] **Step 4: Implement helpers**

In `payment-receipt.ts`:

```ts
export function resolvePaymentReceiptPaidAmount(row: {
  actual_amount?: string | number | null;
  parsed_amount?: string | number | null;
  invoiced_amount?: string | number | null;
}): string | null {
  for (const v of [row.actual_amount, row.parsed_amount, row.invoiced_amount]) {
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      return String(v);
    }
  }
  return null;
}

function monthSortKey(m: { year: number; month_index: number }) {
  return m.year * 12 + m.month_index;
}

function areContiguousMonths(
  months: { year: number; month_index: number }[],
): boolean {
  if (months.length <= 1) return true;
  const sorted = [...months].sort((a, b) => monthSortKey(a) - monthSortKey(b));
  for (let i = 1; i < sorted.length; i++) {
    if (monthSortKey(sorted[i]) !== monthSortKey(sorted[i - 1]) + 1) return false;
  }
  return true;
}

export function formatPaymentReceiptBillingPeriod(row: PaymentReceiptRowInput): string {
  if (row.covered_months && row.covered_months.length > 0) {
    const sorted = [...row.covered_months].sort(
      (a, b) => monthSortKey(a) - monthSortKey(b),
    );
    if (areContiguousMonths(sorted)) {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (sorted.length === 1) {
        return formatMonthLong(first.year, first.month_index);
      }
      return `${formatMonthLong(first.year, first.month_index)} – ${formatMonthLong(last.year, last.month_index)}`;
    }
    return sorted.map((m) => formatMonthLong(m.year, m.month_index)).join(", ");
  }
  // existing billing_start/end + issued_at fallbacks unchanged
  ...
}
```

Extend `PaymentReceiptRowInput` with the new amount fields. Update `PaymentReceiptPayload` and `buildPaymentReceiptPayload` to the locked shape above:

- `amountPaid`: `formatMoney(paid)` or `"—"`
- `baseAmount`: format when `base_amount` present else `null`
- `discountLine`: when `Number(discount_amount) > 0` → `` `${label} (−${formatMoney(discount)})` `` with `label = discount_label || "Discount"`; else `null`
- `invoicedAmount`: only when invoiced present and normalized string ≠ paid; else `null`
- `parts`: `null` for single payments
- Remove obsolete `amount` from the payload type

`buildGroupPaymentReceiptPayload`:

- Use group row student/course/billing/installment/remarks
- Sum paid via parts: each part `resolvePaymentReceiptPaidAmount`
- Sum base/discount when present on parts (or use group rolled fields)
- `parts`: map each part to `{ label: \`Part ${i+1}\`, transactionId, amountPaid }`
- Summary transaction id: shared if all equal and non-empty, else `"—"`
- `receiptNumber`: `group-{group_id}`

```ts
export function buildGroupPaymentReceiptFilename(groupId: number | string): string {
  return `receipt-group-${groupId}.pdf`;
}
```

Add `downloadGroupPaymentReceipt(groupRow, tenant, currencySymbol)` mirroring `downloadPaymentReceipt` but using group payload + filename.

- [ ] **Step 5: Run vitest — expect PASS**

```bash
cd schedjuice-reimagined-fe
npx vitest run src/helpers/payment-receipt.test.ts
```

- [ ] **Step 6: Checkpoint**

---

### Task 5: Frontend — PDF layout

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finances/payment-receipt-pdf.tsx`

**Interfaces:**
- Consumes: extended `PaymentReceiptPayload` from Task 4

- [ ] **Step 1: Update styles for centered header**

```tsx
header: {
  marginBottom: 24,
  alignItems: "center",
},
logo: {
  width: 80,
  height: 40,
  objectFit: "contain",
  marginBottom: 8,
},
orgName: {
  fontSize: 14,
  fontWeight: "bold",
  marginBottom: 4,
  textAlign: "center",
},
title: {
  fontSize: 18,
  fontWeight: "bold",
  marginTop: 12,
  marginBottom: 16,
  textAlign: "center",
},
```

Keep `metaRow` full width under the centered block (wrap meta in a width-100% View).

- [ ] **Step 2: Render amount breakdown**

Replace the single `Amount` row with:

```tsx
{payload.baseAmount ? (
  <DetailRow label="Base amount" value={payload.baseAmount} />
) : null}
{payload.discountLine ? (
  <DetailRow label="Discount" value={payload.discountLine} />
) : null}
{payload.invoicedAmount ? (
  <DetailRow label="Invoiced amount" value={payload.invoicedAmount} />
) : null}
<DetailRow label="Amount paid" value={payload.amountPaid} />
```

- [ ] **Step 3: Parts section**

```tsx
{payload.parts && payload.parts.length > 0 ? (
  <View style={styles.section}>
    <Text style={{ fontWeight: "bold", marginBottom: 8 }}>Parts</Text>
    {payload.parts.map((p) => (
      <DetailRow
        key={p.label}
        label={p.label}
        value={`${p.transactionId}   ${p.amountPaid}`}
      />
    ))}
  </View>
) : null}
```

- [ ] **Step 4: Manual smoke**

Generate a PDF in the browser from a verified row after Task 6, or temporarily call helpers in a unit test that only asserts payload (PDF visual is manual).

- [ ] **Step 5: Checkpoint**

---

### Task 6: Frontend — Glide grid group receipt

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-grid.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/finances/payments-grid/payment-grid-overlays.tsx` only if action ids need updates

**Interfaces:**
- Consumes: `downloadPaymentReceipt`, `downloadGroupPaymentReceipt`, `isGroupPaymentRow`, `canDownloadPaymentReceipt`

- [ ] **Step 1: Update `getActionLabels`**

Current code returns early for groups before Receipt. Change so:

```ts
if (isGroup) {
  labels.push(formatTransactionCount(getPaymentPartCount(row)));
}
// screenshots / upload as today...
if (isGroup) {
  if (
    row.status === UserPaymentStatus.verified &&
    user &&
    canDownloadPaymentReceipt(user)
  ) {
    labels.push("Receipt");
  }
  return labels; // still no per-part Coverage/Refunds changes beyond existing
}
// standalone verified → Receipt (existing)
```

Ensure grouped **part** rows (if ever shown) do not get Receipt — `isGroupPaymentRow` is false for parts; if parts appear as children, guard with `row.group_id != null && row.kind !== "group"` → no Receipt on staff grid parts.

- [ ] **Step 2: Wire click handler**

Where `download_receipt` is handled (~line 1048):

```ts
case "download_receipt": {
  if (isGroupPaymentRow(row)) {
    await downloadGroupPaymentReceipt(row, tenant, currencySymbol);
  } else {
    await downloadPaymentReceipt(row, tenant, currencySymbol);
  }
  break;
}
```

- [ ] **Step 3: Manual check**

Verified group row shows Receipt; part rows do not; download produces `receipt-group-{id}.pdf`.

- [ ] **Step 4: Checkpoint**

---

### Task 7: Frontend — ResourceTable receipt action

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-resource-table.tsx`

**Interfaces:**
- Consumes: same download helpers + `canDownloadPaymentReceipt`

- [ ] **Step 1: Import helpers**

```ts
import { canDownloadPaymentReceipt } from "@/helpers/authorization";
import {
  downloadGroupPaymentReceipt,
  downloadPaymentReceipt,
} from "@/helpers/payment-receipt";
```

- [ ] **Step 2: Add receipt button in `_actions` column**

Near Refunds / screenshot buttons (~line 925+):

```tsx
{user &&
canDownloadPaymentReceipt(user) &&
row.status === UserPaymentStatus.verified &&
(isGroupPaymentRow(row)
  ? row.__flatKind !== "group_part"
  : row.group_id == null) && (
  <Button
    size="sm"
    variant="ghost"
    disabled={receiptLoadingId === row.id}
    onClick={async () => {
      setReceiptLoadingId(row.id);
      try {
        if (isGroupPaymentRow(row)) {
          await downloadGroupPaymentReceipt(row, tenant!, currencySymbol);
        } else {
          await downloadPaymentReceipt(row, tenant!, currencySymbol);
        }
      } catch {
        toast({ title: "Could not generate receipt. Please try again.", variant: "destructive" });
      } finally {
        setReceiptLoadingId(null);
      }
    }}
  >
    Receipt
  </Button>
)}
```

Match existing Button / toast APIs in this file exactly (adjust prop names to local patterns).

Hide on `group_part` flat rows; show on `group_parent` / group rows and standalone payments without `group_id`.

- [ ] **Step 3: Manual check** — ResourceTable verified row downloads PDF.

- [ ] **Step 4: Checkpoint**

---

### Task 8: Frontend — Payment History student download

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/finances/payment-history/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/datatable/payment-history-action-cell.tsx`
- Possibly: SDK `UserPayment` type if `discount_label` / `group_id` missing from typings

**Interfaces:**
- Consumes: `downloadPaymentReceipt`, `downloadGroupPaymentReceipt`, `makeGetRequest('user-payment-groups/${id}')`
- Group detail shape: same as ResourceTable already uses (`student-payments-resource-table.tsx` ~line 430)

- [ ] **Step 1: Add `PaymentHistoryReceiptCell`**

In `payment-history-action-cell.tsx`:

```tsx
export function PaymentHistoryReceiptCell({
  row,
}: {
  row: {
    id: number;
    status: string;
    group_id?: number | null;
    // amount fields + covered_months + user/course etc. for single download
    [key: string]: unknown;
  };
}) {
  // show only when status === verified
  // if group_id:
  //   fetch group → if status verified → downloadGroupPaymentReceipt(groupRow)
  // else downloadPaymentReceipt(row)
}
```

Map group API `data` into the admin-report-like shape expected by `buildGroupPaymentReceiptPayload` (normalize `parts` amounts). If group payload from API differs, add a thin `normalizeGroupRowForReceipt(apiData)` in `payment-receipt.ts`.

- [ ] **Step 2: Expand Payment History list fields**

In `payment-history/page.tsx` `useUserPaymentsList`, ensure expand includes whatever is needed (`course`, and if supported `payment_method`). Amounts come from `__all__`. Add Receipt column using `PaymentHistoryReceiptCell`.

Only show for `UserPaymentStatus.verified`.

- [ ] **Step 3: Manual check**

As a student user: verified standalone → PDF; verified grouped payment → combined PDF after group fetch; pending → no button.

- [ ] **Step 4: Checkpoint**

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| No snapshot columns | Global constraint |
| Expose amounts + discount on admin-report | 1–2 |
| Prefetch enrollment discount | 2 |
| Payment history / serializer `discount_label` | 3 |
| Paid amount priority | 4 |
| Contiguous month range | 4 |
| Discount + invoiced conditional lines | 4–5 |
| Centered logo + org name | 5 |
| Group combined receipt + filename | 4–6 |
| Glide grid group download | 6 |
| ResourceTable download | 7 |
| Payment History download | 8 |
| Verified-only / permissions | 6–8 |
| Out of scope (server PDF, email, bulk, screenshot embed) | Not planned |

## Self-review notes

- `PaymentReceiptPayload` field names are locked in Task 4 (`discountLine`, `amountPaid`, `parts`).
- Payment History group normalization is the highest integration risk; reuse ResourceTable’s `user-payment-groups/${id}` response handling where possible.
- Existing vitest case for two covered months must be updated when contiguous formatting lands (Task 4).
