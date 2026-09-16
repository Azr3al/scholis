# Inline edit — optimistic save + feedback design

**Status:** agreed (2026-07-11)  
**Repo:** `schedjuice-reimagined-fe`  
**Surfaces:** student payments (text + status), recent transactions, shared `ResourceTable` editable text cells; shared `edit-kit` for app-wide reuse

## Context

Inline editable fields (e.g. Transaction ID / Description next to payment status) briefly clear or snap back to the old value after blur, then reappear once a refetch completes. Save feedback is incomplete: some cells only show `FormSaveTick` after success, with no in-progress indicator; status selects toast on success and invalidate the list without optimistic cache updates.

Root cause: local optimism exists in `useCellAutosave`, but many call sites `invalidateQueries` without patching React Query cache first. Parent rows briefly re-render with stale (or empty) props, which flashes the input even when sync guards are present. Remounts during refetch make the flash worse.

Existing pieces to build on:

- `useCellAutosave` + sync guards (`shouldSyncControlledCellValue`)
- `FormSaveTick` / `savedTick` motion
- `FormSaveStatus` (`idle | saving | saved | error`)

## Goals

1. **Optimistic UI** — edited text and selected status stay visible immediately; never blank or revert to stale server data while a save is in flight or until the cache catches up.
2. **Save feedback** — compact **saving** indicator, then **saved tick** (`FormSaveTick` or equivalent).
3. **Errors** — roll back local value + cache; show a **destructive toast** (no inline Retry in this pass).
4. **One shared pattern** — text cells and status/select inline editors use the same edit-kit contract so other surfaces can adopt it.

## Non-goals

- Inline Retry UI (toast-only errors this pass).
- Rewriting checkin-histories, attendance, or quiz autosave engines (optional later adoption of `CellSaveFeedback` only).
- Backend API changes.
- Glide/grid overlay editors that do not already use edit-kit (follow-up if they still flash).

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Approach:** Cache-first optimistic updates via edit-kit (`useCellAutosave` + cache callbacks + `CellSaveFeedback`) |
| 2 | **Feedback:** Saving spinner/label → `FormSaveTick`; reserved-width slot (no layout shift) |
| 3 | **Errors:** Rollback local + cache + destructive toast; no inline Retry; no success toast for status (tick replaces it) |
| 4 | **Scope:** Text + status/select inline editors on student payments, recent-transactions cells, `ResourceTable` editable text; kit designed for app-wide reuse |
| 5 | **Cache:** `setQueryData` patch before API; optional soft invalidate after success for reconcile only |
| 6 | **Status select:** Same hook/feedback as text; optimistic selected value; drop success toast |

---

## Architecture

### Layers

1. **`useCellAutosave` (edit-kit)** — local `displayValue`, commit, status, tick timing, rollback. Extended with optional `onOptimisticUpdate(next)` / `onRollback(previous)` so callers patch React Query in lockstep with local optimism.
2. **`CellSaveFeedback` (edit-kit)** — reserved status slot driven by `status` / `showSavedTick`.
3. **Cache helpers** — small pure helpers per list shape (e.g. patch a `user-payments` search row by id) that snapshot previous data for exact rollback.
4. **Call sites** — wire `onSave` = patch → API → optional soft invalidate; on failure the hook rolls back and the caller toasts.

```
User edits → setLocalValue (instant)
         → commit (blur / Enter / select change)
         → onOptimisticUpdate(cache)
         → status=saving + CellSaveFeedback
         → API updateEntity
         → success: status=saved + tick → idle; optional soft invalidate
         → failure: rollback local + onRollback(cache); toast; idle
```

### Components

