# Student Payment Receipt Enhancements

**Date:** 2026-07-21  
**Status:** Approved (design)  
**Scope:** `schedjuice-reimagined-fe` + `schedjuice-reimagined-be` (admin-report / payment list fields only)  
**Supersedes / extends:** [2026-06-13-student-payment-receipt-design.md](./2026-06-13-student-payment-receipt-design.md)

## Problem

Staff can already download a client-generated PDF receipt for verified student payments, but the receipt is incomplete for real finance use:

- Multi-month coverage is only a flat comma-separated list (no contiguous range).
- Discount / base / invoiced amounts are not shown.
- Branding is left-aligned; product wants logo top-center with school name underneath.
- Download is Glide-grid only — missing from ResourceTable and student Payment History.
- Multi-part (grouped) payments have no combined receipt.

We explicitly **do not** denormalize receipt snapshot columns onto `UserPayment`. Receipts continue to use live payment + related data.

## Decisions (locked)

| Question | Decision |
|---|---|
| Data storage | **No new receipt columns** — use existing payment fields / relations |
| Architecture | **Approach 1** — extend list/report payloads + enhance client `@react-pdf/renderer` PDF |
| Amount breakdown | Base, discount (name + amount), amount paid; show **invoiced** only when it differs from amount paid |
| Amount paid priority | `actual_amount` → `parsed_amount` → `invoiced_amount` |
| Multi-month display | Contiguous months → range (`January – March 2026`); otherwise comma-separated |
| Header | Logo top-center; org name centered underneath |
| Surfaces | Glide grid, ResourceTable, student Payment History |
| Groups | **One combined receipt** for the whole group (not per-part on staff grids) |
| Availability | Verified only (group: all parts verified / rolled-up status `verified`) |

## Architecture

```
Admin report row / payment history row (+ group parts as needed)
  → buildPaymentReceiptPayload | buildGroupPaymentReceiptPayload
  → PaymentReceiptPdfDocument (@react-pdf/renderer)
  → pdf().toBlob() → downloadFile()
```

### Backend (`schedjuice-reimagined-be`)

Extend `admin_report_payment_row` in `app_finance/payment_group.py` (and group rollup in `_admin_report_group_row`) to include:

| Field | Source |
|---|---|
| `base_amount` | `UserPayment.base_amount` |
| `discount_amount` | `UserPayment.discount_amount` |
| `invoiced_amount` | `UserPayment.invoiced_amount` |
| `actual_amount` | `UserPayment.actual_amount` |
| `discount_label` | Enrollment discount display name when present; else `null` |

**Group row rollup**

- Sum money fields across parts (treat missing as zero for sums; if all missing, expose `null` for that field).
- Amount paid for the group uses the same per-part priority, then sums those resolved paid amounts.
- `discount_label`: shared label if all parts agree; `"Multiple"` if they differ and at least one has a label; `null` if none.
- Keep `parts` with the same amount/discount fields so the combined PDF can list per-part lines.
- Prefetch `enrollment_discount` (and nested discount name as needed) on the admin-report queryset to avoid N+1.

**Payment history / user-payment list**

Ensure the student-facing list serializer exposes the same amount + discount fields and `covered_months` (and `group_id`) so Payment History can build receipts without a dedicated receipt endpoint.

No new PDF endpoint. No new DB columns/migrations for receipt snapshots.

### Frontend (`schedjuice-reimagined-fe`)

| Area | Change |
|---|---|
| `payment-receipt.ts` | Paid-amount resolver; contiguous billing-period formatter; discount/invoiced lines; group payload builder + filename |
| `payment-receipt-pdf.tsx` | Centered logo + org name; amount breakdown section; optional parts table for groups |
| `student-payments-grid.tsx` | Download on verified group rows; hide on grouped part rows |
| ResourceTable | Add Download receipt with same visibility rules |
| Payment History | Add Download for verified standalone payments; for grouped parts, combined group receipt when group is fully verified |
| Types / admin-report row | Include new amount + discount fields |

**Permissions**

- Staff: existing `canDownloadPaymentReceipt` (`payment.verify` \| `payment.export` \| `payment.view_all`).
- Students: any user on their own Payment History rows (API already scopes to self); verified only.

## Receipt content & layout

Single-page A4. Does **not** embed the bank screenshot.

