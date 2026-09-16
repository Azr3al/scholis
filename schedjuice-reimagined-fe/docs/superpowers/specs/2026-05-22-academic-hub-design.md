# Academic Hub — design spec

> **Status:** Approved (brainstorming 2026-05-22)
> **Scope:** `schedjuice-reimagined-fe` + backend changes in `schedjuice-reimagined-be`
> **Replaces:** The current `/courses` list page (Admin Course List), the shared `DataTable`-based filter chrome on that page, and the legacy `CourseCard`
> **Builds on:** [2026-05-21-program-centered-course-create-design](2026-05-21-program-centered-course-create-design.md)

---

## 1. Problem

The `/courses` list page predates program-centered scheduling. It was built around the generic `DataTable` with column-based search/filter and treats every course as roughly equivalent, with category as the primary identifier. The recent program-centered course create work introduced four orthogonal axes — `Program`, `ProgramLevel`, `ProgramLevelSection`, `Subject` — and two program configuration fields (`course_creation_method`, `subject_strategy`) that determine which of those axes are meaningful for any given program. The list page does not reflect any of this.

Concrete pain points:

- **No program axis in the UI.** Multi-program tenants (ACCA + Diploma, MYP + IGCSE + A-Level) cannot quickly scope to one program.
- **Status filter is a dropdown** buried in a corner; the default is "All" so screens are dominated by ended courses.
- **Search is `icontains` on a single field.** Typos, partial codes, and field-jumping queries fail. There is no `q` handling on `CourseSearchView` despite the frontend `makeSearchParams` accepting it.
- **Role scoping is one-dimensional.** Backend returns "everything you can see"; a manager who also teaches has no way to scope to their own classes without leaving the page.
- **Course card is information-poor about program context.** It shows category prominently and buries the program/level/section/subject signal — exactly inverted from where the program-centered create flow puts the identity.
- **Sidebar has duplicate `Courses` entries** (Quick Links + Management).

## 2. Goals

1. **Reframe `/courses` as the Academic Hub** — a card-first, filter-led page tuned for the program-centered model.
2. **Filter bar that adapts to the selected program's configuration** — show intake / subject / category controls only when meaningful.
3. **Server-side fuzzy search** that tolerates typos and jumps fields, and that intentionally bypasses status filters.
4. **Role-aware "My classes only" toggle** that lets a manager-who-teaches scope to courses where they hold a meaningful `assigned_as_role`.
5. **Course card that leads with program identity** (breadcrumb of program > level > section), with subject and category as supporting chips.
6. **All filter state in the URL** via `nuqs`, so views are shareable and back/forward works.
7. **Sidebar cleanup** as a same-PR housekeeping item.

## Non-goals

- Redesigning `/courses/[id]` overview, hub toolbar, or any sub-route of the course detail (Phase 2).
- Deleting the legacy `CourseCard` (kept for other consumers until they migrate).
- Reworking `DataTable` itself or other lists that depend on it.
- Adding new sort UI on the hub page (smart default sorts internally; explicit sort is a Phase 2 ask if needed).
- Multi-select on the program chip row (single selection only).

---

## 3. Decisions log

| Topic | Decision |
|---|---|
| URL | Stays `/courses` for backward compat; label in nav becomes `Academic Hub` |
| Page chrome | Bespoke composition, not `DataTable`. Generic table indirection costs more than it saves here. |
| Program chip selection | **Single** ("All" is a chip). |
| Program chips visibility | Hidden when `program_count === 1`; the program name appears in the page header instead. |
| Default status | `active` only on first visit; URL state preserves user choice afterward. |
| Status chips | Always visible with counts; never hidden, even when search is active. |
| Search overrides status | When `q` is non-empty, results outside the selected statuses are surfaced; affected cards get a `Matched outside [active]` pill. |
| Filter axes per program | Stacked rules: intake row iff `course_creation_method === intake_based`; subject chips iff `subject_strategy === required`; category multi-select otherwise. Both intake + (subject or category) can coexist. |
| Fuzzy search mechanism | Postgres `pg_trgm` extension, trigram similarity threshold ~0.25, ordered by similarity. |
| Aggregate endpoint | New `POST /courses/aggregate`. Counts respect every active filter **except** the facet being shown. |
| "My classes only" toggle | Default ON for users with the teacher role; OFF (and hidden) otherwise. Filters to courses where the user has any non-null `user_courses.assigned_as_role`. |
| Card hierarchy | Proposal C — breadcrumb of program > level > section on top, title + code in body, subject and category as chips. |
| Sidebar | Remove `Courses` from Quick Links. Rename Management entry from `Courses` to `Academic Hub`. URL unchanged. |
| State | `nuqs` for every filter param; `localStorage` only for the "my classes only" preference fallback when URL state is absent. |
| Course overview redesign | Phase 2 — separate spec. |

