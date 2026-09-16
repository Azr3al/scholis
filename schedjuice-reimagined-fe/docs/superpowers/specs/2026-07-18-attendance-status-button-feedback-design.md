# Attendance status button feedback

**Date:** 2026-07-18  
**Status:** Approved design (Approach 1 — reinforce current control)  
**Scope:** Frontend (`schedjuice-reimagined-fe`) — course attendance marking

## Problem

Clicking the four attendance status buttons (Present / Late / Absent / Unregistered) feels weak, broken, and unconfident:

1. **Press** — `active:scale-[0.98]` is barely perceptible; no clear “I pushed something.”
2. **Selected** — selected fills use ~`bg-*/10` and thin borders, so the active chip does not read at a glance.
3. **Save confidence** — status updates are optimistic and autosaved, but row save indicators (`pending` → `saving` → `saved` → `error`) are gated to **note** edits only. Status clicks leave the row dot idle, so “did it stick?” is unanswered.

## Goals

- Confident / tactile feedback that still fits the muted Schedjuice skin (not punchy redesign).
- Instant press feel on pointer/touch down.
- Unmistakable selected state for the active status.
- Status edits drive the existing `AttendanceRowSaveIndicator` lifecycle (same as notes).
- Desktop icon chips and mobile labeled 2×2 chips share the same treatment.
- Respect `prefers-reduced-motion`: keep contrast/state changes; drop squash/pulse motion.

## Non-goals

- Replacing the four-button control with a sliding segmented thumb.
- Per-button save flash / checkmark animation on the chip itself.
- Changing autosave debounce timings, payload shape, or API.
- Redesigning the toolbar autosave status bar (remains global backup).
- Changing same-status click semantics (still a data no-op; may still show press flash).

## Approach

**Approach 1 — Reinforce the current control** (chosen).

Keep `AttendanceStatusControl` + `ATTENDANCE_STATUS_OPTIONS`. Strengthen press and selected visuals. Broaden `useAttendanceAutosave` row-state helpers so status dirty edits update `rowStates` the same way notes do.

Rejected alternatives:

- **Approach 2 (motion-forward):** bounce/ring flash on select — defer unless Approach 1 still feels soft after stronger scale + fill.
- **Approach 3 (sliding thumb):** bigger redesign; higher layout/tooltip risk for little gain.

## Interaction design

### Press

| Aspect | Spec |
|--------|------|
| Scale | ~`0.94` on `:active` (replace `0.98`) |
| Border | Slightly deepen on active |
| Timing | ~120ms (`DURATION.fast` / `--duration-fast`), ease `EASE.quiet` |
| Reduced motion | No scale; color/border only |

### Selected

| Aspect | Spec |
|--------|------|
| Fill | Semantic tint at `/20` (up from `/10`) |
| Border | Full semantic border (Present/Late/Absent) |
| Ring | `ring-1` in status color at ~40% opacity for Present/Late/Absent |
| Unregistered | Neutral strong border + surface-active (no semantic color ring) |
| Idle | Stay quiet; light hover preview of status color |

### Same-status re-click

- Data: early return if status unchanged (existing behavior).
- UI: press feedback may still flash so the control does not feel dead; selection stays put; no new dirty mark if unchanged.

### Row highlight assist

- Keep brief `bg-brand/5` row highlight on status change as a soft assist.
- The save dot is the primary “committed” signal.

## Save confidence (row indicator)

### Current behavior

In `use-attendance-autosave.ts`, helpers such as `setPendingRowStatesForNotes`, `setSavingRowStates`, `setSavedRowStates`, and `markRecentlyChanged` filter with `isNoteEditKind`. Status dirty rows never enter `rowStates`, so `AttendanceRowSaveIndicator` stays idle for status-only edits.

### Target behavior

| State | Meaning |
|-------|---------|
| `pending` | Queued in debounce window |
| `saving` | Request in flight |
| `saved` | Success; hold briefly, then return to `idle` |
| `error` | Failed; existing retry / toolbar error paths |

Flow:

```
click status → optimistic UI + markDirty(id, "status")
            → rowStates[id] = pending
            → debounce (existing status: 250ms / 400ms maxWait)
            → saving → API → saved | error
```

### Rules

- Drive `rowStates` for both `status` and `note` dirty kinds (remove or broaden note-only filters).
- One row state per row (existing model); mixed bursts collapse to latest kind per row as today.
- Desktop table and mobile action cell already render the indicator — no new chrome.
- Toolbar autosave bar unchanged.
- Mark-all-present (and other status dirty paths) should light row states via the same dirty pipeline.
- Offline / error: existing retry and red-dot behavior; no new error UI.

## Components & files

| File | Change |
|------|--------|
| `src/components/attendance/attendance-status-config.ts` | Richer `selectedClass`; keep quiet `idleClass` |
| `src/components/attendance/attendance-status-control.tsx` | Stronger press (~0.94), motion tokens, reduced-motion |
| `src/components/attendance/use-attendance-autosave.ts` | Status + note drive `rowStates` |
| Autosave / row-state tests | Cover status → pending / saving / saved / error |
| Optional nearby control tests | Assert selected/press classes if patterns already exist |

No backend changes.

## Testing

### Automated

- Unit/integration tests around `useAttendanceAutosave` (or existing autosave tests): status dirty revision sets `pending` → `saving` → `saved` (and `error` on failure).
- Note path remains covered (regression).

### Manual

1. Mark Present → squash, mint selected, row dot pending → saving → saved.
2. Switch to Late → selected updates; dot cycles again.
3. Re-click Late → press flash, no status change, no new dirty if already saved.
4. Edit a note → same dot lifecycle still works.
5. Kill network → error dot + toolbar error.
6. Mobile 2×2 chips: same press + selected treatment.
7. Reduced-motion OS setting: selected contrast still clear; no squash.

## Success criteria

- Status click feels intentionally pressed.
- Active status is obvious without inspecting icons carefully.
- After a status change, the row indicator answers “queued / saving / saved / failed.”
- Notes and toolbar autosave behavior unchanged in spirit.
- No API or debounce timing regressions.
