# Stalled After Marking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Course marking gaps checkbox (“Stalled after marking”) that finds courses with prior marking plus two consecutive fully not-marked scheduled days, and replace the single category select with a multi-select popover (all checked by default).

**Architecture:** Extend `GodViewFilters` / `build_course_marking_gap_rows` with `stalled_after_marking` and `category_ids`. When stalled is on, skip min-rate / problem-status gates and keep courses that match the per-scheduled-day rule. Frontend wires URL + toolbar checkbox + `MultiSelectPopOver` on Attendance Overview.

**Tech Stack:** Django (`app_attendance.god_view_services`), Next.js App Router, React Query, `nuqs`, existing `MultiSelectPopOver` / primitives Checkbox.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-07-21-stalled-after-marking-design.md`  
**Canonical docs live in FE only — do not mirror to BE or root `docs/`.**

## Global Constraints

- Consecutive days = consecutive **scheduled session days** for the course (distinct event dates), not calendar days.
- “Filled-in” day = any student slot `present` / `late` / `absent`.
- “All unregistered” day = every student slot not marked (`unregistered` or missing `UserEvent`); reuse `_is_not_marked_status` semantics via marked-count == 0.
- Scope = selected `date_from`…`date_to` only.
- Stalled on → ignore `problem_status` and `min_rate` (FE hides them; BE skips `_passes_course_marking_filters`).
- `category_ids`: omit/`null` → no filter; non-empty → `category_id__in`; `[]` → empty queryset.
- If both `category_ids` and `category_id` present, `category_ids` wins.
- High-value tests only; BE runs via `./scripts/run_backend_tests.sh` (always `--keepdb`).
- Zero enrolled slots on a date → skip that date (not a stall day).
- Courses with &lt; 2 scheduled dates in range cannot match stalled.

## File Structure

Backend:

- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py` — filter fields, parse, `_filter_courses`, stalled matcher, `build_course_marking_gap_rows`, GodViewFilters copies that pass `category_id`.
- Modify: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py` — stalled + category_ids tests.

Frontend:

- Modify: `schedjuice-reimagined-fe/src/types/attendance-god-view.ts` — search body fields.
- Modify: `schedjuice-reimagined-fe/src/helpers/attendance-god-view.ts` — optional-filter + empty-message helpers.
- Modify: `schedjuice-reimagined-fe/src/helpers/attendance-god-view.test.ts` — helper tests.
- Modify: `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-filters.tsx` — category multi-select + stalled checkbox; hide problem/min rate when stalled.
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/attendances/god-view/page.tsx` — URL state, search body, clear filters, pass props.

---

### Task 1: Backend — parse `stalled_after_marking` + `category_ids`

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`
- Test: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

**Interfaces:**
- Produces: `GodViewFilters.stalled_after_marking: bool`, `GodViewFilters.category_ids: Optional[List[int]]` (`None` = no filter, `[]` = empty)

- [ ] **Step 1: Write failing parse tests**

Append to `GodViewServicesTest` in `test_god_view_services.py`:

```python
def test_parse_stalled_after_marking_and_category_ids(self):
    filters = parse_god_view_filters(
        {
            "mode": "course_marking_gaps",
            "stalled_after_marking": True,
            "category_ids": [1, 2],
            "category_id": 99,
        },
        {},
    )
    self.assertTrue(filters.stalled_after_marking)
    self.assertEqual(filters.category_ids, [1, 2])

def test_parse_category_ids_empty_list(self):
    filters = parse_god_view_filters(
        {"mode": "course_marking_gaps", "category_ids": []},
        {},
    )
    self.assertEqual(filters.category_ids, [])

def test_parse_category_ids_omitted_falls_back_to_category_id(self):
    filters = parse_god_view_filters(
        {"mode": "course_marking_gaps", "category_id": 7},
        {},
    )
    self.assertIsNone(filters.category_ids)
    self.assertEqual(filters.category_id, 7)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_attendance.tests.test_god_view_services.GodViewServicesTest.test_parse_stalled_after_marking_and_category_ids app_attendance.tests.test_god_view_services.GodViewServicesTest.test_parse_category_ids_empty_list app_attendance.tests.test_god_view_services.GodViewServicesTest.test_parse_category_ids_omitted_falls_back_to_category_id
