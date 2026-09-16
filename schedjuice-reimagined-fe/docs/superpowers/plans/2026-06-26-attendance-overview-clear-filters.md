# Attendance Overview Clear Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Clear filters action to Attendance Overview and show explicit empty copy when a filtered course has no scheduled sessions that day.

**Architecture:** Backend adds `has_scheduled_sessions` to daily and course-gap summaries when `course_id` is set. Frontend adds filter-state helpers, a batch reset handler on the god-view page, a header button in the Filters card, and contextual empty states in table components.

**Tech Stack:** Django (`app_attendance.god_view_services`), Django tests, Next.js, `nuqs`, Vitest, existing shadcn UI components.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-26-attendance-overview-clear-filters-design.md`

---

## File Structure

Backend:

- Modify `schedjuice-reimagined-be/app_attendance/god_view_services.py` — attach `has_scheduled_sessions` to daily and course-gap summaries.
- Modify `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py` — six new assertions across two test methods.

Frontend:

- Modify `schedjuice-reimagined-fe/src/types/attendance-god-view.ts` — optional summary field.
- Modify `schedjuice-reimagined-fe/src/helpers/attendance-god-view.ts` — `hasActiveOptionalFilters`, updated empty-message helpers.
- Create `schedjuice-reimagined-fe/src/helpers/attendance-god-view.test.ts` — unit tests for helpers.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/attendances/god-view/page.tsx` — `clearOptionalFilters`, wire props.
- Modify `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-filters.tsx` — header Clear button.
- Modify `schedjuice-reimagined-fe/src/components/attendance-god-view/daily-absences-table.tsx` — summary-aware empty + clear link.
- Modify `schedjuice-reimagined-fe/src/components/attendance-god-view/course-marking-gaps-table.tsx` — same.
- Modify `schedjuice-reimagined-fe/src/components/attendance-god-view/monthly-student-summary-table.tsx` — clear link only.
- Modify `schedjuice-reimagined-fe/src/components/attendance-god-view/risk-overview-table.tsx` — clear link only.

---

### Task 1: Backend — daily `has_scheduled_sessions` tests

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`
- Test: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add failing test for course with no events today**

Append to `GodViewServicesTest`:

```python
def test_daily_summary_has_scheduled_sessions_false_when_course_has_no_events(self):
    with schema_context(self.schema_name):
        empty_course = Course.objects.create(
            title=f"Empty {uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        UserCourse.objects.get_or_create(
            user=self.student,
            course=empty_course,
            defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
        )
        filters = GodViewFilters(
            date_from=self.today,
            date_to=self.today,
            course_id=empty_course.id,
        )
        summary, rows = build_daily_absence_rows(filters)

    self.assertEqual(rows, [])
    self.assertIs(summary.get("has_scheduled_sessions"), False)

def test_daily_summary_has_scheduled_sessions_true_when_course_has_events(self):
    with schema_context(self.schema_name):
        Event.objects.create(
            title="Today session",
            course=self.course,
            date=timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            ),
            time_from=datetime.strptime("14:00", "%H:%M").time(),
            time_to=datetime.strptime("15:00", "%H:%M").time(),
        )
        filters = GodViewFilters(
            date_from=self.today,
            date_to=self.today,
            course_id=self.course.id,
        )
        summary, rows = build_daily_absence_rows(filters)

    self.assertGreater(len(rows), 0)
    self.assertIs(summary.get("has_scheduled_sessions"), True)

def test_daily_summary_omits_has_scheduled_sessions_without_course_filter(self):
    filters = GodViewFilters(date_from=self.today, date_to=self.today)
    with schema_context(self.schema_name):
        summary, _rows = build_daily_absence_rows(filters)

    self.assertNotIn("has_scheduled_sessions", summary)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-be && python manage.py test app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_summary_has_scheduled_sessions_false_when_course_has_no_events app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_summary_has_scheduled_sessions_true_when_course_has_events app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_summary_omits_has_scheduled_sessions_without_course_filter -v 2`

Expected: FAIL — `has_scheduled_sessions` missing or wrong.

---

### Task 2: Backend — daily summary implementation

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`

- [ ] **Step 1: Add helper to attach course session flag**

After `_build_daily_summary`, add:

```python
def _with_scheduled_sessions_flag(
    summary: Dict[str, Any],
    filters: GodViewFilters,
    has_events: Optional[bool],
) -> Dict[str, Any]:
    if filters.course_id is None:
        return summary
    summary["has_scheduled_sessions"] = bool(has_events)
    return summary
```

