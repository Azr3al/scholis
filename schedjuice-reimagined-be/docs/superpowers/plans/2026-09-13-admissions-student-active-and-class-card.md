# Admissions student Active status and class-card course info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admissions Students Status means attending at least one class (Active vs Alumni, with an Include alumni toggle), and each class card shows course facts (unit, dates, schedule, MT) above the existing payment block.

**Architecture:** Annotate `is_attending` on Admissions people search via `Exists` on open student memberships of active/paused/planned courses. Students default-filter to that set unless `include_alumni`. Amend `GET .../attending` to return ended classes when none are attending, and enrich each class with course + main-teacher fields. Do not write `User.is_active`.

**Tech Stack:** Django 4.2 + DRF, Next.js App Router, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-13-admissions-student-active-and-class-card-design.md`

## Global Constraints

- `admissions.view` remains the only gate. Do not widen Finance or `/users` / `/courses` search.
- Do not write or redefine `User.is_active`. Do not change User Hub or Finance `student_active_course_count`.
- Attending = student `UserCourse` (default manager: `left_at` null) on a course whose effective status is **active, paused, or planned**. Reuse `effective_status_q`. Do not use `course_is_effectively_active`.
- Students name search does **not** sneak alumni in. Staff keeps the User Hub `q` / `include_inactive` quirk.
- Copy: English, admin voice, no exclamation marks, no `text-transform: uppercase`. Status is ink text, no chip.
- Person panel has no identity header today; do not add one. Status is the People table column.
- BE tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- FE tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`
- Always `vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn(), post: vi.fn() } }))` before importing modules that pull nav / finance-record-nav / permissions.
- High-value tests only. No “renders People” smoke.
- Never touch the Railway/dev database.
- Two git repos: commit BE files in `schedjuice-reimagined-be`, FE files in `schedjuice-reimagined-fe`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `schedjuice-reimagined-be/app_admissions/services.py` | Modify | `annotate_is_attending`, `is_admissions_students_search`, `include_alumni_requested`, attending class-set + course/MT serialize |
| `schedjuice-reimagined-be/app_admissions/serializers.py` | Modify | Add `is_attending` |
| `schedjuice-reimagined-be/app_admissions/views.py` | Modify | Annotate + students default filter; pass `request` into attending |
| `schedjuice-reimagined-be/app_admissions/tests/test_people_search.py` | Modify | Attending vs alumni, include_alumni, disabled enrolled, `q` does not leak, sparse keys |
| `schedjuice-reimagined-be/app_admissions/tests/test_attending.py` | Modify | Alumni ended classes; `left_at`; unit/MT/dates/status shape |
| `schedjuice-reimagined-fe/src/types/api.ts` | Modify | `include_alumni` on `queryParamOptions` |
| `schedjuice-reimagined-fe/src/app/client-api/utils.ts` | Modify | Encode `include_alumni=true` |
| `schedjuice-reimagined-fe/src/helpers/admissions/people-filter-params.ts` | Create | Students omit `is_active`; Staff reuse hub inactive; tab counts |
| `schedjuice-reimagined-fe/src/helpers/admissions/people-filter-params.test.ts` | Create | Students vs Staff filter contracts |
| `schedjuice-reimagined-fe/src/helpers/admissions/format-course-schedule.ts` | Create | Shared Courses-desk weekday + clock string |
| `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-people-filters.ts` | Modify | `includeAlumni` URL param |
| `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-people.ts` | Modify | `is_attending`, `include_alumni`, admissions filter builder |
| `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-people-tab-counts.ts` | Modify | Students count without `is_active` |
| `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-toolbar.tsx` | Modify | Include alumni vs Include inactive by tab |
| `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.tsx` | Modify | Status Active/Alumni vs Active/Inactive |
| `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.test.tsx` | Modify | Request shape + Status copy |
| `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-toolbar.test.tsx` | Create | Toggle label by tab |
| `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-attending.ts` | Modify | Class course fields + `is_attending` |
| `schedjuice-reimagined-fe/src/components/admissions/people/person-attending-panel.tsx` | Modify | Course `dl` + empty copy |
| `schedjuice-reimagined-fe/src/components/admissions/people/person-attending-panel.test.tsx` | Modify | Unit omit, MT's contact, course Status, empty copy |
| `schedjuice-reimagined-fe/src/components/admissions/courses/admissions-courses-page.tsx` | Modify | Import shared schedule helper |

**Do not modify:** User Hub `filter-params.ts` behavior, Finance views, `User.is_active` writes, Academic Hub cards.

---

### Task 1: People search — `is_attending` and Include alumni

**Files:**
- Modify: `schedjuice-reimagined-be/app_admissions/tests/test_people_search.py`
- Modify: `schedjuice-reimagined-be/app_admissions/services.py`
- Modify: `schedjuice-reimagined-be/app_admissions/serializers.py`
- Modify: `schedjuice-reimagined-be/app_admissions/views.py`
- Test: `app_admissions.tests.test_people_search`

