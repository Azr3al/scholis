# Attendance Marking — Sortable Columns

## Context

The course attendance marking page at `/courses/[id]/attendance/marking/[eventIndex]` uses a hand-composed `AttendanceMarkingTable` with six fixed columns: **Student**, **Alt name**, **Phone**, **Enrollment**, **Status**, **Note**. Headers are static; row order follows the server roster with no explicit sort (database insertion order).

Teachers need to find students quickly during live marking. Sorting by name (and other data columns) is a basic table affordance that existed on the legacy attendances data table but was dropped during the [marking reskin](2026-06-28-course-attendance-marking-design.md).

## Goals

- Add click-to-sort on the four **data** columns: Student, Alt name, Phone, Enrollment.
- Default row order: **Student name A→Z** on first load.
- Apply sorted order on **desktop and mobile** (stacked rows follow the same order).
- Preserve all existing marking behavior: autosave, dirty tracking, mark-all/undo, stagger entrance, row highlights.

## Non-Goals

- Do not make Status or Note sortable (interactive columns).
- Do not refactor to TanStack `UnManagedDataTable` or column strategy.
- Do not persist sort preference across sessions, courses, or browser reloads.
- Do not change backend roster ordering or API contracts.
- Do not add multi-column sort, column reorder, or column hide/show.

## Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Default sort | Student, ascending (A→Z) |
| Sortable columns | Student, Alt name, Phone, Enrollment |
| Non-sortable | Status, Note |
| Sort toggle | Two-state per column: asc ↔ desc (no “unsorted”) |
| Switch column | New column starts ascending |
| Empty values | Alt name / Phone blanks sort after non-blank |
| Enrollment sort | Active students first, then dropped out; tie-break by student name A→Z |
| Persistence | None — reset to Student A→Z on session change or page reload |
| Implementation | Client-side sort in existing hand-composed table (Approach 1) |

---

## Section 1: Sort behavior

### State shape

```ts
type AttendanceMarkingSortColumn =
  | "student"
  | "altName"
  | "phone"
  | "enrollment";

type AttendanceMarkingSortDirection = "asc" | "desc";

type AttendanceMarkingSortState = {
  column: AttendanceMarkingSortColumn;
  direction: AttendanceMarkingSortDirection;
};

const DEFAULT_SORT: AttendanceMarkingSortState = {
  column: "student",
  direction: "asc",
};
```

### Header click rules

1. Click a sortable column that is **not** active → sort that column ascending.
2. Click the **active** column → toggle asc ↔ desc.
3. Status and Note headers are not interactive.

### Comparators

All string comparisons use case-insensitive `localeCompare` with `{ sensitivity: "base" }`.

| Column | Ascending order |
|--------|-----------------|
| Student | `user.name` A→Z |
| Alt name | Non-blank before blank; then `user.alternative_name` A→Z |
| Phone | Non-blank before blank; then `user.phone_number` A→Z |
| Enrollment | Active before dropped out; tie-break by student name A→Z |

Blank means `null`, `undefined`, or empty/whitespace-only string. Display em dash (`—`) does not affect the underlying value used for sort.

### Lifecycle

- Sort state lives inside `AttendanceMarkingTable` (component-local `useState`).
- Initial state: `DEFAULT_SORT`.
- When the active session changes, sort resets to `DEFAULT_SORT`. Pass `sortResetKey={currentEvent.id}` from the page; reset sort state in a `useEffect` when that key changes.
- Sorting is a **view transform** only. The page’s `attendances` array remains the edit source of truth keyed by row ID.

### Interactions preserved

| Feature | Impact |
|---------|--------|
| Autosave / dirty rows | Unaffected — keyed by row ID |
| Mark all present / undo | Unaffected — operates on full roster by ID |
| Row save indicator | Follows row in sorted position |
| Recently changed highlight | Follows row in sorted position |
| Stagger entrance | Runs on sorted row order (display order matches animation order) |

---

## Section 2: UI

### Desktop headers (`md+`)

Sortable columns use a `<button type="button">` inside `<th>`:

- Base styles match current headers: `text-xs font-medium uppercase tracking-wide`
- Inactive sortable: `text-text-muted`, hover `text-text-secondary`
- Active sortable: `text-text-primary`
- Chevron: Iconoir `NavArrowUp` (asc) or `NavArrowDown` (desc), `size-14` class (~14px), only on active column
- `aria-sort`: `"ascending"`, `"descending"`, or `"none"` on each `<th>`

Status and Note remain plain `<th>` text with no button or chevron.

### Mobile (`< md`)

No column headers. Stacked rows render in sorted order using the same `sortedRows` list.

### Skeleton

`AttendanceMarkingTableSkeleton` keeps static non-interactive headers (no sort affordance while loading).

---

## Section 3: Architecture

```
page.tsx
  attendances (unsorted, edit source of truth)
    └── AttendanceMarkingTable
          sortState (useState)
          sortedRows = useMemo(() => sortAttendanceRows(rows, sortState), [rows, sortState])
          AttendanceSortableHeader × 4
          DesktopRowCells / MobileRowCell (unchanged, fed sortedRows)
```

### New files

| File | Purpose |
|------|---------|
| `src/helpers/attendance-marking-sort.ts` | Pure sort types, comparators, `sortAttendanceRows()` |
| `src/helpers/attendance-marking-sort.test.ts` | Unit tests for comparators and edge cases |

### Modified files

| File | Change |
|------|--------|
| `src/components/attendance/attendance-marking-table.tsx` | Sort state, sortable headers, render `sortedRows` |
| `src/app/.../attendance/marking/[eventIndex]/page.tsx` | Pass `sortResetKey={currentEvent.id}` |

No backend changes.

---

## Section 4: Testing

### Unit tests (`attendance-marking-sort.test.ts`)

- Default student A→Z sort
- Alt name / phone: non-blank before blank
- Enrollment: active before dropped; tie-break by name
- Descending reverses order
- Stable tie-breaking (equal names preserve relative order — optional, not required)
- Empty roster returns empty array

### Manual QA

1. Load marking page → students appear A→Z by name.
2. Click Student header → toggles Z→A.
3. Click Phone → sorts by phone ascending; chevron moves to Phone column.
4. Mark attendance, change sort → edits and save indicators stay on correct student.
5. Mark all present → all rows update regardless of sort order.
6. Navigate to next session → sort resets to Student A→Z.
7. Mobile viewport → stacked rows follow sorted order.

---

## Related specs

- [Course Attendance Marking reskin](2026-06-28-course-attendance-marking-design.md) — hand-composed table decision
- [Mark all present undo](2026-06-27-mark-all-present-undo-design.md) — preserved behavior
