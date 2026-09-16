# Session-credit scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manual programs can enable session-credit scheduling so teachers pick an exact number of calendar dates (default 8); first/last dates become the course span, and the Schedule tab keeps a per-course cap.

**Architecture:** `Program.is_session_credit_scheduling` + `Program.default_max_sessions` choose the engine. `Course.max_sessions` is the cap. Events stay discrete rows via existing `edit-events`. A React-free `session-credit-draft` helper owns click/cap/span rules. Create and the Schedule tab reuse `MonthGrid`; weekly `SimpleSchedulePicker` is unchanged for other programs.

**Tech Stack:** Django + DRF (`schedjuice-reimagined-be`), Next.js + Vitest (`schedjuice-reimagined-fe`), existing `MonthGrid` / `CourseScheduleEditor` / `edit-events`.

**Spec:** `docs/superpowers/specs/2026-08-18-session-credit-scheduling-design.md`

## Global Constraints

- No `Organization` columns and no tenant-settings UI for this mode.
- Session-credit is valid only when `course_creation_method == "manual"`; intake-based + credit is 400.
- Exact-N (`len == max`) is create-form only. Backend always enforces `count <= max`, not exact-N.
- One session per calendar date. Duplicate dates are 400.
- Persistence is existing discrete `Event` rows + `POST courses/{id}/edit-events`.
- Reuse `MonthGrid`. Do not add a second calendar widget.
- WD/WE (`is_wd_we_course_types_enabled`) is untouched.
- Intake wizard, add-to-intake, and `generate-courses` are out of scope.
- Teacher-facing copy: no exclamation marks. Cap note: `Raise Max sessions to add more.`
- `Course.program` cannot change (`CourseSerializer.update` already rejects it). Do not implement “move course onto a credit program.”
- High-value tests only (auth/validation/cap/span). No “calendar renders” smoke.
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <label>` (always `--keepdb` via the script). Never `manage.py test` against Railway/dev DB.
- Frontend tests: `cd schedjuice-reimagined-fe && pnpm test:unit <file>`.

---

## File structure

| File | Responsibility |
|---|---|
| `schedjuice-reimagined-be/app_course/models.py` | Program + Course fields |
| `schedjuice-reimagined-be/app_course/migrations/0108_program_session_credit_and_course_max_sessions.py` | Schema (number may be 0108+ if HEAD moved) |
| `schedjuice-reimagined-be/app_course/session_credit_services.py` | Program combo validation helpers, backfill, simulated-event cap/dup/span |
| `schedjuice-reimagined-be/app_course/serializers.py` | `ProgramSerializer.validate` + `update` backfill; `CourseSerializer.validate` max rules |
| `schedjuice-reimagined-be/app_course/views.py` | `CourseEventEditView` calls session-credit checks before apply |
| `schedjuice-reimagined-be/app_course/tests/test_session_credit_scheduling.py` | All BE tests for this feature |
| `schedjuice-reimagined-fe/src/helpers/session-credit-draft.ts` | Toggle date, cap, exact-N, shared vs override, implied span, UI mode |
| `schedjuice-reimagined-fe/src/helpers/session-credit-draft.test.ts` | Draft + UI-mode tests |
| `schedjuice-reimagined-fe/src/helpers/create-course-schedule.ts` | Credit create-then-`edit-events` path |
| `schedjuice-reimagined-fe/src/types/program.ts` | Program form fields |
| `schedjuice-reimagined-fe/src/types/course.ts` | `max_sessions` + nested program flags; exclude from course info AutoForm |
| `schedjuice-reimagined-fe/src/app/(internal)/programs/[id]/settings/page.tsx` | Settings fields |
| `schedjuice-reimagined-fe/src/app/(internal)/programs/[id]/settings/program-settings-sections.ts` | Section keys |
| `schedjuice-reimagined-fe/src/components/scheduling/manual-course-form.tsx` | Create UI swap |
| `schedjuice-reimagined-fe/src/components/calendar/grid/month-grid.tsx` | `onEmptyDayClick` |
| `schedjuice-reimagined-fe/src/components/calendar/course-schedule/course-schedule-editor.tsx` | Credit mode Schedule tab |
| `schedjuice-reimagined-fe/src/components/calendar/course-schedule/session-credit-toolbar.tsx` | Max + From/To + `n of max` caption (keep editor from growing) |

---

### Task 1: Program fields + intake-based rejection

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/models.py` (`Program`, after `subject_strategy`)
- Modify: `schedjuice-reimagined-be/app_course/models.py` (`Course`, after `end_date`)
- Create: `schedjuice-reimagined-be/app_course/session_credit_services.py`
- Modify: `schedjuice-reimagined-be/app_course/serializers.py` (`ProgramSerializer.validate`)
- Create: `schedjuice-reimagined-be/app_course/tests/test_session_credit_scheduling.py`
- Create: migration via `makemigrations`

**Interfaces:**
- Consumes: `Program.CourseCreationMethod`
- Produces: `Program.is_session_credit_scheduling: bool` (default `False`); `Program.default_max_sessions: int` (default `8`, 1–365); `Course.max_sessions: int | None`; `validate_session_credit_program_attrs(attrs, instance) -> None` raises `ValidationError`

- [ ] **Step 1: Write the failing tests**

Create `schedjuice-reimagined-be/app_course/tests/test_session_credit_scheduling.py`:

