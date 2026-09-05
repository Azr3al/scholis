# AI Query Courses — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-only `query_courses` AI tool with month/category/WE/WD/FM/HM filters, a category fuzzy search service, and a canonical FM/HM helper (day `> 13` = HM).

**Architecture:** Three layers built in order: (1) shared `course_month_type` module with call-site fixes, (2) `category_search` + `resolve_category`, (3) `query_courses` tool registered in `TOOL_REGISTRY`. Month overlap and FM/HM reuse shared helpers; student counts come from denormalized `Course.student_count`.

**Tech Stack:** Django, Postgres FTS/trigram (`utilitas.search`), tenant schemas, existing AI tool registry (`app_ai.tools`).

**Spec:** `docs/superpowers/specs/2026-06-27-ai-query-courses-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_course/course_month_type.py` | Canonical FM/HM constants + queryset filter |
| `app_course/category_search.py` | FTS + trigram category search |
| `app_course/models.py` | Category `search_text`, `search_vector` |
| `app_course/migrations/0100_category_search.py` | Migration for category search columns |
| `app_course/views.py` | `CategorySearchView.augment_search_queryset` |
| `app_finance/unpaid_helpers.py` | Use shared month-type filter |
| `app_microsoft/announcement_helpers.py` | Use shared month-type filter |
| `app_microsoft/payment_assignment_helpers.py` | Delegate `is_hm_course` |
| `app_reports/analytics_services.py` | Delegate `is_hm_course_start_day` |
| `app_ai/tenant_context.py` | `get_current_org()` helper |
| `app_ai/tools/resolve.py` | `resolve_category` |
| `app_ai/tools/query_courses.py` | New AI tool |
| `app_ai/tools/registry.py` | Register `query_courses` |
| `app_ai/prompts.py` | Prompt guidance |
| `schedjuice_backend/settings.py` | Category search threshold settings |
| `app_course/tests/test_course_month_type.py` | FM/HM boundary tests |
| `app_course/tests/test_category_search.py` | Category search tests |
| `app_ai/tests/test_query_courses.py` | Tool integration tests |
| `app_ai/tests/test_tools_and_pricing.py` | Tool count `9` → `10` |
| `app_ai/tests/test_tool_registry.py` | Add `query_courses` to read tools list |

---

## Conventions

- **Tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="log_only")`
- **Schema:** `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData`
- **Run all new tests:** `python manage.py test app_course.tests.test_course_month_type app_course.tests.test_category_search app_ai.tests.test_query_courses -v 2`
- **Commits:** Do not commit unless the user asks (repo rule)
- **Branch:** Work on current branch (`dev`); no feature branches

---

## Task 1: Canonical FM/HM helper

**Files:**
- Create: `app_course/course_month_type.py`
- Create: `app_course/tests/test_course_month_type.py`

- [ ] **Step 1: Write failing tests**

Create `app_course/tests/test_course_month_type.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_course.course_month_type import (
    MONTH_TYPE_FM,
    MONTH_TYPE_HM,
    filter_queryset_by_month_type,
    is_hm_course,
    is_hm_start_day,
    month_type_for_course,
)
from app_course.models import Category, Course, Program


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseMonthTypeTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _course_with_start_day(self, day: int) -> Course:
        with schema_context(self.schema_name):
            suffix = uuid4().hex[:6]
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            return Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, day),
                end_date=date(2026, 12, 31),
            )

    def test_day_10_is_fm(self):
        self.assertFalse(is_hm_start_day(10))
        self.assertEqual(month_type_for_course(self._course_with_start_day(10)), MONTH_TYPE_FM)

    def test_day_13_is_fm(self):
        self.assertFalse(is_hm_start_day(13))
        self.assertFalse(is_hm_course(self._course_with_start_day(13)))

    def test_day_14_is_hm(self):
        self.assertTrue(is_hm_start_day(14))
        self.assertTrue(is_hm_course(self._course_with_start_day(14)))

    def test_filter_fm_excludes_hm(self):
        with schema_context(self.schema_name):
            fm = self._course_with_start_day(5)
            hm = self._course_with_start_day(20)
            qs = filter_queryset_by_month_type(Course.objects.all(), MONTH_TYPE_FM)
            ids = set(qs.values_list("id", flat=True))
        self.assertIn(fm.id, ids)
        self.assertNotIn(hm.id, ids)

    def test_filter_hm_excludes_fm(self):
        with schema_context(self.schema_name):
            fm = self._course_with_start_day(5)
            hm = self._course_with_start_day(20)
            qs = filter_queryset_by_month_type(Course.objects.all(), MONTH_TYPE_HM)
            ids = set(qs.values_list("id", flat=True))
        self.assertNotIn(fm.id, ids)
        self.assertIn(hm.id, ids)
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_course_month_type -v 2
```

Expected: `ModuleNotFoundError: No module named 'app_course.course_month_type'`

- [ ] **Step 3: Implement `app_course/course_month_type.py`**

```python
"""Canonical FM/HM classification from course start_date.day."""
from __future__ import annotations

