# Teacher course assignment history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep teacher `UserCourse` rows after unassign (`joined_at` / `left_at`) and replace TR SU finance reports with one month-aware Teacher Courses Glide sheet.

**Architecture:** Default `UserCourse.objects` is open rows only (`left_at` is null); `including_ended` is history. Teacher unassign sets `left_at` instead of deleting. Teacher Courses GET/POST mirrors Excellent Choice. Analytics shows **Teacher Courses** for `TR_SU_STYLE`. Classes Data / MT-AT / Dropout are removed. Both report sheets use `PageContainer width="full"`.

**Tech Stack:** Django + DRF + django-tenants (`schedjuice-reimagined-be`), Next.js + Glide + Vitest (`schedjuice-reimagined-fe`).

**Spec:** `docs/superpowers/specs/2026-08-19-teacher-course-assignment-history-design.md`

## Global Constraints

- Students: still hard-delete `UserCourse`. Teachers: close (`left_at`).
- Do not change `UserEvent` create/soft-delete on teacher remove.
- Do not change payroll math or Microsoft Payroll (`reports/hr/payroll`).
- Teacher Courses API: `analytics.view` and `report_style == TR_SU_STYLE` else 403.
- Nested “current roster” reads must not include closed teachers.
- Raw SQL member counts must ignore `left_at IS NOT NULL`.
- High-value tests only (auth, overlap, unique, nav). No “grid renders” smoke.
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <label>` (always `--keepdb` via the script). Never `manage.py test` against Railway/dev DB.
- Frontend tests: `cd schedjuice-reimagined-fe && pnpm exec vitest run --config vitest.config.mts <file>`.
- Existing `UserCourse.objects.filter(...).exists() is False` after teacher remove **still passes if the row is only closed**. Always assert `including_ended` when proving history.

---

## File structure

| File | Responsibility |
|---|---|
| `schedjuice-reimagined-be/app_course/models.py` | `joined_at`, `left_at`, managers, partial unique |
| `schedjuice-reimagined-be/app_course/migrations/0109_usercourse_joined_left_at.py` | Schema + backfill `joined_at=created_at` (number = next after HEAD) |
| `schedjuice-reimagined-be/app_course/user_course_lifecycle.py` | `close_teacher_user_course` |
| `schedjuice-reimagined-be/app_course/roster_management.py` | Close teachers; delete students |
| `schedjuice-reimagined-be/app_course/roster_writes.py` | `execute_remove_staff` closes |
| `schedjuice-reimagined-be/app_course/substitute_removal.py` | Cron closes |
| `schedjuice-reimagined-be/app_course/views.py` | `UserCourseDetailsView.delete` closes teachers |
| `schedjuice-reimagined-be/app_course/course_member_counts.py` | `AND left_at IS NULL` on all count SQL |
| `schedjuice-reimagined-be/app_course/course_search_queryset.py` | Roster expand already uses `UserCourse.objects` (active after Task 1) |
| `schedjuice-reimagined-be/app_reports/teacher_courses.py` | Overlap helper, JSON rows, column meta, Excel |
| `schedjuice-reimagined-be/app_reports/views.py` | `TeacherCoursesReportView`; shrink `HR_REPORT_TYPES` |
| `schedjuice-reimagined-be/app_reports/urls.py` | `reports/teacher-courses` |
| `schedjuice-reimagined-be/app_reports/services.py` | Remove `get_teacher_courses_report` / `get_classes_data_report` |
| `schedjuice-reimagined-be/app_reports/sql_strings.py` | Remove `classes_data_sql` |
| `schedjuice-reimagined-be/docs/HR_REPORT_VIEW.md` | Payroll-only |
| `schedjuice-reimagined-be/app_course/tests/test_user_course_assignment_history.py` | Roster history tests |
| `schedjuice-reimagined-be/app_reports/tests/test_teacher_courses_report.py` | Report API tests |
| `schedjuice-reimagined-fe/src/lib/reports/tenant-report-links.ts` | Single TR SU link |
| `schedjuice-reimagined-fe/src/config/finance-record-nav.ts` | Teacher Courses + Excellent Choice entries |
| `schedjuice-reimagined-fe/src/components/finances/finance-homepage-content.tsx` | Button label from link |
| `schedjuice-reimagined-fe/src/types/reports.ts` | Drop extra `TrSuReportType` keys |
| `schedjuice-reimagined-fe/src/lib/data-sheets/teacher-courses-columns.ts` | Column builders |
| `schedjuice-reimagined-fe/src/app/(internal)/finances/reports/teacher-courses/page.tsx` | Month sheet |
| `schedjuice-reimagined-fe/src/app/(internal)/finances/reports/excellent-choice/page.tsx` | `width="full"` |
| Delete: `schedjuice-reimagined-fe/src/app/(internal)/finances/reports/classes-data/page.tsx` | Dead report |

---

### Task 1: `UserCourse` intervals + active manager

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/models.py` (`UserCourse`)
- Create: `schedjuice-reimagined-be/app_course/migrations/0109_usercourse_joined_left_at.py` (or next number)
- Create: `schedjuice-reimagined-be/app_course/tests/test_user_course_assignment_history.py`

