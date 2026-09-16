# School Overview Table UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix school overview course-name visibility, add MT column, backend search/pagination/sorting, month snapshot caching with check-in invalidation, and ResourceTable UX.

**Architecture:** Compute the full tenant-month overview once (existing tr.phillips path), enrich rows with code/subject/MT, cache under `school-overview:{schema}:{YYYY-MM}`, then filter/sort/paginate in process. Invalidate that key when the month’s check-in data (or searchable course/MT metadata) changes. FE uses ResourceTable + debounced search; cards always use full-month `grand_aggregate`.

**Tech Stack:** Django cache, `app_course.course_search` / entity search helpers, React Query, nuqs, `ResourceTable` / `useResourceTableState`, `use-debounce` (200ms).

**Spec:** `docs/superpowers/specs/2026-07-20-school-overview-table-ux-design.md`

## Global Constraints

- Ship FE and BE together (default page size 20 breaks old “full list” clients).
- Cards ignore `q`; table uses filtered `count`.
- Cache key prefix: `school-overview:{tenant_schema}:{YYYY-MM}`.
- TTL safety net: 24h (`86400`); correctness via invalidation.
- Search fields: title, code, subject name(s), MT name(s).
- Sortable: `course_title`, `mt_name`, `total_income`, `total_expense`, `total_profit`.
- MT = Main Teacher (`AssignedAsRole.Seniority.MAIN_TEACHER`), comma-joined.
- Backend tests: always `--keepdb --noinput` via `./scripts/run_backend_tests.sh`.
- Do not rewrite tr.phillips math.

## File structure

| File | Responsibility |
| --- | --- |
| `schedjuice-reimagined-be/app_hr/school_overview_cache.py` | Cache key, get/set, invalidate helpers (never raise) |
| `schedjuice-reimagined-be/app_hr/school_overview_query.py` | Enrich rows; filter/sort/paginate snapshot; search helpers |
| `schedjuice-reimagined-be/app_hr/school_overview_invalidation.py` | Derive months from UserEvent / course metadata; call cache invalidate |
| `schedjuice-reimagined-be/app_hr/signals.py` | Wire post_save/post_delete (and bulk hooks) to invalidation |
| `schedjuice-reimagined-be/app_hr/apps.py` / `__init__` | Import signals on app ready |
| `schedjuice-reimagined-be/app_hr/payroll_funcs.py` | Extend snapshot build with enrich fields (or call enrich from query module) |
| `schedjuice-reimagined-be/app_hr/views.py` | Accept `q`/`page`/`size`/`sorts`; return `count`; use cache path |
| `schedjuice-reimagined-be/app_hr/tests/test_school_overview_cache.py` | Cache get-or-set + invalidate unit tests |
| `schedjuice-reimagined-be/app_hr/tests/test_school_overview_query.py` | Filter/sort/page + MT enrich unit tests |
| `schedjuice-reimagined-be/app_hr/tests/test_school_overview_api.py` | API integration (pagination, search, grand_aggregate, permission) |
| `schedjuice-reimagined-fe/src/types/finance/cash-flow.ts` | Extended request/response types |
| `schedjuice-reimagined-fe/src/app/(internal)/finances/school-overview/page.tsx` | ResourceTable UI, URL state, empty states |

---

### Task 1: School overview cache helpers

**Files:**
- Create: `schedjuice-reimagined-be/app_hr/school_overview_cache.py`
- Test: `schedjuice-reimagined-be/app_hr/tests/test_school_overview_cache.py`

**Interfaces:**
- Produces:
  - `SCHOOL_OVERVIEW_CACHE_TTL = 86400`
  - `school_overview_cache_key(schema_name: str, year: int, month: int) -> str`
  - `get_school_overview_snapshot(schema_name: str, year: int, month: int) -> dict | None`
  - `set_school_overview_snapshot(schema_name: str, year: int, month: int, snapshot: dict) -> None`
  - `invalidate_school_overview_cache(schema_name: str, year: int, month: int) -> None`

- [ ] **Step 1: Write the failing tests**

