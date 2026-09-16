# Course Marking Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Course marking gaps** tab to Attendance Overview that shows one row per course per day, default-filtered to courses with >80% not-marked attendance, with dominant-problem status filtering and a student drill-down sheet.

**Architecture:** Extend `god_view_services.py` with `build_course_marking_gap_rows` and `build_course_marking_gap_detail`, wired through the existing god-view search/detail views via `mode=course_marking_gaps`. Frontend adds a fourth tab with tab-specific filters (`problemStatus`, `minRate`) and three new components.

**Tech Stack:** Django (`app_attendance`), Next.js App Router, React Query, `nuqs`, existing shadcn-style UI.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-26-course-marking-gaps-design.md`

---

## File Structure

Backend:

- Modify `schedjuice-reimagined-be/app_attendance/god_view_services.py` — enums, filter fields, builders, CSV headers, dominant-problem helpers.
- Modify `schedjuice-reimagined-be/app_attendance/views.py` — route `course_marking_gaps` mode in search + detail views.
- Modify `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py` — service tests.

Frontend:

- Modify `schedjuice-reimagined-fe/src/types/attendance-god-view.ts` — mode, row, summary, request types.
- Create `schedjuice-reimagined-fe/src/components/attendance-god-view/course-marking-gaps-table.tsx`
- Create `schedjuice-reimagined-fe/src/components/attendance-god-view/course-marking-gaps-summary-cards.tsx`
- Create `schedjuice-reimagined-fe/src/components/attendance-god-view/course-marking-gap-detail-sheet.tsx`
- Modify `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-filters.tsx` — problem type + min rate for new mode.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/attendances/god-view/page.tsx` — tab, query params, queries, detail wiring.

---

### Task 1: Backend filter fields and enums

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`
- Test: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add failing test for filter parsing defaults**

Append to `test_god_view_services.py`:

```python
from app_attendance.god_view_services import (
    CourseMarkingProblemStatus,
    parse_god_view_filters,
    build_course_marking_gap_rows,
)

