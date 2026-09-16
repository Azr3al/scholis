# Course Attendance — Perfect Attendance List

> On the course attendance dashboard, show students who were present for every session in the chosen month, as a quiet expandable list that does not bury the matrix.

**Status:** Design approved (brainstorming 2026-07-09).
**Related:**
- [2026-06-28-course-attendance-dashboard-design.md](./2026-06-28-course-attendance-dashboard-design.md) — page layout, month picker, matrix
- [`DESIGN.md`](../../../DESIGN.md) — type-led layout, no card-stacking, teacher voice, motion tokens

---

## 1. Context

The **Course Attendance Dashboard** at `/courses/[id]/attendance` shows a monthly student × session matrix, a summary strip (class / course rates), and a toolbar (search, month, mark CTA).

Teachers often want a quick answer: *who has perfect attendance this month?* Early in a month that list can be large (~40 students); later it shrinks. The matrix remains the primary task surface — the perfect list must stay secondary and DESIGN.md-compliant (no card widgets, no badge piles).

---

## 2. Goals

1. Show students with **perfect attendance for the selected month**: present on every session, with at least one session.
2. Keep the list usable at ~40 names without pushing the matrix off-screen.
3. Derive the list from the existing monthly matrix response (no new API).
4. Match DESIGN.md: type-led quiet line, expand-in-place, semantic tokens, teacher voice, locked motion recipes.

## 3. Non-Goals

- Org-wide Attendance Overview (`/attendances/god-view`)
- Backend / API changes
- Perfect-attendance list when month picker is **All months**
- CSV export of the perfect list
- Coupling the list to the page search box
- Including removed students in the list

---

## 4. Locked Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Eligibility | Every session status is exactly `present`; ≥1 session required |
| 2 | Unmarked / late / absent | Any non-`present` excludes the student |
| 3 | All months | Hide the list entirely |
| 4 | Placement | Quiet count line between summary strip and toolbar; expand in place (Approach C) |
| 5 | Expanded layout | Vertical list (one name per row), max height ~8–10 rows, internal scroll |
| 6 | Name click | Scroll + briefly highlight that student’s matrix row |
| 7 | Search | Does **not** filter the perfect list (matrix only) |
| 8 | Removed students | Always excluded from the list, even when “Include removed” is on |
| 9 | Implementation | Client-derive from monthly matrix + `students` meta (Approach 1) |
| 10 | Expand state | Local UI state only; collapse on month change |
| 11 | Zero count | Still show collapsed line `Perfect attendance · 0 students` |

---

## 5. Eligibility (precise)

Given the monthly matrix body row statuses and matching `students[]` meta entry:

**Include** if and only if:

1. `student.is_removed === false`
2. `statuses.length >= 1`
3. Every status string equals `"present"` (case-sensitive, matches API / `attendanceStatus.present`)

**Exclude** if any status is `late`, `absent`, `unregistered`, empty, or unknown.

Vacuous cases (zero sessions for the month / empty matrix): list is **hidden** with the page empty state — there is no matrix to derive from.

---

## 6. UI & interaction

### 6.1 Collapsed (default)

```
[ Class 94% ]  [ Course 91% ]

Perfect attendance · 38 students          [ Show ]
─────────────────────────────────────────────────

[ Search… ]  Month [ July 2026 ▾ ]     [ Mark attendance ]

| matrix … |
```

- Type-led line: label + count (`font-mono` tabular nums for the count)
- Text toggle: `Show` / `Hide` (no icon chrome)
- No Card, Badge, emoji, or Lucide
- Visible only when viewing a single month and the monthly matrix query has settled successfully (including count `0`)

### 6.2 Expanded

- Vertical list, one name per row, min ~52px row height (DESIGN.md §9)
- Max height ≈ 8–10 rows; overflow scrolls inside the list region
- Names sorted A→Z with locale-aware compare (Burmese-safe)
- Soft enter via `staggerList` / `staggerItem` from `@/lib/sj/motion`
- Expand must not cause layout shift of the toolbar/matrix beyond the reserved list region (fixed max-height container; opacity/transform animation only)

### 6.3 Empty expanded (count 0)

