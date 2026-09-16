# Payment Plan Selector Fee Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each payment plan’s fee next to its name in all payment-plan selectors.

**Architecture:** Pure helper `formatPaymentPlanOptionLabel` formats `Name — Ks 10,000` via `formatMoney`. Call sites use `useTenantCurrencySymbol()` and pass the helper as `displayFunction`.

**Tech Stack:** React, TypeScript, Vitest, existing `formatMoney` / `useTenantCurrencySymbol`.

## Global Constraints

- Label format: `{name} — {formatMoney(price, symbol)}`; name-only when price missing.
- Touch selectors only; no backend changes.
- Prefer high-value unit tests on the helper, not mounting every select.

---

### Task 1: Helper + unit tests

**Files:**
- Create: `src/helpers/payment-plan-label.ts`
- Create: `src/helpers/payment-plan-label.test.ts`

- [x] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { formatPaymentPlanOptionLabel } from "./payment-plan-label";

describe("formatPaymentPlanOptionLabel", () => {
  it("appends formatted fee with em dash", () => {
    expect(
      formatPaymentPlanOptionLabel({ name: "Monthly", price: 10000 }, "Ks"),
    ).toBe("Monthly — Ks 10,000");
  });

  it("returns name only when price is missing", () => {
    expect(formatPaymentPlanOptionLabel({ name: "Monthly" }, "Ks")).toBe(
      "Monthly",
    );
    expect(
      formatPaymentPlanOptionLabel({ name: "Monthly", price: null }, "Ks"),
    ).toBe("Monthly");
    expect(
      formatPaymentPlanOptionLabel({ name: "Monthly", price: "" }, "Ks"),
    ).toBe("Monthly");
  });
});
```

- [x] **Step 2: Run tests — expect fail**

```bash
cd schedjuice-reimagined-fe && npx vitest run src/helpers/payment-plan-label.test.ts
```

- [x] **Step 3: Implement helper**

```ts
import { formatMoney } from "@/helpers/money";

type PaymentPlanLabelSource = {
  name?: string | null;
  price?: number | string | null;
};

export function formatPaymentPlanOptionLabel(
  plan: PaymentPlanLabelSource,
  currencySymbol: string,
): string {
  const name = plan.name?.trim() || "";
  if (plan.price == null || plan.price === "") return name;
  return `${name} — ${formatMoney(plan.price, currencySymbol)}`;
}
```

- [x] **Step 4: Run tests — expect pass**

```bash
cd schedjuice-reimagined-fe && npx vitest run src/helpers/payment-plan-label.test.ts
```

---

### Task 2: Wire helper into all payment-plan selectors

**Files:**
- Modify: `src/app/(internal)/courses/[id]/edit/page.tsx`
- Modify: `src/components/scheduling/manual-course-form.tsx`
- Modify: `src/components/scheduling/intake/dates-step.tsx`
- Modify: `src/components/scheduling/intake/course-preview-step.tsx`
- Modify: `src/components/scheduling/intake-add-payment-plan-fields.tsx`

- [x] **Step 1:** Import `formatPaymentPlanOptionLabel` and `useTenantCurrencySymbol` in each file.
- [x] **Step 2:** Call `const currencySymbol = useTenantCurrencySymbol()` in each component.
- [x] **Step 3:** Replace `displayFunction={(e) => e.name}` on payment-plans with `displayFunction={(e) => formatPaymentPlanOptionLabel(e, currencySymbol)}`.
- [x] **Step 4:** For course edit, include `currencySymbol` in the `courseFieldConfig` `useMemo` dependency list.

**Manual check:** Open course edit / intake dates — options show `Name — Ks …`.