- [ ] **Step 2: Set flag on daily early return when events list is empty**

In `build_daily_absence_rows`, replace:

```python
    if not events:
        return _build_daily_summary([], filters), []
```

with:

```python
    if not events:
        summary = _build_daily_summary([], filters)
        return _with_scheduled_sessions_flag(summary, filters, False), []
```

- [ ] **Step 3: Set flag on successful daily build**

Before the final `return summary, rows` in `build_daily_absence_rows` (after status filter), wrap summary:

```python
    summary = _with_scheduled_sessions_flag(summary, filters, True)
    return summary, rows
```

- [ ] **Step 4: Run daily tests**

Run: `cd schedjuice-reimagined-be && python manage.py test app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_summary_has_scheduled_sessions_false_when_course_has_no_events app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_summary_has_scheduled_sessions_true_when_course_has_events app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_summary_omits_has_scheduled_sessions_without_course_filter -v 2`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_attendance/god_view_services.py app_attendance/tests/test_god_view_services.py
git commit -m "feat(attendance): expose has_scheduled_sessions on daily god-view summary"
```

---

### Task 3: Backend — course marking gaps `has_scheduled_sessions` tests

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add failing tests**

Append to `GodViewServicesTest`:

```python
def test_course_marking_gap_summary_has_scheduled_sessions_false(self):
    with schema_context(self.schema_name):
        empty_course = Course.objects.create(
            title=f"Gap empty {uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        filters = GodViewFilters(
            date_from=self.today,
            date_to=self.today,
            course_id=empty_course.id,
            problem_status=CourseMarkingProblemStatus.NOT_MARKED,
        )
        summary, rows = build_course_marking_gap_rows(filters)

    self.assertEqual(rows, [])
    self.assertIs(summary.get("has_scheduled_sessions"), False)

def test_course_marking_gap_summary_has_scheduled_sessions_true(self):
    with schema_context(self.schema_name):
        Event.objects.create(
            title="Gap today",
            course=self.course,
            date=timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            ),
            time_from=datetime.strptime("17:00", "%H:%M").time(),
            time_to=datetime.strptime("18:00", "%H:%M").time(),
        )
        filters = GodViewFilters(
            date_from=self.today,
            date_to=self.today,
            course_id=self.course.id,
            problem_status=CourseMarkingProblemStatus.ALL,
            min_rate=None,
        )
        summary, rows = build_course_marking_gap_rows(filters)

    self.assertGreater(len(rows), 0)
    self.assertIs(summary.get("has_scheduled_sessions"), True)

def test_course_marking_gap_summary_omits_flag_without_course_filter(self):
    filters = GodViewFilters(
        date_from=self.today,
        date_to=self.today,
        problem_status=CourseMarkingProblemStatus.ALL,
        min_rate=None,
    )
    with schema_context(self.schema_name):
        summary, _rows = build_course_marking_gap_rows(filters)

    self.assertNotIn("has_scheduled_sessions", summary)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-be && python manage.py test app_attendance.tests.test_god_view_services.GodViewServicesTest.test_course_marking_gap_summary_has_scheduled_sessions_false app_attendance.tests.test_god_view_services.GodViewServicesTest.test_course_marking_gap_summary_has_scheduled_sessions_true app_attendance.tests.test_god_view_services.GodViewServicesTest.test_course_marking_gap_summary_omits_flag_without_course_filter -v 2`

Expected: FAIL

---

### Task 4: Backend — course marking gaps implementation

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`

- [ ] **Step 1: Update empty course-gap summary helper**

Change `_empty_course_marking_gap_summary` to accept optional flag:

```python
def _empty_course_marking_gap_summary(
    filters: GodViewFilters,
    *,
    has_scheduled_sessions: Optional[bool] = None,
) -> Dict[str, Any]:
    day = filters.date_from.isoformat()
    summary = {
        "courses_affected_count": 0,
        "not_marked_slots_count": 0,
        "worst_course": None,
        "date_from": day,
        "date_to": day,
    }
    if filters.course_id is not None and has_scheduled_sessions is not None:
        summary["has_scheduled_sessions"] = has_scheduled_sessions
    return summary
```

- [ ] **Step 2: Set flag when no events in course marking gaps**

In `build_course_marking_gap_rows`, replace:

```python
    if not events_by_course:
        return _empty_course_marking_gap_summary(filters), []
```

with:

