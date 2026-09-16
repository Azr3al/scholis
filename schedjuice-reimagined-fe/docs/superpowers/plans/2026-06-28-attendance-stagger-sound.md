# Attendance Stagger Sound — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" step as optional; pause after each task for review.

**Goal:** On first roster load of the course attendance marking page, the **first 8 rows** stagger in with ascending tonal clicks; remaining rows mount instantly (no Motion). Gated by Interface sounds and reduced-motion preferences.

**Architecture:** Add a new Web Audio synth (`playStaggerTick`) sharing the existing AudioContext with `playClick`. Convert only the first `STAGGER_ENTRANCE_ROW_CAP` rows to `motion` elements inside a `staggerList` container; render the rest as plain `<tr>`/`<div>`. The marking page passes `isInitialEntrance={true}` only once (first skeleton→roster transition).

**Tech Stack:** Next.js App Router, Motion (`motion/react`), Web Audio API, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-28-attendance-stagger-sound-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/sound/audio-context.ts` | Shared lazy-init AudioContext for all UI sounds |
| `src/lib/sound/stagger-tick-sound.ts` | Ascending tonal tick synth + frequency helper |
| `src/lib/sound/stagger-tick-sound.test.ts` | Unit tests for frequency helper |
| `src/lib/sound/click-sound.ts` | Refactor to use shared AudioContext (no behavior change) |
| `src/components/attendance/attendance-marking-table.tsx` | Stagger row motion + per-row sound callback |
| `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` | One-shot `isInitialEntrance` ref wiring |
| `src/components/record/settings/appearance-pane.tsx` | Broaden Interface sounds copy (optional) |

---

### Task 1: Shared AudioContext + stagger tick frequency helper (TDD)

**Files:**
- Create: `src/lib/sound/audio-context.ts`
- Create: `src/lib/sound/stagger-tick-sound.ts`
- Create: `src/lib/sound/stagger-tick-sound.test.ts`
- Modify: `src/lib/sound/click-sound.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sound/stagger-tick-sound.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  STAGGER_ENTRANCE_ROW_CAP,
  staggerTickFrequencyHz,
} from "@/lib/sound/stagger-tick-sound";

