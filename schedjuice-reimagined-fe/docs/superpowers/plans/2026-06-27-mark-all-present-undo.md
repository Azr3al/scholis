# Mark All Present Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-second inline Undo control after "Mark all as present" on the attendance marking page, reverting only rows changed by that bulk action (including after autosave).

**Architecture:** Pure snapshot/restore helpers in `mark-all-present-undo-core.ts`, a thin `useMarkAllPresentUndo` hook for timer + snapshot state (reusing `UNDO_WINDOW_MS` from `undo-core`), and wiring in the marking page toolbar. No backend or autosave hook changes.

**Tech Stack:** Next.js client component, React hooks, Vitest, existing attendance autosave (`useAttendanceAutosave`), shadcn `Button`.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-27-mark-all-present-undo-design.md`

---

## File Structure

- Create `schedjuice-reimagined-fe/src/components/attendance/mark-all-present-undo-core.ts` — pure snapshot build, undo apply, visibility check.
- Create `schedjuice-reimagined-fe/src/components/attendance/mark-all-present-undo-core.test.ts` — unit tests.
- Create `schedjuice-reimagined-fe/src/components/attendance/use-mark-all-present-undo.ts` — timer + snapshot hook.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` — integrate hook, render Undo link, disable mark-all button.

---

### Task 1: Pure undo core helpers

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/attendance/mark-all-present-undo-core.ts`
- Create: `schedjuice-reimagined-fe/src/components/attendance/mark-all-present-undo-core.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mark-all-present-undo-core.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { attendanceStatus, type attendanceType } from "@/types/attendance";
import {
  buildMarkAllPresentSnapshot,
  applyMarkAllPresentUndo,
  isMarkAllUndoVisible,
  type MarkAllPresentSnapshot,
} from "./mark-all-present-undo-core";
import { UNDO_WINDOW_MS } from "@/components/record/inline/undo-core";

function row(
  id: number,
  status: attendanceStatus,
): Pick<attendanceType, "id" | "attendance_status"> {
  return { id, attendance_status: status };
}