```

Expected: FAIL — attributes / parse helpers missing.

- [ ] **Step 3: Implement filter fields + parsing**

In `GodViewFilters` add:

```python
category_ids: Optional[List[int]] = None
stalled_after_marking: bool = False
```

Add helpers near other parsers:

```python
def _parse_bool(value) -> bool:
    if value is True or value is False:
        return value
    if value is None or value == "":
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_int_list(value) -> Optional[List[int]]:
    """Return None if key absent semantics handled by caller; parse list/CSV."""
    if value is None:
        return None
    if isinstance(value, list):
        out: List[int] = []
        for item in value:
            parsed = _parse_int(item)
            if parsed is not None:
                out.append(parsed)
        return out
    if isinstance(value, str):
        if value.strip() == "":
            return []
        out = []
        for part in value.split(","):
            parsed = _parse_int(part.strip())
            if parsed is not None:
                out.append(parsed)
        return out
    parsed = _parse_int(value)
    return [parsed] if parsed is not None else []
```

In `parse_god_view_filters`, before constructing `GodViewFilters`:

```python
if "category_ids" in body:
    category_ids = _parse_int_list(body.get("category_ids"))
elif query_params.get("category_ids") is not None:
    category_ids = _parse_int_list(query_params.get("category_ids"))
else:
    category_ids = None

stalled_after_marking = _parse_bool(
    body.get("stalled_after_marking")
    if "stalled_after_marking" in body
    else query_params.get("stalled_after_marking")
)
```

Pass `category_ids=category_ids` and `stalled_after_marking=stalled_after_marking` into `GodViewFilters(...)`.

Update `_filter_courses`:

```python
def _filter_courses(filters: GodViewFilters):
    qs = Course.objects.all()
    if filters.course_id:
        qs = qs.filter(id=filters.course_id)
    if filters.category_ids is not None:
        if len(filters.category_ids) == 0:
            return qs.none()
        qs = qs.filter(category_id__in=filters.category_ids)
    elif filters.category_id:
        qs = qs.filter(category_id=filters.category_id)
    # ... unchanged program/intake/level/section/campus/teacher filters
```

Also pass `category_ids=filters.category_ids` whenever code copies `GodViewFilters` with `category_id=` (detail builders around lines that construct scoped filters).

- [ ] **Step 4: Re-run parse tests**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit (BE)**

```bash
cd schedjuice-reimagined-be
git add app_attendance/god_view_services.py app_attendance/tests/test_god_view_services.py
git commit -m "$(cat <<'EOF'
feat(attendance): parse stalled_after_marking and category_ids

EOF
)"
```

---

### Task 2: Backend — stalled matcher in `build_course_marking_gap_rows`

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`
- Test: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

**Interfaces:**
- Consumes: `GodViewFilters.stalled_after_marking`, existing `_load_course_marking_gap_aggregate`
- Produces: `_course_matches_stalled_after_marking(...)` used only when flag is true; rows still use existing shape

- [ ] **Step 1: Write failing behavioral tests**

