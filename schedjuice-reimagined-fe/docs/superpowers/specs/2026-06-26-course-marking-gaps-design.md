# Course Marking Gaps — Attendance God View Design

## Context

The Attendance Overview page at `/attendances/god-view` has three tabs: Daily absences, Monthly student summary, and Risk overview. Daily absences lists student-level rows for a selected day and supports status filtering via summary cards, but it does not answer the operational question: *which courses today have a systemic marking problem?*

Admins need a course-centric view for a single day that surfaces courses where most students are still not marked, with the ability to drill into affected students and follow up outside the system.

## Goals

- Add a fourth tab, **Course marking gaps**, to the Attendance Overview page.
- Show one aggregated row per course for a **single selected day** (default: today).
- Treat **not marked** as `unregistered` + `unmarked` combined (record exists with default status, or no record at all).
- Default to showing only courses where **not-marked rate > 80%**; allow admins to lower or clear the threshold.
- Support **dominant-problem status filtering** (e.g. show course-days where absent is the largest bucket).
- Provide a detail sheet listing affected students for a course-day, reusing existing god-view patterns (contact info, session, status, links).
- Support CSV export for the summary table and detail sheet.
- Persist tab and filter state in URL query params for shareable links.

## Non-Goals

- Do not add messaging, reminders, or in-app follow-up workflows.
- Do not support multi-day date ranges on this tab (single day only).
- Do not merge this tab with Daily absences into one auto-switching table.
- Do not fix Daily absences' separate handling of `unregistered` vs `unmarked` in this change (optional follow-up).
- Do not add teacher filtering.

## Page Structure

Add tab **Course marking gaps** as the second tab (after Daily absences):

1. Daily absences
2. **Course marking gaps** (new)
3. Monthly student summary
4. Risk overview

Tab selection stored in the existing `mode` query param as `course_marking_gaps`.

## Terminology

| Term | Meaning |
|------|---------|
| `unmarked` | Scheduled student-session slot with no `UserEvent` record |
| `unregistered` | `UserEvent` exists with status `unregistered` |
| **Not marked** | `unmarked` + `unregistered` combined |
| **Scheduled** | Count of rostered student × session slots for that course on the selected day |
| **Dominant problem** | Status bucket (present, late, absent, not marked) with the highest count for that course-day |

**Tie-break for dominant problem** (when counts are equal): not marked → absent → late → present.

## Filters

Shared with other god-view tabs where applicable:

- **Date** — single day only; presets: Today, Custom (same UX as Daily absences; `date_from` and `date_to` must be equal)
- **Course** — optional single-course scope
- **Category / Program** — optional
- **Include dropped out** — off by default

Tab-specific filters:

| Filter | Default | Behavior |
|--------|---------|----------|
| **Problem type** | `not_marked` | Which status metric the threshold and dominant filter apply to: `not_marked`, `absent`, `late`, `present`, or `all` |
| **Min rate %** | `80` | Minimum percentage for the active problem type. Applied server-side. Clearing (empty) shows all courses for the day. |

### Problem type behavior

- **`not_marked` (default):** Show course-days where `not_marked_count / scheduled >= min_rate`. Dominant check not required (the metric itself is the focus).
- **`absent`, `late`, `present`:** Show course-days where that status is **dominant** (plurality winner per tie-break rules) **and** `status_count / scheduled >= min_rate`.
- **`all`:** No dominant filter. If `min_rate` is set, apply it to not-marked rate. If `min_rate` is cleared, return all courses for the day sorted by not-marked rate descending.

## Summary Cards

Compact cards above the table (clickable where noted):

- **Courses affected** — count of rows in the current filtered result set
- **Not marked slots** — total not-marked student-session slots across visible courses
- **Worst course** — course with highest not-marked % in the result set (title + rate)

Cards are informational; they reflect the filtered result set, not the unfiltered day totals.

## Table Rows

One row per **course** for the selected day. If a course has multiple sessions that day, aggregate all enrolled students across all sessions.

| Column | Description |
|--------|-------------|
| Course | Title, code, category or program context |
| Date | Selected day (ISO date) |
| Scheduled | Total student-session slots |
| P / L / A / Not marked | Counts |
| Not marked % | `(unregistered + unmarked) / scheduled × 100`, rounded to 2 decimals |
| Dominant problem | Label for the plurality status bucket |
| Actions | Details (opens sheet), link to course attendance page |

**Default sort:** Not marked % descending, then course title ascending.

**Empty states:**

- Default filtered (80%): "No courses exceed 80% not marked for this day."
- Threshold cleared: "No scheduled attendance for this day."
- Course filter with no match: "No matching courses for this day."

## Detail Sheet

Opened via **Details** on a summary row. Side sheet pattern consistent with existing god-view detail sheets.

**Header:** Course title + formatted date.

**Summary block:** Scheduled, P/L/A/not marked counts, not-marked %, dominant problem.

**Student table:** Rows for students matching the active problem type filter:

- Default (`not_marked`): students with `unregistered` or `unmarked` status on any session that day
- `absent` / `late` / `present`: students with that status on any session that day
- Multiple sessions: one row per affected student-session (same shape as daily absence rows)

**Columns:** Student (name, email, phone), Session (title, time), Status, Streak, Last attended, link to course attendance.

**Actions:** Export detail CSV, open course attendance page.

