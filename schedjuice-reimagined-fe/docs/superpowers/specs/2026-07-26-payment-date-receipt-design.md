# Payment Date on Receipts + Inline Admin Edit

**Date:** 2026-07-26  
**Status:** Approved (design)  
**Scope:** `schedjuice-reimagined-fe` + `schedjuice-reimagined-be`  
**Supersedes / extends:** [2026-07-21-student-payment-receipt-enhancements-design.md](./2026-07-21-student-payment-receipt-enhancements-design.md) (receipt date source + one new DB column)

## Problem

Student payment receipts show **Date** from `issued_at`, which is the **billing/coverage anchor** (first covered month), not when the payment was uploaded or made. Finance staff need a correct receipt date that defaults to upload time but can be corrected by admin. The receipt logo is also too small.

## Decisions (locked)

| Question | Decision |
|---|---|
| New field | `UserPayment.payment_date` (`DateTimeField`, nullable) |
| Default on create | Upload / create time — equivalent to `created_at` when not explicitly set |
| Admin override | Upload form (per-part) + inline column in student payments tables |
| Receipt date source | `payment_date` (not `issued_at`) |
| Group receipt date | **Earliest** `payment_date` among parts |
| Multipart upload | **Per-part** date picker on upload page |
| Inline column | **Payment date**, immediately **left of Created By** |
| Table surfaces | Glide grid **and** ResourceTable |
| Existing rows backfill | Set `payment_date = created_at` for all rows where null |
| Backfill performance | **Single bulk `UPDATE` per tenant schema — no row iteration, no N+1** |
| `issued_at` | Unchanged — still drives coverage, month filters, eligibility |
| Logo size | **2×** current (`80×40` → `160×80` in PDF styles) |

## Architecture

```
Upload / PATCH user-payments
  → UserPayment.payment_date (stored)

Admin report row / payment history row (+ group parts)
  → buildPaymentReceiptPayload | buildGroupPaymentReceiptPayload
      receiptDate ← payment_date (group: min(parts.payment_date))
  → PaymentReceiptPdfDocument
      header Date + 2× logo
```

---

## Backend (`schedjuice-reimagined-be`)

### Model

Add to `UserPayment`:

```python
payment_date = models.DateTimeField(
    null=True,
    blank=True,
    help_text="Date shown on payment receipts; defaults to upload time.",
)
```

`issued_at`, `billing_start_date`, `billing_end_date`, and covered-month junction logic are **not** changed.

### Default on create

When a payment is created and `payment_date` is omitted:

1. Set `payment_date = timezone.now()` immediately before the first `save()` (all create paths: single upload, multipart group create, scan-transaction-screenshots synthetic create, import commands if applicable).
2. After insert, `created_at` and `payment_date` will match for practical purposes (same insert instant).

When upload sends an explicit date (calendar day in tenant TZ), convert to a timezone-aware datetime (start of that calendar day in tenant timezone) and store on the part.

**Writable fields**

| Endpoint / flow | Field |
|---|---|
| Single-part upload | `payment_date` (ISO datetime) |
| Multipart upload | `part_{i}_payment_date` (ISO datetime per part) |
| PATCH `user-payments/{id}` | `payment_date` |

Parse with existing datetime parsing helpers; reject invalid values with 400.

### Migration + backfill (no N+1)

**Schema migration:** add nullable `payment_date` column.

**Data migration:** one bulk update per tenant schema. **Do not** iterate rows in Python, call `.save()` per instance, or use a loop that issues one `UPDATE` per row.

**Required pattern** (single SQL statement):

```python
from django.db.models import F

UserPayment.objects.filter(payment_date__isnull=True).update(
    payment_date=F("created_at")
)
```

Alternatively equivalent raw SQL in `RunSQL`:

```sql
UPDATE app_finance_userpayment
SET payment_date = created_at
WHERE payment_date IS NULL;
```

For django-tenants: run inside the tenant schema context the same way other tenant-scoped data migrations do (skip `public` if that is the project convention). The backfill must complete in **O(1) queries per schema**, not O(n payments).

**Forbidden in backfill**

- `for payment in UserPayment.objects.all(): payment.payment_date = payment.created_at; payment.save()`
- `.iterator()` + per-row `.update()` or `.save()`
- ORM `.bulk_update()` with a pre-built list loaded via a queryset that was only used to materialize every row (acceptable only if unavoidable; prefer `F()` expression update above)

### API exposure

Include `payment_date` (ISO string) in:

| Payload | Notes |
|---|---|
| `UserPaymentSerializer` | read + write |
| `admin_report_payment_row` | standalone rows and each part in `parts` |
| `_admin_report_group_row` | rollup field `payment_date` = **min** of parts' `payment_date` (for parent row display only; stored per part) |
| Payment history / list fields used for receipt download | same as admin report amounts pattern |