```python
# app_hr/tests/test_school_overview_cache.py
from django.core.cache import cache
from django.test import SimpleTestCase

from app_hr.school_overview_cache import (
    get_school_overview_snapshot,
    invalidate_school_overview_cache,
    school_overview_cache_key,
    set_school_overview_snapshot,
)


class SchoolOverviewCacheTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_key_format(self):
        self.assertEqual(
            school_overview_cache_key("acme", 2026, 7),
            "school-overview:acme:2026-07",
        )

    def test_set_get_roundtrip(self):
        snap = {"courses": [{"course_id": 1}], "grand_aggregate": {"total_income": "1.00"}}
        set_school_overview_snapshot("acme", 2026, 7, snap)
        self.assertEqual(get_school_overview_snapshot("acme", 2026, 7), snap)

    def test_invalidate_removes_key(self):
        set_school_overview_snapshot("acme", 2026, 7, {"courses": []})
        invalidate_school_overview_cache("acme", 2026, 7)
        self.assertIsNone(get_school_overview_snapshot("acme", 2026, 7))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_hr.tests.test_school_overview_cache`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement cache module**

```python
# app_hr/school_overview_cache.py
from __future__ import annotations

import logging
from typing import Any, Optional

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

SCHOOL_OVERVIEW_CACHE_TTL = getattr(
    settings, "SCHOOL_OVERVIEW_CACHE_TTL", 86400
)


def school_overview_cache_key(schema_name: str, year: int, month: int) -> str:
    return f"school-overview:{schema_name}:{year:04d}-{month:02d}"


def get_school_overview_snapshot(
    schema_name: str, year: int, month: int
) -> Optional[dict[str, Any]]:
    key = school_overview_cache_key(schema_name, year, month)
    try:
        value = cache.get(key)
        return value if isinstance(value, dict) else None
    except Exception:
        logger.exception("school_overview_cache: get failed key=%s", key)
        return None


def set_school_overview_snapshot(
    schema_name: str, year: int, month: int, snapshot: dict[str, Any]
) -> None:
    key = school_overview_cache_key(schema_name, year, month)
    try:
        cache.set(key, snapshot, timeout=SCHOOL_OVERVIEW_CACHE_TTL)
    except Exception:
        logger.exception("school_overview_cache: set failed key=%s", key)


def invalidate_school_overview_cache(
    schema_name: str, year: int, month: int
) -> None:
    key = school_overview_cache_key(schema_name, year, month)
    try:
        cache.delete(key)
    except Exception:
        logger.exception("school_overview_cache: delete failed key=%s", key)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_hr.tests.test_school_overview_cache`

Expected: PASS

- [ ] **Step 5: Commit (BE)**

```bash
cd schedjuice-reimagined-be
git add app_hr/school_overview_cache.py app_hr/tests/test_school_overview_cache.py
git commit -m "$(cat <<'EOF'
feat(hr): add school overview month cache helpers

EOF
)"
```

---

### Task 2: Snapshot enrich + filter/sort/paginate (pure query layer)

**Files:**
- Create: `schedjuice-reimagined-be/app_hr/school_overview_query.py`
- Modify: `schedjuice-reimagined-be/app_hr/payroll_funcs.py` (`get_school_overview_trphillips` row shape)
- Test: `schedjuice-reimagined-be/app_hr/tests/test_school_overview_query.py`

**Interfaces:**
- Consumes: Course / UserCourse / AssignedAsRole models; `apply_entity_search` / course search registration from `app_course.course_search`
- Produces:
  - `enrich_school_overview_courses(course_rows: list[dict]) -> list[dict]`
  - `filter_school_overview_courses(courses: list[dict], q: str) -> list[dict]`
  - `sort_school_overview_courses(courses: list[dict], sorts: list[str] | None) -> list[dict]`
  - `paginate_school_overview_courses(courses: list[dict], page: int, size: int) -> tuple[list[dict], int]`
  - `ALLOWED_SORT_FIELDS = frozenset({...})`

Row fields after enrich: `course_id`, `course_title`, `course_code`, `subject_names`, `mt_name`, money totals.

