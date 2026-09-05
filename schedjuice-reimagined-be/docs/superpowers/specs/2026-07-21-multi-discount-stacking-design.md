# Multi-Discount Stacking on Enrollments — Design Spec

**Date:** 2026-07-21  
**Status:** Approved for planning  
**Extends:** [2026-06-30-discount-engine-design.md](./2026-06-30-discount-engine-design.md), [2026-07-13-discount-eligibility-and-payment-create-design.md](./2026-07-13-discount-eligibility-and-payment-create-design.md)  
**Surfaces:** Enrollment discount APIs, student-payment upload (`/finances/student-payments/upload`), course-roster enrollment discount dialog, payment receipts/detail

## Summary

Allow **multiple catalog discounts** to be active on the same student enrollment (`UserCourse`). Each discount remains an `EnrollmentDiscount` row with its own snapshot and credit state. Invoice math sums each discount’s period reduction **independently off the same base**, then clamps so invoiced amount never goes below zero. Payment create and the roster dialog both edit this durable stack. Payments store aggregate amounts plus **per-discount lines** for receipt and detail audit.

This supersedes the v1 rule “one active discount per enrollment; apply replaces prior.”

---

## Confirmed decisions

| Topic | Choice |
|-------|--------|
| Stacking target | Multiple active catalog discounts on the **same enrollment** |
| Combine rule | Independent off **original base**; clamp `invoiced ≥ 0` |
| When sum of lines > base | Scale line amounts by `base / sum` (half-up; residual on last line) so lines sum to `discount_amount` |
| Duplicate template | Blocked — unique active `(user_course, discount)` |
| Type exclusivity | None — any eligible templates may stack |
| Apply order | Deterministic by `EnrollmentDiscount.id` ascending; order does not change totals (independent-off-base) |
| Management UX | Payment upload picker **and** roster enrollment dialog — both multi-edit the same stack |
| Display | Summaries: joined `discount_label` (`"A + B"`). Receipt/detail: per-discount lines when more than one |
| Retroactive recompute | Out of scope — existing payments unchanged when stack changes |
| Approach | Multiple active `EnrollmentDiscount` rows + `UserPaymentDiscount` join snapshot |

---

## Problem / context

Today:

- `EnrollmentDiscount` has a partial unique constraint: one `is_active=True` row per `user_course`.
- `apply_enrollment_discount` deactivates any prior active discount before creating a new one.
- `UserPayment.enrollment_discount` is a single FK; `discount_label` / `discount_amount` are aggregates from that one snapshot.
- Payment upload (`PaymentDiscountPicker`) and roster (`EnrollmentDiscountDialog`) are single-select.
- Stacking was explicitly out of scope in the 2026-06-30 design.

Schools need to combine eligible discounts (e.g. early-bird + loyalty) without losing one when applying another.

---

## Architecture

### Approach chosen

**Multiple active `EnrollmentDiscount` rows** per enrollment, unique on `(user_course, discount)` while active. Central `discount_engine` sums independent period reductions. Payments snapshot the stack via a join table.

Rejected alternatives:

1. **One enrollment row with JSON/array of templates** — awkward for per-template `remaining_credit` / `first_period_consumed` and harder to add/remove one line.
2. **Payment-create-only stacks** — breaks durable enrollment pricing for invoice cron and roster management.

### Price resolution (updated)

```
1. base = payment_plan.price
2. If enrollment has any active EnrollmentDiscount → use plan price as base
   Else if legacy sibling rule (2+ active courses) and plan.discount_price set
        → base = plan.discount_price
   Else → base unchanged
3. For each active EnrollmentDiscount (order by id asc):
        line_i = period reduction for that ED vs base (existing percent / first_period /
                 whole-enrollment credit rules — still vs base, not remaining)
4. raw_sum = sum(line_i)
5. If raw_sum > base:
        scale = base / raw_sum
        scale each line (half-up); adjust last line so sum(lines) == base
        discount_amount = base
   Else:
        discount_amount = raw_sum
6. invoiced_amount = max(base - discount_amount, 0)
```

**Legacy sibling rule:** unchanged — only when **no** active `EnrollmentDiscount` exists.

**Non-retroactive:** add/remove/set of the stack affects **future** invoices and newly created payments only. Existing `UserPayment` rows (and their join snapshots) are never recalculated.