describe("staggerTickFrequencyHz", () => {
  it("returns 440 Hz at index 0", () => {
    expect(staggerTickFrequencyHz(0)).toBeCloseTo(440, 5);
  });

  it("ascends by semitone at index 7", () => {
    expect(staggerTickFrequencyHz(7)).toBeCloseTo(440 * Math.pow(2, 7 / 12), 5);
  });

  it("documents cap — animation and sound apply to first N rows only", () => {
    expect(STAGGER_ENTRANCE_ROW_CAP).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npx vitest run src/lib/sound/stagger-tick-sound.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Create shared AudioContext**

Create `src/lib/sound/audio-context.ts`:

```ts
let audioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}
```

- [ ] **Step 4: Refactor click-sound to use shared context**

In `src/lib/sound/click-sound.ts`, remove the local `audioContext` variable and `getCtx()`, import `getSharedAudioContext` instead:

```ts
import { getSharedAudioContext } from "./audio-context";
import { getUiSoundVolume, isUiSoundEnabled } from "./sound-preference";

/** Base synthesis gain before user volume scaling (~3.3× original 0.06 default). */
const BASE_GAIN = 0.20;

/** Optional warm-up so the first click has lower latency. */
export function primeAudio(): void {
  if (typeof window === "undefined" || !isUiSoundEnabled()) return;
  try {
    getSharedAudioContext();
  } catch {
    // Web Audio unavailable — silently ignore.
  }
}

export function playClick(): void {
  if (typeof window === "undefined" || !isUiSoundEnabled()) return;

  try {
    const ctx = getSharedAudioContext();
    // … rest of playClick unchanged …
```

- [ ] **Step 5: Implement stagger-tick-sound**

Create `src/lib/sound/stagger-tick-sound.ts`:

```ts
import { getSharedAudioContext } from "./audio-context";
import { getUiSoundVolume, isUiSoundEnabled } from "./sound-preference";

/** Max rows that stagger + receive a tick (0–7). Rows beyond mount instantly. */
export const STAGGER_ENTRANCE_ROW_CAP = 8;

const BASE_GAIN = 0.20 * 0.6; // ~60% of playClick base gain
const TICK_DURATION_S = 0.045;

/** Ascending semitone from A4 (440 Hz). Exported for tests. */
export function staggerTickFrequencyHz(index: number): number {
  return 440 * Math.pow(2, index / 12);
}

/**
 * Short tonal tap for staggered list entrances.
 * Caller must pass index < STAGGER_ENTRANCE_ROW_CAP.
 */
export function playStaggerTick(index: number): void {
  if (typeof window === "undefined" || !isUiSoundEnabled()) return;
  if (index < 0 || index >= STAGGER_ENTRANCE_ROW_CAP) return;

  try {
    const ctx = getSharedAudioContext();
    const now = ctx.currentTime;
    const variation = 0.95 + Math.random() * 0.1;

    const master = ctx.createGain();
    master.gain.setValueAtTime(
      BASE_GAIN * getUiSoundVolume() * variation,
      now,
    );

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime((Math.random() - 0.5) * 0.4, now);
    master.connect(panner);
    panner.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(staggerTickFrequencyHz(index), now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7 * variation, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + TICK_DURATION_S);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + TICK_DURATION_S + 0.005);
  } catch {
    // Never break rendering if Web Audio fails.
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npx vitest run src/lib/sound/stagger-tick-sound.test.ts`

Expected: PASS (3 tests)

- [ ] **Step 7: Commit (optional — user authorization required)**

```bash
git add src/lib/sound/audio-context.ts src/lib/sound/stagger-tick-sound.ts src/lib/sound/stagger-tick-sound.test.ts src/lib/sound/click-sound.ts
git commit -m "feat(sound): add ascending stagger tick synth with shared AudioContext"
```

---

### Task 2: Stagger motion + sound on AttendanceMarkingTable

**Files:**
- Modify: `src/components/attendance/attendance-marking-table.tsx`

- [ ] **Step 1: Add imports and props**

Add to `attendance-marking-table.tsx`:

```ts
"use client";

import { motion, useReducedMotion } from "motion/react";
import { staggerItem, staggerList } from "@/lib/sj/motion";
import {
  playStaggerTick,
  STAGGER_ENTRANCE_ROW_CAP,
} from "@/lib/sound/stagger-tick-sound";
```

Extend props:

```ts
type AttendanceMarkingTableProps = {
  rows: attendanceType[];
  isMobile: boolean;
  rowStates: Record<number, RowSaveState>;
  recentlyChangedIds: number[];
  onStatusChange: (rowId: number, status: attendanceType["attendance_status"]) => void;
  onNoteChange: (rowId: number, note: string) => void;
  /** True only on first roster reveal after page load — enables stagger + sounds. */
  isInitialEntrance?: boolean;
};
```

Add helper inside the file:

```ts
function handleRowAnimationStart(
  definition: string,
  index: number,
  playSound: boolean,
): void {
  if (!playSound || definition !== "show") return;
  playStaggerTick(index);
}
```

- [ ] **Step 2: Wire reduced-motion + variant selection**

Inside `AttendanceMarkingTable`:

```ts
export function AttendanceMarkingTable({
  rows,
  isMobile,
  rowStates,
  recentlyChangedIds,
  onStatusChange,
  onNoteChange,
  isInitialEntrance = false,
}: AttendanceMarkingTableProps) {
  const reducedMotion = useReducedMotion();
  const animateEntrance = isInitialEntrance && !reducedMotion;
  const playSound = animateEntrance;
  const staggerRows = animateEntrance
    ? rows.slice(0, STAGGER_ENTRANCE_ROW_CAP)
    : [];
  const staticRows = animateEntrance
    ? rows.slice(STAGGER_ENTRANCE_ROW_CAP)
    : rows;
```

Extract a shared `renderDesktopCells(row)` / `renderMobileRow(row)` helper (or inline) so stagger and static rows share cell markup without duplicating logic.

- [ ] **Step 3: Mobile — stagger first N rows only**

When `animateEntrance`:

```tsx
if (isMobile) {
  if (!animateEntrance) {
    return (
      <div className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <div key={row.id} className={rowClassName(row)}>{/* AttendanceActionCell */}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-subtle">
      <motion.div
        variants={staggerList}
        initial="hidden"
        animate="show"
      >
        {staggerRows.map((row, index) => (
          <motion.div
            key={row.id}
            variants={staggerItem}
            onAnimationStart={(definition) =>
              handleRowAnimationStart(String(definition), index, playSound)
            }
            className={rowClassName(row)}
          >
            {/* AttendanceActionCell — same as today */}
          </motion.div>
        ))}
      </motion.div>
      {staticRows.map((row) => (
        <div key={row.id} className={rowClassName(row)}>
          {/* AttendanceActionCell — same as today */}
        </div>
      ))}
    </div>
  );
}
```

Note: `staticRows` sit **outside** the `motion.div` stagger container so they mount instantly with zero stagger delay.

- [ ] **Step 4: Desktop — stagger first N rows only**

When `animateEntrance`:

```tsx
<motion.tbody
  variants={staggerList}
  initial="hidden"
  animate="show"
>
  {staggerRows.map((row, index) => (
    <motion.tr
      key={row.id}
      variants={staggerItem}
      onAnimationStart={(definition) =>
        handleRowAnimationStart(String(definition), index, playSound)
      }
      className={rowClassName(row)}
    >
      {/* existing <td> cells */}
    </motion.tr>
  ))}
  {staticRows.map((row) => (
    <tr key={row.id} className={rowClassName(row)}>
      {/* existing <td> cells — plain tr, no stagger delay */}
    </tr>
  ))}
</motion.tbody>
```

Plain `<tr>` siblings without `staggerItem` variants mount immediately — they are not sequenced by `staggerChildren`. Only `staggerRows.length` Motion nodes are created.

When `!animateEntrance`, render the original plain `<tbody>` with all rows as `<tr>` (no Motion).

- [ ] **Step 5: Type-check**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit --pretty false 2>&1 | rg "attendance-marking-table|stagger-tick" || true`

Expected: no errors in modified files

- [ ] **Step 6: Commit (optional — user authorization required)**

```bash
git add src/components/attendance/attendance-marking-table.tsx
git commit -m "feat(attendance): stagger marking rows with tonal entrance ticks"
```

---

### Task 3: One-shot initial entrance flag on marking page

**Files:**
- Modify: `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx`

- [ ] **Step 1: Add ref near other refs/state**

After existing refs (e.g. `loadedEventIdRef`), add:

```ts
const hasPlayedInitialEntranceRef = useRef(false);
```

- [ ] **Step 2: Compute isInitialEntrance before render**

Before the `return (` in the component body (after `isEmpty` is computed):

```ts
const isInitialEntrance =
  !hasPlayedInitialEntranceRef.current && !isLoading && !isEmpty;
if (isInitialEntrance) {
  hasPlayedInitialEntranceRef.current = true;
}
```

- [ ] **Step 3: Pass prop to table**

Update the populated-table branch:

```tsx
<AttendanceMarkingTable
  rows={displayRows}
  isMobile={isMobile}
  rowStates={rowStates}
  recentlyChangedIds={recentlyChangedIds}
  onStatusChange={handleStatusChange}
  onNoteChange={handleNoteChange}
  isInitialEntrance={isInitialEntrance}
/>
```

Session switches remount the table via `key={eventIndex}` crossfade, but `hasPlayedInitialEntranceRef` stays `true` → no stagger, no sounds.

- [ ] **Step 4: Type-check**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit --pretty false 2>&1 | rg "attendance/marking" || true`

Expected: no errors

- [ ] **Step 5: Commit (optional — user authorization required)**

```bash
git add src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx
git commit -m "feat(attendance): play stagger sounds only on initial roster load"
```

---

### Task 4: Appearance copy tweak (optional)

**Files:**
- Modify: `src/components/record/settings/appearance-pane.tsx`

- [ ] **Step 1: Update description strings**

Change:

```tsx
description="Play a subtle click when switching sidebar sections."
```

to:

```tsx
description="Play subtle clicks on navigation and list entrances."
```

Change inner helper text:

```tsx
Mechanical click on sidebar context switches.
```

to:

```tsx
Clicks on sidebar switches and staggered list entrances.
```

- [ ] **Step 2: Commit (optional — user authorization required)**

```bash
git add src/components/record/settings/appearance-pane.tsx
git commit -m "docs(settings): broaden Interface sounds description"
```

---

### Task 5: Manual QA

- [ ] **Step 1: Start dev server**

Run: `cd schedjuice-reimagined-fe && npm run dev`

- [ ] **Step 2: Run automated tests**

Run: `cd schedjuice-reimagined-fe && npx vitest run src/lib/sound/stagger-tick-sound.test.ts`

Expected: PASS

- [ ] **Step 3: Manual checklist (from spec §9)**

1. Open `/courses/[id]/attendance/marking/today` with 10+ students, Interface sounds **on** → first 8 rows stagger + clicks; rows 9+ appear instantly (scroll down to confirm no animation delay).
2. Switch session → crossfade, **no clicks**, rows appear instantly (no stagger).
3. Hard reload → clicks play again.
4. Interface sounds **off** → stagger runs, silent.
5. Enable reduced motion in OS → instant rows, no clicks.
6. Roster with ≤8 students → one click per row.
7. Narrow viewport (mobile) → same behavior on stacked rows.

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Per-row Motion callback (Approach A) | Task 2 — `onAnimationStart` on each row |
| Cap 8 clicks + stagger | Task 1 — `STAGGER_ENTRANCE_ROW_CAP`; Task 2 — `rows.slice` split |
| Only first N rows animated (performance) | Task 2 — `staggerRows` + plain `staticRows` |
| Ascending semitone pitch | Task 1 — `staggerTickFrequencyHz` |
| Initial load only | Task 3 — `hasPlayedInitialEntranceRef` |
| Interface sounds toggle + volume | Task 1 — `isUiSoundEnabled` / `getUiSoundVolume` |
| Reduced motion skips stagger + sound | Task 2 — `useReducedMotion` |
| Session switch: crossfade only, no stagger | Task 3 — ref persists across remounts |
| Desktop + mobile | Task 2 — both layouts |
| Shared AudioContext | Task 1 — `audio-context.ts` |
| No change to `playClick` character | Task 1 — refactor only imports context |