**Interfaces:**
- Consumes: existing `UserCourse` / `BaseModel.created_at`
- Produces: `UserCourse.joined_at: datetime`; `UserCourse.left_at: datetime | None`; `UserCourse.objects` = open rows; `UserCourse.including_ended` = all rows; constraint `usercourse_one_open_per_user_course`

- [ ] **Step 1: Write the failing tests**

Create `schedjuice-reimagined-be/app_course/tests/test_user_course_assignment_history.py`:

```python
import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.db import IntegrityError, connection, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_course.program_helpers import get_default_program
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class UserCourseAssignmentHistoryTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"hist-t-{suffix}@example.com",
                password="x",
                name="Hist Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            cat = Category.objects.create(name=f"Hist {suffix}")
            prog = get_default_program() or Program.objects.create(
                name=f"Hist Prog {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Hist Course {suffix}",
                category=cat,
                program=prog,
                start_date=date.today(),
                end_date=date.today() + timedelta(days=30),
            )

    def test_objects_hides_closed_rows(self):
        with schema_context(self.schema_name):
            uc = UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            uc.left_at = timezone.now()
            uc.save(update_fields=["left_at"])
            self.assertFalse(
                UserCourse.objects.filter(id=uc.id).exists()
            )
            self.assertTrue(
                UserCourse.including_ended.filter(id=uc.id).exists()
            )

    def test_partial_unique_allows_reassign_after_close(self):
        with schema_context(self.schema_name):
            first = UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            first.left_at = timezone.now()
            first.save(update_fields=["left_at"])
            second = UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            self.assertNotEqual(first.id, second.id)
            self.assertIsNone(second.left_at)

    def test_two_open_rows_rejected(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    UserCourse.including_ended.create(
                        user=self.teacher,
                        course=self.course,
                        assigned_as=UserCourse.AssignedAs.TEACHER,
                    )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_user_course_assignment_history
```

Expected: FAIL (no `including_ended` / `left_at` / constraint).

- [ ] **Step 3: Implement model + migration**

In `UserCourse` (`app_course/models.py`):

```python
from django.db.models import Q, UniqueConstraint

class OpenUserCourseManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(left_at__isnull=True)

# on UserCourse:
joined_at = models.DateTimeField(default=django_timezone.now)
left_at = models.DateTimeField(null=True, blank=True)

objects = OpenUserCourseManager()
including_ended = models.Manager()

class Meta:
    base_manager_name = "including_ended"
    constraints = [
        UniqueConstraint(
            fields=["user", "course"],
            condition=Q(left_at__isnull=True),
            name="usercourse_one_open_per_user_course",
        )
    ]
```

Remove `unique_together = ("user", "course")`.

Migration: add fields; `RunPython` `joined_at = created_at` where needed; drop old unique; add partial unique. `left_at` null for all existing rows.