- [ ] **Step 1: Write failing unit tests for filter/sort/page (no DB)**

```python
# app_hr/tests/test_school_overview_query.py
from django.test import SimpleTestCase

from app_hr.school_overview_query import (
    filter_school_overview_courses,
    paginate_school_overview_courses,
    sort_school_overview_courses,
)


def _row(**kwargs):
    base = {
        "course_id": 1,
        "course_title": "IELTS Morning",
        "course_code": "IEL-01",
        "subject_names": "English",
        "mt_name": "Aung Aung, Mya Mya",
        "total_income": "100.00",
        "total_expense": "40.00",
        "total_profit": "60.00",
    }
    base.update(kwargs)
    return base


class FilterSortPageTests(SimpleTestCase):
    def test_filter_matches_mt_and_subject(self):
        rows = [
            _row(course_id=1, mt_name="Aung Aung", subject_names="Math"),
            _row(course_id=2, course_title="Other", mt_name="Zaw", subject_names="Physics"),
        ]
        self.assertEqual(
            [r["course_id"] for r in filter_school_overview_courses(rows, "aung")],
            [1],
        )
        self.assertEqual(
            [r["course_id"] for r in filter_school_overview_courses(rows, "phys")],
            [2],
        )

    def test_sort_profit_desc(self):
        rows = [
            _row(course_id=1, total_profit="10.00"),
            _row(course_id=2, total_profit="30.00"),
        ]
        out = sort_school_overview_courses(rows, ["-total_profit"])
        self.assertEqual([r["course_id"] for r in out], [2, 1])

    def test_paginate(self):
        rows = [_row(course_id=i) for i in range(1, 6)]
        page, count = paginate_school_overview_courses(rows, page=2, size=2)
        self.assertEqual(count, 5)
        self.assertEqual([r["course_id"] for r in page], [3, 4])
```

- [ ] **Step 2: Run to verify fail**

Run: `./scripts/run_backend_tests.sh app_hr.tests.test_school_overview_query`

Expected: FAIL (import error)

- [ ] **Step 3: Implement `school_overview_query.py`**

Implement:

1. **`filter_school_overview_courses(courses, q)`**
   - Blank `q` → return all.
   - Case-insensitive substring match against `course_title`, `course_code`, `subject_names`, `mt_name`.
   - Additionally: if `q` strips to nonempty, resolve matching IDs via Academic Hub search on `Course.objects.filter(id__in=snapshot_ids)` using `apply_entity_search` / registered `course` search (`from utilitas.search import apply_entity_search` and `COURSE_SEARCH_KEY` from `app_course.course_search`). Union those IDs with substring matches. If DB search fails, fall back to substring-only (log warning).

2. **`sort_school_overview_courses(courses, sorts)`**
   - Default `["course_title"]`.
   - Support only allowed fields; ignore unknown.
   - Money fields: sort by `Decimal(str(value))`.
   - Strings: case-insensitive.

3. **`paginate_school_overview_courses(courses, page, size)`**
   - Clamp `page >= 1`, `1 <= size <= 100`, default size 20.
   - Return `(slice, len(courses))`.

4. **`enrich_school_overview_courses(course_rows)`** (DB)
   - Input rows have at least `course_id` + money + maybe `course_title`.
   - Batch-load `Course` for `id`, `title`, `code`, primary `subject__name`, and `CourseSubject` names if used.
   - Batch-load Main Teachers:

```python
from app_course.models import AssignedAsRole, UserCourse
from django.db.models import Prefetch

# UserCourse where assigned_as_role__seniority == MAIN_TEACHER
# group names by course_id, join with ", "
```

   - Set `subject_names` comma-joined (primary subject + extra course subjects, de-duped, sorted or stable order).
   - Preserve money fields; prefer Course.title when present.

- [ ] **Step 4: Extend `get_school_overview_trphillips` to call enrich before return**

In `payroll_funcs.get_school_overview_trphillips`, after building `courses_out`, call `enrich_school_overview_courses(courses_out)` so every snapshot row has the new fields. Keep grand_aggregate logic unchanged.

