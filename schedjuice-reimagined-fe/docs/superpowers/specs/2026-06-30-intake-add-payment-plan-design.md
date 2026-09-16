# Intake add-course payment plan selection — design spec

> **Status:** Approved (brainstorming 2026-06-30)  
> **Scope:** `schedjuice-reimagined-fe` only (no backend changes)  
> **Surface:** `ExistingIntakeAddForm` + `ExistingIntakeAddFormMulti` — `/courses/create/program/[programId]/intake/[intakeId]/add`

---

## 1. Problem

When adding courses to an existing intake, the form applies `payment_plan_id` from the intake's stored `generation_defaults` silently. Admins cannot pick or override the payment plan when adding ad-hoc courses (e.g. a late section with a different fee structure).

The **new intake wizard** already supports form-level default + per-row payment plan overrides (dates + preview steps). The **add-to-existing-intake** flow does not.

---

## 2. Goals

1. Show a **form-level default payment plan** picker, prefilled from `generation_defaults.payment_plan_id` when set.
2. Allow **per-course override** on each row in the add form.
3. Apply the effective payment plan on `POST /courses` (field already exists on the API).
4. Cover **both** add forms:
   - `ExistingIntakeAddForm` (`subject_strategy = required`)
   - `ExistingIntakeAddFormMulti` (`subject_strategy = multi`)

## Non-goals

- Changing the new-intake wizard (dates / preview / confirm).
- Editing or persisting intake `generation_defaults` from this form.
- Backend API or model changes.
- Making payment plan required (stays optional, matching manual create and new-intake wizard).

---

## 3. Decisions log

| Topic | Decision |
| --- | --- |
| Intake has stored payment plan | Prefill form default; user may change (B) |
| Override granularity | Form-level default + optional per-row overrides (C) |
| Implementation approach | Shared payment plan block + payload helpers; reuse `intake-preview.ts` resolution helpers (recommended #2) |
| Required vs optional | Optional — empty "None" allowed on submit |
| Backend | None — `POST courses` already accepts `payment_plan` |

---

## 4. UX

### Form-level (above course rows)

- `EntityCombobox` entity `payment-plans`
- Label: **Default payment plan · optional**
- Prefill: `parseIntakeGenerationDefaults(intake).payment_plan_id` → combobox value on load
- Empty option: **None**
- Changing the form default does **not** clear existing per-row overrides

### Per-row (inside each course card, below title)

- `EntityCombobox` entity `payment-plans`
- Label: **Payment plan · optional**
- Displayed value: effective plan = row override if set, else form default
- **Use default payment plan** button when row has a custom override (clears row from `paymentPlanOverrides`)
- Optional `Badge variant="outline"`: **Custom payment plan** when `rowHasCustomPaymentPlan(row.key, paymentPlanOverrides)`

### Existing copy

- The "Prefilled from intake defaults: …" summary line is unchanged (still lists `payment plan` when stored on intake).

---

## 5. Data flow

### State shape (both forms)

```ts
defaultPaymentPlanId: number | undefined;       // form-level picker
paymentPlanOverrides: Record<string, number>;   // row.key → plan id
```

Initialize `defaultPaymentPlanId` from `parseIntakeGenerationDefaults(intake).payment_plan_id`.

### Resolution (reuse `src/helpers/intake-preview.ts`)

```ts
getEffectivePaymentPlanId(rowKey, defaultPaymentPlanId, paymentPlanOverrides)
rowHasCustomPaymentPlan(rowKey, paymentPlanOverrides)
```

### Payload precedence

When building each course payload:

```
effectiveId = paymentPlanOverrides[row.key]
           ?? defaultPaymentPlanId
           ?? generation_defaults.payment_plan_id
```

If `effectiveId != null`, set `payload.payment_plan = effectiveId`. If all are absent, omit `payment_plan` from payload.

### Payload builder changes

Extend row params on both builders in `intake-generation-defaults.ts`:

- `buildCoursePayloadFromIntakeDefaults` — add optional `payment_plan_id?: number` on row
- `buildMultiCoursePayloadFromIntakeDefaults` — add optional `payment_plan_id?: number` on row

When `row.payment_plan_id` is provided, it wins over `defaults.payment_plan_id` (same pattern as `category_id` on multi builder).

Add helper:

```ts
resolveIntakeAddPaymentPlanId(
  intake: intakeType,
  defaultPaymentPlanId: number | undefined,
  rowOverride: number | undefined,
): number | undefined
```

---

## 6. Files

| File | Change |
| --- | --- |
| `src/helpers/intake-generation-defaults.ts` | `resolveIntakeAddPaymentPlanId`; row `payment_plan_id` on builders |
| `src/helpers/intake-generation-defaults.test.ts` | Precedence tests |
| `src/components/scheduling/intake-add-payment-plan-fields.tsx` | **New** — form default picker, per-row field, reset button |
| `src/components/scheduling/existing-intake-add-form.tsx` | Wire state + pass effective id on create |
| `src/components/scheduling/existing-intake-add-form-multi.tsx` | Same |

---

## 7. Testing

### Unit (`intake-generation-defaults.test.ts`)

- Row `payment_plan_id` beats form default passed to builder
- Form-level id passed to builder beats intake `generation_defaults`
- No plan at any level → `payment_plan` omitted from payload

### Manual QA

1. Intake **with** stored payment plan → form prefilled; change default → all rows update except overridden rows.
2. Intake **without** stored plan → empty default; pick per row; submit creates courses with correct plans.
3. Both required and multi add forms behave identically for payment plan UX.
4. Submit with no plan selected → course created without `payment_plan` (same as today when intake has no default).

---

## 8. Reference

Existing patterns:

- Payment plan resolution: `src/helpers/intake-preview.ts`
- New-intake preview UI: `src/components/scheduling/intake/course-preview-step.tsx`
- Category fallback on add form: `resolveMultiCourseCategoryId` in `intake-generation-defaults.ts`
