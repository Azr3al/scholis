# Academic admin refresh - design spec

> **Status:** Draft for user review  
> **Scope:** `schedjuice-reimagined-fe` + shared subject usage aggregation in `schedjuice-reimagined-be`  
> **Builds on:** `2026-05-21-program-centered-course-create-design.md`, `2026-05-22-academic-hub-design.md`

---

## 1. Problem

Recent course creation work moved Schedjuice from a manual, course-first model toward a program-centered academic model. The surrounding academic UI has not caught up. For multi-program tenants especially, academic concepts are spread across `Management`, generic table pages, and older labels:

- `/courses` is now the Academic Hub, but sidebar organization still mixes academic and operational management items.
- `/subjects` is an org-wide catalog, but its current copy does not explain how subjects relate to programs and courses.
- Academic Hub subject counts only group by `Course.subject`, so multi-subject courses represented through `CourseSubject` are undercounted.
- Quizzes and Question Bank are academic tools, but currently sit beside users, categories, student registration, and other operational admin pages.
- Programs, intakes, subjects, quizzes, question bank, and course roles do not feel like one coherent academic suite.

This work supports the long-term goal of reducing UI clutter and simplifying flows.

---

## 2. Goals

1. Create a coherent **Academic** sidebar section.
2. Keep `/courses` as **Academic Hub** in the sidebar; do not add a separate `Courses` item.
3. Refresh academic list pages as a card-forward suite, not just generic tables with new labels.
4. Redesign `/subjects` as a clear org-wide **Subject catalog** with course usage stats.
5. Make subject usage count both `Course.subject` and `CourseSubject`, with no double-counting per course.
6. Share backend aggregation and frontend usage components/helpers so Academic Hub and `/subjects` use the same subject semantics.
7. Preserve existing URLs, role gates, CRUD routes, and course creation routes.

## Non-goals

- Rewriting course detail pages.
- Rebuilding quiz creation or quiz editing internals.
- Changing course creation route structure.
- Changing the program/intake data model beyond subject usage aggregation.
- Removing the `Intakes` nav item. It stays in the sidebar, but under `Academic`.

---

## 3. Navigation IA

Add a new top-level sidebar section named **Academic**, near the top of the sidebar after Quick Links.

```
Academic
- Academic Hub      -> /courses
- Programs          -> /programs
- Subjects          -> /subjects
- Intakes           -> /intakes
- Quizzes           -> /quizzes-v3
- Question Bank     -> /quizzes-v3/question-bank
- Course Roles      -> /course-roles
```

Remove those items from `Management`. `Management` becomes more operational, containing items such as users, categories, and student registration.

Rules:

- Keep all existing role permissions and `canShow` behavior.
- Keep `/courses` labeled as `Academic Hub`; do not add another `Courses` nav item.
- Keep `Intakes` visible. The intake page is a review/manage surface, not the starting point for course creation.

---

## 4. Shared Subject Usage

### 4.1 Backend Source Of Truth

Add shared subject usage aggregation in the backend, likely alongside `app_course/services/aggregate.py`.

The service returns usage rows for subjects by counting a course once when either condition is true:

- `Course.subject_id = subject.id`
- A matching `CourseSubject(course_id, subject_id)` exists

If both point to the same subject for the same course, count that course once.

The service must accept:

- A status/currentness mode matching Academic Hub semantics.
- An `include_all_courses` flag for `/subjects`.
- Existing role/query scoping where relevant.
- Optional program/status filters when used by Academic Hub.

Default current usage should follow Academic Hub behavior: active-style status semantics, including `paused` where the hub treats paused as active.

### 4.2 Academic Hub Alignment

Academic Hub subject facets should use the shared subject usage service instead of only grouping by `Course.subject`.

This fixes multi-subject programs where generated courses store subjects through `CourseSubject`.

### 4.3 Subject Catalog Usage

`/subjects` should use the same backend service. It defaults to active/current course usage and offers a URL-backed toggle to include all courses.

Example visible stats:

- `12 active courses`
- `34 all-time courses` when the toggle is on
- `Used in ACCA, Diploma` or `Used in 3 programs`

---

## 5. Shared Frontend Components

Create shared academic page primitives so the suite feels coherent:

```
src/components/academic/
  academic-page-header.tsx
  academic-list-surface.tsx
  academic-card-grid.tsx
  subject-usage-stat.tsx
```

Create shared subject usage types/helpers:

```
src/types/subject-usage.ts
src/hooks/academic/use-subject-usage.ts
src/helpers/academic/subject-usage.ts
```

These should be consumed by both:

- `src/components/academic-hub/filter-bar/subject-chips.tsx`
- `src/app/(internal)/subjects/page.tsx`