**Interfaces:**
- Consumes: `UserCourse` default manager (`left_at` null), `effective_status_q(active, paused, planned)`, request `filter_params` + query `include_alumni`
- Produces: annotated `is_attending: bool`; Students tab (`roles` `contained_by` `{student}`) filters `is_attending=True` unless `include_alumni` is truthy (`true` / `1` / `yes`)

- [ ] **Step 1: Write the failing tests**

In `test_people_search.py` add imports and helpers after the existing imports:

```python
from datetime import timedelta

from django.utils import timezone

from app_course.models import Category, Course, Program, UserCourse
```

Add to `AdmissionsPeopleSearchTests`:

```python
    def _student_filter(self):
        return {
            "field_name": "roles",
            "operator": "contained_by",
            "value": "{student}",
        }

    def _enroll(self, user, *, start_offset, end_offset, status_override=None):
        cat, _ = Category.objects.get_or_create(name=f"Adm ps cat {self.suffix}")
        prog, _ = Program.objects.get_or_create(
            name=f"Adm ps prog {self.suffix}",
            defaults={
                "course_creation_method": Program.CourseCreationMethod.MANUAL,
                "subject_strategy": Program.SubjectStrategy.NONE,
            },
        )
        today = timezone.localdate()
        course = Course.objects.create(
            title=f"Adm ps {user.id} {start_offset} {self.suffix}",
            category=cat,
            program=prog,
            start_date=today + timedelta(days=start_offset),
            end_date=today + timedelta(days=end_offset),
            status_override=status_override,
        )
        UserCourse.objects.create(
            user=user,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        return course
```

Change `test_admissions_only_ok_sparse_row` expected keys to include `"is_attending"`.

Add:

```python
    def test_students_default_hides_alumni(self):
        with schema_context(self.schema_name):
            self._enroll(self.listed, start_offset=-10, end_offset=10)
        resp = self._client(self.officer).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertIn(self.listed.id, ids)
        self.assertNotIn(self.inactive.id, ids)
        row = next(r for r in resp.json()["data"] if r["id"] == self.listed.id)
        self.assertTrue(row["is_attending"])

    def test_include_alumni_returns_non_attending_students(self):
        resp = self._client(self.officer).post(
            "/api/v1/admissions/people/search?page=1&size=24&include_alumni=true",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertIn(self.listed.id, ids)
        self.assertIn(self.inactive.id, ids)
        row = next(r for r in resp.json()["data"] if r["id"] == self.listed.id)
        self.assertFalse(row["is_attending"])

    def test_students_q_does_not_include_alumni(self):
        resp = self._client(self.officer).post(
            "/api/v1/admissions/people/search?page=1&size=24&q=Listed",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertNotIn(self.listed.id, ids)

    def test_disabled_account_still_attending_is_listed(self):
        with schema_context(self.schema_name):
            self._enroll(self.inactive, start_offset=-10, end_offset=10)
        resp = self._client(self.officer).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertIn(self.inactive.id, ids)

    def test_paused_counts_as_attending(self):
        with schema_context(self.schema_name):
            self._enroll(
                self.listed,
                start_offset=-10,
                end_offset=10,
                status_override=Course.StatusOverride.PAUSED,
            )
        resp = self._client(self.officer).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertIn(self.listed.id, ids)

    def test_ended_only_is_alumni(self):
        with schema_context(self.schema_name):
            self._enroll(self.listed, start_offset=-40, end_offset=-10)
        resp = self._client(self.officer).post(
            "/api/v1/admissions/people/search?page=1&size=24",
            {"filter_params": [self._student_filter()]},
            format="json",
        )
        ids = [r["id"] for r in resp.json()["data"]]
        self.assertNotIn(self.listed.id, ids)
```

Keep `test_include_inactive_off_hides_inactive` unchanged (Staff-style `is_active` filter).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_people_search`

Expected: FAIL — `is_attending` missing from row keys; alumni still listed on Students default.

- [ ] **Step 3: Implement annotation and Students filter**

In `services.py` add (keep existing payment helpers):

```python
from django.db.models import Exists, OuterRef, QuerySet

from app_auth.models import User
from app_course.course_status import compute_effective_status, effective_status_q
from app_course.models import Course, UserCourse

ATTENDING_STATUSES = {
    Course.CourseStatus.ACTIVE,
    Course.CourseStatus.PAUSED,
    Course.CourseStatus.PLANNED,
}

ENDED_STATUS = Course.CourseStatus.ENDED


def _truthy_query_param(request, name: str) -> bool:
    raw = request.query_params.get(name)
    if raw is None:
        return False
    return str(raw).lower() in ("true", "1", "yes")


def include_alumni_requested(request) -> bool:
    return _truthy_query_param(request, "include_alumni")


def is_admissions_students_search(request) -> bool:
    for fp in request.data.get("filter_params") or []:
        if fp.get("field_name") != "roles":
            continue
        if fp.get("operator") != "contained_by":
            continue
        raw = str(fp.get("value") or "").strip()
        if raw.startswith("{") and raw.endswith("}"):
            raw = raw[1:-1]
        parts = {p.strip() for p in raw.split(",") if p.strip()}
        return parts == {User.UserRole.STUDENT}
    return False


