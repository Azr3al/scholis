# Student Payments Original Table Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the original (ResourceTable) student-payments report and upload form so multi-part rows expand inline, per-part description/remarks work, delete/payment-method/no-screenshot editing work again, columns are wider/left-aligned, and the screenshot preview stays sticky while the table scrolls.

**Architecture:** Pure helpers own expand-flatten, stub-create gating, and missing-screenshot detection. `StudentPaymentsResourceTable` renders flattened rows with leaf chrome (edit, select, delete, warning). Upload moves description/remarks onto each part and FormData already supports per-part fields on the BE. Shell CSS keeps the preview column sticky beside the scrolling table. Glide view is out of scope.

**Tech Stack:** Next.js App Router, React, ResourceTable, TanStack Query, Vitest (`npm run test:unit`), existing `updateEntity` / `makePostRequest` / `ConfirmationDialog`.

**Spec:** `docs/superpowers/specs/2026-07-11-student-payments-original-table-fixes-design.md`

All FE commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/data-sheets/payment-row-utils.ts` | Modify | Synthetic editability; missing-screenshot helper |
| `src/lib/data-sheets/payment-row-utils.test.ts` | Modify | Update + add tests for above |
| `src/lib/finances/flatten-payment-report-rows.ts` | Create | Expand/collapse flatten of group → part rows |
| `src/lib/finances/flatten-payment-report-rows.test.ts` | Create | Flatten unit tests |
| `src/lib/finances/synthetic-payment-stub.ts` | Create | Stub gate + FormData builder for inline create |
| `src/lib/finances/synthetic-payment-stub.test.ts` | Create | Gate + FormData tests |
| `src/lib/finances/payment-group-utils.ts` | Modify | Append per-part `description` / `remarks` |
| `src/lib/finances/payment-group-utils.test.ts` | Modify | Assert new FormData keys |
| `src/lib/finances/student-payments-filter-ui.ts` | Modify | Wider input min-widths; student column class helper |
| `src/lib/finances/student-payments-filter-ui.test.ts` | Modify | Assert new floors |
| `src/app/(internal)/finances/student-payments/upload/page.tsx` | Modify | Description/remarks on each part; drop form-level fields |
| `src/components/finances/student-payments-resource-table.tsx` | Modify | Expand, delete, method select, stub create, warning, widths |
| `src/components/finances/student-payments-report-shell.tsx` | Modify | Sticky preview column while table scrolls |

---

### Task 1: Allow synthetic field edits + missing-screenshot helper

**Files:**
- Modify: `src/lib/data-sheets/payment-row-utils.ts`
- Modify: `src/lib/data-sheets/payment-row-utils.test.ts`

- [ ] **Step 1: Update failing expectations and add warning helper tests**

In `payment-row-utils.test.ts`, replace the synthetic-blocks-edits case and add:

```ts
it("allows edits on synthetic unpaid placeholder rows", () => {
  const synthetic = { ...baseRow, id: "24184new" };
  expect(isPaymentFieldEditable(synthetic, "transaction_id")).toBe(true);
  expect(isPaymentFieldEditable(synthetic, "description")).toBe(true);
  expect(isPaymentFieldEditable(synthetic, "parsed_amount")).toBe(true);
});

it("still blocks edits on dropped synthetic rows", () => {
  const dropped = { ...baseRow, id: "24184new", is_removed: true };
  expect(isPaymentFieldEditable(dropped, "transaction_id")).toBe(false);
});

describe("paymentRowMissingScreenshot", () => {
  it("is true for synthetic rows", () => {
    expect(paymentRowMissingScreenshot({ ...baseRow, id: "new-1" })).toBe(true);
  });

  it("is true for leaf payments without screenshot", () => {
    expect(
      paymentRowMissingScreenshot({ ...baseRow, screenshot: null }),
    ).toBe(true);
  });

  it("is false for leaf with screenshot", () => {
    expect(
      paymentRowMissingScreenshot({
        ...baseRow,
        screenshot: "https://cdn/x.png",
      }),
    ).toBe(false);
  });

  it("is false for group parents", () => {
    expect(
      paymentRowMissingScreenshot({ ...baseRow, kind: "group", id: "group-1" }),
    ).toBe(false);
  });
});
```

Import `paymentRowMissingScreenshot` from `./payment-row-utils`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/data-sheets/payment-row-utils.test.ts`

