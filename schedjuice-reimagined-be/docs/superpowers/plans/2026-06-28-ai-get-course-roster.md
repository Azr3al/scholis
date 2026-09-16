# AI Get Course Roster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `get_course_roster` so the AI assistant can return MT/AT/student names for a specific course in one tool call (fixes tool-limit failures on “who teaches PET 151?” style questions).

**Architecture:** New read tool in `app_ai/tools/get_course_roster.py` reusing `resolve_accessible_course` (same as `count_course_roster`). Query `UserCourse` with role seniority bucketing; map members via `compact_user_for_ai`. Register in `TOOL_REGISTRY`; update platform prompt to distinguish roster names vs counts.

**Tech Stack:** Django, `UserCourse` / `AssignedAsRole`, existing AI tool registry and link helpers.

**Spec:** `docs/superpowers/specs/2026-06-28-ai-get-course-roster-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/tools/get_course_roster.py` | Tool schema, handler, `GET_COURSE_ROSTER_TOOL` |
| `app_ai/tools/registry.py` | Register new tool |
| `app_ai/prompts.py` | Prompt guidance for roster vs count |
| `app_ai/tests/test_get_course_roster.py` | Integration tests |
| `app_ai/tests/test_tool_registry.py` | Add `get_course_roster` to read-exposure list |
| `app_ai/tests/test_tools_and_pricing.py` | Bump declaration count 11 → 12 |

---

## Conventions

- **Tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="log_only")`
- **Schema:** `schema_name = "xschedjuice"`, reuse `_CountToolsTestBase` patterns from `test_count_tools.py`
- **Run all new tests:** `python manage.py test app_ai.tests.test_get_course_roster -v 2`
- **Run full AI suite (sanity):** `python manage.py test app_ai.tests.test_get_course_roster app_ai.tests.test_tool_registry app_ai.tests.test_tools_and_pricing -v 2`
- **Commits:** Do not commit unless the user asks (repo rule)
- **Branch:** Work on current branch; no feature branches

---

## Task 1: Core handler + happy-path test

**Files:**
- Create: `app_ai/tools/get_course_roster.py`
- Create: `app_ai/tests/test_get_course_roster.py`

- [ ] **Step 1: Write failing happy-path test**

Create `app_ai/tests/test_get_course_roster.py`:

```python
import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import schema_context
from unittest.mock import patch