from django.db.models import QuerySet

from app_course.models import Course

MONTH_TYPE_FM = "FM"
MONTH_TYPE_HM = "HM"
_VALID_MONTH_TYPES = frozenset({MONTH_TYPE_FM, MONTH_TYPE_HM})

HM_START_DAY_THRESHOLD = 13


def is_hm_start_day(day: int) -> bool:
    return day > HM_START_DAY_THRESHOLD


def is_hm_course(course: Course) -> bool:
    return is_hm_start_day(course.start_date.day)


def month_type_for_course(course: Course) -> str:
    return MONTH_TYPE_HM if is_hm_course(course) else MONTH_TYPE_FM


def filter_queryset_by_month_type(qs: QuerySet, month_type: str) -> QuerySet:
    if month_type not in _VALID_MONTH_TYPES:
        raise ValueError(f"month_type must be one of {_VALID_MONTH_TYPES}")
    if month_type == MONTH_TYPE_FM:
        return qs.filter(start_date__day__lte=HM_START_DAY_THRESHOLD)
    return qs.filter(start_date__day__gt=HM_START_DAY_THRESHOLD)
```

- [ ] **Step 4: Run test — expect PASS**

```bash
python manage.py test app_course.tests.test_course_month_type -v 2
```

---

## Task 2: Update FM/HM call sites

**Files:**
- Modify: `app_microsoft/payment_assignment_helpers.py`
- Modify: `app_finance/unpaid_helpers.py`
- Modify: `app_microsoft/announcement_helpers.py`
- Modify: `app_reports/analytics_services.py`

- [ ] **Step 1: Delegate `is_hm_course` in payment helpers**

In `app_microsoft/payment_assignment_helpers.py`, replace the local `is_hm_course` body:

```python
from app_course.course_month_type import is_hm_course as _is_hm_course

def is_hm_course(course: Course) -> bool:
    return _is_hm_course(course)
```

Remove the old docstring threshold (`day > 13` stays documented in `course_month_type`).

- [ ] **Step 2: Update `unpaid_helpers.py`**

Replace local constants and inline day filters:

```python
from app_course.course_month_type import (
    MONTH_TYPE_FM,
    MONTH_TYPE_HM,
    filter_queryset_by_month_type,
)

_VALID_MONTH_TYPES = frozenset({MONTH_TYPE_FM, MONTH_TYPE_HM})
```

In `course_ids_overlapping_range`, replace the `if course_month_type == MONTH_TYPE_FM:` block with:

```python
    if course_month_type in _VALID_MONTH_TYPES:
        qs = filter_queryset_by_month_type(qs, course_month_type)
```

Remove the comment about frontend `day < 10`.

- [ ] **Step 3: Update `announcement_helpers.py`**

Replace `get_course_month_type` and filter block:

```python
from app_course.course_month_type import (
    MONTH_TYPE_FM,
    MONTH_TYPE_HM,
    filter_queryset_by_month_type,
    month_type_for_course,
)

MONTH_TYPE_ALL = "ALL"

def get_course_month_type(course: Course) -> str:
    return month_type_for_course(course)
```

In `filter_courses_by_course_filters`, replace the day `< 10` branch with:

```python
    if month_type != MONTH_TYPE_ALL and month_type in (MONTH_TYPE_FM, MONTH_TYPE_HM):
        queryset = filter_queryset_by_month_type(queryset, month_type)
```

- [ ] **Step 4: Update `analytics_services.py`**

```python
from app_course.course_month_type import is_hm_start_day as _is_hm_start_day