- `Show` remains enabled. Expanding reveals a single muted line: `No one has perfect attendance yet this month.`

### 6.4 Name → matrix

- Clicking a name calls into the matrix: scroll that student row into view and apply a brief highlight (background/opacity token pulse, ~1–1.5s, then clear)
- If the student is not currently visible in the matrix (e.g. filtered out by search): no-op, no toast
- List remains independent of search

### 6.5 Month / All months

- Changing `dateRange` collapses the panel and recomputes the list
- `dateRange === "all"`: do not render the perfect-attendance block

### 6.6 Copy (teacher voice)

| State | Copy |
| --- | --- |
| Collapsed / header | `Perfect attendance · {n} students` / `· 1 student` |
| Toggle | `Show` / `Hide` |
| Empty expanded | `No one has perfect attendance yet this month.` |

No exclamation marks.

---

## 7. Architecture

### 7.1 Helper

Add to `src/helpers/attendance-dashboard.ts`:

```ts
derivePerfectAttendanceStudents(
  matrix: string[][],
  students: { id: number; name: string; is_removed: boolean }[],
): { id: number; name: string }[]
```

Behavior:

1. If matrix has no body rows or header-only → `[]`
2. Zip body rows with `students` by index (same contract as today’s monthly API)
3. Parse statuses via the same column layout as `parseAttendanceMatrix` (statuses = `row.slice(3)`)
4. Apply eligibility rules in §5
5. Sort by `name` with `localeCompare`
6. Return `{ id, name }[]`

Unit-test in `attendance-dashboard.test.ts`.

### 7.2 Component

New: `src/components/attendance/attendance-perfect-list.tsx`

Props:

- `students: { id: number; name: string }[]`
- `onSelectStudent?: (id: number) => void`

Owns expand/collapse local state. Renders collapsed line + optional expanded list.

### 7.3 Page wiring

In `src/app/(internal)/courses/[id]/attendance/page.tsx`:

1. `useMemo` derive from **unfiltered** `matrixData` + `matrixStudents` (ignore `searchTerm`)
2. Render `AttendancePerfectList` between `AttendanceSummaryStrip` and `AttendanceDashboardToolbar` when `!viewingAllMonths` and monthly matrix has loaded successfully
3. Wire `onSelectStudent` to matrix scroll/highlight

### 7.4 Matrix highlight

Extend `AttendanceMatrixTable` with a controlled `highlightStudentId: number | null` prop. When it becomes non-null and that row is mounted, scroll it into view and apply a brief highlight class; the parent clears `highlightStudentId` after ~1–1.5s (or the matrix clears it via `onHighlightConsumed`). No sticky-row or layout changes beyond the highlight class.

---

## 8. Error & edge cases

| Case | Behavior |
| --- | --- |
| Matrix loading | Hide perfect list until the monthly matrix query has settled successfully |
| Matrix error | Hide perfect list |
| No sessions / empty matrix | Page empty state; list hidden |
| 0 perfect students | Show count `0`; expand shows empty copy |
| Search hides clicked student | No-op |
| Include removed on | List still active-only |
| Month change | Collapse + recompute |

---

## 9. Testing

**Unit (`derivePerfectAttendanceStudents`):**

- All present → included
- One late / absent / unregistered → excluded
- `is_removed` → excluded
- Zero-length statuses → excluded
- Sort order
- Empty matrix → `[]`

**Component (light):**

- Renders count
- Expand/collapse
- Empty copy when count 0
- Name click invokes `onSelectStudent`

No backend tests.

---

## 10. DESIGN.md compliance

- No card-stacking; matrix stays the dominant element; perfect list is the quiet element
- Semantic tokens only; no raw hex
- No shadcn / Lucide; text-led toggle
- Tables/lists typography-first; generous row height
- Motion: import recipes from `src/lib/sj/motion.ts` only
- No layout shift from expand (reserved max-height scroll region)
- Teacher persona: calm EN copy, no exclamation marks

---

## 11. Out of scope (restate)

Backend endpoints, god-view, All-months perfect rollup, CSV, search filtering of the list, removed-student inclusion.
