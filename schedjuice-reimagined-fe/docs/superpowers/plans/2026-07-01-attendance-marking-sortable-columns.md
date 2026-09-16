# Attendance Marking Sortable Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side column sorting to the course attendance marking table — default Student A→Z, sortable data columns only.

**Architecture:** Pure sort helpers in `attendance-marking-sort.ts` (tested with Vitest). `AttendanceMarkingTable` holds sort state, derives `sortedRows` via `useMemo`, and renders sortable desktop headers. The marking page passes `sortResetKey={currentEventId}` so sort resets when the session changes.

**Tech Stack:** Next.js client components, React `useState`/`useMemo`/`useEffect`, Vitest, Iconoir icons, existing `AttendanceMarkingTable` hand-composed markup.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-07-01-attendance-marking-sortable-columns-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/helpers/attendance-marking-sort.ts` | Create | Sort types, comparators, `sortAttendanceRows()` |
| `src/helpers/attendance-marking-sort.test.ts` | Create | Unit tests for all sort columns and edge cases |
| `src/components/attendance/attendance-marking-table.tsx` | Modify | Sort state, `sortedRows`, sortable `<th>` buttons |
| `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` | Modify | Pass `sortResetKey={currentEventId}` |

No backend changes. Skeleton table stays static.

---

### Task 1: Sort helper module

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/attendance-marking-sort.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/attendance-marking-sort.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/helpers/attendance-marking-sort.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  sortAttendanceRows,
  type AttendanceMarkingSortState,
} from "@/helpers/attendance-marking-sort";
import type { AttendanceRow } from "@/helpers/attendance-marking-roster";

function row(
  overrides: Partial<AttendanceRow> & { id: number; name: string },
): AttendanceRow {
  return {
    id: overrides.id,
    attendance_status: overrides.attendance_status ?? "unregistered",
    attendance_note: overrides.attendance_note ?? null,
    is_extra_class: false,
    is_dropped_out: overrides.is_dropped_out ?? false,
    user: {
      id: overrides.id,
      name: overrides.name,
      alternative_name: overrides.user?.alternative_name ?? null,
      phone_number: overrides.user?.phone_number ?? null,
    },
    event: { id: 1 },
  };
}

describe("sortAttendanceRows", () => {
  it("returns empty array for empty roster", () => {
    expect(sortAttendanceRows([], DEFAULT_SORT)).toEqual([]);
  });

  it("sorts by student name A→Z by default", () => {
    const rows = [
      row({ id: 1, name: "Charlie" }),
      row({ id: 2, name: "alice" }),
      row({ id: 3, name: "Bob" }),
    ];
    const sorted = sortAttendanceRows(rows, DEFAULT_SORT);
    expect(sorted.map((r) => r.user.name)).toEqual(["alice", "Bob", "Charlie"]);
  });

  it("sorts student name Z→A when direction is desc", () => {
    const rows = [
      row({ id: 1, name: "Charlie" }),
      row({ id: 2, name: "alice" }),
      row({ id: 3, name: "Bob" }),
    ];
    const sort: AttendanceMarkingSortState = { column: "student", direction: "desc" };
    const sorted = sortAttendanceRows(rows, sort);
    expect(sorted.map((r) => r.user.name)).toEqual(["Charlie", "Bob", "alice"]);
  });

  it("sorts alt name with non-blank before blank", () => {
    const rows = [
      row({ id: 1, name: "A", user: { alternative_name: null } }),
      row({ id: 2, name: "B", user: { alternative_name: "Zeta" } }),
      row({ id: 3, name: "C", user: { alternative_name: "Alpha" } }),
      row({ id: 4, name: "D", user: { alternative_name: "   " } }),
    ];
    const sort: AttendanceMarkingSortState = { column: "altName", direction: "asc" };
    const sorted = sortAttendanceRows(rows, sort);
    expect(sorted.map((r) => r.id)).toEqual([3, 2, 1, 4]);
  });

  it("sorts phone with non-blank before blank", () => {
    const rows = [
      row({ id: 1, name: "A", user: { phone_number: "099" } }),
      row({ id: 2, name: "B", user: { phone_number: null } }),
      row({ id: 3, name: "C", user: { phone_number: "011" } }),
    ];
    const sort: AttendanceMarkingSortState = { column: "phone", direction: "asc" };
    const sorted = sortAttendanceRows(rows, sort);
    expect(sorted.map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it("sorts enrollment active before dropped, tie-break by name", () => {
    const rows = [
      row({ id: 1, name: "Zara", is_dropped_out: true }),
      row({ id: 2, name: "Amy", is_dropped_out: false }),
      row({ id: 3, name: "Ben", is_dropped_out: true }),
      row({ id: 4, name: "Cal", is_dropped_out: false }),
    ];
    const sort: AttendanceMarkingSortState = { column: "enrollment", direction: "asc" };
    const sorted = sortAttendanceRows(rows, sort);
    expect(sorted.map((r) => r.user.name)).toEqual(["Amy", "Cal", "Ben", "Zara"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ id: 1, name: "B" }),
      row({ id: 2, name: "A" }),
    ];
    const copy = [...rows];
    sortAttendanceRows(rows, DEFAULT_SORT);
    expect(rows).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/helpers/attendance-marking-sort.test.ts`