```python
    if not events_by_course:
        return (
            _empty_course_marking_gap_summary(
                filters,
                has_scheduled_sessions=False if filters.course_id else None,
            ),
            [],
        )
```

- [ ] **Step 3: Set flag on successful course-gap build**

Before `return summary, rows` at end of `build_course_marking_gap_rows`:

```python
    summary = _with_scheduled_sessions_flag(summary, filters, True)
    return summary, rows
```

- [ ] **Step 4: Run course-gap tests**

Run: `cd schedjuice-reimagined-be && python manage.py test app_attendance.tests.test_god_view_services.GodViewServicesTest.test_course_marking_gap_summary_has_scheduled_sessions_false app_attendance.tests.test_god_view_services.GodViewServicesTest.test_course_marking_gap_summary_has_scheduled_sessions_true app_attendance.tests.test_god_view_services.GodViewServicesTest.test_course_marking_gap_summary_omits_flag_without_course_filter -v 2`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_attendance/god_view_services.py app_attendance/tests/test_god_view_services.py
git commit -m "feat(attendance): expose has_scheduled_sessions on course-gap summary"
```

---

### Task 5: Frontend types

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/attendance-god-view.ts`

- [ ] **Step 1: Extend summary types**

Add to `AttendanceGodViewDailySummary` and `AttendanceGodViewCourseGapSummary`:

```ts
  has_scheduled_sessions?: boolean | null;
```

- [ ] **Step 2: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/types/attendance-god-view.ts
git commit -m "feat(attendance): add has_scheduled_sessions to god-view summary types"
```

---

### Task 6: Frontend helpers and unit tests

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/attendance-god-view.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/attendance-god-view.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/helpers/attendance-god-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getCourseMarkingGapsEmptyMessage,
  getDailyAbsencesEmptyMessage,
  hasActiveOptionalFilters,
} from "@/helpers/attendance-god-view";
import {
  CourseMarkingProblemStatus,
  DailyAttendanceStatusFilter,
} from "@/types/attendance-god-view";

const baseParams = {
  courseId: "",
  categoryId: "",
  programId: "",
  studentId: "",
  minRate: "",
  maxRate: "",
  sort: "attendance_rate_asc",
  gapMinRate: "80",
  problemStatus: CourseMarkingProblemStatus.NotMarked,
  includeDroppedOut: false,
};

describe("hasActiveOptionalFilters", () => {
  it("returns false when all defaults", () => {
    expect(hasActiveOptionalFilters("daily_absences", baseParams)).toBe(false);
  });

  it("returns true when course is selected", () => {
    expect(
      hasActiveOptionalFilters("daily_absences", {
        ...baseParams,
        courseId: "42",
      }),
    ).toBe(true);
  });

  it("returns true when gap min rate differs on course marking gaps", () => {
    expect(
      hasActiveOptionalFilters("course_marking_gaps", {
        ...baseParams,
        gapMinRate: "90",
      }),
    ).toBe(true);
  });
});

describe("getDailyAbsencesEmptyMessage", () => {
  it("prioritizes no scheduled sessions for filtered course", () => {
    expect(
      getDailyAbsencesEmptyMessage(null, {
        has_scheduled_sessions: false,
      }),
    ).toBe("This course has no scheduled sessions on this day.");
  });

  it("keeps status filter message when sessions exist", () => {
    expect(
      getDailyAbsencesEmptyMessage(DailyAttendanceStatusFilter.Absent, {
        has_scheduled_sessions: true,
      }),
    ).toBe("No absent students for this day.");
  });
});

describe("getCourseMarkingGapsEmptyMessage", () => {
  it("prioritizes no scheduled sessions for filtered course", () => {
    expect(
      getCourseMarkingGapsEmptyMessage("80", CourseMarkingProblemStatus.NotMarked, {
        has_scheduled_sessions: false,
      }),
    ).toBe("This course has no scheduled sessions on this day.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/attendance-god-view.test.ts`

Expected: FAIL — exports/signature mismatch.

- [ ] **Step 3: Implement helpers**

In `src/helpers/attendance-god-view.ts`, add:

