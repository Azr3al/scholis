# Academic Hub — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `/courses` list page with an Academic Hub: an adaptive, program-first filter bar; a redesigned course card; server-side fuzzy search via `pg_trgm`; a chip-count aggregate endpoint; and a "My classes only" toggle for users with the teacher role. All filter state lives in the URL via `nuqs`.

**Architecture:** Backend gets a `pg_trgm` migration, a `q` branch on `CourseSearchView`, and a new `CourseAggregateView`. Frontend gets a thin `/courses/page.tsx` that renders `AcademicHubPage` under `src/components/academic-hub/`, with React Query hooks for list + aggregates and `nuqs` for URL state. The legacy `CourseCard` is kept; a sibling `course-card.tsx` lives under `academic-hub/`.

**Tech Stack:** Django REST + Postgres `pg_trgm` (`schedjuice-reimagined-be`); Next.js App Router + TanStack Query v4 + `nuqs` v1 + Vitest (`schedjuice-reimagined-fe`).

**Design spec:** [docs/superpowers/specs/2026-05-22-academic-hub-design.md](../specs/2026-05-22-academic-hub-design.md)

---

## File map

| File | Responsibility |
| --- | --- |
| `schedjuice-reimagined-be/app_course/migrations/0084_pg_trgm_course_search.py` | Enable extension + GIN indexes (non-atomic) |
| `schedjuice-reimagined-be/app_course/views.py` | `CourseSearchView` gains `q` branch; new `CourseAggregateView` |
| `schedjuice-reimagined-be/app_course/services/aggregate.py` | Facet count query builder |
| `schedjuice-reimagined-be/app_course/urls.py` | Register `courses/aggregate` |
| `schedjuice-reimagined-be/schedjuice/settings/base.py` | `COURSE_SEARCH_FUZZY_ENABLED`, `COURSE_SEARCH_TRIGRAM_THRESHOLD` |
| `schedjuice-reimagined-be/app_course/tests/test_course_search_fuzzy.py` | `pg_trgm` search behaviour |
| `schedjuice-reimagined-be/app_course/tests/test_course_aggregate.py` | Aggregate endpoint behaviour |
| `schedjuice-reimagined-fe/src/types/academic-hub.ts` | Hub filter set + aggregate response types |
| `schedjuice-reimagined-fe/src/helpers/academic-hub/filter-params.ts` | URL state → `filter_params` |
| `schedjuice-reimagined-fe/src/helpers/academic-hub/filter-params.test.ts` | Vitest |
| `schedjuice-reimagined-fe/src/hooks/academic-hub/use-hub-filters.ts` | nuqs read/write |
| `schedjuice-reimagined-fe/src/hooks/academic-hub/use-programs.ts` | Programs catalog query |
| `schedjuice-reimagined-fe/src/hooks/academic-hub/use-intakes.ts` | Intakes per program |
| `schedjuice-reimagined-fe/src/hooks/academic-hub/use-hub-courses.ts` | Card grid query |
| `schedjuice-reimagined-fe/src/hooks/academic-hub/use-hub-aggregate.ts` | Status/subject/category counts |
| `schedjuice-reimagined-fe/src/components/academic-hub/academic-hub-page.tsx` | Page shell |
| `schedjuice-reimagined-fe/src/components/academic-hub/academic-hub-header.tsx` | Title + single-program label + CTA |
| `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/filter-bar.tsx` | Filter bar layout shell |
| `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/program-chips.tsx` | Radio program chips |
| `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/status-chips.tsx` | Multi-select with counts |
| `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/intake-select.tsx` | Intake dropdown |
| `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/subject-chips.tsx` | Multi-select with counts (required-strategy programs) |
| `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/category-pills.tsx` | Wraps `CategoryMultiSelect` |
| `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/my-only-toggle.tsx` | "My classes only" switch |
| `schedjuice-reimagined-fe/src/components/academic-hub/course-card.tsx` | Course card v2 |
| `schedjuice-reimagined-fe/src/components/academic-hub/course-grid.tsx` | Grid + skeleton |
| `schedjuice-reimagined-fe/src/components/academic-hub/empty-state.tsx` | Filter-aware empty states |
| `schedjuice-reimagined-fe/src/app/(internal)/courses/page.tsx` | Thin entry that renders `AcademicHubPage` (rewrite) |
| `schedjuice-reimagined-fe/src/config/nav-routes.tsx` | Remove Quick Links `Courses`; rename Management label |

---

## Task 1: `pg_trgm` extension + GIN indexes migration

**Files:**
- Create: `schedjuice-reimagined-be/app_course/migrations/0084_pg_trgm_course_search.py`

- [ ] **Step 1: Inspect the latest migration number**

Run: `ls schedjuice-reimagined-be/app_course/migrations | sort | tail -3`

Expected: confirms the latest migration is `0083_programlevelsubject.py`. The new migration is `0084_pg_trgm_course_search.py`.

- [ ] **Step 2: Create the migration**

Write `schedjuice-reimagined-be/app_course/migrations/0084_pg_trgm_course_search.py`:

```python
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations


class Migration(migrations.Migration):
    """
    Enable pg_trgm and add GIN trigram indexes used by Academic Hub fuzzy search.

    Run non-atomically so each CREATE INDEX CONCURRENTLY can commit independently.
    Index creation is idempotent via IF NOT EXISTS.
    """

    atomic = False

    dependencies = [
        ("app_course", "0083_programlevelsubject"),
    ]

    operations = [
        TrigramExtension(),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
                "course_title_trgm_idx ON app_course_course "
                "USING gin (title gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS course_title_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
                "course_code_trgm_idx ON app_course_course "
                "USING gin (code gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS course_code_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
                "subject_name_trgm_idx ON app_course_subject "
                "USING gin (name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS subject_name_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
                "program_level_name_trgm_idx ON app_course_programlevel "
                "USING gin (name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS program_level_name_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
                "program_level_section_name_trgm_idx "
                "ON app_course_programlevelsection "
                "USING gin (name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS program_level_section_name_trgm_idx;",
        ),
    ]
```

> Note: if the underlying table names differ (e.g. `app_course_programlevel` vs `programlevel`), inspect with `python manage.py dbshell -c '\dt'` and adjust before merging.

- [ ] **Step 3: Apply the migration on a scratch database**

Run: `cd schedjuice-reimagined-be && python manage.py migrate app_course 0084`

Expected: completes without error. `python manage.py dbshell -c '\dx pg_trgm'` shows the extension installed.

- [ ] **Step 4: Commit**

```bash
git add schedjuice-reimagined-be/app_course/migrations/0084_pg_trgm_course_search.py
git commit -m "feat(academic-hub): enable pg_trgm + GIN indexes for course fuzzy search"
```

---

## Task 2: Trigram settings + feature flag

**Files:**
- Modify: `schedjuice-reimagined-be/schedjuice/settings/base.py`

- [ ] **Step 1: Add settings**

Find the section near the bottom that holds application-level constants (after any `INSTALLED_APPS`/`MIDDLEWARE` blocks). Append:

```python
# Academic Hub course search tuning.
COURSE_SEARCH_FUZZY_ENABLED = env.bool("COURSE_SEARCH_FUZZY_ENABLED", default=True)
COURSE_SEARCH_TRIGRAM_THRESHOLD = env.float(
    "COURSE_SEARCH_TRIGRAM_THRESHOLD", default=0.25
)
```

> If `env` is not in scope at this point in the file, use `os.environ.get(...)` with explicit casts, mirroring other settings in the same file.

- [ ] **Step 2: Verify settings load**

Run: `cd schedjuice-reimagined-be && python manage.py shell -c "from django.conf import settings; print(settings.COURSE_SEARCH_FUZZY_ENABLED, settings.COURSE_SEARCH_TRIGRAM_THRESHOLD)"`

Expected: `True 0.25`

- [ ] **Step 3: Commit**

```bash
git add schedjuice-reimagined-be/schedjuice/settings/base.py
git commit -m "chore(academic-hub): add COURSE_SEARCH_FUZZY_ENABLED + threshold settings"
```

---

## Task 3: `CourseSearchView` fuzzy-search `q` branch (TDD)

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/views.py` (`CourseSearchView`)
- Test: `schedjuice-reimagined-be/app_course/tests/test_course_search_fuzzy.py`

- [ ] **Step 1: Write the failing tests**

Create `schedjuice-reimagined-be/app_course/tests/test_course_search_fuzzy.py`:

```python
from uuid import uuid4

from django.test import override_settings
from django_tenants.utils import schema_context
from rest_framework import status
from rest_framework.test import APITestCase

