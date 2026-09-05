# School Overview Table UX — Design Spec

**Date:** 2026-07-20  
**Status:** Implemented  
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`  
**Approach:** Cached month snapshot + ResourceTable UI (Approach 1)

## 1. Summary

The school overview finance page (`/finances/school-overview`) shows per-course income/expense/profit for a month, but course names are often unreadable (column sizing regression), and the table has no search, pagination, sorting, or Main Teacher (MT) column. Computing the overview is also slow because it loops courses × teachers through the full tr.phillips cash-flow path.

This work fixes visibility and table UX, adds backend search/pagination/sorting (reusing Academic Hub course-search helpers), shows comma-joined MT names, and speeds reads with a **tenant + year-month cache** that invalidates when that month’s check-in data changes. Summary cards always show **full-month** totals (search only filters the table).

## 2. Context

### Current surfaces

| Piece | Location | Today |
| --- | --- | --- |
| Page | `schedjuice-reimagined-fe/.../finances/school-overview/page.tsx` | Plain `Table`; year/month via `FilterToolbar`; no search/page/sort wiring |
| Types | `fe/src/types/finance/cash-flow.ts` | `course_id`, `course_title`, money totals only |
| API | `POST /api/v1/cash-flow/trphillips/school-overview` | Returns all courses for the month |
| Compute | `get_school_overview_trphillips` in `app_hr/payroll_funcs.py` | Per-course → per-teacher tr.phillips loops |
| Course search | `POST /api/v1/courses/search` + Academic Hub FE (200ms debounce) | Fuzzy title/code (+ facets); not used by overview |
| Column sizing | `fe/.../data-table/column-layout.ts` | Course column lost `prose` sizing after finance reskin |

### Root cause of invisible course names

Not expand/collapse (none on this page). Most likely: Course column has no `sizing: { role: "prose" }` while numeric columns reserve fixed width, so the first column collapses under `min-w-0 overflow-x-auto`. Secondary: empty `course_title` if Course.title is blank.

### MT meaning

**MT = Main Teacher** (`AssignedAsRole.Seniority.MAIN_TEACHER`). Names come from `UserCourse` → `User.name`. Reports already aggregate as “MT Name” via `STRING_AGG`. Overview API does not include MT today.

## 3. Goals

1. Course names always readable (prose sizing, contrast, sticky first column on horizontal scroll).
2. Backend search on title, code, subject name(s), and MT name(s); reuse Academic Hub fuzzy course-search helpers where applicable.
3. Pagination with “Showing X–Y of Z”.
4. Sorting on Course, MT name, Total income, Total expense, Total profit.
5. MT name column: comma-joined Main Teachers (reports-style); empty string if none.
6. Faster repeated loads via month snapshot cache; invalidate on check-in edits for that month.
7. UX polish: tighter spacing under notes/banner; empty states for no activity and no search matches.
8. Cards always full-month `grand_aggregate` (ignore `q`).

## 4. Non-goals

- Set-based rewrite of tr.phillips income/expense math.
- Changing payroll/cash-flow calculation rules.
- Filtering summary cards by search.
- Export/CSV, charts, or redesign of per-course cash-flow drill-down (keep existing course → cash-flow link).
- Marketing-style visual redesign (stay within existing finance / data-table primitives).

## 5. Locked decisions

| Topic | Choice |
| --- | --- |
| Search architecture | Extend school-overview with `q` / page / size / sorts; reuse course-search helpers under the hood |
| Speed | Cache full month snapshot; serve filter/sort/page from snapshot |
| Cache key | `school-overview:{tenant}:{YYYY-MM}` |
| Freshness | Invalidate that key when that month’s check-in data is edited; long TTL (e.g. 24h) as safety net only |
| Cards vs search | Cards always full-month totals |
| MT display | Comma-joined names in one column |
| Search fields | Title + code + MT name(s) + subject name(s) |
| Sortable columns | All five: course, MT, income, expense, profit |
| Extra UX | Tighter top spacing; course contrast + sticky left; Showing X–Y of Z; empty states |
| FE packaging | ResourceTable + FilterToolbar / Academic Hub–style debounced search (~200ms) |
| Default page size | 20 (cap e.g. 100) |
| Default sort | `course_title` ascending |

## 6. Architecture

### 6.1 Data flow

```
Staff edits check-in (month M)
        │
        ▼
 invalidate cache key
 school-overview:{tenant}:{YYYY-MM}
        │
        ▼
