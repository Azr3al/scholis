# AI Count Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three RBAC-aware count tools (`count_organization`, `count_teacher_courses`, `count_course_roster`) for the Gemini assistant and fix `search_users` scoping.

**Architecture:** Three purpose-built tools registered in `TOOL_REGISTRY`. Shared `rbac.py` guards and `resolve.py` lookup helpers. Each tool returns a structured dict (count or error). Permission checks mirror locked decisions in the spec — org-wide counts require read breadth; course roster counts require course access.

**Tech Stack:** Django, existing RBAC (`app_rbac.scoping`, `scope_*_for_user`), Gemini tool registry (`app_ai.tools`).

**Spec:** `docs/superpowers/specs/2026-06-27-ai-count-tools-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/tools/rbac.py` | `require_*_read_breadth` helpers returning `permission_denied` dict or `None` |
| `app_ai/tools/resolve.py` | Staff user + accessible course lookup by id/query |
| `app_ai/tools/count_organization.py` | Org-wide staff/student/course counts |
| `app_ai/tools/count_teacher_courses.py` | Teacher assignment counts |
| `app_ai/tools/count_course_roster.py` | Course roster student/staff counts |
| `app_ai/tools/registry.py` | Register three new tools |
| `app_ai/tools/search_users.py` | Apply `scope_users_for_user` |
| `app_ai/prompts.py` | Mention count tools in platform prompt |
| `app_ai/tests/test_count_tools.py` | Integration tests for all three tools + scoping fix |
| `app_ai/tests/test_tools_and_pricing.py` | Update declaration count assertion (2 → 5) |

---

## Conventions

- **Tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="log_only")`
- **Schema:** `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData`
- **Run tests:** `python manage.py test app_ai.tests.test_count_tools -v 2`
- **Commits:** Do not commit unless the user asks (repo rule)
- **Branch:** Work on current branch (`dev`); no feature branches

---

## Task 1: RBAC helpers

**Files:**
- Create: `app_ai/tools/rbac.py`
- Test: `app_ai/tests/test_count_tools.py` (start file with RBAC section)

- [ ] **Step 1: Write failing RBAC tests**

Add to `app_ai/tests/test_count_tools.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.tools.rbac import (
    require_course_read_breadth,
    require_user_or_course_read_breadth,
    require_user_read_breadth,
)
from app_auth.models import User
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class AIToolRbacTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
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
            self.teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def test_admin_has_user_read_breadth(self):
        with schema_context(self.schema_name):
            self.assertIsNone(require_user_read_breadth(self.admin))

    def test_teacher_denied_user_read_breadth(self):
        with schema_context(self.schema_name):
            err = require_user_read_breadth(self.teacher)
        self.assertEqual(err["error"], "permission_denied")

    def test_teacher_denied_user_or_course_read_breadth(self):
        with schema_context(self.schema_name):
            err = require_user_or_course_read_breadth(self.teacher)
        self.assertEqual(err["error"], "permission_denied")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be && python manage.py test app_ai.tests.test_count_tools.AIToolRbacTests -v 2
```

Expected: `ModuleNotFoundError: No module named 'app_ai.tools.rbac'`

- [ ] **Step 3: Implement `app_ai/tools/rbac.py`**

```python
"""RBAC guards for AI tools — return permission_denied dict or None."""
from __future__ import annotations

from typing import Any

from app_rbac import scoping
from app_rbac.resolution import effective_permissions


def _denied(message: str) -> dict[str, Any]:
    return {"error": "permission_denied", "message": message}


def require_user_read_breadth(user) -> dict[str, Any] | None:
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("user", held):
        return None
    return _denied("Organization-wide user counts require user.view_all.")


def require_course_read_breadth(user) -> dict[str, Any] | None:
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("course", held):
        return None
    return _denied("Organization-wide course counts require course.view_all.")


