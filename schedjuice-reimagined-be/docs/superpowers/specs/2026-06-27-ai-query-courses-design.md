# AI Query Courses — Design Spec

**Date:** 2026-06-27  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`  
**Approach:** Single `query_courses` tool (Approach 1 from brainstorming)

## 1. Summary

Extend the Telegram/web AI assistant with org-wide **filtered course lookup** so admins
can ask questions like:

- “How many KET courses do we have this month?” (count **and** course names)
- “What are the student numbers?” (grouped by category, e.g. KET 1: 30 students)
- “How many FM courses?” (when tenant enables FM/HM display)

This spec covers three coordinated pieces:

1. **FM/HM canonical helper** — consolidate on day `> 13` = HM (fix existing `< 10`
   usages).
2. **Category fuzzy search service** — same FTS + trigram pattern as courses/users.
3. **`query_courses` AI tool** — admin-only filtered listing with month, category,
   WE/WD, FM/HM, and denormalized student counts.

`count_organization` remains for simple unfiltered totals. `count_course_roster` remains
for live single-course roster counts.

---

## 2. Locked decisions (brainstorming)

| Topic | Decision |
| --- | --- |
| Access | Admin-only: `course.view_all` or `course.manage_all` |
| Month window | Calendar month in org timezone; courses overlapping `[first_day, last_day]` |
| Default month | Current org-local calendar month when user omits month |
| FM/HM rule | Day `≤ 13` = FM, day `> 13` = HM (`is_hm_course` rule) |
| FM/HM availability | Only when `Organization.is_fm_hm_course_display_enabled` |
| Student numbers (bulk) | Denormalized `Course.student_count` |
| Category matching | Fuzzy search service (FTS + trigram), ambiguous → lettered options |
| Names in count answers | Always list linked course titles when reporting counts |

Non-admins must **not** receive scoped substitute results (same as org-wide count tools).

---

## 3. FM/HM canonical helper

### 3.1 Problem

Two incompatible thresholds exist today:

| Location | FM rule | HM rule |
| --- | --- | --- |
| `app_finance/unpaid_helpers.py` | `start_date.day < 10` | `day ≥ 10` |
| `app_microsoft/announcement_helpers.py` | same | same |
| `app_microsoft/payment_assignment_helpers.is_hm_course` | `day ≤ 13` | `day > 13` |
| `app_reports/analytics_services.is_hm_course_start_day` | `day ≤ 13` | `day > 13` |

**Canonical rule (locked):** day `> 13` = HM.

### 3.2 New module

**Create:** `app_course/course_month_type.py`

```python
MONTH_TYPE_FM = "FM"
MONTH_TYPE_HM = "HM"
_VALID_MONTH_TYPES = frozenset({MONTH_TYPE_FM, MONTH_TYPE_HM})

def is_hm_start_day(day: int) -> bool: ...
def is_hm_course(course: Course) -> bool: ...
def month_type_for_course(course: Course) -> str: ...
def filter_queryset_by_month_type(qs: QuerySet, month_type: str) -> QuerySet: ...
```

### 3.3 Call-site updates

| File | Change |
| --- | --- |
| `app_microsoft/payment_assignment_helpers.py` | `is_hm_course` delegates to shared helper |
| `app_finance/unpaid_helpers.py` | Replace inline day `< 10` filters |
| `app_microsoft/announcement_helpers.py` | Replace inline day filters |
| `app_reports/analytics_services.py` | `is_hm_course_start_day` delegates to shared helper |

### 3.4 Tests

**Create:** `app_course/tests/test_course_month_type.py`

Boundary cases: days 10, 13, 14. Verify FM/HM queryset filters match
`is_hm_course`.

Update finance unpaid helper tests if they assert day-10 behavior.

---

## 4. Category fuzzy search service

### 4.1 Goal

Resolve category names like “KET”, “FCE Prep”, or partial fragments the same way
course/user search works — FTS first, trigram fallback, substring suggest.

### 4.2 Model changes

Add to `Category`:

| Field | Purpose |
| --- | --- |
| `search_text` | Optional denormalized text (may mirror `name` initially) |
| `search_vector` | Postgres generated `tsvector` from `name` + `description` |

Migration follows `0086_course_search_text_and_vector` pattern (immutable unaccent,
GIN index on `search_vector`).

### 4.3 Search module

**Create:** `app_course/category_search.py`

- Register `CATEGORY_SEARCH_KEY = "category"` via `utilitas.search.register_search`
- `EntitySearchConfig`: `vector_field="search_vector"`, `trigram_fields=("name",)`,
  `substring_field="name"`
- Settings in `schedjuice_backend/settings.py`:
  - `CATEGORY_SEARCH_TRIGRAM_THRESHOLD` (default `0.25`)
  - `CATEGORY_SEARCH_FALLBACK_MIN_RESULTS` (default `1`)

Exports:

```python
def apply_category_search_q_with_meta(qs, q) -> tuple[QuerySet, bool]: ...
def apply_category_search_q(qs, q) -> QuerySet: ...
def category_suggest_queryset(base_qs, q, limit=8) -> QuerySet: ...
```

### 4.4 API wiring

Update `CategorySearchView` queryset path to use `apply_category_search_q_with_meta`
when `q` is present (keep existing RBAC: `category.manage` on POST).

### 4.5 AI resolver

**Extend:** `app_ai/tools/resolve.py`

```python
def resolve_category(
    *,
    category_id: int | None,
    query: str | None,
    limit: int = 5,
) -> dict[str, Any]:
    # ok | not_found | ambiguous — same shape as resolve_staff_user candidates