No new receipt PDF endpoint.

---

## Frontend (`schedjuice-reimagined-fe`)

### Upload page (`student-payments/upload`)

- Add **Payment date** date picker **per upload part** (multipart) or one field for single-part.
- Default: **today** in tenant timezone (matches upload-time default).
- Submit `payment_date` or `part_{i}_payment_date` as ISO datetime (start of selected calendar day in tenant TZ unless product later adds time-of-day).
- Extend `buildMultiPartPaymentFormData` in `payment-group-utils.ts`.

### Inline table column

New column **`Payment date`** immediately **left of Created By**:

```
… | Remarks | Payment date | Created By | Actions |
```

**Surfaces:** Glide grid (`student-payments-grid.tsx`) and ResourceTable (`student-payments-resource-table.tsx` + `student-payments-resource-column-meta.ts`).

**New component:** `InlineDatePicker` (under `src/components/datatable/`), modeled after `InlineTimeSelect`:

- Compact trigger showing formatted date (`formatDate` / tenant TZ).
- Popover calendar (reuse `@/components/date/date-picker` or calendar primitive).
- On select: PATCH `user-payments/{id}` with `{ payment_date: iso }`.
- Toast + cache invalidation on error; same permission gates as other inline payment edits.

**Row behavior**

| Row type | Behavior |
|---|---|
| Standalone payment | Editable inline picker |
| Group part row | Editable inline picker |
| Group parent row | Read-only — display **earliest** part `payment_date` |
| Synthetic stub row | Include `payment_date` in inline create / scan payload when present |

### Receipt

**`payment-receipt.ts`**

- Add `payment_date?: string | null` to `PaymentReceiptRowInput`.
- `buildSharedMeta`: set `receiptDate` from `payment_date`, fallback `created_at` if exposed on row, then today (defensive).
- **Stop using `issued_at` for receipt date.**
- `buildGroupPaymentReceiptPayload`: compute `earliestPaymentDate(parts)` and pass into shared meta (override group row's own field).

**`payment-receipt-pdf.tsx`**

- Logo style: `width: 160`, `height: 80` (was 80×40).
- Header **Date** label unchanged; value is `payload.receiptDate`.

**Tests (`payment-receipt.test.ts`)**

- Receipt date follows `payment_date`, not `issued_at`.
- Group receipt uses earliest part date.
- Regression: `issued_at` in a different month does not affect receipt date.

---

## Scope boundaries

- `payment_date` is for **receipt display and admin record-keeping** only.
- Admin-report month filtering, coverage edit, installment logic, and out-of-range month eligibility continue to use `issued_at` / `covered_months`.
- Students see receipts on Payment History but **no** inline edit column there.

## Permissions

- Inline edit: same gates as existing editable payment fields on staff grids (`payment.verify` / record permissions).
- Receipt download: unchanged (`canDownloadPaymentReceipt`).

## Testing (high-value only)

| Layer | Cases |
|---|---|
| BE migration | Backfill sets `payment_date` from `created_at`; assert single-update pattern in code review (no row loop) |
| BE create | Omit `payment_date` → stored non-null; explicit upload value persisted; multipart per-part values |
| BE PATCH | Updates `payment_date`; invalid datetime → 400 |
| BE admin report | Group parent exposes min part date |
| FE inline | PATCH on date change; disabled on group parent |
| FE receipt | `payment_date` formatting; group earliest; logo dimensions |

---

## File touch list (implementation hint)

| Repo | File | Change |
|---|---|---|
| BE | `app_finance/models.py` | Add field |
| BE | `app_finance/migrations/0076_…py` | Add column |
| BE | `app_finance/migrations/0077_…py` | Bulk backfill via `F("created_at")` |
| BE | `app_finance/payment_group.py` | Expose field; group min rollup |
| BE | `app_finance/views.py` | Parse upload + PATCH fields |
| BE | `app_finance/serializers.py` | Default on create |
| FE | `src/components/datatable/inline-date-picker.tsx` | New |
| FE | `src/components/finances/student-payments-grid.tsx` | Column + cell |
| FE | `src/components/finances/student-payments-resource-table.tsx` | Column + cell |
| FE | `src/lib/finances/student-payments-resource-column-meta.ts` | Column meta |
| FE | `src/app/(internal)/finances/student-payments/upload/page.tsx` | Per-part picker |
| FE | `src/lib/finances/payment-group-utils.ts` | FormData fields |
| FE | `src/helpers/payment-receipt.ts` | Receipt date logic |
| FE | `src/components/finances/payment-receipt-pdf.tsx` | Logo 2× |
