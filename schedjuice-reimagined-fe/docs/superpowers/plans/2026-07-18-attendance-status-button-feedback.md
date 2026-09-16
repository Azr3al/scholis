# Attendance Status Button Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make attendance status clicks feel confident — stronger press, clearer selected chips, and row save indicators for status edits (not just notes).

**Architecture:** Keep the four-button `AttendanceStatusControl`. Broaden row-save tracking in `useAttendanceAutosave` via a small pure eligibility helper so status dirty rows get `pending` → `saving` → `saved`/`error`. Strengthen selected Tailwind classes in `attendance-status-config.ts` and press/motion classes on the control. No API or debounce timing changes.

**Tech Stack:** Next.js client components, React, Tailwind CSS v4, Vitest, `@testing-library/react` + happy-dom for hook/control tests, TanStack Query (already used inside autosave).

**Spec:** `docs/superpowers/specs/2026-07-18-attendance-status-button-feedback-design.md`

## Global Constraints

- Confident / tactile, still muted Schedjuice skin — no segmented sliding control, no per-chip save flash.
- Status and note both drive `AttendanceRowSaveIndicator`; toolbar autosave bar unchanged.
- Debounce stays status `250ms` / `400ms` maxWait; note timings unchanged.
- Same-status click remains a data no-op; press flash may still show.
- `prefers-reduced-motion`: keep contrast; no active scale squash.
- Frontend only (`schedjuice-reimagined-fe`); no backend changes.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/attendance/attendance-row-save-tracking.ts` | Create | Pure helper: which dirty row IDs get row save indicator updates |
| `src/components/attendance/attendance-row-save-tracking.test.ts` | Create | Unit tests for status + note eligibility |
| `src/components/attendance/use-attendance-autosave.ts` | Modify | Use helper instead of `isNoteEditKind` for all row-state paths |
| `src/components/attendance/use-attendance-autosave.test.tsx` | Create | Hook test: status dirty → pending → saving → saved |
| `src/components/attendance/attendance-status-config.ts` | Modify | Stronger selected fills + rings |
| `src/components/attendance/attendance-status-config.test.ts` | Create | Assert selected class tokens |
| `src/components/attendance/attendance-status-control.tsx` | Modify | Press scale `0.94`, motion tokens, reduced-motion |
| `src/components/attendance/attendance-status-control.test.tsx` | Create | Assert press / selected classes on rendered buttons |

No changes to marking table/action cell chrome (they already render `AttendanceRowSaveIndicator`).

---

### Task 1: Status row save indicator tracking

**Files:**
- Create: `src/components/attendance/attendance-row-save-tracking.ts`
- Create: `src/components/attendance/attendance-row-save-tracking.test.ts`
- Modify: `src/components/attendance/use-attendance-autosave.ts`
- Create: `src/components/attendance/use-attendance-autosave.test.tsx`

**Interfaces:**
- Consumes: `AttendanceDirtyEditKind` from `./attendance-autosave-debounce`
- Produces: `filterIdsForRowSaveIndicator(ids, dirtyKindByRow): number[]` — includes rows whose kind is `"status"` or `"note"`; drops ids missing a kind entry

- [ ] **Step 1: Write the failing unit tests for the helper**

Create `src/components/attendance/attendance-row-save-tracking.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { filterIdsForRowSaveIndicator } from "./attendance-row-save-tracking";
import type { AttendanceDirtyEditKind } from "./attendance-autosave-debounce";