def test_parse_god_view_filters_course_marking_defaults(self):
    filters = parse_god_view_filters(
        {"mode": "course_marking_gaps"},
        {},
    )
    self.assertEqual(filters.problem_status, CourseMarkingProblemStatus.NOT_MARKED)
    self.assertEqual(filters.min_rate, 80.0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-be && python manage.py test app_attendance.tests.test_god_view_services.GodViewServicesTest.test_parse_god_view_filters_course_marking_defaults -v 2`

Expected: FAIL — `CourseMarkingProblemStatus` or fields missing.

- [ ] **Step 3: Add enum and GodViewFilters fields**

In `god_view_services.py`, after `DailyAttendanceStatusFilter`:

```python
class CourseMarkingProblemStatus(str, Enum):
    NOT_MARKED = "not_marked"
    ABSENT = "absent"
    LATE = "late"
    PRESENT = "present"
    ALL = "all"


DOMINANT_PROBLEM_ORDER = (
    "not_marked",
    UserEvent.AttendanceStatus.ABSENT,
    UserEvent.AttendanceStatus.LATE,
    UserEvent.AttendanceStatus.PRESENT,
)
```

Add to `GodViewFilters`:

```python
problem_status: CourseMarkingProblemStatus = CourseMarkingProblemStatus.NOT_MARKED
min_rate: Optional[float] = None
```

Update `parse_god_view_filters` to parse `problem_status` and `min_rate` from body/query params. When `body.get("mode") == "course_marking_gaps"` and `min_rate` is omitted, default to `80.0`.

Add helper:

```python
def _parse_problem_status(value) -> CourseMarkingProblemStatus:
    if value is None or value == "":
        return CourseMarkingProblemStatus.NOT_MARKED
    try:
        return CourseMarkingProblemStatus(str(value))
    except ValueError:
        return CourseMarkingProblemStatus.NOT_MARKED
```

- [ ] **Step 4: Run test to verify it passes**

Run same test command. Expected: PASS.

---

### Task 2: Backend aggregation service tests

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add failing aggregation test**

```python
def test_course_marking_gap_rows_default_80_percent_filter(self):
    with schema_context(self.schema_name):
        extra_students = []
        for i in range(4):
            user = User.objects.create(
                email=f"stu_gap_{uuid4().hex[:6]}@test.com",
                name=f"Gap Student {i}",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=user,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            extra_students.append(user)

        event = Event.objects.create(
            title="Gap Session",
            course=self.course,
            date=timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            ),
            time_from=datetime.strptime("15:00", "%H:%M").time(),
            time_to=datetime.strptime("16:00", "%H:%M").time(),
        )
        # 1 present (self.student), 4 unmarked => 80% not marked exactly
        UserEvent.objects.update_or_create(
            user=self.student,
            event=event,
            defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
        )

        filters = GodViewFilters(
            date_from=self.today,
            date_to=self.today,
            min_rate=80.0,
            problem_status=CourseMarkingProblemStatus.NOT_MARKED,
        )
        summary, rows = build_course_marking_gap_rows(filters)

    self.assertEqual(len(rows), 1)
    row = rows[0]
    self.assertEqual(row["course_id"], self.course.id)
    self.assertEqual(row["scheduled_count"], 5)
    self.assertEqual(row["present_count"], 1)
    self.assertEqual(row["not_marked_count"], 4)
    self.assertEqual(row["not_marked_rate"], 80.0)
    self.assertEqual(summary["courses_affected_count"], 1)
```

- [ ] **Step 2: Add failing test for unregistered + unmarked combined**

```python
def test_course_marking_gap_counts_unregistered_and_unmarked(self):
    with schema_context(self.schema_name):
        event = Event.objects.create(
            title="Mixed Session",
            course=self.course,
            date=timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            ),
            time_from=datetime.strptime("16:00", "%H:%M").time(),
            time_to=datetime.strptime("17:00", "%H:%M").time(),
        )
        UserEvent.objects.update_or_create(
            user=self.student,
            event=event,
            defaults={"attendance_status": UserEvent.AttendanceStatus.UNREGISTERED},
        )

        filters = GodViewFilters(
            date_from=self.today,
            date_to=self.today,
            min_rate=None,
            problem_status=CourseMarkingProblemStatus.ALL,
        )
        _summary, rows = build_course_marking_gap_rows(filters)

    row = next(r for r in rows if r["course_id"] == self.course.id)
    self.assertGreaterEqual(row["not_marked_count"], 1)
```

- [ ] **Step 3: Add failing test for dominant absent filter**

Create a second course where absent is dominant and rate >= 50%; verify `problem_status=ABSENT` + `min_rate=50` returns it but not the not-marked-only course.

- [ ] **Step 4: Run tests — expect FAIL**

Run: `cd schedjuice-reimagined-be && python manage.py test app_attendance.tests.test_god_view_services -v 2`

---

### Task 3: Implement `build_course_marking_gap_rows`

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`

- [ ] **Step 1: Add status bucket helpers**