The exact file names can adapt to local patterns, but the implementation must avoid separate subject-count math for Academic Hub and `/subjects`.

---

## 6. Page-Level UX

### 6.1 Academic Hub (`/courses`)

Keep the current Academic Hub direction and URL.

Changes in this work:

- Move it under the `Academic` sidebar section.
- Keep label `Academic Hub`.
- Fix the subject facet to count `CourseSubject` as well as `Course.subject`.
- Preserve the existing filter-bar status semantics.

### 6.2 Subjects (`/subjects`)

Reframe the page as **Subject catalog**.

Copy:

- Title: `Subject catalog`
- Description: `Subjects used across your programs and courses.`

UX:

- Lean toward cards rather than a raw generic table.
- Show a usage stat per subject using shared subject usage logic.
- Default to active/current usage.
- Add a URL-backed toggle: `Show all courses` or `Include all courses`.
- Show program usage context when available.
- Keep the `Create subject` CTA.

The page remains org-wide. Avoid copy such as "the subjects your program offers" unless a specific program context is selected elsewhere.

### 6.3 Programs (`/programs`)

Refresh the list page as the academic structure entry point.

Card-forward content should highlight:

- Program name.
- Course creation method.
- Subject strategy.
- Available levels/subjects/intakes when cheaply available.
- CTA to create/manage program settings.

Copy should explain that programs define how courses are organized and created.

### 6.4 Intakes (`/intakes`)

Refresh as a cohort/term management surface.

Card-forward content should highlight:

- Intake name.
- Program.
- Start/end dates.
- Course count if available.

Copy must avoid implying course creation starts from the intake nav item. Course creation remains program-centered.

### 6.5 Quizzes (`/quizzes-v3`)

Move under `Academic` and refresh page framing.

Copy should position quizzes as assessments assigned to courses/classes. Keep quiz authoring internals out of this work.

### 6.6 Question Bank (`/quizzes-v3/question-bank`)

Move under `Academic` and refresh page framing.

Copy should position the page as reusable questions backing quizzes. Keep existing filters/actions unless they conflict with the refreshed card/list presentation.

### 6.7 Course Roles (`/course-roles`)

Move under `Academic` because course roles describe people's relationships to courses.

Apply the shared academic header/surface. Do not deeply redesign permissions or role semantics in this work.

---

## 7. Error Handling

- If subject usage stats fail on `/subjects`, show the subject catalog with a muted `Usage unavailable` state.
- If Academic Hub aggregate stats fail, keep the current course list behavior and show the facet error/loading state in the filter area.
- The `/subjects` all-course toggle must be URL-backed so refresh and browser back/forward preserve it.
- Backend aggregation failures should return clear errors rather than silently falling back to incorrect counts.

---

## 8. Compatibility

- Preserve URLs:
  - `/courses`
  - `/subjects`
  - `/programs`
  - `/intakes`
  - `/quizzes-v3`
  - `/quizzes-v3/question-bank`
  - `/course-roles`
- Preserve existing role gates.
- Preserve existing CRUD/action routes.
- Do not remove `/intakes` from navigation.
- Do not introduce a separate sidebar `Courses` item.

---

## 9. Testing And Acceptance Checks

### Backend

- Subject usage counts `Course.subject`.
- Subject usage counts `CourseSubject`.
- A course is not double-counted when both relations reference the same subject.
- Current/default usage follows Academic Hub status semantics.
- `include_all_courses` includes planned/ended/history according to existing course statuses.
- Academic Hub subject aggregate includes multi-subject courses.

### Frontend

- Sidebar shows the new `Academic` section with the approved items.
- Academic pages no longer appear under `Management`.
- `/courses` remains labeled `Academic Hub`.
- `/subjects` defaults to active/current usage.
- `/subjects` all-course toggle updates URL state and refreshes stats.
- `/subjects` card/list shows program usage context clearly for multi-program tenants.
- Existing create/edit/detail links still work.

### Manual multi-program checks

- A multi-program tenant can distinguish org-wide subject catalog usage from program-specific offerings.
- A subject used only through `CourseSubject` appears in Academic Hub subject counts.
- Course creation still starts from the program-centered course creation flow, not from the intake list.

---

## 10. Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Scope is larger than a simple sidebar cleanup | Keep route changes out of scope; refresh list surfaces but avoid detail/workflow rewrites. |
| Subject usage queries become expensive | Centralize the service and test query shape. Use grouped counts and distinct course IDs. |
| Academic Hub and `/subjects` drift again | Shared backend aggregation and shared frontend usage representations. |
| Users expect `Courses` wording | Keep `/courses` as `Academic Hub`; avoid duplicate nav items that recreate clutter. |
| Card refresh hides dense data | Use card-forward pages but preserve search/filter actions and detail links. |