- [ ] **Step 5: Add a DB test for enrich (tenant test case pattern from `app_hr/tests/test_rbac_hr.py`)**

Minimal: create Course + MAIN_TEACHER UserCourse, call enrich, assert `mt_name` contains teacher name.

- [ ] **Step 6: Run tests**

Run: `./scripts/run_backend_tests.sh app_hr.tests.test_school_overview_query`

Expected: PASS

- [ ] **Step 7: Commit (BE)**

```bash
git add app_hr/school_overview_query.py app_hr/payroll_funcs.py app_hr/tests/test_school_overview_query.py
git commit -m "$(cat <<'EOF'
feat(hr): enrich school overview rows and add filter/sort/page

EOF
)"
```

---

### Task 3: Wire cached + query overview into the API view

**Files:**
- Modify: `schedjuice-reimagined-be/app_hr/views.py` (`SchoolOverviewTrPhillipsView`)
- Optionally thin helper in `school_overview_query.py`: `get_school_overview_response(schema_name, timezone_code, month, year, q, page, size, sorts) -> dict`
- Test: `schedjuice-reimagined-be/app_hr/tests/test_school_overview_api.py`

**Interfaces:**
- Consumes: cache helpers, `get_school_overview_trphillips`, filter/sort/paginate
- Produces response keys: `courses`, `count`, `grand_aggregate`, `is_ongoing_month`

- [ ] **Step 1: Write API tests (tenant + RBAC patterns from `test_rbac_hr.py`)**

Cover:

1. Response includes `count` and enriched fields.
2. `page`/`size` slice courses; `grand_aggregate` identical across pages.
3. `q` filters; `grand_aggregate` still full-month (seed two courses, search one).
4. Second identical request does not call compute again (patch `get_school_overview_trphillips`, assert call_count == 1 across two POSTs).
5. After `invalidate_school_overview_cache`, compute runs again.
6. Permission: still requires `analytics.view` (mirror existing HR RBAC test style).

Use `schema_context(self.schema_name)` and authenticated client with analytics permission like other HR tests. If full cash-flow fixture setup is heavy, patch `get_school_overview_trphillips` to return a fixed snapshot for pagination/search/cache tests, and keep one lighter integration path if fixtures already exist.

Example cache spy test shape:

```python
from unittest.mock import patch
from django.core.cache import cache

@patch("app_hr.views.get_school_overview_trphillips")
def test_second_request_uses_cache(self, mock_compute):
    cache.clear()
    mock_compute.return_value = {
        "courses": [
            {
                "course_id": 1,
                "course_title": "A",
                "course_code": "A1",
                "subject_names": "Math",
                "mt_name": "T",
                "total_income": "10.00",
                "total_expense": "4.00",
                "total_profit": "6.00",
            }
        ],
        "grand_aggregate": {
            "total_income": "10.00",
            "total_expense": "4.00",
            "total_profit": "6.00",
        },
    }
    url = "/api/v1/cash-flow/trphillips/school-overview"
    body = {"month": 7, "year": 2026}
    # POST twice with analytics.view user
    self.assertEqual(mock_compute.call_count, 1)
```

- [ ] **Step 2: Run to verify fail**

Run: `./scripts/run_backend_tests.sh app_hr.tests.test_school_overview_api`

Expected: FAIL (missing count / cache behavior)

- [ ] **Step 3: Implement response helper + view**

```python
# app_hr/school_overview_query.py (add)
def build_school_overview_payload(
    *,
    schema_name: str,
    timezone_code: str,
    month: int,
    year: int,
    q: str = "",
    page: int = 1,
    size: int = 20,
    sorts: list[str] | None = None,
) -> dict:
    snapshot = get_school_overview_snapshot(schema_name, year, month)
    if snapshot is None:
        snapshot = get_school_overview_trphillips(month, year, timezone_code)
        # ensure enrich ran inside get_school_overview_trphillips
        set_school_overview_snapshot(schema_name, year, month, {
            "courses": snapshot["courses"],
            "grand_aggregate": snapshot["grand_aggregate"],
        })
    courses = filter_school_overview_courses(snapshot["courses"], q)
    courses = sort_school_overview_courses(courses, sorts)
    page_rows, count = paginate_school_overview_courses(courses, page, size)
    return {
        "courses": page_rows,
        "count": count,
        "grand_aggregate": snapshot["grand_aggregate"],
    }
```