```ts
import type {
  AttendanceGodViewCourseGapSummary,
  AttendanceGodViewDailySummary,
  AttendanceGodViewMode,
} from "@/types/attendance-god-view";

export type GodViewOptionalFilterParams = {
  courseId: string;
  categoryId: string;
  programId: string;
  studentId: string;
  minRate: string;
  maxRate: string;
  sort: string;
  gapMinRate: string;
  problemStatus: string;
  includeDroppedOut: boolean;
};

const NO_COURSE_SESSIONS_MESSAGE =
  "This course has no scheduled sessions on this day.";

export function hasActiveOptionalFilters(
  mode: AttendanceGodViewMode,
  params: GodViewOptionalFilterParams,
): boolean {
  const shared =
    params.courseId !== "" ||
    params.categoryId !== "" ||
    params.programId !== "" ||
    params.includeDroppedOut;

  if (shared) return true;

  if (mode === "risk") {
    return (
      params.studentId !== "" ||
      params.minRate !== "" ||
      params.maxRate !== "" ||
      params.sort !== "attendance_rate_asc"
    );
  }

  if (mode === "course_marking_gaps") {
    return (
      params.gapMinRate !== "80" ||
      params.problemStatus !== CourseMarkingProblemStatus.NotMarked
    );
  }

  return false;
}
```

Update `getDailyAbsencesEmptyMessage`:

```ts
export function getDailyAbsencesEmptyMessage(
  statusFilter: DailyAttendanceStatusFilter | null,
  summary?: Pick<AttendanceGodViewDailySummary, "has_scheduled_sessions"> | null,
): string {
  if (summary?.has_scheduled_sessions === false) {
    return NO_COURSE_SESSIONS_MESSAGE;
  }
  if (!statusFilter) {
    return "No attendance records for this day.";
  }
  return `No ${getAttendanceGodViewStatusLabel(statusFilter).toLowerCase()} students for this day.`;
}
```

Update `getCourseMarkingGapsEmptyMessage`:

```ts
export function getCourseMarkingGapsEmptyMessage(
  gapMinRate: string,
  problemStatus: string,
  summary?: Pick<AttendanceGodViewCourseGapSummary, "has_scheduled_sessions"> | null,
): string {
  if (summary?.has_scheduled_sessions === false) {
    return NO_COURSE_SESSIONS_MESSAGE;
  }
  if (gapMinRate) {
    return `No courses exceed ${gapMinRate}% for the selected problem type on this day.`;
  }
  return "No scheduled attendance for this day.";
}
```

- [ ] **Step 4: Run tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/attendance-god-view.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/attendance-god-view.ts src/helpers/attendance-god-view.test.ts
git commit -m "feat(attendance): add god-view filter helpers and empty messages"
```

---

### Task 7: Filters card Clear button and page handler

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/attendances/god-view/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-filters.tsx`

- [ ] **Step 1: Add `clearOptionalFilters` and `hasActiveFilters` to page**

In `god-view/page.tsx`, import `hasActiveOptionalFilters` and add:

```tsx
  const optionalFilterParams = useMemo(
    () => ({
      courseId,
      categoryId,
      programId,
      studentId,
      minRate,
      maxRate,
      sort,
      gapMinRate,
      problemStatus,
      includeDroppedOut: includeDroppedOut === "true",
    }),
    [
      courseId,
      categoryId,
      programId,
      studentId,
      minRate,
      maxRate,
      sort,
      gapMinRate,
      problemStatus,
      includeDroppedOut,
    ],
  );

  const hasActiveFilters = hasActiveOptionalFilters(
    activeMode,
    optionalFilterParams,
  );

  const clearOptionalFilters = () => {
    void setCourseId("");
    void setCategoryId("");
    void setProgramId("");
    void setStudentId("");
    void setMinRate("");
    void setMaxRate("");
    void setIncludeDroppedOut("false");
    void setSort("attendance_rate_asc");
    void setGapMinRate("80");
    void setProblemStatus(CourseMarkingProblemStatus.NotMarked);
    void setPage(1);
  };
```

- [ ] **Step 2: Update Filters card header in page**

Replace:

```tsx
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
```

with:

```tsx
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Filters</CardTitle>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearOptionalFilters}>
              Clear filters
            </Button>
          ) : null}
        </CardHeader>
```

Pass to `AttendanceGodViewFilters` if needed (header is on page — no filter component change required for button).

- [ ] **Step 3: Pass clear props to tables (prepare wiring)**

Add props when rendering tables (exact values filled in Task 8):

```tsx
hasActiveFilters={hasActiveFilters}
onClearFilters={clearOptionalFilters}
summary={...}
```

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/(internal)/attendances/god-view/page.tsx
git commit -m "feat(attendance): add clear optional filters handler on god-view page"
```

---

### Task 8: Table empty states

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/attendance-god-view/daily-absences-table.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/attendance-god-view/course-marking-gaps-table.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/attendance-god-view/monthly-student-summary-table.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/attendance-god-view/risk-overview-table.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/attendances/god-view/page.tsx`