def is_hm_course_start_day(day: int) -> bool:
    return _is_hm_start_day(day)
```

- [ ] **Step 5: Run related tests**

```bash
python manage.py test app_course.tests.test_course_month_type app_reports.tests -v 2 -k hm
```

Fix any tests that assumed day-10 boundary.

---

## Task 3: Category search model + migration

**Files:**
- Modify: `app_course/models.py`
- Create: `app_course/migrations/0100_category_search_text_and_vector.py`

- [ ] **Step 1: Add fields to `Category` model**

In `app_course/models.py`, on `Category`:

```python
from django.contrib.postgres.search import SearchVectorField

class Category(BaseModel):
    # ... existing fields ...
    search_text = models.TextField(blank=True, default="")
    search_vector = SearchVectorField(editable=False, null=True)
```

Add `postgres_generated_column_attnames = ("search_vector",)` if using `PostgresGeneratedColumnMixin` on Category — **Category does not use that mixin today**, so only add the two fields; migration handles generated SQL.

- [ ] **Step 2: Create migration**

Run:

```bash
python manage.py makemigrations app_course --name category_search_text_and_vector
```

Then edit the generated migration to use the same pattern as `0086_course_search_text_and_vector.py`:

- Reuse existing `immutable_unaccent` function (already in DB from course migration)
- Generated column SQL:

```sql
ALTER TABLE app_course_category
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(name), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(description), '')), 'B')
  ) STORED;
```

- Separate migration operation for GIN index (non-atomic):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS category_search_vector_gin
  ON app_course_category USING gin (search_vector);
```

- [ ] **Step 3: Apply migration**

```bash
python manage.py migrate_schemas --shared
python manage.py migrate_schemas
```

---

## Task 4: Category search module

**Files:**
- Create: `app_course/category_search.py`
- Modify: `schedjuice_backend/settings.py`
- Create: `app_course/tests/test_category_search.py`

- [ ] **Step 1: Add settings**

In `schedjuice_backend/settings.py` near user/course search settings:

```python
CATEGORY_SEARCH_TRIGRAM_THRESHOLD = config(
    "CATEGORY_SEARCH_TRIGRAM_THRESHOLD", default=0.25, cast=float
)
CATEGORY_SEARCH_FALLBACK_MIN_RESULTS = config(
    "CATEGORY_SEARCH_FALLBACK_MIN_RESULTS", default=1, cast=int
)
```

- [ ] **Step 2: Write failing category search test**

Create `app_course/tests/test_category_search.py`:

```python
import unittest
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_course.category_search import apply_category_search_q
from app_course.models import Category


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CategorySearchTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_fuzzy_matches_partial_name(self):
        suffix = uuid4().hex[:4]
        with schema_context(self.schema_name):
            Category.objects.create(name=f"KET Prep {suffix}")
            qs = apply_category_search_q(Category.objects.all(), "KET")
            names = list(qs.values_list("name", flat=True))
        self.assertTrue(any("KET" in n for n in names))

    def test_no_match_returns_empty(self):
        with schema_context(self.schema_name):
            qs = apply_category_search_q(Category.objects.all(), "ZZZNOHIT999")
        self.assertEqual(qs.count(), 0)
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
python manage.py test app_course.tests.test_category_search -v 2
```

- [ ] **Step 4: Implement `app_course/category_search.py`**

