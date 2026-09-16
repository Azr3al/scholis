# Student Payments ResourceTable Remarks Column — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable **Remarks** column to the original student-payments ResourceTable, mirroring Description, including on rows with no screenshot.

**Architecture:** Reuse `PaymentEditableFieldCell` and shared `payment-row-utils` (already support `remarks`). Extend column layout meta, stub draft + stub create FormData wiring, and prose input classnames. No backend changes.

**Tech Stack:** Next.js App Router, React, ResourceTable, TanStack Query, Vitest (`npm run test:unit`), existing `updateEntity` / `buildSyntheticPaymentStubFormData`.

**Spec:** `docs/superpowers/specs/2026-07-23-student-payments-remarks-column-design.md`

## Global Constraints

- Surface: original ResourceTable only (not Glide, not drawer, not upload form).
- UI label: **Remarks** (field `remarks`); do not rename to “Notes”.
- Placement: immediately after **Description**, before **Created By**.
- Editing must not be gated on screenshot presence (helpers already enforce this).
- High-value tests only — no “column renders” smoke.
- All FE commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/student-payments-resource-column-meta.ts` | Modify | Add `remarks` layout meta after `description` |
| `src/lib/finances/student-payments-resource-column-meta.test.ts` | Modify | Assert `remarks` follows `description` |
| `src/lib/finances/student-payments-filter-ui.ts` | Modify | Allow `remarks` in prose input classname helper |
| `src/lib/finances/student-payments-filter-ui.test.ts` | Modify | Assert remarks uses description-width class |
| `src/lib/finances/synthetic-payment-stub.test.ts` | Modify | Assert FormData includes `remarks` when provided |
| `src/components/finances/student-payments-resource-table.tsx` | Modify | Column, StubDraft, stub create, search haystack, cell input class |

No changes expected to `payment-row-utils.ts` or `synthetic-payment-stub.ts` (already support `remarks`).

---

### Task 1: Column layout meta includes Remarks after Description

**Files:**
- Modify: `src/lib/finances/student-payments-resource-column-meta.ts`
- Modify: `src/lib/finances/student-payments-resource-column-meta.test.ts`

**Interfaces:**
- Consumes: `studentPaymentsResourceColumnLayout(opts)` → `ColumnLayoutMeta[]`
- Produces: layout entry `{ id: "remarks", contentRole: "prose", ... }` immediately after `description`

- [ ] **Step 1: Write the failing test**

Add to `student-payments-resource-column-meta.test.ts`:

```ts
it("places remarks immediately after description", () => {
  const layout = studentPaymentsResourceColumnLayout({
    hideCourseColumn: false,
    userUploadStrategy: false,
    canVerify: true,
  });
  const descIdx = layout.findIndex((c) => c.id === "description");
  const remarksIdx = layout.findIndex((c) => c.id === "remarks");
  expect(descIdx).toBeGreaterThanOrEqual(0);
  expect(remarksIdx).toBe(descIdx + 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/lib/finances/student-payments-resource-column-meta.test.ts
```

Expected: FAIL — `remarksIdx` is `-1` (no `remarks` id).

- [ ] **Step 3: Implement column meta**

In `student-payments-resource-column-meta.ts`, after the `description` entry and before `created_by`, insert:

```ts
{
  id: "remarks",
  contentRole: "prose",
  minWidth: STUDENT_PAYMENT_DESC_COL_MIN,
  preferredWidth: "22rem",
  align: "left",
  truncate: false,
},
```

Reuse `STUDENT_PAYMENT_DESC_COL_MIN` (same family as Description). Do not introduce a separate constant unless needed for clarity.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/lib/finances/student-payments-resource-column-meta.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/lib/finances/student-payments-resource-column-meta.ts \
  src/lib/finances/student-payments-resource-column-meta.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): add Remarks column meta to student payments ResourceTable

EOF
)"
```

---

### Task 2: Prose input classname accepts Remarks

**Files:**
- Modify: `src/lib/finances/student-payments-filter-ui.ts`
- Modify: `src/lib/finances/student-payments-filter-ui.test.ts`

**Interfaces:**
- Consumes: `paymentEditableFieldInputClassName(field)`
- Produces: `EditablePaymentFieldName` includes `"remarks"`; remarks gets same `min-w-[20rem]` as description

- [ ] **Step 1: Write the failing test**

In `student-payments-filter-ui.test.ts`, inside `describe("paymentEditableFieldInputClassName", …)`, add:

```ts
it("uses description width for remarks", () => {
  expect(paymentEditableFieldInputClassName("remarks")).toContain(
    "min-w-[20rem]",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/lib/finances/student-payments-filter-ui.test.ts
```

Expected: FAIL — TypeScript/type or runtime reject of `"remarks"`.

- [ ] **Step 3: Implement**

In `student-payments-filter-ui.ts`, change:

```ts
type EditablePaymentFieldName = "transaction_id" | "description";
```

to:

```ts
type EditablePaymentFieldName = "transaction_id" | "description" | "remarks";
```

Keep the existing min-width branch: `transaction_id` → `min-w-[18rem]`; otherwise (description **or** remarks) → `min-w-[20rem]`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/lib/finances/student-payments-filter-ui.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/lib/finances/student-payments-filter-ui.ts \
  src/lib/finances/student-payments-filter-ui.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): support remarks in payment editable field input classes

EOF
)"
```

---

### Task 3: Stub FormData coverage for remarks

**Files:**
- Modify: `src/lib/finances/synthetic-payment-stub.test.ts`
- No production change required (`buildSyntheticPaymentStubFormData` already appends `remarks`)

**Interfaces:**
- Consumes: `buildSyntheticPaymentStubFormData({ remarks?: string, ... })`
- Produces: `FormData` with `remarks` when non-empty trimmed string

- [ ] **Step 1: Extend the existing FormData test**

In `synthetic-payment-stub.test.ts`, in the test `"builds scan-transaction-screenshots body without screenshot"`, pass `remarks: "vip note"` and assert:

```ts
expect(fd.get("remarks")).toBe("vip note");
```

Full updated call + assertions (replace the existing test body args/expects for description/remarks):

```ts
const fd = buildSyntheticPaymentStubFormData({
  userId: 10,
  courseId: 20,
  createdById: 99,
  issuedAtIso: issuedStart.toISOString(),
  billingStartIso: issuedStart.toISOString(),
  billingEndIso: issuedEnd.toISOString(),
  parsedAmount: "15000",
  paymentMethodId: "3",
  transactionId: "TXN",
  description: "note",
  remarks: "vip note",
  dateOnScreenshot: "",
});
expect(fd.get("user")).toBe("10");
expect(fd.get("course")).toBe("20");
expect(fd.get("created_by")).toBe("99");
expect(fd.get("parsed_amount")).toBe("15000");
expect(fd.get("payment_method")).toBe("3");
expect(fd.get("transaction_id")).toBe("TXN");
expect(fd.get("description")).toBe("note");
expect(fd.get("remarks")).toBe("vip note");
expect(fd.get("screenshot")).toBeNull();
expect(fd.get("date_on_screenshot")).toBeNull();
```

- [ ] **Step 2: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/lib/finances/synthetic-payment-stub.test.ts
```

Expected: PASS (production helper already implements this). If FAIL, fix `synthetic-payment-stub.ts` to append `remarks` when trimmed non-empty — matching `description`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/finances/synthetic-payment-stub.test.ts
git commit -m "$(cat <<'EOF'
test(finances): cover remarks on synthetic payment stub FormData

EOF
)"
```

---

### Task 4: Wire Remarks column + stub draft in ResourceTable

**Files:**
- Modify: `src/components/finances/student-payments-resource-table.tsx`

**Interfaces:**
- Consumes: `PaymentEditableField` helpers (`isPaymentFieldEditable`, `paymentFieldDisplayValue`, `paymentFieldApiPayload`), `buildSyntheticPaymentStubFormData({ remarks })`, `paymentEditableFieldInputClassName("remarks" | "description" | "transaction_id")`, column layout from Task 1
- Produces: editable Remarks column; `StubDraft.remarks` persisted on stub create

- [ ] **Step 1: Extend local types and stub draft**

Update:

```ts
type EditablePaymentField =
  | "transaction_id"
  | "description"
  | "remarks"
  | "parsed_amount"
  | "date_on_screenshot";

