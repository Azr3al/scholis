# AI Unpaid Students Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `get_unpaid_students` AI read tool so SuConnect can answer unpaid-student count and name questions using existing finance helpers and RBAC.

**Architecture:** Single tool in `app_ai/tools/get_unpaid_students.py` with thin RBAC wrapper in `unpaid_rbac.py`. Month bounds built via tenant timezone helpers (same logic as utility notifications). Course mode calls `unpaid_student_user_courses_queryset`; org-wide mode calls `unpaid_course_summary_rows` + category grouping.

**Tech Stack:** Django, django-tenant-schemas, `app_finance/unpaid_helpers`, `app_finance/payment_scoping`, existing AI tool registry.

**Spec:** `docs/superpowers/specs/2026-07-06-ai-unpaid-students-tool-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_ai/tools/unpaid_rbac.py` | `require_unpaid_read`, `require_unpaid_course_access` → structured errors |
| `app_ai/tools/get_unpaid_students.py` | Tool handler, month param builder, org summary grouping |
| `app_ai/tools/registry.py` | Register `GET_UNPAID_STUDENTS_TOOL` |
| `app_ai/prompts.py` | Unpaid tool guidance in `PLATFORM_BASE_TEMPLATE` |
| `app_ai/tests/test_get_unpaid_students.py` | Integration tests |
| `app_ai/tests/test_tool_registry.py` | Add `get_unpaid_students` to read-tool metadata list |

---

## Conventions

