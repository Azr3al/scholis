# Teacher Courses class rows with Type and Duration

**Date:** 2026-08-19

## Goal

Teacher Courses is one row per class assignment (teacher name repeats). WD/WE and session duration are their own columns. Assigned class chips keep title, MT/AT, and FM/HM only.

## Row shape

JSON (GET) and Excel (POST) share the same rows. Visible columns:

| key | meaning |
|---|---|
| `name` | Teacher name (Glide: user chip; repeats per class) |
| `email` | Email |
| `assigned_classes` | `{title} (MT\|AT) {FM\|HM}` |
| `course_type` | `WD` / `WE` / `OTHER` from existing `get_course_type` |
| `duration` | First-event length as `1h 30m` / `2h` / `45m`; `—` if none |

Also in JSON (not Excel columns):

- `user_id`
- `course_id`
- `courses`: `[{ "id": course_id, "title": "<assigned_classes>" }]` for chips/click

## Filters and identity

- Include only assignments whose `assigned_as_role.seniority` is `MAIN_TEACHER` or `ASSISTANT_TEACHER`. Drop `OTHER`, missing role, and missing seniority.
- `(MT)` / `(AT)` from that seniority, immediately after the title.
- FM/HM: `month_type_for_course` (start day ≤ 13 → FM).
- Same course twice in the month (leave + rejoin): one row (`user_id` + `course_id`).
- Sort: teacher name, then course title.

## Duration

From the first event by `(date, time_from)`: `time_to - time_from` in whole minutes.

- `90` → `1h 30m`
- exact hours omit minutes (`120` → `2h`)
- under one hour omit hours (`45` → `45m`)
- missing events, or non-positive span → `—`

## Overlap

Unchanged: assignment overlaps tenant-local `date_from`/`date_to`. Students excluded. Empty month → `[]`.

## Grid

- Name: existing Excellent Choice user chip; label = `name`.
- Assigned classes: `course-chips-cell` (one chip); click opens course summary popover.
- Type and Duration: plain text.
- Excel writes the five visible columns.