```python
"""Fuzzy and full-text category search helpers."""
from __future__ import annotations

import logging

from django.db.models import QuerySet

from utilitas.search import (
    EntitySearchConfig,
    FullTextSearchService,
    apply_entity_search,
    get_search_q,
    register_search,
)

logger = logging.getLogger(__name__)

CATEGORY_SEARCH_KEY = "category"

_CATEGORY_FTS_CONFIG = EntitySearchConfig(
    vector_field="search_vector",
    trigram_fields=("name",),
    substring_field="name",
    default_fallback_threshold_setting="CATEGORY_SEARCH_TRIGRAM_THRESHOLD",
    default_fallback_min_results_setting="CATEGORY_SEARCH_FALLBACK_MIN_RESULTS",
)

register_search(CATEGORY_SEARCH_KEY, _CATEGORY_FTS_CONFIG)


def apply_category_search_q_with_meta(
    queryset: QuerySet, q: str
) -> tuple[QuerySet, bool]:
    q = (q or "").strip()
    if not q:
        return queryset, False
    qs, meta = apply_entity_search(CATEGORY_SEARCH_KEY, queryset, q)
    if meta.used_fallback:
        logger.info(
            "category_search_fts_fallback q=%r fts_count=%s",
            q,
            meta.fts_count,
        )
    return qs, meta.used_fallback


def apply_category_search_q(queryset: QuerySet, q: str) -> QuerySet:
    qs, _ = apply_category_search_q_with_meta(queryset, q)
    return qs


def category_suggest_queryset(base_qs: QuerySet, q: str, limit: int = 8) -> QuerySet:
    q = (q or "").strip()
    if len(q) < 2:
        return base_qs.none()
    return FullTextSearchService(
        base_qs,
        vector_field="search_vector",
        trigram_fields=("name",),
        substring_field="name",
    ).suggest(q, limit=limit)


__all__ = [
    "CATEGORY_SEARCH_KEY",
    "apply_category_search_q",
    "apply_category_search_q_with_meta",
    "category_suggest_queryset",
    "get_search_q",
]
```

- [ ] **Step 5: Run test — expect PASS**

```bash
python manage.py test app_course.tests.test_category_search -v 2
```

---

## Task 5: Wire CategorySearchView

**Files:**
- Modify: `app_course/views.py`

- [ ] **Step 1: Override `augment_search_queryset` on `CategorySearchView`**

After the `CategorySearchView` class definition (~line 129), add:

```python
class CategorySearchView(RBACSearchView):
    name = "Category search view"
    model = models.Category
    serializer = serializers.CategorySerializer
    required_permissions = {"POST": "category.manage"}

    def augment_search_queryset(self, queryset, expand, is_csv):
        from app_course.category_search import apply_category_search_q_with_meta, get_search_q

        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        q = get_search_q(self.request)
        if q:
            queryset, self._search_used_fallback = apply_category_search_q_with_meta(
                queryset, q
            )
        else:
            self._search_used_fallback = False
        return queryset.order_by("sort_order", "name")
```

- [ ] **Step 2: Smoke test (optional manual)**

POST to `/api/v1/categories/search` with `{"q": "KET"}` — not required for CI if unit tests pass.

---

## Task 6: `resolve_category`

**Files:**
- Modify: `app_ai/tools/resolve.py`
- Modify: `app_ai/tests/test_count_tools.py` (add resolve tests)

- [ ] **Step 1: Write failing resolve test**

Add to `app_ai/tests/test_count_tools.py`:

```python
from app_ai.tools.resolve import resolve_category
from app_course.models import Category


class AIToolResolveCategoryTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        with schema_context(self.schema_name):
            suffix = uuid4().hex[:4]
            self.ket = Category.objects.create(name=f"KET {suffix}")

    def test_resolve_by_id(self):
        with schema_context(self.schema_name):
            out = resolve_category(category_id=self.ket.id, query=None)
        self.assertEqual(out["status"], "ok")
        self.assertEqual(out["category"].id, self.ket.id)

    def test_resolve_by_query_single_match(self):
        with schema_context(self.schema_name):
            out = resolve_category(category_id=None, query="KET")
        self.assertEqual(out["status"], "ok")

    def test_resolve_not_found(self):
        with schema_context(self.schema_name):
            out = resolve_category(category_id=None, query="ZZZNOHIT999")
        self.assertEqual(out["status"], "not_found")
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
python manage.py test app_ai.tests.test_count_tools.AIToolResolveCategoryTests -v 2
```

- [ ] **Step 3: Implement `resolve_category` in `resolve.py`**

```python
from app_course.category_search import apply_category_search_q_with_meta
from app_course.models import Category


def resolve_category(
    *,
    category_id: int | None = None,
    query: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    if category_id is not None:
        category = Category.objects.filter(id=category_id).first()
        if category is None:
            return {"status": "not_found", "message": "Category not found."}
        return {"status": "ok", "category": category}

    q = (query or "").strip()
    if not q:
        return {"status": "not_found", "message": "Query is empty."}

    qs, _ = apply_category_search_q_with_meta(Category.objects.all(), q)
    matches = list(qs[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": f"No category match for {q!r}."}
    if len(matches) > 1:
        return _ambiguous_payload(
            message=f"Multiple categories match {q!r}.",
            query=q,
            candidates=[{"id": c.id, "name": c.name} for c in matches[:limit]],
        )
    return {"status": "ok", "category": matches[0]}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
python manage.py test app_ai.tests.test_count_tools.AIToolResolveCategoryTests -v 2
```

