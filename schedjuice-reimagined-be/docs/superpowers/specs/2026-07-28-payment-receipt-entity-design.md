# Payment Receipt Entity — Design Spec

**Date:** 2026-07-28  
**Status:** Approved  
**Scope:** `schedjuice-reimagined-be` + `schedjuice-reimagined-fe`  
**Supersedes:** `2026-07-26-payment-receipt-numbering-design.md` (group min-of-parts and per-part numbering)

## Summary

Introduce a first-class `PaymentReceipt` model so one issued receipt owns exactly one receipt number. A `UserPaymentGroup` (multi-course or split-screenshots) shares one receipt; standalone payments get their own. Numbers are allocated on first part verification; later parts join the same receipt. Historical surplus numbers (from the old per-part allocation) become void receipt rows so the sequence is explainable.

## Confirmed decisions

| Topic | Choice |
|-------|--------|
| Receipt unit | `UserPaymentGroup` when grouped, else standalone `UserPayment` |
| Allocation trigger | First part verification in the unit |
| Download | Blocked until all parts verified (already via `rollup_payment_group_status`) |
| `PaymentReceipt` fields | `number`, `receipt_date`, `authorized_by`, `is_void`, `void_reason` |
| `UserPayment` | `receipt` FK replaces `receipt_number` column |
| History backfill | Unit adopts `min(receipt_number)`; surplus → void rows |
| Void scope | Migration bookkeeping only |
| `authorized_by` | Staff who verified the last part (completer) |
| Reset / reconcile | Counter-only: `next_sequence = max(number) + 1` |
| API | `receipt_number` key preserved (read from `receipt.number`) |

## Data model

```python
class PaymentReceipt(BaseModel):
    number = models.PositiveIntegerField(unique=True)
    receipt_date = models.DateTimeField()
    authorized_by = models.ForeignKey(User, null=True, blank=True, ...)
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=255, blank=True, default="")
```

`UserPayment.receipt` → FK to `PaymentReceipt`, `on_delete=PROTECT`.

## Out of scope

- `EXCELLENT_CHOICE_STYLE` report (follow-up spec)
- Staff-initiated voiding
- Year-prefixed receipt numbers