In `SchoolOverviewTrPhillipsView.post`:

- Parse `q` (str), `page` (int default 1), `size` (int default 20, max 100), `sorts` (list from body; also accept comma-separated string).
- `schema_name = connection.schema_name` (or `request.tenant.schema_name` — use the same field other tenant code uses).
- Call `build_school_overview_payload(...)`.
- Attach `is_ongoing_month` as today.

- [ ] **Step 4: Run tests**

Run: `./scripts/run_backend_tests.sh app_hr.tests.test_school_overview_api app_hr.tests.test_school_overview_cache app_hr.tests.test_school_overview_query`

Expected: PASS

- [ ] **Step 5: Commit (BE)**

```bash
git commit -m "$(cat <<'EOF'
feat(hr): paginate/search/sort school overview from month cache

EOF
)"
```

---

### Task 4: Invalidate cache on check-in and metadata writes

**Files:**
- Create: `schedjuice-reimagined-be/app_hr/school_overview_invalidation.py`
- Create: `schedjuice-reimagined-be/app_hr/signals.py`
- Modify: `schedjuice-reimagined-be/app_hr/apps.py` (ensure `ready()` imports signals)
- Modify write sites if signals miss bulk paths: `app_attendance/views.py` bulk_update; `app_course/views.py` `UserEventDetailsView` if it bypasses `save()`
- Test: `schedjuice-reimagined-be/app_hr/tests/test_school_overview_invalidation.py`

**Interfaces:**
- Produces:
  - `invalidate_school_overview_for_event_date(schema_name, timezone_code, event_date) -> None`
  - `invalidate_school_overview_for_user_event(user_event, schema_name, timezone_code) -> None`
  - `invalidate_school_overview_current_month(schema_name, timezone_code) -> None`

- [ ] **Step 1: Write failing tests**

```python
# Unit-level: mock invalidate_school_overview_cache and assert month derivation
# Integration-level: set cache snapshot for month M, update UserEvent checkin via ORM save(),
# assert get_school_overview_snapshot returns None
```

Derive month using tenant timezone: convert `user_event.event.date` to local date → `(year, month)`.

- [ ] **Step 2: Implement invalidation helpers**

```python
def invalidate_school_overview_for_user_event(user_event, schema_name, timezone_code):
    event = getattr(user_event, "event", None)
    if event is None or getattr(event, "date", None) is None:
        invalidate_school_overview_current_month(schema_name, timezone_code)
        return
    # localize event.date with zoneinfo / existing payroll date helpers
    local = ...
    invalidate_school_overview_cache(schema_name, local.year, local.month)
```

- [ ] **Step 3: Wire signals**

```python
# app_hr/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.db import connection

@receiver(post_save, sender=UserEvent)  # correct app label for UserEvent model
@receiver(post_delete, sender=UserEvent)
def _invalidate_overview_on_user_event(sender, instance, **kwargs):
    schema = connection.schema_name
    # timezone: Organization.objects.get_current or connection.tenant.timezone
    invalidate_school_overview_for_user_event(instance, schema, timezone_code)
```

Also connect:

- `UserCourse` post_save/post_delete when `assigned_as_role.seniority == MAIN_TEACHER` → `invalidate_school_overview_current_month`
- `Course` post_save when `title`/`code`/`subject_id` in `update_fields` or full save → current month
- `CourseSubject` M2M through model save/delete → current month

For **bulk_update** in attendance that skips signals: after successful `bulk_update`, call invalidation for each distinct month in the batch (or current month if dates unavailable). Same for soft-delete helpers.

Never let invalidation raise into the request path (try/except + log).

- [ ] **Step 4: Run tests**

Run: `./scripts/run_backend_tests.sh app_hr.tests.test_school_overview_invalidation`

Expected: PASS

- [ ] **Step 5: Commit (BE)**