```python
import unittest
from datetime import date, datetime, time, timezone as dt_timezone
from uuid import uuid4

from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Event, Program
from app_course.program_helpers import get_default_program
from app_course.serializers import CourseSerializer, ProgramSerializer
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from django.core.management import call_command


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class SessionCreditSchedulingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=cls.schema_name).update(
                timezone="UTC"
            )

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-sc-{suffix}@example.com",
                password="pw",
                phone_number="1",
                communication_email=f"admin-sc-{suffix}@example.com",
                name="Admin SC",
                date_of_birth=date(1990, 1, 1),
                code=f"admin-sc-{suffix}",
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"teacher-sc-{suffix}@example.com",
                password="pw",
                phone_number="2",
                communication_email=f"teacher-sc-{suffix}@example.com",
                name="Teacher SC",
                date_of_birth=date(1990, 1, 1),
                code=f"teacher-sc-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.program = Program.objects.create(
                name=f"SC Manual {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
            )
            self.intake_program = Program.objects.create(
                name=f"SC Intake {suffix}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_credit_plus_intake_based_is_400(self):
        with schema_context(self.schema_name):
            ser = ProgramSerializer(
                instance=self.intake_program,
                data={"is_session_credit_scheduling": True},
                partial=True,
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("is_session_credit_scheduling", ser.errors)

    def test_credit_plus_manual_is_valid(self):
        with schema_context(self.schema_name):
            ser = ProgramSerializer(
                instance=self.program,
                data={
                    "is_session_credit_scheduling": True,
                    "default_max_sessions": 8,
                },
                partial=True,
            )
            self.assertTrue(ser.is_valid(), ser.errors)

    def test_default_max_sessions_rejects_zero_and_366(self):
        with schema_context(self.schema_name):
            for value in (0, 366):
                ser = ProgramSerializer(
                    instance=self.program,
                    data={"default_max_sessions": value},
                    partial=True,
                )
                self.assertFalse(ser.is_valid())
                self.assertIn("default_max_sessions", ser.errors)

    def test_switching_credit_program_to_intake_based_is_400(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            ser = ProgramSerializer(
                instance=self.program,
                data={"course_creation_method": Program.CourseCreationMethod.INTAKE_BASED},
                partial=True,
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("is_session_credit_scheduling", ser.errors)

    def test_teacher_cannot_patch_program_credit_fields(self):
        client = self._client(self.teacher)
        with schema_context(self.schema_name):
            resp = client.patch(
                f"/api/v1/programs/{self.program.id}",
                {"is_session_credit_scheduling": True},
                format="json",
            )
        self.assertEqual(resp.status_code, 403)
```

Put `test_teacher_cannot_patch_program_credit_fields` on a **subclass without** `@override_settings(RBAC_ENFORCE="log_only")` so the assertion is a real 403, not log-only. Keep the other tests on the log_only class so they match `test_course_event_edit.py`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_session_credit_scheduling
```

Expected: FAIL (import error or `is_session_credit_scheduling` missing).

- [ ] **Step 3: Add model fields, service validator, serializer hook, migration**

On `Program` after `subject_strategy`:

```python
from django.core.validators import MaxValueValidator, MinValueValidator

is_session_credit_scheduling = models.BooleanField(
    default=False,
    help_text="When true, courses in this program use click-calendar session-credit scheduling.",
)
default_max_sessions = models.PositiveIntegerField(
    default=8,
    validators=[MinValueValidator(1), MaxValueValidator(365)],
    help_text="Default max sessions seeded onto new session-credit courses.",
)
```

On `Course` after `end_date`:

```python
max_sessions = models.PositiveIntegerField(
    null=True,
    blank=True,
    validators=[MaxValueValidator(365)],
    help_text="Session-credit cap. Null on weekly programs.",
)
```

Create `app_course/session_credit_services.py`:

```python
from rest_framework.exceptions import ValidationError

from app_course.models import Program


def validate_session_credit_program_attrs(attrs: dict, instance) -> None:
    method = attrs.get(
        "course_creation_method",
        getattr(instance, "course_creation_method", None),
    )
    credit = attrs.get(
        "is_session_credit_scheduling",
        getattr(instance, "is_session_credit_scheduling", False),
    )
    if credit and method == Program.CourseCreationMethod.INTAKE_BASED:
        raise ValidationError(
            {
                "is_session_credit_scheduling": (
                    "Session-credit scheduling is only valid for manual programs."
                )
            }
        )
    default_max = attrs.get(
        "default_max_sessions",
        getattr(instance, "default_max_sessions", 8),
    )
    if default_max is not None and (default_max < 1 or default_max > 365):
        raise ValidationError(
            {"default_max_sessions": "Must be between 1 and 365."}
        )
```

In `ProgramSerializer.validate`, after the existing protected-program check:

```python
from app_course.session_credit_services import validate_session_credit_program_attrs

validate_session_credit_program_attrs(attrs, self.instance)
return attrs
```

Generate migration:

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_course --name program_session_credit_and_course_max_sessions
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_session_credit_scheduling
```

Expected: the five tests above PASS. (Later tests in this file are added in later tasks.)

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_course/models.py app_course/serializers.py app_course/session_credit_services.py app_course/migrations app_course/tests/test_session_credit_scheduling.py
git commit -m "$(cat <<'EOF'
feat: add program session-credit fields and reject intake-based combo

EOF
)"
```

---

### Task 2: Course `max_sessions` serializer rules

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/serializers.py` (`CourseSerializer.validate`)
- Modify: `schedjuice-reimagined-be/app_course/tests/test_session_credit_scheduling.py`

**Interfaces:**
- Consumes: `Course.max_sessions`; `Program.is_session_credit_scheduling`
- Produces: create on a credit program requires `max_sessions` in 1–365; weekly create forces `max_sessions=None`; PATCH `max_sessions` < current event count is 400 unless `context["session_credit_events_pending"]` is true

- [ ] **Step 1: Write the failing tests**

Append to `SessionCreditSchedulingTests` (reuse `setUp` program). Add a helper in the class:

```python
    def _course(self, **kwargs):
        cat = Category.objects.first() or Category.objects.create(name="SC-cat")
        defaults = dict(
            title=f"SC {uuid4().hex[:6]}",
            description="d",
            category=cat,
            program=self.program,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 31),
        )
        defaults.update(kwargs)
        return Course.objects.create(**defaults)
```

```python
    def test_credit_create_requires_max_sessions(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            cat = Category.objects.first() or Category.objects.create(name="c")
            ser = CourseSerializer(
                data={
                    "title": f"Need max {uuid4().hex[:6]}",
                    "description": "desc",
                    "category": cat.id,
                    "program": self.program.id,
                    "start_date": "2026-08-03",
                    "end_date": "2026-08-24",
                }
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("max_sessions", ser.errors)

    def test_weekly_create_clears_max_sessions(self):
        with schema_context(self.schema_name):
            cat = Category.objects.first() or Category.objects.create(name="c")
            ser = CourseSerializer(
                data={
                    "title": f"Weekly {uuid4().hex[:6]}",
                    "description": "desc",
                    "category": cat.id,
                    "program": self.program.id,
                    "start_date": "2026-08-03",
                    "end_date": "2026-08-24",
                    "max_sessions": 8,
                }
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            self.assertIsNone(ser.validated_data.get("max_sessions"))

    def test_patch_max_below_event_count_is_400(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            course = self._course(max_sessions=8)
            Event.objects.create(
                title="S",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
            Event.objects.create(
                title="S2",
                date=datetime(2026, 8, 4, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
            ser = CourseSerializer(
                instance=course, data={"max_sessions": 1}, partial=True
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("max_sessions", ser.errors)

    def test_patch_max_below_count_allowed_when_events_pending(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            course = self._course(max_sessions=8)
            Event.objects.create(
                title="S",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
            ser = CourseSerializer(
                instance=course,
                data={"max_sessions": 0},
                partial=True,
                context={"session_credit_events_pending": True},
            )
            self.assertTrue(ser.is_valid(), ser.errors)
```

