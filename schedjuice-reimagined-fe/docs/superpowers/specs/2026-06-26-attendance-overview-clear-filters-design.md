# Attendance Overview — Clear Filters & Course Empty States

## Context

Attendance Overview (`/attendances/god-view`) stores filters in URL query params via `nuqs`. Individual comboboxes support deselect, but there is no single action to reset optional filters. Empty table messages are generic and do not distinguish “this course has no sessions today” from other zero-result cases.

This spec covers two small UX improvements on the existing god-view page. No new tabs, workflows, or API modes.

## Goals

- Add a **Clear filters** action that resets optional filters while keeping the active tab and date selection.
- Show explicit copy when a **selected course has no scheduled sessions** on the chosen day (Daily absences and Course marking gaps tabs only).

## Non-Goals

- Do not reset the active tab/mode or date preset/range when clearing filters.
- Do not reset summary-card status chips (e.g. Daily “Absent” filter).
- Do not add clear-filters or course-empty messaging to Monthly student summary or Risk overview.
- Do not change backend search logic beyond a summary metadata field.

## Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Clear scope | Optional filters only; keep tab + date |
| Clear placement | Filters card header + empty-state link when table is empty |
| No-events scope | Daily absences + Course marking gaps only |
| No-events detection | Backend `has_scheduled_sessions` on summary when `course_id` filter is set |

---

## Section 1: Clear Filters UX

### What counts as an optional filter

Per active mode, compare current query params against defaults:

| Param | Default |
|-------|---------|
| `courseId` | `""` |
| `categoryId` | `""` |
| `programId` | `""` |
| `studentId` | `""` (risk tab only) |
| `minRate` / `maxRate` | `""` (risk tab only) |
| `sort` | `"attendance_rate_asc"` (risk tab only) |
| `gapMinRate` | `"80"` (course marking gaps only) |
| `problemStatus` | `"not_marked"` (course marking gaps only) |
| `includeDroppedOut` | `"false"` |

**Not reset:** `mode`, `datePreset`, `dateFrom`, `dateTo`, `dailyStatus` (summary-card chip), `page` is reset to `1`.

### `hasActiveOptionalFilters` helper

Add to `src/helpers/attendance-god-view.ts`:

```ts
hasActiveOptionalFilters(mode, params): boolean
```

Takes the current mode and a plain object of filter values; returns true if any optional param differs from its mode default.

### `clearOptionalFilters` handler

In `god-view/page.tsx`, batch-reset the optional query params listed above via existing `set*` handlers, then `setPage(1)`.

### UI placement

1. **Filters card header** — flex row: title left, ghost/outline **Clear filters** button right. Hidden or disabled when `!hasActiveOptionalFilters`.
2. **Table empty states** — when rows are empty **and** `hasActiveOptionalFilters`, show a secondary **Clear filters** text button below the empty message (Daily absences and Course marking gaps tables at minimum; apply to Monthly and Risk for consistency since the handler is shared).

Priority when multiple empty reasons apply (see Section 2): show the more specific message first; still offer Clear filters if optional filters are active.

---

## Section 2: No Sessions for Selected Course

### Backend

Add optional field to daily and course-gap summaries:

```python
"has_scheduled_sessions": bool | None
```

Rules:

- `null` when no `course_id` filter is applied.
- `false` when `course_id` is set and zero `Event` rows exist for that course on the selected day (after date-range scoping, before roster expansion).
- `true` when `course_id` is set and at least one event exists that day.

Set in:

- `_build_daily_summary` early-return paths in `build_daily_absence_rows` when `filters.course_id` is set and the events query is empty.
- `_empty_course_marking_gap_summary` / `build_course_marking_gap_rows` when `filters.course_id` is set and `events_by_course` is empty.

### Frontend types

Extend `AttendanceGodViewDailySummary` and `AttendanceGodViewCourseGapSummary`:

```ts
has_scheduled_sessions?: boolean | null;
```

### Empty message priority

Update `getDailyAbsencesEmptyMessage` and `getCourseMarkingGapsEmptyMessage` (or replace with a small resolver) to accept summary + filter context:

1. **`has_scheduled_sessions === false`** → `"This course has no scheduled sessions on this day."`
2. **Status / threshold filters active** → existing filtered messages (unchanged).
3. **Default** → existing generic messages (unchanged).

Daily absences passes `dailyStatusFilter` and summary into the resolver. Course marking gaps passes `gapMinRate`, `problemStatus`, and summary.

### Summary cards

When `has_scheduled_sessions === false`, summary cards may show all zeros — acceptable. No special card treatment required.

---

## Section 3: Testing

### Backend (`app_attendance/tests/test_god_view_services.py`)

- Daily search with `course_id` filter and no events on selected day → summary includes `has_scheduled_sessions: false`.
- Daily search with `course_id` filter and events present → `has_scheduled_sessions: true`.
- Daily search without `course_id` → `has_scheduled_sessions: null` (or omitted).
- Same three cases for course marking gaps builder.

### Frontend

- Unit test `hasActiveOptionalFilters` for each mode (default vs one filter changed).
- Unit test empty-message resolver priority (no-events beats generic; status filter beats generic when events exist).

Manual smoke:

1. Select a course with no sessions today → see course-specific empty message.
2. Apply course + category filters → Clear filters resets both; date and tab unchanged.
3. Click Daily “Absent” summary card → Clear filters does **not** clear the chip.

---

## Files to touch

| Area | File |
|------|------|
| BE summary | `app_attendance/god_view_services.py` |
| BE tests | `app_attendance/tests/test_god_view_services.py` |
| FE types | `src/types/attendance-god-view.ts` |
| FE helpers | `src/helpers/attendance-god-view.ts` |
| FE page | `src/app/(internal)/attendances/god-view/page.tsx` |
| FE filters card | `src/components/attendance-god-view/attendance-god-view-filters.tsx` (header slot or prop) |
| FE tables | `daily-absences-table.tsx`, `course-marking-gaps-table.tsx`, optionally monthly + risk |
