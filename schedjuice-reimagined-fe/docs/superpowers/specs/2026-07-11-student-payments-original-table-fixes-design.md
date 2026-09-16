# Student Payments Original Table Fixes — Design Spec

**Date:** 2026-07-11  
**Status:** Approved for planning  
**Surface:** Original (ResourceTable) student-payments report only — not Glide “new look”  
**Related:** `2026-07-10-multipart-student-payments-ocr-design.md`, collapsible/hover screenshot preview specs

## Summary

Fix regressions and gaps on the **original** student payments table and upload form:

1. Multi-screenshot (group) rows can expand inline to show parts  
2. Description and remarks are per payment screenshot (part), not form-global  
3. Description no longer wrongly shows “—” on multi-part parents in a way that blocks understanding — parent shows “—”; parts hold editable values  
4. Restore per-row Delete on leaf payments (lost in ResourceTable rewrite)  
5. Screenshot side panel stays sticky while the table scrolls  
6. Fields remain editable without a screenshot; synthetic rows can create stubs; warn near Status/Actions  
7. Payment method is inline-selectable on editable rows  
8. Widen Student, Description, and Transaction ID; left-align multi-line text  

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Surface | Original ResourceTable path only |
| Multi-part UX | Approach 1: true nested table rows under group parent |
| Delete | Leaf / expanded part / standalone only — never group parent |
| Screenshot panel | Sticky in visible area while table scrolls |
| No-screenshot edit | Synthetic rows editable; stub create when amount + payment method set |
| No-screenshot warning | Near Status / Actions: “No screenshot uploaded” |
| Description / remarks | Per part on upload; table Description editable on leaves only; parent “—”; **no new Remarks column** |
| Stub create gate | Both `parsed_amount` and `payment_method` required before POST |
| Expand state | Local UI state keyed by group id (not persisted) |

## Goals / non-goals

**Goals**

- Restore usable original-table workflows for multi-part payments, delete, inline edits, and preview scrolling.  
- Align upload form with per-part description/remarks (BE already stores these on `UserPayment`).  
- Allow recording payment metadata before a screenshot exists, with a clear warning.

**Non-goals**

- Glide grid parity  
- Adding a Remarks column to the original table  
- Student self-service multi-part upload  
- Visual Companion / browser mockups for design (lofi text only)

## Architecture

```
Admin report rows (standalone | group projection)
        │
        ├─ ResourceTable (original)
        │     ├─ flatten: insert part rows when group expanded
        │     ├─ leaf chrome: edit / payment method / delete / ⚠
        │     └─ group parent: rollup + chevron, no delete
        │
        ├─ Report shell
        │     └─ sticky ScreenshotPreviewColumn beside scrolling table
        │
        └─ Upload form
              └─ Description + Remarks inside each part block → per-part FormData
```

### Row kinds

| Kind | Identity | Editable part-owned fields | Delete | Warning if no screenshot |
|------|----------|----------------------------|--------|--------------------------|
| Synthetic expectation | id contains `new` | Yes (local until stub create) | No | Yes (always — no screenshot yet) |
| Standalone payment | numeric `UserPayment` id | Yes | Yes | Yes if `screenshot` empty |
| Group parent | `kind: "group"` / `group-…` | No (show — / “N transactions” / “Multiple”) | No | N/A (preview uses first/hovered part) |
| Group part (expanded) | part `UserPayment` id | Yes | Yes (that part only) | Yes if that part has no file |

### Lofi — expanded group + synthetic

```
| # | Student          | Amount | Pay method     | Status                 | Txn ID           | Description |
| 1 | Ada Tan       ▾  | 80,000 | Multiple       | Pending (rollup)       | 2 transactions   | —           |
|   |   └ Part 1       | 50,000 | [KPay ▼]       | [Pending ▼]            | [123…]           | [fee note]  |
|   |   └ Part 2       | 30,000 | [Wave ▼]       | [Cannot extract ▼]  ⚠  | [456…]           | [         ] |
| 2 | May Myat         | [    ] | [Select ▼]     | [Upload]  ⚠ No shot    | [    ]           | [         ] |
```

## Components & data flow

### Expand / flatten