def attending_membership_exists():
    return Exists(
        UserCourse.objects.filter(
            user_id=OuterRef("pk"),
            assigned_as=UserCourse.AssignedAs.STUDENT,
            course__in=Course.objects.filter(
                effective_status_q(*ATTENDING_STATUSES)
            ),
        )
    )


def annotate_is_attending(queryset: QuerySet) -> QuerySet:
    return queryset.annotate(is_attending=attending_membership_exists())
```

In `serializers.py` add `is_attending` to `AdmissionsPersonSerializer`:

```python
class AdmissionsPersonSerializer(BaseModelSerializer):
    is_attending = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "name",
            "alternative_name",
            "email",
            "phone_number",
            "is_active",
            "is_attending",
        )
```

In `AdmissionsPeopleSearchView.augment_search_queryset`, after the `q` block:

```python
        from app_admissions.services import (
            annotate_is_attending,
            include_alumni_requested,
            is_admissions_students_search,
        )

        queryset = annotate_is_attending(queryset)
        if is_admissions_students_search(self.request) and not include_alumni_requested(
            self.request
        ):
            queryset = queryset.filter(is_attending=True)
        return queryset
```

In `AdmissionsPersonAttendingView.get`, load the user through the annotation so the serializer has `is_attending`:

```python
        from app_admissions.services import annotate_is_attending, attending_classes_for_user

        user = annotate_is_attending(User.objects.filter(pk=id)).first()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_people_search`

Expected: PASS. Also run `app_admissions.tests.test_attending` — attending GET must still 200 with `is_attending` present.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_admissions/services.py app_admissions/serializers.py app_admissions/views.py app_admissions/tests/test_people_search.py
git commit -m "feat(admissions): derive is_attending and hide alumni by default"
```

---

### Task 2: Attending class set — alumni ended classes

**Files:**
- Modify: `schedjuice-reimagined-be/app_admissions/tests/test_attending.py`
- Modify: `schedjuice-reimagined-be/app_admissions/services.py`
- Test: `app_admissions.tests.test_attending`

**Interfaces:**
- Consumes: `ATTENDING_STATUSES`, `compute_effective_status`, `UserCourse.objects` (open memberships only)
- Produces: `attending_classes_for_user(user, *, request=None)` — if any attending class, return only those; else ended open student memberships; else `[]`. Teacher memberships never appear.

- [ ] **Step 1: Write the failing tests**

Keep `test_planned_included_ended_excluded` (student in setup has attending classes, so ended stays hidden).

Add:

```python
    def test_alumni_sees_ended_classes_only(self):
        with schema_context(self.schema_name):
            alumni = User.objects.create_user(
                email=f"adm-att-al-{self.suffix}@example.com",
                password="x",
                name="Alumni Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=alumni,
                course=self.ended,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            from app_admissions.services import attending_classes_for_user

            rows = attending_classes_for_user(alumni)
        titles = {r["title"] for r in rows}
        self.assertEqual(titles, {self.ended.title})

    def test_never_enrolled_returns_empty(self):
        with schema_context(self.schema_name):
            ghost = User.objects.create_user(
                email=f"adm-att-gh-{self.suffix}@example.com",
                password="x",
                name="Ghost",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            from app_admissions.services import attending_classes_for_user

            rows = attending_classes_for_user(ghost)
        self.assertEqual(rows, [])

    def test_left_at_membership_omitted(self):
        with schema_context(self.schema_name):
            UserCourse.including_ended.filter(
                user=self.student, course=self.planned
            ).update(left_at=timezone.now())
            from app_admissions.services import attending_classes_for_user

            rows = attending_classes_for_user(self.student)
        titles = {r["title"] for r in rows}
        self.assertNotIn(self.planned.title, titles)
        self.assertIn(self.active.title, titles)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_attending`

Expected: FAIL — alumni with only an ended course gets `[]` because ended is skipped.

- [ ] **Step 3: Split attending vs ended in `attending_classes_for_user`**

Replace the membership loop:

```python
def attending_classes_for_user(user: User, *, request=None) -> list[dict]:
    memberships = UserCourse.objects.filter(
        user=user,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("course")
    attending = []
    ended = []
    for uc in memberships:
        status = compute_effective_status(uc.course)
        row = {
            "course_id": uc.course_id,
            "title": uc.course.title,
            "latest_payment": latest_payment(user.id, uc.course_id),
        }
        if status in ATTENDING_STATUSES:
            attending.append(row)
        elif status == ENDED_STATUS:
            ended.append(row)
    return attending or ended
```

`UserCourse.objects` already excludes `left_at` set. Pass `request` through unused for now so Task 3 can use it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_attending`

Expected: PASS (`test_planned_included_ended_excluded` still omits ended for the setup student).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_admissions/services.py app_admissions/tests/test_attending.py
git commit -m "feat(admissions): list ended classes for alumni with no attending"
```