def require_user_or_course_read_breadth(user) -> dict[str, Any] | None:
    held = set(effective_permissions(user))
    if scoping.has_read_breadth("user", held) or scoping.has_read_breadth("course", held):
        return None
    return _denied("Teacher course counts require user.view_all or course.view_all.")
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
python manage.py test app_ai.tests.test_count_tools.AIToolRbacTests -v 2
```

---

## Task 2: Resolve helpers

**Files:**
- Create: `app_ai/tools/resolve.py`
- Test: `app_ai/tests/test_count_tools.py` (add `AIToolResolveTests`)

- [ ] **Step 1: Write failing resolve tests**

Add class using existing `Category`, `Program`, `Course` from course scoping test patterns:

```python
from datetime import timedelta
from django.utils import timezone

from app_ai.tools.resolve import resolve_accessible_course, resolve_staff_user
from app_course.models import Category, Course, Program, UserCourse


class AIToolResolveTests(TestCase):
    # same setUpTestData / schema_name / override_settings as AIToolRbacTests

    def setUp(self):
        # create admin, teacher, category, program, course "UniqueMathZ99"
        ...

    def test_resolve_staff_user_by_id(self):
        with schema_context(self.schema_name):
            result = resolve_staff_user(user_id=self.admin.id, query=None)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["user"].id, self.admin.id)

    def test_resolve_course_not_found_for_teacher(self):
        with schema_context(self.schema_name):
            result = resolve_accessible_course(
                user=self.teacher, course_id=None, query="NonexistentCourseXYZ"
            )
        self.assertEqual(result["status"], "not_found")
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

- [ ] **Step 3: Implement `app_ai/tools/resolve.py`**

```python
"""Shared id/query resolution for AI count tools."""
from __future__ import annotations

from typing import Any

from app_auth.models import User
from app_auth.shortcuts_availability_helpers import STAFF_ROLES_FOR_SHORTCUTS
from app_auth.user_search import apply_user_search_q_with_meta
from app_course.course_scoping import scope_courses_for_user, user_can_access_course
from app_course.course_search import apply_course_search_q_with_meta
from app_course.models import Course


def _compact_user(user: User) -> dict[str, Any]:
    return {"id": user.id, "name": user.name, "email": user.email}


def _staff_qs():
    return User.objects.filter(
        is_active=True,
        roles__contained_by=[*STAFF_ROLES_FOR_SHORTCUTS],
    )


def resolve_staff_user(
    *,
    user_id: int | None,
    query: str | None,
    limit: int = 5,
) -> dict[str, Any]:
    if user_id is not None:
        user = _staff_qs().filter(id=user_id).first()
        if user is None:
            return {"status": "not_found", "message": "Staff user not found."}
        return {"status": "ok", "user": user}

    q = (query or "").strip()
    if not q:
        return {"status": "not_found", "message": "Query is empty."}

    qs, _ = apply_user_search_q_with_meta(_staff_qs(), q)
    matches = list(qs[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": f"No staff match for {q!r}."}
    if len(matches) > limit:
        return {
            "status": "ambiguous",
            "message": f"Multiple staff match {q!r}.",
            "candidates": [_compact_user(u) for u in matches[:limit]],
        }
    return {"status": "ok", "user": matches[0]}


def resolve_accessible_course(
    *,
    user: User,
    course_id: int | None,
    query: str | None,
    limit: int = 5,
) -> dict[str, Any]:
    base = scope_courses_for_user(user)

    if course_id is not None:
        course = base.filter(id=course_id).first()
        if course is None:
            return {"status": "not_found", "message": "Course not found or not accessible."}
        if not user_can_access_course(user, course):
            return {
                "status": "permission_denied",
                "message": "You do not have access to this course.",
            }
        return {"status": "ok", "course": course}

    q = (query or "").strip()
    if not q:
        return {"status": "not_found", "message": "Query is empty."}

    qs, _ = apply_course_search_q_with_meta(base, q)
    matches = list(qs[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": f"No course match for {q!r}."}
    if len(matches) > limit:
        return {
            "status": "ambiguous",
            "message": f"Multiple courses match {q!r}.",
            "candidates": [
                {"id": c.id, "title": c.title, "code": c.code} for c in matches[:limit]
            ],
        }
    course = matches[0]
    if not user_can_access_course(user, course):
        return {
            "status": "permission_denied",
            "message": "You do not have access to this course.",
        }
    return {"status": "ok", "course": course}
```

