# Intake Add-Course Payment Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins pick and override payment plans when adding courses to an existing intake, with a form-level default and optional per-row overrides.

**Architecture:** Extend `intake-generation-defaults.ts` with a resolution helper and optional row `payment_plan_id`. Add a shared `IntakeAddPaymentPlanFields` component used by both existing-intake add forms. Reuse `getEffectivePaymentPlanId` / `rowHasCustomPaymentPlan` from `intake-preview.ts`. Frontend-only; `POST courses` already accepts `payment_plan`.

**Tech Stack:** Next.js App Router, React, TanStack Query, Vitest, existing `EntityCombobox`

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-30-intake-add-payment-plan-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `src/helpers/intake-generation-defaults.ts` | Payload builders + `resolveIntakeAddPaymentPlanId` |
| `src/helpers/intake-generation-defaults.test.ts` | Precedence unit tests |
| `src/components/scheduling/intake-add-payment-plan-fields.tsx` | Shared form default + per-row UI |
| `src/components/scheduling/existing-intake-add-form.tsx` | Required-strategy add form wiring |
| `src/components/scheduling/existing-intake-add-form-multi.tsx` | Multi-strategy add form wiring |

---

### Task 1: Payment plan resolution helper + builder params

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/intake-generation-defaults.ts`
- Test: `schedjuice-reimagined-fe/src/helpers/intake-generation-defaults.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `intake-generation-defaults.test.ts`:

```ts
import {
  // ...existing imports
  resolveIntakeAddPaymentPlanId,
} from "./intake-generation-defaults";

describe("resolveIntakeAddPaymentPlanId", () => {
  const intake = {
    generation_defaults: { payment_plan_id: 9 },
  } as unknown as intakeType;

  it("prefers row override over form default and intake default", () => {
    expect(resolveIntakeAddPaymentPlanId(intake, 5, 3)).toBe(3);
  });

  it("prefers form default over intake default", () => {
    expect(resolveIntakeAddPaymentPlanId(intake, 5, undefined)).toBe(5);
  });

  it("falls back to intake generation_defaults", () => {
    expect(resolveIntakeAddPaymentPlanId(intake, undefined, undefined)).toBe(9);
  });

  it("returns undefined when no plan at any level", () => {
    const intakeNoPlan = { generation_defaults: {} } as unknown as intakeType;
    expect(
      resolveIntakeAddPaymentPlanId(intakeNoPlan, undefined, undefined),
    ).toBeUndefined();
  });
});

describe("buildCoursePayloadFromIntakeDefaults payment_plan", () => {
  it("row payment_plan_id overrides intake default", () => {
    const intake = {
      id: 12,
      name: "Jun 2026",
      program: 2,
      start_date: new Date("2026-06-01"),
      end_date: new Date("2026-12-31"),
      generation_defaults: { payment_plan_id: 9 },
    } as unknown as intakeType;

    const payload = buildCoursePayloadFromIntakeDefaults(intake, 2, {
      subject_id: 7,
      title: "Course",
      payment_plan_id: 3,
    });

    expect(payload.payment_plan).toBe(3);
  });

  it("omits payment_plan when none resolved", () => {
    const intake = {
      id: 12,
      name: "Jun 2026",
      program: 2,
      start_date: new Date("2026-06-01"),
      end_date: new Date("2026-12-31"),
      generation_defaults: {},
    } as unknown as intakeType;

    const payload = buildCoursePayloadFromIntakeDefaults(intake, 2, {
      subject_id: 7,
      title: "Course",
    });

    expect(payload).not.toHaveProperty("payment_plan");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `schedjuice-reimagined-fe`:

```bash
npm test -- src/helpers/intake-generation-defaults.test.ts
```

Expected: FAIL — `resolveIntakeAddPaymentPlanId` not exported / row param not accepted.

- [ ] **Step 3: Implement helper and extend builders**

In `intake-generation-defaults.ts`:

```ts
export function resolveIntakeAddPaymentPlanId(
  intake: intakeType,
  defaultPaymentPlanId: number | undefined,
  rowPaymentPlanId: number | undefined,
): number | undefined {
  if (rowPaymentPlanId != null) return rowPaymentPlanId;
  if (defaultPaymentPlanId != null) return defaultPaymentPlanId;
  const intakePlanId = parseIntakeGenerationDefaults(intake).payment_plan_id;
  return intakePlanId ?? undefined;
}
```

Update `buildCoursePayloadFromIntakeDefaults` row type to include `payment_plan_id?: number` and replace:

```ts
if (defaults.payment_plan_id != null) {
  payload.payment_plan = defaults.payment_plan_id;
}
```

with:

```ts
const paymentPlanId =
  row.payment_plan_id ?? defaults.payment_plan_id ?? undefined;
