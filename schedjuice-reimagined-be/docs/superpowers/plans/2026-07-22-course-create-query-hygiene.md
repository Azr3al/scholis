# Course Create Query Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut redundant SQL on `POST /api/v1/courses` (201) when Teams is off by precomputing `search_text` (skip post_save refresh) and priming create-response serializer caches—without changing response shape or create semantics.

**Architecture:** Compute `search_text` from validated FK instances before insert; set `instance._skip_search_text_refresh = True` before `save()` so the existing `post_save` receiver returns early. After create (+ optional auto-MT), attach `_prefetched_teacher_user_courses` and `_first_event_time_*` on the instance so 201 `to_representation` does not re-query. Prime custom-field cache once in `to_representation`.

**Tech Stack:** Django 4.2, DRF, `CaptureQueriesContext`, tenant schemas (`schema_context`), existing `app_course/search_signals.py` + `CourseSerializer`.

## Global Constraints

- Repo: `schedjuice-reimagined-be` only; no FE changes.
- Spec: `docs/superpowers/specs/2026-07-22-course-create-query-hygiene-design.md`.
- Run backend tests via `./scripts/run_backend_tests.sh <target>` (always `--keepdb`).
- High-value tests only: query budget + no redundant `search_text` UPDATE/refresh SELECT; do not add happy-path-only “returns 201” smoke.
- Do not change auto-MT eligibility, Teams branches, validation rules, or 201 JSON keys.
- Out of scope: `CourseListView.get` → `super().post` bug; list/search perf; async deferral.

## File map

| File | Responsibility |
| --- | --- |
| `app_course/search_signals.py` | FK-based `search_text` builder; skip flag on `course_saved_refresh_search_text` |
| `app_course/serializers.py` (`CourseSerializer`) | Precompute `search_text`, save with skip flag, attach create-response caches, prime custom fields in `to_representation` |
| `app_course/tests/test_query_perf.py` | Query-budget + no post-insert `search_text` refresh SQL |
| `app_course/tests/test_search_fts.py` | One focused assert: serializer create still populates `search_text` with skip path |

---

### Task 1: Failing tests for skip-refresh + create query budget

**Files:**
- Modify: `app_course/tests/test_query_perf.py`
- Modify: `app_course/tests/test_search_fts.py`
- Test: same

**Interfaces:**
- Consumes: (none yet — tests define expected behavior)
- Produces: failing tests that expect `_skip_search_text_refresh` behavior and a create query upper bound

- [ ] **Step 1: Add failing query-perf tests for course create**

Append to `app_course/tests/test_query_perf.py` (keep existing imports; add any missing):