```bash
git commit -m "$(cat <<'EOF'
feat(hr): invalidate school overview cache on check-in edits

EOF
)"
```

---

### Task 5: Frontend types + fetch contract

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/finance/cash-flow.ts`
- Optional create: `schedjuice-reimagined-fe/src/app/client-api/school-overview.ts` if other finance clients keep fetch helpers separate

**Interfaces:**
- Produces updated `SchoolOverviewRequestBody` and `SchoolOverviewCourse` / `SchoolOverviewPayload` with `count`

- [ ] **Step 1: Update types**

```ts
export type SchoolOverviewRequestBody = {
  month: number;
  year: number;
  q?: string;
  page?: number;
  size?: number;
  sorts?: string[];
};

export type SchoolOverviewCourse = {
  course_id: number;
  course_title: string;
  course_code?: string | null;
  subject_names?: string;
  mt_name?: string;
  total_income: UsdDecimalString;
  total_expense: UsdDecimalString;
  total_profit: UsdDecimalString;
};

export type SchoolOverviewPayload = {
  courses: SchoolOverviewCourse[];
  count: number;
  grand_aggregate: CashFlowAggregate;
  is_ongoing_month?: boolean;
};
```

Update `getSchoolOverviewPayload` in the page (Task 6) to read `count` from top-level or nested `data`.

- [ ] **Step 2: Commit (FE)**

```bash
cd schedjuice-reimagined-fe
git add src/types/finance/cash-flow.ts
git commit -m "$(cat <<'EOF'
feat(finance): extend school overview types for search and pagination

EOF
)"
```

---

### Task 6: School overview page UX (ResourceTable)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/finances/school-overview/page.tsx`
- Reference patterns: `finances/checkin-histories/page.tsx`, `academic-hub-toolbar.tsx` (200ms debounce), `components/data-table/parts/pagination.tsx`

**Interfaces:**
- Consumes: new API body fields; `ResourceTable` or `Table` + `Pagination` + sort handlers from data-table
- URL: `date` (existing) + `q`, `page`, `sorts` via nuqs (`parseAsString`, `parseAsInteger`, `parseAsArrayOf`)

- [ ] **Step 1: Wire URL state and query**

```tsx
const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
const [sorts, setSorts] = useQueryState(
  "sorts",
  parseAsArrayOf(parseAsString).withDefault(["course_title"]),
);

const [draftQ, setDraftQ] = useState(q);
const setQDebounced = useDebouncedCallback((value: string) => {
  void setQ(value);
  void setPage(1);
}, 200);

const overviewQuery = useQuery({
  queryKey: [
    "schoolOverviewTrphillips",
    date.getFullYear(),
    date.getMonth() + 1,
    q,
    page,
    20,
    sorts,
  ],
  placeholderData: keepPreviousData, // or keepPreviousData from @tanstack/react-query v4/v5 equivalent
  enabled: allowed,
  queryFn: async () => {
    const body: SchoolOverviewRequestBody = {
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      q: q.trim() || undefined,
      page,
      size: 20,
      sorts,
    };
    const res = await makePostRequest(
      "cash-flow/trphillips/school-overview",
      body,
    );
    return res.data as SchoolOverviewApiEnvelope;
  },
});
```

- [ ] **Step 2: Columns**

```tsx
{
  id: "course_title",
  header: "Course",
  accessor: (row) => row.course_title,
  enableSorting: true,
  sizing: { role: "prose", minWidth: "14rem" },
  sticky: "left",
  cell: ({ row }) => (
    <Link
      href={cashFlowHrefForCourse(row.course_id)}
      className="font-medium text-text-primary underline-offset-4 hover:underline"
    >
      {row.course_title || "Untitled course"}
    </Link>
  ),
},
{
  id: "mt_name",
  header: "MT name",
  accessor: (row) => row.mt_name || "",
  enableSorting: true,
  sizing: { role: "prose", minWidth: "10rem" },
  cell: ({ value }) => (
    <span className="text-text-primary">{value ? String(value) : "—"}</span>
  ),
},
// money columns: keep numeric sizing + enableSorting; ids must match API sort fields
```

