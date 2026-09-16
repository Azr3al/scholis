# Attendance Godview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add simple, tabbed Attendance Godview workflows for daily absences, monthly student summaries, and the existing risk overview.

**Architecture:** Extend the existing backend Godview service with two focused modes: daily absence incident rows and monthly student aggregate rows. Keep the existing student-course aggregate logic for Risk overview, and split the frontend page into small tab/filter/table/detail components so the UI remains simple.

**Tech Stack:** Django REST backend, existing `app_attendance.god_view_services`, Next.js client page, React Query, `nuqs`, existing shadcn-style UI components.

---

## File Structure

Backend:

- Modify `schedjuice-reimagined-be/app_attendance/god_view_services.py`: add daily/monthly builders, monthly detail builder, CSV responses, and sort helpers.
- Modify `schedjuice-reimagined-be/app_attendance/views.py`: route `mode` inside existing search view, add monthly detail behavior to existing detail view or a new view.
- Modify `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`: add service tests for daily rows, monthly aggregation, worst course, dropped-out filtering, and CSV headers.

Frontend:

- Modify `schedjuice-reimagined-fe/src/types/attendance-god-view.ts`: add daily/monthly row, summary, detail, mode, and response types; remove teacher from new request types.
- Create `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-filters.tsx`: shared tab-aware filters, without teacher filter.
- Create `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-summary-cards.tsx`: small card grid for each mode.
- Create `schedjuice-reimagined-fe/src/components/attendance-god-view/daily-absences-table.tsx`: daily table.
- Create `schedjuice-reimagined-fe/src/components/attendance-god-view/monthly-student-summary-table.tsx`: monthly table.
- Create `schedjuice-reimagined-fe/src/components/attendance-god-view/risk-overview-table.tsx`: existing table extracted from page.
- Create `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-detail-sheet.tsx`: tab-aware detail sheet.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/attendances/god-view/page.tsx`: orchestrate auth, query params, mode-specific queries, exports, and tab layout.

Testing and verification:

- Backend tests run through Django test command for `app_attendance.tests.test_god_view_services`.
- Frontend validation uses TypeScript/lint/build or the repo's available frontend checks.

---

### Task 1: Backend Daily Absence Service Tests

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`
- Test: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add failing imports for daily builder**

Add `build_daily_absence_rows` to the existing import block:

```python
from app_attendance.god_view_services import (
    GodViewFilters,
    build_daily_absence_rows,
    build_god_view_detail,
    build_god_view_rows,
    paginate_rows,
)
```

- [ ] **Step 2: Add a failing test for explicit absent and unmarked daily rows**

Append this test to `GodViewServicesTest`:

```python
def test_daily_absence_rows_include_absent_and_unmarked(self):
    with schema_context(self.schema_name):
        UserEvent.objects.filter(
            user=self.student,
            event=self.event2,
        ).delete()
        absent_event = Event.objects.create(
            title="Session 3",
            course=self.course,
            date=timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            ),
            time_from=datetime.strptime("11:00", "%H:%M").time(),
            time_to=datetime.strptime("12:00", "%H:%M").time(),
        )
        UserEvent.objects.update_or_create(
            user=self.student,
            event=absent_event,
            defaults={"attendance_status": UserEvent.AttendanceStatus.ABSENT},
        )
        unmarked_event = Event.objects.create(
            title="Session 4",
            course=self.course,
            date=timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            ),
            time_from=datetime.strptime("13:00", "%H:%M").time(),
            time_to=datetime.strptime("14:00", "%H:%M").time(),
        )

        filters = GodViewFilters(date_from=self.today, date_to=self.today)
        summary, rows = build_daily_absence_rows(filters)

    statuses = {row["attendance_status"] for row in rows}
    event_titles = {row["event_title"] for row in rows}
    self.assertIn(UserEvent.AttendanceStatus.ABSENT, statuses)
    self.assertIn("unmarked", statuses)
    self.assertIn("Session 3", event_titles)
    self.assertIn("Session 4", event_titles)
    self.assertEqual(summary["absent_count"], 1)
    self.assertEqual(summary["unmarked_count"], 1)
    self.assertEqual(summary["courses_affected_count"], 1)
```

- [ ] **Step 3: Add a failing test for course filtering**

Append:

```python
def test_daily_absence_rows_respect_course_filter(self):
    with schema_context(self.schema_name):
        other_course = Course.objects.create(
            title=f"Other {uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        UserCourse.objects.get_or_create(
            user=self.student,
            course=other_course,
            defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
        )
        other_event = Event.objects.create(
            title="Other course absent",
            course=other_course,
            date=timezone.make_aware(
                datetime.combine(self.today, datetime.min.time())
            ),
            time_from=datetime.strptime("09:00", "%H:%M").time(),
            time_to=datetime.strptime("10:00", "%H:%M").time(),
        )
        UserEvent.objects.update_or_create(
            user=self.student,
            event=other_event,
            defaults={"attendance_status": UserEvent.AttendanceStatus.ABSENT},
        )

        filters = GodViewFilters(
            date_from=self.today,
            date_to=self.today,
            course_id=self.course.id,
        )
        _summary, rows = build_daily_absence_rows(filters)

    self.assertTrue(all(row["course_id"] == self.course.id for row in rows))
```

- [ ] **Step 4: Run tests and verify they fail because the function is missing**

Run:

```bash
python manage.py test app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_absence_rows_include_absent_and_unmarked app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_absence_rows_respect_course_filter
```

Expected: FAIL with `ImportError` or `NameError` for `build_daily_absence_rows`.

### Task 2: Backend Daily Absence Service Implementation

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`
- Test: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add daily summary helper**

Add this near `_empty_summary`:

```python
def _empty_daily_summary(filters: GodViewFilters) -> Dict[str, Any]:
    return {
        "absent_count": 0,
        "unmarked_count": 0,
        "courses_affected_count": 0,
        "students_with_streaks_count": 0,
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
    }
