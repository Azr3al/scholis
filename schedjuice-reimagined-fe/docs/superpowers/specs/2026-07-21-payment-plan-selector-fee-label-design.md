# Payment plan selector fee label

## Goal

In every payment-plan picker (`EntitySelect` / `EntityCombobox` with `entity="payment-plans"`), show the plan fee next to the name so admins can distinguish plans without opening the plans list.

## Format

`{name} — {formatMoney(price, currencySymbol)}`

- Em dash separator (U+2014).
- Currency via existing `formatMoney` + `useTenantCurrencySymbol()`.
- If `price` is null/undefined/empty, show `{name}` only.

## Approach

Shared pure helper `formatPaymentPlanOptionLabel(plan, currencySymbol)` in `src/helpers/payment-plan-label.ts`. Each call site passes it as `displayFunction`.

## Out of scope

- Backend/API changes.
- Confirm-step summary labels (not a selector).
- Discount / per-hour price in the option label.
- Changing EntitySelect/EntityCombobox generics.

## Call sites

- `courses/[id]/edit/page.tsx`
- `manual-course-form.tsx`
- `intake/dates-step.tsx`
- `intake/course-preview-step.tsx` (default + per-row)
- `intake-add-payment-plan-fields.tsx` (default + per-row)

## Testing

Unit tests for the helper: price present, missing/empty, non-numeric fallback via `formatMoney` behavior.