---

## Task 7: `get_current_org` helper

**Files:**
- Modify: `app_ai/tenant_context.py`

- [ ] **Step 1: Add helper**

```python
from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context


def get_current_org() -> Organization | None:
    schema = getattr(connection, "schema_name", None) or ""
    if not schema or schema == get_public_schema_name():
        return None
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema).first()
```

- [ ] **Step 2: Extend `build_system_context`**

After the school context block:

```python
    fm_hm = (
        "enabled"
        if getattr(org, "is_fm_hm_course_display_enabled", False)
        else "disabled"
    )
    return (
        f"{build_platform_base_prompt(org)}\n\n"
        f"School context:\n{school}\n\n"
        f"FM/HM course filters: {fm_hm}\n\n"
        f"Instructions:\n{instructions}"
    )
```

---

## Task 8: `query_courses` tool

**Files:**
- Create: `app_ai/tools/query_courses.py`
- Create: `app_ai/tests/test_query_courses.py`

- [ ] **Step 1: Write failing integration tests**

Create `app_ai/tests/test_query_courses.py` with a base class mirroring `test_count_tools.py` patterns. Key tests:

```python
from datetime import date
from unittest.mock import patch

from app_ai.tools.query_courses import run_query_courses
from app_course.models import Category, Course, Program, UserCourse


class QueryCoursesTests(_CountToolsTestBase):
    def setUp(self):
        self._create_admin_and_teacher()
        self.today = date(2026, 6, 15)
        with schema_context(self.schema_name):
            seed_rbac()
            suffix = uuid4().hex[:4]
            self.ket_cat = Category.objects.create(name=f"KET {suffix}")
            self.pet_cat = Category.objects.create(name=f"PET {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.ket1 = Course.objects.create(
                title=f"KET 1 {suffix}",
                category=self.ket_cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                status=Course.CourseStatus.ACTIVE,
                course_type=Course.CourseType.WD,
                student_count=30,
            )
            # ... ket2, pet1, out-of-month course with end_date in May ...

    @patch("app_ai.tools.query_courses._org_today")
    def test_filters_by_category_and_month(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(self.schema_name):
            out = run_query_courses(
                {"category_query": "KET", "month": 6, "year": 2026},
                self.admin,
            )
        self.assertNotIn("error", out)
        self.assertEqual(out["count"], 2)
        titles = [c["title"] for g in out["groups"] for c in g["courses"]]
        self.assertTrue(any("KET 1" in t for t in titles))

    def test_teacher_denied(self):
        with schema_context(self.schema_name):
            out = run_query_courses({}, self.teacher)
        self.assertEqual(out["error"], "permission_denied")

    @patch("app_ai.tools.query_courses._org_today")
    def test_fm_filter_when_enabled(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_fm_hm_course_display_enabled = True
            org.save(update_fields=["is_fm_hm_course_display_enabled"])
        # create FM course (day 5) and HM course (day 20) ...
        with schema_context(self.schema_name):
            out = run_query_courses(
                {"month_type": "FM", "month": 6, "year": 2026},
                self.admin,
            )
        # assert only FM course ids present

    @patch("app_ai.tools.query_courses._org_today")
    def test_fm_filter_feature_disabled(self, mock_today):
        mock_today.return_value = self.today
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_fm_hm_course_display_enabled = False
            org.save(update_fields=["is_fm_hm_course_display_enabled"])
        with schema_context(self.schema_name):
            out = run_query_courses({"month_type": "FM"}, self.admin)
        self.assertEqual(out["error"], "feature_disabled")
```

Fill in FM/HM course fixtures in setUp per test needs.

- [ ] **Step 2: Run test — expect FAIL**

```bash
python manage.py test app_ai.tests.test_query_courses -v 2
```

- [ ] **Step 3: Implement `app_ai/tools/query_courses.py`**

