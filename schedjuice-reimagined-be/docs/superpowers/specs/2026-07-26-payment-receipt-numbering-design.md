# Payment Receipt Numbering — Design Spec

**Date:** 2026-07-26  
**Status:** Superseded by `2026-07-28-payment-receipt-entity-design.md`  
**Scope:** `schedjuice-reimagined-be` + `schedjuice-reimagined-fe`  
**Extends:** Student payment receipt PDF (see FE `2026-06-13-student-payment-receipt-design.md`)

## Summary

Introduce **sequential receipt numbers** for verified student payments, allocated at verification time from a per-tenant counter. Add a **reset/reconcile management command** (with `--schema-name` and `--dry-run`) that sets the counter to `verified_count + 1` without renumbering existing rows. Expose the command on the internal **Management Commands** page.

Today receipt `#` on PDFs is `UserPayment.id`. After this change, newly verified payments get a dedicated `receipt_number`; legacy rows keep showing `id` on PDFs until reprinted once they have a number assigned (this feature does **not** backfill historical numbers).

---

## Confirmed decisions

| Topic | Choice |
|-------|--------|
| Reset behavior | **Counter only** — set `next_sequence = verified_count + 1`; do not rewrite existing `receipt_number` values |
| Count scope | `UserPayment` rows with `status = verified` only |
| Allocation trigger | When a payment **becomes** verified (all verify paths) |
| Existing PDFs | Unchanged until reprinted; FE falls back to `String(row.id)` when `receipt_number` is null |
| Group receipt PDF | ~~Show the lowest part number~~ → **superseded:** one `PaymentReceipt` per group |
| Counter model | Tenant-scoped singleton (`PaymentReceiptCounter`), mirrors `UserCodeCounter` pattern |
| Command exposure | Backend allowlist + FE `/internal/management-commands` entry; dry-run defaults **on** in UI |

---

## Problem / context

Receipt `#` currently equals the database primary key (`UserPayment.id`). After deletions or long-running tenants, IDs diverge from “how many receipts we’ve issued,” which is confusing for finance staff who expect consecutive receipt numbers.

Staff need:

1. The **next** verified payment to receive receipt `# (verified count + 1)`.
2. A **safe dry-run** command to preview the counter change per tenant.
3. The same command runnable from the existing internal management-commands UI.

---

## Architecture

```
UserPayment (verified)          PaymentReceiptCounter (pk=1)
        │                                │
        │  assign on verify              │  next_sequence
        ▼                                ▼
 payment_receipt_number.py ◄── reset_payment_receipt_numbering (mgmt cmd)
        │
        ▼
 UserPayment.receipt_number  ──►  API serializer  ──►  FE payment-receipt.ts  ──►  PDF
```

### Module layout (backend)

| File | Purpose |
|------|---------|
| `app_finance/models.py` | Add `UserPayment.receipt_number`, `PaymentReceiptCounter` |
| `app_finance/payment_receipt_number.py` | `allocate_receipt_number`, `assign_receipt_number_if_needed`, `reconcile_payment_receipt_counter` |
| `app_finance/management/commands/reset_payment_receipt_numbering.py` | CLI wrapper |
| `app_finance/serializers.py` | Expose `receipt_number` on `UserPaymentSerializer` |
| `app_finance/payment_verify.py` | Assign after bulk verify |
| `app_finance/services.py` | Assign in `mark_receiver_side_screenshots_matched` |
| `app_finance/models.py` (`UserPayment.save`) | Assign on normal status transition to verified |
| `app_tasks/views.py` | Allowlist command name |

### Frontend

| File | Purpose |
|------|---------|
| `src/app/(platform-internal)/internal/management-commands/page.tsx` | New Finance command entry |
| `src/helpers/payment-receipt.ts` | Prefer `receipt_number`, fallback to `id` |
| `src/helpers/payment-receipt.test.ts` | Regression tests |

---

## Data model

### `PaymentReceiptCounter`

Tenant-scoped table (one row per schema via django-tenant-schemas).

```python
class PaymentReceiptCounter(BaseModel):
    next_sequence = models.PositiveIntegerField(default=1)
```

**Singleton access:** always `PaymentReceiptCounter.objects.get_or_create(pk=1, defaults={"next_sequence": 1})`. Only row `pk=1` is used; no multi-row inserts in application code.

### `UserPayment.receipt_number`

```python
receipt_number = models.PositiveIntegerField(null=True, blank=True)
```

**Constraints:**

- Partial unique: non-null `receipt_number` must be unique within the tenant.
- Write-once: set when status becomes `verified`; never cleared or reassigned by normal flows.

**Migration:** Add nullable field + counter table. No data backfill migration.

---

## Allocation logic

### `allocate_receipt_number()`

```python
@transaction.atomic
def allocate_receipt_number() -> int:
    counter, _ = PaymentReceiptCounter.objects.select_for_update().get_or_create(
        pk=1, defaults={"next_sequence": 1}
    )
    n = counter.next_sequence
    counter.next_sequence = n + 1
    counter.save(update_fields=["next_sequence", "updated_at"])
    return n
```