describe("filterIdsForRowSaveIndicator", () => {
  it("includes status dirty rows", () => {
    const kinds: Record<number, AttendanceDirtyEditKind> = { 1: "status" };
    expect(filterIdsForRowSaveIndicator([1], kinds)).toEqual([1]);
  });

  it("includes note dirty rows", () => {
    const kinds: Record<number, AttendanceDirtyEditKind> = { 2: "note" };
    expect(filterIdsForRowSaveIndicator([2], kinds)).toEqual([2]);
  });

  it("includes mixed status and note rows", () => {
    const kinds: Record<number, AttendanceDirtyEditKind> = {
      1: "status",
      2: "note",
    };
    expect(filterIdsForRowSaveIndicator([1, 2, 3], kinds)).toEqual([1, 2]);
  });

  it("drops ids with no dirty kind entry", () => {
    expect(filterIdsForRowSaveIndicator([9], {})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run helper tests — expect FAIL**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/components/attendance/attendance-row-save-tracking.test.ts
```

Expected: FAIL — module `./attendance-row-save-tracking` not found (or export missing).

- [ ] **Step 3: Implement the helper**

Create `src/components/attendance/attendance-row-save-tracking.ts`:

```typescript
import type { AttendanceDirtyEditKind } from "./attendance-autosave-debounce";

/** Row IDs that should update AttendanceRowSaveIndicator (status + note). */
export function filterIdsForRowSaveIndicator(
  ids: number[],
  dirtyKindByRow: Record<number, AttendanceDirtyEditKind>,
): number[] {
  return ids.filter((id) => {
    const kind = dirtyKindByRow[id];
    return kind === "status" || kind === "note";
  });
}
```

- [ ] **Step 4: Run helper tests — expect PASS**

Run the same command as Step 2. Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing hook test for status → pending → saving → saved**

Create `src/components/attendance/use-attendance-autosave.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { attendanceStatus, type attendanceType } from "@/types/attendance";
import { useAttendanceAutosave } from "./use-attendance-autosave";
import { updateEntities } from "@/app/client-api/utils";

vi.mock("@/app/client-api/utils", () => ({
  updateEntities: vi.fn(),
}));

function makeAttendance(id: number): attendanceType {
  return {
    id,
    attendance_status: attendanceStatus.unregistered,
    attendance_note: null,
    is_extra_class: false,
    user: { id, name: `Student ${id}` },
    event: { id: 10 },
  } as attendanceType;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useAttendanceAutosave rowStates for status", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (updateEntities as Mock).mockResolvedValue({});
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("sets pending → saving → saved for a status dirty row", async () => {
    const row = makeAttendance(1);
    const attendancesRef = { current: [row] };
    const dirtyIdsRef = { current: [1] as number[] };
    const onDirtyClear = vi.fn((ids: number[]) => {
      dirtyIdsRef.current = dirtyIdsRef.current.filter((id) => !ids.includes(id));
    });

    const { result, rerender } = renderHook(
      (props: {
        dirtyIds: number[];
        dirtyRevision: number;
        dirtyKindByRow: Record<number, "status" | "note">;
      }) =>
        useAttendanceAutosave({
          attendances: attendancesRef.current,
          attendancesRef,
          dirtyIds: props.dirtyIds,
          dirtyIdsRef,
          dirtyRevision: props.dirtyRevision,
          dirtyEditKind: "status",
          dirtyKindByRow: props.dirtyKindByRow,
          enabled: true,
          onDirtyClear,
        }),
      {
        wrapper,
        initialProps: {
          dirtyIds: [] as number[],
          dirtyRevision: 0,
          dirtyKindByRow: {} as Record<number, "status" | "note">,
        },
      },
    );

    expect(result.current.rowStates[1]).toBeUndefined();

    await act(async () => {
      dirtyIdsRef.current = [1];
      attendancesRef.current = [
        { ...row, attendance_status: attendanceStatus.present },
      ];
      rerender({
        dirtyIds: [1],
        dirtyRevision: 1,
        dirtyKindByRow: { 1: "status" },
      });
    });

    expect(result.current.rowStates[1]).toBe("pending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await waitFor(() => {
      expect(result.current.rowStates[1]).toBe("saved");
    });

    expect(updateEntities).toHaveBeenCalled();
    expect(onDirtyClear).toHaveBeenCalledWith([1]);
  });
});
```

Adjust `makeAttendance` fields if TypeScript complains — match the shape used in other attendance unit tests (`attendance-save-payload.test.ts`). Prefer the smallest cast that compiles.

- [ ] **Step 6: Run hook test — expect FAIL on status pending**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/components/attendance/use-attendance-autosave.test.tsx
```

Expected: FAIL — `rowStates[1]` stays undefined / not `"pending"` because `isNoteEditKind` filters status out.

- [ ] **Step 7: Wire the hook to the helper**

In `src/components/attendance/use-attendance-autosave.ts`:

1. Add import:

```typescript
import { filterIdsForRowSaveIndicator } from "./attendance-row-save-tracking";
```

2. Delete `isNoteEditKind`.

3. Replace every note-only filter with the helper:

**`markRecentlyChanged`** — replace the note filter with:

```typescript
const trackedIds = filterIdsForRowSaveIndicator(
  ids,
  dirtyKindByRowRef.current,
);
if (trackedIds.length === 0) return;
// use trackedIds instead of noteIds for setRecentlyChangedIds / timers
```

**`setSavingRowStates`:**

```typescript
const trackedIds = filterIdsForRowSaveIndicator(
  ids,
  dirtyKindByRowRef.current,
);
setRowStateForIds(trackedIds, "saving");
```

**`setSavedRowStates`:** same pattern with `"saved"`, then idle timeout over `trackedIds`.

**`setPendingRowStatesForNotes`:** rename to `setPendingRowStates` and filter with:

```typescript
const trackedIds = filterIdsForRowSaveIndicator(
  ids,
  dirtyKindByRowRef.current,
).filter((id) => dirtyIdsRef.current.includes(id));
```

Update all call sites of `setPendingRowStatesForNotes` to `setPendingRowStates`.

**Dirty-revision `useEffect`** (the one that sets `pending` on dirty ids) — replace:

```typescript
if (!isNoteEditKind(dirtyKindByRow, id)) continue;
```

with:

```typescript
if (filterIdsForRowSaveIndicator([id], dirtyKindByRow).length === 0) continue;
```

(or inline `dirtyKindByRow[id] === "status" || dirtyKindByRow[id] === "note"`).

Do not change debounce schedules, payload builders, or toolbar status logic.

- [ ] **Step 8: Run helper + hook tests — expect PASS**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/components/attendance/attendance-row-save-tracking.test.ts src/components/attendance/use-attendance-autosave.test.tsx
```

Expected: PASS. If the hook test flakes on timer/async, prefer `waitFor` on `"saving"` then `"saved"`, or advance by `STATUS_AUTOSAVE_DEBOUNCE.maxWaitMs` (400) then flush microtasks — keep fake timers consistent with debounce tests.

- [ ] **Step 9: Commit**

```bash
cd schedjuice-reimagined-fe
git add \
  src/components/attendance/attendance-row-save-tracking.ts \
  src/components/attendance/attendance-row-save-tracking.test.ts \
  src/components/attendance/use-attendance-autosave.ts \
  src/components/attendance/use-attendance-autosave.test.tsx
git commit -m "$(cat <<'EOF'
feat(attendance): show row save indicator for status edits

Wire status dirty rows into the same pending/saving/saved lifecycle notes already use.
EOF
)"
```

---

### Task 2: Stronger selected status styles

**Files:**
- Modify: `src/components/attendance/attendance-status-config.ts`
- Create: `src/components/attendance/attendance-status-config.test.ts`

**Interfaces:**
- Consumes: existing `ATTENDANCE_STATUS_OPTIONS` shape
- Produces: updated `selectedClass` strings — fill `/20`, `ring-1 ring-{semantic}/40` for Present/Late/Absent; Unregistered stays neutral strong border (may keep existing `ring-1 ring-border-strong/50`)

- [ ] **Step 1: Write the failing config tests**

Create `src/components/attendance/attendance-status-config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ATTENDANCE_STATUS_OPTIONS } from "./attendance-status-config";
import { attendanceStatus } from "@/types/attendance";

function option(value: attendanceStatus) {
  const found = ATTENDANCE_STATUS_OPTIONS.find((o) => o.value === value);
  if (!found) throw new Error(`missing option ${value}`);
  return found;
}

describe("ATTENDANCE_STATUS_OPTIONS selected styles", () => {
  it("uses /20 fill and semantic ring for present", () => {
    const cls = option(attendanceStatus.present).selectedClass;
    expect(cls).toContain("bg-success/20");
    expect(cls).toContain("border-success");
    expect(cls).toContain("ring-1");
    expect(cls).toContain("ring-success/40");
  });

  it("uses /20 fill and semantic ring for late", () => {
    const cls = option(attendanceStatus.late).selectedClass;
    expect(cls).toContain("bg-warning/20");
    expect(cls).toContain("border-warning");
    expect(cls).toContain("ring-warning/40");
  });

  it("uses /20 fill and semantic ring for absent", () => {
    const cls = option(attendanceStatus.absent).selectedClass;
    expect(cls).toContain("bg-danger/20");
    expect(cls).toContain("border-danger");
    expect(cls).toContain("ring-danger/40");
  });

  it("keeps unregistered neutral (no success/warning/danger ring)", () => {
    const cls = option(attendanceStatus.unregistered).selectedClass;
    expect(cls).not.toMatch(/ring-(success|warning|danger)/);
    expect(cls).toContain("border-border-strong");
  });
});
```

- [ ] **Step 2: Run config tests — expect FAIL**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/components/attendance/attendance-status-config.test.ts
```

Expected: FAIL — classes still use `/10` and lack semantic rings.

- [ ] **Step 3: Update selected classes**

In `src/components/attendance/attendance-status-config.ts`, set:

```typescript
// present
selectedClass: "border-success bg-success/20 text-success ring-1 ring-success/40",

// late
selectedClass:
  "border-warning bg-warning/20 text-warning-foreground ring-1 ring-warning/40",

// absent
selectedClass: "border-danger bg-danger/20 text-danger ring-1 ring-danger/40",

// unregistered — keep current neutral selected styling (already has ring-border-strong)
selectedClass:
  "border-border-strong bg-surface-active text-text-secondary ring-1 ring-border-strong/50",
```

Leave `idleClass` values unchanged.

- [ ] **Step 4: Run config tests — expect PASS**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add \
  src/components/attendance/attendance-status-config.ts \
  src/components/attendance/attendance-status-config.test.ts
git commit -m "$(cat <<'EOF'
feat(attendance): strengthen selected status chip contrast

Raise selected fills to /20 and add semantic rings so the active status reads clearly.
EOF
)"
```

---

### Task 3: Tactile press feedback on status control

**Files:**
- Modify: `src/components/attendance/attendance-status-control.tsx`
- Create: `src/components/attendance/attendance-status-control.test.tsx`

**Interfaces:**
- Consumes: `ATTENDANCE_STATUS_OPTIONS`, primitive `Button`, `Tooltip`
- Produces: buttons with `active:scale-[0.94]`, `motion-reduce:active:scale-100`, `duration-[var(--duration-fast)]`, `ease-[var(--ease-quiet)]`, and slightly deeper active border; `twMerge` via `cn` must win over Button’s default `active:scale-[0.98]`

- [ ] **Step 1: Write the failing control test**

Create `src/components/attendance/attendance-status-control.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttendanceStatusControl } from "./attendance-status-control";
import { attendanceStatus } from "@/types/attendance";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