- Chevron on group parent toggles expand for that `group_id`.  
- When expanded, inject `row.parts` as following table rows (indent student cell as “Part N”).  
- If `parts` missing/empty on first expand: fetch group detail once; on failure toast and keep collapsed.  
- Row hover → screenshot preview URL for the **hovered** leaf (part or standalone), not always the parent’s first screenshot.

### Inline edit

- **Payment method:** inline select on editable rows (reuse payment-methods list + pattern from Glide `PaymentMethodPopover`, adapted to ResourceTable cells).  
- **Txn ID, description, date on screenshot, amount:** autosave via existing `updateEntity("user-payments", id, …)` after stub exists.  
- **Column layout:** increase min/width floors for Student, Description, Transaction ID; left-align wrapping text.  
- **Remarks:** upload form only (per part); not a table column.

### Synthetic stub create

- Allow editing synthetic rows in the UI (change `isPaymentFieldEditable` / ResourceTable gates).  
- Buffer field values locally.  
- When both **amount** and **payment method** are present, POST `scan-transaction-screenshots` once with those fields plus any other buffered values (same shape Glide uses for inline create), **without** screenshot.  
- On success: replace synthetic row with returned payment in query cache / soft refetch; keep ⚠ until screenshot uploaded.  
- If BE rejects missing screenshot on single-part create, add a minimal BE allowance for screenshot-optional single create (multipart 2+ parts still require screenshots).

### Delete

- Restore confirm + delete on leaf/standalone (reuse `UserPaymentActionCell` or equivalent).  
- Not shown on group parent or synthetic rows.  
- After deleting a part: refetch/soft-refetch report; if group dissolves or becomes empty, UI must not leave a stale parent row (follow API response / report).

### Sticky preview

- Keep current shell split: table in left `overflow-auto` pane; preview column sibling.  
- Make preview `sticky top-0 self-start` (or equivalent) so it remains in the visible content area while the table scrolls.  
- Collapse/hide behavior of the pane unchanged.

### Upload form

- Move Description and Remarks **inside each part** block.  
- Submit already supports per-part `description` / `remarks` on multi create; single-part should send them on that part (not only plan-level shared fields).  
- Remove form-level shared Description/Remarks controllers once parts own them.  
- Part remove control remains as today when `parts.length > 1`.

```
┌─ Part 1 ─────────────────────────────┐
│ Screenshot / Method / Txn / Amount   │
│ Date on screenshot                   │
│ Description [optional]               │
│ Remarks     [optional]               │
└──────────────────────────────────────┘
[+ Add another screenshot]
```

## Error handling

| Case | Behavior |
|------|----------|
| Expand fetch fails | Toast; stay collapsed |
| Cell save / stub create fails | Rollback optimistic UI; toast |
| Stub missing amount or method | Keep local edits; do not POST |
| Delete fails | Toast; leave row |
| Delete last part / dissolve group | Soft refetch; drop stale group parent from UI |
| No screenshot | Show ⚠ near Status/Actions; fields still editable |

## Testing

**Frontend unit**

- Flatten/expand helpers for group + parts  
- `isPaymentFieldEditable` for synthetic, group parent, leaf  
- Stub create gate (amount + method)  
- Upload validation: description/remarks accepted per part; no requirement that they be form-global  

**Frontend behavior (targeted)**

- Delete control absent on group parent, present on leaf  
- Warning visible when screenshot missing  
- Sticky preview layout does not scroll away with table rows (manual or light layout assertion if practical)  

**Backend**

- Only if screenshot-optional single create needs a change: test create without screenshot with amount + method  

## Implementation touch points

| Area | Files (expected) |
|------|------------------|
| Table | `student-payments-resource-table.tsx` |
| Shell / sticky | `student-payments-report-shell.tsx`, screenshot preview column as needed |
| Row helpers | `payment-row-utils.ts` (+ tests) |
| Upload | `student-payments/upload/page.tsx`, `upload-part-validation.ts` (+ tests) |
| Delete | `user-payment-action-cell.tsx` (wire) or inline equivalent |
| Optional BE | `scan-transaction-screenshots` single-part screenshot requirement |

## Out of scope

- Glide “Try the new look” fixes  
- New Remarks table column  
- Combined group receipt / student multi-part make-payment  
- Changing CSV verify payload format  