```

Uses `Category.objects.all()` + `apply_category_search_q_with_meta` for query path.
Exactly one of `category_id` or `query` when category filter is requested.

---

## 5. `query_courses` tool

### 5.1 Purpose

**Use when:** Admin asks org-wide course questions filtered by month, category,
WE/WD, FM/HM, or wants student numbers across matching courses.

**Do not use when:**

- Simple unfiltered school-wide course total → `count_organization`
- Single course roster (live count) → `count_course_roster`
- Courses for a specific person → `list_user_courses`
- Text search for one course by title fragment → `search_courses`

### 5.2 Permission

`require_course_read_breadth(user)` — returns `permission_denied` for non-admins.

Queryset: `Course.objects.all()` (no `scope_courses_for_user` narrowing).

### 5.3 Parameters

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `year` | integer | no | org-local current year | Calendar month |
| `month` | integer (1–12) | no | org-local current month | Always applied |
| `category_id` | integer | no | — | From fuzzy resolve |
| `category_query` | string | no | — | Fuzzy category name |
| `course_type` | `"WD"` \| `"WE"` | no | — | Maps to `Course.course_type` |
| `month_type` | `"FM"` \| `"HM"` | no | — | Tenant-gated |
| `course_status` | status enum | no | `"active"` | Same as count tools |
| `group_by_category` | boolean | no | `true` | Group output for student-number answers |
| `limit` | integer | no | `50` | Max 50 |

Category filter: when provided, exactly one of `category_id` or `category_query`.
Omit both to include all categories.

### 5.4 Month bounds

Use `Organization.timezone` (fallback `UTC` if unset):

```python
from zoneinfo import ZoneInfo
tz = ZoneInfo(org.timezone or "UTC")
today = datetime.now(tz).date()
first_day = date(year, month, 1)
last_day = last_day_of_month(first_day)
```

Overlap filter (same as finance):

```python
qs.filter(start_date__lte=last_day, end_date__gte=first_day)
```

### 5.5 Filter pipeline

1. RBAC check
2. Resolve month year/month defaults from org timezone
3. If category filter requested → `resolve_category`; stop on error
4. Apply `course_status`
5. Apply month overlap
6. Apply `category_id` if set
7. Apply `course_type` if set (`WD` or `WE` only — not `OTHER`)
8. If `month_type` set:
   - If `not org.is_fm_hm_course_display_enabled` → `feature_disabled` error
   - Else `filter_queryset_by_month_type(qs, month_type)`
9. `select_related("category")`, order by `category__sort_order`, `category__name`, `title`
10. Fetch up to `limit + 1`; set `truncated` if exceeded

### 5.6 Response shape

Always return a **dict** (not list).

**Success (grouped):**

```json
{
  "count": 5,
  "month": {"year": 2026, "month": 6, "label": "June 2026"},
  "filters_applied": {
    "course_status": "active",
    "category": {"id": 3, "name": "KET"},
    "course_type": null,
    "month_type": "FM"
  },
  "group_by_category": true,
  "groups": [
    {
      "category": {"id": 3, "name": "KET"},
      "count": 2,
      "courses": [
        {
          "title": "KET 1",
          "student_count": 30,
          "url": "https://..."
        }
      ]
    }
  ],
  "truncated": false
}
```

**Flat mode** (`group_by_category=false`): include top-level `courses` array instead
of `groups` (same course row shape).

**Course row fields:**

- `title`, `student_count`, `url` (via `with_course_link`)
- Omit `id`, `code` unless needed internally (bot prompt says don’t show unless asked)

**Error responses:**

| Code | When |
| --- | --- |
| `permission_denied` | Non-admin |
| `not_found` | Category query matched nothing |
| `ambiguous` | Multiple category matches |
| `feature_disabled` | FM/HM requested but tenant flag off |
| `validation_error` | Bad args (both category_id and category_query, invalid month, etc.) |

### 5.7 Tool registration

**Create:** `app_ai/tools/query_courses.py`

**Register** in `app_ai/tools/registry.py` as `QUERY_COURSES_TOOL`.

Exposure: `read`, `always_available: false` (same as other read tools).

No `requires_feature` registry flag — FM/HM gating is runtime inside the tool.

### 5.8 Example query mapping

| User question | Tool args |
| --- | --- |
| “How many KET courses this month?” | `category_query="KET"`, defaults for month/status |
| “What are the student numbers?” | defaults (current month, active, grouped) |
| “How many FM courses in June?” | `month_type="FM"`, `month=6`, `year=2026` |
| “WD courses in PET category” | `category_query="PET"`, `course_type="WD"` |

Bot formats answer using `groups` — linked titles, student counts per line.

---

## 6. Prompt updates

**File:** `app_ai/prompts.py` — extend `PLATFORM_BASE_TEMPLATE`:

- Use `query_courses` for filtered org-wide course questions (month, category,
  WE/WD, FM/HM, student numbers).
- When reporting counts from `query_courses`, always list course names (linked titles).
- Format student-number answers grouped by category using tool `groups`.
- Default to current calendar month when the user does not specify a month.
- Do not use FM/HM filters unless the user asks; if tool returns `feature_disabled`,
  explain FM/HM is not enabled for the school.

**Optional tenant context** in `app_ai/tenant_context.py`:

```
FM/HM course filters: enabled | disabled
```

---

## 7. Testing

**New/extended test files:**

| File | Coverage |
| --- | --- |
| `app_course/tests/test_course_month_type.py` | Canonical FM/HM boundaries |
| `app_course/tests/test_category_search.py` | FTS, trigram fallback, suggest |
| `app_ai/tests/test_query_courses.py` | Tool integration |
| `app_finance/tests/test_unpaid_helpers.py` | Update FM/HM boundary expectations |

**`query_courses` test matrix:**

| Case | Actor | Expected |
| --- | --- | --- |
| Current month overlap | Admin | Correct courses included/excluded by dates |
| Category fuzzy match | Admin | Resolves single category |
| Ambiguous category | Admin | `ambiguous` + candidates |
| WE / WD filter | Admin | Only matching `course_type` |
| FM filter (flag on) | Admin | Only FM courses |
| FM filter (flag off) | Admin | `feature_disabled` |
| Student counts | Admin | `student_count` from denormalized column |
| Group by category | Admin | Multiple groups when unfiltered |
| Truncation | Admin | `truncated: true` when > limit |
| Non-admin | Teacher | `permission_denied` |

Conventions: PostgreSQL, `xschedjuice` schema, `RBAC_ENFORCE=log_only`.

---

## 8. File map

| File | Action |
| --- | --- |
| `app_course/course_month_type.py` | Create |
| `app_course/category_search.py` | Create |
| `app_course/models.py` | Add Category search fields |
| `app_course/migrations/00xx_category_search.py` | Create |
| `app_course/views.py` | Wire CategorySearchView |
| `app_microsoft/payment_assignment_helpers.py` | Delegate `is_hm_course` |
| `app_finance/unpaid_helpers.py` | Use shared month type filter |
| `app_microsoft/announcement_helpers.py` | Use shared month type filter |
| `app_reports/analytics_services.py` | Delegate day helper |
| `app_ai/tools/resolve.py` | Add `resolve_category` |
| `app_ai/tools/query_courses.py` | Create tool |
| `app_ai/tools/registry.py` | Register tool |
| `app_ai/prompts.py` | Prompt guidance |
| `app_ai/tenant_context.py` | Optional FM/HM flag line |
| `schedjuice_backend/settings.py` | Category search settings |
| `app_course/tests/test_course_month_type.py` | Create |
| `app_course/tests/test_category_search.py` | Create |
| `app_ai/tests/test_query_courses.py` | Create |

---

## 9. Out of scope (v1)

- Teacher-scoped filtered course queries
- Live `UserCourse` counts in bulk listings
- Payment/billing month windows (only calendar overlap)
- Extending `count_organization` with structured filters
- Separate `search_categories` AI tool (resolve is internal to `query_courses`)
- Frontend UI changes beyond CategorySearchView using new search module

---

## 10. Future extensions

- `search_categories` AI tool if category pickers become common in multi-step flows
- Main vs assistant teacher counts per course in grouped output
- Intake/program filters on `query_courses`
- Align `count_organization` course entity with shared filter params (optional)
