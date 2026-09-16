# Stalled after marking — Course marking gaps filter

**Status:** approved design (planning phase)  
**Date:** 2026-07-21  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Surfaces:** Attendance Overview → Course marking gaps (`/attendances/god-view?mode=course_marking_gaps`)

## Context

Course marking gaps already surfaces courses with a high not-marked rate (default ≥80%) for a date range, with problem-type and single-category filters. Ops also need a narrower question: courses that **did** start marking at least once in the range, then left **two consecutive scheduled session days** fully unmarked — often a teacher who marked once and then stopped.

Categories today are a single include select. Admins want a checkbox list (existing `MultiSelectPopOver`) with all categories included by default.

## Goals

1. Add a **Stalled after marking** checkbox on Course marking gaps.
2. When on, return only courses that, within the selected date range:
   - Have **at least one** scheduled session day with any student marked `present`, `late`, or `absent`.
   - Have **at least one pair** of consecutive **scheduled session days** (by course date order) where every student slot is not marked (`unregistered` or missing `UserEvent`).
3. While the checkbox is on, **replace** (hide and ignore) Problem type and Min rate % filters.
4. Replace the single category select with a **category multi-select popover** (checkbox list); default all checked (include all).
5. Keep shared filters: date range, course, program. Persist new state in URL. Keep existing table, detail sheet, and CSV shapes.

## Non-goals

- New god-view tab or separate `mode` value.
- Changing daily-absences handling of `unregistered` vs `unmarked`.
- Wiring unused `CourseMarkingGapsSummaryCards`.
- Include-dropped-out toggle.
- Teacher filter, messaging, or reminders.
- Client-side-only filtering of a richer payload.

## Decisions

| # | Decision |
| --- | --- |
| 1 | Approach: mode flag on existing search (`stalled_after_marking`), not a new tab |
| 2 | Consecutive days = consecutive **scheduled session days** for that course, not calendar days |
| 3 | “Filled-in” day = any student `present` / `late` / `absent` that day |
| 4 | “All unregistered” day = every student slot is `unregistered` or unmarked (same as existing not-marked) |
| 5 | Scope = selected `date_from`…`date_to` only |
| 6 | Stalled on → ignore/hide `problem_status` and `min_rate` |
| 7 | Categories: one `MultiSelectPopOver`; all checked by default; uncheck to exclude |
| 8 | Categories: omit/`null` or all-ids ≡ no filter; explicit `[]` (none checked) → empty result + empty state |
| 9 | Days with fewer than 2 scheduled days in range cannot match |

## Query semantics

When `stalled_after_marking=true` and `mode=course_marking_gaps`:

```
include course C iff within [date_from, date_to]:
  scheduled_dates(C) = distinct session dates for C, ascending
  AND exists d in scheduled_dates where has_any_marked(C, d)
  AND exists i where
        is_fully_not_marked(C, scheduled_dates[i])
    AND is_fully_not_marked(C, scheduled_dates[i+1])
```

- `has_any_marked`: at least one enrolled student slot that day is `present`, `late`, or `absent`.
- `is_fully_not_marked`: every enrolled student slot that day is not marked (`unregistered` or no `UserEvent`). Reuse `_is_not_marked_status` / existing not-marked counting.
- Days with **zero** enrolled student slots are skipped (not treated as fully not-marked; do not form a stall pair).
- Non-adjacent fully not-marked days (with a marked or partial day between) do **not** count as a consecutive pair.
- A course that is fully not-marked for the whole range but never had a marked day in range is **excluded**.

## UI

Toolbar on Course marking gaps (lofi):

```
[Date preset/range] [Course] [Categories ▾] [Program]  ☐ Stalled after marking
                              └ MultiSelectPopOver checkbox list

When Stalled unchecked (today):
  … [Problem type ▾] [Min rate %]

When Stalled checked:
  Problem type + Min rate hidden; not sent on the request
```

### Categories