describe("mark-all-present-undo-core", () => {
  it("buildMarkAllPresentSnapshot captures only non-present rows", () => {
    const rows = [
      row(1, attendanceStatus.present),
      row(2, attendanceStatus.absent),
      row(3, attendanceStatus.late),
    ];
    const snapshot = buildMarkAllPresentSnapshot(rows);
    expect(snapshot.get(1)).toBeUndefined();
    expect(snapshot.get(2)).toBe(attendanceStatus.absent);
    expect(snapshot.get(3)).toBe(attendanceStatus.late);
    expect(snapshot.size).toBe(2);
  });

  it("buildMarkAllPresentSnapshot returns empty map when all present", () => {
    const rows = [row(1, attendanceStatus.present), row(2, attendanceStatus.present)];
    expect(buildMarkAllPresentSnapshot(rows).size).toBe(0);
  });

  it("applyMarkAllPresentUndo restores snapshotted rows only", () => {
    const attendances = [
      row(1, attendanceStatus.present),
      row(2, attendanceStatus.present),
      row(3, attendanceStatus.present),
    ] as attendanceType[];
    const snapshot: MarkAllPresentSnapshot = new Map([
      [2, attendanceStatus.absent],
      [3, attendanceStatus.late],
    ]);
    const next = applyMarkAllPresentUndo(attendances, snapshot);
    expect(next[0].attendance_status).toBe(attendanceStatus.present);
    expect(next[1].attendance_status).toBe(attendanceStatus.absent);
    expect(next[2].attendance_status).toBe(attendanceStatus.late);
  });

  it("isMarkAllUndoVisible respects UNDO_WINDOW_MS", () => {
    expect(isMarkAllUndoVisible(1000, 1000 + UNDO_WINDOW_MS - 1)).toBe(true);
    expect(isMarkAllUndoVisible(1000, 1000 + UNDO_WINDOW_MS)).toBe(false);
    expect(isMarkAllUndoVisible(null, 5000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/components/attendance/mark-all-present-undo-core.test.ts`

Expected: FAIL — module `./mark-all-present-undo-core` not found.

- [ ] **Step 3: Write minimal implementation**

Create `mark-all-present-undo-core.ts`:

```typescript
import { UNDO_WINDOW_MS } from "@/components/record/inline/undo-core";
import { attendanceStatus, type attendanceType } from "@/types/attendance";

export type MarkAllPresentSnapshot = Map<number, attendanceStatus>;

export function buildMarkAllPresentSnapshot(
  rows: Pick<attendanceType, "id" | "attendance_status">[],
): MarkAllPresentSnapshot {
  const snapshot: MarkAllPresentSnapshot = new Map();
  for (const row of rows) {
    if (row.attendance_status !== attendanceStatus.present) {
      snapshot.set(row.id, row.attendance_status);
    }
  }
  return snapshot;
}

export function applyMarkAllPresentUndo(
  attendances: attendanceType[],
  snapshot: MarkAllPresentSnapshot,
): attendanceType[] {
  if (snapshot.size === 0) return attendances;
  return attendances.map((row) => {
    const previous = snapshot.get(row.id);
    if (previous == null) return row;
    return { ...row, attendance_status: previous };
  });
}

export function isMarkAllUndoVisible(
  offeredAt: number | null,
  now: number = Date.now(),
): boolean {
  if (offeredAt == null) return false;
  return now - offeredAt < UNDO_WINDOW_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/components/attendance/mark-all-present-undo-core.test.ts`

Expected: PASS (4 tests).

---

### Task 2: Undo timer hook

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/attendance/use-mark-all-present-undo.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_WINDOW_MS } from "@/components/record/inline/undo-core";
import {
  isMarkAllUndoVisible,
  type MarkAllPresentSnapshot,
} from "./mark-all-present-undo-core";

export function useMarkAllPresentUndo() {
  const [snapshot, setSnapshot] = useState<MarkAllPresentSnapshot | null>(null);
  const [offeredAt, setOfferedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setSnapshot(null);
    setOfferedAt(null);
  }, []);

  const offer = useCallback(
    (nextSnapshot: MarkAllPresentSnapshot) => {
      if (nextSnapshot.size === 0) return;
      if (timerRef.current != null) clearTimeout(timerRef.current);
      setSnapshot(nextSnapshot);
      setOfferedAt(Date.now());
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setSnapshot(null);
        setOfferedAt(null);
      }, UNDO_WINDOW_MS);
    },
    [],
  );

  const undo = useCallback((): MarkAllPresentSnapshot | null => {
    if (snapshot == null || snapshot.size === 0) return null;
    const current = snapshot;
    clear();
    return current;
  }, [snapshot, clear]);

  useEffect(
    () => () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    },
    [],
  );

  const isVisible = isMarkAllUndoVisible(offeredAt);

  return { snapshot, isVisible, offer, undo, clear };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd schedjuice-reimagined-fe && pnpm tsc --noEmit --pretty false 2>&1 | head -20`

Expected: No errors referencing `use-mark-all-present-undo.ts`.

---

### Task 3: Wire into attendance marking page

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx`

- [ ] **Step 1: Add imports**

At top of file, add:

```typescript
import {
  applyMarkAllPresentUndo,
  buildMarkAllPresentSnapshot,
} from "@/components/attendance/mark-all-present-undo-core";
import { useMarkAllPresentUndo } from "@/components/attendance/use-mark-all-present-undo";
```

- [ ] **Step 2: Initialize hook in component**

After `const isMobile = useIsMobile();`, add:

```typescript
const markAllUndo = useMarkAllPresentUndo();
```

- [ ] **Step 3: Replace `markAllAsPresent` and add undo handler**

Replace the existing `markAllAsPresent` function with:

```typescript
const handleMarkAllUndo = useCallback(() => {
  const snapshot = markAllUndo.undo();
  if (snapshot == null || snapshot.size === 0) return;

  const restoredIds = Array.from(snapshot.keys());
  setAttendances((prev) => applyMarkAllPresentUndo(prev, snapshot));
  setDirtyIds((prev) => Array.from(new Set([...prev, ...restoredIds])));
  setDirtyRevision((revision) => revision + 1);
}, [markAllUndo]);

const markAllAsPresent = () => {
  const snapshot = buildMarkAllPresentSnapshot(attendances);
  if (snapshot.size === 0) return;

  const changedIds = Array.from(snapshot.keys());
  const next = attendances.map((row) => ({
    ...row,
    attendance_status: attendanceStatus.present,
  }));

  setAttendances(next);
  setDirtyIds((prev) => Array.from(new Set([...prev, ...changedIds])));
  setDirtyRevision((revision) => revision + 1);
  markAllUndo.offer(snapshot);
};
```

- [ ] **Step 4: Update sticky toolbar JSX**

Replace the mark-all button block (lines ~423–431) with:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <Button
    variant="outline"
    className="border-success w-full sm:w-auto"
    onClick={markAllAsPresent}
    disabled={
      isInitialAttendanceLoad ||
      attendances.length === 0 ||
      markAllUndo.isVisible
    }
  >
    Mark all as present
  </Button>
  {markAllUndo.isVisible ? (
    <span
      role="button"
      tabIndex={0}
      onClick={handleMarkAllUndo}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleMarkAllUndo();
      }}
      className="text-accent text-sm underline-offset-2 hover:underline"
    >
      Undo
    </span>
  ) : null}
</div>
```

The outer sticky toolbar `flex` row keeps present count and autosave status unchanged.

- [ ] **Step 5: Clear undo on event change**

Inside the `useEffect` that resets state when `currentEventId` changes (the block that calls `setAttendances([])`, `setDirtyIds([])`, `setDirtyRevision(0)`), add:

```typescript
markAllUndo.clear();
```

Add `markAllUndo.clear` to that effect's dependency array.

- [ ] **Step 6: Run lint and typecheck on touched files**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/components/attendance/mark-all-present-undo-core.test.ts && pnpm tsc --noEmit --pretty false 2>&1 | rg "attendance/marking|mark-all-present" || true`

Expected: Tests PASS; no TS errors in modified attendance files.

---

### Task 4: Manual QA checklist

- [ ] Open `/courses/{id}/attendance/marking/today` with mixed attendance statuses.
- [ ] Click **Mark all as present** — Undo appears; button disables.
- [ ] Click **Undo** before save — rows revert; autosave shows saving then saved.
- [ ] Click **Mark all as present** again; wait for autosave **Saved**; click **Undo** — rows revert and save again.
- [ ] With all rows already present, click **Mark all as present** — no Undo, button stays enabled.
- [ ] Mark all; try clicking **Mark all as present** again within 5s — button stays disabled.
- [ ] Mark all; navigate to previous/next day — no stale Undo on new day.
