# Attendance Marking — Stagger Entrance + Tonal Click Sound

> When the course attendance marking roster first loads, student rows stagger in with a capped ascending tonal click per row — synced to Motion, gated by existing Interface sounds preferences.

**Status:** Design approved (brainstorming 2026-06-28). Ready for implementation plan.  
**Authority:** [`DESIGN.md`](../../../DESIGN.md) §12 (motion), existing sound system in `src/lib/sound/`.  
**Predecessor:** [Course attendance marking spec](2026-06-28-course-attendance-marking-design.md)

---

## 1. Context

The attendance marking table (`AttendanceMarkingTable`) currently renders plain `<tr>` / `<div>` rows with no stagger. The marking page uses `crossfade` on session change only.

The app already has a Web Audio UI sound system (`playClick()` — mechanical brown-switch thock) gated by **Interface sounds** toggle + volume in Appearance settings. Stagger entrances elsewhere (record rails, course lists) use `staggerList` / `staggerItem` from `@/lib/sj/motion.ts`.

This spec adds row stagger on initial roster load and a **new** ascending tonal click sound — distinct from sidebar navigation clicks.

---

## 2. Goals

- On first roster reveal, only the **first 8 visible rows** stagger in (desktop table + mobile stacked layout). Remaining rows render instantly — they are below the fold and do not need Motion overhead.
- Play up to **8 ascending tonal clicks**, one per staggered row, timed to each row's Motion entrance (same cap as animation).
- Fire sounds **only on initial page load** — not when switching sessions/days.
- Respect existing **Interface sounds** toggle and volume slider.
- Respect **`prefers-reduced-motion`** — instant rows, no sounds.

## 3. Non-Goals

- No sounds on session/day navigation (crossfade only, unchanged).
- No separate "Attendance sounds" preference — reuse Interface sounds.
- No audio asset files — synthesize via Web Audio like `click-sound.ts`.
- No changes to attendance dashboard matrix, god-view, or other surfaces.
- Do not change `playClick()` character or call sites.

---

## 4. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Approach | **A — per-row Motion callback** synced to stagger entrance |
| Surface | `AttendanceMarkingTable` (marking route only) |
| Sound trigger | **Initial roster load only** (skeleton → populated table, first time) |
| Stagger + click cap | **First 8 rows only** — stagger animation and sounds; row 9+ instant plain elements |
| Pitch behavior | **Ascending** — each click slightly higher (short arpeggio) |
| Performance | No `motion` wrappers on rows beyond the cap — avoids animating off-screen rows |
| Preferences | Existing Interface sounds toggle + volume |
| Reduced motion | Skip stagger animation and sounds |

---

## 5. Sound synthesis

**New module:** `src/lib/sound/stagger-tick-sound.ts`

```ts
export function playStaggerTick(index: number): void
```

| Property | Value |
|----------|-------|
| Engine | Web Audio API; share/lazy-init AudioContext pattern from `click-sound.ts` |
| Character | Short **tonal tap** — triangle or sine oscillator, fast exponential decay (~30–50 ms) |
| Frequency | Base ~440 Hz, ascending by semitone: `440 × 2^(index / 12)` for `index` 0–7 |
| Gain | ~60% of `playClick` base gain (`BASE_GAIN * 0.6 * getUiSoundVolume()`) |
| Variation | Light random pan (±0.2) and ±5% gain jitter per tick |
| Gating | `isUiSoundEnabled()`; no-op on SSR or Web Audio failure |
| Index contract | Caller passes 0-based index within `staggerRows`; only invoked for rows in `0 … STAGGER_ENTRANCE_ROW_CAP - 1` |

`playStaggerTick` is **not** a variant of `playClick()` — separate export, separate sonic identity.

---

## 6. Motion

From `@/lib/sj/motion.ts`:

| Element | Variant |
|---------|---------|
| `<tbody>` (desktop) / row list wrapper (mobile) | `staggerList`, `initial="hidden"`, `animate="show"` — **only when `isInitialEntrance`** |
| Rows `0 … cap-1` | `motion.tr` / `motion.div` with `staggerItem` |
| Rows `cap … n-1` | Plain `<tr>` / `<div>` — no Motion, mount at full opacity immediately |