---

## 4. URL map

```
/courses                               Academic Hub (replaces current list page)
  ?program=all|<id>                   single selection; default = first program by sort_order
  &status=active,planned,ended        comma-separated subset; default = "active"
  &intake=<id>                        only emitted when program is intake_based
  &subjects=<id>,<id>                 only when subject_strategy = required
  &categories=<id>,<id>               only when subject_strategy != required
  &q=<string>                         server-side fuzzy search query
  &my=1                               present iff "My classes only" is on
  &page=<n>                           pagination
```

Rules:
- Param keys absent ⇒ defaults applied.
- Reading the URL is the single source of truth; writing happens through `nuqs` setters.
- Toggling chip filters never resets `page`; toggling `program` resets `page`, `intake`, `subjects`, `categories`.

---

## 5. Filter-bar behavior

### Visual structure

```
┌─ Academic Hub ─ [Program Name if program_count===1] ─────────── [+ Add classes] ┐
│ Search:  [🔍 search title, code, subject, level, section…       ]   ⊞ ☷         │
│                                                                                  │
│ Program: ( All  · ACCA  · Diploma )                          ← when program_count > 1
│ Status:  ( Active 23 · Planned 4 · Ended 117 )                                   │
│ Intake:  [  June 2026 ▾  ]                                   ← intake_based only │
│ Subject: ( F1 4 · F2 4 · F3 4 · … )                          ← required only    │
│ Category:[ Maths × ]  [ Languages × ]  [ + add filter ]      ← otherwise         │
│                                                       [ ◯ My classes only ]      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Behavior rules

1. **Program row**
   - Hidden when `program_count === 1` (header shows the program name instead).
   - Radio behavior: exactly one chip active. `All` is the sentinel.
   - Changing program resets `intake`, `subjects`, `categories`, and `page`.

2. **Status row**
   - Always visible. Counts come from the aggregate endpoint.
   - `paused` status, if present in counts, is rolled into `active` for display purposes (paused is a transient sub-state of active in the data model). Concretely: the `Active` chip shows `active_count + paused_count` and selecting it sends `status__in = ["active", "paused"]` to the backend. The backend still distinguishes them in storage and reporting.
   - Multi-select (chips toggle independently). Default selection: `active`.

3. **Intake row**
   - Visible only when the selected program's `course_creation_method === intake_based` AND `program !== "all"`.
   - Dropdown of intakes for that program, ordered by `start_date desc`. Default: the latest intake whose `[start_date, end_date]` covers today; if none, the most recent past intake.
   - When `intake` is set, the active set of courses is constrained to that intake.

4. **Subject row**
   - Visible only when the selected program's `subject_strategy === required` AND `program !== "all"`.
   - Chips show `name + count`. Multi-select. Counts respect every other filter.

5. **Category row**
   - Visible only when the selected program's `subject_strategy !== required` AND `program !== "all"`.
   - Wraps existing `CategoryMultiSelect` styled as inline filter pills + an "Add filter" affordance for parity with the existing component.

6. **"My classes only" toggle**
   - Visible only when the current user has the `teacher` role (regardless of other roles). Hidden for users with only manager/admin/superadmin roles and no teacher role.
   - Default ON for users whose roles include teacher.
   - When ON, adds two filter params to the search and aggregate requests:
     - `user_courses__user_id = <me>`
     - `user_courses__assigned_as_role__isnull = false`
   - Note: for a teacher-only user (no manager+ roles), the backend already restricts visibility to their own courses (see `CourseSearchView` `is_admin()` branch). In that case the toggle still filters meaningfully because it adds the `assigned_as_role__isnull = false` constraint, distinguishing courses they teach from courses they appear in only as a student.

7. **"All" program**
   - Hides intake, subject, and category rows.
   - Status, search, and my-only remain functional.

8. **Search behavior**
   - Debounced 200ms client-side, then writes to URL `q`.
   - When `q` is non-empty:
     - The request to `/courses/search` omits the `status` filter from `filter_params` entirely.
     - Results are post-classified client-side: any card whose `status` is not in the user-selected status set gets a dimmed pill below the title reading `Matched outside [active]` (where `active` is replaced by the labels of the user's selected statuses).
     - Status chip counts continue to reflect what they would if search were not active **on the same facet exclusion rule** (counts respect search). This is intentional: counts answer "if I clear my search and click this chip, what would I see?" — which is consistent with the rest of the facet behavior.

### Component composition

```
AcademicHubFilterBar
├── ProgramChips             (radio, sources: useProgramsQuery)
├── StatusChips              (multi-select, sources: useHubAggregate("status"))
├── IntakeSelect             (single, sources: useIntakesQuery(program))
├── SubjectChips             (multi-select, sources: useHubAggregate("subject"))
├── CategoryFilterPills      (multi-select, sources: useHubAggregate("category"))
└── MyClassesOnlyToggle      (sources: useUser)
```

Each child reads its own URL state via `nuqs` and writes back via `nuqs` setters. The parent is presentational only; this keeps coupling low.

---

## 6. Server-side fuzzy search (`pg_trgm`)

### Migration

Add a migration in `app_course/migrations/` that:

1. Runs `CREATE EXTENSION IF NOT EXISTS pg_trgm;`.
2. Creates GIN indexes using `gin_trgm_ops` on:
   - `course.title`
   - `course.code`
   - `subject.name`
   - `program_level.name`
   - `program_level_section.name`

The indexes must be created `CONCURRENTLY` (use `atomic = False` migration with a guarded `IF NOT EXISTS`) to avoid table locks on production data.

### Backend handler

`CourseSearchView.post` (in `app_course/views.py`) gains a `q` branch:

```python
from django.contrib.postgres.search import TrigramSimilarity
from django.db.models.functions import Greatest

