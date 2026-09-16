# Session-credit course scheduling — Design Spec

**Date:** 2026-08-18  
**Status:** Approved (brainstorm)  
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`  
**Approach:** Program policy + course cap + click-calendar (Approach 1)

## 1. Summary

Add a **session-credit** scheduling engine for **manual** programs. Teachers pick an exact number of calendar dates (default 8). The first and last dates become the course `start_date` and `end_date`. Individual session times default to a shared From/To and can be overridden per session.

This is **not** a third sibling of WD/WE vs weekday chips. Those are two day-picker skins of the existing **weekly recurrence** engine (`SimpleSchedulePicker`), gated by `Organization.is_wd_we_course_types_enabled`. Session-credit replaces that engine for courses whose program has the flag on.

## 2. Context

Today every create path and the Schedule tab composer uses weekly recurrence:

1. Type start and end dates (or duration presets).
2. Pick days (WD/WE buttons **or** weekday chips) plus one time range.
3. Expand into discrete `Event` rows across the span.

Custom schedule is an escape hatch (per-slot times). Persistence is unchanged: discrete events, saved via `POST courses/{id}/edit-events`.

Some programs sell a fixed session pack (typically 8), not a weekday pattern over a date span. Those teachers should see the month calendar immediately and click dates.

Related: [2026-07-18 simple-course-scheduling](./2026-07-18-simple-course-scheduling-design.md), [2026-07-21 inline schedule on create](./2026-07-21-inline-schedule-on-course-create-design.md), [2026-08-02 course schedule rewrite](./2026-08-02-course-schedule-rewrite-design.md).

## 3. Goals

1. Program-level session-credit on/off plus a default max session count.
2. Per-course Max sessions, seeded from the program, editable on create and on the Schedule tab.
3. Manual create: hide date span + weekly picker; show max, shared times, and the month calendar.
4. Create requires **exactly** max selected dates before submit; first/last dates write the course span.
5. Schedule tab for that program uses the same click-calendar; cap stays; exact-N does not.
6. Existing courses in a newly enabled program switch to this Schedule tab, with `max_sessions` seeded from current event count.

## 4. Non-goals

- Org / tenant columns or tenant settings UI for this mode.
- Intake wizard, add-to-intake, `generate-courses`.
- Session-credit on `intake_based` programs (rejected).
- Changing WD/WE nomenclature (`is_wd_we_course_types_enabled`).
- New recurrence storage / rrule.
- A second calendar widget.
- Multiple sessions on the same calendar date.
- Mobile app changes.

## 5. Locked decisions

| Topic | Choice |
|---|---|
| Where the mode lives | `Program`, not `Organization` |
| Program fields | `is_session_credit_scheduling` (default `false`) + `default_max_sessions` (default `8`) |
| Course field | `max_sessions` (nullable; required when the program is session-credit) |
| Intake-based + credit | 400; manual programs only |
| Create surfaces | `ManualCourseForm` only |
| Schedule tab | Credit calendar for every course whose **current** program has the flag on |
| Create count rule | Exactly `max_sessions` |
| Edit count rule | `count <= max_sessions`; fewer than max is allowed (deletes) |
| Add when at cap | Raise Max sessions, then click |
| Lower max | Blocked while `max < current count` |
| Times | Shared From/To on new clicks; chip popover overrides one session |
| Create From/To change | Updates all selected sessions that are not overridden |
| Schedule-tab From/To change | New clicks only; does not rewrite existing sessions |
| One session per date | Yes; click toggles |
| Past dates / Sabbath | Clickable; no auto-skip |
| Series delete | Hidden in credit mode (not a weekly series) |
| Persistence | Existing discrete events + `edit-events` |
| Flag on (program) | All courses in that program; null `max_sessions` ← event count (including 0) |
| Flag off | UI reverts to weekly; events and `max_sessions` kept unused |
| `default_max_sessions` later change | New creates only; do not rewrite existing courses |
| Empty edit span | Allowed (`0 of max`); do not null `start_date` / `end_date` |
| Exact-N on backend | Create-form only. BE always enforces `count <= max`, not exact-N |

## 6. Architecture

### 6.1 Data

**`Program`**

| Field | Type | Default | Validation |
|---|---|---|---|
| `is_session_credit_scheduling` | boolean | `false` | If `true`, `course_creation_method` must be `manual` |
| `default_max_sessions` | positive int | `8` | 1–365 |

Both live in program settings → **Creation method and subject rules** (explicit save, same high-risk group as `course_creation_method`). Labels:

- Switch: **Session-credit scheduling** — “Teachers pick a fixed number of dates on the calendar instead of a weekly pattern. Manual programs only.”
- Number: **Default max sessions**

Turning credit on while the program is `intake_based`, or switching a credit program to `intake_based` without turning credit off, is a field error (400). Do not save.

**`Course.max_sessions`**

- `PositiveIntegerField(null=True, blank=True)`.
- 0 allowed (backfill of a course with no events).
- 1–365 on the create form (minimum 1 so create cannot be “0 of 0”).
- Ignored when the program is weekly (`null` on new weekly courses).

**Events** stay `date` + `time_from` + `time_to`. No new event columns. Override is just a different time on that row.

**Nested program on course:** `CourseSerializer`’s slim program object already includes `id`, `name`, `course_creation_method`, `subject_strategy`. Add `is_session_credit_scheduling` so the Schedule tab does not extra-fetch. `ProgramSerializer` exposes both new fields (`fields = "__all__"`).

### 6.2 Flag transitions

**Off → on** (program save): for every course in that program with `max_sessions IS NULL`, set `max_sessions` to that course’s current event count (0 if none). Non-null values are left alone. No event rewrites.

**On → off:** no data rewrite. Create and Schedule tab use weekly UI again.

**Course moved onto a credit program** with null `max_sessions`: same seed as flag-on (event count) on that course update.

**Course moved onto a weekly program:** leave `max_sessions`; weekly UI ignores it.

### 6.3 Units

| Unit | Does | Depends on |
|---|---|---|
| Program serializer `validate` | Reject intake-based + credit; bounds on default max | `Program` |
| Program update backfill | Null caps → event count when flag turns on | courses + events |
| Course serializer | Require `max_sessions` when program is credit; reject `max_sessions` < current event count on PATCH | `Course`, `Event` |
| `edit-events` cap check | After simulating the write, `len(resulting events) <= effective max` (incoming `course.max_sessions` if present, else stored). Duplicate dates → 400 | existing `apply_course_event_edit` |
| `session-credit-draft.ts` (FE, React-free) | Toggle date, cap, exact-N, shared vs override, implied span | dates + times |
| `CourseScheduleEditor` credit mode | Hide weekly composer; max field; click-calendar; chip popover | draft helper, presentational grid, `edit-events` |
| `ManualCourseForm` schedule swap | Credit calendar vs `SlotsSimpleScheduleField` | draft helper, create-then-`edit-events` |

Create reuses the Schedule tab’s presentational month grid. Do not add a second calendar.

### 6.4 Save contracts

**Create (session-credit program)**

1. FE blocks submit unless selected count == `max_sessions` (>= 1).
2. `POST courses` with `max_sessions`, `start_date` = first selected date, `end_date` = last selected date. No weekly slots. No `course_type` from WD/WE.
3. `POST courses/{id}/edit-events` with the picked events (shared or overridden times). Same two-step and partial-failure behavior as today: if events fail, toast and still go to `?tab=edit-schedule`.

**Schedule tab Save**

`edit-events` already sends `{ course, events }`. Include `max_sessions`, `start_date`, and `end_date` on `course` in the same request.

Order inside the request (single transaction, existing apply path):

1. Effective max = payload `course.max_sessions` if sent, else stored.
2. Simulate resulting event set.
3. Reject if any two remaining events share a calendar date, or if `len > effective max`, or if `effective max < len`.
4. Persist events, then course fields.
5. `start_date` / `end_date` = min/max remaining event dates. If zero events remain, **keep** the last saved span (Course still requires dates).

Raising max and adding dates in one Save works because the cap uses the incoming max.

## 7. UI

### 7.1 Manual create

Identity / details unchanged. Schedule **drops** start date, end date, 1/3/6 month presets, and `SlotsSimpleScheduleField`.

```text
┌─────────────────────────────────────────────────────────┐
│  Identity / Details                                     │
│ ─────────────────────────────────────────────────────── │
│  Schedule                                               │
│  Max sessions     [ 8 ]                                 │
│  From  [ 7:00 PM ]   To  [ 8:30 PM ]                    │
│                                                         │
│  3 of 8 selected · 3 Aug 2026 → 24 Aug 2026             │
│  ‹   August 2026   ›                          [ Today ] │
│  ... month grid ...                                     │
│  [ Create course ]   (disabled until n == max)          │
└─────────────────────────────────────────────────────────┘
```

- Max seeds from `program.default_max_sessions`.
- From/To seeds from org `default_session_start_time` / `default_session_duration_minutes`.
- Click empty day: add at current From/To if `count < max`; otherwise no-op + short inline note.
- Click selected day: remove. Chip popover can override that session’s time (tracked per date in draft; changing shared From/To does not touch overridden dates).
- Caption: `n of max` and implied span; no span when empty.
- Weekly programs: today’s start/end + WD/WE or weekday chips. Unchanged.

### 7.2 Schedule tab

Weekly **Add sessions** composer is hidden. Grid is the editor. Draft-then-Save, unsaved guard, and chip popover stay.

```text
┌───────────────────────────────────────────────────────────────┐
│  Max sessions [ 8 ]     8 of 8 · 3 Aug → 24 Aug               │
│  From [ 7:00 PM ]  To [ 8:30 PM ]     [ Today ]               │
│  ‹   August 2026   ›                                          │
│  ... chips show course title ...                              │
│        [ sticky ]  n unsaved changes   [Discard] [Save]       │
└───────────────────────────────────────────────────────────────┘
```

- At cap, empty-day click does not add; copy: raise Max sessions to add more.
- Chip: **Edit time…** / **Delete…** this session only. No “all future matching.”
- Toolbar From/To applies to newly clicked dates only.
- Past sessions keep today’s read-only / attendance-protected (`has_checkin`) rules. Adding on a past **empty** day is allowed.
- Same-course overlap: newest click wins (current rewrite). Cross-course overlap: existing rules.

Weekly program Schedule tab: unchanged.

## 8. Error handling

| Case | Behavior |
|---|---|
| Credit on + `intake_based` | 400 on the credit switch / creation method |
| `default_max_sessions` out of 1–365 | 400 on that field |
| Create `n ≠ max` | Inline error; no `POST courses` |
| Create max lowered below selected count | Blocked until extras are deselected |
| Invalid / empty From/To | Same time validation as simple picker |
| Create OK, `edit-events` fails | Error toast; redirect to Schedule tab |
| `edit-events` `len > max` | 400; draft not persisted |
| PATCH/save `max_sessions` < count | 400 on `max_sessions` |
| Duplicate date in payload | 400 |
| Delete check-in-protected session | Existing dialog skip + count |
| All sessions deleted on edit | Save OK; dates unchanged |

Frontend mirrors cap and exact-N (create) so teachers are not surprised. Backend is authoritative for combo rejection, `count <= max`, duplicate dates, and `max >= count`.

## 9. Testing

High-value only. No “calendar renders” smoke. No org-settings tests.

**Backend**

- Program: credit + `intake_based` → 400; credit + `manual` → 200.
- Flag on: null caps become event count (including 0); already-set caps unchanged.
- `edit-events`: `len > max` → 400; `max < count` → 400; `len < max` on edit → 200; duplicate date → 400.
- First/last remaining event dates written to `start_date` / `end_date` when count > 0; empty set leaves dates unchanged.
- Teacher without program-manage permission cannot PATCH program credit fields (existing RBAC).

**Frontend (`session-credit-draft` + thin form wiring)**

- Create: 7 of 8 blocks submit; 8 of 8 allowed; payload start/end = first/last; 9th click ignored.
- Shared From/To updates non-overridden picks only.
- Schedule tab: at cap, click does not add; raising max allows a click; lowering max below count blocked.
- Weekly program: credit calendar is not mounted; `SlotsSimpleScheduleField` still is.

Caller-contract: create helper posts `courses` with `max_sessions` then `edit-events` with one row per selected date (stub ids, no weekly expansion).

## 10. Implementation notes

Likely files:

- BE: `app_course/models.py` (`Program`, `Course`), new migration, `ProgramSerializer.validate`, program update backfill, `CourseEventEditView` / event-edit service cap check, `CourseSerializer`.
- FE: `src/types/program.ts`, `src/types/course.ts`, program settings groups + `program-settings-sections.ts`, `manual-course-form.tsx`, `course-schedule-editor.tsx`, new `src/helpers/session-credit-draft.ts` (+ tests).

Reuse `createCourseThenOptionalSchedule` shape (create then `edit-events`) with a credit path that posts explicit event rows instead of expanding `RecurringSlot[]`.
