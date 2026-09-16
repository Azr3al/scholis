# Teacher course assignment history and TR SU Teacher Courses report

**Date:** 2026-08-19  
**Status:** Approved (brainstorm)  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Approach:** Close teacher `UserCourse` in place (`joined_at` / `left_at`) + one month-aware Teacher Courses sheet (Approach 1)

## 1. Summary

Staff course assignment becomes interval history: unassigning a teacher keeps the `UserCourse` row and sets `left_at`. Teacher Su payroll is per course, not per `UserEvent`, so the Teacher Courses report must show who was assigned during a selected month.

TR SU finance reports collapse to that one sheet. Classes Data, MT/AT Ratios, and Dropout Rates are removed. Excellent Choice and Teacher Courses Glide grids use `PageContainer width="full"`.

## 2. Context

`UserCourse` is a live bridge (`unique_together` on user+course) and is hard-deleted on unassign. Teacher Courses (`POST reports/hr/teacher_courses`) dumps **currently assigned** teachers as CSV and has no frontend page (`/finances/reports/teacher-courses` 404s). Analytics shows a single **Finance report** hub.

`CourseMembershipEvent` already logs some join/leave events (students on most paths; staff on AI/cron only). It is not month-queryable assignment history and is not the source of truth for this work.

Payroll math (`UserEvent` / `UserAttendance`, Microsoft Payroll) is unchanged. TR SU uses the Teacher Courses file/sheet as the per-course assignment list.

Shortcuts **Course Data** (`/shortcuts/course-data`) already replaces Classes Data for operational class lists.

## 3. Goals

1. Keep teacher `UserCourse` rows after unassign (`joined_at` / `left_at`).
2. Re-assign after leave creates a new row; only one **open** row per user+course.
3. Teacher Courses: month-filtered Glide sheet + Excel download for `TR_SU_STYLE` tenants.
4. Analytics / Insights / finance homepage: **Teacher Courses** (not “Finance report”).
5. Delete Classes Data, MT/AT Ratios, and Dropout Rates (UI, links, HR types, SQL).
6. Widen Excellent Choice and Teacher Courses sheets (`width="full"`).

## 4. Non-goals

- Changing `UserEvent` create/soft-delete on teacher remove.
- A new TR SU payroll formula or `payroll_calculation_strategy`.
- Wiring assignment spans into `/finances/payroll` or Microsoft Payroll.
- Soft-closing **student** `UserCourse` rows (still hard-delete).
- Backfilling already-deleted assignments from `CourseMembershipEvent`.
- Implementing MT/AT or dropout reports.
- Changing Course Data, Student Payments, or other Glide grids.
- Hiding the finance Analytics rail or defaulting sheets to fullscreen.

## 5. Locked decisions

| Topic | Choice |
|---|---|
| History shape | Keep teacher `UserCourse`; `joined_at` + `left_at` |
| Students | Hard-delete as today |
| Re-assign | New row; partial unique on open rows |
| Managers | `objects` = open rows; `including_ended` = all; `base_manager_name = "including_ended"` |
| Nested roster | Serializers/prefetches that mean “on the course now” must use **open** rows only |
| Payroll calc | Unchanged |
| Report for TR SU | Teacher Courses only |
| Teacher Courses UX | Month picker + Glide sheet + Excel (Excellent Choice pattern, month not free date range) |
| API gate | `report_style == TR_SU_STYLE` else 403 |
| Dead reports | Delete Classes Data + unimplemented MT/AT + Dropout |
| Grid width | `PageContainer width="full"` on Excellent Choice and Teacher Courses |
| Finance rail | Stays |
| Past deleted rows | Gone; `joined_at` backfill from `created_at` for existing rows |

## 6. Architecture

### 6.1 Data — `UserCourse`

| Field | Type | Notes |
|---|---|---|
| `joined_at` | DateTimeField | Set on create to `timezone.now()`; migration backfill `created_at` |
| `left_at` | DateTimeField null | Null = currently assigned |

Drop `unique_together = ("user", "course")`. Add PostgreSQL partial unique:

```text
UNIQUE (user_id, course_id) WHERE left_at IS NULL
```

Multiple ended rows for the same pair are allowed. Two open rows are not.

**Managers**

- `objects` — `left_at__isnull=True` (current roster).
- `including_ended` — unfiltered.
- `Meta.base_manager_name = "including_ended"` so cascades, dumps, and Django internals still see closed rows.

Reverse FK `course.user_courses` / `user.user_courses` uses the **base** manager, so it includes ended rows. Any expansion that means “current roster” (course serializer `user_courses`, member counts, search filters that mean “assigned now”) must prefetch/filter `left_at__isnull=True` (or query through `UserCourse.objects`).

**Writes**

| Path | Teacher | Student |
|---|---|---|
| Roster save remove | Set `left_at=now`; do not delete | Delete |
| `UserCourse` DELETE | Same close | Delete |
| AI `execute_remove_staff` | Close | n/a |
| Substitute expiry cron | Close | n/a |
| Assign staff / create | New row, `joined_at=now`, `left_at=null` | Unchanged create |

Existing `already assigned` checks use `objects` (open only), so a teacher who left can be assigned again.

Closed rows: GET/PATCH/DELETE by id through the default manager looks like **not found**. Do not revive a closed row; re-assign inserts.

Role (`assigned_as_role`) and `hourly_rate` stay on the closed row (frozen at leave). `UserEvent` soft-delete on teacher remove is unchanged.

`CourseMembershipEvent` stays an audit log. Do not use it for the report. Keep existing event writes; do not add new membership-event writes in this work.

### 6.2 Teacher Courses API

Replace `POST reports/hr/teacher_courses` CSV with a dedicated view (same shape as Excellent Choice):

