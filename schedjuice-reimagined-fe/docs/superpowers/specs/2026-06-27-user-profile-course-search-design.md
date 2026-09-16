# User Profile — Course Search — Design Spec

> Add Academic Hub-style server-side course search to the user record **Courses** pane, scoped to the profile subject's enrollments only.

**Status:** Approved (brainstorming 2026-06-27)
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — palette, type, motion §12
**Parent spec:** [`2026-06-22-user-record-academic-design.md`](2026-06-22-user-record-academic-design.md) (Courses pane = §4)
**Search parity:** [`2026-05-22-academic-hub-design.md`](2026-05-22-academic-hub-design.md) §6 (server-side FTS / trigram via `POST /courses/search`)
**Date:** 2026-06-27

---

## 1. Problem

The Academic → **Courses** pane (`RecordCourseList`) lists a subject's enrollments with **Your classes / All** scope, **Active / All** status chips, and client-side pagination — but no text search.

Teachers and admins viewing students with many enrollments cannot quickly find a course by title, code, subject, level, or section. The app already ships Hub-quality search on `/courses` and standalone `/search`; the profile course list is the gap.

---

## 2. Goals

1. **Search input** on the Courses pane toolbar matching Academic Hub UX (icon, placeholder, debounce).
2. **Server-side search** via existing `POST /courses/search` with `q`, scoped to the profile subject's enrollments.
3. **Same matching semantics as Hub** — FTS with trigram fallback on title, code, subject, level, section (no backend changes).
4. **URL-deep-linkable** search via `?q=` on the user record URL (alongside existing `section` and `pane`).
5. Preserve existing behavior when `q` is empty (scope, status, client pagination, empty states).

### Non-goals

- Org-wide course discovery from the profile (that remains `/courses` and `/search`).
- Program / intake / subject / category chip filters from the Hub.
- Backend API or migration changes.
- Extracting a shared search-input component (follow-up if Hub and profile diverge later).

---

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Search scope | **Subject's enrollments only** — never courses the subject is not enrolled in |
| Search engine | **Server-side** `POST /courses/search` with `q` (Approach 1 from brainstorming) |
| Matching fields | Title, code, subject, level, section — same as Hub / backend `course_search.py` |
| UI pattern | Mirror `AcademicHubToolbar` search input (Iconoir `Search`, `Input` primitive, 200ms debounce) |
| Placeholder | `Search title, code, subject, level, section…` |
| URL state | `nuqs`: `q` (string, default `""`), `page` (integer, default `1`) on `/users/[id]` |
| Dual-mode list | **`q` empty** → current client path; **`q` non-empty** → server search path |
| Status filter when searching | **Ignored** when `q` is set (Hub parity — backend strips status filters when `q` present) |
| Scope filter when searching | **Honored** — **Your classes** constrains API via `id__in=sharedIds` |
| Page size | **10** (unchanged from current client pagination) |
| Fallback hint | Show *(showing close matches)* when response `used_fallback: true` |
| Assign courses | Unchanged — admin link stays in toolbar when permitted |

---

## 4. Architecture

### 4.1 Data flow

```
URL (?pane=courses&q=&page=)
  → useProfileCourseFilters (nuqs)
  → RecordCourseList
       ├─ q empty  → filter embedded user_courses (scope + status) → client pagination → RecordCourseRow
       └─ q set    → useProfileCourseSearch → POST /courses/search
                      → mergeSearchWithEnrollments(user_courses, calendarEvents)
                      → server pagination → RecordCourseRow
```

### 4.2 New units

| File | Responsibility |
| --- | --- |
| `src/hooks/profile-courses/use-profile-course-filters.ts` | `nuqs` parsers for `q` and `page`; setters reset page on `q` change |
| `src/helpers/profile-courses/build-profile-course-filter-params.ts` | Build `filter_params` for search API |
| `src/helpers/profile-courses/merge-search-with-enrollments.ts` | Join course search rows with enrollment metadata |
| `src/hooks/profile-courses/use-profile-course-search.ts` | React Query hook wrapping `searchEntities("courses", …)` |

### 4.3 Modified unit

**`src/components/record/academic/record-course-list.tsx`** — add search input; branch list rendering on debounced `q`; wire server pagination when searching.

---

## 5. API contract (frontend only)

### Request

