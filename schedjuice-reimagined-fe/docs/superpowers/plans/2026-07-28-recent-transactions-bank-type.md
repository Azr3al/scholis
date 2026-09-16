# Recent Transactions Bank Type Filter & Column — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-select **Bank** filter and read-only **Bank** column to `/finances/recent-transactions` for non–`user_upload` tenants, using shared filter-param logic across ResourceTable and Glide.

**Architecture:** Extract `buildRecentTxnFilterParams` into `src/lib/finances/`, extend it with optional `paymentBanks` (`payment_method__payment_bank` + `in`). Add a thin `PaymentBankMultiSelectFilter` toolbar wrapper. Wire filter + column into `page.tsx` and `student-payments-grid.tsx`. No backend changes.

**Tech Stack:** Next.js App Router, React, ResourceTable, Glide Data Grid, Vitest (`npm run test:unit`), `PaymentBank` enum from `@/types/finance`, existing `MultiSelectPopOver`.

**Spec:** `docs/superpowers/specs/2026-07-28-recent-transactions-bank-type-design.md`

## Global Constraints

- Filter cardinality: **multi-select**; operator `in` with comma-separated values (e.g. `"CB,KPAY"`).
- Filter + column visibility: **non–`user_upload` tenants only** (`transaction_screenshot_strategy !== user_upload`).
- Column header: **`Bank`**; labels are raw `PaymentBank` enum strings.
- Column placement: after **Payment Account**, before **Date on Screenshot**.
- All banks selected → **omit** `in` param (treat as no filter).
- Empty selection → no bank filter param.
- No URL persistence, no backend changes, no sorting by bank.
- High-value tests only — no render smoke tests.
- All FE commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/build-recent-txn-filter-params.ts` | Create | Shared recent-transactions `filter_params` builder incl. bank `in` |
| `src/lib/finances/build-recent-txn-filter-params.test.ts` | Create | Unit tests for bank filter emission |
| `src/components/finances/payment-bank-multi-select-filter.tsx` | Create | Toolbar multi-select for `PaymentBank` values |
| `src/lib/finances/recent-transactions-column-meta.ts` | Modify | `payment_method__payment_bank` layout meta |
| `src/lib/finances/recent-transactions-column-meta.test.ts` | Modify | Assert bank column follows payment account |
| `src/app/(internal)/finances/recent-transactions/page.tsx` | Modify | Filter state/UI, shared builder, Bank column, fields |
| `src/components/finances/student-payments-grid.tsx` | Modify | Remove local builder; bank filter state/UI, Bank column, fields |

---

### Task 1: Shared `buildRecentTxnFilterParams` with bank filter

**Files:**
- Create: `src/lib/finances/build-recent-txn-filter-params.ts`
- Create: `src/lib/finances/build-recent-txn-filter-params.test.ts`
- Modify: `src/components/finances/student-payments-grid.tsx` (remove local function; import shared)

**Interfaces:**
- Consumes: `accountType`, `operatorEnum`, `PaymentBank`, `UserPaymentStatus`, `TransactionScreenshotStrategy`, `isPaymentMembershipScoped`, `isValidApiEntityIdParam`
- Produces:
  ```ts
  export type BuildRecentTxnFilterParamsOpts = {
    transactionId: string;
    date?: Date;
    courseId: string;
    status?: UserPaymentStatus;
    tenant?: organizationType | null;
    paymentBanks?: PaymentBank[];
  };

  export function buildRecentTxnFilterParams(
    u: accountType,
    opts: BuildRecentTxnFilterParamsOpts,
  ): filterParamsBody;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/finances/build-recent-txn-filter-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRecentTxnFilterParams } from "./build-recent-txn-filter-params";
import { operatorEnum } from "@/types/api";
import { PaymentBank } from "@/types/finance";
import type { accountType } from "@/types/user";

const user = { id: 1 } as accountType;

