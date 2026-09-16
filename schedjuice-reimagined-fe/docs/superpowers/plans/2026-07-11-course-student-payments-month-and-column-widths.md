# Course student payments month selector + wider columns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a year-month selector on `/courses/[id]/student-payments` in the shared filter bar, and widen Transaction ID / Description in both ResourceTable and Glide views.

**Architecture:** Extract tiny pure helpers for month-selector visibility and editable-field input classes (TDD). Wire those helpers into the report shell and Glide grid filter bars (drop the `!fixedCourseId` guard). Bump Glide column widths and apply field-specific `min-w-*` on ResourceTable editable inputs. No backend or ResourceTable API changes.

**Tech Stack:** Next.js App Router, React, Vitest (`npm run test:unit`), existing `YearMonthSelector`, `StudentPaymentsReportShell`, `StudentPaymentsGrid`, `StudentPaymentsResourceTable`.

**Spec:** `docs/superpowers/specs/2026-07-11-course-student-payments-month-and-column-widths-design.md`

All commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/student-payments-filter-ui.ts` | Create | Pure helpers: month-selector visibility + editable input classNames + Glide width constants |
| `src/lib/finances/student-payments-filter-ui.test.ts` | Create | Unit tests for helpers |
| `src/components/finances/student-payments-report-shell.tsx` | Modify | Use helper so course page shows month selector |
| `src/components/finances/student-payments-grid.tsx` | Modify | Same month guard + wider Glide txn/description widths |
| `src/components/finances/student-payments-resource-table.tsx` | Modify | Field-specific min-widths on editable inputs |

---

### Task 1: Filter UI helpers (TDD)

**Files:**
- Create: `src/lib/finances/student-payments-filter-ui.ts`
- Test: `src/lib/finances/student-payments-filter-ui.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  paymentEditableFieldInputClassName,
  shouldShowStudentPaymentsMonthSelector,
  STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH,
  STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH,
} from "./student-payments-filter-ui";

describe("shouldShowStudentPaymentsMonthSelector", () => {
  it("shows for report mode including course-scoped (fixed course)", () => {
    expect(
      shouldShowStudentPaymentsMonthSelector({
        globalTransactionLookup: false,
        isReport: true,
      }),
    ).toBe(true);
  });

  it("hides for global transaction lookup", () => {
    expect(
      shouldShowStudentPaymentsMonthSelector({
        globalTransactionLookup: true,
        isReport: true,
      }),
    ).toBe(false);
  });

  it("hides when not report mode (e.g. recent transactions)", () => {
    expect(
      shouldShowStudentPaymentsMonthSelector({
        globalTransactionLookup: false,
        isReport: false,
      }),
    ).toBe(false);
  });

  it("defaults isReport to true (shell is always report)", () => {
    expect(
      shouldShowStudentPaymentsMonthSelector({
        globalTransactionLookup: false,
      }),
    ).toBe(true);
  });
});

describe("paymentEditableFieldInputClassName", () => {
  it("uses 12rem floor for transaction_id", () => {
    expect(paymentEditableFieldInputClassName("transaction_id")).toContain(
      "min-w-[12rem]",
    );
  });

  it("uses 14rem floor for description", () => {
    expect(paymentEditableFieldInputClassName("description")).toContain(
      "min-w-[14rem]",
    );
  });

  it("keeps shared input sizing classes", () => {
    const cls = paymentEditableFieldInputClassName("transaction_id");
    expect(cls).toContain("h-8");
    expect(cls).toContain("flex-1");
    expect(cls).toContain("text-sm");
    expect(cls).not.toContain("min-w-0");
  });
});