Shared cap constant: `STAGGER_ENTRANCE_ROW_CAP = 8` (exported from `stagger-tick-sound.ts`; used for both animation slice and sound index guard).

Split rows at render time:

```ts
const staggerRows = rows.slice(0, STAGGER_ENTRANCE_ROW_CAP);
const staticRows = rows.slice(STAGGER_ENTRANCE_ROW_CAP);
```

Only `staggerRows` use `motion.tr` / `motion.div` with `staggerItem`. `staticRows` are plain `<tr>` / `<div>` siblings in the same container — no Motion nodes, mount at full opacity immediately.

```ts
const staggerRows = rows.slice(0, STAGGER_ENTRANCE_ROW_CAP);
const staticRows = rows.slice(STAGGER_ENTRANCE_ROW_CAP);
```

Inside a single `motion.tbody` (desktop) or stagger wrapper (mobile): stagger children first, then plain static siblings. Plain rows without variants are not delayed by `staggerChildren`.

When `useReducedMotion()` is true:

- All rows render as plain elements (no Motion).
- Do not call `playStaggerTick`.

When `isInitialEntrance` is false (session switch):

- All rows render as plain elements — no stagger, no sounds.

Session change on the marking page keeps existing `AnimatePresence` + `crossfade` on the table wrapper keyed by `eventIndex`. Session switches do **not** re-run row stagger or sounds.

---

## 7. Wiring

### 7.1 Page — `marking/[eventIndex]/page.tsx`

- Add `hasPlayedInitialStaggerSound` ref (default `false`).
- When transitioning from loading → populated table for the **first** time, pass `playStaggerSounds={true}` to `AttendanceMarkingTable`.
- Set ref to `true` immediately when passing `true` (ensures session switches never replay).
- Subsequent renders (session change, autosave refresh) pass `playStaggerSounds={false}`.

### 7.2 Table — `attendance-marking-table.tsx`

New prop:

```ts
playStaggerSounds?: boolean; // default false
```

Only staggered rows (index `i` in `staggerRows`):

```tsx
{staggerRows.map((row, index) => (
  <motion.tr
    key={row.id}
    variants={staggerItem}
    onAnimationStart={(definition) => {
      if (playSound && definition === "show") {
        playStaggerTick(index);
      }
    }}
    …
  />
))}
{staticRows.map((row) => (
  <tr key={row.id} …>{/* same cells, no motion */}</tr>
))}
```

Mobile stacked rows: same split — `motion.div` for `staggerRows`, plain `div` for `staticRows`.

**Note:** `onAnimationStart` with variant name `"show"` ensures the tick fires when the row begins entering, not on exit or re-mount without animation.

### 7.3 Appearance pane (optional copy tweak)

Broaden Interface sounds description from "sidebar context switches" to include list entrances. Low priority; can ship in same PR or follow-up.

---

## 8. Error handling

- Web Audio failures are swallowed — never block rendering or marking.
- If Interface sounds are off, stagger animation still runs on the first 8 rows (unless reduced motion).
- Empty roster (0 rows): no sounds, no stagger children.

---

## 9. Testing

### Manual

1. Open `/courses/[id]/attendance/marking/today` with 10+ students, Interface sounds **on** → first 8 rows stagger + ascending clicks; rows 9+ appear instantly with no animation delay.
2. Switch to another session → rows crossfade, **no clicks**.
3. Reload page → clicks play again on first load.
4. Interface sounds **off** → stagger runs, silent.
5. Reduced motion enabled → instant rows, no clicks.
6. Roster with ≤8 students → one click per row, no partial cap silence mid-list.
7. Mobile breakpoint → same behavior on stacked rows.

### Unit (optional)

- Pure helper: frequency at index 0, 7 matches semitone formula; document that index ≥8 is never called.

---

## 10. File change summary

| Action | Path |
|--------|------|
| Add | `src/lib/sound/stagger-tick-sound.ts` |
| Modify | `src/components/attendance/attendance-marking-table.tsx` |
| Modify | `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` |
| Optional | `src/components/record/settings/appearance-pane.tsx` (copy tweak) |

No backend or API changes.