`CourseSerializer` may require more fields (payment_plan, etc.). If `is_valid()` fails on unrelated required fields, add those keys from a working create test in `app_course/tests` (copy the payload shape from an existing `CourseSerializer` create test). Keep the assertions on `max_sessions`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_session_credit_scheduling
```

Expected: FAIL on missing `max_sessions` validation.

- [ ] **Step 3: Implement `CourseSerializer.validate` hooks**

Near the end of `CourseSerializer.validate` (after `attrs = super().validate(attrs)` is fine):

```python
from app_course.models import Event, Program

program = attrs.get("program") or getattr(self.instance, "program", None)
if isinstance(program, int):
    program = Program.objects.filter(id=program).first()

if program is not None and not program.is_session_credit_scheduling:
    if self.instance is None:
        attrs["max_sessions"] = None
elif program is not None and program.is_session_credit_scheduling:
    max_sessions = attrs.get(
        "max_sessions",
        getattr(self.instance, "max_sessions", None),
    )
    if self.instance is None and max_sessions is None:
        raise ValidationError(
            {"max_sessions": "This program requires a max session count."}
        )
    if max_sessions is not None and (max_sessions < 0 or max_sessions > 365):
        raise ValidationError(
            {"max_sessions": "Must be between 0 and 365."}
        )
    if (
        self.instance is not None
        and "max_sessions" in attrs
        and not self.context.get("session_credit_events_pending")
    ):
        current_count = Event.objects.filter(course_id=self.instance.id).count()
        if attrs["max_sessions"] is not None and attrs["max_sessions"] < current_count:
            raise ValidationError(
                {
                    "max_sessions": (
                        "Cannot set max sessions below the current number of sessions."
                    )
                }
            )
```

Create still requires `max_sessions >= 1` in the UI; 0 is allowed on stored rows after backfill. Serializer create: if credit and `max_sessions` is 0, also 400:

```python
if self.instance is None and max_sessions is not None and max_sessions < 1:
    raise ValidationError({"max_sessions": "Must be at least 1."})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_session_credit_scheduling
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_course/serializers.py app_course/tests/test_session_credit_scheduling.py
git commit -m "$(cat <<'EOF'
feat: require course max_sessions on session-credit programs

EOF
)"
```

---

### Task 3: Backfill `max_sessions` when the program flag turns on

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/session_credit_services.py`
- Modify: `schedjuice-reimagined-be/app_course/serializers.py` (`ProgramSerializer.update`)
- Modify: `schedjuice-reimagined-be/app_course/tests/test_session_credit_scheduling.py`

**Interfaces:**
- Consumes: `Program.is_session_credit_scheduling` false→true
- Produces: `backfill_max_sessions_for_program(program) -> int` (rows updated). Null caps become that course’s event count (including 0). Non-null caps unchanged. Changing `default_max_sessions` later does not rewrite courses.

- [ ] **Step 1: Write the failing tests**

```python
    def test_flag_on_seeds_null_caps_from_event_count(self):
        with schema_context(self.schema_name):
            empty = self._course(max_sessions=None)
            two = self._course(max_sessions=None)
            Event.objects.create(
                title="A",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=two,
            )
            Event.objects.create(
                title="B",
                date=datetime(2026, 8, 5, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=two,
            )
            kept = self._course(max_sessions=12)
            ser = ProgramSerializer(
                instance=self.program,
                data={"is_session_credit_scheduling": True},
                partial=True,
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            ser.save()
            empty.refresh_from_db()
            two.refresh_from_db()
            kept.refresh_from_db()
            self.assertEqual(empty.max_sessions, 0)
            self.assertEqual(two.max_sessions, 2)
            self.assertEqual(kept.max_sessions, 12)

    def test_changing_default_max_does_not_rewrite_courses(self):
        with schema_context(self.schema_name):
            self.program.is_session_credit_scheduling = True
            self.program.save(update_fields=["is_session_credit_scheduling"])
            course = self._course(max_sessions=8)
            ser = ProgramSerializer(
                instance=self.program,
                data={"default_max_sessions": 10},
                partial=True,
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            ser.save()
            course.refresh_from_db()
            self.assertEqual(course.max_sessions, 8)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_session_credit_scheduling.SessionCreditSchedulingTests.test_flag_on_seeds_null_caps_from_event_count
```

Expected: FAIL (`max_sessions` still `None`).

- [ ] **Step 3: Implement backfill**

Add to `session_credit_services.py`:

```python
from django.db.models import Count

from app_course.models import Course, Program


def backfill_max_sessions_for_program(program: Program) -> int:
    qs = (
        Course.objects.filter(program_id=program.id, max_sessions__isnull=True)
        .annotate(event_count=Count("events"))
    )
    updated = 0
    for course in qs:
        course.max_sessions = course.event_count
        course.save(update_fields=["max_sessions"])
        updated += 1
    return updated
```

On `ProgramSerializer`:

```python
def update(self, instance, validated_data):
    turning_on = (
        validated_data.get("is_session_credit_scheduling") is True
        and not instance.is_session_credit_scheduling
    )
    instance = super().update(instance, validated_data)
    if turning_on:
        from app_course.session_credit_services import (
            backfill_max_sessions_for_program,
        )

        backfill_max_sessions_for_program(instance)
    return instance
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_session_credit_scheduling
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_course/session_credit_services.py app_course/serializers.py app_course/tests/test_session_credit_scheduling.py
git commit -m "$(cat <<'EOF'
feat: seed course max_sessions from event count when session-credit turns on

EOF
)"
```

---