## Backend Design

Extend the existing god-view API rather than adding separate routes (Approach 1).

### Search

`POST /api/v1/attendances/god-view/search`

Add mode: `course_marking_gaps`.

New service function: `build_course_marking_gap_rows(filters)`.

**Implementation notes:**

- Reuse `_filter_courses`, roster loading, and event querying from `build_daily_absence_rows`.
- Require `date_from == date_to` (single day); if a range is sent, use `date_from` only or coerce `date_to = date_from`.
- For each course with at least one session on the day, iterate roster × sessions and tally present, late, absent, not marked.
- Compute rates and dominant problem per course.
- Apply `problem_status` and `min_rate` filters server-side before pagination.
- Paginate and support `csv=true` export.

**New `GodViewFilters` fields:**

```python
problem_status: str = "not_marked"  # not_marked | absent | late | present | all
min_rate: Optional[float] = 80.0      # None = no threshold
```

Parse from request body / query params. Default `min_rate=80` only when `mode=course_marking_gaps`; other modes ignore these fields.

**Response row shape:**

```python
{
    "course_id": int,
    "course_title": str,
    "course_code": str,
    "category_id": int | None,
    "category_name": str,
    "program_id": int | None,
    "program_name": str,
    "event_date": str,           # ISO date
    "scheduled_count": int,
    "present_count": int,
    "late_count": int,
    "absent_count": int,
    "not_marked_count": int,     # unregistered + unmarked
    "not_marked_rate": float,
    "dominant_problem": str,     # present | late | absent | not_marked
}
```

**Summary shape:**

```python
{
    "courses_affected_count": int,
    "not_marked_slots_count": int,
    "worst_course": {
        "course_id": int,
        "course_title": str,
        "not_marked_rate": float,
    } | None,
    "date_from": str,
    "date_to": str,
}
```

**CSV filename:** `attendance-course-marking-gaps-YYYY-MM-DD.csv`

### Detail

`GET /api/v1/attendances/god-view/details`

Add support: `mode=course_marking_gaps&course_id=<id>&date_from=<day>&date_to=<day>`

Optional query param: `problem_status` (same values as search; defaults to search context or `not_marked`).

Returns student-session rows (reuse daily absence row shape) filtered to the course-day and problem type.

**CSV filename:** `attendance-course-marking-gaps-detail-<course_id>-YYYY-MM-DD.csv`

## Frontend Design

### Types

Extend `AttendanceGodViewMode` with `course_marking_gaps`.

Add `AttendanceGodViewCourseGapRow`, `AttendanceGodViewCourseGapSummary`, and search response types in `attendance-god-view.ts`.

Add `CourseMarkingProblemStatus` enum mirroring backend values.

### Page

Update `god-view/page.tsx`:

- Add tab entry and `switchMode` handling (reset tab-specific query params: `problemStatus`, `minRate`, preserve shared filters).
- Query params: `problemStatus` (default `not_marked`), `minRate` (default `80`).
- Wire search body with `mode: "course_marking_gaps"`, `problem_status`, `min_rate`.
- Date preset: same as Daily absences (`today`, `custom`); enforce single-day (when custom, keep from/to in sync).

### Components

- `CourseMarkingGapsFilters` — extends or composes with existing filter bar: date (single day), course, category, program, problem type select, min rate input, include dropped out.
- `CourseMarkingGapsTable` — summary table with columns above.
- `CourseMarkingGapsSummaryCards` — three summary cards.
- `CourseMarkingGapDetailSheet` — course-day drill-down; can extend `AttendanceGodViewDetailSheet` or parallel component.

Match existing admin dashboard components (Card, Table, Badge, Sheet, Button). No new visual system.

## Edge Cases

- **Course with no sessions on the selected day:** excluded from results.
- **Course with sessions but empty roster:** excluded (scheduled = 0).
- **Single student, single session, unmarked:** not-marked rate = 100%; included when threshold ≤ 100.
- **Dropped-out students:** excluded from roster by default (same as other tabs).
- **Multiple sessions same day:** each rostered student counted once per session in scheduled total.
- **min_rate cleared:** return all courses with sessions that day, sorted by not-marked % desc.
- **problem_status = all with min_rate = 80:** filter by not-marked rate only (same as default not_marked mode).

## Testing Plan

### Backend (`test_god_view_services.py`)

- Aggregates unregistered and unmarked into `not_marked_count`
- Multi-session same day sums scheduled correctly
- Default 80% filter excludes courses below threshold
- Clearing min_rate returns all courses with sessions
- Dominant-problem filters (absent dominant + min rate) work with tie-break
- Dropped-out exclusion
- Single-day coercion when date_from ≠ date_to
- CSV export headers and row count
- Detail endpoint returns correct student rows per problem type

### Frontend

- Tab switch updates `mode` query param and loads correct data
- Default min rate 80 sent on first load
- Clearing min rate refetches unfiltered list
- Problem type change refetches with correct params
- Detail sheet opens with course + date context
- Export CSV uses `course_marking_gaps` mode
- Permission gate unchanged (`attendance.view_all`)

## Implementation Notes

- Follow patterns in `god_view_services.py` and existing god-view frontend components.
- Keep backend aggregation in Python; do not client-side roll up daily absence rows.
- Reuse pagination and CSV helpers already present on the search view.