```python
def _session_status(ue: Optional[UserEvent]) -> str:
    if ue is None:
        return "unmarked"
    return ue.attendance_status


def _is_not_marked_status(status: str) -> bool:
    return status == "unmarked" or status == UNREGISTERED_STATUS


def _dominant_problem(counts: Dict[str, int]) -> str:
    buckets = {
        "not_marked": counts["not_marked"],
        UserEvent.AttendanceStatus.ABSENT: counts["absent"],
        UserEvent.AttendanceStatus.LATE: counts["late"],
        UserEvent.AttendanceStatus.PRESENT: counts["present"],
    }
    max_count = max(buckets.values())
    for key in DOMINANT_PROBLEM_ORDER:
        if buckets[key] == max_count:
            return key if key != UNREGISTERED_STATUS else "not_marked"
    return "not_marked"


def _passes_course_marking_filters(
    row: Dict[str, Any],
    filters: GodViewFilters,
) -> bool:
    scheduled = row["scheduled_count"]
    if scheduled == 0:
        return False

    def rate(count_key: str) -> float:
        return (row[count_key] / scheduled) * 100

    problem = filters.problem_status
    min_rate = filters.min_rate

    if problem == CourseMarkingProblemStatus.NOT_MARKED:
        if min_rate is not None and rate("not_marked_count") < min_rate:
            return False
        return True

    if problem == CourseMarkingProblemStatus.ALL:
        if min_rate is not None and rate("not_marked_count") < min_rate:
            return False
        return True

    dominant = row["dominant_problem"]
    status_key = {
        CourseMarkingProblemStatus.ABSENT: "absent_count",
        CourseMarkingProblemStatus.LATE: "late_count",
        CourseMarkingProblemStatus.PRESENT: "present_count",
    }[problem]
    expected_dominant = {
        CourseMarkingProblemStatus.ABSENT: UserEvent.AttendanceStatus.ABSENT,
        CourseMarkingProblemStatus.LATE: UserEvent.AttendanceStatus.LATE,
        CourseMarkingProblemStatus.PRESENT: UserEvent.AttendanceStatus.PRESENT,
    }[problem]
    if dominant != expected_dominant:
        return False
    if min_rate is not None and rate(status_key) < min_rate:
        return False
    return True
```

- [ ] **Step 2: Implement builder**

Reuse roster/event loading from `build_daily_absence_rows`. Aggregate per `course_id`:

```python
def build_course_marking_gap_rows(
    filters: GodViewFilters,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    day = filters.date_from
    if filters.date_to != filters.date_from:
        filters = GodViewFilters(**{**filters.__dict__, "date_to": day})

    # ... load courses, roster, events for single day (reuse existing helpers) ...

    rows: List[Dict[str, Any]] = []
    for course_id, course_events in events_by_course.items():
        counts = {"present": 0, "late": 0, "absent": 0, "not_marked": 0}
        for ev in course_events:
            for uc in roster_by_course.get(course_id, []):
                ue = day_ue_by_user_event.get((uc.user_id, ev.id))
                status = _session_status(ue)
                if status == UserEvent.AttendanceStatus.PRESENT:
                    counts["present"] += 1
                elif status == UserEvent.AttendanceStatus.LATE:
                    counts["late"] += 1
                elif status in ABSENT_STATUSES:
                    counts["absent"] += 1
                elif _is_not_marked_status(status):
                    counts["not_marked"] += 1

        scheduled = sum(counts.values())
        if scheduled == 0:
            continue

        course = course_events[0].course
        not_marked_rate = round((counts["not_marked"] / scheduled) * 100, 2)
        row = {
            "course_id": course_id,
            "course_title": course.title,
            "course_code": course.code or "",
            "category_id": course.category_id,
            "category_name": course.category.name if course.category_id else "",
            "program_id": course.program_id,
            "program_name": course.program.name if course.program_id else "",
            "event_date": day.isoformat(),
            "scheduled_count": scheduled,
            "present_count": counts["present"],
            "late_count": counts["late"],
            "absent_count": counts["absent"],
            "not_marked_count": counts["not_marked"],
            "not_marked_rate": not_marked_rate,
            "dominant_problem": _dominant_problem(counts),
        }
        if _passes_course_marking_filters(row, filters):
            rows.append(row)

    rows.sort(key=lambda r: (-r["not_marked_rate"], r["course_title"].lower()))
    summary = _build_course_marking_gap_summary(rows, filters)
    return summary, rows
```

Add `_build_course_marking_gap_summary` returning `courses_affected_count`, `not_marked_slots_count`, `worst_course`, `date_from`, `date_to`.

- [ ] **Step 3: Run backend tests**

Run: `cd schedjuice-reimagined-be && python manage.py test app_attendance.tests.test_god_view_services -v 2`

Expected: all new tests PASS.

---

### Task 4: Wire search view and CSV

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/views.py`
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`

- [ ] **Step 1: Add CSV headers**