describe("AttendanceStatusControl press feedback", () => {
  it("applies confident press scale and reduced-motion reset", () => {
    render(
      <AttendanceStatusControl
        value={attendanceStatus.present}
        onChange={vi.fn()}
        isMobile={false}
      />,
    );

    const present = screen.getByRole("button", { name: "Present" });
    expect(present.className).toContain("active:scale-[0.94]");
    expect(present.className).toContain("motion-reduce:active:scale-100");
    expect(present.className).toContain("duration-[var(--duration-fast)]");
    expect(present.className).toContain("ease-[var(--ease-quiet)]");
  });

  it("marks the selected status with aria-pressed", () => {
    render(
      <AttendanceStatusControl
        value={attendanceStatus.late}
        onChange={vi.fn()}
        isMobile={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Late" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Present" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
```

If Tooltip wrappers interfere with `getByRole`, pass `isMobile={true}` instead (labels visible, no tooltip) and assert the same classes — prefer whichever finds buttons reliably.

- [ ] **Step 2: Run control test — expect FAIL**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/components/attendance/attendance-status-control.test.tsx
```

Expected: FAIL — still `active:scale-[0.98]` / `duration-200`.

- [ ] **Step 3: Update control className**

In `src/components/attendance/attendance-status-control.tsx`, replace the shared button class string (currently includes `transition-all duration-200 active:scale-[0.98]`) with:

```typescript
className={cn(
  "border transition-[background-color,color,border-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-quiet)]",
  "active:scale-[0.94] active:border-border-strong motion-reduce:active:scale-100",
  isMobile
    ? "h-11 min-h-11 w-full justify-start gap-2 px-3"
    : "size-9 shrink-0 p-0",
  isSelected ? option.selectedClass : option.idleClass,
)}
```

Do not change `onClick`, `aria-pressed`, or layout (desktop vs mobile grid).

- [ ] **Step 4: Run control test — expect PASS**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Run the full attendance unit slice**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/components/attendance/attendance-row-save-tracking.test.ts src/components/attendance/use-attendance-autosave.test.tsx src/components/attendance/attendance-status-config.test.ts src/components/attendance/attendance-status-control.test.tsx
```

Expected: all PASS.

- [ ] **Step 6: Manual smoke (implementer)**

On course attendance marking:

1. Click Present — squash, mint selected, row dot pending → saving → saved.
2. Switch to Late — selected updates; dot cycles.
3. Re-click Late — press flash, no data change.
4. Edit a note — dot still works.
5. Optional: OS reduce-motion on — selected contrast remains; no squash.

- [ ] **Step 7: Commit**

```bash
cd schedjuice-reimagined-fe
git add \
  src/components/attendance/attendance-status-control.tsx \
  src/components/attendance/attendance-status-control.test.tsx
git commit -m "$(cat <<'EOF'
feat(attendance): add tactile press feedback to status buttons

Use a stronger active scale with reduced-motion fallback so clicks feel intentional.
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Press ~0.94 + deepen border + fast/quiet motion | Task 3 |
| Reduced-motion: no scale | Task 3 |
| Selected `/20` + semantic ring | Task 2 |
| Unregistered neutral selected | Task 2 |
| Status drives row save indicator lifecycle | Task 1 |
| Notes still drive indicator | Task 1 (helper includes note; hook test + regression via helper) |
| No debounce/API/toolbar redesign | All tasks (untouched) |
| Same-status data no-op | Untouched page handler; press still CSS-only |
| Keep brief row `bg-brand/5` assist | Untouched (`markRowHighlighted` + broadened `markRecentlyChanged`) |
| Desktop + mobile same treatment | Task 2–3 (shared control/config) |
| Mark-all-present / bulk status dirty | Task 1 (same dirty pipeline) |

## Plan self-review notes

- No TBD/placeholder steps; exact class strings and helper signature specified.
- Hook test may need small attendanceType fixture tweaks — keep behavior assertions stable.
- Button base still has `active:scale-[0.98]`; control classes must come last through `cn`/`twMerge` (already how `Button` merges `className`).