```python
from datetime import date, timedelta
from unittest.mock import patch

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from app_course.models import Category, Program
from app_organization.models import Organization


def _manual_program_and_category():
    program = Program.objects.filter(
        course_creation_method=Program.CourseCreationMethod.MANUAL,
        subject_strategy=Program.SubjectStrategy.NONE,
    ).first()
    if program is None:
        program = Program.objects.create(
            name=f"CreatePerfProg {uuid4().hex[:8]}",
            course_creation_method=Program.CourseCreationMethod.MANUAL,
            subject_strategy=Program.SubjectStrategy.NONE,
        )
    category = Category.objects.first()
    if category is None:
        category = Category.objects.create(name=f"CreatePerfCat {uuid4().hex[:8]}")
    return program, category


class CourseCreateQueryPerfTest(CourseQueryPerfTest):
    """MS-off course create: no search_text refresh cluster; bounded queries."""

    def test_course_serializer_create_skips_search_text_refresh_sql(self):
        with schema_context(self.schema_name):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)
            program, category = _manual_program_and_category()
            user = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(user)

            factory = APIRequestFactory()
            wsgi = factory.post("/api/v1/courses", {}, format="json")
            wsgi.tenant = tenant
            request = Request(wsgi)
            request.tenant = tenant
            request.user = user

            start = date.today()
            payload = {
                "title": f"CreateQ {uuid4().hex[:8]}",
                "start_date": str(start),
                "end_date": str(start + timedelta(days=30)),
                "program": program.id,
                "category": category.id,
                "create_microsoft_team": False,
            }

            with CaptureQueriesContext(connection) as ctx:
                ser = CourseSerializer(data=payload, context={"request": request})
                self.assertTrue(ser.is_valid(), ser.errors)
                instance = ser.save()
                _ = CourseSerializer(instance, context={"request": request}).data

            sqls = [" ".join(q["sql"].split()) for q in ctx.captured_queries]
            # No post-insert refresh UPDATE of search_text
            update_search = [
                s
                for s in sqls
                if s.upper().startswith("UPDATE")
                and "APP_COURSE_COURSE" in s.upper()
                and "SEARCH_TEXT" in s.upper()
            ]
            self.assertEqual(
                update_search,
                [],
                f"unexpected search_text UPDATE(s): {update_search}",
            )
            instance.refresh_from_db()
            self.assertIn(program.name, instance.search_text)
            self.assertIn(category.name, instance.search_text)

    def test_course_serializer_create_query_budget_ms_off(self):
        with schema_context(self.schema_name):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=False,
                auto_assign_creator_as_main_teacher=False,
            )
            tenant = Organization.objects.get(schema_name=self.schema_name)
            program, category = _manual_program_and_category()
            user = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            self.assertIsNotNone(user)

            factory = APIRequestFactory()
            wsgi = factory.post("/api/v1/courses", {}, format="json")
            wsgi.tenant = tenant
            request = Request(wsgi)
            request.tenant = tenant
            request.user = user

            start = date.today()
            payload = {
                "title": f"CreateBudget {uuid4().hex[:8]}",
                "start_date": str(start),
                "end_date": str(start + timedelta(days=30)),
                "program": program.id,
                "category": category.id,
                "create_microsoft_team": False,
            }

            with CaptureQueriesContext(connection) as ctx:
                ser = CourseSerializer(data=payload, context={"request": request})
                self.assertTrue(ser.is_valid(), ser.errors)
                instance = ser.save()
                _ = CourseSerializer(instance, context={"request": request}).data

            # Calibrate after implementation if slightly off; start strict.
            # Pre-fix serializer-only path was ~17; target ≤ 12 after hygiene.
            self.assertLessEqual(
                len(ctx.captured_queries),
                12,
                [ " ".join(q["sql"].split())[:160] for q in ctx.captured_queries ],
            )
```

Ensure `CourseSerializer` and `User` are already imported at the top of `test_query_perf.py` (add imports if missing).

- [ ] **Step 2: Add failing FTS assert for serializer create path**

In `app_course/tests/test_search_fts.py`, add:

```python
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from app_course.serializers import CourseSerializer
from app_organization.models import Organization


def test_serializer_create_sets_search_text_without_refresh_update(self):
    with schema_context(self.schema_name):
        Organization.objects.filter(schema_name=self.schema_name).update(
            is_microsoft_on=False
        )
        tenant = Organization.objects.get(schema_name=self.schema_name)
        category = Category.objects.first() or Category.objects.create(
            name=f"Cat {uuid4().hex[:4]}"
        )
        program, _ = Program.objects.get_or_create(
            name=f"ProgSer {uuid4().hex[:6]}",
            defaults={
                "course_creation_method": Program.CourseCreationMethod.MANUAL,
                "subject_strategy": Program.SubjectStrategy.NONE,
            },
        )
        user = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
        factory = APIRequestFactory()
        wsgi = factory.post("/api/v1/courses", {}, format="json")
        wsgi.tenant = tenant
        request = Request(wsgi)
        request.tenant = tenant
        request.user = user

        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from datetime import date, timedelta

        start = date.today()
        payload = {
            "title": f"SerSearch {uuid4().hex[:8]}",
            "start_date": str(start),
            "end_date": str(start + timedelta(days=10)),
            "program": program.id,
            "category": category.id,
            "create_microsoft_team": False,
        }
        with CaptureQueriesContext(connection) as ctx:
            ser = CourseSerializer(data=payload, context={"request": request})
            self.assertTrue(ser.is_valid(), ser.errors)
            course = ser.save()
        course.refresh_from_db()
        self.assertIn(program.name, course.search_text)
        self.assertIn(category.name, course.search_text)
        update_search = [
            " ".join(q["sql"].split())
            for q in ctx.captured_queries
            if " ".join(q["sql"].split()).upper().startswith("UPDATE")
            and "SEARCH_TEXT" in q["sql"].upper()
        ]
        self.assertEqual(update_search, [])
```