POST school-overview (month, year, q, page, size, sorts)
        │
        ├─ cache HIT  → snapshot
        └─ cache MISS → compute (existing tr.phillips path) → enrich MT/subject/code → store
        │
        ▼
 filter by q → sort → paginate
        │
        ▼
 response: page rows + count + full-month grand_aggregate + is_ongoing_month
```

### 6.2 Snapshot contents

Computed once per tenant-month (until invalidation):

- `courses[]`: every course with qualifying activity that month, each row enriched with:
  - `course_id`, `course_title`, `course_code`
  - `subject_names` (comma-joined if multiple)
  - `mt_name` (comma-joined Main Teachers; `""` if none)
  - `total_income`, `total_expense`, `total_profit`
- `grand_aggregate`: sum across all courses in the snapshot

Filter/sort/page run in process on this list (school-scale lists are acceptable). Do not re-run tr.phillips per page.

### 6.3 Search

1. If `q` is empty/whitespace: all snapshot courses.
2. If `q` present:
   - Use Academic Hub / `course_search` helpers to resolve matching course IDs for title/code/subject (same fuzzy behavior as hub where practical).
   - Also include snapshot rows whose `mt_name` or `subject_names` / title / code match `q` (case-insensitive substring and/or the same fuzzy path), so MT-only queries work even when hub search does not index teachers.
3. `count` = number of filtered matches (not full snapshot size when searching).
4. `grand_aggregate` remains the full-month snapshot aggregate.

### 6.4 Cache implementation

- Django `cache` (Redis when configured; locmem in local DEBUG).
- Key: `school-overview:{tenant_id_or_schema}:{YYYY-MM}` (use the same tenant identity convention as other tenant-scoped caches).
- TTL: ~24h safety net; correctness depends on invalidation.
- Cache backend failure: log warning, fall through to live compute (treat as miss). Do not 500 the page solely because cache is down.

### 6.5 Invalidation

Central helpers:

- `invalidate_school_overview_cache(tenant, year, month)`
- `invalidate_school_overview_for_user_event(user_event)` — derive tenant-local year/month from the related event date + tenant timezone; invalidate each distinct month touched.

**Required (v1):** invalidate on cash-flow-relevant `UserEvent` writes, including:

- Check-in history bulk update / detail PATCH (checkin, checkout, hourly rate, student count, soft-delete)
- Live session check-in / checkout
- Teacher self-correction of check-in history
- Other creates/updates that set qualifying fields used by overview

**Also (v1):** invalidate when searchable / MT display metadata changes for a course that may appear in a cached month:

- Main-teacher `UserCourse` assignment changes
- Course title, code, or subject association changes

Pragmatic scope for metadata: at minimum invalidate the **current tenant-local calendar month** (and, if the edit clearly targets an event month, that month). Prefer precise month derivation from related events when available.

## 7. API contract

**Endpoint:** `POST /api/v1/cash-flow/trphillips/school-overview` (path unchanged)  
**Permission:** `analytics.view`

### Request (additive fields)

| Field | Type | Notes |
| --- | --- | --- |
| `month`, `year` | int | existing; required |
| `q` | string | optional |
| `page` | int | default `1` |
| `size` | int | default `20`; max `100` |
| `sorts` | string[] | e.g. `["course_title"]`, `["-total_profit"]`, `["mt_name"]` |

Sortable fields: `course_title`, `mt_name`, `total_income`, `total_expense`, `total_profit`. Descending via `-` prefix. Default: `["course_title"]`.

### Response

```ts
{
  courses: Array<{
    course_id: number
    course_title: string
    course_code: string | null
    subject_names: string
    mt_name: string
    total_income: string
    total_expense: string
    total_profit: string
  }>
  count: number                 // filtered match count
  grand_aggregate: {
    total_income: string
    total_expense: string
    total_profit: string
  }                             // always full month
  is_ongoing_month: boolean
}
```

Envelope wrapping follows existing `send_response` / FE `getSchoolOverviewPayload` nesting tolerance.

## 8. Frontend design

### Layout

Keep existing finance chrome (notes, ongoing-month banner, `AggregateCards`). Tighten vertical spacing under notes/banner before cards.

Toolbar: year/month selectors + search input (placeholder e.g. “Search courses…”), ~200ms debounce (Academic Hub pattern).

Table columns (in order):

1. Course (link to cash-flow for that course) — prose sizing, readable contrast, sticky left
2. MT name
3. Total income
4. Total expense
5. Total profit

Footer: pagination controls + “Showing X–Y of Z”.

### State

URL via `nuqs`: existing `date` plus `q`, `page`, `size` (optional if defaulted), `sorts`. React Query key includes month/year + those params; use placeholder/keep-previous data so paging feels instant when the snapshot is warm.

Prefer `ResourceTable` + shared sort/pagination parts (same family as check-in histories) over hand-wiring the plain `Table`.

### Empty / loading / error

| State | Behavior |
| --- | --- |
| Loading | Existing report/table skeleton; do not invent card numbers |
| No courses in month | Empty state under cards: no cash-flow activity this month |
| Search, zero matches | “No courses match your search” + clear-search control |
| API error | Error message; do not show stale success cards for a failed request |

## 9. Testing

### Backend (`./scripts/run_backend_tests.sh` / `--keepdb --noinput`)

- Cache get-or-set: second identical month request does not recompute (spy/mock).
- Invalidation: after qualifying `UserEvent` edit in month M, next overview for M recomputes.
- Pagination: `page`/`size`/`count`; `grand_aggregate` identical across pages.
- Search: matches title, code, subject, MT; empty `q` = all; cards still full-month.
- Sort: each sortable field asc/desc.
- MT: comma-joined; empty when none.
- Permission: `analytics.view` still required.

### Frontend

- Course column sizing/contrast regression coverage if column-layout tests exist or are cheap to add.
- URL state drives request params.
- Empty states for no activity vs no matches.
- Smoke: sort headers and pagination render with data.

## 10. Key files (expected touch list)

**Backend**

- `app_hr/payroll_funcs.py` — snapshot enrich + filter/sort/page helpers
- `app_hr/views.py` — accept new params; return `count`
- New small cache helper module under `app_hr/` (or shared cache util)
- `app_attendance` / `app_course` UserEvent write paths — invalidation hooks
- Course / UserCourse save paths for MT/title/code/subject invalidation
- Tests under `app_hr/tests/`

**Frontend**

- `src/app/(internal)/finances/school-overview/page.tsx`
- `src/types/finance/cash-flow.ts`
- Data-table column sizing / ResourceTable integration
- Possibly thin client helper for overview fetch params

## 11. Rollout notes

- **Ship FE and BE together.** After this change, omitting `page`/`size` still defaults to page 1 / size 20 (plus `count`). Any client that assumed the full course list in one payload will only see the first page until updated.
- Cold miss for a large month remains expensive once; first load after invalidation may be slow; subsequent loads are cheap.
- Ongoing month still shows the existing warning banner; figures remain non-final by product rules, but cache+invalidation keeps them consistent with edited check-ins.

## 12. Spec self-review

- No TBD/TODO placeholders left unresolved.
- Cards ignore `q`; table uses filtered `count` — consistent across Architecture, API, and FE sections.
- Cache invalidation on check-in writes is required; metadata invalidation is required with pragmatic month scope (current month minimum).
- Scope fits one implementation plan (BE cache/API + FE table UX); set-based rewrite explicitly out of scope.