```python
def _make_event(self, course, day, title_suffix=""):
    return Event.objects.create(
        title=f"Stall {title_suffix}{uuid4().hex[:4]}",
        course=course,
        date=timezone.make_aware(datetime.combine(day, datetime.min.time())),
        time_from=datetime.strptime("09:00", "%H:%M").time(),
        time_to=datetime.strptime("10:00", "%H:%M").time(),
    )

def test_stalled_after_marking_matches_prior_mark_and_consecutive_unmarked(self):
    with schema_context(self.schema_name):
        course = Course.objects.create(
            title=f"Stall match {uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        student = User.objects.create(
            email=f"stall_{uuid4().hex[:6]}@test.com",
            name="Stall Student",
            roles=["student"],
        )
        UserCourse.objects.create(
            user=student,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        d0 = self.today - timedelta(days=4)
        d1 = self.today - timedelta(days=2)
        d2 = self.today - timedelta(days=1)
        e0 = self._make_event(course, d0, "marked")
        self._make_event(course, d1, "u1")
        self._make_event(course, d2, "u2")
        UserEvent.objects.update_or_create(
            user=student,
            event=e0,
            defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
        )
        # d1/d2: no UserEvent / unregistered → fully not marked
        filters = GodViewFilters(
            date_from=d0,
            date_to=d2,
            stalled_after_marking=True,
            min_rate=80.0,
            problem_status=CourseMarkingProblemStatus.NOT_MARKED,
        )
        _summary, rows = build_course_marking_gap_rows(filters)
        self.assertIn(course.id, {r["course_id"] for r in rows})

def test_stalled_after_marking_rejects_no_prior_marking(self):
    with schema_context(self.schema_name):
        course = Course.objects.create(
            title=f"Stall none {uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        student = User.objects.create(
            email=f"stall0_{uuid4().hex[:6]}@test.com",
            name="No Prior",
            roles=["student"],
        )
        UserCourse.objects.create(
            user=student,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        d1 = self.today - timedelta(days=2)
        d2 = self.today - timedelta(days=1)
        self._make_event(course, d1)
        self._make_event(course, d2)
        filters = GodViewFilters(
            date_from=d1,
            date_to=d2,
            stalled_after_marking=True,
            min_rate=None,
            problem_status=CourseMarkingProblemStatus.ALL,
        )
        _summary, rows = build_course_marking_gap_rows(filters)
        self.assertNotIn(course.id, {r["course_id"] for r in rows})

def test_stalled_after_marking_rejects_non_consecutive_unmarked(self):
    with schema_context(self.schema_name):
        course = Course.objects.create(
            title=f"Stall gap {uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        student = User.objects.create(
            email=f"stallg_{uuid4().hex[:6]}@test.com",
            name="Gap Days",
            roles=["student"],
        )
        UserCourse.objects.create(
            user=student,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        d0 = self.today - timedelta(days=5)
        d1 = self.today - timedelta(days=3)
        d2 = self.today - timedelta(days=1)
        e0 = self._make_event(course, d0, "m")
        self._make_event(course, d1, "u")
        e2 = self._make_event(course, d2, "m2")
        UserEvent.objects.update_or_create(
            user=student,
            event=e0,
            defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
        )
        UserEvent.objects.update_or_create(
            user=student,
            event=e2,
            defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
        )
        # Only one fully unmarked scheduled day (d1) → no consecutive pair
        filters = GodViewFilters(
            date_from=d0,
            date_to=d2,
            stalled_after_marking=True,
            min_rate=None,
            problem_status=CourseMarkingProblemStatus.ALL,
        )
        _summary, rows = build_course_marking_gap_rows(filters)
        self.assertNotIn(course.id, {r["course_id"] for r in rows})

def test_stalled_after_marking_ignores_min_rate(self):
    """Matching stalled course must appear even if range aggregate not-marked rate < 80."""
    with schema_context(self.schema_name):
        course = Course.objects.create(
            title=f"Stall rate {uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        student = User.objects.create(
            email=f"stallr_{uuid4().hex[:6]}@test.com",
            name="Rate Student",
            roles=["student"],
        )
        UserCourse.objects.create(
            user=student,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        d0 = self.today - timedelta(days=3)
        d1 = self.today - timedelta(days=2)
        d2 = self.today - timedelta(days=1)
        e0 = self._make_event(course, d0)
        self._make_event(course, d1)
        self._make_event(course, d2)
        UserEvent.objects.update_or_create(
            user=student,
            event=e0,
            defaults={"attendance_status": UserEvent.AttendanceStatus.PRESENT},
        )
        filters = GodViewFilters(
            date_from=d0,
            date_to=d2,
            stalled_after_marking=True,
            min_rate=80.0,
            problem_status=CourseMarkingProblemStatus.NOT_MARKED,
        )
        _summary, rows = build_course_marking_gap_rows(filters)
        # Aggregate not-marked rate is 2/3 ≈ 66.7% — would fail normal 80% gate
        self.assertIn(course.id, {r["course_id"] for r in rows})

def test_category_ids_include_filter(self):
    with schema_context(self.schema_name):
        other_cat = Category.objects.create(name=f"Other {uuid4().hex[:4]}")
        kept = Course.objects.create(
            title=f"Keep cat {uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        dropped = Course.objects.create(
            title=f"Drop cat {uuid4().hex[:6]}",
            category=other_cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        for course in (kept, dropped):
            student = User.objects.create(
                email=f"catf_{uuid4().hex[:6]}@test.com",
                name="Cat Filter",
                roles=["student"],
            )
            UserCourse.objects.create(
                user=student,
                course=course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self._make_event(course, self.today)
        filters = GodViewFilters(
            date_from=self.today,
            date_to=self.today,
            category_ids=[self.cat.id],
            min_rate=None,
            problem_status=CourseMarkingProblemStatus.ALL,
        )
        _summary, rows = build_course_marking_gap_rows(filters)
        ids = {r["course_id"] for r in rows}
        self.assertIn(kept.id, ids)
        self.assertNotIn(dropped.id, ids)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_attendance.tests.test_god_view_services.GodViewServicesTest.test_stalled_after_marking_matches_prior_mark_and_consecutive_unmarked
```