describe("Glide column width constants", () => {
  it("are wider than the previous 180 / 200 defaults", () => {
    expect(STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH).toBe(240);
    expect(STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH).toBe(280);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/finances/student-payments-filter-ui.test.ts`

Expected: FAIL (module not found / cannot resolve)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/finances/student-payments-filter-ui.ts

export const STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH = 240;
export const STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH = 280;

export type StudentPaymentsMonthSelectorOpts = {
  globalTransactionLookup: boolean;
  /** When false (recent-transactions grid), hide. Defaults to true for report shell. */
  isReport?: boolean;
};

/**
 * Month selector is shown for report views (finance + course), hidden for
 * global transaction lookup and non-report (recent) grids.
 * Course scope (`fixedCourseId`) must NOT hide the selector.
 */
export function shouldShowStudentPaymentsMonthSelector(
  opts: StudentPaymentsMonthSelectorOpts,
): boolean {
  if (opts.globalTransactionLookup) return false;
  if (opts.isReport === false) return false;
  return true;
}

export type EditablePaymentFieldName = "transaction_id" | "description";

export function paymentEditableFieldInputClassName(
  field: EditablePaymentFieldName,
): string {
  const minW = field === "transaction_id" ? "min-w-[12rem]" : "min-w-[14rem]";
  return `h-8 ${minW} flex-1 text-sm`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/finances/student-payments-filter-ui.test.ts`

Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/student-payments-filter-ui.ts src/lib/finances/student-payments-filter-ui.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): add student payments filter UI helpers

EOF
)"
```

---

### Task 2: Show month selector on course page (shell + grid)

**Files:**
- Modify: `src/components/finances/student-payments-report-shell.tsx` (filterControls ~lines 189–202)
- Modify: `src/components/finances/student-payments-grid.tsx` (filterControls ~lines 1078–1091)

- [ ] **Step 1: Update shell month guard**

In `student-payments-report-shell.tsx`, add import:

```ts
import { shouldShowStudentPaymentsMonthSelector } from "@/lib/finances/student-payments-filter-ui";
```

Replace the month block condition:

```tsx
// BEFORE
{!fixedCourseId && !globalTransactionLookup ? (
```

```tsx
// AFTER
{shouldShowStudentPaymentsMonthSelector({
  globalTransactionLookup: Boolean(globalTransactionLookup),
}) ? (
```

Leave the course combobox condition unchanged (`user && !fixedCourseId && !globalTransactionLookup`).

Do **not** change `clearFilters` in the hook — it already resets `date` and skips clearing course when `fixedCourseId` is set.

- [ ] **Step 2: Update grid month guard**

In `student-payments-grid.tsx`, add the same import, then replace:

```tsx
// BEFORE
{isReport && !fixedCourseId && !globalTransactionLookup ? (
```

```tsx
// AFTER
{shouldShowStudentPaymentsMonthSelector({
  globalTransactionLookup: Boolean(globalTransactionLookup),
  isReport,
}) ? (
```

Keep `monthType` from `courseMeta?.start_date` as today.

- [ ] **Step 3: Manual sanity check (optional in agent; required before claiming done)**

Open `/courses/[id]/student-payments` in both original and Glide preference:
- Month control visible next to Transaction ID
- Changing month updates `?date=` and reloads rows
- Finance page still shows month + course combobox
- Transaction-lookup mode still hides month

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/student-payments-report-shell.tsx src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
fix(finances): show month selector on course student payments

EOF
)"
```

---

### Task 3: Widen Transaction ID / Description (both views)

**Files:**
- Modify: `src/components/finances/student-payments-resource-table.tsx` (`PaymentEditableFieldCell` ~lines 99–112)
- Modify: `src/components/finances/student-payments-grid.tsx` (column defs ~lines 544–547)

- [ ] **Step 1: ResourceTable editable input classes**

In `student-payments-resource-table.tsx`, import:

```ts
import { paymentEditableFieldInputClassName } from "@/lib/finances/student-payments-filter-ui";
```

Replace the Input `className`:

```tsx
// BEFORE
className="h-8 min-w-0 flex-1 text-sm"

// AFTER
className={paymentEditableFieldInputClassName(field)}
```

Keep the outer wrapper `div` as `flex min-w-0 items-center gap-2` so the cell can still participate in table layout; the input itself carries the min-width floor.

- [ ] **Step 2: Glide column widths**

In `student-payments-grid.tsx`, import:

```ts
import {
  shouldShowStudentPaymentsMonthSelector,
  STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH,
  STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH,
} from "@/lib/finances/student-payments-filter-ui";
```

(If Task 2 already imported `shouldShowStudentPaymentsMonthSelector`, extend that import.)

Replace the column width literals:

```tsx
// BEFORE
{ id: "transaction_id", title: "Transaction ID", width: 180 },
{ id: "description", title: "Description", width: 200 },

// AFTER
{
  id: "transaction_id",
  title: "Transaction ID",
  width: STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH,
},
{
  id: "description",
  title: "Description",
  width: STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH,
},
```

- [ ] **Step 3: Re-run unit tests**

Run: `npm run test:unit -- src/lib/finances/student-payments-filter-ui.test.ts`

Expected: PASS

- [ ] **Step 4: Manual smoke**

- Original view: Transaction ID / Description inputs show full typical values (no “Paymen…” clip)
- Glide view: those columns start wider; still resizable
- Narrow viewport: table may scroll horizontally rather than crush inputs

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
fix(finances): widen student payment txn id and description columns

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Course page shows YearMonthSelector in shared filter bar | Task 2 |
| Guard is `!globalTransactionLookup` (not `!fixedCourseId`) | Tasks 1–2 |
| `monthType` from `courseMeta` | Task 2 (unchanged wiring) |
| Clear filters does not clear fixed course | No code change (hook already correct) |
| Glide widths ~240 / 280 | Tasks 1, 3 |
| ResourceTable field-specific min-w 12rem / 14rem | Tasks 1, 3 |
| No ResourceTable size API / no sidebar restore / no backend change | Out of scope (not in tasks) |
| Hide month in transaction lookup | Tasks 1–2 |

## Self-review notes

- No TBD/placeholder steps.
- Helper signatures are consistent across tasks (`shouldShowStudentPaymentsMonthSelector`, `paymentEditableFieldInputClassName`, width constants).
- Course combobox visibility intentionally unchanged.
