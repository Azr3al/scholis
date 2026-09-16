# Student Payments ResourceTable Remarks Column — Design Spec

**Date:** 2026-07-23  
**Status:** Approved for planning  
**Surface:** Original (ResourceTable) student-payments report only — not Glide “new look”  
**Related:** `2026-07-11-student-payments-original-table-fixes-design.md` (supersedes its “no Remarks column” non-goal for this surface)

## Summary

Add an editable **Remarks** column to the original student payments ResourceTable, mirroring **Description**. Remarks must be visible and editable whether or not a screenshot exists (same rules as other text fields today).

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Field | `UserPayment.remarks` (UI label **Remarks**, not “Notes”) |
| Surface | Original ResourceTable only |
| Placement | Immediately after **Description**, before **Created By** |
| Edit model | Mirror Description via `PaymentEditableFieldCell` |
| Screenshot coupling | None — editing never gated on screenshot presence |
| Synthetic / stub rows | Include `remarks` in `StubDraft`; send on stub create via existing FormData helper |
| Group parents | Show **—** (not editable); parts/leaves editable when `isPaymentFieldEditable` allows |
| Backend | No changes — PUT and stub-create already accept `remarks` |

## Goals / non-goals

**Goals**

- Show Remarks in the original table so finance can read/edit notes without opening upload or Glide.  
- Keep Remarks editable on rows with no screenshot (including synthetic expectations before stub create).  
- Align original-table Remarks with Glide + upload form field semantics.

**Non-goals**

- Glide grid changes (already has Remarks)  
- Drawer / upload form changes  
- Renaming the column to “Notes”  
- Backend model, serializer, or permission changes  
- Combining Description and Remarks into one cell

## Architecture

```
Admin report rows (standalone | group part | synthetic)
        │
        └─ ResourceTable (original)
              … → Description → Remarks (new) → Created By → Actions
                    │
                    └─ PaymentEditableFieldCell(field="remarks")
                          ├─ existing payment → PUT user-payments/:id { remarks }
                          └─ synthetic      → StubDraft.remarks
                                               → buildSyntheticPaymentStubFormData({ remarks })
                                               (gate unchanged: amount + payment method)
```

Shared helpers in `payment-row-utils` already treat `remarks` as a text `PaymentEditableField` with no screenshot check. Column layout meta gains a prose `remarks` entry after `description`.

### Lofi — column order

```
| Student | … | Txn ID | Description | Remarks | Created By | Actions |
| Ada     | … | TX-1   | June fee    | VIP     | Admin      | …       |
| Bob     | … | —      |             | call me | —          | Upload  |  ← no screenshot; Remarks still editable
| Group ▾ | … | 2 txns | —           | —       | —          | …       |
|  └ part | … | TX-2   | Part A      | note A  | Admin      | …       |
```

## Components & files (implementation touchpoints)

| File | Change |
|------|--------|
| `src/components/finances/student-payments-resource-table.tsx` | Extend `EditablePaymentField` + `StubDraft` with `remarks`; wire column + stub create FormData; use prose input class like Description |
| `src/lib/finances/student-payments-resource-column-meta.ts` | Add `remarks` layout meta after `description` |
| `src/lib/finances/student-payments-resource-column-meta.test.ts` | Assert `remarks` follows `description` in layout |
| `src/lib/finances/synthetic-payment-stub.ts` | Already accepts `remarks` — no API change expected |
| `src/lib/data-sheets/payment-row-utils.ts` | Already supports display/payload/editability for `remarks` |

## Data flow

1. **Existing leaf / part row:** user edits Remarks → autosave → `paymentFieldApiPayload("remarks", next)` → `updateEntity("user-payments", id, …)` → soft refetch.  
2. **Synthetic row:** edits update local `StubDraft.remarks`. When amount + payment method satisfy `canCreateSyntheticPaymentStub`, POST stub includes `remarks` if non-empty.  
3. **Group parent:** not editable; display **—**.  
4. **Clearing:** empty string maps to `null` via existing payload helper (same as Description).

## Error handling

Reuse Description patterns:

- Failed PUT / stub create → toast “Could not save change.”  
- Existing rows: optimistic cache patch + rollback on failure (via `PaymentEditableFieldCell`).  
- No new validation beyond CharField max length enforced by the API.

## Testing

High-value only (no “column renders” smoke):

1. **Column meta:** layout includes `remarks` immediately after `description` (independent of `canVerify` / `hideCourseColumn` flags that still keep both).  
2. **Stub FormData:** when draft has remarks, `buildSyntheticPaymentStubFormData` includes `remarks` (existing helper coverage; wire ResourceTable to pass the field).  
3. Do **not** add backend tests for this FE-only change.

## Supersedes prior non-goal

`2026-07-11-student-payments-original-table-fixes-design.md` listed “Adding a Remarks column to the original table” as a non-goal and “Remarks: upload form only.” This spec **replaces** that decision for the ResourceTable surface. Upload-form per-part Remarks remains as implemented; table Remarks is additive.

## Out of scope

- Glide “Try the new look”  
- Student payments drawer fields  
- Receipt PDF copy changes  
- CSV verify / export column changes unless Remarks already appears there