if (paymentPlanId != null) {
  payload.payment_plan = paymentPlanId;
}
```

Update `buildMultiCoursePayloadFromIntakeDefaults` row type similarly:

```ts
const paymentPlanId =
  row.payment_plan_id ?? defaults.payment_plan_id ?? undefined;
if (paymentPlanId != null) {
  payload.payment_plan = paymentPlanId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/helpers/intake-generation-defaults.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/helpers/intake-generation-defaults.ts src/helpers/intake-generation-defaults.test.ts
git commit -m "feat(intake-add): resolve payment plan precedence for course payloads"
```

---

### Task 2: Shared payment plan UI component

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/scheduling/intake-add-payment-plan-fields.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";

import EntityCombobox from "@/components/form/entity-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getEffectivePaymentPlanId,
  rowHasCustomPaymentPlan,
} from "@/helpers/intake-preview";

export type IntakeAddPaymentPlanState = {
  defaultPaymentPlanId: number | undefined;
  paymentPlanOverrides: Record<string, number>;
};

export function IntakeAddDefaultPaymentPlanField({
  defaultPaymentPlanId,
  onChange,
}: {
  defaultPaymentPlanId: number | undefined;
  onChange: (planId: number | undefined) => void;
}) {
  return (
    <EntityCombobox
      entity="payment-plans"
      displayFunction={(e) => e.name}
      value={defaultPaymentPlanId != null ? String(defaultPaymentPlanId) : ""}
      onChange={(value) =>
        onChange(value ? parseInt(value, 10) : undefined)
      }
      label="Default payment plan · optional"
      emptyOption={{ value: "", label: "None" }}
      comboboxPlaceholder="None"
    />
  );
}

export function IntakeAddRowPaymentPlanField({
  rowKey,
  state,
  onSetOverride,
  onClearOverride,
}: {
  rowKey: string;
  state: IntakeAddPaymentPlanState;
  onSetOverride: (rowKey: string, planId: number | undefined) => void;
  onClearOverride: (rowKey: string) => void;
}) {
  const effectiveId = getEffectivePaymentPlanId(
    rowKey,
    state.defaultPaymentPlanId,
    state.paymentPlanOverrides,
  );
  const hasCustom = rowHasCustomPaymentPlan(
    rowKey,
    state.paymentPlanOverrides,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <EntityCombobox
          entity="payment-plans"
          displayFunction={(e) => e.name}
          value={effectiveId != null ? String(effectiveId) : ""}
          onChange={(value) =>
            onSetOverride(rowKey, value ? parseInt(value, 10) : undefined)
          }
          label="Payment plan · optional"
          emptyOption={{ value: "", label: "None" }}
          comboboxPlaceholder="None"
        />
        {hasCustom ? (
          <Badge variant="outline" className="self-end mb-1">
            Custom payment plan
          </Badge>
        ) : null}
      </div>
      {hasCustom ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onClearOverride(rowKey)}
        >
          Use default payment plan
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: no errors in new file.

- [ ] **Step 3: Commit**

```bash
git add src/components/scheduling/intake-add-payment-plan-fields.tsx
git commit -m "feat(intake-add): shared payment plan fields for existing intake add"
```

---

### Task 3: Wire `ExistingIntakeAddForm` (required strategy)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/scheduling/existing-intake-add-form.tsx`

- [ ] **Step 1: Add state and handlers**

Import:

```ts
import {
  IntakeAddDefaultPaymentPlanField,
  IntakeAddRowPaymentPlanField,
  type IntakeAddPaymentPlanState,
} from "@/components/scheduling/intake-add-payment-plan-fields";
import {
  buildCoursePayloadFromIntakeDefaults,
  parseIntakeGenerationDefaults,
  resolveIntakeAddPaymentPlanId,
} from "@/helpers/intake-generation-defaults";
```

Add state after `categoryOverride`:

```ts
const [paymentPlanState, setPaymentPlanState] =
  useState<IntakeAddPaymentPlanState>(() => ({
    defaultPaymentPlanId: undefined,
    paymentPlanOverrides: {},
  }));
```

Add effect to prefill from intake (after intake loads):

```ts
useEffect(() => {
  if (!intake) return;
  const intakePlanId = parseIntakeGenerationDefaults(intake).payment_plan_id;
  if (intakePlanId == null) return;
  setPaymentPlanState((prev) =>
    prev.defaultPaymentPlanId != null
      ? prev
      : { ...prev, defaultPaymentPlanId: intakePlanId },
  );
}, [intake]);
```

Add handlers:

```ts
function setDefaultPaymentPlan(planId: number | undefined) {
  setPaymentPlanState((prev) => ({ ...prev, defaultPaymentPlanId: planId }));
}

function setRowPaymentPlan(rowKey: string, planId: number | undefined) {
  setPaymentPlanState((prev) => {
    const next = { ...prev.paymentPlanOverrides };
    if (planId == null) {
      delete next[rowKey];
    } else {
      next[rowKey] = planId;
    }
    return { ...prev, paymentPlanOverrides: next };
  });
}

function clearRowPaymentPlan(rowKey: string) {
  setPaymentPlanState((prev) => {
    const next = { ...prev.paymentPlanOverrides };
    delete next[rowKey];
    return { ...prev, paymentPlanOverrides: next };
  });
}
```

- [ ] **Step 2: Pass effective plan into payload**

In `createCourses` mutation, when building payload:

```ts
const rowPlanOverride = paymentPlanState.paymentPlanOverrides[row.key];
const effectivePaymentPlanId = resolveIntakeAddPaymentPlanId(
  intake,
  paymentPlanState.defaultPaymentPlanId,
  rowPlanOverride,
);

const payload = buildCoursePayloadFromIntakeDefaults(intake, program.id, {
  subject_id: row.subject_id,
  title: row.title.trim(),
  ...(effectivePaymentPlanId != null
    ? { payment_plan_id: effectivePaymentPlanId }
    : {}),
});
```

Note: because builder now uses `row.payment_plan_id ?? defaults.payment_plan_id`, passing `effectivePaymentPlanId` (which already includes intake fallback) is correct — do **not** also rely on defaults inside builder for the form default case, or you'll double-apply. **Preferred:** pass only the resolved effective id:

```ts
payment_plan_id: effectivePaymentPlanId,
```

and builder uses `row.payment_plan_id ?? defaults.payment_plan_id` — when form default differs from intake default, `effectivePaymentPlanId` already encodes the right value.

- [ ] **Step 3: Render UI**

After category override block, before course rows:

```tsx
<IntakeAddDefaultPaymentPlanField
  defaultPaymentPlanId={paymentPlanState.defaultPaymentPlanId}
  onChange={setDefaultPaymentPlan}
/>
```

Inside each course card, after title field:

```tsx
<IntakeAddRowPaymentPlanField
  rowKey={row.key}
  state={paymentPlanState}
  onSetOverride={setRowPaymentPlan}
  onClearOverride={clearRowPaymentPlan}
/>
```

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/components/scheduling/existing-intake-add-form.tsx
git commit -m "feat(intake-add): payment plan selection on required add form"
```

---

### Task 4: Wire `ExistingIntakeAddFormMulti` (multi strategy)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/scheduling/existing-intake-add-form-multi.tsx`

- [ ] **Step 1: Mirror Task 3 changes**

Same imports, state, effect, handlers, form-level field, and per-row field as Task 3.

In `createCourses` mutation:

```ts
const rowPlanOverride = paymentPlanState.paymentPlanOverrides[row.key];
const effectivePaymentPlanId = resolveIntakeAddPaymentPlanId(
  intake,
  paymentPlanState.defaultPaymentPlanId,
  rowPlanOverride,
);

const payload = buildMultiCoursePayloadFromIntakeDefaults(intake, program.id, {
  level_id: row.level_id,
  section_id: row.section_id,
  title: row.title.trim(),
  category_id: categoryId,
  ...(effectivePaymentPlanId != null
    ? { payment_plan_id: effectivePaymentPlanId }
    : {}),
});
```

- [ ] **Step 2: Run lint and unit tests**

```bash
npm run lint
npm test -- src/helpers/intake-generation-defaults.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/components/scheduling/existing-intake-add-form-multi.tsx
git commit -m "feat(intake-add): payment plan selection on multi add form"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start dev server**

```bash
cd schedjuice-reimagined-fe && npm run dev
```

- [ ] **Step 2: Required-strategy program**

Navigate to `/courses/create/program/[programId]/intake/[intakeId]/add` for an intake-based program with `subject_strategy = required`.

Verify:
- Form default prefilled when intake has `generation_defaults.payment_plan_id`
- Changing default updates row combobox values (except rows with custom override)
- Per-row override + "Use default payment plan" works
- Created course has expected `payment_plan` on edit page

- [ ] **Step 3: Multi-strategy program**

Repeat on a K-12 multi program add form.

- [ ] **Step 4: No-plan intake**

Intake without stored payment plan → empty defaults; optional selection still works.

---

## Plan self-review

| Spec requirement | Task |
| --- | --- |
| Form-level default prefilled from intake | Task 3/4 effect + `IntakeAddDefaultPaymentPlanField` |
| Per-row override | Task 2 `IntakeAddRowPaymentPlanField` + Task 3/4 handlers |
| Both add forms | Task 3 + Task 4 |
| Payload precedence | Task 1 `resolveIntakeAddPaymentPlanId` + tests |
| Optional / None | Empty option on comboboxes; omit from payload when unset |
| No backend changes | Frontend-only |
| Reuse preview helpers | Task 2 imports from `intake-preview.ts` |

No placeholders. Type names consistent across tasks.

---

## Execution handoff

Plan complete and saved to `schedjuice-reimagined-fe/docs/superpowers/plans/2026-06-30-intake-add-payment-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