```python
"""Filtered org-wide course lookup for AI assistants."""
from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app_ai.links import with_course_link
from app_ai.tenant_context import get_current_org
from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.count_organization import COURSE_STATUS_ENUM
from app_ai.tools.rbac import require_course_read_breadth
from app_ai.tools.resolve import resolve_category
from app_auth.models import User
from app_course.course_month_type import (
    MONTH_TYPE_FM,
    MONTH_TYPE_HM,
    filter_queryset_by_month_type,
)
from app_course.models import Course


def _org_today(org) -> date:
    tz = ZoneInfo(getattr(org, "timezone", None) or "UTC")
    return datetime.now(tz).date()


def _month_bounds(*, year: int, month: int) -> tuple[date, date]:
    first = date(year, month, 1)
    last = date(year, month, calendar.monthrange(year, month)[1])
    return first, last


def _compact_course_row(course: Course) -> dict[str, Any]:
    row = {
        "title": course.title,
        "student_count": course.student_count if course.student_count is not None else 0,
    }
    return with_course_link(row)


def _group_courses(courses: list[Course]) -> list[dict[str, Any]]:
    buckets: dict[int, dict[str, Any]] = {}
    for course in courses:
        cat = course.category
        cid = cat.id
        if cid not in buckets:
            buckets[cid] = {
                "category": {"id": cid, "name": cat.name},
                "courses": [],
            }
        buckets[cid]["courses"].append(_compact_course_row(course))
    groups = list(buckets.values())
    for g in groups:
        g["count"] = len(g["courses"])
    groups.sort(key=lambda g: (g["category"]["name"].lower(),))
    return groups


QUERY_COURSES_SCHEMA = strict_object_schema(
    properties={
        "year": {"type": "integer", "description": "Calendar year. Default: current in org timezone."},
        "month": {"type": "integer", "minimum": 1, "maximum": 12, "description": "Calendar month 1-12. Default: current."},
        "category_id": {"type": "integer", "description": "Category id after resolve."},
        "category_query": {"type": "string", "minLength": 1, "description": "Fuzzy category name."},
        "course_type": {"type": "string", "enum": ["WD", "WE"]},
        "month_type": {"type": "string", "enum": [MONTH_TYPE_FM, MONTH_TYPE_HM]},
        "course_status": {"type": "string", "enum": COURSE_STATUS_ENUM},
        "group_by_category": {"type": "boolean"},
        "limit": {"type": "integer", "minimum": 1, "maximum": 50},
    },
    required=[],
)


def run_query_courses(args: dict[str, Any], user: User) -> dict[str, Any]:
    denied = require_course_read_breadth(user)
    if denied:
        return denied

    org = get_current_org()
    if org is None:
        return {"error": "validation_error", "message": "Organization context required."}

    today = _org_today(org)
    year = int(args.get("year") or today.year)
    month = int(args.get("month") or today.month)
    if month < 1 or month > 12:
        return {"error": "validation_error", "message": "month must be 1-12."}

    category_id = args.get("category_id")
    category_query = args.get("category_query")
    has_cat_id = category_id is not None
    has_cat_query = bool((category_query or "").strip())
    if has_cat_id and has_cat_query:
        return {
            "error": "validation_error",
            "message": "Provide at most one of category_id or category_query.",
        }

    resolved_category = None
    if has_cat_id or has_cat_query:
        resolved = resolve_category(
            category_id=category_id,
            query=category_query,
        )
        if resolved["status"] != "ok":
            return {
                "error": resolved["status"],
                **{k: v for k, v in resolved.items() if k != "status"},
            }
        resolved_category = resolved["category"]

    course_status = args.get("course_status") or "active"
    course_type = args.get("course_type")
    month_type = args.get("month_type")
    group_by_category = args.get("group_by_category")
    if group_by_category is None:
        group_by_category = True
    limit = int(args.get("limit") or 50)

    if month_type and not getattr(org, "is_fm_hm_course_display_enabled", False):
        return {
            "error": "feature_disabled",
            "message": "FM/HM filters are not enabled for this school.",
        }

    first_day, last_day = _month_bounds(year=year, month=month)
    qs = Course.objects.all()
    if course_status != "all":
        qs = qs.filter(status=course_status)
    qs = qs.filter(start_date__lte=last_day, end_date__gte=first_day)
    if resolved_category is not None:
        qs = qs.filter(category_id=resolved_category.id)
    if course_type in ("WD", "WE"):
        qs = qs.filter(course_type=course_type)
    if month_type in (MONTH_TYPE_FM, MONTH_TYPE_HM):
        qs = filter_queryset_by_month_type(qs, month_type)

    qs = qs.select_related("category").order_by(
        "category__sort_order", "category__name", "title"
    )
    matched = list(qs[: limit + 1])
    truncated = len(matched) > limit
    courses = matched[:limit]

    month_label = first_day.strftime("%B %Y")
    filters_applied: dict[str, Any] = {
        "course_status": course_status,
        "category": (
            {"id": resolved_category.id, "name": resolved_category.name}
            if resolved_category
            else None
        ),
        "course_type": course_type,
        "month_type": month_type,
    }

    result: dict[str, Any] = {
        "count": len(courses),
        "month": {"year": year, "month": month, "label": month_label},
        "filters_applied": filters_applied,
        "group_by_category": group_by_category,
        "truncated": truncated,
    }
    if group_by_category:
        result["groups"] = _group_courses(courses)
    else:
        result["courses"] = [_compact_course_row(c) for c in courses]
    return result


QUERY_COURSES_TOOL = Tool(
    name="query_courses",
    description=(
        "List or count school-wide courses with filters: calendar month (defaults to "
        "current month), category (fuzzy name), WE/WD course_type, and FM/HM month_type "
        "when enabled for the school. Returns course titles, student_count, and optional "
        "grouping by category. Admin only. Always include course names when answering counts."
    ),
    parameters=QUERY_COURSES_SCHEMA,
    run=run_query_courses,
)
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
python manage.py test app_ai.tests.test_query_courses -v 2
```