- **Tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="log_only")`
- **Schema:** `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData`
- **Run tests:** `./scripts/run_backend_tests.sh app_ai.tests.test_get_unpaid_students -v 2`
- **Commits:** Do not commit unless the user asks (repo rule)
- **Patch org context in tests:** `@patch("app_ai.tools.get_unpaid_students.get_current_org", return_value=org)` where needed for links

---

## Task 1: RBAC wrapper

**Files:**
- Create: `app_ai/tools/unpaid_rbac.py`
- Test: `app_ai/tests/test_get_unpaid_students.py` (start file)

- [ ] **Step 1: Write failing permission test**

Create `app_ai/tests/test_get_unpaid_students.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_ai.tools.get_unpaid_students import run_get_unpaid_students
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
class GetUnpaidStudentsRbacTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_student_without_unpaid_permission_denied(self):
        with schema_context(self.schema_name):
            seed_rbac()
            student = User.objects.create_user(
                email=f"stu-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            result = run_get_unpaid_students({}, student)
        self.assertEqual(result["error"], "permission_denied")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_get_unpaid_students.GetUnpaidStudentsRbacTests.test_student_without_unpaid_permission_denied -v 2`

Expected: FAIL — `ModuleNotFoundError` or import error for `get_unpaid_students`

- [ ] **Step 3: Add RBAC wrapper and stub handler**

Create `app_ai/tools/unpaid_rbac.py`:

```python
"""RBAC guards for AI unpaid-student tools."""
from __future__ import annotations

from typing import Any

from rest_framework.exceptions import PermissionDenied

from app_finance.payment_scoping import check_unpaid_course_access, check_unpaid_read


def _denied(message: str) -> dict[str, Any]:
    return {"error": "permission_denied", "message": message}


def require_unpaid_read(user) -> dict[str, Any] | None:
    try:
        check_unpaid_read(user)
    except PermissionDenied as exc:
        return _denied(str(exc))
    return None


def require_unpaid_course_access(user, course_id: int) -> dict[str, Any] | None:
    try:
        check_unpaid_course_access(user, course_id)
    except PermissionDenied as exc:
        return _denied(str(exc))
    return None
```

Create stub `app_ai/tools/get_unpaid_students.py`:

```python
from __future__ import annotations

from typing import Any

from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.unpaid_rbac import require_unpaid_read
from app_auth.models import User

GET_UNPAID_STUDENTS_SCHEMA = strict_object_schema(properties={}, required=[])


def run_get_unpaid_students(args: dict[str, Any], user: User) -> dict[str, Any]:
    denied = require_unpaid_read(user)
    if denied:
        return denied
    return {"error": "validation_error", "message": "Not implemented."}


GET_UNPAID_STUDENTS_TOOL = Tool(
    name="get_unpaid_students",
    description="Stub",
    parameters=GET_UNPAID_STUDENTS_SCHEMA,
    run=run_get_unpaid_students,
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_get_unpaid_students.GetUnpaidStudentsRbacTests.test_student_without_unpaid_permission_denied -v 2`

Expected: PASS

---

## Task 2: Month params + course-scoped count

**Files:**
- Modify: `app_ai/tools/get_unpaid_students.py`
- Test: `app_ai/tests/test_get_unpaid_students.py`

- [ ] **Step 1: Write failing course count test**

Add to `test_get_unpaid_students.py`:

```python
from datetime import datetime, timedelta
from unittest.mock import patch

from app_course.models import Category, Course, Program, UserCourse
from app_finance.models import UserPayment
from django.utils import timezone


class GetUnpaidStudentsCourseCountTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.today = timezone.localdate()
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"admin-{suffix}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"tchr-{suffix}@e.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student_unpaid = User.objects.create_user(
                email=f"unpaid-{suffix}@e.com",
                password="x",
                name="Unpaid Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.student_paid = User.objects.create_user(
                email=f"paid-{suffix}@e.com",
                password="x",
                name="Paid Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"CAE 35 WD {suffix}",
                code=f"CAE35-{suffix}",
                category=cat,
                program=prog,
                start_date=self.today.replace(day=1),
                end_date=self.today + timedelta(days=60),
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student_unpaid,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.student_paid,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserPayment.objects.create(
                user=self.student_paid,
                course=self.course,
                status=UserPayment.Status.PENDING_PAYMENT,
                issued_at=timezone.make_aware(
                    datetime(self.today.year, self.today.month, 1)
                ),
            )

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_teacher_sees_unpaid_count_for_connected_course(self, mock_org):
        from app_organization.models import Organization

        mock_org.return_value = Organization(timezone="UTC")
        with schema_context(self.schema_name):
            result = run_get_unpaid_students(
                {"course_id": self.course.id},
                self.teacher,
            )
        self.assertEqual(result["mode"], "course")
        self.assertEqual(result["unpaid_count"], 1)

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_teacher_denied_for_unconnected_course(self, mock_org):
        from app_organization.models import Organization

        mock_org.return_value = Organization(timezone="UTC")
        outsider = User.objects.create_user(
            email=f"out-{uuid4().hex[:4]}@e.com",
            password="x",
            name="Outsider",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[User.UserRole.TEACHER],
        )
        with schema_context(self.schema_name):
            result = run_get_unpaid_students(
                {"course_id": self.course.id},
                outsider,
            )
        self.assertEqual(result["error"], "permission_denied")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_get_unpaid_students.GetUnpaidStudentsCourseCountTests -v 2`

Expected: FAIL — `Not implemented` or missing keys

- [ ] **Step 3: Implement month builder + course-scoped count**

Replace `get_unpaid_students.py` handler (keep schema stub for now):

```python
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any

from django.utils import timezone

from app_ai.links import get_current_org, with_course_link
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.query_courses import org_today
from app_ai.tools.resolve import resolve_accessible_course
from app_ai.tools.unpaid_rbac import require_unpaid_course_access, require_unpaid_read
from app_auth.models import User
from app_finance.unpaid_helpers import unpaid_student_user_courses_queryset
from app_utility_notifications.tenant_time import get_tenant_day_boundaries


def _payment_params_for_calendar_month(
    *, tenant_tz: str, year: int, month: int
) -> dict[str, str]:
    now = timezone.now()
    last_day = monthrange(year, month)[1]
    month_start_ymd = f"{year:04d}-{month:02d}-01"
    month_end_ymd = f"{year:04d}-{month:02d}-{last_day:02d}"
    start_dt, _ = get_tenant_day_boundaries(now, tenant_tz, month_start_ymd)
    _, end_dt = get_tenant_day_boundaries(now, tenant_tz, month_end_ymd)
    return {
        "issued_at__gte": start_dt.isoformat(),
        "issued_at__lte": end_dt.isoformat(),
    }


def _month_meta(*, year: int, month: int) -> dict[str, Any]:
    label = date(year, month, 1).strftime("%B %Y")
    return {"year": year, "month": month, "label": label}


def run_get_unpaid_students(args: dict[str, Any], user: User) -> dict[str, Any]:
    denied = require_unpaid_read(user)
    if denied:
        return denied

    org = get_current_org()
    if org is None:
        return {"error": "validation_error", "message": "Organization context required."}

    today = org_today(org)
    year = int(args.get("year") or today.year)
    month = int(args.get("month") or today.month)
    if month < 1 or month > 12:
        return {"error": "validation_error", "message": "month must be 1-12."}

    tenant_tz = getattr(org, "timezone", None) or "UTC"
    payment_params = _payment_params_for_calendar_month(
        tenant_tz=tenant_tz, year=year, month=month
    )
    month_block = _month_meta(year=year, month=month)

    course_id = args.get("course_id")
    query = args.get("query")
    has_id = course_id is not None
    has_query = bool((query or "").strip())
    if has_id and has_query:
        return {
            "error": "validation_error",
            "message": "Provide at most one of course_id or query.",
        }

    if not has_id and not has_query:
        return {"error": "validation_error", "message": "Org summary not implemented yet."}

    resolved = resolve_accessible_course(
        user=user, course_id=course_id, query=query
    )
    if resolved["status"] != "ok":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    course = resolved["course"]
    denied_course = require_unpaid_course_access(user, course.id)
    if denied_course:
        return denied_course

    user_courses_qs = unpaid_student_user_courses_queryset(
        course.id,
        payment_params,
        sorts=["user__name"],
    )
    unpaid_count = user_courses_qs.count()
    course_row = with_course_link(
        {"id": course.id, "title": course.title, "code": course.code},
        org=org,
    )
    return {
        "mode": "course",
        "month": month_block,
        "course": course_row,
        "unpaid_count": unpaid_count,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_get_unpaid_students.GetUnpaidStudentsCourseCountTests -v 2`

Expected: PASS

---

## Task 3: Include names (course-scoped)

**Files:**
- Modify: `app_ai/tools/get_unpaid_students.py`
- Test: `app_ai/tests/test_get_unpaid_students.py`

- [ ] **Step 1: Write failing include_names test**

```python
from app_finance.unpaid_helpers import paid_until_by_user_for_course


@patch("app_ai.tools.get_unpaid_students.get_current_org")
def test_include_names_returns_student_rows(self, mock_org):
    from app_organization.models import Organization

    mock_org.return_value = Organization(timezone="UTC")
    with schema_context(self.schema_name):
        result = run_get_unpaid_students(
            {"course_id": self.course.id, "include_names": True},
            self.admin,
        )
    self.assertEqual(result["unpaid_count"], 1)
    self.assertEqual(len(result["students"]), 1)
    self.assertEqual(result["students"][0]["name"], "Unpaid Student")
    self.assertEqual(result["students"][0]["payment_status"], "never_paid")
```

Add `@override_settings(RBAC_ENFORCE="log_only")` on the test class if not inherited.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — no `students` key

- [ ] **Step 3: Implement student list building**

Add imports:

```python
from app_ai.links import compact_user_for_ai
from app_finance.unpaid_helpers import (
    paid_until_by_user_for_course,
    sort_unpaid_user_courses_by_paid_until,
)
```

In course branch after queryset:

```python
include_names = bool(args.get("include_names"))
result: dict[str, Any] = {
    "mode": "course",
    "month": month_block,
    "course": course_row,
    "unpaid_count": unpaid_count,
}
if include_names:
    user_courses_list = list(user_courses_qs)
    paid_until_map = paid_until_by_user_for_course(
        course.id,
        [uc.user_id for uc in user_courses_list],
    )
    user_courses_list = sort_unpaid_user_courses_by_paid_until(
        user_courses_list, paid_until_map
    )
    students = []
    for uc in user_courses_list:
        row = compact_user_for_ai(uc.user, org=org)
        paid_until = paid_until_map.get(uc.user_id)
        row["paid_until"] = (
            {"year": paid_until[0], "month_index": paid_until[1]}
            if paid_until is not None
            else None
        )
        row["payment_status"] = (
            "never_paid" if paid_until is None else "behind"
        )
        students.append(row)
    result["students"] = students
return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_get_unpaid_students.GetUnpaidStudentsCourseCountTests.test_include_names_returns_student_rows -v 2`

Expected: PASS

---

## Task 4: Org-wide summary

**Files:**
- Modify: `app_ai/tools/get_unpaid_students.py`
- Test: `app_ai/tests/test_get_unpaid_students.py`

- [ ] **Step 1: Write failing org summary tests**

```python
from app_course.course_month_type import MONTH_TYPE_FM


class GetUnpaidStudentsOrgSummaryTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        # Reuse course fixture pattern from Task 2; create two courses with unpaid students
        ...

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_admin_org_summary_includes_courses_with_unpaid(self, mock_org):
        mock_org.return_value = Organization(timezone="UTC")
        with schema_context(self.schema_name):
            result = run_get_unpaid_students({}, self.admin)
        self.assertEqual(result["mode"], "org_summary")
        self.assertGreater(result["courses_with_unpaid"], 0)
        self.assertGreater(result["total_unpaid_students"], 0)

    @patch("app_ai.tools.get_unpaid_students.get_current_org")
    def test_org_summary_include_names_sets_omitted_reason(self, mock_org):
        mock_org.return_value = Organization(timezone="UTC")
        with schema_context(self.schema_name):
            result = run_get_unpaid_students({"include_names": True}, self.admin)
        self.assertEqual(result["names_omitted_reason"], "org_wide_summary")
        self.assertNotIn("students", result)
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — `Org summary not implemented yet`

- [ ] **Step 3: Implement org-wide branch**

Add imports:

```python
from app_course.course_month_type import MONTH_TYPE_FM, MONTH_TYPE_HM
from app_finance.payment_scoping import filter_course_ids_for_unpaid
from app_finance.unpaid_helpers import unpaid_course_summary_rows
```

Replace org stub with:

```python
month_type = args.get("month_type")
if month_type not in (None, "", MONTH_TYPE_FM, MONTH_TYPE_HM):
    return {
        "error": "validation_error",
        "message": "month_type must be FM, HM, or omitted.",
    }
include_names = bool(args.get("include_names"))

if not has_id and not has_query:
    try:
        rows = unpaid_course_summary_rows(
            payment_params,
            course_month_type=month_type or None,
        )
    except ValueError as exc:
        return {"error": "validation_error", "message": str(exc)}

    allowed_ids = set(
        filter_course_ids_for_unpaid(user, [row["course_id"] for row in rows])
    )
    rows = [
        row for row in rows
        if row["course_id"] in allowed_ids and row["unpaid_count"] > 0
    ]

    buckets: dict[int | None, dict[str, Any]] = {}
    total_unpaid = 0
    for row in rows:
        total_unpaid += row["unpaid_count"]
        cat_id = row.get("category_id")
        if cat_id not in buckets:
            buckets[cat_id] = {
                "category": {
                    "id": cat_id,
                    "name": row.get("category_name") or "Uncategorized",
                    "sort_order": row.get("category_sort_order") or 0,
                },
                "courses": [],
            }
        course_entry = with_course_link(
            {
                "course_id": row["course_id"],
                "title": row["title"],
                "unpaid_count": row["unpaid_count"],
            },
            org=org,
        )
        buckets[cat_id]["courses"].append(course_entry)

    groups = sorted(
        buckets.values(),
        key=lambda g: (g["category"]["sort_order"], g["category"]["name"].lower()),
    )
    for group in groups:
        group["courses"].sort(key=lambda c: (c.get("title") or "").lower())

    result = {
        "mode": "org_summary",
        "month": month_block,
        "month_type": month_type or None,
        "total_unpaid_students": total_unpaid,
        "courses_with_unpaid": len(rows),
        "groups": groups,
    }
    if include_names:
        result["names_omitted_reason"] = "org_wide_summary"
    return result
```

- [ ] **Step 4: Run org summary tests**

Expected: PASS

---

## Task 5: Tool schema, registry, prompts

**Files:**
- Modify: `app_ai/tools/get_unpaid_students.py`
- Modify: `app_ai/tools/registry.py`
- Modify: `app_ai/prompts.py`
- Modify: `app_ai/tests/test_tool_registry.py`

- [ ] **Step 1: Add full JSON schema and tool description**

Replace schema stub with:

```python
GET_UNPAID_STUDENTS_SCHEMA = strict_object_schema(
    properties={
        "course_id": {
            "type": "integer",
            "description": "Course id from search_courses.",
        },
        "query": {
            "type": "string",
            "minLength": 1,
            "description": "Course title or code (e.g. 'CAE 35 WD').",
        },
        "include_names": {
            "type": "boolean",
            "description": "Include unpaid student names (course-scoped only). Default false.",
        },
        "year": {
            "type": "integer",
            "description": "Calendar year. Default: current in org timezone.",
        },
        "month": {
            "type": "integer",
            "minimum": 1,
            "maximum": 12,
            "description": "Calendar month 1-12. Default: current.",
        },
        "month_type": {
            "type": "string",
            "enum": [MONTH_TYPE_FM, MONTH_TYPE_HM],
            "description": "Org-wide only: FM or HM course filter.",
        },
    },
    required=[],
)
```

Update `GET_UNPAID_STUDENTS_TOOL.description` per spec §8 (unpaid counts, include_names, org-wide summary, RBAC note).

- [ ] **Step 2: Register in registry**

In `app_ai/tools/registry.py`:

```python
from app_ai.tools.get_unpaid_students import GET_UNPAID_STUDENTS_TOOL
# ...
GET_UNPAID_STUDENTS_TOOL.name: GET_UNPAID_STUDENTS_TOOL,
```

- [ ] **Step 3: Update prompts**

Append to `PLATFORM_BASE_TEMPLATE` in `app_ai/prompts.py` (after Points block):

```
Unpaid students (requires payment.view_unpaid):
- Use get_unpaid_students for how many students owe payment for a course or which
  courses have unpaid students this month.
- Default month is the current calendar month in the school's timezone. Pass year/month
  only when the user specifies a different month.
- Use include_names=true when the user asks who is unpaid or wants a list of names.
  Org-wide queries return course summaries only — for names, resolve a specific course first.
- Pass query for course codes like "CAE 35 WD". On ambiguous, present A/B/C options.
- When unpaid_count is 0, say all enrolled students have payment on file for that month.
- Do not claim unpaid counts without calling get_unpaid_students.
```

- [ ] **Step 4: Add registry metadata test**

In `app_ai/tests/test_tool_registry.py`, add `"get_unpaid_students"` to `test_core_tools_are_read_exposure` tuple.

- [ ] **Step 5: Run full test suite for this feature**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_get_unpaid_students app_ai.tests.test_tool_registry -v 2`

Expected: all PASS

---

## Task 6: Validation edge cases

**Files:**
- Test: `app_ai/tests/test_get_unpaid_students.py`

- [ ] **Step 1: Add validation tests**

```python
def test_both_course_id_and_query_validation_error(self):
    ...

def test_invalid_month_type_validation_error(self):
    result = run_get_unpaid_students({"month_type": "XX"}, self.admin)
    self.assertEqual(result["error"], "validation_error")

def test_paid_student_not_in_unpaid_count(self):
    # already covered in Task 2; assert unpaid_count == 0 when all paid
    ...
```

- [ ] **Step 2: Run full unpaid test module**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_get_unpaid_students -v 2`

Expected: PASS

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `get_unpaid_students` tool | Tasks 2–5 |
| RBAC `payment.view_unpaid` / `_all` | Task 1, 2 |
| Course-scoped count | Task 2 |
| `include_names` course list | Task 3 |
| Org-wide summary + FM/HM | Task 4 |
| `names_omitted_reason` org-wide | Task 4 |
| Calendar month default | Task 2 `_payment_params_for_calendar_month` |
| Prompt guidance | Task 5 |
| Registry read exposure | Task 5 |
| Integration tests | Tasks 1–6 |