| Piece | Responsibility |
| --- | --- |
| `useCellAutosave` | Optimistic display, commit, status machine, optional cache callbacks, rollback |
| `CellSaveFeedback` | Reserved slot: saving → tick → empty; no Retry branch |
| `FormSaveTick` | Unchanged success affordance, composed inside `CellSaveFeedback` |
| `patchUserPaymentInSearchCache` (or equivalent) | Snapshot + patch/rollback row fields in `searchuser-payments` (and related) caches |
| `PaymentEditableFieldCell` | Student payments text fields; use kit + cache helper + toast on error |
| `UserPaymentStatusInlineForm` | Status select on same kit; optimistic value; saving/tick beside selector |
| `ResourceTable` `EditableTextCell` | Shared editable text; `CellSaveFeedback`; cache via caller `onSave` / optional hooks |
| Recent-transactions `TransactionIdCell` | Same text pattern; patch its list cache when RQ-backed |

### UX (lofi)

```
idle:     [ Pending Payment ▾ ] [ wrfwafas fasfas fas ] [          ]
saving:   [ Pending Payment ▾ ] [ wrfwafas fasfas fas ] [ · Saving… ]
saved:    [ Pending Payment ▾ ] [ wrfwafas fasfas fas ] [ ✓ Saved   ]
error:    [ Pending Payment ▾ ] [ <previous value>    ] [          ]  + toast
```

Status-only:

```
[ Pending Payment ▾ ] [ · Saving… ]
[ Verified ▾        ] [ ✓ Saved   ]
```

---

## Data flow

### Happy path

1. User commits (blur / Enter / select `onChange`).
2. Hook keeps/sets local value; sets `saving`; calls `onOptimisticUpdate(next)` to patch the matching list entry by row id.
3. `updateEntity` (or existing mutation) runs.
4. On success: `saved` + show tick (~1.2s default) → `idle`. Soft `invalidateQueries` may run afterward; UI must not depend on refetch to show the new value.
5. When refetch returns the same (or server-normalized) value and status is idle, controlled sync accepts it.

### Failure path

1. API throws.
2. Hook restores previous local value; calls `onRollback(previous)` to restore cache snapshot.
3. Caller shows destructive toast. Status returns to idle. No inline Retry.

### Cache contract

- Prefer shared helpers over ad-hoc `setQueryData` in every cell.
- Snapshot previous cache inside the optimistic update so rollback is exact.
- If a surface has no React Query list, omit cache callbacks — local optimism + feedback still apply.
- Soft invalidate after success is optional reconcile only; never the sole source of the displayed value.

### Sync guards (keep / reinforce)

Existing `shouldSyncControlledCellValue` rules remain:

- Do not sync while `inflight`, `saving`, or `error`.
- While `saved`, do not accept a controlled prop that still lags the committed baseline (avoids wiping optimistic display).

---

## Migration (this pass)

1. Extend `useCellAutosave` with optimistic/rollback callbacks; keep unit tests green and add callback-order coverage.
2. Add `CellSaveFeedback`; switch existing edit-kit consumers off inline Retry + bare `FormSaveTick`.
3. Add user-payment search cache helper(s); wire student-payments text cells.
4. Migrate `UserPaymentStatusInlineForm` to the same pattern (optimistic status, feedback slot, error toast, no success toast).
5. Wire `ResourceTable` editable text + recent-transactions transaction id cell.
6. Smoke-check: edit description/transaction id/status — no flash; saving → tick; force failure — rollback + toast.

---

## Testing

- **Unit (`use-cell-autosave`):** optimistic callback before `onSave`; rollback callback on failure; sync still blocks stale props while saving/saved.
- **Unit (cache helper):** patches the correct row field(s); rollback restores snapshot.
- **Component (optional):** `CellSaveFeedback` renders saving vs tick vs empty; status form keeps selected label while saving.

## Success criteria

- After edit, text/status never blanks or snaps to the old value before the new value settles.
- User always sees saving → saved tick.
- Failed save restores the previous value and shows a destructive toast.

## Follow-ups

- Adopt `CellSaveFeedback` on checkin-histories / attendance / auto-form where useful.
- Audit Glide/grid payment overlays for the same flash; migrate onto edit-kit if needed.