Expected: FAIL — cannot find module `@/helpers/attendance-marking-sort`.

- [ ] **Step 3: Write minimal implementation**

Create `src/helpers/attendance-marking-sort.ts`:

```typescript
import type { AttendanceRow } from "@/helpers/attendance-marking-roster";

export type AttendanceMarkingSortColumn =
  | "student"
  | "altName"
  | "phone"
  | "enrollment";

export type AttendanceMarkingSortDirection = "asc" | "desc";

export type AttendanceMarkingSortState = {
  column: AttendanceMarkingSortColumn;
  direction: AttendanceMarkingSortDirection;
};

export const DEFAULT_SORT: AttendanceMarkingSortState = {
  column: "student",
  direction: "asc",
};

const LOCALE_OPTS: Intl.CollatorOptions = { sensitivity: "base" };

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, LOCALE_OPTS);
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === "";
}

function compareOptionalString(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const aBlank = isBlank(a);
  const bBlank = isBlank(b);
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  return compareStrings(String(a).trim(), String(b).trim());
}

function compareStudentName(a: AttendanceRow, b: AttendanceRow): number {
  return compareStrings(a.user.name, b.user.name);
}

function compareEnrollment(a: AttendanceRow, b: AttendanceRow): number {
  const aDropped = Boolean(a.is_dropped_out);
  const bDropped = Boolean(b.is_dropped_out);
  if (aDropped !== bDropped) {
    return aDropped ? 1 : -1;
  }
  return compareStudentName(a, b);
}

function compareByColumn(
  a: AttendanceRow,
  b: AttendanceRow,
  column: AttendanceMarkingSortColumn,
): number {
  switch (column) {
    case "student":
      return compareStudentName(a, b);
    case "altName":
      return compareOptionalString(a.user.alternative_name, b.user.alternative_name);
    case "phone":
      return compareOptionalString(a.user.phone_number, b.user.phone_number);
    case "enrollment":
      return compareEnrollment(a, b);
  }
}

export function sortAttendanceRows(
  rows: AttendanceRow[],
  sort: AttendanceMarkingSortState,
): AttendanceRow[] {
  return [...rows].sort((a, b) => {
    const cmp = compareByColumn(a, b, sort.column);
    return sort.direction === "asc" ? cmp : -cmp;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/helpers/attendance-marking-sort.test.ts`

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/attendance-marking-sort.ts src/helpers/attendance-marking-sort.test.ts
git commit -m "feat(attendance): add client-side roster sort helpers"
```

---

### Task 2: Sortable headers and sorted rows in AttendanceMarkingTable

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/attendance/attendance-marking-table.tsx`

- [ ] **Step 1: Extend props and add sort state at the export boundary**

At the top of `attendance-marking-table.tsx`, add imports:

```typescript
import {
  DEFAULT_SORT,
  sortAttendanceRows,
  type AttendanceMarkingSortColumn,
  type AttendanceMarkingSortState,
} from "@/helpers/attendance-marking-sort";
import { NavArrowDown, NavArrowUp } from "iconoir-react";
import { useMemo } from "react";
```

Extend `AttendanceMarkingTableProps`:

```typescript
type AttendanceMarkingTableProps = {
  rows: attendanceType[];
  isMobile: boolean;
  rowStates: Record<number, RowSaveState>;
  recentlyChangedIds: number[];
  onStatusChange: (rowId: number, status: attendanceType["attendance_status"]) => void;
  onNoteChange: (rowId: number, note: string) => void;
  enableStaggerEntrance?: boolean;
  onInitialEntranceLatched?: () => void;
  /** When this value changes, sort resets to Student A→Z. Pass current event id from the page. */
  sortResetKey?: number;
};
```

Replace the export at the bottom:

```typescript
const SORTABLE_HEADERS: {
  column: AttendanceMarkingSortColumn;
  label: string;
}[] = [
  { column: "student", label: "Student" },
  { column: "altName", label: "Alt name" },
  { column: "phone", label: "Phone" },
  { column: "enrollment", label: "Enrollment" },
];

const STATIC_HEADERS = ["Status", "Note"] as const;

type AttendanceSortableHeaderProps = {
  label: string;
  column: AttendanceMarkingSortColumn;
  sortState: AttendanceMarkingSortState;
  onSort: (column: AttendanceMarkingSortColumn) => void;
};

function AttendanceSortableHeader({
  label,
  column,
  sortState,
  onSort,
}: AttendanceSortableHeaderProps) {
  const isActive = sortState.column === column;
  const ariaSort = isActive
    ? sortState.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className="px-3 py-2 text-left"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide",
          isActive
            ? "text-text-primary"
            : "text-text-muted hover:text-text-secondary",
        )}
      >
        {label}
        {isActive ? (
          sortState.direction === "asc" ? (
            <NavArrowUp width={14} height={14} aria-hidden />
          ) : (
            <NavArrowDown width={14} height={14} aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );
}

export function AttendanceMarkingTable({
  sortResetKey,
  rows,
  ...rest
}: AttendanceMarkingTableProps) {
  const [sortState, setSortState] = useState<AttendanceMarkingSortState>(DEFAULT_SORT);

  useEffect(() => {
    setSortState(DEFAULT_SORT);
  }, [sortResetKey]);

  const sortedRows = useMemo(
    () => sortAttendanceRows(rows, sortState),
    [rows, sortState],
  );

  const handleSort = useCallback((column: AttendanceMarkingSortColumn) => {
    setSortState((prev) => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { column, direction: "asc" };
    });
  }, []);

  return (
    <AttendanceMarkingEntrance
      {...rest}
      rows={sortedRows}
      sortState={sortState}
      onSort={handleSort}
    />
  );
}
```