- Control: existing `MultiSelectPopOver` / `CategoryMultiSelect` patterns.
- Label: e.g. “Categories”.
- Default: all tenant categories selected.
- URL: `categoryIds=1,2,3` (comma-separated). Omit when all selected (no restriction). Use `categoryIds=` (empty) when none checked.
- Request body: omit `category_ids` when all selected; send `category_ids: []` when none checked (backend returns empty).
- Clear filters: reset categories to all selected; uncheck stalled; restore `problemStatus=not_marked`, `gapMinRate=80`.

### Stalled checkbox

- URL: `stalledAfterMarking=1` (or `true`) when on; omit when off.
- Checking on: drop `problemStatus` / `gapMinRate` from URL and request body.
- Unchecking: restore defaults `problemStatus=not_marked`, `gapMinRate=80`.
- Empty state when on: copy that reflects the stalled rule (no matching stalled courses).

### Table / detail / CSV

- Same course-marking-gaps summary columns and detail sheet.
- Detail: still course + date range; default problem focus remains not-marked slots for drill-in.
- CSV continues to use search/detail endpoints with the same filter body/params.

## API

`POST attendances/god-view/search` (and detail/CSV filter parsing via `parse_god_view_filters`):

| Field | Type | Behavior |
| --- | --- | --- |
| `stalled_after_marking` | bool | default `false`; only meaningful for `course_marking_gaps` |
| `category_ids` | list[int] \| omitted | omit/`null` → no filter; non-empty → `category_id__in`; `[]` → empty result |
| `category_id` | int \| omitted | keep for back-compat; if both present, `category_ids` wins |
| `problem_status`, `min_rate` | existing | ignored when `stalled_after_marking=true` |

Response row/summary shape unchanged.

## Backend

Extend `GodViewFilters` and `build_course_marking_gap_rows` (helpers as needed):

1. Apply course filters including `category_ids` (`category_id__in`).
2. For each candidate course, collect distinct scheduled session dates in range (ascending).
3. Per date with ≥1 student slot: compute `has_any_marked` and `is_fully_not_marked`.
4. Keep course if prior-marking and consecutive-stall conditions hold.
5. When stalled flag is on, skip `_passes_course_marking_filters` threshold / dominant-problem gates (or short-circuit them).
6. Emit existing row aggregation for kept courses.

Permission remains `attendance.view_all`.

## Frontend

| Area | Change |
| --- | --- |
| `attendance-god-view-filters.tsx` | Category multi-select; stalled checkbox; conditionally hide problem type / min rate |
| God-view page / URL helpers | Parse/serialize `stalledAfterMarking`, `categoryIds`; build search body |
| Types / helpers | Extend filter types; empty-state helper for stalled mode |
| Detail sheet | Pass stalled + category_ids through if needed for consistent filtering |

## Edge cases

| Case | Result |
| --- | --- |
| < 2 scheduled days in range | Never matches stalled |
| Fully not-marked, no marked day in range | Excluded |
| Marked day between two not-marked days | No consecutive pair across the marked day |
| Zero student slots on a date | Skip date (not a stall day) |
| All categories checked (omit `category_ids`) | No category filter |
| No categories checked (`category_ids: []`) | Empty list + empty state |
| Stalled + existing course/program filters | AND with those filters |

## Testing

High-value only (see high-value-tests rule):

**Backend** (`test_god_view_services.py` or focused module):

- Matches: prior marking + two consecutive fully not-marked scheduled days.
- Rejects: no prior marking in range.
- Rejects: two not-marked days that are not consecutive scheduled days.
- `category_ids` include restricts results.
- When stalled on, `min_rate` / `problem_status` do not exclude a matching course.

**Frontend** (thin):

- When stalled checked, problem type and min rate controls are not shown (or request omits them).

Avoid happy-path-only smoke that only asserts `200` / “renders”.

## Done when

- Checkbox and category popover work on Course marking gaps.
- Search returns courses matching the stalled rule inside the selected range.
- Pagination and CSV still behave with the new filters.
- Spec’d tests pass with `--keepdb` on BE.

## Out of scope follow-ups

- Daily absences unregistered vs unmarked consistency.
- Course marking gaps summary cards wiring.
- Include dropped-out students toggle.