---

## Task 9: Registry and prompts

**Files:**
- Modify: `app_ai/tools/registry.py`
- Modify: `app_ai/prompts.py`
- Modify: `app_ai/tests/test_tools_and_pricing.py`
- Modify: `app_ai/tests/test_tool_registry.py`

- [ ] **Step 1: Register tool**

In `registry.py`:

```python
from app_ai.tools.query_courses import QUERY_COURSES_TOOL

TOOL_REGISTRY: dict[str, Tool] = {
    # ... existing ...
    QUERY_COURSES_TOOL.name: QUERY_COURSES_TOOL,
}
```

- [ ] **Step 2: Update prompt**

In `app_ai/prompts.py`, after the count tools paragraph:

```
Use query_courses for filtered org-wide course questions: month, category, WE/WD,
FM/HM (when enabled), and student numbers across courses. Defaults to the current
calendar month. When reporting counts, always list linked course titles. Format
student-number answers grouped by category using groups from the tool result.
```

- [ ] **Step 3: Update declaration count test**

In `test_tools_and_pricing.py`, change `9` → `10`.

- [ ] **Step 4: Update tool registry test**

Add `"query_courses"` to the read-exposure tuple in `test_tool_registry.py`.

- [ ] **Step 5: Run metadata tests**

```bash
python manage.py test app_ai.tests.test_tools_and_pricing app_ai.tests.test_tool_registry -v 2
```

---

## Task 10: Final verification

- [ ] **Step 1: Run full test suite for this feature**

```bash
python manage.py test \
  app_course.tests.test_course_month_type \
  app_course.tests.test_category_search \
  app_ai.tests.test_query_courses \
  app_ai.tests.test_count_tools.AIToolResolveCategoryTests \
  app_ai.tests.test_tools_and_pricing \
  app_ai.tests.test_tool_registry \
  -v 2
```

Expected: all PASS

- [ ] **Step 2: Update spec status**

In `docs/superpowers/specs/2026-06-27-ai-query-courses-design.md`, set `Status: Approved`.

---

## Spec coverage checklist

| Spec section | Task |
| --- | --- |
| FM/HM canonical helper | Task 1–2 |
| Category fuzzy search | Task 3–5 |
| `resolve_category` | Task 6 |
| `query_courses` tool | Task 8 |
| Prompt + tenant FM/HM line | Task 7, 9 |
| Testing matrix | Tasks 1, 4, 6, 8, 10 |
| Out of scope items | Not implemented (by design) |