Wire `sorts` / `onSortsChange` on `Table` or `ResourceTable` using existing `cycleColumnSorts` helper if present in data-table exports (same as check-in histories).

- [ ] **Step 3: Toolbar + layout**

- Keep `YearMonthSelector` in `FilterToolbar`; add search `Input` with Search icon (Academic Hub style).
- Reduce dead space: keep `PageContainer` `space-y-3`; ensure notes/banner block does not add extra large wrappers (remove any accidental `mt-8`/`py-8` between banner and cards if present).
- Always render `AggregateCards` when payload succeeds **even if filtered table is empty** but month has `count` of full snapshot… Spec: cards are full-month from `grand_aggregate`. If month has zero courses entirely, show empty state and skip cards (current behavior). If month has courses but search matches zero: **show cards + “No courses match your search” + clear search**.

```tsx
const count = payload?.count ?? 0;
const hasMonthData = Boolean(grandAggregate) && (
  // distinguish empty month vs empty search:
  // empty month: count===0 && !q
  // empty search: count===0 && q
);
```

Logic:

1. Loading → `ReportSkeleton` (tableColumns={5}).
2. Error → danger message (no stale cards).
3. Success && `count === 0` && !q.trim() → empty month message (under notes); no table.
4. Success otherwise → cards from `grand_aggregate`, then table OR search-empty message, then `<Pagination page={page} pageSize={20} totalCount={count} onPageChange={setPage} />`.

- [ ] **Step 4: Manual verify locally**

- Open `/finances/school-overview`, confirm course names visible and sticky.
- Search by MT / subject; cards unchanged; table filters.
- Sort profit; paginate; “Showing X–Y of Z” visible.

- [ ] **Step 5: Commit (FE)**

```bash
git commit -m "$(cat <<'EOF'
feat(finance): school overview search, sort, pagination, and MT column

EOF
)"
```

---

### Task 7: End-to-end verification + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-school-overview-table-ux-design.md` (Status → Approved / Implemented) in FE + BE + workspace copies

- [ ] **Step 1: Run BE regression set**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_hr.tests.test_school_overview_cache app_hr.tests.test_school_overview_query app_hr.tests.test_school_overview_api app_hr.tests.test_school_overview_invalidation app_hr.test_payroll_funcs_trphillips
```

Expected: PASS

- [ ] **Step 2: FE typecheck / targeted tests if present**

```bash
cd schedjuice-reimagined-fe
# use the repo's usual script, e.g.:
pnpm exec tsc --noEmit
# and any data-table tests if column sticky/sizing touched shared code
```

- [ ] **Step 3: Manual checklist**

- [ ] Course names readable on a narrow viewport
- [ ] Sticky course column while scrolling money columns
- [ ] Search title / code / subject / MT
- [ ] Cards ignore search
- [ ] Pagination + Showing X–Y of Z
- [ ] Sort all five columns
- [ ] Edit a check-in in that month → reload overview → numbers refresh (cache miss)
- [ ] Ongoing-month banner still shows for current month

- [ ] **Step 4: Commit doc status bump**

```bash
git commit -m "$(cat <<'EOF'
docs: mark school overview table UX spec implemented

EOF
)"
```

---

## Plan self-review

| Spec requirement | Task |
| --- | --- |
| Course name visibility (prose + contrast + sticky) | Task 6 |
| Backend search title/code/subject/MT + hub helpers | Task 2–3 |
| Pagination + Showing X–Y of Z | Task 3, 6 |
| Sorting all columns | Task 2–3, 6 |
| MT comma-joined | Task 2 |
| Month cache + year-month key | Task 1, 3 |
| Invalidate on check-in edit | Task 4 |
| Invalidate on MT/title/code/subject metadata | Task 4 |
| Cards always full-month | Task 3, 6 |
| Tighter spacing + empty states | Task 6 |
| Ship FE+BE together / default size 20 | Global + Task 3, 6 |
| No set-based rewrite | Non-goal; not tasked |

**Placeholder scan:** none intentional.  
**Type consistency:** sort field names `course_title` / `mt_name` / money fields match FE column `id`s and API `sorts`.