Expected: FAIL — stalled path not implemented (course missing or AttributeError).

- [ ] **Step 3: Implement day stats + matcher + wire into builder**

Add helpers in `god_view_services.py`:

```python
def _event_local_date(ev: Event) -> date:
    raw = ev.date
    if isinstance(raw, datetime):
        if timezone.is_aware(raw):
            return timezone.localtime(raw).date()
        return raw.date()
    return raw


def _marked_count_by_event_id(
    event_ids: List[int],
    student_ids: List[int],
) -> Dict[int, int]:
    """Count present+late+absent UserEvents per event_id."""
    counts: Dict[int, int] = defaultdict(int)
    if not event_ids or not student_ids:
        return {}
    for row in (
        UserEvent.objects.filter(
            event_id__in=event_ids,
            user_id__in=student_ids,
            attendance_status__in=[
                UserEvent.AttendanceStatus.PRESENT,
                UserEvent.AttendanceStatus.LATE,
                UserEvent.AttendanceStatus.ABSENT,
            ],
        )
        .values("event_id")
        .annotate(n=Count("id"))
    ):
        counts[row["event_id"]] = row["n"]
    return dict(counts)


def _course_matches_stalled_after_marking(
    course_events: List[Event],
    roster_size: int,
    marked_by_event_id: Dict[int, int],
) -> bool:
    if roster_size <= 0 or len(course_events) == 0:
        return False

    events_by_date: Dict[date, List[Event]] = defaultdict(list)
    for ev in course_events:
        events_by_date[_event_local_date(ev)].append(ev)

    day_flags: List[Tuple[date, bool, bool]] = []
    for day in sorted(events_by_date.keys()):
        day_events = events_by_date[day]
        scheduled = roster_size * len(day_events)
        if scheduled <= 0:
            continue
        marked = sum(marked_by_event_id.get(ev.id, 0) for ev in day_events)
        has_any_marked = marked > 0
        is_fully_not_marked = marked == 0
        day_flags.append((day, has_any_marked, is_fully_not_marked))

    if len(day_flags) < 2:
        return False
    if not any(has_any for _, has_any, _ in day_flags):
        return False
    for i in range(len(day_flags) - 1):
        if day_flags[i][2] and day_flags[i + 1][2]:
            return True
    return False
```

Extend `_load_course_marking_gap_aggregate` return (or load inside `build_course_marking_gap_rows` when stalled) so stalled evaluation has `marked_by_event_id` for all events in range. Minimal approach inside `build_course_marking_gap_rows`:

```python
def build_course_marking_gap_rows(
    filters: GodViewFilters,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    roster_size_by_course, events_by_course, status_counts_by_course = (
        _load_course_marking_gap_aggregate(filters)
    )
    if not events_by_course:
        return (
            _empty_course_marking_gap_summary(
                filters,
                has_scheduled_sessions=False if filters.course_id else None,
            ),
            [],
        )

    marked_by_event_id: Dict[int, int] = {}
    if filters.stalled_after_marking:
        all_event_ids = [ev.id for evs in events_by_course.values() for ev in evs]
        student_ids = list(
            UserCourse.objects.filter(
                course_id__in=list(events_by_course.keys()),
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).values_list("user_id", flat=True)
        )
        if filters.student_id:
            student_ids = [sid for sid in student_ids if sid == filters.student_id]
        marked_by_event_id = _marked_count_by_event_id(all_event_ids, student_ids)

    rows: List[Dict[str, Any]] = []
    for course_id, course_events in events_by_course.items():
        roster_size = roster_size_by_course.get(course_id, 0)
        if roster_size == 0:
            continue

        # ... existing aggregate row construction unchanged ...

        if filters.stalled_after_marking:
            if _course_matches_stalled_after_marking(
                course_events, roster_size, marked_by_event_id
            ):
                rows.append(row)
        elif _passes_course_marking_filters(row, filters):
            rows.append(row)

    rows.sort(key=lambda r: (-r["not_marked_rate"], r["course_title"].lower()))
    summary = _build_course_marking_gap_summary(rows, filters)
    summary = _with_scheduled_sessions_flag(summary, filters, True)
    return summary, rows
```