type StubDraft = {
  parsedAmount: string;
  paymentMethodId: string;
  transactionId: string;
  description: string;
  remarks: string;
  dateOnScreenshot: string;
};
```

In `emptyStubDraft`:

```ts
function emptyStubDraft(row: StudentPaymentAdminReportRow): StubDraft {
  return {
    parsedAmount: paymentFieldDisplayValue(row, "parsed_amount"),
    paymentMethodId:
      row.payment_method?.id != null ? String(row.payment_method.id) : "",
    transactionId: row.transaction_id ?? "",
    description: row.description ?? "",
    remarks: row.remarks ?? "",
    dateOnScreenshot: row.date_on_screenshot ?? "",
  };
}
```

- [ ] **Step 2: Fix CellAutosaveInput classname mapping**

In `PaymentEditableFieldCell`, replace the ternary that only maps description vs transaction_id with:

```ts
inputClassName={
  isAmount
    ? "h-8 min-w-[7rem] w-full text-left text-sm tabular-nums"
    : paymentEditableFieldInputClassName(
        field === "transaction_id"
          ? "transaction_id"
          : field === "remarks"
            ? "remarks"
            : "description",
      )
}
```

(`date_on_screenshot` keeps description-width prose class, same as today.)

- [ ] **Step 3: Include remarks in local search haystack**

In the `filteredRows` memo haystack array, add `row.remarks`:

```ts
const haystack = [
  row.user?.name,
  row.course?.title,
  row.transaction_id,
  row.description,
  row.remarks,
]
  .filter(Boolean)
  .join(" ")
  .toLowerCase();