- [ ] **Step 4: Re-run tests**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_user_course_assignment_history
```

Expected: PASS.

- [ ] **Step 5: Commit (backend)**

```bash
git add app_course/models.py app_course/migrations/0109_usercourse_joined_left_at.py app_course/tests/test_user_course_assignment_history.py
git commit -m "feat: keep UserCourse history with joined_at and left_at"
```

---

### Task 2: Close teachers on unassign (all write paths)

**Files:**
- Create: `schedjuice-reimagined-be/app_course/user_course_lifecycle.py`
- Modify: `schedjuice-reimagined-be/app_course/roster_management.py`
- Modify: `schedjuice-reimagined-be/app_course/roster_writes.py` (`execute_remove_staff`)
- Modify: `schedjuice-reimagined-be/app_course/substitute_removal.py`
- Modify: `schedjuice-reimagined-be/app_course/views.py` (`UserCourseDetailsView.delete`)
- Modify: `schedjuice-reimagined-be/app_course/course_member_counts.py`
- Modify: `schedjuice-reimagined-be/app_course/tests/test_user_course_assignment_history.py`
- Modify: `schedjuice-reimagined-be/app_course/tests/test_roster_writes.py` (`test_execute_remove_staff`, `test_execute_remove_staff_preserves_user_events_with_checkin`)
- Modify: `schedjuice-reimagined-be/app_course/tests/test_substitute_removal.py` (`test_removes_assignment_after_last_session_date`)

**Interfaces:**
- Consumes: `UserCourse.including_ended`, `UserCourse.AssignedAs.TEACHER`
- Produces: `close_teacher_user_course(user_course: UserCourse, *, at=None) -> UserCourse`

- [ ] **Step 1: Write the failing tests**

Add to `test_user_course_assignment_history.py`:

```python
from app_course.user_course_lifecycle import close_teacher_user_course
from app_course.roster_writes import execute_remove_staff
from app_course.models import CourseMembershipEvent

def test_close_teacher_sets_left_at(self):
    with schema_context(self.schema_name):
        uc = UserCourse.objects.create(
            user=self.teacher,
            course=self.course,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        )
        closed = close_teacher_user_course(uc)
        self.assertIsNotNone(closed.left_at)
        self.assertFalse(UserCourse.objects.filter(id=uc.id).exists())
        self.assertTrue(UserCourse.including_ended.filter(id=uc.id).exists())