- [ ] **Step 4: Run all new stalled/category tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_attendance.tests.test_god_view_services.GodViewServicesTest.test_stalled_after_marking_matches_prior_mark_and_consecutive_unmarked app_attendance.tests.test_god_view_services.GodViewServicesTest.test_stalled_after_marking_rejects_no_prior_marking app_attendance.tests.test_god_view_services.GodViewServicesTest.test_stalled_after_marking_rejects_non_consecutive_unmarked app_attendance.tests.test_god_view_services.GodViewServicesTest.test_stalled_after_marking_ignores_min_rate app_attendance.tests.test_god_view_services.GodViewServicesTest.test_category_ids_include_filter
```

Expected: PASS.

- [ ] **Step 5: Commit (BE)**

```bash
cd schedjuice-reimagined-be
git add app_attendance/god_view_services.py app_attendance/tests/test_god_view_services.py
git commit -m "$(cat <<'EOF'
feat(attendance): filter course gaps by stalled-after-marking

EOF
)"
```

---

### Task 3: Frontend helpers + types

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/attendance-god-view.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/attendance-god-view.ts`
- Test: `schedjuice-reimagined-fe/src/helpers/attendance-god-view.test.ts`

**Interfaces:**
- Produces: `AttendanceGodViewSearchBody.stalled_after_marking?`, `category_ids?`
- Produces: updated `GodViewOptionalFilterParams`, `hasActiveOptionalFilters`, `getCourseMarkingGapsEmptyMessage`

- [ ] **Step 1: Write failing helper tests**

Update `baseParams` and add cases in `attendance-god-view.test.ts`:

```typescript
const baseParams = {
  courseId: "",
  categoryId: "", // legacy unused once multi-select lands; keep field for type until Task 4 removes it
  categoryIdsActive: false, // true when URL has a non-all selection (subset or empty)
  programId: "",
  studentId: "",
  minRate: "",
  maxRate: "",
  sort: "attendance_rate_asc",
  gapMinRate: "80",
  problemStatus: CourseMarkingProblemStatus.NotMarked,
  stalledAfterMarking: false,
};

it("returns true when stalled after marking is on", () => {
  expect(
    hasActiveOptionalFilters("course_marking_gaps", {
      ...baseParams,
      stalledAfterMarking: true,
    }),
  ).toBe(true);
});

it("returns stalled empty message when stalled filter is on", () => {
  expect(
    getCourseMarkingGapsEmptyMessage("80", CourseMarkingProblemStatus.NotMarked, null, {
      stalledAfterMarking: true,
    }),
  ).toBe(
    "No courses with prior marking and two consecutive unmarked session days in the selected range.",
  );
});
```

- [ ] **Step 2: Run Vitest to verify failure**

```bash
cd schedjuice-reimagined-fe
npx vitest run src/helpers/attendance-god-view.test.ts
```

Expected: FAIL — params / signature mismatch.

- [ ] **Step 3: Update types + helpers**

In `attendance-god-view.ts` search body:

```typescript
  category_id?: number | string;
  category_ids?: number[];
  // ...
  problem_status?: CourseMarkingProblemStatus;
  min_rate?: number | string | null;
  stalled_after_marking?: boolean;
```

In helpers:

```typescript
export type GodViewOptionalFilterParams = {
  courseId: string;
  categoryIdsActive: boolean;
  programId: string;
  studentId: string;
  minRate: string;
  maxRate: string;
  sort: string;
  gapMinRate: string;
  problemStatus: string;
  stalledAfterMarking: boolean;
};

export function hasActiveOptionalFilters(
  mode: AttendanceGodViewMode,
  params: GodViewOptionalFilterParams,
): boolean {
  const shared =
    params.courseId !== "" ||
    params.categoryIdsActive ||
    params.programId !== "";

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
    if (params.stalledAfterMarking) return true;
    return (
      params.gapMinRate !== "80" ||
      params.problemStatus !== CourseMarkingProblemStatus.NotMarked
    );
  }

  return false;
}

export function getCourseMarkingGapsEmptyMessage(
  gapMinRate: string,
  problemStatus: string,
  summary?: Pick<AttendanceGodViewCourseGapSummary, "has_scheduled_sessions"> | null,
  options?: { stalledAfterMarking?: boolean },
): string {
  if (summary?.has_scheduled_sessions === false) {
    return NO_COURSE_SESSIONS_MESSAGE_GAPS;
  }
  if (options?.stalledAfterMarking) {
    return "No courses with prior marking and two consecutive unmarked session days in the selected range.";
  }
  if (gapMinRate) {
    return `No courses exceed ${gapMinRate}% for the selected problem type in the selected range.`;
  }
  return "No scheduled attendance in the selected range.";
}
```