(Add `User` import from `app_auth.models` if not present.)

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
./scripts/run_backend_tests.sh \
  app_course.tests.test_query_perf.CourseCreateQueryPerfTest \
  app_course.tests.test_search_fts.CourseSearchFtsTests.test_serializer_create_sets_search_text_without_refresh_update
```

Expected: FAIL (search_text UPDATE still present and/or query count > 12). If the FTS test class name differs, open `test_search_fts.py` and use the real class name.

- [ ] **Step 4: Commit tests only**

```bash
git add app_course/tests/test_query_perf.py app_course/tests/test_search_fts.py
git commit -m "$(cat <<'EOF'
test(course): add create query hygiene failing budgets

EOF
)"
```

---

### Task 2: `search_text` FK builder + skip flag on post_save

**Files:**
- Modify: `app_course/search_signals.py`
- Test: `app_course/tests/test_search_fts.py` (unit-level for helper optional; Task 1 tests remain the gate)

**Interfaces:**
- Consumes: existing `compute_course_search_text(course: Course) -> str`
- Produces:
  - `compute_course_search_text_from_fks(*, subject=None, level=None, section=None, category=None, program=None, campus=None, intake=None, extra_subject_names: list[str] | None = None) -> str`
  - `SKIP_SEARCH_TEXT_REFRESH_ATTR = "_skip_search_text_refresh"`
  - `course_saved_refresh_search_text` returns early when `getattr(instance, SKIP_SEARCH_TEXT_REFRESH_ATTR, False)`

- [ ] **Step 1: Add FK builder + skip in `search_signals.py`**

Add after imports / before `compute_course_search_text`:

```python
SKIP_SEARCH_TEXT_REFRESH_ATTR = "_skip_search_text_refresh"


def compute_course_search_text_from_fks(
    *,
    subject=None,
    level=None,
    section=None,
    category=None,
    program=None,
    campus=None,
    intake=None,
    extra_subject_names: list[str] | None = None,
) -> str:
    """Build search_text from in-memory FK objects (create path; no ORM)."""
    parts: list[str] = []
    for obj in (subject, level, section, category, program, campus, intake):
        name = getattr(obj, "name", None) if obj is not None else None
        if name:
            parts.append(name)
    for name in extra_subject_names or []:
        if name:
            parts.append(name)
    return " ".join(parts)
```

Change the receiver to:

```python
@receiver(post_save, sender=Course)
def course_saved_refresh_search_text(sender, instance: Course, **kwargs):
    if getattr(instance, SKIP_SEARCH_TEXT_REFRESH_ATTR, False):
        return
    refresh_course_search_text(instance.pk)
```

Leave `compute_course_search_text` / `refresh_course_search_text` behavior for updates and `CourseSubject` unchanged.

- [ ] **Step 2: Run FTS existing tests to ensure skip does not break Course.objects.create**

Run:

```bash
./scripts/run_backend_tests.sh app_course.tests.test_search_fts
```

Expected: existing tests PASS (`Course.objects.create` has no skip flag, refresh still runs). New serializer test may still FAIL until Task 3.

- [ ] **Step 3: Commit**

```bash
git add app_course/search_signals.py
git commit -m "$(cat <<'EOF'
feat(course): allow skipping search_text refresh on create