Expected: FAIL on new expectations / missing export

- [ ] **Step 3: Implement**

In `payment-row-utils.ts`:

1. Change `isPaymentFieldEditable` so synthetic rows are editable unless exempt/dropped — remove the early `if (isSyntheticPaymentRow(row)) return false;` (keep exempt check).

2. Add:

```ts
export function paymentRowMissingScreenshot(
  row: StudentPaymentAdminReportRow,
): boolean {
  if (isGroupPaymentRow(row)) return false;
  if (isSyntheticPaymentRow(row)) return true;
  return !getPaymentScreenshotUrl(row);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test:unit -- src/lib/data-sheets/payment-row-utils.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/data-sheets/payment-row-utils.ts src/lib/data-sheets/payment-row-utils.test.ts
git commit -m "$(cat <<'EOF'
fix(finances): allow synthetic payment row edits and screenshot warning helper

EOF
)"
```

---

### Task 2: Flatten expanded group rows

**Files:**
- Create: `src/lib/finances/flatten-payment-report-rows.ts`
- Create: `src/lib/finances/flatten-payment-report-rows.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/finances/flatten-payment-report-rows.test.ts
import { describe, expect, it } from "vitest";
import { UserPaymentStatus } from "@/types/finance";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import {
  flattenPaymentReportRows,
  type FlattenedPaymentRow,
} from "./flatten-payment-report-rows";

const part = (
  id: number,
  overrides: Partial<StudentPaymentAdminReportRow> = {},
): StudentPaymentAdminReportRow => ({
  id,
  status: UserPaymentStatus.pending_verification,
  parsed_amount: "100",
  ...overrides,
});

describe("flattenPaymentReportRows", () => {
  it("passes through non-group rows", () => {
    const rows = [part(1)];
    const out = flattenPaymentReportRows(rows, new Set());
    expect(out).toEqual([
      { kind: "standalone", row: rows[0], parentGroupId: null, partIndex: null },
    ]);
  });

  it("keeps group collapsed when not expanded", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-9",
      kind: "group",
      group_id: 9,
      status: UserPaymentStatus.pending_verification,
      parts: [part(11), part(12)],
    };
    const out = flattenPaymentReportRows([group], new Set());
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("group_parent");
  });

  it("injects parts after parent when expanded", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-9",
      kind: "group",
      group_id: 9,
      status: UserPaymentStatus.pending_verification,
      parts: [part(11), part(12)],
    };
    const out = flattenPaymentReportRows([group], new Set([9]));
    expect(out.map((r: FlattenedPaymentRow) => r.kind)).toEqual([
      "group_parent",
      "group_part",
      "group_part",
    ]);
    expect(out[1]?.row.id).toBe(11);
    expect(out[1]?.partIndex).toBe(0);
    expect(out[1]?.parentGroupId).toBe(9);
    expect(out[2]?.row.id).toBe(12);
    expect(out[2]?.partIndex).toBe(1);
  });

  it("uses group_id from id prefix when group_id missing", () => {
    const group: StudentPaymentAdminReportRow = {
      id: "group-42",
      kind: "group",
      status: UserPaymentStatus.pending_verification,
      parts: [part(1)],
    };
    const out = flattenPaymentReportRows([group], new Set([42]));
    expect(out).toHaveLength(2);
    expect(out[1]?.parentGroupId).toBe(42);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `npm run test:unit -- src/lib/finances/flatten-payment-report-rows.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/finances/flatten-payment-report-rows.ts
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { isGroupPaymentRow } from "@/lib/data-sheets/payment-row-utils";

export type FlattenedPaymentRow = {
  kind: "standalone" | "group_parent" | "group_part";
  row: StudentPaymentAdminReportRow;
  parentGroupId: number | null;
  partIndex: number | null;
};

