# Inline edit — no stale flash / status layout shift

**Status:** agreed (2026-07-11)  
**Repo:** `schedjuice-reimagined-fe`  
**Surfaces:** student payments original table — Transaction ID / Description text cells, Status inline select  
**Related:** `2026-07-11-inline-edit-optimistic-save-feedback-design.md` (optimism + feedback already landed; this spec closes remaining flash/shift)

## Context

After blur or status change, edited values briefly **snap back to the previous (pre-edit) value**, then reappear once save/refetch settles. That makes the table feel untrustworthy.

Status select also **layout-shifts** during save: `UserPaymentStatusInlineForm` passes `isLoading={saveStatus === "saving"}` into `Selector`, which **unmounts the Select** and swaps in a Loader box.

Existing pieces already in place:

- `useCellAutosave` + `shouldSyncControlledCellValue` sync guards
- `onOptimisticUpdate` / `onRollback` + `patchPaymentRowInQueryCaches`
- `CellSaveFeedback` (reserved saving → tick slot)
- Admin-report query key prefix `["searchuser-payments", tableUid, …]` with `{ rows, summary }` shape (patchable)

Remaining gaps: post-save invalidate can re-feed lagging props / remount cells before the UI has “won,” and the Selector loading swap fights optimism.

## Goals

1. **No snap-to-old** — after commit, the committed value stays visible through save and any soft refetch; never briefly show the pre-edit value.
2. **No status layout shift** — Select stays mounted during save; feedback only via `CellSaveFeedback`.
3. **Keep feedback** — saving indicator → saved tick (existing).
4. **One policy** for text and status post-save refetch so they cannot diverge.

## Non-goals

- Glide/grid overlay editors.
- Recent-transactions or other tables (follow-up if they still flash).
- Global redesign of `Selector` loading behavior (only stop using the swap on this status cell).
- Backend API changes.
- Changing error UX (rollback + destructive toast stays).

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Approach:** Harden existing optimism (Approach A) — fix select remount + post-save stale flash |
| 2 | **Status loading:** Do **not** pass save-time `isLoading` into `Selector`; keep Select mounted (disable only if already required for permissions) |
| 3 | **Post-save refetch:** Replace immediate `invalidateQueries` with **soft `refetchQueries`** (keeps current cache `data` while fetching). Optimistic patch remains visible until the refetch result replaces it. |
| 4 | **Shared policy:** Text (`PaymentEditableFieldCell`) and status (`UserPaymentStatusInlineForm`) use the same post-save helper/pattern |
| 5 | **Admin-report mirror:** Keep RQ cache as source of truth after patch; `setRows(dataQuery.data.rows)` continues to follow `setQueryData` — no save-path local reset that restores old rows |
| 6 | **Errors:** Unchanged — local + cache rollback + destructive toast |

---

## Architecture

### Problem flow (today)

```
edit → local displayValue (new)
     → patch RQ cache (new)
     → admin-report mirrors into `rows` → cell props
     → on success: invalidateQueries
     → status Select unmounts while saving (isLoading)
     → remount / lagging prop can briefly show old value
```

### Target flow

```
edit → local displayValue (new)  [stays new]
     → patch RQ cache (new)
     → mirror `rows` picks up patch
     → API save
     → CellSaveFeedback: Saving… → ✓
     → Select stays mounted the whole time
     → soft refetchQueries (reconcile; previous data stays until result)
     → failure: rollback local + cache + toast
```

### Lofi UX

```
[ txn id: "a fasf sdfa sdf" ]  Saving…
[ Status: Pending verification ▾ ]  ✓
         ↑ never replaced by Loader
```

### Components / touch points

| Piece | Change |
| --- | --- |
| `UserPaymentStatusInlineForm` | Remove save-time `isLoading` on `Selector`; accept `tableUid` (or equivalent) for scoped soft refetch; keep `CellSaveFeedback` |
| `PaymentEditableFieldCell` / status column wiring | Pass `tableUid` into status form; same soft-refetch helper as text cells |
| Shared helper | e.g. `softRefetchStudentPaymentsReport(queryClient, tableUid)` — `refetchQueries` on `searchuser-payments` / tableUid; does not clear optimistic rows |
| `useStudentPaymentsAdminReport` | Only if mirror still fights optimism; prefer minimal change (no save-path `setRows` reset) |
| `Selector` | Unchanged globally; this call site stops using loading swap |

### Post-save refetch policy (explicit)

1. On commit start: `onOptimisticUpdate` patches all matching `{ rows }` caches (existing).
2. On API success: set status `saved` + tick (existing). Call shared soft refetch helper instead of `invalidateQueries`.
3. Soft refetch: `queryClient.refetchQueries({ queryKey: ["searchuser-payments", tableUid] })` (and any sibling keys status already touched, via the same helper). RQ keeps showing patched `data` until the network result arrives; then mirror `setRows` updates from the new payload.
4. On API failure: `onRollback` + toast (existing). Do not refetch on failure (rollback is enough).

---

## Testing

- **Unit:** Status form does not drive `Selector` into loading/unmount while `saving`.
- **Unit:** `shouldSyncControlledCellValue` / cell harness — committed display stays when parent prop lags (existing coverage; extend if a new refetch helper needs it).
- **Manual:** On student payments original table, edit Transaction ID, Description, and Status — no snap-to-old; status column width stable during save.

### Edge cases

- Save failure → rollback + toast.
- Rapid status changes → single inflight commit (existing hook).
- Group / synthetic / non-editable rows unchanged.

---

## Success criteria

1. Editing a text field then blurring never shows the previous value before the new one settles.
2. Changing status never swaps the select for a loader or visibly jumps column width.
3. Saving → tick feedback still appears beside the control.
4. Failed saves still revert and toast.