EOF
)"
```

---

### Task 3: Wire `CourseSerializer.create` to precompute `search_text` + skip

**Files:**
- Modify: `app_course/serializers.py` (`CourseSerializer.create`)
- Test: Task 1 tests

**Interfaces:**
- Consumes: `compute_course_search_text_from_fks`, `SKIP_SEARCH_TEXT_REFRESH_ATTR`
- Produces: create path sets `validated_data["search_text"]` when all present FK names resolve; saves via instance with skip attr set **before** `save()`

- [ ] **Step 1: Implement helper methods on `CourseSerializer`**

Near `CourseSerializer.create`, add:

```python
def _search_text_for_create(self, validated_data) -> str | None:
    """
    Return search_text from validated FK instances, or None to keep post_save refresh.
    None only when we cannot safely resolve names for FKs that are set.
    """
    from app_course.search_signals import compute_course_search_text_from_fks

    fks = {
        "subject": validated_data.get("subject"),
        "level": validated_data.get("level"),
        "section": validated_data.get("section"),
        "category": validated_data.get("category"),
        "program": validated_data.get("program"),
        "campus": validated_data.get("campus"),
        "intake": validated_data.get("intake"),
    }
    for key, obj in fks.items():
        if obj is not None and not getattr(obj, "name", None):
            return None
    return compute_course_search_text_from_fks(**fks)


def _create_course_row(self, validated_data, *, skip_search_text_refresh: bool):
    """Create Course like ModelSerializer.create, with optional refresh skip."""
    from app_course.search_signals import SKIP_SEARCH_TEXT_REFRESH_ATTR

    ModelClass = self.Meta.model
    # Course create has no M2M in validated_data under normal API use.
    instance = ModelClass(**validated_data)
    if skip_search_text_refresh:
        setattr(instance, SKIP_SEARCH_TEXT_REFRESH_ATTR, True)
    instance.save()
    return instance
```

- [ ] **Step 2: Change `create` to use precompute + `_create_course_row`**

Inside `create`, **before** `with transaction.atomic():`, after MS flow fills `microsoft_group_id` if any:

```python
search_text = self._search_text_for_create(validated_data)
skip_refresh = False
if search_text is not None:
    validated_data["search_text"] = search_text
    skip_refresh = True

with transaction.atomic():
    instance = self._create_course_row(
        validated_data, skip_search_text_refresh=skip_refresh
    )
    from app_course.course_scoping import assign_creator_as_teacher_if_applicable
    assign_creator_as_teacher_if_applicable(
        validated_data.get("created_by"),
        instance,
        tenant=tenant,
    )
```

Remove the `instance = super().create(validated_data)` call on this path (do not double-insert). Keep the MS `on_commit` block after the atomic block unchanged.

- [ ] **Step 3: Run Task 1 search_text tests**

```bash
./scripts/run_backend_tests.sh \
  app_course.tests.test_query_perf.CourseCreateQueryPerfTest.test_course_serializer_create_skips_search_text_refresh_sql \
  app_course.tests.test_search_fts
```

Expected: search_text skip tests PASS. Query budget test may still FAIL until Task 4.

- [ ] **Step 4: Commit**

```bash
git add app_course/serializers.py
git commit -m "$(cat <<'EOF'
feat(course): precompute search_text on create and skip refresh

EOF
)"
```

---

### Task 4: Create-response serializer caches + custom-field priming

**Files:**
- Modify: `app_course/serializers.py` (`CourseSerializer.create` return path + `to_representation`)
- Test: `app_course/tests/test_query_perf.py` budget test

**Interfaces:**
- Consumes: `get_course_primary_teacher_user` via `_prefetched_teacher_user_courses`; first-event method fields via `_first_event_time_from` / `_first_event_time_to`; `prime_custom_field_representation_cache`
- Produces: `attach_course_create_representation_caches(instance) -> None` (can be a module-level function in `serializers.py` or `course_search_queryset.py`)

- [ ] **Step 1: Add cache attachment helper**

Prefer putting this in `app_course/course_search_queryset.py` next to list helpers:

```python
def attach_course_create_representation_caches(course) -> None:
    """
    Avoid N method-field queries on 201 create response.
    Fresh create has no events; teacher roster may be empty or just auto-MT.
    """
    if not hasattr(course, "_first_event_time_from"):
        course._first_event_time_from = None
    if not hasattr(course, "_first_event_time_to"):
        course._first_event_time_to = None
    if getattr(course, "_prefetched_teacher_user_courses", None) is None:
        teacher_qs = models.UserCourse.objects.filter(
            course_id=course.pk,
            assigned_as=models.UserCourse.AssignedAs.TEACHER,
        ).select_related("user", "assigned_as_role")
        course._prefetched_teacher_user_courses = list(teacher_qs)
