# Attendance Godview Design

## Context

The current Attendance Overview page is an admin-only attendance dashboard at `/attendances/god-view`. It already provides a date-range based student-course aggregate table, deep filters, CSV export, and a detail sheet for one student and course.

School admins now need two clearer operational views:

- who is absent, or not yet marked, on a selected day
- which students had attendance problems during a selected month, aggregated per student across selected courses

The redesign should keep the UI simple and intuitive. It should remain an informational admin dashboard, not a follow-up or case-management workflow.

## Goals

- Add a daily absence workflow for today or any selected day.
- Add a monthly student summary workflow with one row per student.
- Keep course visible as a major column in daily rows.
- Keep course filtering available across the new views.
- Remove teacher filtering from the Godview design.
- Preserve the existing risk-oriented student-course aggregate view as a separate workflow.
- Separate confirmed absence from incomplete attendance marking.
- Provide useful context for admins to follow up outside the system: contact info, course context, missed dates, attendance notes, and links.

## Non-Goals

- Do not add messaging, reminders, or "mark contacted" workflow actions.
- Do not introduce a complex redesigned visual system.
- Do not merge the daily and monthly workflows into one auto-changing table.
- Do not treat unmarked attendance as confirmed absence.
- Do not add teacher filtering.

## Page Structure

The page remains `Attendance Overview`, but the main content becomes tabbed:

1. `Daily absences`
2. `Monthly student summary`
3. `Risk overview`

`Daily absences` is the default tab because it supports the most urgent admin workflow.

The tab selection should be stored in query params so admins can share a URL and reopen the same view. Each tab should also preserve its own relevant date and filter params where practical.

## Shared Filter Principles

Filters should stay compact and task-specific. The common filtering surface should include:

- selected day or month, depending on the active tab
- course
- category or program context if already supported by the existing filter patterns
- include dropped-out students toggle
- status filter where relevant

Teacher filter should not appear in the redesigned Godview.

## Daily Absences Tab

### Purpose

Help admins answer: "Who is absent or not yet marked for this selected day?"

### Default State

- Default date is today.
- Default status scope includes both `Absent` and `Not marked yet`.
- Dropped-out students are excluded by default.

### Summary Cards

Show a small set of cards above the table:

- `Absent`: count of confirmed absent rows.
- `Not marked yet`: count of scheduled student-session rows with no attendance record.
- `Courses affected`: distinct courses represented in the result set.
- `Students with streaks`: students whose recent absence streak is greater than one.

### Table Rows

Rows represent attendance incidents for the selected day. A student may appear multiple times if they have multiple affected sessions or courses.

Columns:

- `Student`: name, email, and phone if available.
- `Course`: course title plus category or program context.
- `Session`: class title and session time.
- `Status`: `Absent` or `Not marked yet`.
- `Pattern`: recent absence streak or a short recent pattern such as missed count over recent sessions.
- `Last attended`: most recent attended date for that student in that course.
- `Actions`: details, open student, open course attendance.

### Detail Sheet

The details sheet should remain informational. It should show:

- student contact context
- course context
- selected session details
- attendance status and attendance note, if any
- recent event-level attendance records for that student-course pair
- links to the student profile and course attendance page

## Monthly Student Summary Tab

### Purpose

Help admins answer: "Which students had attendance problems this month?"

### Default State

- Default month is the current month.
- Rows aggregate across all selected courses.
- Dropped-out students are excluded by default.

### Summary Cards

Show a concise monthly summary:

- `Students at risk`: students below the configured attendance threshold.
- `Total absences`: confirmed absence count for the month.
- `Not marked yet`: unmarked scheduled attendance count for the month.
- `Worst course impact`: course with the highest affected student count or highest absence count.

### Table Rows

Rows are one per student across the selected courses.

Columns:

- `Student`: name, email, and phone if available.
- `Courses`: count of filtered courses with scheduled attendance for the student.
- `Attendance rate`: aggregate month attendance rate across selected courses.
- `P / L / A / Unmarked`: present, late, absent, and unmarked totals.
- `Worst course`: course with the lowest attendance rate or highest absence count for that student.
- `Streak`: current consecutive absence risk.
- `Last attended`: latest attended class across selected courses.
- `Actions`: details, open student.

### Detail Sheet

Clicking a monthly row opens a side sheet with:

- student contact context
- monthly totals
- course-by-course breakdown
- missed class list grouped by course
- not-marked list grouped by course
- attendance notes where available
- links to relevant course attendance pages

The main table should stay scan-friendly; the detail sheet carries the extra investigation depth.

## Risk Overview Tab

The existing student-course aggregate table should be preserved as `Risk overview`.

This tab remains useful for scanning low attendance over a custom date range. It can keep the existing columns and behaviors with minor cleanup:

- student
- course
- attendance rate
- present, late, absent totals
- unmarked count
- recent absence streak
- last attended
- details and course attendance links

The teacher filter should be removed here too.

## Backend Data Design

The current backend service builds student-course aggregate rows. Extend it rather than replacing it.

Recommended API shape:

- Keep existing search behavior for `Risk overview`.
- Add a `daily_absences` mode or endpoint.
- Add a `monthly_students` mode or endpoint.
- Add or extend detail responses for monthly student breakdowns.

### Daily Absence Row

Daily rows should include:

- student id, name, email, phone
- course id, title, code, category, program
- event id, title, date, time from, time to
- attendance status: `absent` or `unmarked`
- attendance note
- recent absence streak
- last attended date for that student-course pair
- dropped-out flag

### Monthly Student Row

Monthly rows should include:

- student id, name, email, phone
- course count
- scheduled class count
- present count
- late count
- absent count
- unmarked count
- unregistered count
- attendance rate
- absence rate
- late rate
- worst course summary
- recent absence streak
- last attended date
- flags: at risk, late heavy, has unmarked

### Monthly Detail Response

Monthly detail should return:

- student id
- date range
- aggregate totals
- course breakdown rows
- event-level records grouped by course

## CSV Exports

Each tab should support its own export:

- `attendance-daily-absences-YYYY-MM-DD.csv`
- `attendance-monthly-summary-YYYY-MM.csv`
- existing risk overview export

CSV columns should match the visible table plus important identifiers needed for offline follow-up.

## Empty States

- Daily: "No absences or unmarked attendance for this day."
- Monthly: "No attendance records for this month."
- Filtered course: "No matching attendance records for this course."

## Edge Cases

- Students enrolled in multiple filtered courses appear once in monthly summary.
- Students may appear multiple times in daily absences if they miss multiple affected sessions.
- Dropped-out students stay excluded by default.
- Courses with no scheduled classes should not create misleading zero-rate rows.
- Unmarked sessions are visible but not counted as confirmed absences.
- Missing phone or guardian contact should not block the row; show available email and profile links.

## Testing Plan

Backend tests:

- daily absence rows include explicit `absent` records
- daily absence rows include `unmarked` scheduled sessions
- daily rows include course and session context
- monthly rows aggregate multiple courses into one student row
- monthly worst course selection is correct
- dropped-out filtering works
- CSV output works per tab

Frontend tests:

- tab changes update query params
- teacher filter is not rendered
- daily columns render for daily tab
- monthly columns render for monthly tab
- monthly details opens grouped course breakdown
- daily export and monthly export call the correct API mode

## Implementation Notes

Keep the UI consistent with the current admin dashboard components: tabs, cards, filters, table, sheet, buttons, and badges. Avoid decorative motion or a new visual style. The value of this change is clearer workflows and better admin data, not visual novelty.
