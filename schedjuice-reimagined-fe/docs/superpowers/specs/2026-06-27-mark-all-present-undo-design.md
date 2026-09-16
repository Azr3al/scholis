# Mark All Present Undo — Attendance Marking Design

## Context

The course attendance marking page (`/courses/[id]/attendance/marking/[eventIndex]`) has a **Mark all as present** button in the sticky toolbar. Clicking it sets every student row to `present`, marks changed rows dirty, and triggers autosave after a 750ms debounce. There is no confirmation and no way to reverse a mistaken bulk mark.

Teachers sometimes mis-click or realize immediately that not everyone was present. A short undo window reduces friction without adding a confirmation dialog.

## Goals

- After **Mark all as present**, show an inline **Undo** control in the sticky toolbar for **5 seconds**.
- Undo restores **only rows changed by that action** to their previous attendance statuses.
- Undo works **even if autosave already persisted** the mark-all change (revert triggers a new autosave).
- While Undo is visible, **Mark all as present** is disabled (second click is a no-op).
- Reuse existing undo timing constants from `undo-core` (`UNDO_WINDOW_MS = 5000`) for consistency with course record inline edits.

## Non-Goals

- No toast/snackbar undo UI.
- No undo for individual row status changes (existing per-row editing only).
- No undo after the 5-second window expires.
- No backend changes — undo is client state + existing bulk attendance PUT.
- No confirmation dialog before mark-all.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Undo scope | Restore only rows changed by mark-all, even after server save |
| UI placement | Inline in sticky toolbar, next to the mark-all button |
| Visibility duration | 5 seconds (matches `UNDO_WINDOW_MS`) |
| Second mark-all during window | Button disabled — no-op |

## Behavior

### Mark all as present

1. User clicks **Mark all as present**.
2. Compute rows where `attendance_status !== present`.
3. If **no rows change** (everyone already present): no snapshot, no Undo, button stays enabled.
4. Otherwise:
   - Snapshot `{ [rowId]: previousStatus }` for each changed row.
   - Set all rows to `present` (existing logic).
   - Mark changed row IDs dirty; bump `dirtyRevision`.
   - Start 5-second Undo visibility timer.
   - Disable **Mark all as present** until timer expires or user clicks Undo.

### Undo

1. User clicks **Undo** within the window (or timer expires — see below).
2. **On Undo click:**
   - For each row in the snapshot, restore `attendance_status` to the snapshotted value.
   - Mark restored row IDs dirty; bump `dirtyRevision` (autosave persists revert).
   - Clear snapshot and timer; re-enable **Mark all as present**.
3. **On timer expiry:**
   - Clear snapshot; re-enable button. No server call.

### Interim edits during undo window

If the user changes individual row statuses while Undo is visible, clicking Undo still restores **all snapshotted rows** to their pre-mark-all statuses, overwriting any interim edits on those rows only. Rows not in the snapshot are unaffected.

### Autosave interaction

No changes to `useAttendanceAutosave`. Mark-all and undo both update local `attendances`, `dirtyIds`, and `dirtyRevision`. The existing 750ms debounce handles save and revert independently.

### Navigation / unmount

Changing teaching day calls `waitForFlush` before navigation (existing). Undo snapshot is discarded on unmount via hook cleanup.

## UI

Sticky toolbar layout after a successful mark-all (when at least one row changed):

```
[ Mark all as present (disabled) ]  Undo    Present (15/15) 100%    [ autosave status ]
```

- **Undo** — underlined accent text link (`text-accent underline-offset-2 hover:underline`), same interaction pattern as course record inline edits (`role="button"`, Enter key support).
- No separate "Marked all present" label in v1 (keeps toolbar compact).
- Optional `AnimatePresence` fade is out of scope for v1.

## Architecture

### Approach: dedicated hook (recommended over inline page state or generalized `useUndo`)

| File | Responsibility |
|------|----------------|
| `src/components/attendance/mark-all-present-undo-core.ts` | Pure helpers: build snapshot, apply undo restore, visibility check |
| `src/components/attendance/use-mark-all-present-undo.ts` | React hook: timer, snapshot state, `offer` / `undo` / `clear`, `isVisible` |
| `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` | Wire hook into mark-all handler; render Undo; disable button |

Reuses `UNDO_WINDOW_MS` and visibility pattern from `@/components/record/inline/undo-core`.

### Hook API (sketch)

```typescript
type MarkAllPresentSnapshot = Map<number, attendanceStatus>;

function useMarkAllPresentUndo(): {
  isVisible: boolean;
  offer: (snapshot: MarkAllPresentSnapshot) => void;
  undo: () => MarkAllPresentSnapshot | null;
  clear: () => void;
  snapshot: MarkAllPresentSnapshot | null;
};
```

The page owns applying snapshot/restore to `attendances` and dirty state; the hook owns timing and snapshot storage.

## Edge Cases

| Case | Behavior |
|------|----------|
| All already present | No snapshot, no Undo, button enabled |
| Second mark-all during window | Button disabled |
| Undo after autosave completed | Local revert + new autosave |
| Offline mark-all then undo | Both work locally; autosave queues revert when online |
| Event/day change during window | Snapshot cleared on unmount |

## Testing

### Unit tests (`mark-all-present-undo-core.test.ts`)

- `buildMarkAllPresentSnapshot` — only non-present rows captured
- `applyMarkAllPresentUndo` — restores snapshotted rows, leaves others unchanged
- Visibility helper — visible within window, expired after

### Manual QA

- Mark all → Undo before autosave completes
- Mark all → wait for "Saved" → Undo
- All already present — no Undo appears
- Mark all → try second click — button disabled
- Mark all → change one row manually → Undo — snapshotted rows revert

## Related Code

- Marking page: `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx`
- Autosave: `src/components/attendance/use-attendance-autosave.ts`
- Existing undo pattern: `src/components/record/inline/use-undo.ts`, `undo-core.ts`
