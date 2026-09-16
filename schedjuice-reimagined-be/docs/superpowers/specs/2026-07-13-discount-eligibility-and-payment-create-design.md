# Discount Eligibility & Payment-Create Apply — Design Spec

**Date:** 2026-07-13  
**Status:** Approved for planning  
**Extends:** `docs/superpowers/specs/2026-06-30-discount-engine-design.md` (workspace root; discount engine parent spec)

## Summary

Extend the existing **enrollment-scoped discount engine** so admins can pick a catalog discount when creating a student payment (`UserPayment`), with **hard eligibility gates** for rule-typed discounts (early bird, loyalty, bulk) and free selection for plain discounts. Add an org flag **`is_payment_plan_mandatory`** so “plan schools” (discounts / installments / invoicing) can require a course payment plan while “ledger schools” keep free-form payment recording without plans.

This is not a new discount math engine. Price resolution, snapshot-on-apply, one-active-discount-per-enrollment, and non-retroactive verified rows remain as in the 2026-06-30 spec.

---

## Confirmed decisions

| Topic | Choice |
|-------|--------|
| Discount attachment | Enrollment-scoped (`EnrollmentDiscount`); payment create is the UX entry point |
| Eligibility enforcement | **Mixed:** rule-typed discounts hard-gated; plain (`none`) freely selectable |
| Org payment plans | `Organization.is_payment_plan_mandatory` (default `false`) |
| Rules per template | One eligibility type per catalog discount |
| Early bird | `early_bird_days` on template; as-of date must be ≥ N days before `course.start_date` |
| Loyalty | Any prior student `UserCourse` at this org (excluding current enrollment) |
| Bulk | Concurrent **active** student enrollments (including current) ≥ `bulk_min_courses` |
| Existing enrollment discount on payment create | Preselect current; admin may keep or replace |
| Approach | Extend existing `Discount` catalog + shared eligibility evaluator (no separate eligibility table) |

---

## Problem / context

- Schools already use student payments as a **general ledger** without attaching payment plans to courses.
- Other schools want **discounts, installment periods, and receivable math**, which require a course `payment_plan`.
- Catalog CRUD for `Discount` exists; `EnrollmentDiscount` + `discount_engine` exist; apply UI is incomplete / not wired into payment create.
- Missing: eligibility rules, org mandatory-plan mode, and payment-create picker that applies/replaces enrollment discounts and previews invoiced amounts.

---

## Architecture

### Approach

**Extend catalog + enrollment snapshot** with eligibility fields and a shared evaluator used by:

1. Eligible-discounts picker (payment create / enrollment UI)
2. Apply/replace enrollment discount API (hard gate)

Rejected alternatives:

- Separate eligibility-policy table — unnecessary while one rule per discount
- Payment-row-only discounts — breaks installment/invoice consistency
- FE-only eligibility — forgeable and diverges from invoice cron

### Org modes

| Mode | `is_payment_plan_mandatory` | Behavior |
|------|-----------------------------|----------|
| Ledger | `false` (default) | Courses may omit `payment_plan`. Admin payments remain free-form. Discount picker/apply blocked when course has no plan. |
| Plan | `true` | Course create/update **requires** `payment_plan`. Discounts, installment pricing, and invoice generation assume a plan exists. |

Enabling the flag does **not** backfill plans onto existing courses. Missing-plan errors surface on course edit and on discount/invoice paths until operators attach plans.

### Price resolution (unchanged)

```
1. base = payment_plan.price
2. If active EnrollmentDiscount → apply snapshot rules
   Else if legacy sibling rule (2+ active courses) and plan.discount_price set
        → base = plan.discount_price
   Else → base unchanged
3. Compute invoiced_amount from base + discount rules
```

Eligibility is evaluated at **apply / picker** time only. Invoice math continues to use the enrollment snapshot.

### Percent / fixed / scope mapping (existing)

| Admin intent | Catalog config |
|--------------|----------------|
| % of per-period (monthly) fee | `discount_type=percent`, any scope (`first_period` or `whole_enrollment`) against plan period price |
| % across whole enrollment | `discount_type=percent`, `scope=whole_enrollment` (each period reduced) |
| Absolute money off | `discount_type=fixed_amount`, `first_period` or `whole_enrollment` (credit spread for whole) |

No new math types in this spec.

---

## Data model

### `Organization`