### Task 4: `edit-events` cap, duplicate dates, and span rewrite

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/session_credit_services.py`
- Modify: `schedjuice-reimagined-be/app_course/views.py` (`CourseEventEditView.post`)
- Modify: `schedjuice-reimagined-be/app_course/tests/test_session_credit_scheduling.py`

**Interfaces:**
- Consumes: simulated remaining events; `course.max_sessions` or payload `course.max_sessions`
- Produces: `validate_session_credit_simulated_events(events, effective_max) -> None`; `span_dates_from_events(events) -> tuple[date, date] | None`. Duplicate calendar dates → 400. `len > max` → 400. `len < max` allowed. Count 0 → do not change `start_date`/`end_date`. Count > 0 → set span to min/max event dates. Pass `session_credit_events_pending=True` into `CourseSerializer`.

`CourseSerializer.update` deletes events outside the saved span **before** event rows are applied. For credit saves, rewrite payload dates from the **simulated remaining** set before `CourseSerializer` runs, so expanding the span cannot drop a new date and shrinking cannot keep a deleted tail.

- [ ] **Step 1: Write the failing API tests**

Use the same `_client(self.admin)` pattern as `test_course_event_edit.py`. Payload `course` needs at least `id` and `title` like that file.

```python
    def _enable_credit(self, course, max_sessions=8):
        self.program.is_session_credit_scheduling = True
        self.program.save(update_fields=["is_session_credit_scheduling"])
        course.max_sessions = max_sessions
        course.save(update_fields=["max_sessions"])

    def test_edit_events_rejects_over_max(self):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=1)
            self._enable_credit(course, max_sessions=1)
            existing = Event.objects.create(
                title="Keep",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {"id": course.id, "title": course.title, "max_sessions": 1},
                    "events": [
                        {
                            "id": existing.id,
                            "title": existing.title,
                            "date": "2026-08-03",
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                        },
                        {
                            "id": "new1",
                            "title": course.title,
                            "date": "2026-08-10",
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                            "course": course.id,
                        },
                    ],
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("max_sessions", str(resp.data).lower() + str(resp.data))

    def test_edit_events_allows_fewer_than_max(self):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=8)
            self._enable_credit(course, 8)
            keep = Event.objects.create(
                title="Keep",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
            drop = Event.objects.create(
                title="Drop",
                date=datetime(2026, 8, 10, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {"id": course.id, "title": course.title, "max_sessions": 8},
                    "events": [
                        {
                            "id": keep.id,
                            "title": keep.title,
                            "date": "2026-08-03",
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                        },
                        {"id": drop.id, "is_deleted": True},
                    ],
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            self.assertFalse(Event.objects.filter(id=drop.id).exists())
            course.refresh_from_db()
            self.assertEqual(course.start_date, date(2026, 8, 3))
            self.assertEqual(course.end_date, date(2026, 8, 3))

    def test_edit_events_rejects_duplicate_dates(self):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=8)
            self._enable_credit(course, 8)
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {"id": course.id, "title": course.title, "max_sessions": 8},
                    "events": [
                        {
                            "id": "new1",
                            "title": course.title,
                            "date": "2026-08-03",
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                            "course": course.id,
                        },
                        {
                            "id": "new2",
                            "title": course.title,
                            "date": "2026-08-03",
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                            "course": course.id,
                        },
                    ],
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 400)

    def test_edit_events_empty_keeps_dates(self):
        with schema_context(self.schema_name):
            course = self._course(
                max_sessions=8,
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 31),
            )
            self._enable_credit(course, 8)
            ev = Event.objects.create(
                title="Only",
                date=datetime(2026, 8, 10, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {"id": course.id, "title": course.title, "max_sessions": 8},
                    "events": [{"id": ev.id, "is_deleted": True}],
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            course.refresh_from_db()
            self.assertEqual(course.start_date, date(2026, 8, 1))
            self.assertEqual(course.end_date, date(2026, 8, 31))

    def test_edit_events_raise_max_and_add_same_request(self):
        with schema_context(self.schema_name):
            course = self._course(max_sessions=1)
            self._enable_credit(course, 1)
            existing = Event.objects.create(
                title="Keep",
                date=datetime(2026, 8, 3, 12, 0, tzinfo=dt_timezone.utc),
                time_from=time(19, 0),
                time_to=time(20, 30),
                course=course,
            )
        client = self._client(self.admin)
        with schema_context(self.schema_name):
            resp = client.post(
                f"/api/v1/courses/{course.id}/edit-events",
                {
                    "course": {"id": course.id, "title": course.title, "max_sessions": 2},
                    "events": [
                        {
                            "id": existing.id,
                            "title": existing.title,
                            "date": "2026-08-03",
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                        },
                        {
                            "id": "new1",
                            "title": course.title,
                            "date": "2026-08-10",
                            "time_from": "19:00:00",
                            "time_to": "20:30:00",
                            "course": course.id,
                        },
                    ],
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            course.refresh_from_db()
            self.assertEqual(course.max_sessions, 2)
            self.assertEqual(Event.objects.filter(course=course).count(), 2)
            self.assertEqual(course.start_date, date(2026, 8, 3))
            self.assertEqual(course.end_date, date(2026, 8, 10))
```

Match `edit-events` event row shape to `test_course_event_edit.py` if these 400 on serializer details (time format, `is_edit`, etc.).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_session_credit_scheduling
```

Expected: FAIL (`len > max` currently 200).

- [ ] **Step 3: Implement service + view hook**

Add to `session_credit_services.py`:

```python
from datetime import date, datetime

from rest_framework.exceptions import ValidationError


def _event_calendar_date(event) -> date:
    value = getattr(event, "date", None)
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raise ValidationError({"date": "Invalid session date."})


def span_dates_from_events(events) -> tuple[date, date] | None:
    if not events:
        return None
    days = sorted(_event_calendar_date(event) for event in events)
    return days[0], days[-1]


def validate_session_credit_simulated_events(events, effective_max) -> None:
    if effective_max is None:
        raise ValidationError(
            {"max_sessions": "This program requires a max session count."}
        )
    if effective_max < 0:
        raise ValidationError({"max_sessions": "Must be at least 0."})
    seen: set[date] = set()
    for event in events:
        day = _event_calendar_date(event)
        if day in seen:
            raise ValidationError(
                {"events": "Each calendar date can have only one session."}
            )
        seen.add(day)
    if len(events) > effective_max:
        raise ValidationError(
            {
                "max_sessions": (
                    "Cannot save more sessions than the max session count."
                )
            }
        )
```

In `CourseEventEditView.post`, after event serializers are valid and **before** constructing `CourseSerializer`:

```python
from copy import copy
from app_course.session_credit_services import (
    span_dates_from_events,
    validate_session_credit_simulated_events,
)

course_payload = dict(request.data.get("course") or {})
if course.program.is_session_credit_scheduling:
    delete_ids = {int(i) for i in events_to_be_deleted}
    remaining = [
        copy(ev)
        for ev in models.Event.objects.filter(course_id=obj_id)
        if ev.id not in delete_ids
    ]
    # apply in-memory updates like validate_simulated_course_event_edit
    updates_by_id = {row["id"]: row for row in events_to_be_updated}
    for ev in remaining:
        payload = updates_by_id.get(ev.id)
        if not payload:
            continue
        for key in ("date", "time_from", "time_to", "title"):
            if key in payload:
                setattr(ev, key, payload[key])
    created_objs = [
        models.Event(**{**row, "course_id": obj_id})
        for row in serialized_events_to_be_created.validated_data
    ]
    simulated = remaining + created_objs
    effective_max = course_payload.get("max_sessions", course.max_sessions)
    try:
        validate_session_credit_simulated_events(simulated, effective_max)
    except ValidationError as exc:
        return self.validation_error(exc.detail)
    span = span_dates_from_events(simulated)
    if span is not None:
        course_payload["start_date"] = span[0].isoformat()
        course_payload["end_date"] = span[1].isoformat()
    else:
        course_payload.pop("start_date", None)
        course_payload.pop("end_date", None)

course_serializer = serializers.CourseSerializer(
    course,
    data=course_payload,
    partial=True,
    context={
        "request": request,
        "skip_mandatory_exam_fields": True,
        "session_credit_events_pending": True,
    },
)
```

Build `simulated` from the same inputs `validate_simulated_course_event_edit` uses (validated update/create data, not raw payload) so date types match `Event.date`. Prefer copying that function’s loop rather than parsing raw strings if types mismatch.

If `self.validation_error` does not exist, use the same `self.send_response(..., status=400)` shape as the overlap `ValidationError` handler in this view.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_session_credit_scheduling app_course.tests.test_course_event_edit
```

Expected: PASS (credit tests + existing edit-events).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_course/session_credit_services.py app_course/views.py app_course/tests/test_session_credit_scheduling.py
git commit -m "$(cat <<'EOF'
feat: enforce session-credit cap and unique dates on edit-events

EOF
)"
```

---

### Task 5: Program settings UI + FE types

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/program.ts`
- Modify: `schedjuice-reimagined-fe/src/types/course.ts` (nested program + `max_sessions`; `COURSE_FORM_UI_EXCLUDED_KEYS`)
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/programs/[id]/settings/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/programs/[id]/settings/program-settings-sections.ts`

**Interfaces:**
- Consumes: BE fields from Tasks 1–3
- Produces: `programType.is_session_credit_scheduling`, `programType.default_max_sessions`; `courseType.max_sessions`; nested `program.is_session_credit_scheduling`. Settings save both new keys with the high-risk group.

- [ ] **Step 1: Extend Zod types**

`programSchema` / `programCreateUpdateSchema`:

```ts
is_session_credit_scheduling: z
  .boolean()
  .default(false)
  .describe("Session-credit scheduling"),
default_max_sessions: z.coerce
  .number()
  .int()
  .min(1)
  .max(365)
  .default(8)
  .describe("Default max sessions"),
```

`programToFormValues`: copy both fields (`is_session_credit_scheduling: program.is_session_credit_scheduling ?? false`, `default_max_sessions: program.default_max_sessions ?? 8`).

`course.ts` nested program object: add `is_session_credit_scheduling: z.boolean().optional()`, `default_max_sessions: z.number().optional()`.

`courseSchema`: `max_sessions: z.number().int().nullable().optional()`.

Add `"max_sessions"` to `COURSE_FORM_UI_EXCLUDED_KEYS` so the info AutoForm does not render it.

- [ ] **Step 2: Wire program settings**

`program-settings-sections.ts` general keys: add `"is_session_credit_scheduling"`, `"default_max_sessions"`.

`page.tsx`:

- `BASE_HIGH_RISK_SETTINGS_FIELDS` include both new keys.
- `programSettingsGroupsBase` rules `fields` include them after `subject_strategy`.
- `fieldConfig`: `autosave: false` for both; descriptions:

```ts
is_session_credit_scheduling: {
  autosave: false,
  customLabel: "Session-credit scheduling",
  description:
    "Teachers pick a fixed number of dates on the calendar instead of a weekly pattern. Manual programs only.",
},
default_max_sessions: {
  autosave: false,
  description:
    "Seeded onto new courses in this program. Existing courses keep their own max.",
},
```

`saveGeneralSettings` already copies `highRiskSettingsFields` into the payload.

- [ ] **Step 3: Typecheck**

```bash
cd schedjuice-reimagined-fe
pnpm typecheck
```

Expected: PASS (or only pre-existing errors unrelated to these types).

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/types/program.ts src/types/course.ts src/app/\(internal\)/programs/[id]/settings/page.tsx src/app/\(internal\)/programs/[id]/settings/program-settings-sections.ts
git commit -m "$(cat <<'EOF'
feat: expose session-credit fields on program settings

EOF
)"
```

---

### Task 6: `session-credit-draft` helper (TDD)

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/session-credit-draft.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/session-credit-draft.test.ts`

**Interfaces:**
- Consumes: ISO dates `YYYY-MM-DD`, HH:mm times
- Produces:

```ts
export type SessionCreditPick = {
  date: string;
  time_from: string;
  time_to: string;
  overridden: boolean;
};

export type SessionCreditDraft = {
  maxSessions: number;
  timeFrom: string;
  timeTo: string;
  picks: SessionCreditPick[];
  capNote: string | null;
};

export function isSessionCreditProgram(program: {
  is_session_credit_scheduling?: boolean | null;
} | null | undefined): boolean;

export function impliedSpan(
  picks: SessionCreditPick[],
): { start: string; end: string } | null;

export function canSubmitCreate(draft: SessionCreditDraft): boolean;

export function toggleCreditDate(
  draft: SessionCreditDraft,
  isoDate: string,
): SessionCreditDraft;

export function setSharedCreditTimes(
  draft: SessionCreditDraft,
  timeFrom: string,
  timeTo: string,
): SessionCreditDraft;

export function overrideCreditPick(
  draft: SessionCreditDraft,
  isoDate: string,
  timeFrom: string,
  timeTo: string,
): SessionCreditDraft;

export function setCreditMaxSessions(
  draft: SessionCreditDraft,
  maxSessions: number,
): SessionCreditDraft;

export function activeEventCount(events: { is_deleted?: boolean }[]): number;

export function addCreditEvent(args: {
  events: Array<Partial<eventType>>;
  isoDate: string;
  timeFrom: string;
  timeTo: string;
  maxSessions: number;
  title: string;
}): { events: Array<Partial<eventType>>; blockedReason: "at_cap" | "duplicate" | null };

export function picksToCreateEvents(
  picks: SessionCreditPick[],
  title: string,
): Array<Partial<eventType>>;
```

- [ ] **Step 1: Write the failing tests**

`session-credit-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addCreditEvent,
  canSubmitCreate,
  impliedSpan,
  isSessionCreditProgram,
  overrideCreditPick,
  setCreditMaxSessions,
  setSharedCreditTimes,
  toggleCreditDate,
  type SessionCreditDraft,
} from "./session-credit-draft";

const empty = (): SessionCreditDraft => ({
  maxSessions: 8,
  timeFrom: "19:00",
  timeTo: "20:30",
  picks: [],
  capNote: null,
});

describe("isSessionCreditProgram", () => {
  it("is true only when the flag is true", () => {
    expect(isSessionCreditProgram(undefined)).toBe(false);
    expect(isSessionCreditProgram({ is_session_credit_scheduling: false })).toBe(
      false,
    );
    expect(isSessionCreditProgram({ is_session_credit_scheduling: true })).toBe(
      true,
    );
  });
});

describe("toggleCreditDate", () => {
  it("adds then removes a date", () => {
    const once = toggleCreditDate(empty(), "2026-08-03");
    expect(once.picks).toEqual([
      {
        date: "2026-08-03",
        time_from: "19:00",
        time_to: "20:30",
        overridden: false,
      },
    ]);
    expect(toggleCreditDate(once, "2026-08-03").picks).toEqual([]);
  });

  it("ignores a 9th click when max is 8", () => {
    let draft = empty();
    for (let d = 1; d <= 8; d += 1) {
      draft = toggleCreditDate(draft, `2026-08-${String(d).padStart(2, "0")}`);
    }
    const blocked = toggleCreditDate(draft, "2026-08-09");
    expect(blocked.picks).toHaveLength(8);
    expect(blocked.capNote).toMatch(/raise max sessions to add more/i);
  });
});

describe("canSubmitCreate / impliedSpan", () => {
  it("blocks 7 of 8 and allows 8 of 8 with first/last span", () => {
    let draft = empty();
    for (let d = 3; d <= 9; d += 1) {
      draft = toggleCreditDate(draft, `2026-08-${String(d).padStart(2, "0")}`);
    }
    expect(draft.picks).toHaveLength(7);
    expect(canSubmitCreate(draft)).toBe(false);
    draft = toggleCreditDate(draft, "2026-08-10");
    expect(canSubmitCreate(draft)).toBe(true);
    expect(impliedSpan(draft.picks)).toEqual({
      start: "2026-08-03",
      end: "2026-08-10",
    });
  });
});

describe("shared times vs override", () => {
  it("updates non-overridden picks only", () => {
    let draft = toggleCreditDate(empty(), "2026-08-03");
    draft = toggleCreditDate(draft, "2026-08-10");
    draft = overrideCreditPick(draft, "2026-08-03", "09:00", "10:00");
    draft = setSharedCreditTimes(draft, "18:00", "19:30");
    expect(draft.picks.find((p) => p.date === "2026-08-03")).toMatchObject({
      time_from: "09:00",
      time_to: "10:00",
      overridden: true,
    });
    expect(draft.picks.find((p) => p.date === "2026-08-10")).toMatchObject({
      time_from: "18:00",
      time_to: "19:30",
      overridden: false,
    });
  });
});

describe("setCreditMaxSessions", () => {
  it("refuses to lower max below the current pick count", () => {
    let draft = toggleCreditDate(empty(), "2026-08-03");
    draft = toggleCreditDate(draft, "2026-08-10");
    const next = setCreditMaxSessions(draft, 1);
    expect(next.maxSessions).toBe(8);
    expect(next.capNote).toMatch(/delete/i);
  });
});

describe("addCreditEvent", () => {
  it("blocks at cap and allows after raising max", () => {
    const atCap = addCreditEvent({
      events: [
        {
          id: 1,
          date: "2026-08-03",
          time_from: "19:00",
          time_to: "20:30",
        },
      ],
      isoDate: "2026-08-10",
      timeFrom: "19:00",
      timeTo: "20:30",
      maxSessions: 1,
      title: "Physics",
    });
    expect(atCap.blockedReason).toBe("at_cap");
    expect(atCap.events).toHaveLength(1);

    const added = addCreditEvent({
      ...atCap,
      events: atCap.events,
      maxSessions: 2,
    });
    expect(added.blockedReason).toBeNull();
    expect(added.events).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/helpers/session-credit-draft.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `session-credit-draft.ts`**

Keep it React-free. `toggleCreditDate` sorts picks by `date`. `canSubmitCreate` is `draft.maxSessions >= 1 && draft.picks.length === draft.maxSessions`. `capNote` for at-cap add: `Raise Max sessions to add more.` `setCreditMaxSessions` no-op with note `Delete extra sessions before lowering max.` when `maxSessions < picks.length`. `addCreditEvent` skips `is_deleted` rows in the count; duplicate `date` (non-deleted) returns `blockedReason: "duplicate"`; new rows use `id: \`new${date}\`` (stable enough for tests; Schedule tab can use `new` + uuid if collisions appear). `picksToCreateEvents` maps to `{ id: \`new${date}\`, title, date, time_from, time_to }`.

`isSessionCreditProgram`: `return program?.is_session_credit_scheduling === true`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/helpers/session-credit-draft.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/session-credit-draft.ts src/helpers/session-credit-draft.test.ts
git commit -m "$(cat <<'EOF'
feat: add session-credit draft rules for cap, span, and overrides

EOF
)"
```

---

### Task 7: Create helper credit path

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/create-course-schedule.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/create-course-schedule.test.ts`

**Interfaces:**
- Consumes: `picksToCreateEvents`, `impliedSpan`, `canSubmitCreate`
- Produces: `createCourseThenSessionCreditSchedule({ coursePayload, picks, title, maxSessions })` — `POST courses` with `max_sessions`, `start_date`, `end_date`; then `POST edit-events` with one row per pick (no weekday expansion). Partial failure: `{ scheduleError, courseId }` like today.

- [ ] **Step 1: Write the failing caller-contract test**

```ts
it("posts max_sessions and one event per picked date", async () => {
  vi.mocked(makePostRequest)
    .mockResolvedValueOnce({
      data: { data: { id: 11, title: "Pack", start_date: "2026-08-03", end_date: "2026-08-10" } },
    } as never)
    .mockResolvedValueOnce({ data: { data: [] } } as never);

  const { createCourseThenSessionCreditSchedule } = await import(
    "./create-course-schedule"
  );
  await createCourseThenSessionCreditSchedule({
    coursePayload: { title: "Pack", max_sessions: 2 },
    picks: [
      { date: "2026-08-03", time_from: "19:00", time_to: "20:30", overridden: false },
      { date: "2026-08-10", time_from: "09:00", time_to: "10:00", overridden: true },
    ],
    title: "Pack",
  });

  expect(makePostRequest).toHaveBeenNthCalledWith(
    1,
    "courses",
    expect.objectContaining({
      max_sessions: 2,
      start_date: "2026-08-03",
      end_date: "2026-08-10",
    }),
  );
  const body = vi.mocked(makePostRequest).mock.calls[1][1] as {
    events: Array<{ date: string; time_from: string }>;
  };
  expect(body.events.map((e) => e.date)).toEqual(["2026-08-03", "2026-08-10"]);
  expect(body.events.find((e) => e.date === "2026-08-10")?.time_from).toBe(
    "09:00",
  );
});

it("throws when pick count is not exactly max", async () => {
  const { createCourseThenSessionCreditSchedule } = await import(
    "./create-course-schedule"
  );
  await expect(
    createCourseThenSessionCreditSchedule({
      coursePayload: { title: "Pack", max_sessions: 8 },
      picks: [
        { date: "2026-08-03", time_from: "19:00", time_to: "20:30", overridden: false },
      ],
      title: "Pack",
    }),
  ).rejects.toThrow(/exactly/i);
  expect(makePostRequest).not.toHaveBeenCalled();
});
```

Prefer a static import of `createCourseThenSessionCreditSchedule` next to the existing helper import instead of dynamic `import()` if the test file already imports the module.

- [ ] **Step 2: Run the test file to verify fail**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/helpers/create-course-schedule.test.ts
```

Expected: FAIL (export missing).

- [ ] **Step 3: Implement**

```ts
export async function createCourseThenSessionCreditSchedule(args: {
  coursePayload: Record<string, unknown>;
  picks: SessionCreditPick[];
  title: string;
}): Promise<CreateCourseScheduleResult> {
  const maxSessions = Number(args.coursePayload.max_sessions);
  const draft = {
    maxSessions,
    timeFrom: args.picks[0]?.time_from ?? "",
    timeTo: args.picks[0]?.time_to ?? "",
    picks: args.picks,
    capNote: null,
  };
  if (!canSubmitCreate(draft)) {
    throw new Error("Select exactly the max number of sessions.");
  }
  const span = impliedSpan(args.picks);
  if (!span) throw new Error("Select exactly the max number of sessions.");

  const payload = {
    ...args.coursePayload,
    max_sessions: maxSessions,
    start_date: span.start,
    end_date: span.end,
  };
  const createRes = await makePostRequest("courses", payload);
  const course = (createRes?.data?.data ?? {}) as Record<string, unknown>;
  const courseId = course.id as number | undefined;
  if (courseId == null) throw new Error("Course create response missing id");

  const events = picksToCreateEvents(args.picks, args.title);
  const sanitized = sanitizeCoursePayloadForApiWrite(course);
  const courseForEdit = {
    ...cleanDatesForBackend(sanitized, ["start_date", "end_date"]),
    max_sessions: maxSessions,
    start_date: span.start,
    end_date: span.end,
  };
  try {
    await makePostRequest(`courses/${courseId}/edit-events`, {
      course: courseForEdit,
      events,
    });
    return { courseId, course, scheduleApplied: true };
  } catch {
    return {
      courseId,
      course,
      scheduleApplied: false,
      scheduleError: "Course created, but sessions could not be added",
    };
  }
}
```

Import `SessionCreditPick`, `canSubmitCreate`, `impliedSpan`, `picksToCreateEvents` from `./session-credit-draft`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/helpers/create-course-schedule.test.ts src/helpers/session-credit-draft.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/create-course-schedule.ts src/helpers/create-course-schedule.test.ts
git commit -m "$(cat <<'EOF'
feat: create session-credit courses with explicit event dates

EOF
)"
```

---

### Task 8: Manual create form swap

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/scheduling/manual-course-form.tsx`
- Create: `schedjuice-reimagined-fe/src/components/scheduling/session-credit-create-calendar.tsx` (thin: Max / From / To / caption / `MonthGrid`)
- Modify: `schedjuice-reimagined-fe/src/components/calendar/grid/month-grid.tsx` (`onEmptyDayClick`)

**Interfaces:**
- Consumes: `isSessionCreditProgram(program)`, `createCourseThenSessionCreditSchedule`, `toggleCreditDate`, `resolveSessionDefaults(tenant)`
- Produces: credit programs hide start/end, duration presets, and `SlotsSimpleScheduleField`. Create button disabled until `canSubmitCreate`. Weekly programs unchanged.

- [ ] **Step 1: Add `onEmptyDayClick` to `MonthGrid` / `DayCell`**

`DayCellProps` + `MonthGridProps`: `onEmptyDayClick?: (date: Date) => void`.

On the day cell root, `onClick` fires `onEmptyDayClick(date)` when provided. Session chip `onClick` must `stopPropagation()` so chip clicks do not also add. Empty cells (no non-deleted sessions) still receive the day click.

- [ ] **Step 2: Implement `session-credit-create-calendar.tsx`**

Local state is `SessionCreditDraft`, seeded with `maxSessions: program.default_max_sessions ?? 8` and org session defaults.

Render:

- Number field **Max sessions** (min 1, max 365) → `setCreditMaxSessions`
- Time pickers From/To → `setSharedCreditTimes` (validate with `isValidSessionTimeRange`)
- Caption: `n of max selected` plus `impliedSpan` formatted with existing date helpers; hide span when empty
- Inline `draft.capNote` in `text-sm text-text-muted`
- `MonthGrid` with `onEmptyDayClick` → `toggleCreditDate` using `getDateISOString(date)`
- Chips: `onSessionClick` → `toggleCreditDate` (remove) **or** a small popover to `overrideCreditPick` (Edit time). Prefer: first click on a selected chip opens time override; a remove control in that popover toggles off. If that is too much UI, click-selected-day-toggles-off is enough; override via a time popover on the chip using existing `TimePicker`.

Do not use the weekly Add-sessions composer here.

- [ ] **Step 3: Wire `ManualCourseForm`**

```ts
const isCredit = isSessionCreditProgram(program);
```

If `isCredit`:

- Do not render start/end DatePickers, duration preset buttons, or `SlotsSimpleScheduleField`.
- Render `SessionCreditCreateCalendar` and keep draft in parent state.
- Submit: `createCourseThenSessionCreditSchedule` instead of `createCourseThenOptionalSchedule`. Do not set `course_type` from WD/WE.
- Disable submit when `!canSubmitCreate(draft)` or times invalid.
- `requireAtLeastOne` weekly slot validation must not run.

If not credit: existing form unchanged.

- [ ] **Step 4: Run helper tests + typecheck**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/helpers/session-credit-draft.test.ts src/helpers/create-course-schedule.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/scheduling/manual-course-form.tsx src/components/scheduling/session-credit-create-calendar.tsx src/components/calendar/grid/month-grid.tsx
git commit -m "$(cat <<'EOF'
feat: swap manual course create to session-credit calendar

EOF
)"
```

---

### Task 9: Schedule tab credit mode

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/calendar/course-schedule/session-credit-toolbar.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/calendar/course-schedule/course-schedule-editor.tsx`
- Modify: `schedjuice-reimagined-fe/src/helpers/session-credit-draft.test.ts` (addCreditEvent already covers cap; add `activeEventCount` if missing)
- Optional: `DeleteSessionsDialog` — pass a prop to hide series radios in credit mode, or skip opening it and delete only-this in the editor

**Interfaces:**
- Consumes: `isSessionCreditProgram(course.program)`, `addCreditEvent`, `course.max_sessions`
- Produces: weekly composer + **Add sessions** hidden; toolbar Max + From/To + `n of max`; empty-day click adds at toolbar times; chip still uses `SessionActionsDialog`; delete is this session only; Save includes `max_sessions` and dirty-counts max changes.

Course edit already `expand: ["program"]`, so `course.program.is_session_credit_scheduling` is available when program is an object. Guard with `isSessionCreditProgram`.

- [ ] **Step 1: Toolbar component**

Props: `maxSessions`, `onMaxSessionsChange`, `timeFrom`, `timeTo`, `onTimesChange`, `selectedCount`, `spanLabel`, `capNote`.

Use `NumberField` / existing `Input` type number and `TimePicker`. Caption: `{selectedCount} of {maxSessions}` plus span.

`onMaxSessionsChange` should call `setCreditMaxSessions`-style guard in the editor: if `next < activeEventCount(events)`, set cap note and do not change.

- [ ] **Step 2: Editor credit branch**

```ts
const isCredit = isSessionCreditProgram(
  typeof course.program === "object" ? course.program : undefined,
);
```

If `isCredit`:

- Hide the **Add sessions** button and `<AddSessionsComposer />`.
- Render `SessionCreditToolbar` above the timezone notice.
- `onEmptyDayClick`: `addCreditEvent` with toolbar times, `maxSessions` from local state (seeded from `course.max_sessions ?? 0`), `title: course.title`. If `blockedReason === "at_cap"`, set cap note.
- `onEdit` in `SessionActionsDialog`: keep the existing time editor path (`editingSession` + composer) **or** a time-only popover. If the weekly composer stays mounted only for `editingSession`, that is OK — do not show it for add. Simpler: reuse composer solely when `editingSession` is set (edit time of one session).
- `DeleteSessionsDialog`: either force `scope="only_this"` and hide the radio group when `isCredit`, or delete the one session in `onDelete` without opening the series dialog.
- `handleSave`: include `max_sessions: creditMax` on the course payload (already sends start/end via `sanitizeCoursePayloadForApiWrite`). After local adds, `start_date`/`end_date` on the course object should match implied span of non-deleted events so `CourseSerializer.update` does not delete new dates outside the old span. Update local `course` start/end when picks change (`setCourse`).
- Dirty: `changeCount = countScheduleDraftChanges(flatEvents) + (creditMax !== (course.max_sessions ?? 0) ? 1 : 0)`.
- Discard: reset `creditMax` to `course.max_sessions`.

If not credit: unchanged.

Past empty days: allow add (`addCreditEvent` does not block past). Chip of a past session: existing read-only / no edit time.

- [ ] **Step 3: Run tests**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit src/helpers/session-credit-draft.test.ts src/helpers/create-course-schedule.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual check list (do not add smoke tests)**

- Weekly program: Add sessions + weekday picker still appear.
- Credit program create: 7 of 8 cannot submit; 8 of 8 creates and lands on Schedule tab.
- Schedule tab at cap: empty day does not add; raise max then add; delete one, save with fewer than max; delete last session, dates unchanged.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/calendar/course-schedule/course-schedule-editor.tsx src/components/calendar/course-schedule/session-credit-toolbar.tsx src/components/calendar/course-schedule/delete-sessions-dialog.tsx src/helpers/session-credit-draft.ts src/helpers/session-credit-draft.test.ts
git commit -m "$(cat <<'EOF'
feat: use session-credit click-calendar on the course Schedule tab

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Program fields + intake-based 400 | 1 |
| Teacher cannot PATCH program credit fields | 1 |
| Course `max_sessions` required on credit create; weekly null | 2 |
| Flag-on backfill; default_max change does not rewrite | 3 |
| edit-events cap, fewer-than-max, duplicates, empty span keep dates, raise-max+add | 4 |
| Program settings UI + types; max not on course info form | 5 |
| Draft: exact-N, 9th click, shared vs override, lower-max blocked | 6 |
| Create helper posts `max_sessions` + one event per date | 7 |
| Manual create calendar swap; weekly unchanged | 8 |
| Schedule tab credit mode; series delete hidden; dirty max | 9 |
| No org columns / no intake wizard | out of scope (global) |
| Course moved onto credit program | N/A (`Cannot change a course's program.`) |
