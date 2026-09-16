# Coverage-Driven Payment Pricing & Billing Type — Design Spec

**Date:** 2026-07-26
**Status:** Approved for planning
**Extends:** [2026-07-13-discount-eligibility-and-payment-create-design.md](./2026-07-13-discount-eligibility-and-payment-create-design.md), [2026-07-21-multi-discount-stacking-design.md](./2026-07-21-multi-discount-stacking-design.md), and the original discount engine spec at workspace `docs/superpowers/specs/2026-06-30-discount-engine-design.md`
**Surfaces:** `discount_engine`, payment create/update, invoice cron, admin report, payment receipts

## Summary

Price a payment from the **months it covers** and the plan's **billing type**, instead of from a single
`billing_period_index` derived from the count of prior payments.

Today `compute_invoiced_amount` always treats `PaymentPlan.price` as a per-period base and divides
whole-enrollment fixed discounts by the course's month count. `PaymentPlan.billing_type` is read in exactly
one place in the entire backend (the admin report's remaining-amount calculation) and is ignored by the
pricing engine. The result is that a whole-term plan is invoiced its full term fee every period while its
discounts are shrunk to a per-month slice.

After this change a transaction records one total for the set of months it covers. There is **no per-month
amount breakdown** — that was explicitly ruled out. Admins can override the final figure on any payment, and
the engine-computed value is retained for audit.

---

## Confirmed decisions

| Topic | Choice |
|-------|--------|
| Pricing input | The payment's covered months, not a payment-count period index |
| Per-period plans | `price × covered months`, minus each covered month's discount share |
| Whole-term plans | Base apportioned by `covered ÷ course months`; discounts applied **in full on the first transaction**, not apportioned |
| Whole-term discount exhaustion | Clamped to the transaction's base; the unused remainder carries to the next transaction |
| Course term total | **Stable.** Identical on every receipt for the enrollment, regardless of date or how payments are split |
| Per-month amount rows | **Not built.** A transaction has one total; coverage rows stay amount-free |
| Admin override | Always allowed on the final figure; computed value retained separately |
| `Scope.FIRST_PERIOD` on whole-term | Applies once against the term fee (there is only one charge) |
| Whole-term percent discounts | Get a `remaining_credit` at apply time so "once only" works for every discount type |
| Invoice cron, whole-term | One invoice for the full term at course start, then stop |
| Repricing on edit | Automatic when covered months change, unless overridden |
| Existing payments | Backfilled so historical receipts reprint correctly |
| Regression guard | `.cursor/rules/finance-pricing-invariants.mdc` scoped to `app_finance/` |

---

## Problem / context

### Observed symptom

Two production receipts, both stacking Super Early Bird (180,000 fixed) and Loyalty (40,000 fixed):

| Receipt | Course months | Discount shown | Derivation |
|---------|---------------|----------------|------------|
| #172 (ACCA AA) | 5 | 44,000 | 180,000 ÷ 5 + 40,000 ÷ 5 |
| #175 (Test) | 4 | 55,000 | 180,000 ÷ 4 + 40,000 ÷ 4 |

The discount appears to "shift with the base amount" but actually shifts with the **course's month count**.

Receipt #172 is a whole-term plan: the 410,000 term fee should net to **190,000** after both discounts, which
is exactly what the student paid. The system invoiced 366,000 because it applied one month's discount share
against the full term fee.

### Root causes

1. **`billing_type` is not honored by the pricing engine.** `resolve_base_price` returns `payment_plan.price`
   unconditionally. Only `app_finance/views.py` (admin report) branches on billing type, duplicating the
   term-fee rule.
2. **Whole-enrollment discounts are always divided by period count.** `apply_enrollment_discount` stores
   `per_period_share = fixed_amount / estimate_billing_period_count(...)` regardless of billing type.
3. **Coverage and amounts are decoupled.** `UserPaymentCoveredMonth` records which months a payment covers but
   carries no amount, and `compute_invoiced_amount` prices exactly one period. A transaction covering five
   months stores one month's figures.
4. **The period index is derived from payment count.** `enrollment_billing_period_index` counts existing
   payments, so pricing is not idempotent — re-saving shifts which period a payment is billed as.

Consequence for the cron: `generate_invoices` re-invoices a whole-term plan its full term fee every
`invoice_generation_interval_days`.

---

## Architecture

### Approach chosen

**Coverage-driven pricing inside `discount_engine`.** The engine already owns discount stacking, the
scale-to-base clamp, and credit consumption; pricing rules stay in one module rather than being split across a
second layer.

Rejected alternatives:

1. **Separate pricing layer over an unchanged engine.** Smaller diff to well-tested code, but two modules would
   know pricing rules, the whole-term path would bypass the engine and duplicate the stacking clamp, and
   sequencing `remaining_credit` consumption across a month loop from outside the engine is error-prone.
2. **Uniform term-fee slicing for both plan types.** A single formula
   (`discounted_total × covered ÷ course months`) is the simplest model and matches the whole-term rule
   exactly, but it smears `Scope.FIRST_PERIOD` discounts across the term for per-period plans. Adopting it
   would require redefining or dropping first-period scope.

### New primitives

| Helper | Responsibility |
|--------|----------------|
| `course_months(course) -> list[MonthTuple]` | Inclusive calendar months from `start_date` to `end_date`. Replaces the duplicated math in `estimate_billing_period_count` and `calendar_months_for_course`. |
| `resolve_term_fee(plan, course) -> Money` | `plan.price` for whole-term; `plan.price × len(course_months)` for per-period. Becomes the single source for `views.py` too. |

`estimate_billing_period_count` is retained as `len(course_months(course))` so existing callers keep working.

### Pricing — per-period plans

Priced month by month so `Scope.FIRST_PERIOD` still applies only to the course's first month.

```
remaining = {ed.id: ed.remaining_credit for ed in active_eds}
base_amount = 0
totals = {ed.id: 0}

for m in covered_months:                       # sorted chronologically
    i      = course_months.index(m)            # course-relative index
    base_m = resolve_base_price(...)           # plan.price, or discount_price under the sibling rule
    raw    = [(ed, line_discount(ed, base_m, i, remaining[ed.id])) for ed in active_eds]
    scaled = scale_lines_to_base(raw, base_m)  # existing clamp, unchanged
    for ed, amt in scaled:
        totals[ed.id]    += amt
        remaining[ed.id] -= amt                # decrement within the transaction
    base_amount += base_m

discount_amount = sum(totals.values())
invoiced_amount = base_amount - discount_amount
```

Decrementing `remaining` inside the loop matters: without it, a fixed whole-enrollment credit would be applied
at full share for every month of a multi-month transaction. `preview_invoiced_amounts` already simulates this
per period and its logic is the reference.

*Example.* Plan 100,000/month, 6-month course, Early Bird 180,000 fixed whole-enrollment (share 30,000/month).
A transaction covering 3 months invoices `300,000 − 90,000 = 210,000`.

### Pricing — whole-term plans

Only the **base** is apportioned by month count. Discounts are **not** apportioned: they land in full on the
first transaction, and the credit mechanism stops them applying again.

```
term_base   = plan.price
ratio       = len(covered_months) / len(course_months)
base_amount = round_money(term_base * ratio)

# remaining_credit already holds each discount's full value (set at apply time).
raw   = [(ed, ed.remaining_credit or 0) for ed in active_eds]
lines = scale_lines_to_base(raw, base_amount)   # existing clamp; no new apportionment

discount_amount = sum(lines)
invoiced_amount = base_amount - discount_amount
```

`scale_lines_to_base` provides clamp-and-carry for free. When the first transaction is too small to absorb the
whole discount, the lines are scaled down to exactly `base_amount` (invoiced 0) and consumption leaves the
unused remainder on `remaining_credit` for the next transaction. No dedicated apportionment helper is needed.

**Invariant:** the invoiced amounts across all of an enrollment's transactions sum to the course term total,
however the payments are split.

*Example (receipt #172).* Term 410,000, Early Bird 180,000 + Loyalty 40,000, 5 course months.

| Split | Base | Discount | Invoiced |
|-------|------|----------|----------|
| One transaction, 5 months | 410,000 | 220,000 | **190,000** |
| #1 covers 3 months | 246,000 | 220,000 | 26,000 |
| #2 covers 2 months | 164,000 | 0 (spent) | 164,000 |
| Five 1-month transactions | 82,000 each | 82,000 / 82,000 / 56,000 / 0 / 0 | 0 / 0 / 26,000 / 82,000 / 82,000 |

Every split totals 190,000.

**`apply_enrollment_discount` on whole-term plans** sets `remaining_credit` for **every** discount type, not
just fixed whole-enrollment ones: percent becomes `term_fee × percent`, fixed becomes
`min(fixed_amount, term_fee)`. Without a credit a percent discount has no "already used" marker and would
re-apply on every transaction. `per_period_share` is left null — a field named "per period share" holding a
whole-term total is precisely the trap that produced the original bug.

**`consume_discount_state_after_invoice`** decrements `remaining_credit` whenever it is set, for any discount
type, and separately sets `first_period_consumed` when course-relative index 0 is in the span. The two are
independent rather than mutually exclusive, so a whole-term first-period discount records both.

### Course term total

`compute_course_term_total(user_course, payment_plan) -> Money` returns what the student owes for the whole
course after discounts. It is **stable**: the same value on every receipt for the enrollment, no matter the
date or how the payments are split.

It reads each discount's **snapshot** value (`snapshot_fixed_amount`, `snapshot_percent_value`), never
`remaining_credit` — the credit shrinks as payments consume it, so using it would make the total drift
downward between a student's first and last receipt, which is the confusion this whole change exists to
remove.

Per discount, against `term_base = resolve_term_fee(...)` and `months = len(course_months(course))`:

| Discount | Contribution |
|----------|--------------|
| Percent, whole-term plan | `term_base × percent` |
| Percent, per-period + `WHOLE_ENROLLMENT` | `term_base × percent` (applies every month) |
| Percent, per-period + `FIRST_PERIOD` | `(term_base ÷ months) × percent` (one month) |
| Fixed, whole-term plan | `min(fixed_amount, term_base)` |
| Fixed, per-period + `WHOLE_ENROLLMENT` | `fixed_amount` (credit spread over the term) |
| Fixed, per-period + `FIRST_PERIOD` | `min(fixed_amount, term_base ÷ months)` |

The sum is clamped to `term_base` by the same `scale_lines_to_base` helper.

### Period index

`billing_period_index` becomes the course-relative index of the transaction's **earliest covered month**,
replacing `enrollment_billing_period_index`'s payment count. Pricing becomes idempotent — re-saving a payment
no longer changes which period it bills as.

### Credit consumption

`consume_discount_state_after_invoice` takes the covered month span instead of a single index:

- `first_period_consumed` is set only when course-relative index `0` falls inside the span.
- `remaining_credit` decrements by the line total for the whole span, not one month.

### Units

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `course_months` / `resolve_term_fee` | Course calendar and term-fee derivation | `Course`, `PaymentPlan` |
| `compute_invoiced_amount` | Price a covered-month span for either billing type; return aggregates + lines | the above, `EnrollmentDiscount` |
| `compute_course_term_total` | Stable whole-course total after discounts, from snapshot values | `resolve_term_fee`, `EnrollmentDiscount` |
| `payment_discount_apply` | Resolve coverage, price, snapshot discount lines onto the payment | engine, serializers |
| `payment_repricing_audit` | Report payments whose stored amounts differ from recomputed | engine |
| `payment_repricing_backfill` | Apply the recompute | audit, engine |
| Receipt helpers | Render ordinal, month count, term progress, adjusted marker | payment read fields |

---

## Data model

Only `UserPayment` changes. `UserPaymentCoveredMonth` is untouched — no amount column, by decision.

| Field | Type | Notes |
|-------|------|-------|
| `computed_invoiced_amount` | MoneyField, null | What the engine calculated. Always written, even when overridden. |
| `is_amount_overridden` | Boolean, default `False` | Set when an admin supplies an explicit final figure. |
| `amount_override_reason` | Char(2000), null/blank | Free-text audit note. |

`invoiced_amount` remains the authoritative effective value, so every existing reader (admin report, unpaid
helpers, group aggregation, receipts) keeps working with no change. All recomputation paths skip payments
where `is_amount_overridden` is `True`.

Each new field carries `help_text` stating when it is set.

---

## Behaviour changes by call site

### `UserPaymentSerializer.create`

Current ordering blocks coverage-driven pricing: amounts are computed before the instance exists, and coverage
rows are written after it. New order:

1. Resolve coverage — explicit `covered_months`, else the installment path, else the implicit `issued_at` month.
2. Validate coverage against the course calendar.
3. Price using that coverage.
4. Create the instance.
5. Persist discount lines and coverage rows.

### `UserPaymentSerializer.update`

Gains repricing: when covered months change and the payment is not overridden, amounts recompute. Today
`update` never reprices, so an edited coverage set silently keeps stale amounts.

An explicit `invoiced_amount` in the request payload marks the payment overridden — `is_amount_overridden`
is set, `computed_invoiced_amount` keeps the engine value, and `amount_override_reason` is stored when supplied.

### `generate_invoices`

- **Whole-term:** generate one invoice covering all course months at course start, then stop. Skip when any
  payment already exists for the enrollment.
- **Per-period:** unchanged cadence, but the invoice writes coverage rows for the month it bills and prices
  from them.

### `preview_invoiced_amounts`

Returns a single row for whole-term plans instead of N period rows.

### `views.py` admin report

Calls `resolve_term_fee` instead of re-implementing the term-fee branch inline.

---

## Receipts

Serving "how many times they pay, and which months in what time":

| Element | Content |
|---------|---------|
| Payment ordinal | `Payment #2` — position among that student's payments for the course, ordered by `issued_at`, then `id` |
| Months covered | Existing billing-period line plus a count: `October 2026 – February 2027 (5 months)` |
| Term progress | `Term total 190,000 · Paid to date 190,000`, where the term total comes from `compute_course_term_total` and never changes between a student's receipts |
| Adjusted marker | Shown when `is_amount_overridden`, alongside `computed_invoiced_amount` |

All three of ordinal, term total, and paid-to-date are facts about the `(user, course)` pair rather than about
the individual payment, so a single bulk attach method computes them per distinct pair, following the existing
`_attach_installment_cumulative_metadata` pattern in `views.py`. Computing them as per-row serializer methods
would issue three queries per row.

A window function is deliberately avoided for the ordinal: the payment list runs through `RBACSearchView`,
which applies `.distinct()` and dynamic filtering, and the ordinal must reflect the student's full history
rather than the filtered page.

FE `PaymentReceiptPayload` gains `paymentSequence`, `monthsCoveredCount`, `termProgress` (the combined
"Term total X · Paid to date Y" string), and `adjustedNote` (non-null only when the amount was overridden,
carrying the computed figure).

---

## Backfill

Mirrors the existing `legacy_fully_paid_audit.py` / `legacy_fully_paid_backfill.py` pair, including CSV output
and per-schema iteration.

| Component | Purpose |
|-----------|---------|
| `payment_repricing_audit.py` | Report payments whose stored amounts differ from recomputed, with the delta |
| `payment_repricing_backfill.py` | Apply the recompute |
| `audit_payment_repricing` command | `--dry-run` by default, CSV out |
| `backfill_payment_repricing` command | Applies; supports `--course`, `--limit`, `--dry-run` |
| Data migration | Invokes the backfill so historical receipts reprint correctly |

**Safety rules:**

- Only `base_amount`, `discount_amount`, `invoiced_amount`, and `computed_invoiced_amount` are rewritten.
  `parsed_amount` and `actual_amount` are never touched — what was actually paid is not a computed value.
- Payments with `is_amount_overridden` are skipped.
- Payments whose coverage includes months outside the course calendar are **skipped and flagged** for human
  review rather than guessed at.
- The backfill is idempotent: re-running produces no further changes.

Stale `per_period_share` values on whole-term `EnrollmentDiscount` rows are nulled, since the new code path
ignores that field for whole-term plans.

---

## Edge cases

| Case | Behaviour |
|------|-----------|
| Payment with no explicit coverage rows | Falls back to the implicit `issued_at` month (existing `month_tuples_from_payment` rule) |
| Course with no `start_date` / `end_date` | `course_months` is empty; ratio treated as `1` (full term); per-period falls back to a single period |
| Covered month outside the course calendar | Rejected on write. Must stay consistent with the in-flight out-of-range-month work in `payment_coverage.py` and `test_payment_coverage_month_eligibility.py` |
| Discounts sum above the base | Existing `scale_lines_to_base` clamp applies, per billing type |
| Fixed credit smaller than the covered span | Bounded by `remaining_credit`; later months in the same transaction receive nothing |
| Whole-term plan, coverage equals full term | `ratio = 1`; discounts apply at full value |
| Whole-term discount exceeds the first transaction's base | Lines clamped to base (invoiced 0); unused credit carries to the next transaction |
| Whole-term second transaction after credit is spent | `remaining_credit` is 0, so discount is 0 and the base is invoiced in full |
| Overridden payment, coverage later edited | Amounts left alone; `computed_invoiced_amount` still refreshed for audit |
| Group payments | Aggregation unchanged; parts are priced individually and summed as they are today |

---

## Testing

Weighted toward real risk, per `.cursor/rules/high-value-tests.mdc`. Run with
`./scripts/run_backend_tests.sh` against the Docker test DB, always with `--keepdb`.

**Regression anchor.** `test_whole_term_discounts_are_not_divided_by_period` pins receipt #172 exactly:
term 410,000, Early Bird 180,000 + Loyalty 40,000, 5 course months, 5 covered → invoiced 190,000. Named and
commented so a failure states which rule broke rather than only showing a number mismatch.

Additional coverage:

- Whole-term base apportioned at 3-of-5 months while the discount lands in full
- Whole-term split across transactions: invoiced amounts sum to the term total for a 3+2 split and for five 1-month payments
- Whole-term discount clamped on an undersized first transaction, with the remainder carried forward
- Whole-term percent discount applying once, not on every transaction
- `compute_course_term_total` returning the same value before and after payments consume credit
- Per-period multi-month summing, with `FIRST_PERIOD` applying only at course-relative index 0
- `remaining_credit` not double-consumed across two transactions, nor across months within one transaction
- Coverage outside the course calendar rejected on write
- Repricing on coverage edit; both repricing and backfill skipping overridden payments
- Backfill idempotency, and that it never mutates `actual_amount` / `parsed_amount`
- Cron issuing exactly one whole-term invoice instead of repeating each interval
- Admin report and engine agreeing on term fee for both billing types

---

## Regression guardrails

Requested explicitly so future agents do not reintroduce this class of bug.

1. **Module docstring on `discount_engine.py`** stating the invariants plainly: coverage drives pricing;
   whole-term discounts are never divided by period; `base − discount = invoiced` always holds;
   `per_period_share` is meaningless for whole-term plans.
2. **Docstrings on `resolve_term_fee` and `compute_invoiced_amount`** covering both branches with one worked
   example each.
3. **`help_text` on the three new `UserPayment` fields.**
4. **The named regression test above**, commented with a link to this spec.
5. **`.cursor/rules/finance-pricing-invariants.mdc`**, scoped to `app_finance/`, carrying the same invariants.
   This is the piece that actually prevents recurrence — docstrings only reach agents who happen to open the
   file, whereas a scoped rule loads automatically for anyone touching pricing.