### `assign_receipt_number_if_needed(payment: UserPayment) -> bool`

- Return early if `payment.status != VERIFIED` or `payment.receipt_number is not None`.
- Set `payment.receipt_number = allocate_receipt_number()`.
- Return whether a number was assigned.

### Verification hooks

| Path | Integration |
|------|-------------|
| `UserPayment.save()` | After verified-at logic, call assign helper when transitioning to verified (respect `update_fields` — include `receipt_number` when set) |
| `payment_verify.verify_screenshots_from_rows` | After `bulk_update`, iterate rows that became verified and call assign helper + `bulk_update` receipt numbers |
| `mark_receiver_side_screenshots_matched` | Call assign helper before/after setting status verified |

All assignment must stay inside the same DB transaction as verification.

---

## Reset / reconcile command

**Name:** `reset-payment-receipt-numbering`  
**File:** `app_finance/management/commands/reset_payment_receipt_numbering.py`

### Arguments

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--schema-name` | str | `None` | Single tenant; omit to process all non-public orgs |
| `--dry-run` | flag | off | Print plan only; no writes |

### Per-tenant algorithm

Inside `schema_context(schema_name)`:

1. `verified_count = UserPayment.objects.filter(status=UserPayment.Status.VERIFIED).count()`
2. `new_next = verified_count + 1`
3. Read current counter (treat missing row as `next_sequence=1`)
4. Log: `Schema {name}: verified={verified_count}, counter {old} -> {new_next}`
5. Unless `--dry-run`: upsert counter pk=1 with `next_sequence=new_next`

### Does not

- Backfill `receipt_number` on existing verified payments
- Delete or reassign existing receipt numbers
- Touch non-verified payments

---

## Frontend receipt display

### Single payment

```typescript
receiptNumber:
  row.receipt_number != null
    ? String(row.receipt_number)
    : String(row.id),
```

### Group payment

Among `parts` with non-null `receipt_number`, use `Math.min(...)`; if none, keep `group-{groupId}`.

### Serializer input type

Add `receipt_number?: number | null` to `PaymentReceiptRowInput`.

---

## Management command UI

Add to `COMMANDS` in `management-commands/page.tsx`:

```typescript
{
  name: "reset-payment-receipt-numbering",
  category: "Finance",
  description:
    "Reset the payment receipt counter so the next verified payment gets receipt # (verified count + 1). Does not renumber existing receipts.",
  params: [
    {
      key: "schema_name",
      type: "string",
      required: true,
      description: "Tenant schema name",
    },
    {
      key: "dry_run",
      type: "boolean",
      default: "true",
      description: "Preview only; no database writes",
    },
  ],
}
```

### Backend allowlist

Add `"reset-payment-receipt-numbering"` to `MS_TEAMS_COMMANDS` in `app_tasks/views.py`.

POST body keys map to CLI kwargs (`schema_name`, `dry_run`) per existing `ManagementCommandView` contract.

---

## Error handling

| Scenario | Behavior |
|----------|----------|
| Unknown `--schema-name` | `CommandError` (no org found) |
| Concurrent verify + allocate | `select_for_update()` on counter row |
| Duplicate receipt_number | Prevented by partial unique constraint; allocation in same transaction as verify |
| Re-verify / idempotent assign | No-op when `receipt_number` already set |
| Counter drift (counter >> verified count) | Reset command realigns to `verified_count + 1` |

---

## Testing

Follow workspace high-value-tests rule — behavior and invariants, not smoke.

### Backend (`app_finance/tests/test_payment_receipt_number.py`)

| Test | Asserts |
|------|---------|
| `test_assign_on_patch_verify` | PATCH status → verified sets `receipt_number=1`, counter → 2 |
| `test_bulk_verify_assigns_numbers` | `verify_screenshots_from_rows` assigns sequential numbers |
| `test_reset_dry_run_no_write` | Counter unchanged; output mentions would-be value |
| `test_reset_apply_sets_next_from_verified_count` | 3 verified → reset → `next_sequence == 4` |
| `test_reset_fixes_counter_drift` | Counter at 500, 172 verified → reset → 173 |
| `test_assign_idempotent` | Second save on verified payment does not increment counter |

### Frontend (`src/helpers/payment-receipt.test.ts`)

| Test | Asserts |
|------|---------|
| Uses `receipt_number` when present | `buildPaymentReceiptPayload` → `receiptNumber: "42"` |
| Falls back to `id` when null | Legacy row still shows id |

---

## Out of scope

- Backfilling `receipt_number` on historical verified payments
- Year-scoped or prefix-formatted receipt numbers (e.g. `2026-0042`)
- Renumbering existing receipts or changing printed PDFs in bulk
- Per-course receipt sequences

---

## Implementation order (for planning)

1. Migration: `PaymentReceiptCounter` + `UserPayment.receipt_number`
2. `payment_receipt_number.py` + unit tests
3. Wire verify hooks (save, bulk verify, RSS match)
4. Serializer + FE receipt helper
5. Management command + allowlist + FE command entry
6. Command tests