---

### Task 3: Enrich attending classes with course facts and MT

**Files:**
- Modify: `schedjuice-reimagined-be/app_admissions/tests/test_attending.py`
- Modify: `schedjuice-reimagined-be/app_admissions/services.py`
- Modify: `schedjuice-reimagined-be/app_admissions/views.py`
- Test: `app_admissions.tests.test_attending`

**Interfaces:**
- Consumes: `annotate_current_unit`, `annotate_course_queryset_first_event_times`, `AdmissionsCourseSerializer`, `AssignedAsRole.Seniority.MAIN_TEACHER`, `is_substitute=False`
- Produces: each class dict:

```
course_id, title, status,
start_date, end_date,
weekday_pattern, first_event_time_from, first_event_time_to,
current_unit, current_unit_updated_at,
main_teachers: [{ id, name, phone_number }],
latest_payment
```

`main_teachers` ordered by `user__name`, then `user_id`. Substitute MTs omitted. `phone_number` may be null.

- [ ] **Step 1: Write the failing tests**

```python
from datetime import time

from app_announcement.models import Announcement, PostType
from app_course.models import AssignedAsRole, Event
```

Add on the setup student (inside a new test, not setUp):

```python
    def test_class_includes_course_facts_and_mt(self):
        with schema_context(self.schema_name):
            self.active.repeat_every = ["Mon", "Wed"]
            self.active.save(update_fields=["repeat_every"])
            Event.objects.create(
                title=f"Sess {self.suffix}",
                course=self.active,
                date=timezone.now(),
                time_from=time(16, 0),
                time_to=time(17, 30),
            )
            Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=8,
                data="<p>8</p>",
                html_data="<p>8</p>",
                course=self.active,
                created_by=self.officer,
            )
            mt_role = AssignedAsRole.objects.create(
                name=f"MT att {self.suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=False,
            )
            sub_role = AssignedAsRole.objects.create(
                name=f"Sub MT att {self.suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
                is_substitute=True,
            )
            mt = User.objects.create_user(
                email=f"adm-att-mt-{self.suffix}@example.com",
                password="x",
                name="Aye Aye",
                phone_number="959111",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            sub = User.objects.create_user(
                email=f"adm-att-sub-{self.suffix}@example.com",
                password="x",
                name="Subby",
                phone_number="959222",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            UserCourse.objects.create(
                user=mt,
                course=self.active,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=mt_role,
            )
            UserCourse.objects.create(
                user=sub,
                course=self.active,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=sub_role,
            )
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.active.id
            )
        self.assertEqual(row["status"], Course.CourseStatus.ACTIVE)
        self.assertEqual(row["start_date"], self.active.start_date.isoformat())
        self.assertEqual(row["weekday_pattern"], "Mon Wed")
        self.assertIsNotNone(row["first_event_time_from"])
        self.assertEqual(row["current_unit"], 8)
        self.assertEqual(
            row["main_teachers"],
            [{"id": mt.id, "name": "Aye Aye", "phone_number": "959111"}],
        )

    def test_no_mt_is_empty_list(self):
        with schema_context(self.schema_name):
            from app_admissions.services import attending_classes_for_user

            row = next(
                r
                for r in attending_classes_for_user(self.student)
                if r["course_id"] == self.planned.id
            )
        self.assertEqual(row["main_teachers"], [])
        self.assertIsNone(row["current_unit"])
```

`Event.date` is a `DateTimeField` — `timezone.now()` is correct.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_attending`

Expected: FAIL — `status` / `main_teachers` KeyError.

- [ ] **Step 3: Serialize selected courses in one query**

In `services.py`:

```python
from app_admissions.course_unit import annotate_current_unit
from app_admissions.serializers import AdmissionsCourseSerializer
from app_course.course_search_queryset import annotate_course_queryset_first_event_times
from app_course.course_status import annotate_effective_status
from app_course.models import AssignedAsRole