```

- [ ] **Step 4: Pass remarks on stub create**

In `tryCreateStub`, pass `remarks: draft.remarks` into `buildSyntheticPaymentStubFormData`:

```ts
const fd = buildSyntheticPaymentStubFormData({
  userId: Number(userId),
  courseId: Number(courseId),
  createdById: user?.id,
  issuedAtIso: bounds.start.toISOString(),
  billingStartIso: bounds.start.toISOString(),
  billingEndIso: bounds.end.toISOString(),
  parsedAmount: draft.parsedAmount,
  paymentMethodId: draft.paymentMethodId,
  transactionId: draft.transactionId,
  description: draft.description,
  remarks: draft.remarks,
  dateOnScreenshot: draft.dateOnScreenshot,
});
```

- [ ] **Step 5: Add the Remarks column**

Immediately after the `description` column definition and before `created_by`, insert:

```ts
{
  id: "remarks",
  header: "Remarks",
  accessor: (row) => row.remarks ?? "",
  enableSorting: false,
  cell: ({ row }) => {
    const isSynthetic = isSyntheticPaymentRow(row);
    const draft = stubDrafts[String(row.id)];
    return (
      <PaymentEditableFieldCell
        row={row}
        field="remarks"
        tableUid={tableUid}
        currencySymbol={currencySymbol}
        displayOverride={isSynthetic ? draft?.remarks : undefined}
        onSyntheticChange={
          isSynthetic
            ? (next) => updateStubField(row, "remarks", next)
            : undefined
        }
      />
    );
  },
},
```

Do **not** gate this cell on screenshot URL. Rely on `isPaymentFieldEditable(row, "remarks")` inside `PaymentEditableFieldCell` (group parents → **—**).

- [ ] **Step 6: Typecheck / unit regression**

Run:

```bash
npm run test:unit -- \
  src/lib/finances/student-payments-resource-column-meta.test.ts \
  src/lib/finances/student-payments-filter-ui.test.ts \
  src/lib/finances/synthetic-payment-stub.test.ts
```

Expected: PASS

Manual smoke (original table view, not Glide):

1. Existing payment with screenshot — edit Remarks; value persists after soft refetch.  
2. Existing payment **without** screenshot — Remarks still editable; save works.  
3. Synthetic unpaid row — type Remarks before screenshot; after amount + method create stub, remarks present on the new payment.  
4. Group parent — Remarks shows **—**; expanded part is editable.

- [ ] **Step 7: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
feat(finances): add editable Remarks column to student payments ResourceTable

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Remarks column after Description | Task 1 + Task 4 Step 5 |
| Editable regardless of screenshot | Task 4 (no screenshot gate; uses existing helpers) |
| Stub draft + stub create includes remarks | Task 3 + Task 4 Steps 1 & 4 |
| Group parents show — | Task 4 (via `isPaymentFieldEditable`) |
| No BE / Glide / drawer / upload changes | All tasks FE ResourceTable path only |
| High-value tests only | Tasks 1–3 |

No TBD/placeholder steps. Types (`StubDraft.remarks`, field `"remarks"`) consistent across tasks.
