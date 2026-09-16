# Course Attendance Perfect List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/courses/[id]/attendance`, show an expandable “perfect attendance” list for the selected month — students present on every session — without burying the matrix.

**Architecture:** Pure frontend. Derive the list client-side from the existing monthly matrix + `students` meta via `derivePerfectAttendanceStudents`. New quiet `AttendancePerfectList` between summary strip and toolbar. Matrix gains controlled `highlightStudentId` for scroll + brief row highlight on name click. No API changes.

**Tech Stack:** Next.js App Router, React Query, Vitest, Motion (`staggerList` / `staggerItem`), Schedjuice semantic tokens / primitives.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-07-09-course-attendance-perfect-list-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/helpers/attendance-dashboard.ts` | Add `derivePerfectAttendanceStudents` (+ optional `formatPerfectAttendanceCountLabel`) |
| `src/helpers/attendance-dashboard.test.ts` | Unit tests for derivation + label |
| `src/components/attendance/attendance-perfect-list.tsx` | Collapsed count line + expandable vertical list |
| `src/components/attendance/attendance-matrix-table.tsx` | Accept `rowMeta` with `id`; scroll/highlight by `highlightStudentId` |
| `src/app/(internal)/courses/[id]/attendance/page.tsx` | Derive list, render strip, wire highlight state |

---

### Task 1: `derivePerfectAttendanceStudents` (TDD)

**Files:**
- Modify: `src/helpers/attendance-dashboard.ts`
- Modify: `src/helpers/attendance-dashboard.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/helpers/attendance-dashboard.test.ts`:

```ts
import {
  // ...existing imports
  derivePerfectAttendanceStudents,
  formatPerfectAttendanceCountLabel,
} from "@/helpers/attendance-dashboard";

describe("derivePerfectAttendanceStudents", () => {
  const header = [
    "Student Name",
    "Total Attendance",
    "Attendance Percentage",
    "2026-07-01",
    "2026-07-03",
  ];

  const students = [
    { id: 1, name: "Ko Ko", is_removed: false },
    { id: 2, name: "Aye Chan", is_removed: false },
    { id: 3, name: "Hnin Wai", is_removed: true },
  ];

  it("returns active students who are present on every session, sorted by name", () => {
    const matrix = [
      header,
      ["Ko Ko", "2", "100", "present", "present"],
      ["Aye Chan", "2", "100", "present", "present"],
      ["Hnin Wai", "2", "100", "present", "present"],
    ];
    expect(derivePerfectAttendanceStudents(matrix, students)).toEqual([
      { id: 2, name: "Aye Chan" },
      { id: 1, name: "Ko Ko" },
    ]);
  });

  it("excludes late, absent, and unregistered", () => {
    const matrix = [
      header,
      ["Ko Ko", "1", "50", "present", "late"],
      ["Aye Chan", "1", "50", "present", "absent"],
      ["Hnin Wai", "0", "0", "unregistered", "unregistered"],
    ];
    expect(
      derivePerfectAttendanceStudents(matrix, [
        { id: 1, name: "Ko Ko", is_removed: false },
        { id: 2, name: "Aye Chan", is_removed: false },
        { id: 3, name: "Hnin Wai", is_removed: false },
      ]),
    ).toEqual([]);
  });

  it("excludes removed students even when all present", () => {
    const matrix = [
      header,
      ["Hnin Wai", "2", "100", "present", "present"],
    ];
    expect(
      derivePerfectAttendanceStudents(matrix, [
        { id: 3, name: "Hnin Wai", is_removed: true },
      ]),
    ).toEqual([]);
  });

  it("excludes rows with zero session columns", () => {
    const shortHeader = [
      "Student Name",
      "Total Attendance",
      "Attendance Percentage",
    ];
    const matrix = [shortHeader, ["Ko Ko", "0", "0"]];
    expect(
      derivePerfectAttendanceStudents(matrix, [
        { id: 1, name: "Ko Ko", is_removed: false },
      ]),
    ).toEqual([]);
  });

  it("returns [] for empty or header-only matrix", () => {
    expect(derivePerfectAttendanceStudents([], students)).toEqual([]);
    expect(derivePerfectAttendanceStudents([header], students)).toEqual([]);
  });

  it("skips body rows when students meta is missing for that index", () => {
    const matrix = [
      header,
      ["Ko Ko", "2", "100", "present", "present"],
    ];
    expect(derivePerfectAttendanceStudents(matrix, [])).toEqual([]);
  });
});

