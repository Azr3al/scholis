# Query Courses Starting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `query_courses_starting` AI tool (courses whose `start_date` falls in a calendar month) while keeping `query_courses` overlap semantics, via a shared runner.

**Architecture:** Refactor `run_query_courses` into `run_query_courses_filtered(args, user, *, date_mode)` with `_apply_date_filter()`. Two thin `Tool` registrations call the same runner with `date_mode="overlap"` or `"starting"`. Prompt rules route "new/starting" vs "active/overlap" intents.

**Tech Stack:** Django, tenant schemas, existing `app_ai.tools` registry, Gemini tool declarations.

**Spec:** `docs/superpowers/specs/2026-07-07-query-courses-starting-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/tools/query_courses.py` | `_apply_date_filter`, shared runner, `date_mode` in response, both tools |
| `app_ai/tools/registry.py` | Register `QUERY_COURSES_STARTING_TOOL` |
| `app_ai/prompts.py` | Overlap clarification + starting-tool routing |
| `app_ai/tests/test_query_courses_starting.py` | Starting-semantics integration tests |
| `app_ai/tests/test_query_courses.py` | Assert `date_mode == "overlap"` on existing tool |
| `app_ai/tests/test_tool_registry.py` | Add `query_courses_starting` to read-tools list |
| `app_ai/tests/test_tenant_context.py` | Assert starting-tool prompt rules present |

---

## Conventions

- **Tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="log_only")`
- **Base class:** Reuse `app_ai.tests.test_count_tools._CountToolsTestBase` (same as `test_query_courses.py`)
- **Run tests:** Always use `./scripts/run_backend_tests.sh <target>` (includes `--keepdb --noinput`)
- **Commits:** Only when the user asks
- **Branch:** Current branch (`dev`)

---

## Task 1: Failing tests for starting semantics

**Files:**
- Create: `app_ai/tests/test_query_courses_starting.py`

- [ ] **Step 1: Create test file**

Create `app_ai/tests/test_query_courses_starting.py`:

```python
import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.db import connection
from django.test import override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.tests.test_count_tools import _CountToolsTestBase
from app_ai.tools.query_courses import (
    DATE_MODE_STARTING,
    run_query_courses_starting,
)
from app_course.models import Category, Course, Program
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _clear_ai_org_cache(schema_name: str) -> None:
    cache = getattr(connection, "_ai_current_org_cache", None)
    if isinstance(cache, dict):
        cache.pop(schema_name, None)