```ts
searchEntities(
  "courses",
  {
    page,
    size: 10,
    q: debouncedQ.trim(),
    sorts: ["-created_at"],
    expand: [
      "program",
      "level",
      "section",
      "subject",
      "course_subjects",
      "course_subjects.subject",
    ],
  },
  { filter_params },
);
```

### Filter params

Always:

```ts
{ field_name: "user_courses__user_id", operator: "exact", value: subjectId }
```

When scope is **Your classes** and `sharedIds.length > 0`:

```ts
{ field_name: "id", operator: "in", value: sharedIds.join(",") }
```

When scope is **Your classes** and `sharedIds.length === 0`: skip API call; show existing empty state.

Do **not** send status filters when `q` is non-empty (backend strips them anyway).

### Response usage

- `data` → course rows
- `count` / `total_pages` → server pagination
- `used_fallback` → optional hint in UI

Enrollment fields (assigned role, seniority sort, `userCourseId`, shared badge, next-session label) come from embedded `subject.user_courses` and `calendarEvents` via `mergeSearchWithEnrollments`.

---

## 6. UI specification

### 6.1 Toolbar layout

Add search input to the existing toolbar row in `RecordCourseList`:

```
[ Search input………………… ]  [ Your classes | All courses ]  [ Active | All ]  [ Assign courses ]
```

On narrow viewports the row wraps; search input is first (full-width on xs if needed), matching Hub toolbar flex-wrap behavior.

### 6.2 Search input behavior

- Local `draftQ` synced from URL `q` on external changes
- `onChange` updates draft immediately; debounced 200ms write to URL `q` via `setQ`
- `aria-label="Search courses"`
- Styling: `h-8 w-52 pl-8 text-sm sm:w-64` (same as `AcademicHubToolbar`)

### 6.3 Result summary line

Below toolbar, extend the existing count line:

- No search: `{activeCount} active · {total} total` (unchanged)
- With search: `{totalCount} match(es)` + optional ` (showing close matches)`

### 6.4 Empty states

| Condition | UI |
| --- | --- |
| No enrollments | Existing `EMPTY_COPY_PRESETS.notEnrolled` |
| Search, zero matches | Hub-style no-results copy + **Clear search** button (sets `q=""`) |
| Scope=your, no shared | Existing "Not in your classes" + link to show all |

### 6.5 Errors

Search API failure: compact inline alert above the list with **Retry** (re-triggers query). Does not block the rest of the profile.

### 6.6 Loading

- Search mode: skeleton rows while fetching; `keepPreviousData: true` for page changes
- Opacity fade on list during background refetch (Hub pattern)

---

## 7. Edge cases

| Case | Behavior |
| --- | --- |
| User types then clears search | Revert to client path; scope/status selections preserved |
| `page` > total after filter change | Clamp to last page (existing effect) |
| Course in search results missing from embedded enrollments | Skip row (should not happen given `user_courses__user_id` filter) |
| Rapid typing | Abort in-flight request via React Query `signal` |
| Deep link `?section=academic&pane=courses&q=algebra` | Opens Academic Courses pane with search applied |

---

## 8. Testing

### Unit (Vitest)

- `buildProfileCourseFilterParams` — subject-only; subject + shared IDs; empty shared set omits `id__in`
- `mergeSearchWithEnrollments` — role name, seniority sort order, shared flag, next-session label

### Manual

1. Student with 15+ courses — search by title, code, subject name
2. Teacher viewing student — **Your classes** + search returns only shared matches with correct pagination
3. Typo query shows fallback hint
4. URL deep link restores search state
5. Empty `q` — Active/All and client pagination unchanged

---

## 9. Files touched (implementation reference)

| Action | Path |
| --- | --- |
| Create | `src/hooks/profile-courses/use-profile-course-filters.ts` |
| Create | `src/hooks/profile-courses/use-profile-course-search.ts` |
| Create | `src/helpers/profile-courses/build-profile-course-filter-params.ts` |
| Create | `src/helpers/profile-courses/merge-search-with-enrollments.ts` |
| Create | `src/helpers/profile-courses/build-profile-course-filter-params.test.ts` |
| Create | `src/helpers/profile-courses/merge-search-with-enrollments.test.ts` |
| Modify | `src/components/record/academic/record-course-list.tsx` |