q = (request.data.get("q") or "").strip()
qs = self.get_base_queryset(request)
if q:
    qs = (
        qs.annotate(
            sim=Greatest(
                TrigramSimilarity("title", q),
                TrigramSimilarity("code", q),
                TrigramSimilarity("subject__name", q),
                TrigramSimilarity("level__name", q),
                TrigramSimilarity("section__name", q),
            )
        )
        .filter(sim__gte=0.25)
        .order_by("-sim", "-created_at")
    )
```

When `q` is present, the view ignores any `status` entry inside `filter_params` (it strips it before applying the rest). Other `filter_params` (program, intake, subjects, categories, my-only) are applied normally.

Threshold `0.25` is chosen as a balance between recall and precision; we will revisit after dogfooding. It is exposed as a Django setting `COURSE_SEARCH_TRIGRAM_THRESHOLD` for tuning without redeploys.

### Frontend wiring

- `useHubCourses` hook posts to `/courses/search` with `q` from URL state.
- The list query key includes `q` so caching is correct.
- When `q` changes, page resets to 1.

---

## 7. Backend aggregate endpoint

### Contract

`POST /courses/aggregate`

Request body:
```json
{
  "filter_params": [ ... same shape as /courses/search ... ],
  "q": "optional fuzzy query string",
  "facets": ["status", "subject", "category"]
}
```

Response:
```json
{
  "status":   { "active": 23, "planned": 4, "ended": 117, "paused": 0 },
  "subject":  [ { "id": 12, "name": "F1", "count": 4 }, ... ],
  "category": [ { "id": 7, "name": "Maths", "count": 14 }, ... ]
}
```

### Semantics

For each requested facet F:

- Apply the same role scoping as `CourseSearchView` (so a teacher's counts reflect only their visible courses).
- Apply every `filter_param` and `q` from the request **except** any `filter_param` whose `field_name` targets F.
- Group by F and count.
- Subject and category facets only return rows present in the filtered set (no zero rows).

When `q` is non-empty, status filters are excluded from the count base for all facets — same rule as search. This keeps "search overrides status" consistent across counts and list.

### Frontend wiring

- `useHubAggregate(facet)` is a thin React Query hook. The cache key is `["academic-hub-aggregate", facet, filterSetWithoutFacet, q, my]`.
- The page issues parallel calls: one list query + up to three aggregate queries.
- The hook returns `{counts, isLoading}`; chips render skeleton state while loading and never block the list.

### Performance notes

- Each facet aggregate is a single grouped count query on the same base queryset. With existing indexes plus the new `pg_trgm` GIN indexes, this should be well under 100ms for typical tenants.
- React Query staleTime of 30s on aggregate keys (counts don't need to be real-time).
- A future optimization can combine all three facets into one SQL round trip via `Case`/`Sum` aggregation; not in scope for v1.

---

## 8. Course card v2

### Layout

```
┌─────────────────────────────────────────────────────┐
│  ACCA · Year 1 · Sec A                  [● Active]  │   ← breadcrumb + status badge
│                                                      │
│  Algebra II — Term 1                                 │   ← title
│  ACCA-Y1-A-ALG-T1                                    │   ← code (muted)
│                                                      │
│  [F1] [Maths]                Term 1 — 2026           │   ← subject chip(s), category chip, intake (right-aligned)
│                                                      │
│  Mon Wed Fri · 14:00–16:00 · 12 wks                  │   ← schedule pattern
│  Ms. Daw Hnin · 28 students · 2 teachers             │   ← people
└─────────────────────────────────────────────────────┘
```

### Conditional rules

- **Breadcrumb**: a `>` separated list of [program.name, level.name?, section.name?]. Null pieces collapse. If all three would be null (impossible — every course has a program), the breadcrumb falls back to the program name alone.
- **Subject chips**:
  - `subject_strategy === "required"` → one chip showing `course.subject.name`.
  - `subject_strategy === "multi"` → up to 3 chips from `course_subjects[].subject.name`, then `+N more` if truncated.
  - `subject_strategy === "optional"` → one chip if `course.subject` is set; otherwise none.
  - `subject_strategy === "none"` → no subject chips.
- **Category chip**: always present (category is required on the model).
- **Intake**: shown on the right side of the chip row only when the course's program is intake-based and the course has an `intake`.
- **Status pill**: existing `StatusBadge`. When a course matched `q` but is outside the selected statuses, a dimmed pill appears below the title: `Matched outside [active]`.

### Interactivity

- Clicking the card body navigates to `/courses/{id}?ref=/courses`.
- Clicking a breadcrumb piece sets the corresponding filter (e.g., level → adds level filter and scopes) without leaving the page. Subject and category chips work the same way. Status pill is not clickable.
- Hover state remains the existing `RandomPatternImage` gradient.

### Module path

- `src/components/academic-hub/course-card.tsx` (new).
- The existing `src/components/course/course-card.tsx` is **not removed** in this work — other surfaces still consume it. A follow-up cleanup ticket migrates remaining consumers.

---

## 9. Empty states

Three classes; each gives the user a one-click fix.

1. **"No results for this status combo"** — When the list is empty but the aggregate shows other statuses have results:
   ```
   No active courses in ACCA.
   [ Show Planned (4) ]   [ Show Ended (117) ]
   ```

2. **"No matches for your search"** — When `q` is non-empty and the list is empty:
   ```
   Nothing matches "algebra term 1".
   [ Clear search ]
   ```

3. **"Program has no courses yet"** — When the aggregate is empty across all statuses:
   ```
   ACCA has no courses yet.
   [ + Add classes ]
   ```

Empty state component lives at `src/components/academic-hub/empty-state.tsx`; the page picks the right variant from `(listCount, totalCount, q)`.

---

## 10. Sidebar cleanup

In [src/config/nav-routes.tsx](../../src/config/nav-routes.tsx):

1. Remove the `Courses` entry from the `Quick Links` section.
2. Rename the Management `Courses` entry label from `Courses` to `Academic Hub`. Keep the icon, role gating, and URL (`/courses`) unchanged.
3. No other navigation moves in this PR.

If breadcrumbs / page titles elsewhere read this label, they will inherit the rename automatically.

---

## 11. Data fetching plan

React Query keys, issued in parallel by `AcademicHubPage`:

| Key | Purpose | When it runs |
|---|---|---|
| `["academic-hub-programs"]` | Program chip row | always |
| `["academic-hub-intakes", programId]` | Intake dropdown | when program is intake_based |
| `["academic-hub-list", filterSet]` | Card grid | always |
| `["academic-hub-aggregate", "status", filterSetWithoutStatus]` | Status chip counts | always |
| `["academic-hub-aggregate", "subject", filterSetWithoutSubject]` | Subject chip counts | when subject_strategy === required |
| `["academic-hub-aggregate", "category", filterSetWithoutCategory]` | Category chip counts | when subject_strategy !== required |

`filterSet` is a serializable object derived from URL state. `filterSetWithoutX` is the same with the `X` facet stripped.

Page size for the grid: 24 cards (3 cols × 8 rows on desktop).

### Smart default sort

The list query sends `sorts` based on the program's `course_creation_method`:

- `intake_based`: `[-intake__start_date, -created_at]`
- `manual` or `program === "all"`: `[-created_at]`

No sort UI in Phase 1.

---

## 12. File / module layout

### Frontend

```
src/app/(internal)/courses/page.tsx                        (rewritten; thin entry that renders AcademicHubPage)