```

- [ ] **Step 2: Add daily row builder**

Add this after `build_god_view_rows`:

```python
def build_daily_absence_rows(filters: GodViewFilters) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    course_qs = _filter_courses(filters)
    course_ids = list(course_qs.values_list("id", flat=True))
    if not course_ids:
        return _empty_daily_summary(filters), []

    uc_qs = UserCourse.objects.filter(
        course_id__in=course_ids,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("user", "course", "course__category", "course__program")
    if not filters.include_dropped_out:
        uc_qs = uc_qs.filter(is_dropped_out=False)
    if filters.student_id:
        uc_qs = uc_qs.filter(user_id=filters.student_id)

    roster = list(uc_qs)
    if not roster:
        return _empty_daily_summary(filters), []

    student_ids = {uc.user_id for uc in roster}
    roster_by_course = defaultdict(list)
    for uc in roster:
        roster_by_course[uc.course_id].append(uc)

    events = list(
        Event.objects.filter(course_id__in=course_ids)
        .filter(_event_date_range_q(filters))
        .select_related("course", "course__category", "course__program")
        .order_by("date", "time_from", "course__title")
    )
    if not events:
        return _empty_daily_summary(filters), []

    ue_by_user_event = {
        (ue.user_id, ue.event_id): ue
        for ue in UserEvent.objects.filter(
            user_id__in=student_ids,
            event_id__in=[ev.id for ev in events],
        ).select_related("event")
    }

    rows = []
    for ev in events:
        course = ev.course
        for uc in roster_by_course.get(ev.course_id, []):
            ue = ue_by_user_event.get((uc.user_id, ev.id))
            status = ue.attendance_status if ue else "unmarked"
            if status not in ABSENT_STATUSES and status != "unmarked":
                continue

            detail_records = build_god_view_detail(
                uc.user_id,
                uc.course_id,
                filters.date_from - timedelta(days=90),
                filters.date_to,
            )
            timeline = [
                (
                    rec["event_id"],
                    datetime.fromisoformat(rec["event_date"]),
                    rec["attendance_status"],
                )
                for rec in detail_records
                if rec.get("event_date")
            ]
            streak, last_attended, _last_status = _compute_streak_and_last(timeline)

            rows.append(
                {
                    "student_id": uc.user_id,
                    "student_name": uc.user.name or "",
                    "student_email": uc.user.email or "",
                    "student_phone": getattr(uc.user, "phone_number", None) or "",
                    "course_id": uc.course_id,
                    "course_title": course.title,
                    "course_code": course.code or "",
                    "category_id": course.category_id,
                    "category_name": course.category.name if course.category_id else "",
                    "program_id": course.program_id,
                    "program_name": course.program.name if course.program_id else "",
                    "event_id": ev.id,
                    "event_title": ev.title,
                    "event_date": ev.date.isoformat() if ev.date else None,
                    "time_from": str(ev.time_from),
                    "time_to": str(ev.time_to),
                    "attendance_status": status,
                    "attendance_note": ue.attendance_note if ue else None,
                    "recent_absence_streak": streak,
                    "last_attended_date": last_attended,
                    "is_dropped_out": uc.is_dropped_out,
                }
            )

    summary = {
        "absent_count": sum(1 for row in rows if row["attendance_status"] in ABSENT_STATUSES),
        "unmarked_count": sum(1 for row in rows if row["attendance_status"] == "unmarked"),
        "courses_affected_count": len({row["course_id"] for row in rows}),
        "students_with_streaks_count": len(
            {row["student_id"] for row in rows if row["recent_absence_streak"] > 1}
        ),
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
    }
    return summary, rows
```

- [ ] **Step 3: Run daily service tests**

Run:

```bash
python manage.py test app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_absence_rows_include_absent_and_unmarked app_attendance.tests.test_god_view_services.GodViewServicesTest.test_daily_absence_rows_respect_course_filter
```

Expected: PASS.

- [ ] **Step 4: Commit checkpoint if commit permission exists**

Only commit if the user has explicitly approved commits in the implementation session.

```bash
git add app_attendance/god_view_services.py app_attendance/tests/test_god_view_services.py
git commit -m "Add attendance godview daily absence service"
```

### Task 3: Backend Monthly Student Summary Tests

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`
- Test: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add failing imports**

Add:

```python
from app_attendance.god_view_services import (
    GodViewFilters,
    build_daily_absence_rows,
    build_god_view_detail,
    build_god_view_rows,
    build_monthly_student_detail,
    build_monthly_student_rows,
    paginate_rows,
)
```

- [ ] **Step 2: Add failing test for multi-course student aggregation**

Append:

```python
def test_monthly_student_rows_aggregate_multiple_courses(self):
    with schema_context(self.schema_name):
        other_course = Course.objects.create(
            title=f"Other {uuid4().hex[:6]}",
            category=self.cat,
            program=self.prog,
            start_date=self.today - timedelta(days=30),
            end_date=self.today + timedelta(days=30),
        )
        UserCourse.objects.get_or_create(
            user=self.student,
            course=other_course,
            defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
        )
        other_event = Event.objects.create(
            title="Other Session",
            course=other_course,
            date=timezone.make_aware(
                datetime.combine(self.today - timedelta(days=3), datetime.min.time())
            ),
            time_from=datetime.strptime("09:00", "%H:%M").time(),
            time_to=datetime.strptime("10:00", "%H:%M").time(),
        )
        UserEvent.objects.update_or_create(
            user=self.student,
            event=other_event,
            defaults={"attendance_status": UserEvent.AttendanceStatus.ABSENT},
        )

        filters = GodViewFilters(
            date_from=self.today.replace(day=1),
            date_to=self.today,
            student_id=self.student.id,
        )
        summary, rows = build_monthly_student_rows(filters)

    self.assertEqual(len(rows), 1)
    row = rows[0]
    self.assertEqual(row["student_id"], self.student.id)
    self.assertEqual(row["course_count"], 2)
    self.assertEqual(row["absent_count"], 2)
    self.assertGreaterEqual(row["scheduled_classes"], 3)
    self.assertIn("worst_course", row)
    self.assertEqual(summary["total_absences"], 2)
```

- [ ] **Step 3: Add failing test for monthly detail grouping**

Append:

```python
def test_monthly_student_detail_groups_records_by_course(self):
    with schema_context(self.schema_name):
        filters = GodViewFilters(
            date_from=self.today.replace(day=1),
            date_to=self.today,
            student_id=self.student.id,
        )
        detail = build_monthly_student_detail(self.student.id, filters)

    self.assertEqual(detail["student_id"], self.student.id)
    self.assertIn("course_breakdown", detail)
    self.assertIn("course_records", detail)
    self.assertTrue(detail["course_breakdown"])
```

- [ ] **Step 4: Run tests and verify they fail because functions are missing**

Run:

```bash
python manage.py test app_attendance.tests.test_god_view_services.GodViewServicesTest.test_monthly_student_rows_aggregate_multiple_courses app_attendance.tests.test_god_view_services.GodViewServicesTest.test_monthly_student_detail_groups_records_by_course
```

Expected: FAIL with missing monthly functions.

### Task 4: Backend Monthly Student Summary Implementation

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`
- Test: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add monthly summary helpers**

Add after daily helpers:

```python
def _empty_monthly_summary(filters: GodViewFilters) -> Dict[str, Any]:
    return {
        "students_at_risk_count": 0,
        "total_absences": 0,
        "unmarked_count": 0,
        "worst_course": None,
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
        "at_risk_threshold": filters.at_risk_threshold,
    }


def _pick_worst_course(course_rows: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not course_rows:
        return None
    worst = sorted(
        course_rows,
        key=lambda row: (
            -row["absent_count"],
            row["attendance_rate"],
            row["course_title"].lower(),
        ),
    )[0]
    return {
        "course_id": worst["course_id"],
        "course_title": worst["course_title"],
        "attendance_rate": worst["attendance_rate"],
        "absent_count": worst["absent_count"],
    }
```

- [ ] **Step 2: Add monthly row builder using existing course rows**

Add:

```python
def build_monthly_student_rows(filters: GodViewFilters) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    _risk_summary, course_rows = build_god_view_rows(filters)
    if not course_rows:
        return _empty_monthly_summary(filters), []

    grouped: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for row in course_rows:
        grouped[row["student_id"]].append(row)

    monthly_rows = []
    for student_id, rows in grouped.items():
        first = rows[0]
        scheduled = sum(row["scheduled_classes"] for row in rows)
        present = sum(row["present_count"] for row in rows)
        late = sum(row["late_count"] for row in rows)
        absent = sum(row["absent_count"] for row in rows)
        unmarked = sum(row["unmarked_count"] for row in rows)
        unregistered = sum(row["unregistered_count"] for row in rows)
        attended = present + late
        attendance_rate = round((attended / scheduled) * 100, 2) if scheduled else 0.0
        absence_rate = round((absent / scheduled) * 100, 2) if scheduled else 0.0
        late_rate = round((late / scheduled) * 100, 2) if scheduled else 0.0
        last_attended_dates = [
            row["last_attended_date"] for row in rows if row["last_attended_date"]
        ]
        last_attended = max(last_attended_dates) if last_attended_dates else None
        streak = max(row["recent_absence_streak"] for row in rows)
        worst_course = _pick_worst_course(rows)

        monthly_rows.append(
            {
                "student_id": student_id,
                "student_name": first["student_name"],
                "student_email": first["student_email"],
                "student_phone": first["student_phone"],
                "course_count": len(rows),
                "scheduled_classes": scheduled,
                "present_count": present,
                "late_count": late,
                "absent_count": absent,
                "unmarked_count": unmarked,
                "unregistered_count": unregistered,
                "attendance_rate": attendance_rate,
                "absence_rate": absence_rate,
                "late_rate": late_rate,
                "worst_course": worst_course,
                "recent_absence_streak": streak,
                "last_attended_date": last_attended,
                "is_at_risk": attendance_rate < filters.at_risk_threshold,
                "is_late_heavy": late_rate >= LATE_HEAVY_RATE_THRESHOLD,
                "has_unmarked": unmarked > 0,
                "is_dropped_out": any(row["is_dropped_out"] for row in rows),
            }
        )

    monthly_rows = sorted(
        monthly_rows,
        key=lambda row: (
            row["attendance_rate"],
            -row["absent_count"],
            row["student_name"].lower(),
        ),
    )
    worst_courses = [
        row["worst_course"] for row in monthly_rows if row.get("worst_course")
    ]
    summary = {
        "students_at_risk_count": sum(1 for row in monthly_rows if row["is_at_risk"]),
        "total_absences": sum(row["absent_count"] for row in monthly_rows),
        "unmarked_count": sum(row["unmarked_count"] for row in monthly_rows),
        "worst_course": sorted(
            worst_courses,
            key=lambda row: (-row["absent_count"], row["course_title"].lower()),
        )[0] if worst_courses else None,
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
        "at_risk_threshold": filters.at_risk_threshold,
    }
    return summary, monthly_rows
```

- [ ] **Step 3: Add monthly detail builder**

Add:

```python
def build_monthly_student_detail(student_id: int, filters: GodViewFilters) -> Dict[str, Any]:
    scoped_filters = GodViewFilters(
        date_from=filters.date_from,
        date_to=filters.date_to,
        course_id=filters.course_id,
        student_id=student_id,
        category_id=filters.category_id,
        program_id=filters.program_id,
        intake_id=filters.intake_id,
        level_id=filters.level_id,
        section_id=filters.section_id,
        campus_id=filters.campus_id,
        include_dropped_out=filters.include_dropped_out,
        at_risk_threshold=filters.at_risk_threshold,
        sort=filters.sort,
        page=1,
        size=-1,
    )
    _summary, course_rows = build_god_view_rows(scoped_filters)
    records_by_course = []
    for row in course_rows:
        records_by_course.append(
            {
                "course_id": row["course_id"],
                "course_title": row["course_title"],
                "records": build_god_view_detail(
                    student_id,
                    row["course_id"],
                    filters.date_from,
                    filters.date_to,
                ),
            }
        )

    return {
        "student_id": student_id,
        "date_from": filters.date_from.isoformat(),
        "date_to": filters.date_to.isoformat(),
        "course_breakdown": course_rows,
        "course_records": records_by_course,
    }
```

- [ ] **Step 4: Run monthly service tests**

Run:

```bash
python manage.py test app_attendance.tests.test_god_view_services.GodViewServicesTest.test_monthly_student_rows_aggregate_multiple_courses app_attendance.tests.test_god_view_services.GodViewServicesTest.test_monthly_student_detail_groups_records_by_course
```

Expected: PASS.

- [ ] **Step 5: Commit checkpoint if commit permission exists**

```bash
git add app_attendance/god_view_services.py app_attendance/tests/test_god_view_services.py
git commit -m "Add attendance godview monthly student summary service"
```

### Task 5: Backend API Modes And CSV

**Files:**
- Modify: `schedjuice-reimagined-be/app_attendance/god_view_services.py`
- Modify: `schedjuice-reimagined-be/app_attendance/views.py`
- Test: `schedjuice-reimagined-be/app_attendance/tests/test_god_view_services.py`

- [ ] **Step 1: Add CSV headers and generic CSV helper**

Add near existing CSV headers:

```python
DAILY_ABSENCE_CSV_HEADERS = [
    "student_id",
    "student_name",
    "student_email",
    "student_phone",
    "course_id",
    "course_title",
    "event_id",
    "event_title",
    "event_date",
    "time_from",
    "time_to",
    "attendance_status",
    "attendance_note",
    "recent_absence_streak",
    "last_attended_date",
]

MONTHLY_STUDENT_CSV_HEADERS = [
    "student_id",
    "student_name",
    "student_email",
    "student_phone",
    "course_count",
    "attendance_rate",
    "present_count",
    "late_count",
    "absent_count",
    "unmarked_count",
    "scheduled_classes",
    "recent_absence_streak",
    "last_attended_date",
    "is_at_risk",
    "has_unmarked",
]


def god_view_csv_response(
    rows: List[Dict[str, Any]],
    headers: List[str],
    filename: str,
) -> HttpResponse:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(header, "") for header in headers])
    response = HttpResponse(buffer.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
```

- [ ] **Step 2: Update search view mode routing**

Modify imports in `views.py`:

```python
from app_attendance.god_view_services import (
    DAILY_ABSENCE_CSV_HEADERS,
    MONTHLY_STUDENT_CSV_HEADERS,
    SUMMARY_CSV_HEADERS,
    build_daily_absence_rows,
    build_god_view_rows,
    build_monthly_student_rows,
    god_view_csv_response,
    god_view_summary_csv_response,
    paginate_rows,
    parse_god_view_filters,
)
```

Then replace the body of `AttendanceGodViewSearchView.post` after `filters = ...` with:

```python
mode = str(body.get("mode") or request.query_params.get("mode") or "risk")
if mode == "daily_absences":
    summary, rows = build_daily_absence_rows(filters)
    csv_headers = DAILY_ABSENCE_CSV_HEADERS
    csv_filename = f"attendance-daily-absences-{filters.date_from.isoformat()}.csv"
elif mode == "monthly_students":
    summary, rows = build_monthly_student_rows(filters)
    csv_headers = MONTHLY_STUDENT_CSV_HEADERS
    csv_filename = f"attendance-monthly-summary-{filters.date_from.strftime('%Y-%m')}.csv"
else:
    summary, rows = build_god_view_rows(filters)
    csv_headers = SUMMARY_CSV_HEADERS
    csv_filename = "attendance-god-view-summary.csv"

if request.query_params.get("csv") == "true":
    return god_view_csv_response(rows, csv_headers, filename=csv_filename)

page_rows, count = paginate_rows(rows, filters.page, filters.size)
return self.send_response(
    False,
    "success",
    {
        "data": {
            "summary": summary,
            "results": page_rows,
        },
        "page": filters.page,
        "size": filters.size,
        "count": count,
    },
    status=200,
)
```

- [ ] **Step 3: Update detail view for monthly mode**

Modify imports:

```python
from app_attendance.god_view_services import build_monthly_student_detail
```

Inside `AttendanceGodViewDetailView.get`, before requiring `course_id`, add:

```python
mode = request.query_params.get("mode")
filters = parse_god_view_filters({}, request.query_params)
if mode == "monthly_students":
    try:
        student_id = int(request.query_params.get("student_id", ""))
    except ValueError:
        return self.bad_request("student_id is required.")

    return self.ok(build_monthly_student_detail(student_id, filters))
```

Leave existing student-course detail behavior after that branch.

- [ ] **Step 4: Run service and API-adjacent tests**

Run:

```bash
python manage.py test app_attendance.tests.test_god_view_services
```

Expected: PASS or SKIP if PostgreSQL is unavailable, matching current test behavior.

- [ ] **Step 5: Commit checkpoint if commit permission exists**

```bash
git add app_attendance/god_view_services.py app_attendance/views.py app_attendance/tests/test_god_view_services.py
git commit -m "Add attendance godview API modes"
```

### Task 6: Frontend Types And Request Shapes

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/attendance-god-view.ts`

- [ ] **Step 1: Add mode type and remove teacher from new body usage**

Add:

```ts
export type AttendanceGodViewMode =
  | "daily_absences"
  | "monthly_students"
  | "risk";
```

- [ ] **Step 2: Add daily summary and row types**

Add:

```ts
export type AttendanceGodViewDailySummary = {
  absent_count: number;
  unmarked_count: number;
  courses_affected_count: number;
  students_with_streaks_count: number;
  date_from: string;
  date_to: string;
};

export type AttendanceGodViewDailyRow = {
  student_id: number;
  student_name: string;
  student_email: string;
  student_phone: string;
  course_id: number;
  course_title: string;
  course_code: string;
  category_id: number | null;
  category_name: string;
  program_id: number | null;
  program_name: string;
  event_id: number;
  event_title: string;
  event_date: string | null;
  time_from: string;
  time_to: string;
  attendance_status: "absent" | "unmarked";
  attendance_note: string | null;
  recent_absence_streak: number;
  last_attended_date: string | null;
  is_dropped_out: boolean;
};
```

- [ ] **Step 3: Add monthly summary and row types**

Add:

```ts
export type AttendanceGodViewWorstCourse = {
  course_id: number;
  course_title: string;
  attendance_rate: number;
  absent_count: number;
};

export type AttendanceGodViewMonthlySummary = {
  students_at_risk_count: number;
  total_absences: number;
  unmarked_count: number;
  worst_course: AttendanceGodViewWorstCourse | null;
  date_from: string;
  date_to: string;
  at_risk_threshold: number;
};

export type AttendanceGodViewMonthlyRow = {
  student_id: number;
  student_name: string;
  student_email: string;
  student_phone: string;
  course_count: number;
  scheduled_classes: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  unmarked_count: number;
  unregistered_count: number;
  attendance_rate: number;
  absence_rate: number;
  late_rate: number;
  worst_course: AttendanceGodViewWorstCourse | null;
  recent_absence_streak: number;
  last_attended_date: string | null;
  is_at_risk: boolean;
  is_late_heavy: boolean;
  has_unmarked: boolean;
  is_dropped_out: boolean;
};
```

- [ ] **Step 4: Add mode-specific response type**

Add:

```ts
export type AttendanceGodViewModeResponse =
  | {
      isError: boolean;
      message: string;
      data: {
        summary: AttendanceGodViewDailySummary;
        results: AttendanceGodViewDailyRow[];
      };
      page: number;
      size: number;
      count: number;
    }
  | {
      isError: boolean;
      message: string;
      data: {
        summary: AttendanceGodViewMonthlySummary;
        results: AttendanceGodViewMonthlyRow[];
      };
      page: number;
      size: number;
      count: number;
    }
  | AttendanceGodViewSearchResponse;
```

- [ ] **Step 5: Run TypeScript check**

Run the repo's frontend verification command:

```bash
npm run lint
```

Expected: no new type or lint errors in `src/types/attendance-god-view.ts`.

### Task 7: Frontend Component Extraction

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-summary-cards.tsx`
- Create: `schedjuice-reimagined-fe/src/components/attendance-god-view/daily-absences-table.tsx`
- Create: `schedjuice-reimagined-fe/src/components/attendance-god-view/monthly-student-summary-table.tsx`
- Create: `schedjuice-reimagined-fe/src/components/attendance-god-view/risk-overview-table.tsx`

- [ ] **Step 1: Create summary cards component**

Create `attendance-god-view-summary-cards.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AttendanceGodViewDailySummary,
  AttendanceGodViewMonthlySummary,
  AttendanceGodViewSummary,
} from "@/types/attendance-god-view";