```python
COURSE_MARKING_GAP_CSV_HEADERS = [
    "course_id",
    "course_title",
    "course_code",
    "event_date",
    "scheduled_count",
    "present_count",
    "late_count",
    "absent_count",
    "not_marked_count",
    "not_marked_rate",
    "dominant_problem",
]
```

- [ ] **Step 2: Add search mode branch in `AttendanceGodViewSearchView.post`**

```python
elif mode == "course_marking_gaps":
    summary, rows = build_course_marking_gap_rows(filters)
    csv_headers = COURSE_MARKING_GAP_CSV_HEADERS
    csv_filename = f"attendance-course-marking-gaps-{filters.date_from.isoformat()}.csv"
```

Import `build_course_marking_gap_rows` at top of `views.py`.

- [ ] **Step 3: Smoke test via Django shell or API test**

Run god view RBAC test still passes:

`cd schedjuice-reimagined-be && python manage.py test app_attendance.tests.test_rbac_attendance -v 2`

---

### Task 5: Course marking gap detail endpoint

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`
- Modify: `schedjuice-reimagined-be/app_attendance/views.py`
- Modify: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add failing detail test**

```python
def test_course_marking_gap_detail_returns_not_marked_students(self):
    with schema_context(self.schema_name):
        event = Event.objects.create(
            title="Detail Session",
            course=self.course,
            date=timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            ),
            time_from=datetime.strptime("17:00", "%H:%M").time(),
            time_to=datetime.strptime("18:00", "%H:%M").time(),
        )
        filters = GodViewFilters(date_from=self.today, date_to=self.today)
        records = build_course_marking_gap_detail(
            self.course.id,
            filters,
            CourseMarkingProblemStatus.NOT_MARKED,
        )
    self.assertTrue(any(r["attendance_status"] in ("unmarked", UNREGISTERED_STATUS) for r in records))
```

- [ ] **Step 2: Implement `build_course_marking_gap_detail`**

Build student-session rows for one course-day (reuse daily row shape from `build_daily_absence_rows` loop). Filter rows where status matches `problem_status`:

- `NOT_MARKED`: `_is_not_marked_status(status)`
- `ABSENT` / `LATE` / `PRESENT`: exact status match
- `ALL`: return all statuses

- [ ] **Step 3: Extend `AttendanceGodViewDetailView.get`**

When `mode=course_marking_gaps`:

```python
if mode == "course_marking_gaps":
    try:
        course_id = int(request.query_params.get("course_id", ""))
    except ValueError:
        return self.bad_request("course_id is required.")
    problem_status = _parse_problem_status(request.query_params.get("problem_status"))
    records = build_course_marking_gap_detail(course_id, filters, problem_status)
    # CSV + JSON response
```

- [ ] **Step 4: Run tests — expect PASS**

---

### Task 6: Frontend types

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/attendance-god-view.ts`

- [ ] **Step 1: Extend mode and add types**

```typescript
export type AttendanceGodViewMode =
  | "daily_absences"
  | "course_marking_gaps"
  | "monthly_students"
  | "risk";

export enum CourseMarkingProblemStatus {
  NotMarked = "not_marked",
  Absent = "absent",
  Late = "late",
  Present = "present",
  All = "all",
}

export type AttendanceGodViewCourseGapRow = {
  course_id: number;
  course_title: string;
  course_code: string;
  category_id: number | null;
  category_name: string;
  program_id: number | null;
  program_name: string;
  event_date: string;
  scheduled_count: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  not_marked_count: number;
  not_marked_rate: number;
  dominant_problem: string;
};

export type AttendanceGodViewCourseGapSummary = {
  courses_affected_count: number;
  not_marked_slots_count: number;
  worst_course: {
    course_id: number;
    course_title: string;
    not_marked_rate: number;
  } | null;
  date_from: string;
  date_to: string;
};

export type AttendanceGodViewCourseGapSearchResponse = {
  isError: boolean;
  message: string;
  data: {
    summary: AttendanceGodViewCourseGapSummary;
    results: AttendanceGodViewCourseGapRow[];
  };
  page: number;
  size: number;
  count: number;
};
```

Extend `AttendanceGodViewSearchBody`:

```typescript
problem_status?: CourseMarkingProblemStatus;
min_rate?: number | string;
```

- [ ] **Step 2: Typecheck**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit` (or project lint script).

---

### Task 7: Frontend table and summary cards

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/attendance-god-view/course-marking-gaps-table.tsx`
- Create: `schedjuice-reimagined-fe/src/components/attendance-god-view/course-marking-gaps-summary-cards.tsx`
- Modify: `schedjuice-reimagined-fe/src/helpers/attendance-god-view.ts` — dominant problem label helper

- [ ] **Step 1: Create summary cards component**

Three cards: Courses affected, Not marked slots, Worst course (title + rate). Mirror `attendance-god-view-summary-cards.tsx` layout.

- [ ] **Step 2: Create table component**

Columns per spec. Actions: Details button + external link to `/courses/{id}/attendance`. Use `getAttendanceGodViewStatusLabel` for dominant problem badge.

- [ ] **Step 3: Add helper**

```typescript
export function getDominantProblemLabel(problem: string): string {
  if (problem === "not_marked") return "Not marked";
  return getAttendanceGodViewStatusLabel(problem);
}
```

---

### Task 8: Detail sheet component

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/attendance-god-view/course-marking-gap-detail-sheet.tsx`

- [ ] **Step 1: Build sheet**

Props: `open`, `onClose`, `courseRow`, `records`, `isLoading`, `isError`, `onExportCsv`.

Reuse table layout from `daily-absences-table.tsx` for student rows. Header shows course title + formatted date + summary counts.

---

### Task 9: Filters and page integration

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-filters.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/attendances/god-view/page.tsx`

- [ ] **Step 1: Extend filters for `course_marking_gaps` mode**

When `mode === "course_marking_gaps"`:

- Date presets: `today`, `custom` (same as daily)
- **Problem type** `<Select>`: Not marked, Absent, Late, Present, All
- **Min rate %** number input (default 80; empty = no threshold)

- [ ] **Step 2: Add query params to page**

```typescript
const [problemStatus, setProblemStatus] = useQueryState(
  "problemStatus",
  parseAsStringEnum(Object.values(CourseMarkingProblemStatus)).withDefault(
    CourseMarkingProblemStatus.NotMarked,
  ),
);
const [minRate, setMinRate] = useQueryState(
  "minRate",
  parseAsString.withDefault("80"),
);
```

- [ ] **Step 3: Wire search body**

When `activeMode === "course_marking_gaps"`:

```typescript
body.problem_status = problemStatus;
if (minRate !== "") body.min_rate = minRate;
```

- [ ] **Step 4: Add tab**

Insert after Daily absences:

```typescript
{ id: "course_marking_gaps", label: "Course marking gaps" }
```

Update `parseMode`, `defaultPresetForMode`, `switchMode` (reset `problemStatus` + `minRate` defaults).

- [ ] **Step 5: Render tab content**

When `activeMode === "course_marking_gaps"`: summary cards + table + pagination. Detail sheet opens on row click; detail query:

```typescript
GET attendances/god-view/details?mode=course_marking_gaps&course_id=...&date_from=...&date_to=...&problem_status=...
```

- [ ] **Step 6: Update page subtitle**

Mention course marking gaps in the description line.

- [ ] **Step 7: Manual verification**

1. Open `/attendances/god-view?mode=course_marking_gaps`
2. Confirm default 80% filter applied
3. Clear min rate — all courses with sessions appear
4. Switch problem type to Absent — list updates
5. Open detail sheet — student rows load
6. Export CSV works

---

### Task 10: Final verification

- [ ] **Backend full suite**

`cd schedjuice-reimagined-be && python manage.py test app_attendance.tests.test_god_view_services app_attendance.tests.test_rbac_attendance -v 2`

- [ ] **Frontend lint/typecheck**

Run repo's standard frontend check command.

- [ ] **Update changelog entry** (if project convention requires)

Add brief entry to `schedjuice-reimagined-fe/src/content/changelog/entries.ts` under Attendance overview.
