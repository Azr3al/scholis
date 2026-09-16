# Multi-Part Student Payments + Sync OCR Preview — Design Spec

**Date:** 2026-07-10  
**Status:** Approved for planning  
**Surface:** Admin student-payments upload + admin report grid  
**Related:** workspace `docs/superpowers/specs/2026-06-04-installment-student-payments-design.md`; BE `docs/PAYMENT_VERIFICATION_FLOW.md`

## Summary

Admins can record **one logical payment** that still uses the existing plan modes (single-month, multi-month, installment) but is backed by **two or more screenshots**. Each screenshot is a separately verifiable **part** with its own payment method, amount, and transaction ID. The logical payment’s total is always the **sum of part amounts**.

Single-screenshot create remains first-class: one part, no group row in the database.

Upload UX improves OCR: choosing a screenshot runs a **synchronous OCR request** and fills eligible fields on the spot (fields show loading for that request only). No polling.

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Mental model | One logical payment; N screenshots/methods; one total = sum of parts |
| Plan modes | Unchanged: single-month / multi-month / installment on the logical payment |
| Storage | Approach 1: `UserPaymentGroup` + child `UserPayment` parts when parts > 1 |
| Single payment | `UserPayment` with `group=null` (today’s shape) |
| Amounts | Per-part amount required; group total is derived (no separate total field) |
| Payment method | Required per part; part 2+ defaults to part 1’s method, overridable |
| Verification | Each part verifies independently; group is fully verified only when all parts are |
| Audience | Admin now; student `make-payment` multi-part later |
| Entry point | Extend `/finances/student-payments/upload` with progressive multi-part UX |
| Grid | One row per logical payment (group projection when multi-part) |
| OCR | Sync preview endpoint; fill fields immediately; no job/poll |
| Create OCR | Skip re-OCR on create when preview already supplied txn/amount; still run duplicate-txn checks |
| Coverage edits | Owned by the group when multi-part; lock coverage when **any** part is verified |
| Receipts | Stay 1:1 with a verified **part** for this change (combined group receipt out of scope) |

## Goals / non-goals

**Goals**

- Support multi-screenshot, multi-method admin recording without abandoning single-upload.
- Keep OCR + CSV verification per screenshot/transaction ID.
- Make OCR feel instant on the upload form (sync fill).
- Show one coherent row in the month grid for a multi-part payment.

**Non-goals**

- Student self-service multi-part upload
- Combined PDF receipt for a whole group
- Rework of cross-student batch page `/screenshots/create`
- Changing CSV verify payload format
- Async OCR jobs / polling for preview

## Architecture

```
Upload form (1..N parts)
    │
    ├─ per screenshot ──POST /ocr-payment-screenshot──► sync OCR fields
    │
    └─ submit
         ├─ 1 part  ──► UserPayment (group=null)     [first-class single]
         └─ 2+ parts ──► UserPaymentGroup
                              └─ UserPayment part × N
                                   (screenshot, method, amount, txn, status)

Admin report ──► one grid row per UserPayment | UserPaymentGroup projection
CSV verify   ──► matches transaction_id on a part (unchanged)
```

## Data model

### `UserPaymentGroup` (new)

Created only when a logical payment has **2+ parts**.

| Field | Notes |
|-------|--------|
| `user`, `course` | Student + course |
| Plan / coverage | Same semantics as today’s single payment: `issued_at` / billing window, `covered_months` (or installment fields + derived coverage) |
| `is_installment`, `installment_percent`, installment through-month inputs | On the group when multi-part |
| `created_by`, timestamps | Audit |
| **Not stored** | amount, screenshot, payment_method, status, transaction_id |

Group total and status are **derived** from parts.

### `UserPayment` (part — existing model + FK)

| Change | Notes |
|--------|--------|
| `group` | Nullable FK → `UserPaymentGroup`. Null = standalone single payment |
| Unchanged | `screenshot`, `payment_method`, `parsed_amount`, `transaction_id`, OCR fields, verification status, `actual_amount`, etc. |

**Rules**

- Denormalize `user` / `course` onto each part (same values as the group) so OCR, verify, and search keep working without joins.
- For multi-part payments, **plan + coverage are authoritative on the group**. On create, copy derived `UserPaymentCoveredMonth` rows (and installment flags as needed) onto each part only if existing month-report queries require payment-level coverage; otherwise report joins via `group_id`. Parts never expose independent coverage editing.
- Standalone payments (`group=null`) keep plan + coverage on the payment exactly as today.
- No unique constraint on `(user, course, month)` — overlaps remain allowed; overlap UI treats a **group as one unit** (parts do not flag each other).

### Status rollup (UI / report)

Most actionable part status wins:

1. `duplicated`
2. `amount_mismatch`
3. `cannot_extract`
4. `awaiting_extraction`
5. `pending_verification`
6. `pending_payment`
7. all `verified` → `verified`

## Upload UX

Path: `/finances/student-payments/upload` (existing plan radios stay).

### Progressive disclosure

- Default: **one** screenshot block, no “Part 1” chrome — same mental model as today.
- **Add another screenshot** → label parts, show live **Total (sum)**, prefills method from part 1.
- Removing parts down to one restores single-payment chrome (submit creates `group=null`).

### Per-part fields

- Screenshot (required)
- Amount (required; may be OCR-filled)
- Payment method (required; part 2+ defaults from part 1)
- Transaction ID (optional manual; OCR-filled when possible)
- Other OCR-eligible fields already used today (e.g. date on screenshot) when returned

### Sync OCR on file select