| Method | Path | Result |
|---|---|---|
| GET | `reports/teacher-courses?date_from=&date_to=` | JSON rows + column meta |
| POST | `reports/teacher-courses` body `date_from`, `date_to` | Excel download |

- Permission: `analytics.view`.
- Tenant: `Organization.report_style == TR_SU_STYLE`, else 403 (mirror Excellent Choice).
- Missing/invalid dates: 400.
- Source: `UserCourse.including_ended` with `assigned_as=TEACHER` overlapping the month.

**Overlap** (tenant calendar dates, inclusive):

```text
joined_at::date <= date_to
AND (left_at IS NULL OR left_at::date >= date_from)
```

Use the tenant timezone when converting datetimes to dates (same convention as other month reports).

Do **not** require `Course` effective status ACTIVE. A teacher who left a now-ended course in that month still belongs on the payroll list.

**Columns** (sheet and Excel, same order):

| Field | Meaning |
|---|---|
| name, email | User |
| course | Course title |
| course_type | Existing WD / WE / OTHER from course events |
| role | `assigned_as_role.name` or “No data” |
| course_start_date, course_end_date | Course span |
| joined_at, left_at | Assignment in/out; `left_at` empty if still assigned |
| course_id, user_id | Ids |

Empty overlap → `[]`, not an error.

`HR_REPORT_TYPES` after this: `payroll` only (Microsoft Payroll). Remove `teacher_courses`, `classes_data`, `mt_at_ratios`, `dropout_rates`.

### 6.3 Teacher Courses UI

- Route: `/finances/reports/teacher-courses`.
- Gate: `TR_SU_STYLE`; otherwise redirect to `/finances/reports` (or empty hub).
- Controls: `YearMonthSelector` → first/last day of month as `date_from` / `date_to` (query string, shareable).
- Grid: read-only Glide `DataSheet` following Excellent Choice (fullscreen shell, download Excel, copy link).
- Hub `/finances/reports`: still auto-redirect when `getTenantReportLinks` has exactly one item.

### 6.4 Nav and labels

`getTenantReportLinks`:

- `TR_SU_STYLE` → one link: `{ label: "Teacher Courses", href: "/finances/reports/teacher-courses" }`
- `EXCELLENT_CHOICE_STYLE` → unchanged Excellent Choice link
- else → `[]`

Replace static Analytics entry **Finance report** with:

- `teacher_courses` — label Teacher Courses, href above, `canShow` TR SU
- `excellent_choice` — existing Excellent Choice href, `canShow` EC

Insights **Reports** (`getReportsNavHref`) and the finance homepage button use the single link href and **that link’s label** (not “Finance report”).

### 6.5 Deletions

Remove:

- FE: `finances/reports/classes-data/page.tsx`, `TrSuReportType` extra keys, tests that expect four TR SU links
- BE: `get_classes_data_report`, `classes_data_sql`, HR branches for `classes_data` / `mt_at_ratios` / `dropout_rates`
- Stale teacher_courses CSV and classes_data sections in `schedjuice-reimagined-be/docs/HR_REPORT_VIEW.md` (leave payroll-only)

Keep: Shortcuts Course Data, `reports/hr/payroll`, Excellent Choice.

### 6.6 Grid width

Excellent Choice and Teacher Courses: `PageContainer width="full"` (drop the 1280px `wide` cap). Padding and finance rail unchanged. `SheetFullscreenShell` unchanged. No other sheets.

## 7. Errors

| Case | Response |
|---|---|
| Wrong `report_style` | 403 |
| Missing/invalid `date_from` / `date_to` | 400 |
| `date_from` > `date_to` | 400 |
| No `analytics.view` | existing RBAC 403 |
| Closed `UserCourse` id on live details | 404 |
| Second open row same user+course | IntegrityError / 400 at write |

FE: sheet load failure uses the same error treatment as Excellent Choice (message + retry, not a silent empty grid).

## 8. Testing

High-value only (auth, overlap, unique, nav). No happy-path “grid renders”.

**Roster**

- Teacher unassign sets `left_at`; row still in `including_ended`; absent from `objects`.
- Re-assign creates a second row; only one has `left_at` null.
- Partial unique: two open rows rejected.
- Student unassign still deletes.
- Course nested `user_courses` (or equivalent prefetch) does not include a closed teacher.
- Member counts / “already assigned” ignore closed rows.
- `UserEvent` still soft-deleted on teacher remove.

**Report**

- Teacher without `analytics.view` → 403.
- `EXCELLENT_CHOICE_STYLE` (or unset) → 403 on teacher-courses.
- Overlap: left mid-month included; left before month excluded; joined after month excluded; still-open included.
- Empty month → 200 and `[]`.
- Caller-contract: GET with only `date_from`/`date_to` (no extra body) returns rows.

**Nav / FE unit**

- TR SU: `getTenantReportLinks` length 1, Teacher Courses href; `getReportsNavHref` is that href.
- EC unchanged; unset style empty.
- `visibleFinanceRecordEntries` Analytics shows Teacher Courses for TR SU, not “Finance report”, and not Classes Data.

Do not add field-presence-only TypeScript tests.

## 9. Migration / rollout

1. Add columns; backfill `joined_at = created_at`; `left_at` null.
2. Remove old unique_together; create partial unique index.
3. Deploy write-path close-on-unassign **with** active manager and serializer filters in the same release (otherwise course pages show former teachers).
4. Then ship Teacher Courses API/UI and deletions.

No data backfill for teachers deleted before this ships.

## 10. Out of scope (explicit)

- Student assignment intervals
- Recalculating historical payroll amounts
- Restoring pre-migration unassigns
- Classes Data Excel parity with Course Data