| Field | Type | Notes |
|-------|------|-------|
| `is_payment_plan_mandatory` | BooleanField, default `false` | When true, course create/update requires `payment_plan` |

### `Discount` (extensions)

| Field | Type | Notes |
|-------|------|-------|
| `eligibility_type` | enum | `none` \| `early_bird` \| `loyalty` \| `bulk` (default `none`) |
| `early_bird_days` | PositiveIntegerField, nullable | Required iff `early_bird`; N ≥ 1 |
| `bulk_min_courses` | PositiveIntegerField, nullable | Required iff `bulk`; N ≥ 2 |

Existing fields unchanged: `name`, `discount_type`, `percent_value`, `fixed_amount`, `scope`, `is_active`, `description`.

Constraints / validation:

- `eligibility_type=none` → both param fields null
- `early_bird` → `early_bird_days` set; `bulk_min_courses` null
- `loyalty` → both param fields null
- `bulk` → `bulk_min_courses` set; `early_bird_days` null

### `EnrollmentDiscount` (audit snapshot, recommended)

| Field | Type | Notes |
|-------|------|-------|
| `snapshot_eligibility_type` | enum | Copied at apply |
| `snapshot_early_bird_days` | nullable int | Copied when applicable |
| `snapshot_bulk_min_courses` | nullable int | Copied when applicable |

Math snapshot fields unchanged. Catalog edits still do not rewrite existing enrollment math.

### `UserPayment` breakdown (from parent spec; include if not yet shipped)

| Field | Notes |
|-------|-------|
| `base_amount` | Plan base before enrollment discount |
| `discount_amount` | Reduction for this period |
| `enrollment_discount` | FK → `EnrollmentDiscount`, nullable |

---

## Eligibility evaluator

New module: `app_finance/discount_eligibility.py`.

```python
def is_discount_eligible(
    *,
    discount: Discount,
    user: User,
    course: Course,
    user_course: UserCourse | None,
    as_of: date,
) -> tuple[bool, str | None]:
    """Returns (eligible, reason_code_if_not)."""
```

| `eligibility_type` | Passes when |
|--------------------|-------------|
| `none` | Always |
| `early_bird` | `course.start_date` present and `as_of <= course.start_date - early_bird_days` |
| `loyalty` | ≥1 other student `UserCourse` for this user at this org (exclude current `user_course` if provided) |
| `bulk` | Count of **active** student enrollments for this user (including current course) ≥ `bulk_min_courses` |

**As-of date (payment create):** org-local “today”, or the form’s chosen issue/invoice date when set.

**Reason codes (examples):** `early_bird_window_closed`, `early_bird_missing_start_date`, `loyalty_not_met`, `bulk_min_not_met`.

**Grandfathering:** If the enrollment already has an active discount that would fail eligibility *now*, payment create may **keep** it. Hard gates apply only to **newly selected** rule-typed discounts.

### Active enrollment definition (bulk)

**Definition for this spec:** student `UserCourse` rows for the user that count toward the existing finance sibling rule (2+ active courses → `payment_plan.discount_price`). Implementation must reuse that same helper/queryset so bulk eligibility and sibling pricing never disagree.

### Loyalty definition

Any historical student assignment at the org counts (completed, dropped, past terms). Only the current enrollment row is excluded.

---

## APIs

### Eligible discounts (new)

| Method | Route | Permission |
|--------|-------|------------|
| GET | `api/v1/user-courses/<id>/eligible-discounts` | `payment.configure` |

Query optional: `as_of=YYYY-MM-DD`.

Response shape:

```json
{
  "current": { "enrollment_discount_id": 1, "discount_id": 10, "name": "...", "...": "..." },
  "discounts": [
    {
      "id": 10,
      "name": "Early bird 10%",
      "discount_type": "percent",
      "scope": "whole_enrollment",
      "percent_value": "10.00",
      "eligibility_type": "early_bird",
      "early_bird_days": 14
    }
  ]
}
```

`discounts` contains **only selectable** items (active + plain or rule-passed). v1 omits an `ineligible` list.

### Apply / remove (existing, stricter)

`POST api/v1/user-courses/<id>/discount` must call the eligibility evaluator for rule-typed templates and return **400** with reason code on failure.

Still requires course `payment_plan`.

### Discount catalog CRUD

Accept and validate new eligibility fields on create/update.

### Organization