```
              [ School Logo ]
              School Name

              Payment Receipt
     Receipt # …                 Date …

     Student            …
     Course             …
     Billing period     January – March 2026
     Base amount        …
     Discount           Sibling (−…)     ← only if discount_amount > 0
     Invoiced amount    …                ← only if present and ≠ amount paid
     Amount paid        …
     Transaction ID     …                ← single: payment txn; group: — or first/aggregate rule below
     Payment method     …
     Status             Verified
     Installment        …                ← if installment
     Remarks            …                ← if present

     Parts (group only)
       Part 1  TXN-A   …
       Part 2  TXN-B   …

     This receipt confirms a verified payment recorded in {org}.
     Generated at …
```

### Formatting rules

1. **Billing period**
   - If `covered_months` non-empty: sort chronologically; if contiguous calendar months, render `FirstMonth – LastMonth Year` (split by year boundaries as needed for clarity, e.g. `November 2025 – January 2026`); if any gap, comma-separate `formatMonthLong` labels.
   - Else if both billing start/end: date range.
   - Else if `issued_at`: that date.
   - Else: `—`.

2. **Amount paid** = first non-null among `actual_amount`, `parsed_amount`, `invoiced_amount`.

3. **Discount line** only when `discount_amount > 0`. Label = `discount_label` or `"Discount"`. Show as negative money.

4. **Invoiced line** only when `invoiced_amount` is present and not equal to amount paid.

5. **Base amount** show when present; otherwise omit (do not invent from paid).

6. **Group receipt**
   - Receipt # = `group-{groupId}` (or numeric `group_id`).
   - Filename = `receipt-group-{groupId}.pdf`.
   - Transaction ID at summary level: `—` when parts have multiple/missing IDs; otherwise the single shared ID.
   - Payment method: existing group rollup (`Multiple` when mixed).
   - Parts section: one line per part with transaction id (or `—`) and that part’s amount paid.

7. **Header**: logo centered when URL available; on logo failure/CORS, omit image and still center org name.

## UX & entry points

| Surface | When download shows |
|---|---|
| Student Payments Glide grid | Verified standalone payment **or** verified group row |
| Student Payments ResourceTable | Same |
| Course-scoped + transaction-lookup | Same (shared report shell) |
| Payment History | Verified standalone payment; or grouped part whose group is fully verified → combined group PDF |

**Grouped part rows on staff grids:** no per-part download (combined only from the group row).

**Interaction:** click → loading → browser download → destructive toast on failure (*"Could not generate receipt. Please try again."*).

**Payment History group loading:** if the list row has `group_id`, fetch `user-payment-groups/<id>` (or the app’s existing group detail helper). Generate the combined PDF only when the group’s rolled-up status is `verified`. If the fetch fails or the group is not fully verified, toast an error (or hide/disable the action) — never emit a partial/misleading single-part “group” receipt.

## Error handling

| Case | Behavior |
|---|---|
| Missing student/course/optional money fields | `—` or omit optional lines; still generate |
| Logo missing / fetch failure | Omit logo; center org name; still generate |
| PDF render throws | Toast; reset loading |
| Group parts fetch fails (Payment History) | Toast; no download |

## Testing

**Backend**

- Admin-report payment row includes amount + `discount_label`.
- Group row sums / label rollup.
- Prefetch path does not explode queries unreasonably (smoke).

**Frontend (Vitest)**

- Paid-amount priority.
- Contiguous vs gapped `covered_months` formatting.
- Discount / invoiced line visibility helpers.
- Group payload + filename.
- Existing filename helpers remain covered.

**Manual QA**

- Verified multi-month + discount → PDF matches expectations; logo centered.
- Group with two verified parts → one combined PDF with parts list.
- ResourceTable download.
- Student Payment History download for own verified payment.
- Non-verified → no button.
- Teacher without receipt perms → no staff download.

## Out of scope

- Denormalized receipt snapshot columns on `UserPayment`
- Server-side PDF generation or stored receipt files
- Email / send receipt
- Bulk / batch download
- Per-org custom receipt templates
- Embedding bank screenshot in the PDF
- Per-part receipts for grouped payments on staff grids

## Relationship to prior spec

The 2026-06-13 receipt design remains the baseline for client-side generation, verified-only staff download, and filename conventions for **standalone** payments. This document updates content, branding, surfaces, group behavior, and the required report/list field exposure.