describe("buildRecentTxnFilterParams", () => {
  it("omits bank filter when paymentBanks is empty", () => {
    const result = buildRecentTxnFilterParams(user, {
      transactionId: "",
      courseId: "",
      paymentBanks: [],
    });
    expect(
      result.filter_params?.some(
        (p) => p.field_name === "payment_method__payment_bank",
      ),
    ).toBe(false);
  });

  it("emits in filter for one or more banks", () => {
    const result = buildRecentTxnFilterParams(user, {
      transactionId: "",
      courseId: "",
      paymentBanks: [PaymentBank.CB, PaymentBank.KPAY],
    });
    expect(result.filter_params).toContainEqual({
      field_name: "payment_method__payment_bank",
      operator: operatorEnum.in,
      value: "CB,KPAY",
    });
  });

  it("omits bank filter when all PaymentBank values are selected", () => {
    const result = buildRecentTxnFilterParams(user, {
      transactionId: "",
      courseId: "",
      paymentBanks: Object.values(PaymentBank),
    });
    expect(
      result.filter_params?.some(
        (p) => p.field_name === "payment_method__payment_bank",
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/finances/build-recent-txn-filter-params.test.ts
```

Expected: FAIL — module `./build-recent-txn-filter-params` not found.

- [ ] **Step 3: Implement shared builder**

Create `src/lib/finances/build-recent-txn-filter-params.ts` by moving the existing `buildRecentTxnFilterParams` function from `student-payments-grid.tsx` (lines ~251–324) and extending opts + bank block:

```ts
import { isPaymentMembershipScoped } from "@/helpers/authorization";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { operatorEnum, type filterParamsBody } from "@/types/api";
import { PaymentBank, type UserPaymentStatus } from "@/types/finance";
import { TransactionScreenshotStrategy, type organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type BuildRecentTxnFilterParamsOpts = {
  transactionId: string;
  date?: Date;
  courseId: string;
  status?: UserPaymentStatus;
  tenant?: organizationType | null;
  paymentBanks?: PaymentBank[];
};

const ALL_PAYMENT_BANKS = Object.values(PaymentBank);

export function buildRecentTxnFilterParams(
  u: accountType,
  opts: BuildRecentTxnFilterParamsOpts,
): filterParamsBody {
  const fParams: filterParamsBody = { filter_params: [] };

  if (isPaymentMembershipScoped(u)) {
    fParams.filter_params?.push({
      field_name: "course__user_courses__user_id",
      operator: operatorEnum.exact,
      value: String(u.id),
    });
  }
  if (opts.courseId && isValidApiEntityIdParam(String(opts.courseId))) {
    fParams.filter_params?.push({
      field_name: "course_id",
      operator: operatorEnum.exact,
      value: String(Math.trunc(Number(opts.courseId))),
    });
  }
  if (opts.transactionId) {
    fParams.filter_params?.push({
      field_name: "transaction_id",
      operator: operatorEnum.contains,
      value: opts.transactionId,
    });
  }
  if (opts.date) {
    let fieldName = "issued_at";
    if (
      opts.tenant?.transaction_screenshot_strategy ===
      TransactionScreenshotStrategy.user_upload
    ) {
      fieldName = "billing_start_date";
    }
    fParams.filter_params?.push({
      field_name: fieldName,
      operator: operatorEnum.gte,
      value: new Date(
        opts.date.getFullYear(),
        opts.date.getMonth(),
        opts.date.getDate(),
        0,
        0,
        0,
      ).toISOString(),
    });
    fParams.filter_params?.push({
      field_name: fieldName,
      operator: operatorEnum.lte,
      value: new Date(
        opts.date.getFullYear(),
        opts.date.getMonth(),
        opts.date.getDate(),
        23,
        59,
        59,
      ).toISOString(),
    });
  }
  if (opts.status) {
    fParams.filter_params?.push({
      field_name: "status",
      operator: operatorEnum.exact,
      value: opts.status,
    });
  }
  const banks = opts.paymentBanks ?? [];
  if (banks.length > 0 && banks.length < ALL_PAYMENT_BANKS.length) {
    fParams.filter_params?.push({
      field_name: "payment_method__payment_bank",
      operator: operatorEnum.in,
      value: banks.join(","),
    });
  }
  return fParams;
}
```

In `student-payments-grid.tsx`:
- Delete the local `buildRecentTxnFilterParams` function.
- Add: `import { buildRecentTxnFilterParams } from "@/lib/finances/build-recent-txn-filter-params";`

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/lib/finances/build-recent-txn-filter-params.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add \
  src/lib/finances/build-recent-txn-filter-params.ts \
  src/lib/finances/build-recent-txn-filter-params.test.ts \
  src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
feat(finances): extract recent-transactions filter builder with bank support

EOF
)"
```

---

### Task 2: `PaymentBankMultiSelectFilter` toolbar component

**Files:**
- Create: `src/components/finances/payment-bank-multi-select-filter.tsx`

**Interfaces:**
- Consumes: `MultiSelectPopOver`, `PaymentBank` enum, `entityType`
- Produces:
  ```ts
  export function PaymentBankMultiSelectFilter(props: {
    selectedBanks: PaymentBank[];
    onSelectedBanksChange: (banks: PaymentBank[]) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Create component**

Create `src/components/finances/payment-bank-multi-select-filter.tsx`:

```tsx
"use client";

import MultiSelectPopOver, {
  type entityType,
} from "@/components/form/multi-select-popover";
import { FilterToolbarField } from "@/components/filters/filter-toolbar";
import { PaymentBank } from "@/types/finance";
import { useMemo } from "react";

const PAYMENT_BANK_ENTITIES: entityType[] = Object.values(PaymentBank).map(
  (bank) => ({ id: bank }),
);

export function PaymentBankMultiSelectFilter({
  selectedBanks,
  onSelectedBanksChange,
}: {
  selectedBanks: PaymentBank[];
  onSelectedBanksChange: (banks: PaymentBank[]) => void;
}) {
  const selectedEntities = useMemo(
    () => selectedBanks.map((bank) => ({ id: bank })),
    [selectedBanks],
  );

  return (
    <FilterToolbarField label="Bank" width="md">
      <MultiSelectPopOver
        label="Bank"
        entities={PAYMENT_BANK_ENTITIES}
        selectedEntities={selectedEntities}
        setSelectedEntities={(next) => {
          const resolved =
            typeof next === "function" ? next(selectedEntities) : next;
          onSelectedBanksChange(
            resolved.map((entity) => entity.id as PaymentBank),
          );
        }}
        displayFunction={(entity) => String(entity.id)}
        isAllSelectedDefault={false}
      />
    </FilterToolbarField>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: no errors related to `payment-bank-multi-select-filter.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/finances/payment-bank-multi-select-filter.tsx
git commit -m "$(cat <<'EOF'
feat(finances): add PaymentBankMultiSelectFilter toolbar component

EOF
)"
```

---

### Task 3: Column layout meta for Bank column

**Files:**
- Modify: `src/lib/finances/recent-transactions-column-meta.ts`
- Modify: `src/lib/finances/recent-transactions-column-meta.test.ts`

**Interfaces:**
- Consumes: `recentTransactionsColumnLayout(opts)`
- Produces: layout entry `{ id: "payment_method__payment_bank", contentRole: "prose", minWidth: "5rem", ... }` immediately after `payment_method__name` when `userUploadStrategy: false`; absent when `true`

- [ ] **Step 1: Write the failing test**

Add to `recent-transactions-column-meta.test.ts`:

```ts
it("places bank after payment account for non-user_upload tenants", () => {
  const layout = recentTransactionsColumnLayout({
    canVerify: false,
    userUploadStrategy: false,
  });
  const accountIdx = layout.findIndex((c) => c.id === "payment_method__name");
  const bankIdx = layout.findIndex((c) => c.id === "payment_method__payment_bank");
  expect(accountIdx).toBeGreaterThanOrEqual(0);
  expect(bankIdx).toBe(accountIdx + 1);
});

it("omits bank column for user_upload tenants", () => {
  const layout = recentTransactionsColumnLayout({
    canVerify: false,
    userUploadStrategy: true,
  });
  expect(layout.some((c) => c.id === "payment_method__payment_bank")).toBe(
    false,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- src/lib/finances/recent-transactions-column-meta.test.ts
```

Expected: FAIL — `bankIdx` is `-1`.

- [ ] **Step 3: Implement column meta**

In `recent-transactions-column-meta.ts`, inside the `else` branch (non–`user_upload`), after the `payment_method__name` splice and before `date_on_screenshot`:

```ts
cols.splice(5, 0, {
  id: "payment_method__payment_bank",
  contentRole: "prose",
  minWidth: "5rem",
  preferredWidth: "6rem",
  align: "left",
  truncate: true,
});
```

Adjust the `date_on_screenshot` splice index from `5` to `6` if needed after insertion (current code splices `payment_method__name` at 4, then `date_on_screenshot` at 5 — insert bank at 5, then date at 6).

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/lib/finances/recent-transactions-column-meta.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  src/lib/finances/recent-transactions-column-meta.ts \
  src/lib/finances/recent-transactions-column-meta.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): add Bank column meta to recent-transactions layout

EOF
)"
```

---

### Task 4: ResourceTable page — filter, column, shared builder

**Files:**
- Modify: `src/app/(internal)/finances/recent-transactions/page.tsx`

**Interfaces:**
- Consumes: `buildRecentTxnFilterParams`, `PaymentBankMultiSelectFilter`, `PaymentBank`
- Produces: ResourceTable with bank filter (non–`user_upload` only) and Bank column; `filterParams` built via shared helper

- [ ] **Step 1: Add bank filter state and visibility flag**

In `page.tsx`, add import:

```ts
import { buildRecentTxnFilterParams } from "@/lib/finances/build-recent-txn-filter-params";
import { PaymentBankMultiSelectFilter } from "@/components/finances/payment-bank-multi-select-filter";
import { PaymentBank } from "@/types/finance";
```

Add state next to other filters:

```ts
const [selectedBanks, setSelectedBanks] = useState<PaymentBank[]>([]);
```

Add derived flag inside component body (after `tenant` is available):

```ts
const showBankFilter =
  tenant?.transaction_screenshot_strategy !==
  TransactionScreenshotStrategy.user_upload;
```

- [ ] **Step 2: Replace inline `filterParams` memo with shared builder**

Replace the existing `filterParams` `useMemo` body with:

```ts
const filterParams = useMemo(() => {
  if (!user) return [];
  return (
    buildRecentTxnFilterParams(user, {
      transactionId,
      date,
      courseId,
      status,
      tenant,
      paymentBanks: showBankFilter ? selectedBanks : undefined,
    }).filter_params ?? []
  );
}, [
  user,
  courseId,
  transactionId,
  date,
  status,
  tenant,
  selectedBanks,
  showBankFilter,
]);
```

- [ ] **Step 3: Reset banks in `clearFilters`**

```ts
const clearFilters = useCallback(() => {
  setTransactionId("");
  setDate(undefined);
  setCourseId("");
  setStatus(undefined);
  setSelectedBanks([]);
  tableState.setState({ page: 1 });
}, [tableState]);
```

- [ ] **Step 4: Add filter UI to `filterSlot`**

After the Status `Selector`, conditionally render:

```tsx
{showBankFilter ? (
  <PaymentBankMultiSelectFilter
    selectedBanks={selectedBanks}
    onSelectedBanksChange={setSelectedBanks}
  />
) : null}
```

- [ ] **Step 5: Add Bank column in non–`user_upload` branch**

In the `columns` `useMemo`, inside the `else` branch (where `payment_method__name` is inserted), add after Payment Account:

```ts
cols.splice(insertAt + 1, 0, {
  id: "payment_method__payment_bank",
  header: "Bank",
  accessor: (row) => row.payment_method?.payment_bank ?? "—",
  enableSorting: false,
});
```

Ensure `date_on_screenshot` splice index accounts for the extra column (use `insertAt + 2` if it was `insertAt + 1`).

- [ ] **Step 6: Request `payment_method.payment_bank` in list fields**

In `useUserPaymentsList` `fields` array, add `"payment_method.payment_bank"` next to `"payment_method.name"`.

- [ ] **Step 7: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/(internal)/finances/recent-transactions/page.tsx
git commit -m "$(cat <<'EOF'
feat(finances): add bank filter and column to recent-transactions table

EOF
)"
```

---

### Task 5: Glide grid — filter, column, shared builder wiring

**Files:**
- Modify: `src/components/finances/student-payments-grid.tsx`

**Interfaces:**
- Consumes: `buildRecentTxnFilterParams` (already imported in Task 1), `PaymentBankMultiSelectFilter`, `PaymentBank`, `TransactionScreenshotStrategy`
- Produces: Glide recent-transactions variant with bank filter + Bank column

- [ ] **Step 1: Add bank filter state for recent variant**

Near `recentStatus` state:

```ts
const [recentBanks, setRecentBanks] = useState<PaymentBank[]>([]);
```

Add visibility flag:

```ts
const showBankFilter =
  isRecent &&
  tenant?.transaction_screenshot_strategy !==
    TransactionScreenshotStrategy.user_upload;
```

- [ ] **Step 2: Pass `paymentBanks` into `recentFilterParams`**

Update `recentFilterParams` useMemo:

```ts
return buildRecentTxnFilterParams(user, {
  transactionId,
  date: recentDate,
  courseId: recentCourseId,
  status: recentStatus,
  tenant,
  paymentBanks: showBankFilter ? recentBanks : undefined,
});
```

Add `recentBanks` and `showBankFilter` to the dependency array.

- [ ] **Step 3: Clear bank state on Clear button**

In the recent-transactions branch of the Clear handler:

```ts
setRecentBanks([]);
```

- [ ] **Step 4: Add filter UI in `filterControls`**

Import `PaymentBankMultiSelectFilter` and after Status `Selector`:

```tsx
{showBankFilter ? (
  <PaymentBankMultiSelectFilter
    selectedBanks={recentBanks}
    onSelectedBanksChange={setRecentBanks}
  />
) : null}
```

- [ ] **Step 5: Add Bank column to Glide grid**

In the non–`user_upload` `gridCols` branch, after `payment_method__name`:

```ts
{ id: "payment_method__payment_bank", title: "Bank", width: 100 },
```

- [ ] **Step 6: Render Bank cells**

In `getCellContent`, after the `payment_method__name` block:

```ts
if (field === "payment_method__payment_bank") {
  const display = record.payment_method?.payment_bank ?? "—";
  return {
    kind: GridCellKind.Text,
    data: display,
    displayData: display,
    allowOverlay: false,
    readonly: true,
  };
}
```

No click handler needed in `onCellClicked` (read-only).

- [ ] **Step 7: Request `payment_method.payment_bank` in search fields**

In `recentDataQuery` `fields` array, add `"payment_method.payment_bank"` after `"payment_method.name"`.

- [ ] **Step 8: Run unit tests**

Run:

```bash
npm run test:unit -- \
  src/lib/finances/build-recent-txn-filter-params.test.ts \
  src/lib/finances/recent-transactions-column-meta.test.ts
```

Expected: PASS.

- [ ] **Step 9: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
feat(finances): add bank filter and column to recent-transactions Glide view

EOF
)"
```

---

## Manual verification (post-implementation)

On a **non–`user_upload` tenant** with `payment.view_all`:

1. Open `/finances/recent-transactions` (ResourceTable).
2. Confirm **Bank** filter appears after Status; select CB + KPAY → Search → rows match selected banks.
3. Confirm **Bank** column appears after Payment Account with correct values (`CB`, `KPAY`, or `—`).
4. Click **Clear** → bank filter resets.
5. Toggle Glide view → repeat steps 2–4.
6. On a **`user_upload` tenant** (or mock): confirm no Bank filter and no Bank column.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Multi-select bank filter | Task 1, 2, 4, 5 |
| `in` operator / comma-separated values | Task 1 |
| Non–`user_upload` visibility | Task 4, 5 |
| Bank column after Payment Account | Task 3, 4, 5 |
| Read-only column | Task 4, 5 |
| `payment_method.payment_bank` in fields | Task 4, 5 |
| All banks selected → no filter | Task 1 |
| Clear resets banks | Task 4, 5 |
| Shared filter builder | Task 1, 4, 5 |
| No backend changes | N/A |
| High-value unit tests only | Task 1, 3 |