**Post-invoice consumption:** `consume_discount_state_after_invoice` runs **per** active ED using that ED’s (scaled) line amount for the period — each row’s `remaining_credit` / `first_period_consumed` updates independently.

### Units

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `discount_engine` | List actives; compute stacked invoiced result + line breakdown; apply/add; remove one; clear all; consume state | `EnrollmentDiscount`, `Discount`, eligibility |
| Enrollment discount APIs | CRUD-ish for the stack | engine |
| `payment_discount_apply` | On payment create: set stack from `discount_ids`, snapshot lines onto payment | engine, serializers |
| `UserPaymentDiscount` | Immutable per-payment line snapshot | `UserPayment`, `EnrollmentDiscount` |
| FE pickers / dialog | Multi-select / multi-manage same stack | eligible + discount APIs |
| Receipt helpers | Render joined label or multi-lines | payment read fields |

---

## Data model

### `EnrollmentDiscount` (constraint change)

| Change | Detail |
|--------|--------|
| Drop | `app_finance_enrollmentdiscount_one_active_per_user_course` (unique on `user_course` where `is_active`) |
| Add | Unique constraint on `(user_course, discount)` where `is_active=True` and `discount` is not null |

Row shape (snapshots, credit fields, audit) unchanged.

### `UserPaymentDiscount` (new)

Immutable snapshot lines created at payment create / invoice generation time.

| Field | Type | Notes |
|-------|------|-------|
| `user_payment` | FK → `UserPayment` | Parent payment |
| `enrollment_discount` | FK → `EnrollmentDiscount`, nullable | Source row; SET_NULL if ED deleted later |
| `label` | CharField | Display name at snapshot time |
| `amount` | MoneyField | This line’s contribution after any scale-to-base |

Constraint: one row per `(user_payment, enrollment_discount)` when ED is non-null.

### `UserPayment` (aggregate fields)

| Field | Change |
|-------|--------|
| `base_amount`, `discount_amount`, `invoiced_amount` | Unchanged — still aggregates |
| `enrollment_discount` | Stop writing on new payments; leave nullable for back-compat reads; backfill join from it |
| Read: `discount_label` | Joined active-snapshot labels: `"A + B"` (stable order by join id / ED id) |
| Read: `discount_lines` | `[{ enrollment_discount_id, label, amount }, …]` from `UserPaymentDiscount` |

Group rollup: keep existing `"Multiple"` when part `discount_label` values disagree.

---

## Engine API (behavioral)

| Function | Behavior |
|----------|----------|
| `get_active_enrollment_discounts(user_course)` | List of active EDs, `id` ascending. Replace singular `get_active_enrollment_discount` (or keep singular as `.first()` only for legacy call sites during migration). |
| `compute_invoiced_amount(...)` | Returns aggregates **plus** per-line breakdown (extend `InvoicedAmountResult` or sibling dataclass). |
| `apply_enrollment_discount(...)` | **Add** one ED. Do **not** deactivate siblings. Raise on duplicate template / ineligible / inactive. |
| `remove_enrollment_discount(...)` | Clear **all** active (today’s DELETE semantics). |
| `remove_enrollment_discount_by_id(...)` | Deactivate one ED by id (must belong to enrollment). |
| `set_enrollment_discounts(user_course, discount_ids, ...)` | Reconcile stack to exactly these catalog IDs (add missing eligible, deactivate extras). Used by payment create. |
| `consume_discount_state_after_invoice(...)` | Consume each ED from its line amount for the period. |

Eligibility / grandfathering from 2026-07-13 still apply **per** selected discount on add and on set.

---

## APIs

All under `api/v1/`, tenant-scoped. Permissions unchanged: `payment.configure` write, `payment.view_all` / configure as today for preview.

### Enrollment-scoped

| Method | Route | Behavior |
|--------|-------|----------|
| `GET` | `user-courses/<id>/discount` | Return **list** of active EDs (array). |
| `POST` | `user-courses/<id>/discount` | Add one: `{ discount_id, reason?, as_of? }`. 400 duplicate / ineligible. |
| `DELETE` | `user-courses/<id>/discount` | Clear all active. |
| `DELETE` | `user-courses/<id>/discount/<enrollment_discount_id>` | Remove one. |
| `GET` | `user-courses/<id>/eligible-discounts` | Catalog options; `current` becomes a **list**; mark / exclude already-applied templates. |
| `GET` | `user-courses/<id>/discount-preview` | Preview uses **full stack** math. |