src/components/academic-hub/
  ├── academic-hub-page.tsx
  ├── academic-hub-header.tsx                              (title, program name when count===1, Add classes CTA)
  ├── filter-bar/
  │     ├── filter-bar.tsx                                 (layout shell)
  │     ├── program-chips.tsx                              (radio)
  │     ├── status-chips.tsx                               (multi, with counts)
  │     ├── intake-select.tsx                              (dropdown)
  │     ├── subject-chips.tsx                              (multi, with counts)
  │     ├── category-pills.tsx                             (wraps CategoryMultiSelect)
  │     └── my-only-toggle.tsx
  ├── course-grid.tsx                                      (responsive grid + skeleton + empty state)
  ├── course-card.tsx                                      (card v2)
  └── empty-state.tsx                                      (filter-aware empty states)

src/hooks/academic-hub/
  ├── use-hub-filters.ts                                   (nuqs read/write helpers)
  ├── use-hub-courses.ts                                   (list query)
  ├── use-hub-aggregate.ts                                 (status/subject/category aggregate queries)
  ├── use-programs.ts                                      (programs catalog, session-cached)
  └── use-intakes.ts                                       (intakes for a program)

src/helpers/academic-hub/
  └── filter-params.ts                                     (URL state → filter_params shape)

src/config/nav-routes.tsx                                  (modified: remove Quick Links Courses; rename Management label)
```

### Backend

```
app_course/views.py                                        (modified: CourseSearchView gains q + pg_trgm; new CourseAggregateView)
app_course/services/aggregate.py                          (new — facet count query builder)
app_course/migrations/00xx_pg_trgm_extension.py            (CREATE EXTENSION + GIN indexes, non-atomic)
app_course/urls.py                                         (modified: register /courses/aggregate)
schedjuice/settings/base.py                                (modified: add COURSE_SEARCH_TRIGRAM_THRESHOLD default = 0.25)
```

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `pg_trgm` extension not permitted on a managed Postgres | Setting flag `COURSE_SEARCH_FUZZY_ENABLED`; falls back to multi-word ILIKE across the same fields when extension is unavailable. Migration is idempotent. |
| Aggregate endpoint becomes a hot path | React Query staleTime 30s + per-facet keys. Index coverage matches the search index set. |
| Old card consumers break | New card is a sibling file; old card untouched. Migration is opt-in per surface. |
| Default `active` filter hides recently created courses for users used to "All" | Status chip counts make Planned/Ended discoverable in one click; empty-state CTAs nudge users to broaden. |
| "My classes only" + admin role expectations | Toggle is hidden for users without teacher role; for teacher+admin, default ON but easily toggled. URL state takes precedence over default on subsequent visits. |
| Backend role scoping changes invalidate the toggle filter | The toggle filter is additive (`user_courses__user_id` + `assigned_as_role__isnull=false`); for teacher-only users it's a no-op because the backend already restricts. |

---

## 14. Acceptance checks

A reviewer can verify the feature is complete by:

1. **Single-program tenant**: visit `/courses`. No program chip row. Program name appears in the header. Status chips show counts. Default shows only Active. Adding a typo to a course title still finds it.
2. **Multi-program tenant**: program chips appear; clicking one resets sub-filters and shows that program's adaptive rows (intake / subject / category as appropriate).
3. **Search override**: search for a known ended course title while the Active chip is selected; the card appears with the `Matched outside [active]` pill.
4. **My classes only**: a manager-who-teaches sees the toggle defaulted ON; toggling it shows the full set.
5. **Card v2**: each card shows breadcrumb, title, code, subject chip(s) (per strategy), category chip, intake (when applicable), schedule, and people row.
6. **Empty state**: clear all filters and pick a status with no results; the filter-aware empty state offers the broadening CTA.
7. **Sidebar**: `Courses` no longer appears in Quick Links; the Management entry reads `Academic Hub`.
8. **URL state**: changing every filter writes to the URL; refresh restores the exact view; the back button steps through filter changes.

---

## 15. Phase 2 follow-ups (out of scope)

- `/courses/[id]` overview redesign aligned with the program-centered identity.
- Course hub toolbar consolidation (`course-hub-nav.ts`, `course-hub-more-menu.ts`).
- Combine all three aggregate facets into one SQL round trip.
- Migrate remaining consumers off the legacy `CourseCard` and delete `src/components/course/course-card.tsx`.
- Optional sort dropdown if smart defaults prove insufficient.