def _main_teachers_by_course(course_ids: list[int]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {cid: [] for cid in course_ids}
    rows = (
        UserCourse.objects.filter(
            course_id__in=course_ids,
            assigned_as=UserCourse.AssignedAs.TEACHER,
            assigned_as_role__seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            assigned_as_role__is_substitute=False,
        )
        .select_related("user")
        .order_by("user__name", "user_id")
    )
    for uc in rows:
        out[uc.course_id].append(
            {
                "id": uc.user_id,
                "name": uc.user.name,
                "phone_number": uc.user.phone_number,
            }
        )
    return out


def _serialize_class_rows(
    user: User, courses: list[Course], *, request=None
) -> list[dict]:
    if not courses:
        return []
    ids = [c.id for c in courses]
    qs = annotate_effective_status(
        annotate_current_unit(
            annotate_course_queryset_first_event_times(
                Course.objects.filter(id__in=ids)
            )
        )
    )
    by_id = {c.id: c for c in qs}
    teachers = _main_teachers_by_course(ids)
    context = {"request": request} if request is not None else {}
    out = []
    for course_id in ids:
        course = by_id[course_id]
        data = AdmissionsCourseSerializer(course, context=context).data
        out.append(
            {
                "course_id": data["id"],
                "title": data["title"],
                "status": data["status"],
                "start_date": data["start_date"],
                "end_date": data["end_date"],
                "weekday_pattern": data["weekday_pattern"],
                "first_event_time_from": data["first_event_time_from"],
                "first_event_time_to": data["first_event_time_to"],
                "current_unit": data["current_unit"],
                "current_unit_updated_at": data["current_unit_updated_at"],
                "main_teachers": teachers.get(course_id, []),
                "latest_payment": latest_payment(user.id, course_id),
            }
        )
    return out


def attending_classes_for_user(user: User, *, request=None) -> list[dict]:
    memberships = UserCourse.objects.filter(
        user=user,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("course")
    attending_courses = []
    ended_courses = []
    for uc in memberships:
        status = compute_effective_status(uc.course)
        if status in ATTENDING_STATUSES:
            attending_courses.append(uc.course)
        elif status == ENDED_STATUS:
            ended_courses.append(uc.course)
    chosen = attending_courses or ended_courses
    return _serialize_class_rows(user, chosen, request=request)
```

In `AdmissionsPersonAttendingView.get`:

```python
        data["classes"] = attending_classes_for_user(user, request=request)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_admissions.tests.test_attending app_admissions.tests.test_people_search`

Expected: PASS. If Event creation errors on `date`, fix the test to the model’s field type — do not change Event.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_admissions/services.py app_admissions/views.py app_admissions/tests/test_attending.py
git commit -m "feat(admissions): enrich attending classes with course facts and MT"
```

---

### Task 4: FE Students filter contract — Include alumni, no `is_active`

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/admissions/people-filter-params.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/admissions/people-filter-params.test.ts`
- Modify: `schedjuice-reimagined-fe/src/types/api.ts`
- Modify: `schedjuice-reimagined-fe/src/app/client-api/utils.ts`
- Modify: `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-people-filters.ts`
- Modify: `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-people.ts`
- Modify: `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-people-tab-counts.ts`
- Test: `src/helpers/admissions/people-filter-params.test.ts`

**Interfaces:**
- Consumes: hub role filters via `buildHubUserFilterParams` / `buildHubUserTabCountFilterParams` internals — **do not change those exports’ Staff/User Hub behavior**. New admissions helpers wrap them.
- Produces:

```ts
export type AdmissionsPeopleFilterState = {
  tab: UserHubTab;
  q: string;
  page: number;
  includeInactive: boolean;
  includeAlumni: boolean;
  incomplete: boolean;
};

buildAdmissionsPeopleFilterParams(state): { filter_params }
  // Students: role contained_by student; never is_active; incomplete unchanged
  // Staff: same as buildHubUserFilterParams (is_active when !q && !includeInactive)

buildAdmissionsPeopleTabCountFilterParams(tab)
  // Students: role only
  // Staff: role + is_active=true
```

Query: Students send `include_alumni: true` when `includeAlumni`; Staff send `include_inactive` when `includeInactive`. Never send the other tab’s flag.

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildAdmissionsPeopleFilterParams,
  buildAdmissionsPeopleTabCountFilterParams,
} from "./people-filter-params";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";

const students = {
  tab: "students" as const,
  q: "",
  page: 1,
  includeInactive: false,
  includeAlumni: false,
  incomplete: false,
};

describe("buildAdmissionsPeopleFilterParams", () => {
  it("omits is_active on Students even when includeAlumni is off", () => {
    const { filter_params } = buildAdmissionsPeopleFilterParams(students);
    expect(filter_params.some((f) => f.field_name === "is_active")).toBe(false);
    expect(filter_params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_name: "roles",
          operator: operatorEnum.contained_by,
          value: `{${role.student}}`,
        }),
      ]),
    );
  });

  it("still sends is_active on Staff when includeInactive is off and q is empty", () => {
    const { filter_params } = buildAdmissionsPeopleFilterParams({
      ...students,
      tab: "staff",
    });
    expect(filter_params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_name: "is_active",
          operator: operatorEnum.exact,
          value: "true",
        }),
      ]),
    );
  });
});

describe("buildAdmissionsPeopleTabCountFilterParams", () => {
  it("counts Students by role only", () => {
    const { filter_params } = buildAdmissionsPeopleTabCountFilterParams("students");
    expect(filter_params.some((f) => f.field_name === "is_active")).toBe(false);
    expect(filter_params).toHaveLength(1);
  });

  it("counts Staff active-only", () => {
    const { filter_params } = buildAdmissionsPeopleTabCountFilterParams("staff");
    expect(filter_params).toHaveLength(2);
    expect(filter_params[1]).toMatchObject({
      field_name: "is_active",
      value: "true",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/admissions/people-filter-params.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers, query param, and wire hooks**

`people-filter-params.ts`:

```ts
import { buildHubUserFilterParams } from "@/helpers/user-hub/filter-params";
import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import type { UserHubTab } from "@/types/user-hub";

export type AdmissionsPeopleFilterState = {
  tab: UserHubTab;
  q: string;
  page: number;
  includeInactive: boolean;
  includeAlumni: boolean;
  incomplete: boolean;
};

function studentRoleFilter(): filterParam {
  return {
    field_name: "roles",
    operator: operatorEnum.contained_by,
    value: `{${role.student}}`,
  };
}

export function buildAdmissionsPeopleFilterParams(
  state: AdmissionsPeopleFilterState,
): Required<Pick<filterParamsBody, "filter_params">> {
  if (state.tab === "students") {
    const filter_params: filterParam[] = [studentRoleFilter()];
    if (state.incomplete) {
      filter_params.push({
        field_name: "profile_completeness",
        operator: operatorEnum.lt,
        value: "100",
      });
    }
    return { filter_params };
  }
  return buildHubUserFilterParams({ ...state, view: "list" });
}

export function buildAdmissionsPeopleTabCountFilterParams(
  tab: UserHubTab,
): Required<Pick<filterParamsBody, "filter_params">> {
  if (tab === "students") {
    return { filter_params: [studentRoleFilter()] };
  }
  return buildHubUserFilterParams({
    tab: "staff",
    q: "",
    page: 1,
    includeInactive: false,
    incomplete: false,
    view: "list",
  });
}
```

Add to `queryParamOptions`:

```ts
    include_inactive?: boolean
    include_alumni?: boolean
```

In `makeSearchParams` after `include_inactive`:

```ts
  if (queryParams.include_alumni) {
    data.include_alumni = "true";
  }
```

Filters hook: add `includeAlumni: parseAsBoolean.withDefault(false)` and `setIncludeAlumni`. Keep `includeInactive`. State type is `AdmissionsPeopleFilterState` (stop using `Omit<UserHubFilterSet, "view">` if it cannot hold `includeAlumni`).

`use-admissions-people.ts`:

- `PEOPLE_FIELDS` include `"is_attending"`
- `AdmissionsPersonRow.is_attending: boolean`
- `searchEntities` query: Students `include_alumni` when `state.includeAlumni`; Staff `include_inactive` when `state.includeInactive`
- body: `buildAdmissionsPeopleFilterParams(state)`

Tab counts: `buildAdmissionsPeopleTabCountFilterParams(tab)` instead of hub tab counts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/admissions/people-filter-params.test.ts src/components/admissions/people/admissions-people-page.test.tsx`

Expected: helper PASS. People page test may fail until Task 5 updates the nuqs mock — if it fails only on missing `includeAlumni` in state, add `includeAlumni: false` to the page test mock in this task so the list still loads.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/admissions/people-filter-params.ts src/helpers/admissions/people-filter-params.test.ts src/types/api.ts src/app/client-api/utils.ts src/hooks/admissions/use-admissions-people-filters.ts src/hooks/admissions/use-admissions-people.ts src/hooks/admissions/use-admissions-people-tab-counts.ts src/components/admissions/people/admissions-people-page.test.tsx
git commit -m "feat(admissions): Students search uses include_alumni not is_active"
```

---

### Task 5: Toolbar copy and People Status column

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-toolbar.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-toolbar.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/admissions/people/admissions-people-page.test.tsx`
- Test: `src/components/admissions/people/admissions-people-toolbar.test.tsx` and `admissions-people-page.test.tsx`

**Interfaces:**
- Consumes: `AdmissionsPeopleFilterState`, `row.is_attending`, `row.is_active`, `state.tab`
- Produces: Students toggle **Include alumni** (`aria-label` **Include alumni**); Staff **Include inactive**. Students Status **Active** / **Alumni**; Staff **Active** / **Inactive**.

- [ ] **Step 1: Write the failing tests**

Toolbar (mock the filters hook):

```ts
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  axiosClient: { get: vi.fn(), post: vi.fn() },
}));

const filters = {
  state: {
    tab: "students" as const,
    q: "",
    page: 1,
    includeInactive: false,
    includeAlumni: false,
    incomplete: false,
  },
  setTab: vi.fn(),
  setQ: vi.fn(),
  setPage: vi.fn(),
  setIncludeInactive: vi.fn(),
  setIncludeAlumni: vi.fn(),
  setIncomplete: vi.fn(),
};

vi.mock("@/hooks/admissions/use-admissions-people-filters", () => ({
  useAdmissionsPeopleFilters: () => filters,
}));

import { AdmissionsPeopleToolbar } from "./admissions-people-toolbar";

afterEach(() => {
  cleanup();
  filters.state.tab = "students";
});

describe("AdmissionsPeopleToolbar", () => {
  it("shows Include alumni on Students, not Include inactive", () => {
    render(<AdmissionsPeopleToolbar />);
    expect(screen.getByLabelText("Include alumni")).toBeTruthy();
    expect(screen.queryByLabelText("Include inactive people")).toBeNull();
  });

  it("shows Include inactive on Staff", () => {
    filters.state.tab = "staff";
    render(<AdmissionsPeopleToolbar />);
    expect(screen.getByLabelText("Include inactive people")).toBeTruthy();
    expect(screen.queryByLabelText("Include alumni")).toBeNull();
  });
});
```

People page: add `is_attending: true` to default fixture (Status **Active**). Add:

```ts
  it("does not send is_active on Students list", async () => {
    renderPage();
    await screen.findByRole("button", { name: /aung/i });
    const listCall = searchEntities.mock.calls.find(
      (call) => (call[1] as { size?: number } | undefined)?.size === 24,
    );
    const body = listCall?.[2] as {
      filter_params?: Array<{ field_name?: string }>;
    };
    expect(body.filter_params?.some((f) => f.field_name === "is_active")).toBe(
      false,
    );
    expect(
      (listCall?.[1] as { include_alumni?: boolean }).include_alumni,
    ).toBeUndefined();
  });

  it("shows Alumni when is_attending is false", async () => {
    searchEntities.mockResolvedValue({
      data: {
        data: [
          {
            id: 11,
            name: "Aung",
            email: "a@x",
            phone_number: "09",
            is_active: true,
            is_attending: false,
          },
        ],
        count: 1,
        total_pages: 1,
      },
    });
    renderPage();
    await screen.findByRole("button", { name: /aung/i });
    expect(screen.getByText("Alumni")).toBeTruthy();
    expect(screen.queryByText("Inactive")).toBeNull();
  });
```

Update the nuqs mock default state with `includeAlumni: false`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/admissions/people/admissions-people-toolbar.test.tsx src/components/admissions/people/admissions-people-page.test.tsx`

Expected: FAIL — Include inactive still on Students; Status still Active from `is_active`.

- [ ] **Step 3: Implement toolbar and Status accessor**

Toolbar: if `state.tab === "students"`, switch bound to `includeAlumni` / `setIncludeAlumni`, label **Include alumni**, `aria-label` **Include alumni**. Else existing Include inactive.

People table Status:

```ts
accessor: (row) =>
  state.tab === "students"
    ? row.is_attending
      ? "Active"
      : "Alumni"
    : row.is_active
      ? "Active"
      : "Inactive",
```

Include `state.tab` in the `useMemo` deps.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/admissions/people/admissions-people-toolbar.test.tsx src/components/admissions/people/admissions-people-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/admissions/people/admissions-people-toolbar.tsx src/components/admissions/people/admissions-people-toolbar.test.tsx src/components/admissions/people/admissions-people-page.tsx src/components/admissions/people/admissions-people-page.test.tsx
git commit -m "feat(admissions): Active/Alumni status and Include alumni toggle"
```

---

### Task 6: Attending card — course facts and empty copy

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/admissions/format-course-schedule.ts`
- Modify: `schedjuice-reimagined-fe/src/components/admissions/courses/admissions-courses-page.tsx`
- Modify: `schedjuice-reimagined-fe/src/hooks/admissions/use-admissions-attending.ts`
- Modify: `schedjuice-reimagined-fe/src/components/admissions/people/person-attending-panel.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/admissions/people/person-attending-panel.test.tsx`
- Test: `src/components/admissions/people/person-attending-panel.test.tsx`

**Interfaces:**
- Consumes: Task 3 class JSON; `CourseRange`; `formatCurrentUnitDisplay`; `formatAdmissionsCourseSchedule` (same logic as today’s private `formatCourseTime` in the Courses page, including the `"—"` fallback)
- Produces: course `dl` above payment. Omit Unit when `current_unit` is null. Omit **MT's contact** when `main_teachers` is empty (**MT** **—**). Course Status row only when `status` is not `"active"`. Empty `classes` → **No classes on record.**

- [ ] **Step 1: Write the failing panel tests**

Extend `AdmissionsAttendingClass` in the test helper:

```ts
function cls(
  overrides: Partial<AdmissionsAttendingClass> & { title?: string } = {},
): AdmissionsAttendingClass {
  return {
    course_id: 1,
    title: "FCE Reading and Writing",
    status: "active",
    start_date: "2026-07-28",
    end_date: "2027-03-31",
    weekday_pattern: "Mon Wed",
    first_event_time_from: "16:00:00",
    first_event_time_to: "17:30:00",
    current_unit: 8,
    current_unit_updated_at: "2026-08-03",
    main_teachers: [{ id: 9, name: "Aye Aye", phone_number: "09" }],
    latest_payment: null,
    ...overrides,
  };
}
```

Mock `useTenant` like the Courses page test (`timezone: "UTC"`).

Add (keep existing payment tests; give those class objects the new required fields via `cls({ latest_payment: pay() })`):

```ts
  it("omits Unit when current_unit is null", () => {
    renderWithClasses([cls({ current_unit: null, current_unit_updated_at: null })]);
    expect(screen.queryByText("Unit")).toBeNull();
  });

  it("labels phone as MT's contact and omits it when there is no MT", () => {
    const { unmount } = renderWithClasses([cls()]);
    expect(screen.getByText("MT's contact").nextElementSibling?.textContent).toBe(
      "09",
    );
    unmount();
    renderWithClasses([cls({ main_teachers: [] })]);
    expect(screen.getByText("MT").nextElementSibling?.textContent).toBe("—");
    expect(screen.queryByText("MT's contact")).toBeNull();
  });

  it("omits course Status when active and shows it when paused", () => {
    const { unmount } = renderWithClasses([cls({ status: "active" })]);
    expect(screen.queryByText("paused")).toBeNull();
    unmount();
    renderWithClasses([cls({ status: "paused" })]);
    expect(screen.getByText("Status").nextElementSibling?.textContent).toBe(
      "paused",
    );
  });

  it("says No classes on record when classes is empty", () => {
    renderWithClasses([]);
    expect(screen.getByText("No classes on record.")).toBeTruthy();
    expect(
      screen.queryByText("Not attending any active or planned classes."),
    ).toBeNull();
  });
```

The paused case has two **Status** labels (course then payment). Scope the course one: query within the course block, or render `latest_payment: null` so only course Status exists. Use `latest_payment: null` in the paused test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/admissions/people/person-attending-panel.test.tsx`

Expected: FAIL — old empty copy; no **MT's contact**.

- [ ] **Step 3: Types, shared schedule helper, panel**

`format-course-schedule.ts`: move `formatCourseTime` from `admissions-courses-page.tsx` unchanged (same imports), export as `formatAdmissionsCourseSchedule`. Courses page imports it.

`AdmissionsAttendingClass`:

```ts
export type AdmissionsMainTeacher = {
  id: number;
  name: string;
  phone_number?: string | null;
};

export type AdmissionsAttendingClass = {
  course_id: number;
  title: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
  current_unit?: number | null;
  current_unit_updated_at?: string | null;
  main_teachers: AdmissionsMainTeacher[];
  latest_payment: AdmissionsLatestPayment | null;
};
```

`AdmissionsAttendingPayload` includes `is_attending: boolean`.

Panel course block (before payment):

```tsx
function CourseFacts({ row }: { row: AdmissionsAttendingClass }) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const unit = formatCurrentUnitDisplay(
    row.current_unit,
    row.current_unit_updated_at,
  );
  const teachers = row.main_teachers ?? [];
  const showCourseStatus = row.status && row.status !== "active";

  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {unit ? (
        <>
          <dt className="text-text-muted">Unit</dt>
          <dd className="tabular-nums">{unit}</dd>
        </>
      ) : null}
      <dt className="text-text-muted">Dates</dt>
      <dd>
        <CourseRange startDate={row.start_date} endDate={row.end_date} />
      </dd>
      <dt className="text-text-muted">Schedule</dt>
      <dd>{formatAdmissionsCourseSchedule(row, tenant?.timezone, timeFormat)}</dd>
      {teachers.length === 0 ? (
        <>
          <dt className="text-text-muted">MT</dt>
          <dd>—</dd>
        </>
      ) : (
        teachers.map((mt) => (
          <Fragment key={mt.id}>
            <dt className="text-text-muted">MT</dt>
            <dd>{mt.name}</dd>
            <dt className="text-text-muted">MT's contact</dt>
            <dd>{mt.phone_number?.trim() || "—"}</dd>
          </Fragment>
        ))
      )}
      {showCourseStatus ? (
        <>
          <dt className="text-text-muted">Status</dt>
          <dd>{row.status}</dd>
        </>
      ) : null}
    </dl>
  );
}
```

Empty copy: **No classes on record.**

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/admissions/people/person-attending-panel.test.tsx src/components/admissions/courses/admissions-courses-page.test.tsx src/components/admissions/people/admissions-people-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/admissions/format-course-schedule.ts src/components/admissions/courses/admissions-courses-page.tsx src/hooks/admissions/use-admissions-attending.ts src/components/admissions/people/person-attending-panel.tsx src/components/admissions/people/person-attending-panel.test.tsx
git commit -m "feat(admissions): show course facts and MT contact on class cards"
```

---

## Spec coverage (self-review)

| Spec item | Task |
| --- | --- |
| `is_attending` Exists; paused/planned count; `left_at` | 1, 2 |
| Students default attending-only; `include_alumni`; `q` does not leak | 1, 4 |
| Staff Include inactive / `is_active` unchanged | 1, 4, 5 |
| Status Active/Alumni vs Active/Inactive | 5 |
| Students tab count attending-only | 4 |
| Disabled + attending still listed | 1 |
| Class set attending else ended else empty | 2 |
| Unit, dates, schedule, MT, MT's contact, course Status if not active | 3, 6 |
| Empty **No classes on record.** | 6 |
| No `User.is_active` write; no Finance/User Hub | all (non-touch) |
| Person identity header | omitted (does not exist; Status is the table) |