### Payment create (`ocr-payment-screenshot` / `UserPaymentSerializer`)

| Field | Behavior |
|-------|----------|
| `discount_ids` omitted | Leave enrollment stack unchanged; snapshot whatever is currently active onto the new payment. |
| `discount_ids` present (incl. `[]`) | Set enrollment stack to exactly this catalog ID set, then snapshot lines onto the new payment. Empty list = clear all. |
| `clear_discount` | Alias for clear-all (empty stack). |
| `discount_id` | Deprecated singular: treat as `[discount_id]` for one release. Mutually exclusive with `discount_ids` in the same request (400 if both sent). |

### Payment / admin-report read

Expose `discount_label`, `discount_amount`, and `discount_lines`. Prefetch `user_payment_discounts` (and nested ED / discount name as needed) to avoid N+1.

---

## Frontend

### Shared selection

`PaymentDiscountSelection` → `{ discountIds: number[] }`.

Eligible response `current` → list of `EnrollmentDiscount`.

### Payment upload — `PaymentDiscountPicker`

- Multi-select checklist of eligible discounts; already-applied checked.
- Clear all → empty `discountIds`.
- Copy: multiple eligible discounts can stack; still enrollment-scoped.
- Multipart submit sends `discount_ids` (repeated fields or equivalent).
- Remaining-amount preview uses stacked total (same rules as backend).

### Roster — `EnrollmentDiscountDialog`

- List active stack with per-row Remove (`DELETE …/discount/<id>`).
- Add: choose one not-already-applied eligible + optional reason → `POST …/discount`.
- Clear all → `DELETE …/discount`.
- Preview table uses full-stack periods.

### Receipt / detail / lists

- Lists & summaries: joined `discount_label`.
- Receipt and payment drawer: if `discount_lines.length > 1`, show each line (negative money) then total; else keep single-line behavior.
- Group rollup `"Multiple"` unchanged when parts disagree.

### Types / cache

Update finance types and discount hooks; invalidate eligible / enrollment-discount / payment queries on stack mutations (same pattern as today).

---

## Errors

| Case | Response |
|------|----------|
| Duplicate template on enrollment | 400 — already applied |
| Ineligible selection | 400 — existing eligibility reason codes |
| Remove unknown / inactive / wrong-enrollment ED id | 404 |
| `discount_ids` with duplicate ids in one request | 400 |
| Stack sum > base | Not an error — scale lines; aggregates clamp |

---

## Migration

1. Drop old one-active-per-`user_course` constraint; add unique active `(user_course, discount)`.
2. Create `UserPaymentDiscount`.
3. Backfill: for each `UserPayment` with `enrollment_discount_id`, create one join row using that FK, existing `discount_amount` as the line amount, and current label resolution.
4. Stop writing `UserPayment.enrollment_discount` on new creates; column remains nullable for old rows until a later cleanup (optional follow-up).

No backfill recalculation of historical amounts.

---

## Testing (high-value)

**Engine**

- Two percents independently off same base.
- Percent + fixed.
- Scale when sum > base (lines sum to `discount_amount`).
- `first_period` only on period index 0 for that ED; other whole-enrollment EDs still apply.
- Two fixed whole-enrollment credits consume independently.

**API**

- Add second without removing first.
- Reject duplicate template.
- Set stack via `discount_ids`; remove one; clear all.
- Payment create snapshots multiple `UserPaymentDiscount` lines.
- Forbidden for roles without `payment.configure`.

**Frontend**

- Picker cannot select the same template twice.
- Remaining preview matches stacked total.
- Receipt shows multi-lines when more than one line.

Avoid happy-path-only smoke that only asserts 200 / “renders”.

---

## Out of scope

- Retroactive recompute of existing payments when the stack changes
- Type exclusivity matrices or staff-chosen apply order
- Promo codes / coupons / ad-hoc non-catalog discounts
- Changing legacy sibling `discount_price` beyond “any active ED → use plan price”
- Dropping the legacy `UserPayment.enrollment_discount` column in this change (stop writing only)

---

## Success criteria

1. Staff can keep two or more different eligible catalog discounts active on one enrollment from upload **or** roster UI.
2. New payments and invoice math show stacked totals consistent with independent-off-base + clamp/scale.
3. Receipts and payment detail can show per-discount lines; lists show a joined label.
4. Duplicate template application is rejected.
5. Existing payments remain unchanged when the enrollment stack is edited later.