```
User selects screenshot for part
  → part OCR-backed fields enter loading / disabled
  → POST /ocr-payment-screenshot (multipart)
  → 200: fill transaction_id, parsed_amount, date_on_screenshot (etc.)
  → failure: unlock empty fields + inline “Couldn’t read this screenshot — enter manually” + retry
```

- Submit disabled while any part OCR request is in flight, or while any part lacks required screenshot / amount / method.
- Replacing a screenshot re-runs OCR for that part; ignore late responses from superseded requests.
- Client blocks two parts in the same submit sharing the same transaction ID; server rejects as well.
- Duplicate txn vs an **existing** payment: warn on preview when detectable; on save, part gets `duplicated` as today.

### Lo-fi (multi)

```
Upload payment — Ada / Course X

Plan: (•) Single month  ( ) Multi-month  ( ) Installment
Month: [ July 2026 ▼ ]

┌─ Part 1 ─────────────────────────────────────┐
│ Screenshot [drop / choose]                   │
│ Amount     [ 50,000 ]                        │
│ Transaction ID [ … ]                         │
│ Method     [ KPay ▼ ]                        │
└──────────────────────────────────────────────┘
┌─ Part 2 ─────────────────────────────────────┐
│ Screenshot [drop / choose]                   │
│ Amount     [ 30,000 ]                        │
│ Transaction ID [ … ]                         │
│ Method     [ KPay ▼ ]  ← prefilled from #1   │
└──────────────────────────────────────────────┘
[+ Add another screenshot]

Total (sum): 80,000

[ Cancel ]  [ Upload payment ]
```

## API

### `POST /api/v1/ocr-payment-screenshot` (new)

- Auth: `payment.record`
- Body: `screenshot` file
- Runs existing KPay OCR path **synchronously** in-request
- Does **not** create a `UserPayment`
- Success: extracted fields (`transaction_id`, `parsed_amount`, `date_on_screenshot`, plus any stable extras already produced by OCR)
- Unreadable / provider error: structured failure (not a bare 500); client falls back to manual entry
- Optional: if extracted `transaction_id` already exists, include a non-blocking warning payload (`duplicate_of_payment_id`)

### `POST /api/v1/scan-transaction-screenshots` (extend)

Keep legacy flat single-part body working.

Multi-part body (shape illustrative):

- Shared: `user`, `course`, plan fields (`issued_at` / `covered_months` / installment fields)
- `parts`: array of `{ screenshot, parsed_amount, payment_method, transaction_id?, date_on_screenshot?, … }`

Behavior:

| Parts | Persist |
|-------|---------|
| 1 (or legacy flat) | One `UserPayment`, `group=null` |
| 2+ | One `UserPaymentGroup` + N `UserPayment`s |

- If client already sent OCR-confirmed `transaction_id` / amount, **do not re-OCR**; still run duplicate-txn checks and receiver-side reverse match.
- If screenshot present but no txn/amount and no successful preview, existing async OCR path may still run for that part (backward compatible for callers that skip preview). Prefer upload form always using preview.
- Create is **all-or-nothing** (transaction): no orphan parts on failure.

### Read / report

- `POST user-payments/admin-report` returns either a normal payment row or a **group projection**:
  - `kind: "payment" | "group"`
  - for groups: `group_id`, `part_count`, summed amount, rolled-up status, method summary, nested `parts` (or lazy-fetch by `group_id`)
- `GET user-payment-groups/<id>` (or equivalent) for drawer detail with nested parts

### Unchanged

- `POST verify-screenshots` — still matches by `transaction_id` to one `UserPayment` (part)
- Student `POST make-payment`
- Retry extraction on an existing part

## Grid & detail

**Grid**

- One row per standalone payment or per group.
- Group row: amount = sum; method = shared method or “Multiple”; txn = “N transactions” / blank; screenshot = file count; status = rollup.
- Overlap chips: group counts as one logical payment.

**Drawer / detail**

- List parts: thumb, amount, method, txn, status, per-part actions (retry OCR, open screenshot).
- Plan / coverage edit on the group; locked if any part is `verified`.

## Error handling & edge cases

| Case | Behavior |
|------|----------|
| OCR timeout / provider error | Unlock fields; manual entry + retry |
| Same txn ID twice in one submit | Client + server reject |
| Duplicate txn vs existing payment | Preview warning; save → `duplicated` on that part |
| Part amount ≤ 0 | Validation error |
| Mid-OCR screenshot replace | Abort/ignore previous request for that part |
| Any part verified | Lock group coverage / plan edits |
| Drop from 2 parts to 1 before submit | Submit as standalone (`group=null`) |

## Testing

**Backend**

- OCR preview success / failure / duplicate warning
- Single create still `group=null` and backward-compatible flat body
- Multi create: group + N parts, coverage on group, all-or-nothing rollback
- Reject duplicate txn IDs within one multi create
- Skip re-OCR when prefilled; still duplicate-check
- Admin report: one projected row, sum amount, status rollup table
- Parts do not self-flag as month-overlap peers
- CSV verify still verifies individual parts; group shows `verified` only when all parts verified

**Frontend**

- Single-part path remains default and uncluttered
- Add part prefills method; total updates as sum
- OCR loading → fill; submit blocked while OCR in flight
- OCR failure allows manual complete + submit
- Grid one row for multi-part; drawer lists parts

## Out of scope

- Student multi-part `make-payment`
- Combined group-level receipt PDF
- `/screenshots/create` multi-student batch redesign
- Async OCR preview / websocket progress
- Migrating historical payments into groups (none needed; all existing rows stay `group=null`)