type Props =
  | { mode: "daily_absences"; summary?: AttendanceGodViewDailySummary; isLoading: boolean }
  | { mode: "monthly_students"; summary?: AttendanceGodViewMonthlySummary; isLoading: boolean }
  | { mode: "risk"; summary?: AttendanceGodViewSummary; isLoading: boolean };

export function AttendanceGodViewSummaryCards(props: Props) {
  const cards =
    props.mode === "daily_absences"
      ? [
          ["Absent", props.summary?.absent_count ?? 0],
          ["Not marked yet", props.summary?.unmarked_count ?? 0],
          ["Courses affected", props.summary?.courses_affected_count ?? 0],
          ["Students with streaks", props.summary?.students_with_streaks_count ?? 0],
        ]
      : props.mode === "monthly_students"
        ? [
            ["Students at risk", props.summary?.students_at_risk_count ?? 0],
            ["Total absences", props.summary?.total_absences ?? 0],
            ["Not marked yet", props.summary?.unmarked_count ?? 0],
            ["Worst course", props.summary?.worst_course?.course_title ?? "None"],
          ]
        : [
            ["Avg attendance", `${props.summary?.average_attendance_rate ?? 0}%`],
            ["At-risk pairs", props.summary?.at_risk_count ?? 0],
            ["Absent (7 days)", props.summary?.absent_last_7_days_total ?? 0],
            ["Late-heavy", props.summary?.late_heavy_count ?? 0],
          ];

  return (
    <div className="flex flex-wrap gap-3">
      {cards.map(([label, value]) => (
        <Card key={label} className="min-w-[160px] flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            {props.isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create daily table component**

Create `daily-absences-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AttendanceGodViewDailyRow } from "@/types/attendance-god-view";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

type Props = {
  rows: AttendanceGodViewDailyRow[];
  onOpenDetail: (row: AttendanceGodViewDailyRow) => void;
};

export function DailyAbsencesTable({ rows, onOpenDetail }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Course</TableHead>
          <TableHead>Session</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Streak</TableHead>
          <TableHead>Last attended</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              No absences or unmarked attendance for this day.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={`${row.student_id}-${row.course_id}-${row.event_id}`}>
              <TableCell>
                <div className="font-medium">{row.student_name}</div>
                <div className="text-xs text-muted-foreground">{row.student_email}</div>
                {row.student_phone && (
                  <div className="text-xs text-muted-foreground">{row.student_phone}</div>
                )}
              </TableCell>
              <TableCell>
                <div>{row.course_title}</div>
                <div className="text-xs text-muted-foreground">
                  {row.category_name || row.program_name}
                </div>
              </TableCell>
              <TableCell>
                <div>{row.event_title}</div>
                <div className="text-xs text-muted-foreground">
                  {row.time_from} - {row.time_to}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={row.attendance_status === "absent" ? "destructive" : "outline"}>
                  {row.attendance_status === "absent" ? "Absent" : "Not marked yet"}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.recent_absence_streak}
              </TableCell>
              <TableCell>{row.last_attended_date ?? "-"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onOpenDetail(row)}>
                    Details
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/courses/${row.course_id}/attendance`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Create monthly table component**

Create `monthly-student-summary-table.tsx` with this public interface:

```tsx
type Props = {
  rows: AttendanceGodViewMonthlyRow[];
  onOpenDetail: (row: AttendanceGodViewMonthlyRow) => void;
};
```

Render columns in this order: `Student`, `Courses`, `Rate`, `P / L / A / Unmarked`, `Worst course`, `Streak`, `Last attended`, and actions. Use the empty-state text `No attendance records for this month.`.

- [ ] **Step 4: Create risk table component**

Create `risk-overview-table.tsx` with this public interface:

```tsx
type Props = {
  rows: AttendanceGodViewRow[];
  onOpenDetail: (row: AttendanceGodViewRow) => void;
};
```

Move the existing risk table markup from `page.tsx` into this component. Preserve the existing columns, badges, detail button, and course attendance link. Replace the visible fallback for missing dates with `"-"`.

- [ ] **Step 5: Run lint**

Run:

```bash
npm run lint
```

Expected: no new lint errors for the new components.

### Task 8: Frontend Filters, Page Wiring, And Exports

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-filters.tsx`
- Create: `schedjuice-reimagined-fe/src/components/attendance-god-view/attendance-god-view-detail-sheet.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/attendances/god-view/page.tsx`

- [ ] **Step 1: Create tab-aware filter component without teacher filter**

Create `attendance-god-view-filters.tsx` with props for date/month, course, category, program, status, dropped-out, sort, and page reset. Do not include `teacherId` or any users combobox for teachers.

The component must render:

```tsx
<EntityCombobox
  entity="courses"
  label="Course"
  value={courseId}
  onChange={(v) => {
    onCourseIdChange(v ?? "");
    onPageReset();
  }}
  comboboxPlaceholder="All courses"
  displayFunction={(c) => c.title}
  queryParams={{ fields: ["id", "title"], sorts: ["title"] }}
  allowDeselect
/>
```

- [ ] **Step 2: Add tab state to page**

In `page.tsx`, add:

```tsx
const [mode, setMode] = useQueryState(
  "mode",
  parseAsString.withDefault("daily_absences"),
);
const activeMode: AttendanceGodViewMode =
  mode === "monthly_students" || mode === "risk" ? mode : "daily_absences";
```

- [ ] **Step 3: Remove teacher query state and body field**

Delete `teacherId`, `setTeacherId`, and `body.teacher_id`. Remove `role.teacher` usage if it becomes unused.

- [ ] **Step 4: Send mode to backend**

Build search body as:

```tsx
const searchBody: AttendanceGodViewSearchBody & { mode: AttendanceGodViewMode } = {
  date_from: effectiveDateFrom,
  date_to: effectiveDateTo,
  include_dropped_out: includeDroppedOut === "true",
  sort,
  mode: activeMode,
};
```

- [ ] **Step 5: Render tabs**

Use existing tabs component if available. If no local tabs component exists, use simple buttons:

```tsx
<div className="flex flex-wrap gap-2">
  {[
    ["daily_absences", "Daily absences"],
    ["monthly_students", "Monthly student summary"],
    ["risk", "Risk overview"],
  ].map(([value, label]) => (
    <Button
      key={value}
      variant={activeMode === value ? "default" : "outline"}
      size="sm"
      onClick={() => {
        void setMode(value);
        void setPage(1);
      }}
    >
      {label}
    </Button>
  ))}
</div>
```

- [ ] **Step 6: Render mode-specific cards and table**

Use `AttendanceGodViewSummaryCards`, then render:

```tsx
{activeMode === "daily_absences" ? (
  <DailyAbsencesTable rows={dailyRows} onOpenDetail={openDetail} />
) : activeMode === "monthly_students" ? (
  <MonthlyStudentSummaryTable rows={monthlyRows} onOpenDetail={openDetail} />
) : (
  <RiskOverviewTable rows={riskRows} onOpenDetail={openDetail} />
)}
```

- [ ] **Step 7: Update export filename**

Set download names by mode:

```tsx
const exportFilename =
  activeMode === "daily_absences"
    ? `attendance-daily-absences-${effectiveDateFrom}.csv`
    : activeMode === "monthly_students"
      ? `attendance-monthly-summary-${effectiveDateFrom.slice(0, 7)}.csv`
      : `attendance-god-view-${effectiveDateFrom}_${effectiveDateTo}.csv`;
```

- [ ] **Step 8: Run frontend verification**

Run:

```bash
npm run lint
```

Expected: no new lint errors in the attendance Godview files.

### Task 9: Full Verification And Cleanup

**Files:**
- Verify: backend files changed in `schedjuice-reimagined-be`
- Verify: frontend files changed in `schedjuice-reimagined-fe`
- Verify: docs `schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-14-attendance-godview-design.md`

- [ ] **Step 1: Run backend tests**

Run from `schedjuice-reimagined-be`:

```bash
python manage.py test app_attendance.tests.test_god_view_services
```

Expected: PASS, or SKIP only if the existing PostgreSQL availability guard skips the test class.

- [ ] **Step 2: Run frontend lint**

Run from `schedjuice-reimagined-fe`:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Manual UI smoke test**

Open `/attendances/god-view` and verify:

- default tab is `Daily absences`
- no teacher filter appears
- course filter appears
- daily tab shows daily columns
- monthly tab shows one row per student
- risk tab still shows existing student-course pair behavior
- detail sheet opens from daily and monthly rows
- export button downloads mode-specific CSV

- [ ] **Step 4: Commit final implementation if commit permission exists**

```bash
git add app_attendance/god_view_services.py app_attendance/views.py app_attendance/tests/test_god_view_services.py
git add src/types/attendance-god-view.ts src/components/attendance-god-view src/app/\(internal\)/attendances/god-view/page.tsx
git add docs/superpowers/specs/2026-06-14-attendance-godview-design.md docs/superpowers/plans/2026-06-14-attendance-godview.md
git commit -m "Add tabbed attendance godview workflows"
```

Only run this commit step if the user explicitly asks for commits.

---

## Self-Review Notes

- Spec coverage: daily absences, monthly student summary, risk overview preservation, no teacher filter, course filtering, informational detail sheets, CSV exports, and tests are all covered.
- Scope: this is one connected full-stack feature. It touches backend service/API and the single frontend page, but does not introduce messaging or case-management workflows.
- Type consistency: mode values are `daily_absences`, `monthly_students`, and `risk` throughout the plan.
- Implementation caution: the current frontend page is large. Extracting table/filter/detail components should happen before adding too much new JSX to avoid making the file harder to maintain.