def test_student_unassign_still_deletes(self):
    with schema_context(self.schema_name):
        student = User.objects.create_user(
            email=f"hist-s-{uuid4().hex[:6]}@example.com",
            password="x",
            name="Hist Student",
            phone_number="-",
            date_of_birth=date(2010, 1, 1),
            roles=[User.UserRole.STUDENT],
        )
        uc = UserCourse.objects.create(
            user=student,
            course=self.course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        uc_id = uc.id
        uc.delete()
        self.assertFalse(UserCourse.including_ended.filter(id=uc_id).exists())
```

Update `test_execute_remove_staff` assertions to:

```python
self.assertFalse(
    UserCourse.objects.filter(user_id=self.teacher.id, course_id=self.course.id).exists()
)
ended = UserCourse.including_ended.get(user_id=self.teacher.id, course_id=self.course.id)
self.assertIsNotNone(ended.left_at)
```

Same pattern for the checkin-preserving remove test and substitute expiry (`including_ended` still has the row).

Add a member-count test: after close, `refresh_course_member_counts_now([course.id])` then `Course.objects.get(id=...).main_teacher_count` (or assistant) dropped; do **not** count the closed row.

Add `test_course_expand_omits_closed_teacher`: close a teacher, `GET /api/v1/courses/{id}?expand=user_courses` as a manager, assert no `user_courses` item with that `UserCourse` id.

- [ ] **Step 2: Run tests to verify they fail**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_user_course_assignment_history app_course.tests.test_roster_writes app_course.tests.test_substitute_removal
```

Expected: FAIL on `including_ended` still-present / count SQL.

- [ ] **Step 3: Implement close helper and wire paths**

`user_course_lifecycle.py`:

```python
from django.utils import timezone
from app_course.models import UserCourse

def close_teacher_user_course(user_course: UserCourse, *, at=None) -> UserCourse:
    if user_course.assigned_as != UserCourse.AssignedAs.TEACHER:
        raise ValueError("close_teacher_user_course only accepts teacher rows")
    if user_course.left_at is not None:
        return user_course
    user_course.left_at = at or timezone.now()
    user_course.save(update_fields=["left_at"])
    return user_course
```

- `execute_remove_staff`: replace `user_course.delete()` with `close_teacher_user_course(user_course)`. Keep membership event + `soft_delete_userevents`.
- `substitute_removal`: same (keep event + UE soft-delete).
- `apply_user_course_management`: for teacher rows in `deleted_user_courses`, close instead of `UserCourse.objects.filter(id__in=...).delete()`. Still **delete** student rows. Keep UE soft-delete for teachers.
- `UserCourseDetailsView.delete`: if teacher, close (plus existing UE/Teams side effects) and return the same success shape as delete; if student, keep `super().delete()`.

In `_FULL_REFRESH_SQL` and `_SCOPED_REFRESH_SQL`, every `FROM app_course_usercourse` count gets `AND left_at IS NULL` (students and teachers).

- [ ] **Step 4: Re-run tests**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_user_course_assignment_history app_course.tests.test_roster_writes app_course.tests.test_substitute_removal
```

Expected: PASS.

- [ ] **Step 5: Commit (backend)**

```bash
git add app_course/user_course_lifecycle.py app_course/roster_management.py app_course/roster_writes.py app_course/substitute_removal.py app_course/views.py app_course/course_member_counts.py app_course/tests/
git commit -m "feat: close teacher UserCourse on unassign instead of deleting"
```

---

### Task 3: Teacher Courses overlap + API

**Files:**
- Create: `schedjuice-reimagined-be/app_reports/teacher_courses.py`
- Create: `schedjuice-reimagined-be/app_reports/tests/test_teacher_courses_report.py`
- Modify: `schedjuice-reimagined-be/app_reports/views.py`
- Modify: `schedjuice-reimagined-be/app_reports/urls.py`
- Modify: `schedjuice-reimagined-be/app_reports/services.py` (stop exporting old CSV `get_teacher_courses_report`; can delete that function in Task 4)

**Interfaces:**
- Consumes: `UserCourse.including_ended`, `get_course_type` from `app_reports.services`, `_tz_for_tenant`
- Produces:
  - `assignment_overlaps_local_dates(joined_at, left_at, date_from, date_to, tz) -> bool`
  - `teacher_courses_rows(date_from, date_to, *, org) -> list[dict]`
  - `teacher_courses_columns_meta() -> list[dict]`
  - `get_teacher_courses_xlsx(date_from, date_to, *, org) -> HttpResponse`
  - Routes: `GET/POST /api/v1/reports/teacher-courses`

Row dict keys (locked): `name`, `email`, `course`, `course_type`, `role`, `course_start_date`, `course_end_date`, `joined_at`, `left_at`, `course_id`, `user_id`.

Overlap (inclusive, tenant local dates):

```text
joined_local <= date_to AND (left_at is None OR left_local >= date_from)
```

Naive datetimes: treat as UTC then convert. Do **not** filter course effective status ACTIVE.

- [ ] **Step 1: Write the failing tests**

Create `app_reports/tests/test_teacher_courses_report.py` using the Excellent Choice tenant pattern (`schema_name = "xschedjuice"`, `Organization.objects.filter(...).update(report_style=TR_SU_STYLE)` on public schema).

Tests:

1. `test_teacher_forbidden` → GET 403.
2. `test_wrong_report_style_is_forbidden` → set `EXCELLENT_CHOICE_STYLE`, finance GET 403.
3. `test_missing_date_from_is_bad_request` → 400, details mention `date_from`.
4. `test_overlap_includes_left_mid_month` — join before month, `left_at` mid-month → row present.
5. `test_overlap_excludes_left_before_month` — `left_at` before `date_from` → absent.
6. `test_overlap_excludes_joined_after_month` — `joined_at` after `date_to` → absent.
7. `test_still_open_included` — `left_at` null → present.
8. `test_empty_month_returns_empty_list` → 200, `data == []`.
9. `test_students_never_appear`.
10. `test_post_returns_xlsx` — Content-Type spreadsheetml.

Caller-contract: GET query params only `date_from` and `date_to` (no body).

- [ ] **Step 2: Run tests to verify they fail**

```bash
./scripts/run_backend_tests.sh app_reports.tests.test_teacher_courses_report
```

Expected: FAIL (404 / missing module).

- [ ] **Step 3: Implement helper + view**

`TeacherCoursesReportView` copies Excellent Choice: `_parse_date_range`, style check for `TR_SU_STYLE`, `GET` `self.ok(rows, columns=teacher_courses_columns_meta())`, `POST` xlsx. `required_permissions` `GET/POST: analytics.view`.

URL next to excellent-choice:

```python
path("reports/teacher-courses", views.TeacherCoursesReportView.as_view(), name="teacher-courses-report"),
```

- [ ] **Step 4: Re-run tests**

```bash
./scripts/run_backend_tests.sh app_reports.tests.test_teacher_courses_report
```

Expected: PASS.

- [ ] **Step 5: Commit (backend)**

```bash
git add app_reports/teacher_courses.py app_reports/views.py app_reports/urls.py app_reports/tests/test_teacher_courses_report.py
git commit -m "feat: add month-aware Teacher Courses report API"
```

---

### Task 4: Delete dead HR reports (backend)

**Files:**
- Modify: `schedjuice-reimagined-be/app_reports/views.py` (`HR_REPORT_TYPES = ["payroll"]`; remove teacher_courses/classes_data branches)
- Modify: `schedjuice-reimagined-be/app_reports/services.py` (delete `get_teacher_courses_report`, `get_classes_data_report`, unused format helpers only used by classes_data)
- Modify: `schedjuice-reimagined-be/app_reports/sql_strings.py` (delete `classes_data_sql`; keep `course_data_sheet_sql`)
- Modify: `schedjuice-reimagined-be/docs/HR_REPORT_VIEW.md` (payroll only)

**Interfaces:**
- Consumes: Microsoft Payroll still `POST reports/hr/payroll`
- Produces: `POST reports/hr/classes_data` and `POST reports/hr/teacher_courses` are 400 invalid report type

- [ ] **Step 1: Write the failing test**

In `test_teacher_courses_report.py` (or a tiny `test_hr_report_types.py`):

```python
def test_legacy_classes_data_hr_type_rejected(self):
    resp = self._client(self.finance).post(
        f"{self.api_prefix}/reports/hr/classes_data",
        {"date_from": self.date_from, "date_to": self.date_to},
        format="json",
    )
    self.assertEqual(resp.status_code, 400)
```

Same for `reports/hr/teacher_courses` and `reports/hr/mt_at_ratios`.

Keep `test_rbac` / payroll path working — do not delete payroll.

- [ ] **Step 2: Run to see current 200 vs 400**

```bash
./scripts/run_backend_tests.sh app_reports.tests.test_teacher_courses_report
```

Expected: FAIL until types removed (classes_data may 200 today).

- [ ] **Step 3: Delete code + rewrite `HR_REPORT_VIEW.md` to payroll-only**

- [ ] **Step 4: Re-run**

```bash
./scripts/run_backend_tests.sh app_reports.tests.test_teacher_courses_report app_reports.tests.test_rbac_reports
```

Expected: PASS. `reports/hr/payroll` still 200 for authorized users if covered.

- [ ] **Step 5: Commit (backend)**

```bash
git add app_reports/views.py app_reports/services.py app_reports/sql_strings.py docs/HR_REPORT_VIEW.md app_reports/tests/
git commit -m "chore: remove unused TR SU HR report types"
```

---

### Task 5: Nav — Teacher Courses only (frontend)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/lib/reports/tenant-report-links.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/reports/tenant-report-links.test.ts`
- Modify: `schedjuice-reimagined-fe/src/types/reports.ts`
- Modify: `schedjuice-reimagined-fe/src/config/finance-record-nav.ts`
- Modify: `schedjuice-reimagined-fe/src/config/__tests__/finance-record-nav.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/finances/finance-homepage-content.tsx`

**Interfaces:**
- Consumes: `ReportStyle`
- Produces: TR SU → one link `{ label: "Teacher Courses", href: "/finances/reports/teacher-courses" }`; `getReportsNavHref` that href; Analytics ids `teacher_courses` and `excellent_choice`

- [ ] **Step 1: Write the failing tests**

Replace “four TR SU report links” in `tenant-report-links.test.ts`:

```ts
it("returns Teacher Courses only for TR SU", () => {
  const links = getTenantReportLinks(tenant(ReportStyle.TR_SU_STYLE));
  expect(links).toEqual([
    {
      label: "Teacher Courses",
      href: "/finances/reports/teacher-courses",
    },
  ]);
});

it("returns the Teacher Courses path for TR SU nav", () => {
  expect(getReportsNavHref(tenant(ReportStyle.TR_SU_STYLE))).toBe(
    "/finances/reports/teacher-courses",
  );
});
```

Keep Excellent Choice and unset-style cases.

In `finance-record-nav.test.ts`, extend `adminTenant` with `report_style` and `canAny` including `analytics.view`:

```ts
it("shows Teacher Courses under analytics for TR SU, not Finance report", () => {
  const ids = visibleFinanceRecordEntries(
    configureUser,
    { ...adminTenant, report_style: ReportStyle.TR_SU_STYLE } as organizationType,
    canAnyConfigure,
  ).map((e) => e.id);
  expect(ids).toContain("teacher_courses");
  expect(ids).not.toContain("finance_report");
  expect(ids).not.toContain("excellent_choice");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe
pnpm exec vitest run --config vitest.config.mts src/lib/reports/tenant-report-links.test.ts src/config/__tests__/finance-record-nav.test.ts
```

Expected: FAIL (four links / `finance_report`).

- [ ] **Step 3: Implement**

`getTenantReportLinks` for TR SU: return the single Teacher Courses object (do not map `TrSuReportType` keys).

`types/reports.ts`: keep only `teacher_courses` or delete the enum if unused.

`finance-record-nav.ts`:

- Extend `FinanceRecordNavId` with `"teacher_courses" | "excellent_choice"`; remove `"finance_report"`.
- Replace the finance_report entry with:

```ts
{
  id: "teacher_courses",
  label: "Teacher Courses",
  href: "/finances/reports/teacher-courses",
  group: "analytics",
  requiredPermissions: ["analytics.view"],
  canShow: (tenant) => tenant.report_style === ReportStyle.TR_SU_STYLE,
},
{
  id: "excellent_choice",
  label: "Excellent Choice Style",
  href: "/finances/reports/excellent-choice",
  group: "analytics",
  requiredPermissions: ["analytics.view"],
  canShow: (tenant) =>
    tenant.report_style === ReportStyle.EXCELLENT_CHOICE_STYLE,
},
```

Homepage button: `{tenantReportLinks[0]?.label ?? "Reports"}` instead of `FINANCE_REPORT_BUTTON_LABEL`. Remove the unused constant if nothing else imports it.

- [ ] **Step 4: Re-run tests**

```bash
pnpm exec vitest run --config vitest.config.mts src/lib/reports/tenant-report-links.test.ts src/config/__tests__/finance-record-nav.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (frontend)**

```bash
git add src/lib/reports/tenant-report-links.ts src/lib/reports/tenant-report-links.test.ts src/types/reports.ts src/config/finance-record-nav.ts src/config/__tests__/finance-record-nav.test.ts src/components/finances/finance-homepage-content.tsx
git commit -m "feat: show Teacher Courses in analytics for TR SU tenants"
```

---

### Task 6: Teacher Courses sheet + full-width grids + delete Classes Data

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/data-sheets/teacher-courses-columns.ts`
- Create: `schedjuice-reimagined-fe/src/lib/data-sheets/teacher-courses-columns.test.ts`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/finances/reports/teacher-courses/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/finances/reports/excellent-choice/page.tsx` (`PageContainer width="full"`)
- Delete: `schedjuice-reimagined-fe/src/app/(internal)/finances/reports/classes-data/page.tsx`

**Interfaces:**
- Consumes: `GET reports/teacher-courses?date_from=&date_to=`; `POST reports/teacher-courses` Excel
- Produces: `/finances/reports/teacher-courses` month picker + Glide sheet; both report pages `width="full"`

- [ ] **Step 1: Write the failing column test**

`teacher-courses-columns.test.ts` — high-value only: field mapping / empty `left_at` display, not “page renders”.

```ts
import { describe, expect, it } from "vitest";
import {
  TEACHER_COURSES_FIELDS,
  formatTeacherCoursesLeftAt,
} from "./teacher-courses-columns";

describe("teacher-courses-columns", () => {
  it("keeps joined_at and left_at in the locked column order", () => {
    expect(TEACHER_COURSES_FIELDS).toEqual([
      "name",
      "email",
      "course",
      "course_type",
      "role",
      "course_start_date",
      "course_end_date",
      "joined_at",
      "left_at",
      "course_id",
      "user_id",
    ]);
  });

  it("renders open assignments with an empty left_at", () => {
    expect(formatTeacherCoursesLeftAt(null)).toBe("");
    expect(formatTeacherCoursesLeftAt("")).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm exec vitest run --config vitest.config.mts src/lib/data-sheets/teacher-courses-columns.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement columns + page**

`teacher-courses-columns.ts`: export `TEACHER_COURSES_FIELDS`, `formatTeacherCoursesLeftAt`, `buildTeacherCoursesColumns` (Glide `GridColumn[]` from API `columns` meta if present, else the locked fields), `toTeacherCoursesFieldByColumn`.

Page: copy Excellent Choice structure (`useFinancePageHeader` or `usePageHeader`, `YearMonthSelector`, `nuqs` month date, `useQuery` GET with first/last day of month, `DataSheet` + `makeReadOnlyAdapter`, Excel `useMutation` POST `responseType: "blob"`, `CopyInput`, `SheetFullscreenShell`). Differences:

- Gate: if `tenant.report_style !== ReportStyle.TR_SU_STYLE`, `router.replace("/finances/reports")`.
- No summary row.
- `PageContainer width="full"`.
- Keep the Excellent Choice “Back to Reports” link; the hub still auto-redirects when there is a single report.

Excellent Choice: change `width="wide"` → `width="full"` only.

Delete `classes-data/page.tsx`.

- [ ] **Step 4: Re-run unit tests**

```bash
pnpm exec vitest run --config vitest.config.mts src/lib/data-sheets/teacher-courses-columns.test.ts src/lib/reports/tenant-report-links.test.ts
```

Expected: PASS. Manually open `/finances/reports/teacher-courses` on a TR SU tenant: sheet loads, month changes refetch, Excel downloads, grid is not capped at 1280px. `/finances/reports/classes-data` 404s.

- [ ] **Step 5: Commit (frontend)**

```bash
git add src/lib/data-sheets/teacher-courses-columns.ts src/lib/data-sheets/teacher-courses-columns.test.ts src/app/\(internal\)/finances/reports/teacher-courses/page.tsx src/app/\(internal\)/finances/reports/excellent-choice/page.tsx
git rm src/app/\(internal\)/finances/reports/classes-data/page.tsx
git commit -m "feat: add Teacher Courses sheet and widen report grids"
```

---

## Self-review (spec coverage)

| Spec item | Task |
|---|---|
| `joined_at` / `left_at`, partial unique, managers | 1 |
| Teacher close; student delete; UE unchanged | 2 |
| Nested roster / member counts ignore closed | 2 |
| Teacher Courses GET/POST, overlap, 403, columns | 3 |
| Delete Classes Data / MT-AT / Dropout HR | 4 |
| Analytics Teacher Courses; homepage label | 5 |
| Sheet + month picker + `width="full"` + delete classes-data page | 6 |
| No payroll formula / no UserEvent history | constraints |
| No backfill of already-deleted assignments | Task 1 backfill `created_at` only |