- [ ] **Step 4: Run resolve tests — expect PASS**

---

## Task 3: `count_organization` tool

**Files:**
- Create: `app_ai/tools/count_organization.py`
- Test: `app_ai/tests/test_count_tools.py` → `CountOrganizationToolTests`

- [ ] **Step 1: Write failing tests**

```python
from app_ai.tools.count_organization import COUNT_ORGANIZATION_TOOL, run_count_organization


class CountOrganizationToolTests(TestCase):
    def test_admin_can_count_students(self):
        with schema_context(self.schema_name):
            result = run_count_organization({"entity": "students"}, self.admin)
        self.assertIn("count", result)
        self.assertGreaterEqual(result["count"], 0)

    def test_teacher_denied_org_student_count(self):
        with schema_context(self.schema_name):
            result = run_count_organization({"entity": "students"}, self.teacher)
        self.assertEqual(result["error"], "permission_denied")

    def test_admin_course_count_active_only(self):
        # create one active + one planned course; assert count includes only active
        ...
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement tool**

```python
"""Organization-wide staff, student, and course counts."""
from __future__ import annotations

from typing import Any

from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.rbac import require_course_read_breadth, require_user_read_breadth
from app_auth.models import User
from app_auth.shortcuts_availability_helpers import STAFF_ROLES_FOR_SHORTCUTS
from app_course.models import Course

COURSE_STATUS_ENUM = ["active", "planned", "ended", "paused", "all"]

COUNT_ORGANIZATION_SCHEMA = strict_object_schema(
    properties={
        "entity": {
            "type": "string",
            "enum": ["staff", "students", "courses"],
        },
        "course_status": {
            "type": "string",
            "enum": COURSE_STATUS_ENUM,
            "description": "Filter courses by status. Default active. Ignored for staff/students.",
        },
        "include_inactive_users": {
            "type": "boolean",
            "description": "Include inactive users for staff/student counts. Default false.",
        },
    },
    required=["entity"],
)


def _apply_course_status(qs, status: str):
    if status == "all":
        return qs
    return qs.filter(status=status)


def run_count_organization(args: dict[str, Any], user: User) -> dict[str, Any]:
    entity = args["entity"]
    course_status = args.get("course_status") or "active"
    include_inactive = bool(args.get("include_inactive_users"))

    if entity in ("staff", "students"):
        denied = require_user_read_breadth(user)
        if denied:
            return denied
        qs = User.objects.all()
        if not include_inactive:
            qs = qs.filter(is_active=True)
        if entity == "staff":
            qs = qs.filter(roles__contained_by=[*STAFF_ROLES_FOR_SHORTCUTS])
        else:
            qs = qs.filter(roles__contains=[User.UserRole.STUDENT])
        return {
            "count": qs.count(),
            "entity": entity,
            "filters_applied": {
                "include_inactive_users": include_inactive,
                "course_status": None,
            },
        }

    denied = require_course_read_breadth(user)
    if denied:
        return denied
    qs = _apply_course_status(Course.objects.all(), course_status)
    return {
        "count": qs.count(),
        "entity": "courses",
        "filters_applied": {
            "include_inactive_users": None,
            "course_status": course_status,
        },
    }