def _titles(out: dict) -> list[str]:
    return [c["title"] for g in out["groups"] for c in g["courses"]]


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class QueryCoursesStartingTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = date(2026, 7, 7)
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.cat = Category.objects.create(name=f"KET {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
        self.suffix = suffix

    @patch("app_ai.tools.query_courses.org_today")
    def test_includes_course_starting_first_day_of_month(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            july = Course.objects.create(
                title=f"July start {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertNotIn("error", out)
        self.assertIn(july.title, _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_excludes_course_starting_before_month(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            june = Course.objects.create(
                title=f"June start {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 6, 30),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertNotIn(june.title, _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_spanning_course_in_start_month_only(self, mock_today):
        mock_today.return_value = date(2026, 6, 15)
        with schema_context(self.schema_name):
            spanning = Course.objects.create(
                title=f"Spanning {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 6, 15),
                end_date=date(2026, 7, 15),
                status=Course.CourseStatus.ACTIVE,
            )
            june_out = run_query_courses_starting({"month": 6}, self.admin)
            july_out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertIn(spanning.title, _titles(june_out))
        self.assertNotIn(spanning.title, _titles(july_out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_default_status_excludes_planned(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            planned = Course.objects.create(
                title=f"Planned July {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 10),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.PLANNED,
            )
            out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertNotIn(planned.title, _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_status_all_includes_planned(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            planned = Course.objects.create(
                title=f"Planned July {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 10),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.PLANNED,
            )
            out = run_query_courses_starting(
                {"month": 7, "course_status": "all"}, self.admin
            )
        self.assertIn(planned.title, _titles(out))

    @patch("app_ai.tools.query_courses.org_today")
    def test_teacher_denied(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses_starting({}, self.teacher)
        self.assertEqual(out["error"], "permission_denied")

    @patch("app_ai.tools.query_courses.org_today")
    def test_response_includes_date_mode_starting(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            Course.objects.create(
                title=f"July start {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses_starting({"month": 7}, self.admin)
        self.assertEqual(out["date_mode"], DATE_MODE_STARTING)
        self.assertEqual(out["filters_applied"]["date_mode"], DATE_MODE_STARTING)

    @patch("app_ai.tools.query_courses.org_today")
    def test_fm_filter_when_enabled(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_fm_hm_course_display_enabled = True
            org.save(update_fields=["is_fm_hm_course_display_enabled"])
        _clear_ai_org_cache(self.schema_name)
        with schema_context(self.schema_name):
            Course.objects.create(
                title=f"FM July {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 5),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            Course.objects.create(
                title=f"HM July {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=date(2026, 7, 20),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
            )
            out = run_query_courses_starting(
                {"month": 7, "month_type": "FM"}, self.admin
            )
        titles = _titles(out)
        self.assertTrue(any(t.startswith("FM July") for t in titles))
        self.assertFalse(any(t.startswith("HM July") for t in titles))
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_ai.tests.test_query_courses_starting
```

Expected: FAIL — `ImportError` for `run_query_courses_starting` / `DATE_MODE_STARTING`

---

## Task 2: Shared runner and date filter

**Files:**
- Modify: `app_ai/tools/query_courses.py`

- [ ] **Step 1: Add constants and `_apply_date_filter`**

After imports in `app_ai/tools/query_courses.py`, before `month_bounds`, add:

```python
DATE_MODE_OVERLAP = "overlap"
DATE_MODE_STARTING = "starting"
```

After `month_bounds`, add:

```python
def _apply_date_filter(qs, *, first_day: date, last_day: date, date_mode: str):
    if date_mode == DATE_MODE_STARTING:
        return qs.filter(start_date__gte=first_day, start_date__lte=last_day)
    return qs.filter(start_date__lte=last_day, end_date__gte=first_day)
```

- [ ] **Step 2: Rename body to `run_query_courses_filtered`**

Replace `def run_query_courses(args: dict[str, Any], user: User)` with:

```python
def run_query_courses_filtered(
    args: dict[str, Any], user: User, *, date_mode: str
) -> dict[str, Any]:
```

Change line 162 from:

```python
    qs = qs.filter(start_date__lte=last_day, end_date__gte=first_day)
```

to:

```python
    qs = _apply_date_filter(
        qs, first_day=first_day, last_day=last_day, date_mode=date_mode
    )
```

Add `date_mode` to `filters_applied` (first key):

```python
    filters_applied: dict[str, Any] = {
        "date_mode": date_mode,
        "course_status": course_status,
        ...
    }
```

Add `date_mode` to `result` (after `count`):

```python
    result: dict[str, Any] = {
        "count": len(courses),
        "date_mode": date_mode,
        "month": {
```

- [ ] **Step 3: Add thin wrappers**

After `run_query_courses_filtered`, before `QUERY_COURSES_TOOL`:

```python
def run_query_courses(args: dict[str, Any], user: User) -> dict[str, Any]:
    return run_query_courses_filtered(args, user, date_mode=DATE_MODE_OVERLAP)


def run_query_courses_starting(args: dict[str, Any], user: User) -> dict[str, Any]:
    return run_query_courses_filtered(args, user, date_mode=DATE_MODE_STARTING)
```

- [ ] **Step 4: Update `QUERY_COURSES_TOOL` description**

Replace description with:

```python
    description=(
        "List or count school-wide courses that overlap or run during the calendar "
        "month (defaults to current month): any course active on at least one day "
        "in the month. Filters: category (fuzzy name), WE/WD course_type, and "
        "FM/HM month_type when enabled. Year defaults to current calendar year "
        "unless user_stated_year is true. Use for active/running/in-session "
        "questions — not for new/starting classes. Admin only. Always include "
        "course names when answering counts."
    ),
```

- [ ] **Step 5: Run starting tests**

Run:

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_query_courses_starting
```

Expected: PASS (except possibly registry-related imports — wrappers exist)

- [ ] **Step 6: Run existing overlap tests**

Run:

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_query_courses
```

Expected: PASS (behavior unchanged; `date_mode` key is additive)

---

## Task 3: Register `query_courses_starting` tool

**Files:**
- Modify: `app_ai/tools/query_courses.py` (add `QUERY_COURSES_STARTING_TOOL`)
- Modify: `app_ai/tools/registry.py`

- [ ] **Step 1: Add tool definition**

After `QUERY_COURSES_TOOL` in `query_courses.py`:

```python
QUERY_COURSES_STARTING_TOOL = Tool(
    name="query_courses_starting",
    description=(
        "List or count school-wide courses whose start_date falls within the "
        "given calendar month (new/starting classes). Use when the user asks "
        "about new classes, classes starting or beginning in a month, or courses "
        "that start in a period. Same filters as query_courses (category, WE/WD, "
        "FM/HM, course_status). Year defaults to current calendar year unless "
        "user_stated_year is true. Admin only. Always include course names when "
        "answering counts."
    ),
    parameters=QUERY_COURSES_SCHEMA,
    run=run_query_courses_starting,
)
```

- [ ] **Step 2: Register in `registry.py`**

Add import:

```python
from app_ai.tools.query_courses import QUERY_COURSES_TOOL, QUERY_COURSES_STARTING_TOOL
```

(Replace existing `QUERY_COURSES_TOOL`-only import if present.)

Add to `TOOL_REGISTRY` after `QUERY_COURSES_TOOL`:

```python
    QUERY_COURSES_STARTING_TOOL.name: QUERY_COURSES_STARTING_TOOL,
```

- [ ] **Step 3: Update `test_tool_registry.py`**

In `test_core_tools_are_read_exposure`, add `"query_courses_starting"` after `"query_courses"`:

```python
            "query_courses",
            "query_courses_starting",
```

- [ ] **Step 4: Run registry + starting tests**

Run:

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_tool_registry app_ai.tests.test_query_courses_starting
```

Expected: PASS

---

## Task 4: Prompt rules for tool routing

**Files:**
- Modify: `app_ai/prompts.py`
- Modify: `app_ai/tests/test_tenant_context.py`

- [ ] **Step 1: Update `query_courses` prompt block**

In `PLATFORM_BASE_TEMPLATE`, replace the `Use query_courses for filtered` paragraph and following `Query courses` block with:

```python
Use query_courses for org-wide course questions about courses that overlap or run
during a calendar month (active/in-session during the month). Use
query_courses_starting when the user asks about new classes or courses whose
start_date falls within a month (starting, beginning, launching). When reporting
counts from either tool, always list linked course titles grouped by category.
Query courses (overlap — running during month):
- Use query_courses for active, running, or in-session questions.
- Ambiguous month-only questions (e.g. "classes in July" with no new/active cue)
  use query_courses.
- Default month and year are the current calendar month in the school's timezone.
  Omit month and year unless the user specifies a different period.
- When the user names a month without a year, pass only month — do not pass year.
- Set user_stated_year=true only when the user explicitly states a calendar year
  (e.g. "2026", "in 2025", "last year's June").
- Never guess or assume historical years (e.g. do not default to 2024).
- When reporting results, use month.label and date_mode from the tool response
  (e.g. "5 classes starting in July 2026" vs "active during July 2026").
Query courses starting (start_date in month):
- Use query_courses_starting for new, starting, begin, or launch + month.
- Same month/year/user_stated_year rules as query_courses above.
- Phrase answers using date_mode and month.label — never say "active in [month]"
  when date_mode is starting.
```

- [ ] **Step 2: Add tenant context test**

In `app_ai/tests/test_tenant_context.py`, add:

```python
    def test_platform_base_includes_query_courses_starting_rules(self):
        org = Organization(name="Demo School")
        text = build_platform_base_prompt(org)
        self.assertIn("query_courses_starting", text)
        self.assertIn("start_date", text)
        self.assertIn("Ambiguous month-only questions", text)
```

- [ ] **Step 3: Run tenant context tests**

Run:

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_tenant_context
```

Expected: PASS

---

## Task 5: Overlap `date_mode` regression assertion

**Files:**
- Modify: `app_ai/tests/test_query_courses.py`

- [ ] **Step 1: Add overlap date_mode test**

Add import:

```python
from app_ai.tools.query_courses import DATE_MODE_OVERLAP, run_query_courses
```

Add test method to `QueryCoursesTests`:

```python
    @patch("app_ai.tools.query_courses.org_today")
    def test_response_includes_date_mode_overlap(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses({}, self.admin)
        self.assertEqual(out["date_mode"], DATE_MODE_OVERLAP)
        self.assertEqual(out["filters_applied"]["date_mode"], DATE_MODE_OVERLAP)
```

- [ ] **Step 2: Run full query_courses test module**

Run:

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_query_courses
```

Expected: PASS

---

## Task 6: Final verification

- [ ] **Step 1: Run all affected tests together**

Run:

```bash
./scripts/run_backend_tests.sh app_ai.tests.test_query_courses app_ai.tests.test_query_courses_starting app_ai.tests.test_tool_registry app_ai.tests.test_tenant_context app_ai.tests.test_tool_links
```

Expected: All PASS

- [ ] **Step 2: Manual smoke check (optional)**

In Django shell or via AI query endpoint, verify:

- `query_courses({"month": 7})` returns `date_mode: "overlap"`
- `query_courses_starting({"month": 7})` returns only courses with July `start_date`

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Shared `run_query_courses_filtered` | Task 2 |
| `start_date` within month filter | Task 2 |
| Overlap unchanged | Task 2, 5 |
| `date_mode` in response | Task 2, 5 |
| `QUERY_COURSES_STARTING_TOOL` | Task 3 |
| Registry entry | Task 3 |
| Prompt routing rules | Task 4 |
| Default `course_status: active` | Task 1 (planned exclusion test) |
| Ambiguous → overlap | Task 4 |
| RBAC admin-only | Task 1 |
| FM/HM parity | Task 1 |
| Spanning boundary | Task 1 |
| Telegram + web (shared stack) | Task 4 (prompts only — no channel-specific code) |