describe("formatPerfectAttendanceCountLabel", () => {
  it("uses singular for 1", () => {
    expect(formatPerfectAttendanceCountLabel(1)).toBe(
      "Perfect attendance · 1 student",
    );
  });

  it("uses plural for 0 and many", () => {
    expect(formatPerfectAttendanceCountLabel(0)).toBe(
      "Perfect attendance · 0 students",
    );
    expect(formatPerfectAttendanceCountLabel(38)).toBe(
      "Perfect attendance · 38 students",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/attendance-dashboard.test.ts
```

Expected: FAIL — `derivePerfectAttendanceStudents` / `formatPerfectAttendanceCountLabel` not exported.

- [ ] **Step 3: Implement helpers**

Append to `src/helpers/attendance-dashboard.ts`:

```ts
export type PerfectAttendanceStudent = {
  id: number;
  name: string;
};

export function derivePerfectAttendanceStudents(
  matrix: string[][],
  students: Array<{ id: number; name: string; is_removed: boolean }>,
): PerfectAttendanceStudent[] {
  if (matrix.length < 2) return [];

  const [, ...body] = matrix;
  const result: PerfectAttendanceStudent[] = [];

  body.forEach((row, index) => {
    const meta = students[index];
    if (!meta || meta.is_removed) return;

    const statuses = row.slice(3).map(String);
    if (statuses.length < 1) return;
    if (!statuses.every((status) => status === "present")) return;

    result.push({ id: meta.id, name: meta.name });
  });

  return result.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function formatPerfectAttendanceCountLabel(count: number): string {
  const noun = count === 1 ? "student" : "students";
  return `Perfect attendance · ${count} ${noun}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/attendance-dashboard.test.ts
```

Expected: PASS (all suites green, including new ones).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/attendance-dashboard.ts src/helpers/attendance-dashboard.test.ts
git commit -m "$(cat <<'EOF'
Add perfect-attendance derivation helper for course dashboard.

EOF
)"
```

---

### Task 2: `AttendancePerfectList` component

**Files:**
- Create: `src/components/attendance/attendance-perfect-list.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/attendance/attendance-perfect-list.tsx`:

```tsx
"use client";

import { type PerfectAttendanceStudent } from "@/helpers/attendance-dashboard";
import { staggerItem, staggerList, transition } from "@/lib/sj/motion";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

type AttendancePerfectListProps = {
  students: PerfectAttendanceStudent[];
  /** Collapse when this changes (month anchor). */
  monthKey: string;
  onSelectStudent?: (id: number) => void;
};

export function AttendancePerfectList({
  students,
  monthKey,
  onSelectStudent,
}: AttendancePerfectListProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [monthKey]);

  const count = students.length;
  const noun = count === 1 ? "student" : "students";

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-3">
        <p className="text-sm text-text-primary">
          Perfect attendance ·{" "}
          <span className="font-mono tabular-nums">{count}</span> {noun}
        </p>
        <button
          type="button"
          className="shrink-0 text-sm text-accent hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide" : "Show"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="perfect-list-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition.crossfade}
            className="overflow-hidden"
          >
            {count === 0 ? (
              <p className="py-3 text-sm text-text-muted">
                No one has perfect attendance yet this month.
              </p>
            ) : (
              <motion.ul
                className="max-h-[32.5rem] overflow-y-auto"
                variants={staggerList}
                initial="hidden"
                animate="show"
                role="list"
              >
                {students.map((student) => (
                  <motion.li key={student.id} variants={staggerItem}>
                    <button
                      type="button"
                      className="flex min-h-[52px] w-full items-center border-b border-border-subtle px-1 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
                      onClick={() => onSelectStudent?.(student.id)}
                    >
                      {student.name}
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
```

Notes for the implementer:

- Keep copy identical to the helper (`Perfect attendance · {n} student(s)`). The helper remains the source of truth for tests; the component may inline the same strings for mono styling on the number only.
- `max-h-[32.5rem]` ≈ 10 × 52px rows (DESIGN.md min row height).
- Do **not** import Lucide or shadcn. Text toggle only.
- Use `transition.crossfade` from `@/lib/sj/motion` — never hand-type easing arrays.

- [ ] **Step 2: Smoke-check TypeScript on the new file**

Run:

```bash
cd schedjuice-reimagined-fe
npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Expected: no errors referencing `attendance-perfect-list.tsx`. (Full-project tsc noise elsewhere is OK if unrelated.)

- [ ] **Step 3: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/attendance/attendance-perfect-list.tsx
git commit -m "$(cat <<'EOF'
Add expandable perfect attendance list component.

EOF
)"
```

---

### Task 3: Matrix `highlightStudentId` scroll + pulse

**Files:**
- Modify: `src/components/attendance/attendance-matrix-table.tsx`

- [ ] **Step 1: Extend props and row meta**

Update the props type and component signature:

```tsx
type AttendanceMatrixTableProps = {
  data: string[][];
  rowMeta?: Array<{ id?: number; is_removed?: boolean }>;
  dateRange: string;
  highlightDate: string | null;
  /** When set, scroll that student row into view and briefly highlight it. */
  highlightStudentId?: number | null;
  onHighlightStudentConsumed?: () => void;
};
```

Pass `highlightStudentId` / `onHighlightStudentConsumed` into the component destructuring (default `highlightStudentId` to `null`).

- [ ] **Step 2: Add row refs + scroll/highlight effect**

Inside the component, after existing `highlightRef`:

```tsx
const rowRefs = useRef<Map<number, HTMLElement>>(new Map());
const [pulsingStudentId, setPulsingStudentId] = useState<number | null>(null);

useEffect(() => {
  if (highlightStudentId == null) return;

  const node = rowRefs.current.get(highlightStudentId);
  if (!node) {
    onHighlightStudentConsumed?.();
    return;
  }

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  node.scrollIntoView({
    block: "nearest",
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });
  setPulsingStudentId(highlightStudentId);

  const clearMs = prefersReducedMotion ? 0 : 1200;
  const timer = window.setTimeout(() => {
    setPulsingStudentId(null);
    onHighlightStudentConsumed?.();
  }, clearMs);

  return () => window.clearTimeout(timer);
}, [highlightStudentId, onHighlightStudentConsumed]);
```

- [ ] **Step 3: Wire refs and highlight class on desktop + mobile rows**

For each row index, resolve `const studentId = rowMeta?.[index]?.id`.

**Desktop `<tr>`:**

```tsx
<tr
  key={studentId ?? `${row.name}-${index}`}
  ref={(el) => {
    if (studentId == null) return;
    if (el) rowRefs.current.set(studentId, el);
    else rowRefs.current.delete(studentId);
  }}
  className={cn(
    "min-h-[52px] border-b border-border-subtle transition-colors",
    pulsingStudentId === studentId && "bg-brand/10",
  )}
>
```

**Mobile list button:** same `ref` callback pattern on the `<button>`, and apply `pulsingStudentId === studentId && "bg-brand/10"` to its `className`.

Keep existing sticky / session-column `highlightDate` behavior unchanged.

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/attendance/attendance-matrix-table.tsx
git commit -m "$(cat <<'EOF'
Scroll and highlight matrix rows for perfect-list selection.

EOF
)"
```

---

### Task 4: Wire page

**Files:**
- Modify: `src/app/(internal)/courses/[id]/attendance/page.tsx`

- [ ] **Step 1: Imports and highlight state**

Add imports:

```tsx
import { AttendancePerfectList } from "@/components/attendance/attendance-perfect-list";
import {
  // existing imports from attendance-dashboard — add:
  derivePerfectAttendanceStudents,
} from "@/helpers/attendance-dashboard";
```

Inside the page component, after search state:

```tsx
const [highlightStudentId, setHighlightStudentId] = useState<number | null>(
  null,
);
```

- [ ] **Step 2: Derive perfect list from unfiltered matrix**

After `matrixData` / `matrixStudents` are defined:

```tsx
const perfectStudents = useMemo(
  () =>
    viewingAllMonths
      ? []
      : derivePerfectAttendanceStudents(matrixData, matrixStudents),
  [viewingAllMonths, matrixData, matrixStudents],
);
```

Note: `viewingAllMonths` is declared later in the current file — either move the `viewingAllMonths` const above this memo, or inline `effectiveDateRange === "all"` in the memo dependency logic:

```tsx
const perfectStudents = useMemo(() => {
  if (!effectiveDateRange || effectiveDateRange === "all") return [];
  return derivePerfectAttendanceStudents(matrixData, matrixStudents);
}, [effectiveDateRange, matrixData, matrixStudents]);
```

Prefer the second form to avoid reordering issues.

- [ ] **Step 3: Visibility flag**

Near other derived flags:

```tsx
const showPerfectList =
  !viewingAllMonths &&
  getMonthlyAttendance.isSuccess &&
  hasMatrix;
```

`hasMatrix` is already `!viewingAllMonths && matrixData.length > 1`. Using `hasMatrix` alone is enough if the query succeeded; if the query failed, `matrixData` is empty so the list stays hidden. Simpler:

```tsx
const showPerfectList = hasMatrix;
```

(Zero perfect students still shows when `hasMatrix` — count 0 is fine.)

- [ ] **Step 4: Render between summary and toolbar**

Inside the success branch, after `<AttendanceSummaryStrip … />` and before `<AttendanceDashboardToolbar … />`:

```tsx
{showPerfectList && effectiveDateRange ? (
  <AttendancePerfectList
    students={perfectStudents}
    monthKey={effectiveDateRange}
    onSelectStudent={(id) => setHighlightStudentId(id)}
  />
) : null}
```

- [ ] **Step 5: Pass highlight props into matrix**

Update `<AttendanceMatrixTable>`:

```tsx
<AttendanceMatrixTable
  data={filteredData}
  rowMeta={filteredStudents}
  dateRange={effectiveDateRange}
  highlightDate={highlightDate}
  highlightStudentId={highlightStudentId}
  onHighlightStudentConsumed={() => setHighlightStudentId(null)}
/>
```

`filteredStudents` already includes `{ id, name, is_removed }` — sufficient for row refs. If search filters out the selected student, the matrix effect finds no node and calls `onHighlightStudentConsumed` (no-op highlight) — matches spec.

- [ ] **Step 6: Run unit tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/attendance-dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/\(internal\)/courses/\[id\]/attendance/page.tsx
git commit -m "$(cat <<'EOF'
Wire perfect attendance list into course attendance dashboard.

EOF
)"
```

---

### Task 5: Manual verification checklist

**Files:** none (manual)

- [ ] **Step 1: Manual QA on a course with a monthly matrix**

1. Open `/courses/[id]/attendance` for a course with sessions this month.
2. Confirm quiet line appears under the summary strip: `Perfect attendance · N students` with `Show`.
3. Click `Show` — vertical list expands; max height scrolls if many names; `Hide` collapses.
4. Click a name — matrix row scrolls into view and briefly highlights, then clears.
5. Search for a different student so the clicked perfect student is filtered out of the matrix — click that perfect name again — no crash, no toast.
6. Switch month — list collapses; count recomputes.
7. Choose **All months** — perfect list disappears; summary table shows as today.
8. With “Include removed” on (if permitted), confirm removed students never appear in the perfect list.
9. Early-month / all-present roster: list can show many names without pushing the matrix above the fold when collapsed.

- [ ] **Step 2: Final commit only if QA found copy/CSS fixes**

If small polish fixes were needed, commit them:

```bash
cd schedjuice-reimagined-fe
git add -A
git status
git commit -m "$(cat <<'EOF'
Polish perfect attendance list after manual QA.

EOF
)"
```

If nothing changed, skip this commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Present-only eligibility, ≥1 session | Task 1 |
| Exclude late/absent/unregistered/removed | Task 1 |
| Hide for All months | Task 4 |
| Placement between summary and toolbar | Task 4 |
| Expand in place, vertical list, max height scroll | Task 2 |
| Name → matrix scroll/highlight | Tasks 3–4 |
| Search does not filter list | Task 4 (derive from unfiltered matrix) |
| Collapse on month change | Task 2 (`monthKey`) |
| Zero count + empty copy | Tasks 1–2 |
| No new API | All tasks FE-only |
| DESIGN.md (no cards/Lucide, motion tokens, teacher copy) | Task 2 |

No placeholders remaining. Types (`PerfectAttendanceStudent`, `highlightStudentId`) are consistent across tasks.