Update existing tests that construct `baseParams` to include `categoryIdsActive: false` and `stalledAfterMarking: false`. Remove reliance on `categoryId` in `hasActiveOptionalFilters` (page will stop passing it).

- [ ] **Step 4: Re-run Vitest**

```bash
cd schedjuice-reimagined-fe
npx vitest run src/helpers/attendance-god-view.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (FE)**

```bash
cd schedjuice-reimagined-fe
git add src/types/attendance-god-view.ts src/helpers/attendance-god-view.ts src/helpers/attendance-god-view.test.ts
git commit -m "$(cat <<'EOF'
feat(fe): helpers for stalled-after-marking god-view filters

EOF
)"
```

---

### Task 4: Frontend — filters UI + page wiring

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-filters.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/attendances/god-view/page.tsx`

**Interfaces:**
- Consumes: Task 3 helpers/types; BE fields from Tasks 1–2
- Produces: URL `stalledAfterMarking`, `categoryIds`; search body `stalled_after_marking`, `category_ids`

- [ ] **Step 1: Extend filter component props**

Replace single `EntitySelect` category control with `MultiSelectPopOver` fed by a categories query (do **not** use `CategoryMultiSelect` as-is — its `onSuccess` always selects all and fights URL state).

Props to add/change on `AttendanceGodViewFilters`:

```typescript
  // remove categoryId / onCategoryIdChange
  categoryEntities: { id: number; name: string }[];
  selectedCategories: { id: number; name: string }[];
  onSelectedCategoriesChange: (entities: { id: number; name: string }[]) => void;
  stalledAfterMarking: boolean;
  onStalledAfterMarkingChange: (value: boolean) => void;
```

Toolbar layout for course marking gaps:

```tsx
<MultiSelectPopOver
  label="Categories"
  entities={categoryEntities}
  selectedEntities={selectedCategories}
  setSelectedEntities={(next) => {
    const value = typeof next === "function" ? next(selectedCategories) : next;
    onSelectedCategoriesChange(value as { id: number; name: string }[]);
    onPageReset();
  }}
  displayFunction={(c) => c.name}
  isAllSelectedDefault
/>

{mode === "course_marking_gaps" && (
  <FilterToolbarField label="Stalled after marking">
    <Checkbox
      checked={stalledAfterMarking}
      onCheckedChange={(c) => {
        onStalledAfterMarkingChange(c === true);
        onPageReset();
      }}
    />
  </FilterToolbarField>
)}

{mode === "course_marking_gaps" && !stalledAfterMarking && (
  <>
    {/* existing Problem type + Min rate % */}
  </>
)}
```

Import `Checkbox` from `@/components/primitives` (same package path the page already uses for other primitives).

- [ ] **Step 2: Wire page URL + search body**

In `page.tsx`:

```typescript
import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from "nuqs";

const [stalledAfterMarking, setStalledAfterMarking] = useQueryState(
  "stalledAfterMarking",
  parseAsBoolean.withDefault(false),
);

// null = all categories (omit from request); [] = none; number[] = subset
const [categoryIds, setCategoryIds] = useQueryState(
  "categoryIds",
  parseAsArrayOf(parseAsInteger),
);
```

Load categories once:

```typescript
const categoriesQuery = useQuery({
  queryKey: ["godViewCategories"],
  queryFn: () =>
    searchEntities(
      "categories",
      { size: -1, fields: ["id", "name"], sorts: ["name"] },
      { filter_params: [], exclude_params: [] },
    ),
  enabled: allowed,
});
const allCategories = (categoriesQuery.data?.data?.data ?? []).map((c: { id: number; name: string }) => ({
  id: c.id,
  name: c.name,
}));

const selectedCategories = useMemo(() => {
  if (categoryIds === null) return allCategories; // all
  if (categoryIds.length === 0) return [];
  const allow = new Set(categoryIds);
  return allCategories.filter((c) => allow.has(c.id));
}, [categoryIds, allCategories]);

const onSelectedCategoriesChange = (entities: { id: number; name: string }[]) => {
  if (allCategories.length > 0 && entities.length === allCategories.length) {
    void setCategoryIds(null);
    return;
  }
  void setCategoryIds(entities.map((e) => e.id));
};
```

Search body:

```typescript
if (categoryIds === null) {
  // omit category_ids and category_id
} else {
  body.category_ids = categoryIds; // may be []
}
// remove body.category_id from categoryId string

if (activeMode === "course_marking_gaps") {
  if (stalledAfterMarking) {
    body.stalled_after_marking = true;
    // do not send problem_status / min_rate
  } else {
    body.problem_status = problemStatus;
    body.min_rate = gapMinRate === "" ? null : gapMinRate;
  }
}
```

When `onStalledAfterMarkingChange(true)`: `setStalledAfterMarking(true)`, clear `problemStatus`/`gapMinRate` from URL if desired (or leave dormant). When `false`: restore defaults `NotMarked` / `"80"`.

`clearOptionalFilters`:

```typescript
void setCategoryIds(null);
void setStalledAfterMarking(false);
void setGapMinRate("80");
void setProblemStatus(CourseMarkingProblemStatus.NotMarked);
// ... rest unchanged; remove setCategoryId
```

`optionalFilterParams.categoryIdsActive = categoryIds !== null`  
`optionalFilterParams.stalledAfterMarking = stalledAfterMarking`

Empty message call site: pass `{ stalledAfterMarking }`.

Remove `categoryId` query state.

- [ ] **Step 3: Manual smoke (agent can skip if no browser; note in commit)**

Verify locally when implementing:

1. Course marking gaps → Categories popover shows all checked; search omits `category_ids`.
2. Uncheck one category → request sends `category_ids` without it.
3. Uncheck all → `category_ids: []` → empty table + empty state.
4. Check Stalled → Problem type / Min rate hidden; matching courses appear for a known fixture range.
5. Clear filters resets categories to all + stalled off + gap defaults.

- [ ] **Step 4: Commit (FE)**

```bash
cd schedjuice-reimagined-fe
git add src/components/attendance-god-view/attendance-god-view-filters.tsx src/app/(internal)/attendances/god-view/page.tsx
git commit -m "$(cat <<'EOF'
feat(fe): stalled-after-marking checkbox and category multi-select

EOF
)"
```

---

### Task 5: Spec coverage self-check + regression

**Files:** none new — verify only

- [ ] **Step 1: Run BE regression for god-view services**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_attendance.tests.test_god_view_services
```

Expected: PASS (existing + new).

- [ ] **Step 2: Run FE helper tests**

```bash
cd schedjuice-reimagined-fe
npx vitest run src/helpers/attendance-god-view.test.ts
```

Expected: PASS.

- [ ] **Step 3: Spec checklist**

Confirm each spec requirement is covered:

| Spec item | Task |
| --- | --- |
| Stalled checkbox + URL | Task 4 |
| Prior marking + consecutive scheduled days | Task 2 |
| unregistered + unmarked | Task 2 (`marked == 0`) |
| Date range scope | Task 2 (existing event filter) |
| Hide/ignore problem + min rate | Tasks 2 + 4 |
| Category multi-select all default | Task 4 |
| `category_ids` omit / [] / list | Tasks 1 + 4 |
| Same table/detail/CSV shape | no row-shape change |
| High-value tests | Tasks 1–3 |

- [ ] **Step 4: Commit only if Step 1–2 required small fixes**

Otherwise no commit.

---

## Self-Review (plan author)

1. **Spec coverage:** All goals mapped to Tasks 1–4; non-goals (summary cards, dropped-out, daily unregistered split) excluded.
2. **Placeholders:** None intentionally left; implementers use concrete helpers/signatures above.
3. **Type consistency:** `stalled_after_marking` / `category_ids` names match BE snake_case body and FE search body; URL uses `stalledAfterMarking` / `categoryIds`.