Expose `is_payment_plan_mandatory` on org read/update (existing org settings permission).

### Course create/update

When org flag is true and `payment_plan` is null → **400**.

### Payment create integration

Admin upload / record flow may:

1. Call eligible-discounts for the selected enrollment
2. On submit, if discount selection changed → apply/replace/remove enrollment discount
3. Compute `invoiced_amount` via `discount_engine` when a plan exists
4. Persist payment (+ breakdown fields when available)

OCR / `parsed_amount` / verification flows unchanged.

---

## Frontend UX

### Payment create (admin student-payment upload / record)

```
Student + Course
      │
      ▼
[ Discount picker ]  ← preselect current enrollment discount
      │                 hidden if course has no payment_plan
      ▼
Amount preview (base → discount → invoiced)
      │
      ▼
Coverage / screenshot / save
```

Picker options = eligible-discounts API only. Clearing selection removes the enrollment discount on save (same as DELETE apply).

### Discount catalog (`/discounts`)

Create/edit: eligibility type select; show `early_bird_days` or `bulk_min_courses` conditionally.

### Org settings

Toggle `is_payment_plan_mandatory`.

### Course / intake forms

When flag is on: payment plan required; hide or disable “no plan”.

### Enrollment discount dialog

Wire existing `EnrollmentDiscountDialog` (or equivalent) to the same eligible-discounts + apply APIs so enrollment and payment-create stay consistent.

---

## Error handling

| Case | Behavior |
|------|----------|
| No payment plan on course | Picker hidden; apply 400 (existing) |
| Mandatory plan + course without plan | Course save 400; FE blocks submit |
| Rule-typed discount fails eligibility | Not in picker; apply 400 with reason |
| Inactive discount | Not selectable; apply 400 |
| Early bird, missing `start_date` | Ineligible |
| Keep current discount that would fail now | Allowed (grandfather) |
| Verified `UserPayment` rows | Never recalculated on discount change |

---

## Edge cases

- **Bulk** counts the course being paid for once (including mid-session enroll-then-pay).
- **Legacy sibling `discount_price`** applies only when there is no active `EnrollmentDiscount`.
- **Stacking:** still one active enrollment discount; replace = deactivate old + create new.
- **Ledger schools** continue creating payments without plans; they simply do not use this discount path until a plan exists (or they flip the org flag and attach plans).

---

## Testing

### Unit

- Eligibility matrix: `none`; early bird inside/outside window; missing start date; loyalty yes/no; bulk at `N-1` and `N`.
- Catalog validation for eligibility params.
- Course serializer/org flag: mandatory plan rejects null plan.
- `discount_engine` math regressions with eligibility snapshot fields present.

### API

- Eligible-discounts returns only selectable items; preselect/current populated.
- Apply rejects failing rule-typed discount; allows plain; allows grandfather keep.
- Payment create with discount replace updates enrollment + invoiced breakdown.

### Integration / FE

- Mandatory-plan org: course form requires plan.
- Ledger org: payment create without plan still works; no discount picker.
- Invoice cron still uses active enrollment discount.

---

## Out of scope

- Promo codes / student self-serve discount claim
- Multiple eligibility rules per template (AND/OR)
- Auto-apply “best” discount without admin selection
- Subject/program-scoped loyalty
- Intake-scoped bulk counting
- Migrating legacy `PaymentPlan.discount_price` sibling rule into catalog templates
- Backfilling payment plans when enabling the org flag

---

## Implementation sketch (for planning)

1. Org flag + course validation  
2. Discount model/API eligibility fields + catalog UI  
3. `discount_eligibility` module + tests  
4. Eligible-discounts endpoint; harden apply  
5. EnrollmentDiscount eligibility snapshots  
6. Payment-create picker + preview + apply-on-save  
7. Wire enrollment discount dialog  
8. UserPayment breakdown fields if still missing  
9. FE org/course mandatory-plan UX  

---

## Relationship to parent spec

Unchanged from 2026-06-30:

- Catalog + snapshot architecture  
- Percent / fixed × first_period / whole_enrollment math  
- One active discount per enrollment  
- Non-retroactive verified payments  
- Legacy sibling coexistence  

Added by this spec:

- Eligibility types and evaluator  
- Payment-create as primary apply surface  
- `is_payment_plan_mandatory`  
- Eligibility audit snapshots on enrollment discount  