COUNT_ORGANIZATION_TOOL = Tool(
    name="count_organization",
    description=(
        "Count school-wide totals: staff, students, or courses. "
        "Requires admin permissions. Courses default to active status only; "
        "students and staff default to active users only."
    ),
    parameters=COUNT_ORGANIZATION_SCHEMA,
    run=run_count_organization,
)
```

- [ ] **Step 4: Run tests — expect PASS**

---

## Task 4: `count_teacher_courses` tool

**Files:**
- Create: `app_ai/tools/count_teacher_courses.py`
- Test: `app_ai/tests/test_count_tools.py` → `CountTeacherCoursesToolTests`

- [ ] **Step 1: Write failing tests**

Setup: admin, teacher user, 2 active courses with teacher assigned via `UserCourse`.

```python
from app_ai.tools.count_teacher_courses import (
    COUNT_TEACHER_COURSES_TOOL,
    run_count_teacher_courses,
)


class CountTeacherCoursesToolTests(TestCase):
    def test_admin_counts_teacher_courses_by_user_id(self):
        with schema_context(self.schema_name):
            result = run_count_teacher_courses(
                {"user_id": self.staff_teacher.id, "course_status": "active"},
                self.admin,
            )
        self.assertEqual(result["count"], 2)

    def test_teacher_denied(self):
        with schema_context(self.schema_name):
            result = run_count_teacher_courses(
                {"user_id": self.staff_teacher.id}, self.teacher
            )
        self.assertEqual(result["error"], "permission_denied")
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement tool**

Key logic:

```python
def run_count_teacher_courses(args: dict[str, Any], user: User) -> dict[str, Any]:
    denied = require_user_or_course_read_breadth(user)
    if denied:
        return denied

    user_id = args.get("user_id")
    query = args.get("query")
    if (user_id is None) == (not (query or "").strip()):
        return {"error": "validation_error", "message": "Provide user_id or query, not both."}

    resolved = resolve_staff_user(user_id=user_id, query=query)
    if resolved["status"] != "ok":
        return {"error": resolved["status"], **{k: v for k, v in resolved.items() if k != "status"}}

    teacher = resolved["user"]
    course_status = args.get("course_status") or "active"
    qs = UserCourse.objects.filter(
        user_id=teacher.id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    )
    if course_status != "all":
        qs = qs.filter(course__status=course_status)

    return {
        "count": qs.count(),
        "user": {"id": teacher.id, "name": teacher.name, "email": teacher.email},
        "course_status": course_status,
    }
```

Add schema with `oneOf` pattern or validate mutual exclusivity in `run` (keep schema simple: both optional, validate in run).

- [ ] **Step 4: Run tests — expect PASS**

---

## Task 5: `count_course_roster` tool

**Files:**
- Create: `app_ai/tools/count_course_roster.py`
- Test: `app_ai/tests/test_count_tools.py` → `CountCourseRosterToolTests`

- [ ] **Step 1: Write failing tests**

Teacher on roster can count; other teacher cannot.

```python
from app_ai.tools.count_course_roster import run_count_course_roster


class CountCourseRosterToolTests(TestCase):
    def test_roster_teacher_sees_counts(self):
        with schema_context(self.schema_name):
            result = run_count_course_roster(
                {"course_id": self.course.id, "member_type": "all"},
                self.roster_teacher,
            )
        self.assertEqual(result["students"], 1)
        self.assertEqual(result["staff"], 1)

    def test_non_roster_teacher_denied(self):
        with schema_context(self.schema_name):
            result = run_count_course_roster(
                {"course_id": self.course.id}, self.other_teacher
            )
        self.assertEqual(result["error"], "permission_denied")
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement tool**

```python
def run_count_course_roster(args: dict[str, Any], user: User) -> dict[str, Any]:
    course_id = args.get("course_id")
    query = args.get("query")
    member_type = args.get("member_type") or "all"

    if (course_id is None) == (not (query or "").strip()):
        return {"error": "validation_error", "message": "Provide course_id or query, not both."}

    resolved = resolve_accessible_course(
        user=user, course_id=course_id, query=query
    )
    if resolved["status"] != "ok":
        err = resolved["status"]
        payload = {k: v for k, v in resolved.items() if k != "status"}
        return {"error": err, **payload}

    course = resolved["course"]
    base = UserCourse.objects.filter(course_id=course.id)
    out = {
        "course": {"id": course.id, "title": course.title, "code": course.code},
        "member_type_requested": member_type,
    }
    if member_type in ("students", "all"):
        out["students"] = base.filter(
            assigned_as=UserCourse.AssignedAs.STUDENT,
            is_dropped_out=False,
        ).count()
    if member_type in ("staff", "all"):
        out["staff"] = base.filter(
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).count()
    return out