- [ ] **Step 1: Add shared empty cell helper inline in each table**

For `daily-absences-table.tsx`, extend Props:

```tsx
type Props = {
  rows: AttendanceGodViewDailyRow[];
  statusFilter?: DailyAttendanceStatusFilter | null;
  summary?: Pick<AttendanceGodViewDailySummary, "has_scheduled_sessions"> | null;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onOpenDetail: (row: AttendanceGodViewDailyRow) => void;
};
```

Replace empty row body:

```tsx
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              <div className="space-y-2 py-2">
                <p>{getDailyAbsencesEmptyMessage(statusFilter, summary)}</p>
                {hasActiveFilters && onClearFilters ? (
                  <Button variant="link" size="sm" onClick={onClearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ) : (
```

- [ ] **Step 2: Update course-marking-gaps-table similarly**

```tsx
type Props = {
  rows: AttendanceGodViewCourseGapRow[];
  gapMinRate: string;
  problemStatus: string;
  summary?: Pick<AttendanceGodViewCourseGapSummary, "has_scheduled_sessions"> | null;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onOpenDetail: (row: AttendanceGodViewCourseGapRow) => void;
};
```

Empty cell:

```tsx
<p>
  {getCourseMarkingGapsEmptyMessage(gapMinRate, problemStatus, summary)}
</p>
```

Plus the same Clear filters link block.

- [ ] **Step 3: Add clear link to monthly and risk tables**

For monthly empty row, wrap existing message with optional Clear filters button using `hasActiveFilters` / `onClearFilters` props (no summary change).

For risk empty row, same pattern with message `"No student-course pairs match these filters."`.

- [ ] **Step 4: Wire props from page**

In `page.tsx`:

```tsx
<DailyAbsencesTable
  rows={dailyRows}
  statusFilter={dailyStatusFilter}
  summary={dailyData?.data?.summary}
  hasActiveFilters={hasActiveFilters}
  onClearFilters={clearOptionalFilters}
  onOpenDetail={openDailyDetail}
/>

<CourseMarkingGapsTable
  rows={courseGapRows}
  gapMinRate={gapMinRate}
  problemStatus={problemStatus}
  summary={courseGapData?.data?.summary}
  hasActiveFilters={hasActiveFilters}
  onClearFilters={clearOptionalFilters}
  onOpenDetail={openCourseGapDetail}
/>

<MonthlyStudentSummaryTable
  rows={monthlyRows}
  hasActiveFilters={hasActiveFilters}
  onClearFilters={clearOptionalFilters}
  onOpenDetail={openMonthlyDetail}
/>

<RiskOverviewTable
  rows={riskRows}
  hasActiveFilters={hasActiveFilters}
  onClearFilters={clearOptionalFilters}
  onOpenDetail={openRiskDetail}
/>
```

Ensure `courseGapData` / `dailyData` variable names match existing page destructuring.

- [ ] **Step 5: Run frontend checks**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/attendance-god-view.test.ts && npm run lint`

Expected: PASS / no new lint errors.

- [ ] **Step 6: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/attendance-god-view/*.tsx src/app/(internal)/attendances/god-view/page.tsx
git commit -m "feat(attendance): clear filters UI and course empty states on god-view"
```

---

### Task 9: Manual smoke verification

- [ ] **Step 1: Daily absences — no sessions message**

Open `/attendances/god-view?mode=daily_absences`. Pick a course with no sessions on the selected day. Confirm empty table shows: *This course has no scheduled sessions on this day.*

- [ ] **Step 2: Clear filters preserves tab and date**

Apply course + category filters. Click **Clear filters** in header. Confirm course/category cleared, tab and date unchanged, page reset to 1.

- [ ] **Step 3: Summary chip not cleared**

Click **Absent** summary card. Click **Clear filters**. Confirm chip stays active; only optional combobox filters reset.

- [ ] **Step 4: Course marking gaps**

Switch to Course marking gaps tab, filter to same empty course. Confirm same no-sessions message.

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Clear optional filters only | Task 7 |
| Keep tab + date | Task 7, 9 |
| Header + empty-state Clear button | Task 7, 8 |
| `has_scheduled_sessions` backend | Tasks 1–4 |
| Daily + gaps empty copy | Tasks 6, 8 |
| Monthly/risk clear link only | Task 8 |
| Backend tests | Tasks 1, 3 |
| Frontend helper tests | Task 6 |