Add `useCallback` to the React import if not already present.

- [ ] **Step 2: Thread sort props into AttendanceMarkingEntrance**

Update `AttendanceMarkingEntrance` signature to accept:

```typescript
function AttendanceMarkingEntrance({
  rows,
  isMobile,
  rowStates,
  recentlyChangedIds,
  onStatusChange,
  onNoteChange,
  enableStaggerEntrance,
  onInitialEntranceLatched,
  sortState,
  onSort,
}: AttendanceMarkingTableProps & {
  sortState: AttendanceMarkingSortState;
  onSort: (column: AttendanceMarkingSortColumn) => void;
}) {
```

No other logic changes inside `AttendanceMarkingEntrance` — it already iterates `rows`; those are now pre-sorted.

- [ ] **Step 3: Replace static desktop `<thead>` with sortable headers**

Replace the existing `<thead>` block (lines ~315–325):

```typescript
<thead>
  <tr className="border-b border-border-subtle text-left">
    {SORTABLE_HEADERS.map(({ column, label }) => (
      <AttendanceSortableHeader
        key={column}
        column={column}
        label={label}
        sortState={sortState}
        onSort={onSort}
      />
    ))}
    {STATIC_HEADERS.map((label) => (
      <th
        key={label}
        scope="col"
        className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-muted"
      >
        {label}
      </th>
    ))}
  </tr>
</thead>
```

- [ ] **Step 4: Run unit tests (no regressions)**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/helpers/attendance-marking-sort.test.ts`

Expected: PASS.

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit`

Expected: no type errors in modified files.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/attendance/attendance-marking-table.tsx
git commit -m "feat(attendance): sortable column headers on marking table"
```

---

### Task 3: Wire sortResetKey from marking page

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx`

- [ ] **Step 1: Pass sortResetKey to AttendanceMarkingTable**

Find the `<AttendanceMarkingTable>` render (~line 708). Add `sortResetKey`:

```tsx
<AttendanceMarkingTable
  rows={attendances}
  sortResetKey={currentEventId}
  isMobile={isMobile}
  rowStates={rowStates}
  recentlyChangedIds={displayRecentlyChangedIds}
  onStatusChange={handleStatusChange}
  onNoteChange={handleNoteChange}
  enableStaggerEntrance={enableStaggerEntrance}
  onInitialEntranceLatched={handleInitialEntranceLatched}
/>
```

`currentEventId` is already defined at line ~219 as `events[eventIndex]?.id`.

- [ ] **Step 2: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Manual QA**

1. Open `/courses/{id}/attendance/marking/today` with multiple students.
2. Confirm default order is Student A→Z (chevron on Student, pointing up).
3. Click Student → order reverses; chevron points down.
4. Click Phone → sorts by phone ascending; chevron moves to Phone.
5. Change a student's status, then re-sort → edit stays on the correct student.
6. Click Mark all as present → all rows update regardless of sort order.
7. Navigate to previous/next session → sort resets to Student A→Z.
8. Narrow viewport to mobile → stacked rows follow sorted order (no headers).

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/\(internal\)/courses/\[id\]/attendance/marking/\[eventIndex\]/page.tsx
git commit -m "feat(attendance): reset marking table sort on session change"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Default Student A→Z | Task 1 (`DEFAULT_SORT`), Task 2 (initial state) |
| Sortable: Student, Alt name, Phone, Enrollment | Task 2 (headers) |
| Status, Note not sortable | Task 2 (`STATIC_HEADERS`) |
| Asc ↔ desc toggle; new column starts asc | Task 2 (`handleSort`) |
| Empty alt/phone sort after non-blank | Task 1 (tests + comparators) |
| Enrollment: active before dropped | Task 1 (tests + comparators) |
| Mobile uses sorted order | Task 2 (sorted `rows` passed through) |
| Skeleton unchanged | No task (by design) |
| Sort reset on session change | Task 3 (`sortResetKey`) |
| No backend changes | N/A |
| Unit tests | Task 1 |

---

## Execution Handoff

Plan complete and saved to `schedjuice-reimagined-fe/docs/superpowers/plans/2026-07-01-attendance-marking-sortable-columns.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement all tasks in this session with checkpoints

Which approach?