from app_ai.tools.get_course_roster import run_get_course_roster
from app_auth.models import User
from app_course.models import AssignedAsRole, Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class _GetCourseRosterTestBase(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._telegram_invite_patch = patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._telegram_remove_patch = patch(
            "app_telegram.signals.remove_telegram_member.delay"
        )
        cls._telegram_invite_patch.start()
        cls._telegram_remove_patch.start()

    @classmethod
    def tearDownClass(cls):
        cls._telegram_remove_patch.stop()
        cls._telegram_invite_patch.stop()
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _create_admin(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class GetCourseRosterHappyPathTests(_GetCourseRosterTestBase):
    def setUp(self):
        self._create_admin()
        self.today = timezone.localdate()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.mt_role = AssignedAsRole.objects.create(
                name=f"Main Teacher {suffix}",
                seniority=AssignedAsRole.Seniority.MAIN_TEACHER,
            )
            self.at_role = AssignedAsRole.objects.create(
                name=f"Assistant Teacher {suffix}",
                seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER,
            )
            self.main_teacher = User.objects.create_user(
                email=f"mt-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Tr. Main",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.assistant_teacher = User.objects.create_user(
                email=f"at-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Tr. Assistant",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"stu-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student Active",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"PET 151 {suffix}",
                code=f"PET151-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.main_teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.mt_role,
            )
            UserCourse.objects.create(
                user=self.assistant_teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.at_role,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                is_dropped_out=False,
            )

    def test_returns_mt_at_and_active_students_by_query(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"query": self.course.code},
                self.admin,
            )
        self.assertNotIn("error", result)
        self.assertEqual(result["course"]["id"], self.course.id)
        self.assertEqual(len(result["main_teachers"]), 1)
        self.assertEqual(result["main_teachers"][0]["name"], "Tr. Main")
        self.assertIn("profile_url", result["main_teachers"][0])
        self.assertEqual(len(result["assistant_teachers"]), 1)
        self.assertEqual(result["assistant_teachers"][0]["name"], "Tr. Assistant")
        self.assertEqual(len(result["students"]), 1)
        self.assertEqual(result["students"][0]["name"], "Student Active")
        self.assertFalse(result["students"][0]["is_dropped_out"])
        self.assertEqual(result["counts"]["main_teachers"], 1)
        self.assertEqual(result["counts"]["assistant_teachers"], 1)
        self.assertEqual(result["counts"]["students"], 1)
        self.assertEqual(result["other_staff"], [])
        self.assertEqual(result["counts"]["other_staff"], 0)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be && python manage.py test app_ai.tests.test_get_course_roster.GetCourseRosterHappyPathTests.test_returns_mt_at_and_active_students_by_query -v 2
```

Expected: `ModuleNotFoundError: No module named 'app_ai.tools.get_course_roster'`

- [ ] **Step 3: Implement `get_course_roster.py`**

Create `app_ai/tools/get_course_roster.py`:

```python
"""Return course roster member names (teachers and students)."""
from __future__ import annotations

from typing import Any

from app_ai.links import compact_user_for_ai, get_current_org, with_course_link
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.resolve import resolve_accessible_course
from app_auth.models import User
from app_course.models import AssignedAsRole, UserCourse

GET_COURSE_ROSTER_SCHEMA = strict_object_schema(
    properties={
        "course_id": {
            "type": "integer",
            "description": "Course id from a prior search_courses result.",
        },
        "query": {
            "type": "string",
            "description": "Course title or code when course_id is unknown.",
            "minLength": 1,
        },
        "include_dropped_students": {
            "type": "boolean",
            "description": (
                "Include withdrawn students. Default false (active enrollments only)."
            ),
        },
        "include_other_staff": {
            "type": "boolean",
            "description": (
                "Include teachers with OTHER seniority. Default false (MT/AT only)."
            ),
        },
    },
    required=[],
)


def _compact_student(user: User, *, org, is_dropped_out: bool) -> dict[str, Any]:
    row = compact_user_for_ai(user, org=org)
    row["is_dropped_out"] = is_dropped_out
    return row


def _sort_members(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: (row.get("name") or "").lower())


def run_get_course_roster(args: dict[str, Any], user: User) -> dict[str, Any]:
    course_id = args.get("course_id")
    query = args.get("query")
    include_dropped_students = bool(args.get("include_dropped_students"))
    include_other_staff = bool(args.get("include_other_staff"))

    has_id = course_id is not None
    has_query = bool((query or "").strip())
    if has_id == has_query:
        return {
            "error": "validation_error",
            "message": "Provide exactly one of course_id or query.",
        }

    resolved = resolve_accessible_course(
        user=user, course_id=course_id, query=query
    )
    if resolved["status"] != "ok":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    course = resolved["course"]
    org = get_current_org()
    course_row = with_course_link(
        {"id": course.id, "title": course.title, "code": course.code},
        org=org,
    )

    teacher_rows = (
        UserCourse.objects.filter(
            course_id=course.id,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        )
        .select_related("user", "assigned_as_role")
    )

    main_teachers: list[dict[str, Any]] = []
    assistant_teachers: list[dict[str, Any]] = []
    other_staff: list[dict[str, Any]] = []

    for enrollment in teacher_rows:
        role = enrollment.assigned_as_role
        seniority = getattr(role, "seniority", None)
        member = compact_user_for_ai(enrollment.user, org=org)
        if seniority == AssignedAsRole.Seniority.MAIN_TEACHER:
            main_teachers.append(member)
        elif seniority == AssignedAsRole.Seniority.ASSISTANT_TEACHER:
            assistant_teachers.append(member)
        elif include_other_staff and seniority == AssignedAsRole.Seniority.OTHER:
            other_staff.append(member)

    student_qs = UserCourse.objects.filter(
        course_id=course.id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("user")
    if not include_dropped_students:
        student_qs = student_qs.filter(is_dropped_out=False)

    students = [
        _compact_student(
            enrollment.user,
            org=org,
            is_dropped_out=enrollment.is_dropped_out,
        )
        for enrollment in student_qs
    ]

    return {
        "course": course_row,
        "main_teachers": _sort_members(main_teachers),
        "assistant_teachers": _sort_members(assistant_teachers),
        "other_staff": _sort_members(other_staff),
        "students": _sort_members(students),
        "counts": {
            "main_teachers": len(main_teachers),
            "assistant_teachers": len(assistant_teachers),
            "other_staff": len(other_staff),
            "students": len(students),
        },
    }


GET_COURSE_ROSTER_TOOL = Tool(
    name="get_course_roster",
    description=(
        "Get names of teachers (main and assistant by default) and students on a "
        "specific course roster. Requires access to the course. Provide course_id "
        "from search_courses or a query to look up the course. Use count_course_roster "
        "when the user only wants counts, not names."
    ),
    parameters=GET_COURSE_ROSTER_SCHEMA,
    run=run_get_course_roster,
)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-be && python manage.py test app_ai.tests.test_get_course_roster.GetCourseRosterHappyPathTests.test_returns_mt_at_and_active_students_by_query -v 2
```

Expected: PASS

---

## Task 2: Optional flags + RBAC + validation tests

**Files:**
- Modify: `app_ai/tests/test_get_course_roster.py`

- [ ] **Step 1: Add tests for dropped students, other staff, access, validation**

Append to `app_ai/tests/test_get_course_roster.py`:

```python
@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class GetCourseRosterFilterTests(_GetCourseRosterTestBase):
    def setUp(self):
        self._create_admin()
        self.today = timezone.localdate()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            self.other_role = AssignedAsRole.objects.create(
                name=f"Other {suffix}",
                seniority=AssignedAsRole.Seniority.OTHER,
            )
            self.other_staff_user = User.objects.create_user(
                email=f"other-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Tr. Other",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.dropped_student = User.objects.create_user(
                email=f"dropped-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student Dropped",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.active_student = User.objects.create_user(
                email=f"active-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student Active",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.roster_teacher = User.objects.create_user(
                email=f"rostert-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Roster Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.other_teacher = User.objects.create_user(
                email=f"outsider-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Outside Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"FilterCourse {suffix}",
                code=f"FC-{suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=30),
                status=Course.CourseStatus.ACTIVE,
                created_by=self.admin,
            )
            UserCourse.objects.create(
                user=self.other_staff_user,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
                assigned_as_role=self.other_role,
            )
            UserCourse.objects.create(
                user=self.roster_teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.active_student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                is_dropped_out=False,
            )
            UserCourse.objects.create(
                user=self.dropped_student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
                is_dropped_out=True,
            )

    def test_excludes_dropped_students_by_default(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"course_id": self.course.id},
                self.admin,
            )
        names = {row["name"] for row in result["students"]}
        self.assertIn("Student Active", names)
        self.assertNotIn("Student Dropped", names)

    def test_include_dropped_students(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {
                    "course_id": self.course.id,
                    "include_dropped_students": True,
                },
                self.admin,
            )
        dropped = [row for row in result["students"] if row["name"] == "Student Dropped"]
        self.assertEqual(len(dropped), 1)
        self.assertTrue(dropped[0]["is_dropped_out"])

    def test_excludes_other_staff_by_default(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"course_id": self.course.id},
                self.admin,
            )
        self.assertEqual(result["other_staff"], [])
        self.assertEqual(result["counts"]["other_staff"], 0)

    def test_include_other_staff(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {
                    "course_id": self.course.id,
                    "include_other_staff": True,
                },
                self.admin,
            )
        self.assertEqual(len(result["other_staff"]), 1)
        self.assertEqual(result["other_staff"][0]["name"], "Tr. Other")

    def test_roster_teacher_can_read_full_roster(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"course_id": self.course.id},
                self.roster_teacher,
            )
        self.assertNotIn("error", result)
        self.assertEqual(result["counts"]["students"], 1)

    def test_non_roster_teacher_gets_not_found_by_course_id(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster(
                {"course_id": self.course.id},
                self.other_teacher,
            )
        self.assertEqual(result["error"], "not_found")

    def test_validation_requires_exactly_one_lookup(self):
        with schema_context(self.schema_name):
            result = run_get_course_roster({}, self.admin)
        self.assertEqual(result["error"], "validation_error")
```

- [ ] **Step 2: Run tests**

```bash
cd schedjuice-reimagined-be && python manage.py test app_ai.tests.test_get_course_roster.GetCourseRosterFilterTests -v 2
```

Expected: PASS (handler from Task 1 already covers these cases)

---

## Task 3: Register tool + update prompt

**Files:**
- Modify: `app_ai/tools/registry.py`
- Modify: `app_ai/prompts.py`

- [ ] **Step 1: Register in `registry.py`**

Add import:

```python
from app_ai.tools.get_course_roster import GET_COURSE_ROSTER_TOOL
```

Add to `TOOL_REGISTRY` (after `COUNT_COURSE_ROSTER_TOOL`):

```python
    GET_COURSE_ROSTER_TOOL.name: GET_COURSE_ROSTER_TOOL,
```

- [ ] **Step 2: Update platform prompt**

In `app_ai/prompts.py`, after the `Use count tools for totals and roster sizes.` sentence block, add:

```python
Use get_course_roster when the user asks who teaches or who is enrolled on a
specific course (names, not just counts). Use count_course_roster only for how
many students or teachers are on a course.
```

Full context — replace lines 16–17 area so it reads:

```python
Use count tools for totals and roster sizes. Use get_course_roster when the user
asks who teaches or who is enrolled on a specific course (names, not just counts).
Use count_course_roster only for how many students or teachers are on a course.
Student totals from count_organization
```

- [ ] **Step 3: Update registry metadata test**

In `app_ai/tests/test_tool_registry.py`, add `"get_course_roster"` to the tuple in `test_core_tools_are_read_exposure`:

```python
        for name in (
            "search_users",
            "search_courses",
            "count_organization",
            "count_teacher_courses",
            "count_course_roster",
            "get_course_roster",
            "list_user_courses",
            "query_courses",
        ):
```

- [ ] **Step 4: Bump Gemini declaration count**

In `app_ai/tests/test_tools_and_pricing.py`, change:

```python
        self.assertEqual(len(declarations), 11)
```

to:

```python
        self.assertEqual(len(declarations), 12)
```

- [ ] **Step 5: Run registry + adapter tests**

```bash
cd schedjuice-reimagined-be && python manage.py test app_ai.tests.test_tool_registry app_ai.tests.test_tools_and_pricing -v 2
```

Expected: PASS

---

## Task 4: Final verification

- [ ] **Step 1: Run full new-tool test module**

```bash
cd schedjuice-reimagined-be && python manage.py test app_ai.tests.test_get_course_roster -v 2
```

Expected: all tests PASS

- [ ] **Step 2: Smoke-check tool is invokable via registry**

```bash
cd schedjuice-reimagined-be && python manage.py shell -c "
from app_ai.tools.registry import get_tool
t = get_tool('get_course_roster')
print(t.name, t.exposure)
"
```

Expected: `get_course_roster read`

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| New `get_course_roster` tool | Task 1 |
| MT/AT bucketing, optional OTHER | Task 1 + Task 2 |
| Active students default, optional dropped | Task 2 |
| `compact_user_for_ai` + `profile_url` | Task 1 |
| Course row with `url` via `with_course_link` | Task 1 |
| Same RBAC as `count_course_roster` | Task 2 (`not_found` for unscoped course_id matches sibling behavior) |
| Registry + read exposure | Task 3 |
| Prompt guidance | Task 3 |
| Tests per spec table | Tasks 1–2 |

---

## Out of scope (do not implement)

- Changes to `count_course_roster` or `search_courses`
- Pagination / truncation
- Frontend changes