from app_course.models import (
    Category,
    Course,
    Program,
    Subject,
)
from app_course.tests.utils import build_admin_user_for_test_tenant


class CourseFuzzySearchTest(APITestCase):
    def setUp(self):
        self.tenant = build_admin_user_for_test_tenant(self)
        self.client.force_authenticate(user=self.user)

    def _make_course(self, *, title, code=""):
        with schema_context(self.tenant.schema_name):
            category, _ = Category.objects.get_or_create(name="default")
            program, _ = Program.objects.get_or_create(
                name=f"Program {uuid4().hex[:6]}",
                defaults={
                    "course_creation_method": Program.CourseCreationMethod.MANUAL,
                    "subject_strategy": Program.SubjectStrategy.NONE,
                },
            )
            return Course.objects.create(
                title=title,
                code=code,
                category=category,
                program=program,
            )

    @override_settings(COURSE_SEARCH_FUZZY_ENABLED=True)
    def test_q_matches_with_typo(self):
        with schema_context(self.tenant.schema_name):
            self._make_course(title="Algebra II")
            self._make_course(title="History 101")
        resp = self.client.post(
            "/courses/search?page=1&size=20",
            data={"q": "algerba"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        titles = [row["title"] for row in resp.data["data"]["rows"]]
        self.assertIn("Algebra II", titles)
        self.assertNotIn("History 101", titles)

    @override_settings(COURSE_SEARCH_FUZZY_ENABLED=True)
    def test_q_ignores_status_filter(self):
        with schema_context(self.tenant.schema_name):
            active = self._make_course(title="Algebra II")
            active.status = Course.CourseStatus.ACTIVE
            active.save()
            ended = self._make_course(title="Algebra III")
            ended.status = Course.CourseStatus.ENDED
            ended.save()
        body = {
            "q": "algebra",
            "filter_params": [
                {"field_name": "status", "operator": "in", "value": "active"}
            ],
        }
        resp = self.client.post(
            "/courses/search?page=1&size=20", data=body, format="json"
        )
        titles = [row["title"] for row in resp.data["data"]["rows"]]
        self.assertIn("Algebra II", titles)
        self.assertIn("Algebra III", titles)

    @override_settings(COURSE_SEARCH_FUZZY_ENABLED=False)
    def test_q_falls_back_to_multi_word_ilike(self):
        with schema_context(self.tenant.schema_name):
            self._make_course(title="Term 1 Algebra Advanced")
            self._make_course(title="Geometry")
        resp = self.client.post(
            "/courses/search?page=1&size=20",
            data={"q": "algebra term"},
            format="json",
        )
        titles = [row["title"] for row in resp.data["data"]["rows"]]
        self.assertIn("Term 1 Algebra Advanced", titles)
        self.assertNotIn("Geometry", titles)
```

> `build_admin_user_for_test_tenant` is the existing helper in `app_course/tests/utils.py`. If it isn't named exactly that, swap for whatever helper sets up `self.tenant` and `self.user` in the existing tests in `test_program_intake.py` — copy the pattern verbatim.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_course_search_fuzzy -v 2`

Expected: all three tests FAIL. The first two fail because `q` is unhandled today; the third fails because there is no fallback path.

- [ ] **Step 3: Implement the `q` branch on `CourseSearchView`**

In `schedjuice-reimagined-be/app_course/views.py`, add imports near the existing imports:

```python
from django.conf import settings
from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Q
from django.db.models.functions import Greatest
```

Add a helper near `CourseSearchView`:

```python
def _strip_status_filters(filter_params):
    return [fp for fp in (filter_params or []) if fp.get("field_name") != "status"]


def _apply_fuzzy_q(queryset, q):
    """pg_trgm-based fuzzy match across course/subject/level/section."""
    threshold = settings.COURSE_SEARCH_TRIGRAM_THRESHOLD
    return (
        queryset.annotate(
            sim=Greatest(
                TrigramSimilarity("title", q),
                TrigramSimilarity("code", q),
                TrigramSimilarity("subject__name", q),
                TrigramSimilarity("level__name", q),
                TrigramSimilarity("section__name", q),
            )
        )
        .filter(sim__gte=threshold)
        .order_by("-sim", "-created_at")
    )


def _apply_multi_word_ilike_q(queryset, q):
    """Fallback when pg_trgm is unavailable. Each word must match icontains in any field."""
    qs = queryset
    for word in q.split():
        qs = qs.filter(
            Q(title__icontains=word)
            | Q(code__icontains=word)
            | Q(subject__name__icontains=word)
            | Q(level__name__icontains=word)
            | Q(section__name__icontains=word)
        )
    return qs.order_by("-created_at")
```

Replace the existing `CourseSearchView.post`:

```python
class CourseSearchView(BaseSearchView):
    name = "Course search view"
    model = models.Course
    serializer = serializers.CourseSerializer

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        queryset = annotate_course_queryset_first_event_times(queryset)
        return prefetch_course_teacher_roster_for_list_serializer(queryset)

    def apply_q(self, queryset, request):
        q = (request.data.get("q") or "").strip()
        if not q:
            return queryset, False
        if settings.COURSE_SEARCH_FUZZY_ENABLED:
            return _apply_fuzzy_q(queryset, q), True
        return _apply_multi_word_ilike_q(queryset, q), True

    def post(self, request: Request):
        # Strip status filters when q is present (search overrides status).
        q_present = bool((request.data.get("q") or "").strip())
        if q_present and isinstance(request.data, dict):
            fp = request.data.get("filter_params")
            if fp:
                request.data["filter_params"] = _strip_status_filters(fp)

        user = models.User.get_user_from_request(request)
        if user.is_admin():
            return super().post(request)

        assigned_course_ids = list(
            models.UserCourse.objects.filter(user_id=user.id).values_list(
                "course_id", flat=True
            )
        )
        created_course_ids = list(
            models.Course.objects.filter(created_by=user.id).values_list(
                "id", flat=True
            )
        )
        course_ids = list(set(assigned_course_ids + created_course_ids))
        return super().post(request, course_ids)
```

`BaseSearchView` must call `apply_q` during queryset augmentation. If it currently does not, override `augment_search_queryset` further to call it:

```python
    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        queryset = annotate_course_queryset_first_event_times(queryset)
        queryset = prefetch_course_teacher_roster_for_list_serializer(queryset)
        request = self.request  # DRF sets this on the view instance
        queryset, _ = self.apply_q(queryset, request)
        return queryset
```

> If `BaseSearchView` already exposes a `q` hook, override that instead. Check `schedjuice-reimagined-be/app_course/views.py` for the inherited definition and adapt — keep the same hook seam used elsewhere.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_course_search_fuzzy -v 2`

Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-be/app_course/views.py \
        schedjuice-reimagined-be/app_course/tests/test_course_search_fuzzy.py
git commit -m "feat(academic-hub): fuzzy q on CourseSearchView with pg_trgm + ilike fallback"
```

---

## Task 4: Aggregate query service (TDD)

**Files:**
- Create: `schedjuice-reimagined-be/app_course/services/__init__.py` (if missing)
- Create: `schedjuice-reimagined-be/app_course/services/aggregate.py`
- Test: `schedjuice-reimagined-be/app_course/tests/test_course_aggregate.py`

- [ ] **Step 1: Write the failing tests**

Create `schedjuice-reimagined-be/app_course/tests/test_course_aggregate.py`:

```python
from uuid import uuid4

from django_tenants.utils import schema_context
from django.test import TestCase

from app_course.models import Category, Course, Program, Subject
from app_course.services.aggregate import build_course_aggregates


class CourseAggregateServiceTest(TestCase):
    """Pure service tests — no HTTP, no auth."""

    def setUp(self):
        cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
        cat2 = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
        prog = Program.objects.create(
            name=f"P {uuid4().hex[:4]}",
            course_creation_method=Program.CourseCreationMethod.MANUAL,
            subject_strategy=Program.SubjectStrategy.NONE,
        )
        self.subject = Subject.objects.create(name=f"S {uuid4().hex[:4]}")
        Course.objects.create(
            title="A1", category=cat, program=prog, status=Course.CourseStatus.ACTIVE
        )
        Course.objects.create(
            title="A2", category=cat, program=prog, status=Course.CourseStatus.ACTIVE
        )
        Course.objects.create(
            title="P1", category=cat2, program=prog, status=Course.CourseStatus.PLANNED
        )
        self.base_qs = Course.objects.all()
        self.cat = cat
        self.cat2 = cat2

    def test_status_counts_ignore_status_filter(self):
        result = build_course_aggregates(
            base_qs=self.base_qs.filter(status="active"),
            request_filter_params=[
                {"field_name": "status", "operator": "in", "value": "active"}
            ],
            facets=["status"],
        )
        self.assertEqual(result["status"]["active"], 2)
        self.assertEqual(result["status"]["planned"], 1)

    def test_category_counts_ignore_category_filter(self):
        result = build_course_aggregates(
            base_qs=self.base_qs,
            request_filter_params=[
                {"field_name": "category", "operator": "in", "value": str(self.cat.id)}
            ],
            facets=["category"],
        )
        names = {row["id"]: row["count"] for row in result["category"]}
        self.assertEqual(names[self.cat.id], 2)
        self.assertEqual(names[self.cat2.id], 1)

    def test_omits_facets_not_requested(self):
        result = build_course_aggregates(
            base_qs=self.base_qs, request_filter_params=[], facets=["status"]
        )
        self.assertIn("status", result)
        self.assertNotIn("subject", result)
        self.assertNotIn("category", result)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_course_aggregate -v 2`

Expected: `ImportError: cannot import name 'build_course_aggregates'`.

- [ ] **Step 3: Implement the service**

Create `schedjuice-reimagined-be/app_course/services/__init__.py` if it does not exist (empty file).

Create `schedjuice-reimagined-be/app_course/services/aggregate.py`:

```python
"""Course aggregate facets for the Academic Hub filter bar."""
from __future__ import annotations

from collections import Counter
from typing import Iterable

from django.db.models import Count, QuerySet


FACET_FIELDS = {"status", "subject", "category"}


def _strip_facet_filters(filter_params, facet: str):
    """Drop any filter_param whose field targets `facet`."""
    if not filter_params:
        return []
    if facet == "status":
        return [fp for fp in filter_params if fp.get("field_name") != "status"]
    if facet == "subject":
        return [
            fp
            for fp in filter_params
            if fp.get("field_name") not in {"subject", "subject_id", "subject__id"}
        ]
    if facet == "category":
        return [
            fp
            for fp in filter_params
            if fp.get("field_name")
            not in {"category", "category_id", "category__id"}
        ]
    return filter_params


def _apply_filter_params(qs: QuerySet, filter_params) -> QuerySet:
    """Translate a small subset of search-style filter_params into a queryset filter."""
    from app_course.models import Course  # local import to avoid cycles

    if not filter_params:
        return qs

    op_map = {
        "exact": "",
        "iexact": "__iexact",
        "in": "__in",
        "lt": "__lt",
        "gt": "__gt",
        "lte": "__lte",
        "gte": "__gte",
        "icontains": "__icontains",
        "contains": "__contains",
        "isnull": "__isnull",
    }

    for fp in filter_params:
        field = fp.get("field_name")
        op = fp.get("operator", "exact")
        value = fp.get("value")
        if value is None or field is None:
            continue
        lookup_suffix = op_map.get(op, "")
        lookup = f"{field}{lookup_suffix}"
        if op == "in" and isinstance(value, str):
            value = [v for v in value.split(",") if v]
        elif op == "isnull":
            value = str(value).lower() in ("1", "true", "yes")
        qs = qs.filter(**{lookup: value})
    return qs


def build_course_aggregates(
    *,
    base_qs: QuerySet,
    request_filter_params,
    facets: Iterable[str],
    q: str | None = None,
):
    """Compute facet counts that respect every filter except the facet itself.

    ``base_qs`` should already be scoped by role (caller's responsibility).
    """
    from app_course.models import Course

    result = {}
    for facet in facets:
        if facet not in FACET_FIELDS:
            continue
        filters_for_facet = _strip_facet_filters(request_filter_params, facet)
        qs = _apply_filter_params(base_qs.all(), filters_for_facet)

        if q:
            from app_course.views import _apply_fuzzy_q, _apply_multi_word_ilike_q
            from django.conf import settings

            qs = (
                _apply_fuzzy_q(qs, q)
                if settings.COURSE_SEARCH_FUZZY_ENABLED
                else _apply_multi_word_ilike_q(qs, q)
            )
            # When q is on, also strip status filters (search overrides status).
            qs = _apply_filter_params(
                base_qs.all(),
                [fp for fp in filters_for_facet if fp.get("field_name") != "status"],
            )

        if facet == "status":
            rows = qs.values("status").annotate(count=Count("id"))
            result["status"] = {row["status"]: row["count"] for row in rows}
            # Normalise paused as a sibling of active for FE convenience.
            for default in ("active", "planned", "ended", "paused"):
                result["status"].setdefault(default, 0)
        else:
            id_field = f"{facet}_id"
            name_field = f"{facet}__name"
            rows = (
                qs.exclude(**{id_field: None})
                .values(id_field, name_field)
                .annotate(count=Count("id"))
                .order_by(name_field)
            )
            result[facet] = [
                {"id": row[id_field], "name": row[name_field], "count": row["count"]}
                for row in rows
            ]
    return result
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_course_aggregate -v 2`

Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-be/app_course/services/__init__.py \
        schedjuice-reimagined-be/app_course/services/aggregate.py \
        schedjuice-reimagined-be/app_course/tests/test_course_aggregate.py
git commit -m "feat(academic-hub): course aggregate service for chip counts"
```

---

## Task 5: `CourseAggregateView` HTTP endpoint

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/views.py`
- Modify: `schedjuice-reimagined-be/app_course/urls.py`
- Test: `schedjuice-reimagined-be/app_course/tests/test_course_aggregate.py` (add HTTP tests)

- [ ] **Step 1: Write the failing HTTP test**

Append to `test_course_aggregate.py`:

```python
from rest_framework import status as rest_status
from rest_framework.test import APITestCase

from app_course.tests.utils import build_admin_user_for_test_tenant


class CourseAggregateViewTest(APITestCase):
    def setUp(self):
        self.tenant = build_admin_user_for_test_tenant(self)
        self.client.force_authenticate(user=self.user)
        with schema_context(self.tenant.schema_name):
            cat = Category.objects.create(name=f"Cat {uuid4().hex[:4]}")
            prog = Program.objects.create(
                name=f"P {uuid4().hex[:4]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            Course.objects.create(title="A1", category=cat, program=prog,
                                  status=Course.CourseStatus.ACTIVE)
            Course.objects.create(title="A2", category=cat, program=prog,
                                  status=Course.CourseStatus.ENDED)
            self.cat_id = cat.id

    def test_post_returns_facet_counts(self):
        resp = self.client.post(
            "/courses/aggregate",
            data={"filter_params": [], "facets": ["status", "category"]},
            format="json",
        )
        self.assertEqual(resp.status_code, rest_status.HTTP_200_OK)
        self.assertIn("status", resp.data)
        self.assertIn("category", resp.data)
        self.assertEqual(resp.data["status"]["active"], 1)
        self.assertEqual(resp.data["status"]["ended"], 1)
        self.assertTrue(
            any(row["id"] == self.cat_id and row["count"] == 2 for row in resp.data["category"])
        )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_course_aggregate.CourseAggregateViewTest -v 2`

Expected: HTTP 404 — route does not exist.

- [ ] **Step 3: Add the view**

Append to `schedjuice-reimagined-be/app_course/views.py`:

```python
from app_course.services.aggregate import build_course_aggregates


class CourseAggregateView(BaseView):
    """POST /courses/aggregate — facet counts for the Academic Hub filter bar."""

    name = "Course aggregate view"
    model = models.Course
    serializer = serializers.CourseSerializer

    def post(self, request: Request):
        user = models.User.get_user_from_request(request)
        facets = request.data.get("facets") or []
        filter_params = request.data.get("filter_params") or []
        q = (request.data.get("q") or "").strip() or None

        base_qs = models.Course.objects.all()
        if not user.is_admin():
            assigned = models.UserCourse.objects.filter(user_id=user.id).values_list(
                "course_id", flat=True
            )
            created = models.Course.objects.filter(created_by=user.id).values_list(
                "id", flat=True
            )
            base_qs = base_qs.filter(id__in=list(set(list(assigned) + list(created))))

        return self.ok(
            build_course_aggregates(
                base_qs=base_qs,
                request_filter_params=filter_params,
                facets=facets,
                q=q,
            )
        )
```

> If `BaseView.ok()` is not the helper used in this file, follow the response wrapping pattern used by sibling views (e.g. `return Response({...})`).

- [ ] **Step 4: Register the URL**

In `schedjuice-reimagined-be/app_course/urls.py`, add to the existing `urlpatterns`:

```python
from app_course.views import CourseAggregateView

# ... existing patterns ...
urlpatterns += [
    path("courses/aggregate", CourseAggregateView.as_view(), name="course-aggregate"),
]
```

> Use the same `path(...)` style already in the file; keep ordering before any catch-all if present.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_course_aggregate.CourseAggregateViewTest -v 2`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add schedjuice-reimagined-be/app_course/views.py \
        schedjuice-reimagined-be/app_course/urls.py \
        schedjuice-reimagined-be/app_course/tests/test_course_aggregate.py
git commit -m "feat(academic-hub): POST /courses/aggregate endpoint"
```

---

## Task 6: Frontend hub types

**Files:**
- Create: `schedjuice-reimagined-fe/src/types/academic-hub.ts`

- [ ] **Step 1: Create the types module**

```ts
import { z } from "zod";
import { courseStatus } from "@/types/course";

export const HUB_PROGRAM_ALL = "all" as const;

export type HubStatusFilter = "active" | "planned" | "ended";
export const HUB_STATUS_VALUES: HubStatusFilter[] = ["active", "planned", "ended"];

export interface HubFilterSet {
  program: string;       // program id or HUB_PROGRAM_ALL
  status: HubStatusFilter[];
  intake: string | null;
  subjects: string[];
  categories: string[];
  q: string;
  my: boolean;
  page: number;
}

export interface HubAggregateRequest {
  filter_params: { field_name: string; operator: string; value: string }[];
  q?: string;
  facets: ("status" | "subject" | "category")[];
}

export const hubStatusAggregateSchema = z.object({
  active: z.number(),
  planned: z.number(),
  ended: z.number(),
  paused: z.number(),
});
export type HubStatusAggregate = z.infer<typeof hubStatusAggregateSchema>;

export const hubFacetRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  count: z.number(),
});
export type HubFacetRow = z.infer<typeof hubFacetRowSchema>;

export const hubAggregateResponseSchema = z.object({
  status: hubStatusAggregateSchema.optional(),
  subject: z.array(hubFacetRowSchema).optional(),
  category: z.array(hubFacetRowSchema).optional(),
});
export type HubAggregateResponse = z.infer<typeof hubAggregateResponseSchema>;

export type HubFacet = "status" | "subject" | "category";
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/types/academic-hub.ts
git commit -m "feat(academic-hub): shared types for filter set + aggregate"
```

---

## Task 7: Filter-params helper (TDD)

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/academic-hub/filter-params.ts`
- Test: `schedjuice-reimagined-fe/src/helpers/academic-hub/filter-params.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `filter-params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildHubFilterParams } from "./filter-params";
import { HUB_PROGRAM_ALL } from "@/types/academic-hub";

const baseFilters = {
  program: HUB_PROGRAM_ALL,
  status: ["active"] as const,
  intake: null,
  subjects: [],
  categories: [],
  q: "",
  my: false,
  page: 1,
};

describe("buildHubFilterParams", () => {
  it("emits no program filter when 'all' is selected", () => {
    const fp = buildHubFilterParams({ ...baseFilters }, { userId: 42 });
    expect(fp.filter_params.find((f) => f.field_name === "program")).toBeUndefined();
  });

  it("expands paused into the active status filter", () => {
    const fp = buildHubFilterParams(
      { ...baseFilters, status: ["active"] },
      { userId: 42 },
    );
    const statusFilter = fp.filter_params.find((f) => f.field_name === "status");
    expect(statusFilter?.value).toBe("active,paused");
  });

  it("adds program/intake/subjects/categories filters when set", () => {
    const fp = buildHubFilterParams(
      {
        ...baseFilters,
        program: "7",
        intake: "12",
        subjects: ["1", "2"],
        categories: ["9"],
      },
      { userId: 42 },
    );
    const byField = Object.fromEntries(
      fp.filter_params.map((f) => [f.field_name, f]),
    );
    expect(byField["program"].value).toBe("7");
    expect(byField["intake"].value).toBe("12");
    expect(byField["subject"].value).toBe("1,2");
    expect(byField["category"].value).toBe("9");
  });

  it("adds my-only filters when my is true", () => {
    const fp = buildHubFilterParams(
      { ...baseFilters, my: true },
      { userId: 42 },
    );
    const fields = fp.filter_params.map((f) => f.field_name);
    expect(fields).toContain("user_courses__user_id");
    expect(fields).toContain("user_courses__assigned_as_role");
  });

  it("strips status filters when q is present", () => {
    const fp = buildHubFilterParams(
      { ...baseFilters, status: ["active"], q: "algebra" },
      { userId: 42 },
    );
    expect(fp.filter_params.find((f) => f.field_name === "status")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/helpers/academic-hub/filter-params.test.ts`

(Use the project's package manager: `npm`, `pnpm`, or `yarn` — check `schedjuice-reimagined-fe/package-lock.json` / `pnpm-lock.yaml`.)

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `filter-params.ts`:

```ts
import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";
import {
  HUB_PROGRAM_ALL,
  HubFilterSet,
} from "@/types/academic-hub";

export interface HubFilterContext {
  userId: number | string;
}

export function buildHubFilterParams(
  state: HubFilterSet,
  ctx: HubFilterContext,
): Required<Pick<filterParamsBody, "filter_params">> {
  const filter_params: filterParam[] = [];

  if (state.program && state.program !== HUB_PROGRAM_ALL) {
    filter_params.push({
      field_name: "program",
      operator: operatorEnum.exact,
      value: String(state.program),
    });
  }

  if (!state.q && state.status.length > 0) {
    const statuses = new Set<string>(state.status);
    if (statuses.has("active")) statuses.add("paused");
    filter_params.push({
      field_name: "status",
      operator: operatorEnum.in,
      value: Array.from(statuses).join(","),
    });
  }

  if (state.intake) {
    filter_params.push({
      field_name: "intake",
      operator: operatorEnum.exact,
      value: String(state.intake),
    });
  }

  if (state.subjects.length > 0) {
    filter_params.push({
      field_name: "subject",
      operator: operatorEnum.in,
      value: state.subjects.join(","),
    });
  }

  if (state.categories.length > 0) {
    filter_params.push({
      field_name: "category",
      operator: operatorEnum.in,
      value: state.categories.join(","),
    });
  }

  if (state.my) {
    filter_params.push({
      field_name: "user_courses__user_id",
      operator: operatorEnum.exact,
      value: String(ctx.userId),
    });
    filter_params.push({
      field_name: "user_courses__assigned_as_role",
      operator: operatorEnum.isnull,
      value: "false",
    });
  }

  return { filter_params };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/helpers/academic-hub/filter-params.test.ts`

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-fe/src/helpers/academic-hub
git commit -m "feat(academic-hub): URL state → search filter_params helper"
```

---

## Task 8: URL state hook (`use-hub-filters`)

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/academic-hub/use-hub-filters.ts`

- [ ] **Step 1: Implement the hook**

```ts
"use client";

import { useCallback, useMemo } from "react";
import {
  parseAsInteger,
  parseAsString,
  parseAsArrayOf,
  parseAsBoolean,
  useQueryStates,
} from "nuqs";
import {
  HUB_PROGRAM_ALL,
  HUB_STATUS_VALUES,
  HubFilterSet,
  HubStatusFilter,
} from "@/types/academic-hub";

const statusParser = parseAsArrayOf(parseAsString).withDefault(["active"]);
const stringArrayParser = parseAsArrayOf(parseAsString).withDefault([]);

const parsers = {
  program: parseAsString.withDefault(HUB_PROGRAM_ALL),
  status: statusParser,
  intake: parseAsString,
  subjects: stringArrayParser,
  categories: stringArrayParser,
  q: parseAsString.withDefault(""),
  my: parseAsBoolean.withDefault(false),
  page: parseAsInteger.withDefault(1),
};

export function useHubFilters() {
  const [raw, setRaw] = useQueryStates(parsers, { history: "replace" });

  const state: HubFilterSet = useMemo(
    () => ({
      program: raw.program ?? HUB_PROGRAM_ALL,
      status: ((raw.status ?? []).filter((s): s is HubStatusFilter =>
        HUB_STATUS_VALUES.includes(s as HubStatusFilter),
      )) as HubStatusFilter[],
      intake: raw.intake ?? null,
      subjects: raw.subjects ?? [],
      categories: raw.categories ?? [],
      q: raw.q ?? "",
      my: Boolean(raw.my),
      page: raw.page ?? 1,
    }),
    [raw],
  );

  const setProgram = useCallback(
    (program: string) => {
      // Changing program resets dependent filters.
      setRaw({
        program,
        intake: null,
        subjects: [],
        categories: [],
        page: 1,
      });
    },
    [setRaw],
  );

  const setStatus = useCallback(
    (status: HubStatusFilter[]) => setRaw({ status }),
    [setRaw],
  );
  const setIntake = useCallback(
    (intake: string | null) => setRaw({ intake, page: 1 }),
    [setRaw],
  );
  const setSubjects = useCallback(
    (subjects: string[]) => setRaw({ subjects, page: 1 }),
    [setRaw],
  );
  const setCategories = useCallback(
    (categories: string[]) => setRaw({ categories, page: 1 }),
    [setRaw],
  );
  const setQ = useCallback(
    (q: string) => setRaw({ q, page: 1 }),
    [setRaw],
  );
  const setMy = useCallback(
    (my: boolean) => setRaw({ my, page: 1 }),
    [setRaw],
  );
  const setPage = useCallback(
    (page: number) => setRaw({ page }),
    [setRaw],
  );

  return {
    state,
    setProgram,
    setStatus,
    setIntake,
    setSubjects,
    setCategories,
    setQ,
    setMy,
    setPage,
  };
}
```

- [ ] **Step 2: Sanity-check the build**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit`

Expected: no new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add schedjuice-reimagined-fe/src/hooks/academic-hub/use-hub-filters.ts
git commit -m "feat(academic-hub): nuqs-backed useHubFilters state hook"
```

---

## Task 9: `use-programs` and `use-intakes` hooks

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/academic-hub/use-programs.ts`
- Create: `schedjuice-reimagined-fe/src/hooks/academic-hub/use-intakes.ts`

- [ ] **Step 1: Implement `use-programs`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export interface HubProgram {
  id: number;
  name: string;
  course_creation_method: "manual" | "intake_based";
  subject_strategy: "none" | "optional" | "required" | "multi";
  sort_order?: number;
  is_active: boolean;
  intake_count?: number;
}

export function useHubPrograms() {
  return useQuery({
    queryKey: ["academic-hub-programs"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<HubProgram[]> => {
      const res = await searchEntities(
        "programs",
        { page: 1, size: 100, sorts: ["sort_order", "name"] },
        {
          filter_params: [
            {
              field_name: "is_active",
              operator: operatorEnum.exact,
              value: "true",
            },
          ],
        },
      );
      return res.data?.data?.rows ?? [];
    },
  });
}
```

- [ ] **Step 2: Implement `use-intakes`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export interface HubIntake {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  program: number;
}

export function useHubIntakes(programId: string | null) {
  return useQuery({
    queryKey: ["academic-hub-intakes", programId],
    enabled: Boolean(programId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<HubIntake[]> => {
      const res = await searchEntities(
        "intakes",
        { page: 1, size: 100, sorts: ["-start_date"] },
        {
          filter_params: [
            {
              field_name: "program",
              operator: operatorEnum.exact,
              value: String(programId),
            },
          ],
        },
      );
      return res.data?.data?.rows ?? [];
    },
  });
}
```

- [ ] **Step 3: Sanity-check the build**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit`

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add schedjuice-reimagined-fe/src/hooks/academic-hub/use-programs.ts \
        schedjuice-reimagined-fe/src/hooks/academic-hub/use-intakes.ts
git commit -m "feat(academic-hub): programs + intakes data hooks"
```

---

## Task 10: `use-hub-courses` (list query)

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/academic-hub/use-hub-courses.ts`

- [ ] **Step 1: Implement the hook**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { buildHubFilterParams } from "@/helpers/academic-hub/filter-params";
import { HUB_PROGRAM_ALL, HubFilterSet } from "@/types/academic-hub";
import { HubProgram } from "./use-programs";
import { courseType } from "@/types/course";

const PAGE_SIZE = 24;

const EXPAND = [
  "category",
  "subject",
  "level",
  "section",
  "program",
  "intake",
  "course_subjects",
  "course_subjects.subject",
  "primary_teacher",
];

function pickSorts(state: HubFilterSet, program: HubProgram | undefined): string[] {
  if (program?.course_creation_method === "intake_based") {
    return ["-intake__start_date", "-created_at"];
  }
  return ["-created_at"];
}

export interface UseHubCoursesArgs {
  state: HubFilterSet;
  userId: number | string;
  program: HubProgram | undefined; // selected program (undefined when ALL)
}

export interface HubCoursesResult {
  rows: courseType[];
  totalCount: number;
  pageCount: number;
}

export function useHubCourses({ state, userId, program }: UseHubCoursesArgs) {
  return useQuery({
    queryKey: ["academic-hub-list", state, userId],
    keepPreviousData: true,
    queryFn: async (): Promise<HubCoursesResult> => {
      const filterParams = buildHubFilterParams(state, { userId });
      const res = await searchEntities(
        "courses",
        {
          page: state.page,
          size: PAGE_SIZE,
          sorts: pickSorts(state, program),
          expand: EXPAND,
          q: state.q || undefined,
        },
        filterParams,
      );
      const payload = res.data?.data ?? {};
      return {
        rows: payload.rows ?? [],
        totalCount: payload.total_count ?? 0,
        pageCount: Math.max(1, Math.ceil((payload.total_count ?? 0) / PAGE_SIZE)),
      };
    },
  });
}

export const ACADEMIC_HUB_PAGE_SIZE = PAGE_SIZE;
```

- [ ] **Step 2: Sanity-check the build**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit`

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add schedjuice-reimagined-fe/src/hooks/academic-hub/use-hub-courses.ts
git commit -m "feat(academic-hub): useHubCourses list query"
```

---

## Task 11: `use-hub-aggregate`

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/academic-hub/use-hub-aggregate.ts`

- [ ] **Step 1: Implement the hook**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import {
  HubAggregateRequest,
  HubAggregateResponse,
  HubFacet,
  HubFilterSet,
  hubAggregateResponseSchema,
} from "@/types/academic-hub";
import { buildHubFilterParams } from "@/helpers/academic-hub/filter-params";

interface UseHubAggregateArgs {
  facet: HubFacet;
  state: HubFilterSet;
  userId: number | string;
  enabled?: boolean;
}

function stripFacet(state: HubFilterSet, facet: HubFacet): HubFilterSet {
  if (facet === "status") return { ...state, status: [] };
  if (facet === "subject") return { ...state, subjects: [] };
  if (facet === "category") return { ...state, categories: [] };
  return state;
}

export function useHubAggregate({
  facet,
  state,
  userId,
  enabled = true,
}: UseHubAggregateArgs) {
  const strippedState = stripFacet(state, facet);
  return useQuery({
    queryKey: ["academic-hub-aggregate", facet, strippedState, userId],
    enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<HubAggregateResponse> => {
      const fp = buildHubFilterParams(strippedState, { userId });
      const body: HubAggregateRequest = {
        filter_params: fp.filter_params,
        q: state.q || undefined,
        facets: [facet],
      };
      const res = await axiosClient.post("courses/aggregate", body);
      return hubAggregateResponseSchema.parse(res.data?.data ?? res.data);
    },
  });
}
```

- [ ] **Step 2: Sanity-check the build**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit`

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add schedjuice-reimagined-fe/src/hooks/academic-hub/use-hub-aggregate.ts
git commit -m "feat(academic-hub): per-facet aggregate hook"
```

---

## Task 12: `AcademicHubHeader`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/academic-hub-header.tsx`

- [ ] **Step 1: Implement the header**

```tsx
"use client";

import Link from "next/link";
import { TypographyH1 } from "@/components/typography/h1";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { HubProgram } from "@/hooks/academic-hub/use-programs";

interface Props {
  programs: HubProgram[];
}

export function AcademicHubHeader({ programs }: Props) {
  const { isTeacher, isAdminOrManager } = useUser();
  const { tenant } = useTenant();
  const isOnlyTeacher = Boolean(isTeacher) && !Boolean(isAdminOrManager);
  const canCreate = isOnlyTeacher
    ? Boolean(tenant?.can_teacher_create_course)
    : true;

  const singleProgramName =
    programs.length === 1 ? programs[0]?.name : undefined;

  return (
    <div className="flex justify-between items-center">
      <div className="space-y-1">
        <TypographyH1>Academic Hub</TypographyH1>
        {singleProgramName && (
          <p className="text-sm text-muted-foreground">{singleProgramName}</p>
        )}
      </div>
      {canCreate && (
        <Link
          href="/courses/create"
          className={cn(
            "inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium",
            "hover:bg-primary/90",
          )}
        >
          Add classes
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/academic-hub-header.tsx
git commit -m "feat(academic-hub): page header with single-program label"
```

---

## Task 13: `ProgramChips`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/program-chips.tsx`

- [ ] **Step 1: Implement the chips**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HUB_PROGRAM_ALL } from "@/types/academic-hub";
import { HubProgram } from "@/hooks/academic-hub/use-programs";

interface Props {
  programs: HubProgram[];
  selected: string;
  onSelect: (programId: string) => void;
}

export function ProgramChips({ programs, selected, onSelect }: Props) {
  if (programs.length <= 1) return null;

  const items: { id: string; label: string }[] = [
    { id: HUB_PROGRAM_ALL, label: "All" },
    ...programs.map((p) => ({ id: String(p.id), label: p.name })),
  ];

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-muted-foreground w-20 shrink-0">Program</span>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={item.id === selected ? "default" : "outline"}
            size="sm"
            className={cn("rounded-full")}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/program-chips.tsx
git commit -m "feat(academic-hub): program radio chips"
```

---

## Task 14: `StatusChips`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/status-chips.tsx`

- [ ] **Step 1: Implement the chips**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HUB_STATUS_VALUES,
  HubStatusAggregate,
  HubStatusFilter,
} from "@/types/academic-hub";

interface Props {
  selected: HubStatusFilter[];
  counts?: HubStatusAggregate;
  onChange: (next: HubStatusFilter[]) => void;
}

const LABEL: Record<HubStatusFilter, string> = {
  active: "Active",
  planned: "Planned",
  ended: "Ended",
};

function countFor(status: HubStatusFilter, counts?: HubStatusAggregate) {
  if (!counts) return undefined;
  if (status === "active") return counts.active + counts.paused;
  if (status === "planned") return counts.planned;
  return counts.ended;
}

export function StatusChips({ selected, counts, onChange }: Props) {
  const toggle = (status: HubStatusFilter) => {
    const isOn = selected.includes(status);
    const next = isOn
      ? selected.filter((s) => s !== status)
      : [...selected, status];
    onChange(next.length === 0 ? ["active"] : next);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-muted-foreground w-20 shrink-0">Status</span>
      <div className="flex flex-wrap gap-2">
        {HUB_STATUS_VALUES.map((status) => {
          const count = countFor(status, counts);
          const on = selected.includes(status);
          return (
            <Button
              key={status}
              type="button"
              variant={on ? "default" : "outline"}
              size="sm"
              className={cn("rounded-full")}
              onClick={() => toggle(status)}
            >
              {LABEL[status]}
              {count !== undefined && (
                <span className="ml-1 text-xs opacity-80">{count}</span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/status-chips.tsx
git commit -m "feat(academic-hub): status chips with counts (paused rolled into active)"
```

---

## Task 15: `IntakeSelect`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/intake-select.tsx`

- [ ] **Step 1: Implement the select**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HubIntake, useHubIntakes } from "@/hooks/academic-hub/use-intakes";

interface Props {
  programId: string;
  value: string | null;
  onChange: (intakeId: string | null) => void;
}

const ALL_VALUE = "__all__";

function pickDefaultIntake(intakes: HubIntake[]): HubIntake | undefined {
  if (intakes.length === 0) return undefined;
  // List is already sorted by start_date desc in useHubIntakes.
  const today = new Date().toISOString().slice(0, 10);
  const covering = intakes.find(
    (i) =>
      i.start_date <= today && (!i.end_date || i.end_date >= today),
  );
  return covering ?? intakes[0];
}

export function IntakeSelect({ programId, value, onChange }: Props) {
  const { data, isLoading } = useHubIntakes(programId);
  const searchParams = useSearchParams();
  const initialized = useRef(false);

  // On first load for this program, auto-pick the default intake when the URL
  // has no `intake` param. Users can clear with "All intakes" afterwards.
  useEffect(() => {
    if (initialized.current) return;
    if (isLoading || !data) return;
    initialized.current = true;
    if (value !== null) return;
    if (searchParams.has("intake")) return;
    const def = pickDefaultIntake(data);
    if (def) onChange(String(def.id));
  }, [isLoading, data, value, searchParams, onChange]);

  // Reset the "initialized" gate when the user switches programs.
  useEffect(() => {
    initialized.current = false;
  }, [programId]);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-muted-foreground w-20 shrink-0">Intake</span>
      <Select
        value={value ?? ALL_VALUE}
        onValueChange={(v) => onChange(v === ALL_VALUE ? null : v)}
        disabled={isLoading}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder={isLoading ? "Loading…" : "All intakes"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All intakes</SelectItem>
          {(data ?? []).map((intake) => (
            <SelectItem key={intake.id} value={String(intake.id)}>
              {intake.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/intake-select.tsx
git commit -m "feat(academic-hub): intake dropdown"
```

---

## Task 16: `SubjectChips`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/subject-chips.tsx`

- [ ] **Step 1: Implement the chips**

```tsx
"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HubFacetRow } from "@/types/academic-hub";

interface Props {
  rows?: HubFacetRow[];
  selected: string[];
  onChange: (next: string[]) => void;
  isLoading?: boolean;
}

export function SubjectChips({ rows, selected, onChange, isLoading }: Props) {
  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );

  if (isLoading) {
    return (
      <div className="flex gap-2 items-center text-sm text-muted-foreground">
        <span className="w-20 shrink-0">Subject</span>
        <span>Loading…</span>
      </div>
    );
  }
  if (sorted.length === 0) return null;

  const toggle = (id: string) => {
    const isOn = selected.includes(id);
    onChange(isOn ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-muted-foreground w-20 shrink-0">Subject</span>
      <div className="flex flex-wrap gap-2">
        {sorted.map((row) => {
          const id = String(row.id);
          const on = selected.includes(id);
          return (
            <Button
              key={id}
              type="button"
              variant={on ? "default" : "outline"}
              size="sm"
              className={cn("rounded-full")}
              onClick={() => toggle(id)}
            >
              {row.name}
              <span className="ml-1 text-xs opacity-80">{row.count}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/subject-chips.tsx
git commit -m "feat(academic-hub): subject chips with counts"
```

---

## Task 17: `CategoryFilterPills`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/category-pills.tsx`

- [ ] **Step 1: Implement the pills wrapper**

```tsx
"use client";

import { useMemo } from "react";
import CategoryMultiSelect from "@/components/category/category-multi-select";
import { HubFacetRow } from "@/types/academic-hub";

interface Props {
  rows?: HubFacetRow[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export function CategoryFilterPills({ rows, selected, onChange }: Props) {
  // Map facet rows to {id,name} options for the existing component.
  const categoryOptions = useMemo(
    () => (rows ?? []).map((r) => ({ id: r.id, name: `${r.name} (${r.count})` })),
    [rows],
  );

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-muted-foreground w-20 shrink-0">Category</span>
      <CategoryMultiSelect
        value={selected.map((id) => Number(id))}
        onChange={(ids: number[]) => onChange(ids.map(String))}
        options={categoryOptions}
        placeholder="Filter by category"
      />
    </div>
  );
}
```

> Verify the prop shape against `src/components/category/category-multi-select.tsx`. If it does not currently accept an `options` prop or has a different value type, either pass through the props that exist or, in a small, targeted change to that component, add an optional `options` override prop with backward-compatible default behaviour.

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/category-pills.tsx
git commit -m "feat(academic-hub): category pills wrapping CategoryMultiSelect"
```

---

## Task 18: `MyClassesOnlyToggle`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/my-only-toggle.tsx`

- [ ] **Step 1: Implement the toggle**

```tsx
"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Props {
  visible: boolean;
  value: boolean;
  onChange: (next: boolean) => void;
}

export function MyClassesOnlyToggle({ visible, value, onChange }: Props) {
  if (!visible) return null;
  return (
    <div className="flex items-center gap-2">
      <Switch
        id="hub-my-only"
        checked={value}
        onCheckedChange={onChange}
      />
      <Label htmlFor="hub-my-only" className="text-sm">
        My classes only
      </Label>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/my-only-toggle.tsx
git commit -m "feat(academic-hub): My classes only toggle"
```

---

## Task 19: `AcademicHubFilterBar` (composition)

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/filter-bar.tsx`

- [ ] **Step 1: Implement the filter bar**

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "use-debounce";
import { HUB_PROGRAM_ALL, HubStatusAggregate } from "@/types/academic-hub";
import { HubProgram } from "@/hooks/academic-hub/use-programs";
import { useHubFilters } from "@/hooks/academic-hub/use-hub-filters";
import { useHubAggregate } from "@/hooks/academic-hub/use-hub-aggregate";
import { useUser } from "@/hooks/useUser";
import { ProgramChips } from "./program-chips";
import { StatusChips } from "./status-chips";
import { IntakeSelect } from "./intake-select";
import { SubjectChips } from "./subject-chips";
import { CategoryFilterPills } from "./category-pills";
import { MyClassesOnlyToggle } from "./my-only-toggle";

interface Props {
  programs: HubProgram[];
}

export function AcademicHubFilterBar({ programs }: Props) {
  const filters = useHubFilters();
  const { state } = filters;
  const { user, isTeacher } = useUser();
  const userId = user?.id ?? 0;

  const selectedProgram = programs.find(
    (p) => String(p.id) === state.program,
  );
  const isAllPrograms = state.program === HUB_PROGRAM_ALL;
  const isIntakeBased =
    selectedProgram?.course_creation_method === "intake_based";
  const isRequiredStrategy = selectedProgram?.subject_strategy === "required";

  const statusAggregate = useHubAggregate({
    facet: "status",
    state,
    userId,
  });
  const subjectAggregate = useHubAggregate({
    facet: "subject",
    state,
    userId,
    enabled: !isAllPrograms && isRequiredStrategy,
  });
  const categoryAggregate = useHubAggregate({
    facet: "category",
    state,
    userId,
    enabled: !isAllPrograms && !isRequiredStrategy,
  });

  const setQDebounced = useDebouncedCallback(filters.setQ, 200);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Search courses"
          placeholder="Search title, code, subject, level, section…"
          defaultValue={state.q}
          onChange={(e) => setQDebounced(e.target.value)}
          className="max-w-md"
        />
      </div>

      <ProgramChips
        programs={programs}
        selected={state.program}
        onSelect={filters.setProgram}
      />

      <StatusChips
        selected={state.status}
        counts={statusAggregate.data?.status as HubStatusAggregate | undefined}
        onChange={filters.setStatus}
      />

      {!isAllPrograms && isIntakeBased && (
        <IntakeSelect
          programId={state.program}
          value={state.intake}
          onChange={filters.setIntake}
        />
      )}

      {!isAllPrograms && isRequiredStrategy && (
        <SubjectChips
          rows={subjectAggregate.data?.subject}
          selected={state.subjects}
          onChange={filters.setSubjects}
          isLoading={subjectAggregate.isLoading}
        />
      )}

      {!isAllPrograms && !isRequiredStrategy && (
        <CategoryFilterPills
          rows={categoryAggregate.data?.category}
          selected={state.categories}
          onChange={filters.setCategories}
        />
      )}

      <div className="flex justify-end">
        <MyClassesOnlyToggle
          visible={Boolean(isTeacher)}
          value={state.my}
          onChange={filters.setMy}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/filter-bar.tsx
git commit -m "feat(academic-hub): filter bar composition with adaptive rows"
```

---

## Task 20: Course card v2

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/course-card.tsx`

- [ ] **Step 1: Implement the card**

```tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/course/status-badge";
import { courseType } from "@/types/course";
import { HubStatusFilter } from "@/types/academic-hub";

interface Props {
  course: courseType & {
    level?: { id: number; name: string } | null;
    section?: { id: number; name: string } | null;
    intake?: { id: number; name: string } | null;
    program?: { id: number; name: string; subject_strategy: string } | null;
    course_subjects?: { subject: { id: number; name: string } }[];
  };
  selectedStatuses: HubStatusFilter[];
  baseDetailsPath: string;
}

const MAX_SUBJECT_CHIPS = 3;

function Breadcrumb({ pieces }: { pieces: { id: string; label: string }[] }) {
  if (pieces.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground truncate">
      {pieces.map((p, idx) => (
        <span key={p.id}>
          {idx > 0 && <span className="px-1">·</span>}
          <span>{p.label}</span>
        </span>
      ))}
    </div>
  );
}

export function AcademicHubCourseCard({
  course,
  selectedStatuses,
  baseDetailsPath,
}: Props) {
  const breadcrumbPieces = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    if (course.program?.name) out.push({ id: "program", label: course.program.name });
    if (course.level?.name) out.push({ id: "level", label: course.level.name });
    if (course.section?.name) out.push({ id: "section", label: course.section.name });
    return out;
  }, [course.program, course.level, course.section]);

  const subjectChips = useMemo(() => {
    const strategy = course.program?.subject_strategy ?? "none";
    if (strategy === "required" && (course as any).subject?.name) {
      return [{ id: "subject", name: (course as any).subject.name }];
    }
    if (strategy === "multi" && course.course_subjects?.length) {
      return course.course_subjects
        .map((cs) => cs.subject)
        .filter(Boolean)
        .map((s) => ({ id: String(s.id), name: s.name }));
    }
    if (strategy === "optional" && (course as any).subject?.name) {
      return [{ id: "subject", name: (course as any).subject.name }];
    }
    return [];
  }, [course]);

  const truncatedSubjectChips =
    subjectChips.length > MAX_SUBJECT_CHIPS
      ? subjectChips.slice(0, MAX_SUBJECT_CHIPS)
      : subjectChips;
  const overflowCount = subjectChips.length - truncatedSubjectChips.length;

  const matchedOutside =
    selectedStatuses.length > 0 &&
    !selectedStatuses.includes(course.status as HubStatusFilter);

  return (
    <Link
      href={`${baseDetailsPath}/${course.id}?ref=/courses`}
      className="block"
    >
      <Card className="p-4 space-y-3 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <Breadcrumb pieces={breadcrumbPieces} />
          <StatusBadge status={course.status} />
        </div>

        <div className="space-y-0.5">
          <div className="text-base font-semibold leading-snug line-clamp-2">
            {course.title}
          </div>
          {course.code && (
            <div className="text-xs text-muted-foreground font-mono">
              {course.code}
            </div>
          )}
          {matchedOutside && (
            <div className="pt-1">
              <Badge variant="outline" className="text-xs opacity-70">
                Matched outside {selectedStatuses.join(", ")}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {truncatedSubjectChips.map((s) => (
            <Badge key={s.id} variant="secondary">
              {s.name}
            </Badge>
          ))}
          {overflowCount > 0 && (
            <Badge variant="outline">+{overflowCount} more</Badge>
          )}
          {(course as any).category?.name && (
            <Badge variant="outline">{(course as any).category.name}</Badge>
          )}
          {course.intake?.name && (
            <span className="ml-auto text-muted-foreground">
              {course.intake.name}
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground space-y-0.5">
          {course.time_pattern && <div>{course.time_pattern}</div>}
          {(course as any).primary_teacher?.name && (
            <div>
              {(course as any).primary_teacher.name}
              {typeof course.student_count === "number" && (
                <> · {course.student_count} students</>
              )}
              {typeof course.teacher_count === "number" && (
                <> · {course.teacher_count} teachers</>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
```

> The exact shape of `time_pattern`, `primary_teacher`, and the count fields differs between server responses; mirror the access patterns already used in `src/components/course/course-card.tsx` if anything is missing.

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/course-card.tsx
git commit -m "feat(academic-hub): course card v2 with breadcrumb + conditional subject chips"
```

---

## Task 21: Empty states

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/empty-state.tsx`

- [ ] **Step 1: Implement the empty-state component**

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  HubStatusFilter,
  HubStatusAggregate,
} from "@/types/academic-hub";

type EmptyVariant =
  | { kind: "no-results-status"; programName?: string; counts: HubStatusAggregate }
  | { kind: "no-search-results"; q: string }
  | { kind: "no-courses-yet"; programName?: string };

interface Props {
  variant: EmptyVariant;
  onBroadenStatus?: (status: HubStatusFilter) => void;
  onClearSearch?: () => void;
}

export function AcademicHubEmptyState({
  variant,
  onBroadenStatus,
  onClearSearch,
}: Props) {
  if (variant.kind === "no-results-status") {
    const programLabel = variant.programName ? variant.programName : "this program";
    const others: { status: HubStatusFilter; count: number }[] = [
      { status: "planned", count: variant.counts.planned },
      { status: "ended", count: variant.counts.ended },
    ].filter((c) => c.count > 0);
    return (
      <div className="border rounded-lg p-8 text-center space-y-3">
        <p className="text-base">No active courses in {programLabel}.</p>
        {others.length > 0 && (
          <div className="flex justify-center gap-2 flex-wrap">
            {others.map((c) => (
              <Button
                key={c.status}
                variant="outline"
                size="sm"
                onClick={() => onBroadenStatus?.(c.status)}
              >
                Show {c.status} ({c.count})
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (variant.kind === "no-search-results") {
    return (
      <div className="border rounded-lg p-8 text-center space-y-3">
        <p className="text-base">Nothing matches "{variant.q}".</p>
        <Button variant="outline" size="sm" onClick={onClearSearch}>
          Clear search
        </Button>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-8 text-center space-y-3">
      <p className="text-base">
        {variant.programName ?? "This program"} has no courses yet.
      </p>
      <Link
        href="/courses/create"
        className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm"
      >
        + Add classes
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/empty-state.tsx
git commit -m "feat(academic-hub): filter-aware empty states"
```

---

## Task 22: `CourseGrid`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/course-grid.tsx`

- [ ] **Step 1: Implement the grid**

```tsx
"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { AcademicHubCourseCard } from "./course-card";
import { HubStatusFilter } from "@/types/academic-hub";
import { courseType } from "@/types/course";

interface Props {
  rows: courseType[];
  selectedStatuses: HubStatusFilter[];
  isLoading: boolean;
}

export function CourseGrid({ rows, selectedStatuses, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((course) => (
        <AcademicHubCourseCard
          key={course.id}
          course={course as any}
          selectedStatuses={selectedStatuses}
          baseDetailsPath="/courses"
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/course-grid.tsx
git commit -m "feat(academic-hub): responsive course grid + skeleton"
```

---

## Task 23: `AcademicHubPage` and `/courses` rewrite

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/academic-hub/academic-hub-page.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/courses/page.tsx`

- [ ] **Step 1: Implement `AcademicHubPage`**

```tsx
"use client";

import { useMemo, useEffect } from "react";
import { useUser } from "@/hooks/useUser";
import { useHubFilters } from "@/hooks/academic-hub/use-hub-filters";
import { useHubPrograms } from "@/hooks/academic-hub/use-programs";
import { useHubCourses } from "@/hooks/academic-hub/use-hub-courses";
import { useHubAggregate } from "@/hooks/academic-hub/use-hub-aggregate";
import { AcademicHubHeader } from "./academic-hub-header";
import { AcademicHubFilterBar } from "./filter-bar/filter-bar";
import { CourseGrid } from "./course-grid";
import { AcademicHubEmptyState } from "./empty-state";
import { HUB_PROGRAM_ALL } from "@/types/academic-hub";

export function AcademicHubPage() {
  const filters = useHubFilters();
  const { state } = filters;
  const { data: programs = [], isLoading: isProgramsLoading } = useHubPrograms();
  const { user, isTeacher } = useUser();
  const userId = user?.id ?? 0;

  useEffect(() => {
    // Default "my" to ON for teacher users on first load.
    if (isTeacher && state.my === false) {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("my")) filters.setMy(true);
    }
  }, [isTeacher]); // intentional: only on first mount

  // If no program param yet and there's exactly one program, lock to it.
  useEffect(() => {
    if (!isProgramsLoading && programs.length === 1 && state.program === HUB_PROGRAM_ALL) {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("program")) {
        filters.setProgram(String(programs[0].id));
      }
    }
  }, [isProgramsLoading, programs, state.program]);

  const selectedProgram = useMemo(
    () => programs.find((p) => String(p.id) === state.program),
    [programs, state.program],
  );

  const list = useHubCourses({ state, userId, program: selectedProgram });

  const statusAggregate = useHubAggregate({
    facet: "status",
    state,
    userId,
  });

  const totalAcrossStatuses = useMemo(() => {
    const c = statusAggregate.data?.status;
    if (!c) return 0;
    return c.active + c.planned + c.ended + c.paused;
  }, [statusAggregate.data]);

  const isEmpty = !list.isLoading && (list.data?.rows.length ?? 0) === 0;

  return (
    <div className="space-y-4 mt-3">
      <AcademicHubHeader programs={programs} />
      <AcademicHubFilterBar programs={programs} />

      {isEmpty && state.q ? (
        <AcademicHubEmptyState
          variant={{ kind: "no-search-results", q: state.q }}
          onClearSearch={() => filters.setQ("")}
        />
      ) : isEmpty && totalAcrossStatuses === 0 ? (
        <AcademicHubEmptyState
          variant={{
            kind: "no-courses-yet",
            programName: selectedProgram?.name,
          }}
        />
      ) : isEmpty && statusAggregate.data?.status ? (
        <AcademicHubEmptyState
          variant={{
            kind: "no-results-status",
            programName: selectedProgram?.name,
            counts: statusAggregate.data.status,
          }}
          onBroadenStatus={(s) => filters.setStatus([...state.status, s])}
        />
      ) : (
        <CourseGrid
          rows={list.data?.rows ?? []}
          selectedStatuses={state.status}
          isLoading={list.isLoading}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `/courses/page.tsx`**

Replace `schedjuice-reimagined-fe/src/app/(internal)/courses/page.tsx` with:

```tsx
"use client";

import { AcademicHubPage } from "@/components/academic-hub/academic-hub-page";

export default function CoursesRoute() {
  return <AcademicHubPage />;
}
```

- [ ] **Step 3: Smoke check the build**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit`

Expected: no new TypeScript errors. Run `pnpm dev` and visit `http://localhost:3000/courses` (or whatever port is configured); confirm the page renders.

- [ ] **Step 4: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/academic-hub-page.tsx \
        schedjuice-reimagined-fe/src/app/\(internal\)/courses/page.tsx
git commit -m "feat(academic-hub): page composition replaces legacy DataTable list"
```

---

## Task 24: Sidebar cleanup

**Files:**
- Modify: `schedjuice-reimagined-fe/src/config/nav-routes.tsx`

- [ ] **Step 1: Inspect current entries**

Open `nav-routes.tsx` and find:
- The `Quick Links` section's `Courses` entry — remove it.
- The Management section's `Courses` entry — change its label string to `Academic Hub`. Keep `href`, `icon`, `allowedRoles`, and any `canShow` predicate unchanged.

- [ ] **Step 2: Make the edits**

Sample diff hunks (adjust property names to match the actual file):

```tsx
// Before
const quickLinks: NavRoute[] = [
  { label: "Shortcuts", href: "/shortcuts", icon: Star, allowedRoles: [...] },
  { label: "Courses", href: "/courses", icon: BookOpen, allowedRoles: [...] },
];

// After
const quickLinks: NavRoute[] = [
  { label: "Shortcuts", href: "/shortcuts", icon: Star, allowedRoles: [...] },
];
```

```tsx
// Before
{ label: "Courses", href: "/courses", icon: BookOpen, allowedRoles: [...] }

// After
{ label: "Academic Hub", href: "/courses", icon: BookOpen, allowedRoles: [...] }
```

- [ ] **Step 3: Verify in dev**

Run `pnpm dev` and check the sidebar in two roles (admin and teacher-only). Confirm only one `Academic Hub` entry exists, that the URL still routes to `/courses`, and that no other sidebar references the old label.

- [ ] **Step 4: Commit**

```bash
git add schedjuice-reimagined-fe/src/config/nav-routes.tsx
git commit -m "chore(nav): remove Quick Links courses; rename Management entry to Academic Hub"
```

---

## Task 25: End-to-end acceptance walkthrough

**Files:** none (manual verification).

- [ ] **Step 1: Backend tests are green**

Run: `cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_course_search_fuzzy app_course.tests.test_course_aggregate -v 2`

Expected: all tests PASS.

- [ ] **Step 2: Frontend tests are green**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/helpers/academic-hub`

Expected: all PASS.

- [ ] **Step 3: Walk through the spec acceptance checks**

Manually verify each item in spec §14 against a dev environment:

1. Single-program tenant: visit `/courses`, header shows program name, status chips show counts, typo finds the course.
2. Multi-program tenant: program chips appear; clicking one resets sub-filters; adaptive rows show.
3. Search override: ended course title found while only Active chip selected; card shows `Matched outside [active]` pill.
4. My classes only: manager-who-teaches sees toggle defaulted ON.
5. Card v2: each card shows breadcrumb, title, code, conditional subject chips, category chip, intake (when applicable), schedule, people row.
6. Empty state: pick a status with no results; broadening CTA appears.
7. Sidebar: `Courses` is gone from Quick Links; Management entry reads `Academic Hub`.
8. URL state: every filter writes URL; refresh restores view; back button steps through.

- [ ] **Step 4: Final commit (optional)**

If any small fixes surface during walkthrough, batch them into a single commit:

```bash
git add -A
git commit -m "fix(academic-hub): acceptance walkthrough adjustments"
```