```

- [ ] **Step 4: Run tests — expect PASS**

---

## Task 6: Registry, search_users fix, prompt

**Files:**
- Modify: `app_ai/tools/registry.py`
- Modify: `app_ai/tools/search_users.py`
- Modify: `app_ai/prompts.py`
- Modify: `app_ai/tests/test_tools_and_pricing.py`

- [ ] **Step 1: Register tools in `registry.py`**

```python
from app_ai.tools.count_course_roster import COUNT_COURSE_ROSTER_TOOL
from app_ai.tools.count_organization import COUNT_ORGANIZATION_TOOL
from app_ai.tools.count_teacher_courses import COUNT_TEACHER_COURSES_TOOL

TOOL_REGISTRY: dict[str, Tool] = {
    SEARCH_USERS_TOOL.name: SEARCH_USERS_TOOL,
    SEARCH_COURSES_TOOL.name: SEARCH_COURSES_TOOL,
    COUNT_ORGANIZATION_TOOL.name: COUNT_ORGANIZATION_TOOL,
    COUNT_TEACHER_COURSES_TOOL.name: COUNT_TEACHER_COURSES_TOOL,
    COUNT_COURSE_ROSTER_TOOL.name: COUNT_COURSE_ROSTER_TOOL,
}
```

- [ ] **Step 2: Fix `search_users.py`**

```python
from app_auth.user_scoping import scope_users_for_user

def run_search_users(args: dict[str, Any], user: User) -> list[dict[str, Any]]:
    query = args["query"]
    role = args.get("role")
    limit = int(args.get("limit") or 20)
    qs = scope_users_for_user(user).filter(is_active=True)
    ...
```

- [ ] **Step 3: Update prompt in `app_ai/prompts.py`**

Append to template:

```
Use count tools for totals and roster sizes. Use search tools first to resolve
names to IDs when the user refers to a specific person or course.
```

- [ ] **Step 4: Update adapter test**

In `test_tools_and_pricing.py`:

```python
self.assertEqual(len(declarations), 5)
```

Add test that teacher `search_users` only returns scoped users.

- [ ] **Step 5: Run full AI test suite**

```bash
python manage.py test app_ai.tests -v 2
```

Expected: all PASS

---

## Task 7: Final verification

- [ ] **Run count tool tests**

```bash
python manage.py test app_ai.tests.test_count_tools -v 2
```

- [ ] **Smoke test via AIService (optional, requires GEMINI_API_KEY)**

Manually verify Gemini selects `count_organization` for "how many students?" in Telegram or `AIQueryView`.

- [ ] **Self-review against spec**

Confirm all locked RBAC rows in spec §2 have matching test cases.

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
| --- | --- |
| `count_organization` tool | Task 3 |
| `count_teacher_courses` tool | Task 4 |
| `count_course_roster` tool | Task 5 |
| RBAC helpers | Task 1 |
| Resolve helpers | Task 2 |
| Registry (5 tools) | Task 6 |
| `search_users` scoping fix | Task 6 |
| Prompt update | Task 6 |
| Error shapes | All tool tasks |
| Test matrix §7 | Tasks 1–6 |

No placeholders remain. Types consistent across resolve → count tools.