export function resolveGroupId(row: StudentPaymentAdminReportRow): number | null {
  if (row.group_id != null) return Number(row.group_id);
  const m = String(row.id).match(/^group-(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function flattenPaymentReportRows(
  rows: StudentPaymentAdminReportRow[],
  expandedGroupIds: ReadonlySet<number>,
): FlattenedPaymentRow[] {
  const out: FlattenedPaymentRow[] = [];
  for (const row of rows) {
    if (!isGroupPaymentRow(row)) {
      out.push({
        kind: "standalone",
        row,
        parentGroupId: null,
        partIndex: null,
      });
      continue;
    }
    const gid = resolveGroupId(row);
    out.push({
      kind: "group_parent",
      row,
      parentGroupId: gid,
      partIndex: null,
    });
    if (gid == null || !expandedGroupIds.has(gid)) continue;
    const parts = row.parts ?? [];
    parts.forEach((part, index) => {
      out.push({
        kind: "group_part",
        row: part,
        parentGroupId: gid,
        partIndex: index,
      });
    });
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm run test:unit -- src/lib/finances/flatten-payment-report-rows.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/flatten-payment-report-rows.ts src/lib/finances/flatten-payment-report-rows.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): flatten expanded multi-part payment report rows

EOF
)"
```

---

### Task 3: Synthetic stub create gate + FormData

**Files:**
- Create: `src/lib/finances/synthetic-payment-stub.ts`
- Create: `src/lib/finances/synthetic-payment-stub.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/finances/synthetic-payment-stub.test.ts
import { describe, expect, it } from "vitest";
import {
  canCreateSyntheticPaymentStub,
  buildSyntheticPaymentStubFormData,
} from "./synthetic-payment-stub";

describe("canCreateSyntheticPaymentStub", () => {
  it("requires both amount and payment method", () => {
    expect(
      canCreateSyntheticPaymentStub({ parsedAmount: "", paymentMethodId: "1" }),
    ).toBe(false);
    expect(
      canCreateSyntheticPaymentStub({
        parsedAmount: "1000",
        paymentMethodId: "",
      }),
    ).toBe(false);
    expect(
      canCreateSyntheticPaymentStub({
        parsedAmount: "1000",
        paymentMethodId: "3",
      }),
    ).toBe(true);
  });

  it("rejects non-positive amounts", () => {
    expect(
      canCreateSyntheticPaymentStub({
        parsedAmount: "0",
        paymentMethodId: "3",
      }),
    ).toBe(false);
    expect(
      canCreateSyntheticPaymentStub({
        parsedAmount: "-5",
        paymentMethodId: "3",
      }),
    ).toBe(false);
  });
});

describe("buildSyntheticPaymentStubFormData", () => {
  it("builds scan-transaction-screenshots body without screenshot", () => {
    const issuedStart = new Date("2026-07-01T00:00:00.000Z");
    const issuedEnd = new Date("2026-07-31T23:59:59.999Z");
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
      dateOnScreenshot: "",
    });
    expect(fd.get("user")).toBe("10");
    expect(fd.get("course")).toBe("20");
    expect(fd.get("created_by")).toBe("99");
    expect(fd.get("parsed_amount")).toBe("15000");
    expect(fd.get("payment_method")).toBe("3");
    expect(fd.get("transaction_id")).toBe("TXN");
    expect(fd.get("description")).toBe("note");
    expect(fd.get("screenshot")).toBeNull();
    expect(fd.get("date_on_screenshot")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:unit -- src/lib/finances/synthetic-payment-stub.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/finances/synthetic-payment-stub.ts
export function canCreateSyntheticPaymentStub(args: {
  parsedAmount: string;
  paymentMethodId: string;
}): boolean {
  const amount = Number.parseFloat(args.parsedAmount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (!args.paymentMethodId.trim()) return false;
  return true;
}

export function buildSyntheticPaymentStubFormData(args: {
  userId: number;
  courseId: number;
  createdById?: number;
  issuedAtIso: string;
  billingStartIso: string;
  billingEndIso: string;
  parsedAmount: string;
  paymentMethodId: string;
  transactionId?: string;
  description?: string;
  remarks?: string;
  dateOnScreenshot?: string;
}): FormData {
  const fd = new FormData();
  fd.append("user", String(args.userId));
  fd.append("course", String(args.courseId));
  fd.append("issued_at", args.issuedAtIso);
  fd.append("billing_start_date", args.billingStartIso);
  fd.append("billing_end_date", args.billingEndIso);
  fd.append("parsed_amount", args.parsedAmount);
  fd.append("payment_method", args.paymentMethodId);
  if (args.createdById != null) fd.append("created_by", String(args.createdById));
  if (args.transactionId?.trim())
    fd.append("transaction_id", args.transactionId.trim());
  if (args.description?.trim()) fd.append("description", args.description.trim());
  if (args.remarks?.trim()) fd.append("remarks", args.remarks.trim());
  if (args.dateOnScreenshot?.trim())
    fd.append("date_on_screenshot", args.dateOnScreenshot.trim());
  return fd;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm run test:unit -- src/lib/finances/synthetic-payment-stub.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/synthetic-payment-stub.ts src/lib/finances/synthetic-payment-stub.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): synthetic payment stub create gate and FormData

EOF
)"
```

---

### Task 4: Per-part description/remarks on upload FormData

**Files:**
- Modify: `src/lib/finances/payment-group-utils.ts`
- Modify: `src/lib/finances/payment-group-utils.test.ts`

- [ ] **Step 1: Extend tests**

Update `buildMultiPartPaymentFormData` parts type usage in tests:

```ts
it("includes per-part description and remarks for multi-part", () => {
  const fd = buildMultiPartPaymentFormData({
    userId: 1,
    courseId: 2,
    planFields: {},
    parts: [
      {
        file: file1,
        parsedAmount: "10",
        paymentMethodId: "1",
        description: "a",
        remarks: "r1",
      },
      {
        file: file2,
        parsedAmount: "20",
        paymentMethodId: "2",
        description: "b",
        remarks: "r2",
      },
    ],
  });
  expect(fd.get("part_0_description")).toBe("a");
  expect(fd.get("part_0_remarks")).toBe("r1");
  expect(fd.get("part_1_description")).toBe("b");
  expect(fd.get("part_1_remarks")).toBe("r2");
});

it("includes description/remarks on single-part body", () => {
  const fd = buildMultiPartPaymentFormData({
    userId: 1,
    courseId: 2,
    planFields: {},
    parts: [
      {
        file: file1,
        parsedAmount: "10",
        paymentMethodId: "1",
        description: "solo",
        remarks: "note",
      },
    ],
  });
  expect(fd.get("description")).toBe("solo");
  expect(fd.get("remarks")).toBe("note");
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:unit -- src/lib/finances/payment-group-utils.test.ts`

- [ ] **Step 3: Implement**

Extend `parts` array element type with optional `description?: string; remarks?: string;` and append:

- Single part: `if (p.description) fd.append("description", p.description);` (same for remarks)
- Multi: `if (p.description) fd.append(\`part_${i}_description\`, p.description);` (same for remarks)

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/payment-group-utils.ts src/lib/finances/payment-group-utils.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): send description and remarks per upload part

EOF
)"
```

---

### Task 5: Upload form — description/remarks inside each part

**Files:**
- Modify: `src/app/(internal)/finances/student-payments/upload/page.tsx`

- [ ] **Step 1: Extend `UploadPart` and `createUploadPart`**

```ts
type UploadPart = {
  // ...existing fields
  description: string;
  remarks: string;
};

function createUploadPart(paymentMethodId = ""): UploadPart {
  // ...
  return {
    // ...existing
    description: "",
    remarks: "",
  };
}
```

Remove `description` / `remarks` from `UploadFormValues` (or leave form without those Controllers). Prefer dropping them from the zod/default values and removing the two `Controller` blocks after “Add another screenshot”.

- [ ] **Step 2: Add fields inside each part block** (after date-on-screenshot, still inside the part bordered container):

```tsx
<Field.Root className="w-full" name={`description-${part.key}`}>
  <Field.Label>Description</Field.Label>
  <Input
    placeholder="Optional"
    value={part.description}
    disabled={isSaving}
    onChange={(e) => updatePart(part.key, "description", e.target.value)}
  />
  <div className="min-h-5" />
</Field.Root>
<Field.Root className="w-full" name={`remarks-${part.key}`}>
  <Field.Label>Remarks</Field.Label>
  <Input
    placeholder="Optional"
    value={part.remarks}
    disabled={isSaving}
    onChange={(e) => updatePart(part.key, "remarks", e.target.value)}
  />
  <div className="min-h-5" />
</Field.Root>
```

- [ ] **Step 3: Wire submit**

In `submitParts` mapping, add:

```ts
description: part.description.trim() || undefined,
remarks: part.remarks.trim() || undefined,
```

Remove `planFields.description` / `planFields.remarks` assignment from form values.

If the page still uses `react-hook-form` only for those two fields, simplify to drop `FormProvider` for them or keep RHF only if still needed for other plan fields — do **not** leave orphan Controllers.

- [ ] **Step 4: Manual smoke** (or unit if you extract mapping): open upload with 2 parts, fill different description/remarks, confirm network FormData has `part_0_description` etc. (devtools).

- [ ] **Step 5: Commit**

```bash
git add src/app/(internal)/finances/student-payments/upload/page.tsx
git commit -m "$(cat <<'EOF'
feat(finances): attach description and remarks to each upload screenshot

EOF
)"
```

---

### Task 6: ResourceTable — expand groups + row ids

**Files:**
- Modify: `src/components/finances/student-payments-resource-table.tsx`

- [ ] **Step 1: Add expand state and flatten before paging**

```ts
import {
  flattenPaymentReportRows,
  resolveGroupId,
} from "@/lib/finances/flatten-payment-report-rows";
import { NavArrowDown, NavArrowRight } from "iconoir-react";

const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(
  () => new Set(),
);

const toggleGroup = (groupId: number) => {
  setExpandedGroupIds((prev) => {
    const next = new Set(prev);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    return next;
  });
};

// After filteredRows:
const flattened = useMemo(
  () => flattenPaymentReportRows(filteredRows, expandedGroupIds),
  [filteredRows, expandedGroupIds],
);

// page over flattened, not filteredRows
const pageFlat = useMemo(() => {
  const start = (tableState.page - 1) * tableState.pageSize;
  return flattened.slice(start, start + tableState.pageSize);
}, [flattened, tableState.page, tableState.pageSize]);

const list = useMemo(
  () => ({
    rows: pageFlat.map((f) => f.row),
    total: flattened.length,
    // ...
  }),
  [pageFlat, flattened.length, /* ... */],
);
```

Keep a `Map` from row identity → flatten meta for the current page:

```ts
const flatMetaByRowKey = useMemo(() => {
  const m = new Map<string, (typeof pageFlat)[number]>();
  for (const f of pageFlat) {
    m.set(`${f.kind}:${String(f.row.id)}:${f.partIndex ?? ""}`, f);
  }
  return m;
}, [pageFlat]);
```

Use `getRowId` that is unique for parts:

```ts
getRowId={(row) => {
  // Prefer looking up via a WeakMap built while mapping pageFlat —
  // simplest: encode while mapping list.rows as wrappers.
}}
```

**Preferred approach:** change `list.rows` to carry flatten meta by mapping to the same `StudentPaymentAdminReportRow` objects but set `getRowId` from `pageFlat`:

```ts
getRowId={(_, index) => {
  const f = pageFlat[index]!;
  if (f.kind === "group_part")
    return `part-${f.parentGroupId}-${f.row.id}`;
  return String(f.row.id);
}}
```

If `ResourceTable`’s `getRowId` is `(row) => string` only, wrap:

```ts
type RowWithFlatMeta = StudentPaymentAdminReportRow & {
  __flatKind?: FlattenedPaymentRow["kind"];
  __parentGroupId?: number | null;
  __partIndex?: number | null;
};

const pageRows: RowWithFlatMeta[] = pageFlat.map((f) => ({
  ...f.row,
  __flatKind: f.kind,
  __parentGroupId: f.parentGroupId,
  __partIndex: f.partIndex,
}));

getRowId={(row) =>
  row.__flatKind === "group_part"
    ? `part-${row.__parentGroupId}-${row.id}`
    : String(row.id)
}
```

- [ ] **Step 2: Student cell — chevron + part label**

For `group_parent`: button toggles `resolveGroupId(row)`; show ▸/▾.  
For `group_part`: render `Part ${(row.__partIndex ?? 0) + 1}` (muted), no student link.  
For standalone/synthetic: existing student link.  
Add `className="text-left"` / `items-start` on wrapping cells.

If `parts` is empty on expand: call `GET user-payment-groups/<id>` via existing client (`makeGetRequest` / entity get — check SDK; fallback `makeGetRequest(\`user-payment-groups/${id}\`)`), merge `parts` into local override map keyed by group id, toast on error.

- [ ] **Step 3: Group parent cells stay non-editable**

Existing `isGroupPaymentRow` / `PaymentEditableFieldCell` already blocks group parents. Ensure `__flatKind === "group_part"` uses leaf rules (part rows are normal payment ids — `isGroupPaymentRow` false).

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
feat(finances): inline expand multi-part rows on original payments table

EOF
)"
```

---

### Task 7: Delete button + no-screenshot warning

**Files:**
- Modify: `src/components/finances/student-payments-resource-table.tsx`

- [ ] **Step 1: Warning in Status cell**

Import `paymentRowMissingScreenshot`. In status column cell, after the status control / Upload button:

```tsx
{paymentRowMissingScreenshot(row) && row.__flatKind !== "group_parent" ? (
  <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
    No screenshot uploaded
  </p>
) : null}
```

(Also acceptable under Actions — spec says Status/Actions area; prefer Status column as above.)

- [ ] **Step 2: Delete on leaf rows only**

In `_actions` cell, when `canVerify && !isSyntheticPaymentRow(row) && row.__flatKind !== "group_parent"`:

```tsx
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { Trash } from "iconoir-react";
import { deleteEntity } from "@/app/client-api/utils";

// inside cell — use a small inner component PaymentRowDeleteButton
<ConfirmationDialog
  isLoading={isDeleting}
  content="This action cannot be undone"
  onConfirm={() => deleteMutation.mutate()}
>
  <Button
    aria-label="Delete payment"
    size="sm"
    variant="danger"
    className="h-8 w-full justify-center"
    disabled={isDeleting}
  >
    <Trash className="size-3.5" />
  </Button>
</ConfirmationDialog>
```

On success: toast + `softRefetchStudentPaymentsReport(queryClient, { tableUid })` (and clear expand if needed). Do **not** mount delete on group parents or synthetics.

Extract `PaymentRowDeleteButton({ userPaymentId, tableUid })` in the same file to keep hooks valid.

- [ ] **Step 3: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
feat(finances): restore payment row delete and no-screenshot warning

EOF
)"
```

---

### Task 8: Inline payment method, amount edit, stub create

**Files:**
- Modify: `src/components/finances/student-payments-resource-table.tsx`

- [ ] **Step 1: Load payment methods** (same query as Glide)

```ts
const paymentMethodsListQuery = useGetAllEntitiesQuery("payment-methods", {
  // mirror student-payments-grid: enabled when !userUploadStrategy && canRecord/canVerify
});
const paymentMethodOptions = useMemo(() => {
  const list = paymentMethodsListQuery.data?.data?.data as
    | { id: number; name: string }[]
    | undefined;
  return (list ?? []).map((m) => ({ value: String(m.id), label: m.name }));
}, [paymentMethodsListQuery.data]);
```

- [ ] **Step 2: Payment Account column — Select when editable**

Replace static span when `!isGroupPaymentRow(row) && !isExemptPaymentExpectationRow(row)` and (synthetic allowed or real payment):

```tsx
<Select
  className="w-full min-w-[10rem]"
  items={paymentMethodOptions}
  value={row.payment_method?.id != null ? String(row.payment_method.id) : undefined}
  placeholder="Select"
  disabled={row.status === UserPaymentStatus.verified}
  onValueChange={(v) => { void persistField(row, "payment_method", v); }}
/>
```

Group parent: keep `row.payment_method?.name ?? "—"`.

- [ ] **Step 3: Amount editable when `isPaymentFieldEditable(row, "parsed_amount")`**

Reuse autosave pattern from `PaymentEditableFieldCell` (extend union to include `parsed_amount` | `payment_method` or separate cell).

- [ ] **Step 4: `persistField` for synthetic vs real**

Maintain `localStubDrafts` map: `Record<syntheticId, { parsedAmount, paymentMethodId, transactionId, description, dateOnScreenshot }>`.

On any field change for synthetic:

1. Update draft + optimistic row display.  
2. If `canCreateSyntheticPaymentStub(draft)` → `makePostRequest("scan-transaction-screenshots", buildSyntheticPaymentStubFormData(...), {}, { "Content-Type": "multipart/form-data" })` using `getCalendarMonthUtcFilterBounds(monthDate)` like Glide.  
3. Soft refetch report on success; toast on error and keep draft.

On real payment: `updateEntity("user-payments", row.id, paymentFieldApiPayload(field, value))` + soft refetch (existing path).

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
feat(finances): inline payment method and screenshot-less stub create

EOF
)"
```

---

### Task 9: Wider columns + left-align multi-line

**Files:**
- Modify: `src/lib/finances/student-payments-filter-ui.ts`
- Modify: `src/lib/finances/student-payments-filter-ui.test.ts`
- Modify: `src/components/finances/student-payments-resource-table.tsx`

- [ ] **Step 1: Bump input floors**

```ts
export function paymentEditableFieldInputClassName(
  field: EditablePaymentFieldName,
): string {
  const minW = field === "transaction_id" ? "min-w-[18rem]" : "min-w-[20rem]";
  return `h-8 ${minW} flex-1 text-left text-sm`;
}

export const STUDENT_PAYMENT_RESOURCE_STUDENT_CELL_CLASS =
  "min-w-[12rem] max-w-[18rem] text-left whitespace-normal break-words";
```

Update/add tests asserting the new min-width substrings.

- [ ] **Step 2: Apply student / description cell classes**

Student name button/span: `className={STUDENT_PAYMENT_RESOURCE_STUDENT_CELL_CLASS}`.  
Description / txn inputs already use `paymentEditableFieldInputClassName`.  
Ensure wrappers use `items-start` and `text-left` when content wraps.

- [ ] **Step 3: Run unit tests**

Run: `npm run test:unit -- src/lib/finances/student-payments-filter-ui.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/finances/student-payments-filter-ui.ts src/lib/finances/student-payments-filter-ui.test.ts src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
fix(finances): widen and left-align student payment original table columns

EOF
)"
```

---

### Task 10: Sticky screenshot side panel

**Files:**
- Modify: `src/components/finances/student-payments-report-shell.tsx`
- Modify: `src/components/finances/screenshot-preview-column.tsx` (if className passthrough needed)

- [ ] **Step 1: Layout**

In original-view grid (the `lg:grid-cols-[minmax(0,1fr)_auto]` block), keep table in `overflow-auto`. On the preview column wrapper / `ScreenshotPreviewColumn`, add:

```tsx
className="sticky top-0 self-start h-[min(100%,75dvh)] max-h-[75dvh]"
```

(or pass via existing `className` prop on `ScreenshotPreviewColumn`). Ensure the preview’s parent is **not** inside the table’s scrolling div (already true). If sticky fails because the grid child stretches, set preview column to `self-start` and give the aside `max-h` + internal `overflow-auto` for the image.

- [ ] **Step 2: Manual check**

Original view, expand screenshot pane, scroll the student table: preview remains in view at the top of the content area.

- [ ] **Step 3: Commit**

```bash
git add src/components/finances/student-payments-report-shell.tsx src/components/finances/screenshot-preview-column.tsx
git commit -m "$(cat <<'EOF'
fix(finances): keep screenshot preview sticky while payments table scrolls

EOF
)"
```

---

### Task 11: Verification pass

- [ ] **Step 1: Unit suite for touched modules**

```bash
npm run test:unit -- src/lib/data-sheets/payment-row-utils.test.ts src/lib/finances/flatten-payment-report-rows.test.ts src/lib/finances/synthetic-payment-stub.test.ts src/lib/finances/payment-group-utils.test.ts src/lib/finances/student-payments-filter-ui.test.ts
```

Expected: all PASS

- [ ] **Step 2: Manual checklist (original view only)**

1. Multi-part row expands; part fields editable; parent description/txn show — / N transactions  
2. Upload form: description/remarks per part; submit persists on parts  
3. Delete on leaf; absent on group parent  
4. Scroll table → preview sticky  
5. Synthetic row: set amount + method → stub created; ⚠ “No screenshot uploaded”  
6. Payment method inline select on leaf  
7. Student / description / txn wider and left-aligned when wrapping  

- [ ] **Step 3: If stub create 400s on missing screenshot**

Inspect BE `UserPaymentSerializer` — only then add a focused BE test + allow blank screenshot for single-part `scan-transaction-screenshots` (multipart still required). Prefer confirming Glide’s existing no-file create path already works before changing BE.

- [ ] **Step 4: Final commit only if Step 3 needed; otherwise done**

---

## Spec coverage self-review

| Spec item | Task |
| --- | --- |
| 1 Expand multi-screenshot | 2, 6 |
| 2 Remarks/description per screenshot | 4, 5 |
| 3 Description — on parents / editable parts | 1, 6 |
| 4 Delete on leaf | 7 |
| 5 Sticky preview | 10 |
| 6 Editable without screenshot + stub + warning | 1, 3, 7, 8 |
| 7 Payment method inline | 8 |
| 8 Wider + left-align columns | 9 |
| Original table only | All tasks skip Glide |
| Stub gate amount + method | 3, 8 |

No TBD placeholders. Types (`FlattenedPaymentRow`, stub helpers) are defined in Tasks 2–3 before ResourceTable consumption.