```

- [ ] **Step 2: Call helper at end of `CourseSerializer.create` before `return instance`**

```python
from app_course.course_search_queryset import (
    attach_course_create_representation_caches,
)

attach_course_create_representation_caches(instance)
return instance
```

- [ ] **Step 3: Prime custom fields in `to_representation`**

At the start of `CourseSerializer.to_representation`:

```python
def to_representation(self, instance):
    request = self.context.get("request")
    if request is not None:
        from app_custom_fields.validation import prime_custom_field_representation_cache

        prime_custom_field_representation_cache(request)
    ret = super().to_representation(instance)
    ...
```

(Keep existing `status` / `custom_data` / `microsoft_status` logic.)

- [ ] **Step 4: Run create query budget + related tests**

```bash
./scripts/run_backend_tests.sh \
  app_course.tests.test_query_perf.CourseCreateQueryPerfTest \
  app_course.tests.test_search_fts \
  app_course.tests.test_auto_assign_creator_mt
```

Expected: all PASS. If budget is 13–14 because of unavoidable FK validation SELECTs, raise the assert ceiling to the measured count **only after** confirming there is no `search_text` UPDATE and no per-method-field event/teacher N+1 (document the final bound in the assert message).

- [ ] **Step 5: Commit**

```bash
git add app_course/serializers.py app_course/course_search_queryset.py app_course/tests/test_query_perf.py
git commit -m "$(cat <<'EOF'
feat(course): prime create response caches to cut 201 SQL

EOF
)"
```

---

### Task 5: Spec coverage check + final verification

**Files:**
- None (verification only), unless budget constant needs a one-line tweak already covered in Task 4

**Interfaces:**
- Consumes: Tasks 1–4
- Produces: confirmation against spec success criteria

- [ ] **Step 1: Map spec → implementation**

Confirm each spec item:

| Spec item | Task |
| --- | --- |
| Precompute `search_text` on create | Task 3 |
| Skip post_save refresh via flag | Task 2–3 |
| Fallback when FK names unresolved | Task 3 (`_search_text_for_create` returns `None`) |
| 201 method-field caches | Task 4 |
| Custom-field prime | Task 4 |
| Query budget test | Task 1 + 4 |
| No Teams/auto-MT/API shape change | unchanged code paths |

- [ ] **Step 2: Re-run full related suite**

```bash
./scripts/run_backend_tests.sh \
  app_course.tests.test_query_perf \
  app_course.tests.test_search_fts \
  app_course.tests.test_auto_assign_creator_mt \
  app_course.tests.test_queryset_mixins
```

Expected: PASS.

- [ ] **Step 3: Manual smoke (optional)**

Scoped create with Teams off; DDT Server-Timing `SQL N queries` should be lower than ~21 on the same payload.

- [ ] **Step 4: Final commit only if budget constant or docs comment changed**

```bash
# only if needed
git add app_course/tests/test_query_perf.py
git commit -m "$(cat <<'EOF'
test(course): calibrate create query budget after hygiene

EOF
)"
```

---

## Plan self-review

1. **Spec coverage:** Precompute + skip flag, fallback, 201 caches, custom-field prime, query tests, non-goals respected — all mapped to tasks.
2. **Placeholders:** None; concrete code and commands included. Budget `12` may need calibration in Task 4 with evidence.
3. **Type consistency:** `SKIP_SEARCH_TEXT_REFRESH_ATTR`, `compute_course_search_text_from_fks`, `attach_course_create_representation_caches`, `_search_text_for_create`, `_create_course_row` names are consistent across tasks.
