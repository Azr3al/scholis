# User Profile — Courses Pane Performance — Design Spec

> Fix initial-load freeze on the user record Academic → Courses pane for subjects with 150+ enrollments (e.g. teachers with 185 active / 1,000+ total).

**Status:** Approved (brainstorming 2026-06-27)  
**Authority:** [`DESIGN.md`](../../../DESIGN.md)  
**Parent specs:** [`2026-06-22-user-record-academic-design.md`](2026-06-22-user-record-academic-design.md), [`2026-06-27-user-profile-course-search-design.md`](2026-06-27-user-profile-course-search-design.md)  
**Approach:** Paginated course loading (Approach 2 from brainstorming)  
**Date:** 2026-06-27

---

## 1. Problem

Teachers and admins opening `/users/[id]?section=academic` experience a **multi-second freeze on first load** when the subject has many enrollments (150+ active, 1,000+ total observed in production).

Symptoms: long `RecordPageSkeleton`, then UI lock-up before the course list becomes interactive.

### Root causes (confirmed in code)

| Layer | Issue |
| --- | --- |
| **User fetch** | `USER_PROFILE_EXPAND` embeds **all** `user_courses` with full course graph (program, level, section, role). Profile shell blocked until entire payload parses. |
| **Calendar bootstrap** | `getUserCourseEvents` loads **every** enrolled course with **all** events (`size: -1`, `expand: ["events"]`) as soon as `user` resolves — even before Academic is visible. |
| **Main-thread work** | `RecordCourseList` builds `rowData` for **all** filtered enrollments; `nextSessionLabelForCourse` calls `getUpcomingSessions` (full event scan + sort) **per course** — O(courses × events). |
| **Duplicate fetch** | Viewer `user-courses` loaded in both `RecordAcademic` and `RecordCourseList`. |

Pagination (10 rows/page) and server-side search (shipped 2026-06-27) help **interaction** but not **first paint** — the heavy payloads load before the list renders.

---

## 2. Goals

1. **Profile shell paints in &lt;1s** for heavy enrollments — header, stats, section rail usable without waiting for full course list.
2. **Courses pane interactive quickly** — first page of courses visible without downloading all enrollments.
3. **Preserve existing UX** — filters (Your classes / All, Active / All), search, pagination, This week agenda, Schedule pane behavior unchanged from user perspective.
4. **Scale with enrollment count** — network and CPU cost proportional to visible page + calendar window, not total enrollments.

### Non-goals

- Redesigning `RecordCourseRow` or pane IA.
- Changing search semantics (see course-search spec).
- Optimizing Academic Hub, assign-courses flow, or unrelated profile sections beyond removing dependency on embedded `user_courses`.
- Virtual scrolling (pagination is sufficient at page size 10).

---

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Strategy | **Paginated course loading** — stop embedding all enrollments on user fetch |
| User fetch | Remove `user_courses*` from `USER_PROFILE_EXPAND` |
| Course list (no search) | Server-paginated `POST /user-courses/search` with scope + status filters |
| Course list (search) | Unchanged — `POST /courses/search` via `useProfileCourseSearch` |
| Counts line | `{activeCount} active · {totalCount} total` from dedicated count queries |
| Teaching stat | Lightweight count query (not full enrollment embed) |
| Shared / Your classes | `viewerTeachingCourseIds` from viewer query + `course_id__in` server filter — no need for full subject enrollment list |
| Calendar (Courses pane) | Windowed **events search** (`date >= today`, ~14-day horizon) scoped by `course__user_courses__user_id` |
| Calendar (Schedule pane) | Broader window or on-demand load when pane opens; defer full historical event load |
| Session labels | Precompute `Map<courseId, label>` once per calendar payload — never per-row rescan |
| Page size | 10 (unchanged) |
| Backend changes | Allowed but minimal — prefer existing search endpoints; add summary endpoint only if count queries prove insufficient |

---

## 4. Architecture

### 4.1 Data flow (after)

```
/users/[id]?section=academic
  → fetch user (NO user_courses)                    ← fast shell
  → parallel (when profile id known):
      ├─ useProfileEnrollmentCounts(subjectId)     ← total + active counts
      ├─ useProfileTeachingCount(subjectId)          ← stats header (teachers)
      ├─ useViewerTeachingCourseIds(viewerId)        ← shared scope (cached, ids only)
      ├─ useProfileCourseList({ page, scope, status }) ← page of enrollments
      └─ useProfileUpcomingEvents(subjectId)         ← only when section=academic
           → buildNextSessionByCourseId map once
  → RecordCourseList renders page rows + This week agenda
```

### 4.2 New / modified units

| File | Action | Responsibility |
| --- | --- | --- |
| `src/app/(internal)/users/[id]/page.tsx` | Modify | Slim expand; defer calendar; teaching count hook; gate event queries on `section` |
| `src/hooks/profile-courses/use-profile-enrollment-counts.ts` | Create | Parallel count queries for total + active enrollments |
| `src/hooks/profile-courses/use-profile-course-list.ts` | Create | Paginated `user-courses` search with filters + expand |
| `src/hooks/profile-courses/use-viewer-teaching-course-ids.ts` | Create | Viewer teaching course IDs (fields: `course_id`, role seniority); shared cache key |
| `src/hooks/profile-courses/use-profile-upcoming-events.ts` | Create | Windowed events search for profile calendar |
| `src/helpers/profile-courses/build-user-course-filter-params.ts` | Create | Filter params: `user_id`, optional `course_id__in`, optional `course__status__in` |
| `src/helpers/profile-courses/build-next-session-by-course-id.ts` | Create | Single-pass map from events → next session label |
| `src/helpers/record-academic/calendar-sessions.ts` | Modify | `nextSessionLabelForCourse` accepts optional precomputed map |
| `src/helpers/record-academic/shared-courses.ts` | Modify | `sharedCourseIdsFromTeachingIds(viewerTeachingIds, subjectCourseIds?)` — server-side scope avoids full subject list |
| `src/components/record/academic/record-course-list.tsx` | Modify | Consume hooks; remove embedded `subject.user_courses` dependency |
| `src/components/record/sections/record-academic.tsx` | Modify | Remove duplicate viewer fetch; pass teaching ids / events from parent or hooks |

---

## 5. API contracts

### 5.1 Slim user fetch

```ts
const USER_PROFILE_EXPAND = [
  "visibility",
  "user_events",
] as const;
// user_courses* removed
```

Other profile sections that still read `user.user_courses` must be updated in this pass or given their own paginated fetch (audit during implementation).

### 5.2 Enrollment counts

Two lightweight searches (page 1, size 1 — use `count` from response):

```ts
// Total
searchEntities("user-courses", { page: 1, size: 1 }, {
  filter_params: [{ field_name: "user_id", operator: "exact", value: subjectId }],
});

// Active (course.status ∈ { active, planned })
searchEntities("user-courses", { page: 1, size: 1 }, {
  filter_params: [
    { field_name: "user_id", operator: "exact", value: subjectId },
    { field_name: "course__status", operator: "in", value: "active,planned" },
  ],
});
```

If both counts are needed on every Academic visit, batch via `Promise.all`. Show `— active · — total` skeleton until resolved.

### 5.3 Paginated course list (browse mode, `q` empty)

```ts
searchEntities(
  "user-courses",
  {
    page,
    size: 10,
    expand: [
      "assigned_as_role",
      "course",
      "course.program",
      "course.level",
      "course.section",
      "course.subject",
      "course.course_subjects",
      "course.course_subjects.subject",
    ],
    queryParams: { teacher_roster_order: "true" }, // seniority sort server-side
  },
  { filter_params: buildUserCourseFilterParams({ subjectId, scope, status, sharedCourseIds }) },
);
```

**Filter params (`buildUserCourseFilterParams`):**

| Filter | Params |
| --- | --- |
| Always | `user_id = subjectId` |
| Scope = your + shared ids | `course_id__in = sharedCourseIds.join(",")` |
| Scope = your + no shared | Skip list query; show existing empty state |
| Status = active | `course__status__in = active,planned` |
| Status = all | (no status filter) |

Map response rows directly to `RecordCourseRowData` — no client-side filter/sort of full enrollment set.

### 5.4 Viewer teaching IDs (Your classes scope)

```ts
searchEntities(
  "user-courses",
  {
    size: -1,
    fields: ["course_id", "assigned_as_role.seniority", "course.status"],
    expand: ["assigned_as_role", "course"],
  },
  { filter_params: [{ field_name: "user_id", operator: "exact", value: viewerId }] },
);
```

Then `viewerTeachingCourseIds()` client-side (same seniority rules as today).

**Follow-up optimization (optional):** If the viewer also has 150+ courses, replace with a backend filter on seniority — out of scope unless needed in QA.

**Shared IDs for scope:** Intersection not required client-side when listing — pass `course_id__in = viewerTeachingIds` directly to subject's user-courses search. Badge `isShared` = course id ∈ viewerTeachingIds set.

### 5.5 Windowed upcoming events

Replace `getUserCourseEvents` (all courses × all events) for Academic bootstrap:

```ts
searchEntities(
  "events",
  {
    size: -1, // bounded by date window, not enrollment count
    expand: ["course"],
    fields: ["id", "title", "date", "time_from", "time_to", "course"],
    sorts: ["date", "time_from"],
  },
  {
    filter_params: [
      { field_name: "course__user_courses__user_id", operator: "exact", value: subjectId },
      { field_name: "date", operator: "gte", value: startIso }, // tenant today 00:00
      { field_name: "date", operator: "lte", value: endIso },   // today + 14 days
    ],
  },
);
```

- **Enabled when:** `section === "academic"` (not on every profile visit).
- **Schedule pane:** On pane switch to `schedule`, extend window (e.g. ±3 months) or reuse existing calendar query pattern — load progressively, show skeleton in schedule zone only.
- **Students:** Keep assignment events query but scope to active enrollments via `course__user_courses__user_id` instead of `courseIds.join(",")` from embedded list.

### 5.6 Teaching courses stat (`UserProfileStats`)

Replace `countTeachingAssignmentsDistinctCourses(user.user_courses)` with count query:

```ts
searchEntities("user-courses", { page: 1, size: 1 }, {
  filter_params: [
    { field_name: "user_id", operator: "exact", value: subjectId },
    { field_name: "assigned_as_role__seniority", operator: "in", value: "MAIN_TEACHER,ASSISTANT_TEACHER" },
    { field_name: "course__status", operator: "in", value: "active,planned" },
  ],
});
```

Use `count` for display; hide stat when 0 (same as today). Verify filter field names against backend search allowlist during implementation.

---

## 6. UI behavior

### 6.1 Loading states

| Zone | Behavior |
| --- | --- |
| Profile shell | Renders as soon as slim user fetch completes |
| Stats header | Skeleton for teaching count until count query resolves |
| Counts line | `— active · — total` until count queries resolve |
| Course list | Skeleton rows until page 1 list query resolves |
| Next-session labels | Row renders without label until events map ready; label fades in (no list remount) |
| This week | Hidden until events query resolves; unchanged once data present |

### 6.2 Unchanged UX

- Toolbar: search, Your classes / All, Active / All, Assign courses
- Search mode: server-side (existing spec)
- Pagination: client page state (browse) / URL page (search)
- Empty states: same copy and actions
- Motion: `staggerList` on visible page only (10 rows max)

---

## 7. Frontend fixes (included)

1. **`buildNextSessionByCourseId`** — one `getUpcomingSessions` pass → `Map<number, string>`.
2. **Remove duplicate viewer query** — single `useViewerTeachingCourseIds` with React Query shared key.
3. **Drop `sharedIds.includes(courseId)` in hot loop** — use `Set`.
4. **Gate calendar queries** — `enabled: section === "academic"` minimum; further defer broad schedule load to Schedule pane.

---

## 8. Edge cases

| Case | Behavior |
| --- | --- |
| Subject with 0 enrollments | Counts show `0 active · 0 total`; empty state |
| Viewer with 0 teaching assignments | No Your/All toggle; scope = all |
| Deep link `?section=academic&pane=schedule` | Shell fast; schedule loads wider event window when pane mounts |
| Invalidate profile after assign-courses | Invalidate count + list queries (not monolithic user expand) |
| Search + browse switch | Unchanged (course-search spec) |
| Backend filter field unsupported | Implementation verifies fields; fallback to minimal BE addition in `UserCourseSearchView` only if needed |

---

## 9. Testing

### Unit (Vitest)

- `buildUserCourseFilterParams` — subject only; + status active; + scope your with course ids
- `buildNextSessionByCourseId` — correct label per course; empty events → empty map
- `sharedCourseIdsFromTeachingIds` / scope badge logic

### Manual

1. Teacher with 150+ active enrollments — profile shell visible &lt;1s; list page 1 without freeze
2. Toggle Active / All — server refetch, pagination resets
3. Your classes scope — correct subset; empty state when no overlap
4. Search still works (regression)
5. This week shows sessions; Schedule pane calendar loads
6. Student profile with many courses — no regression on assignments overlay
7. Light subject (&lt;20 courses) — no UX regression

### Success criteria

- No main-thread lockup &gt;500ms after shell paint on 150+ enrollment fixture
- Initial network payload for user fetch reduced by &gt;90% vs today for 1,000-enrollment teacher

---

## 10. Files touched (implementation reference)

| Action | Path |
| --- | --- |
| Create | `src/hooks/profile-courses/use-profile-enrollment-counts.ts` |
| Create | `src/hooks/profile-courses/use-profile-course-list.ts` |
| Create | `src/hooks/profile-courses/use-viewer-teaching-course-ids.ts` |
| Create | `src/hooks/profile-courses/use-profile-upcoming-events.ts` |
| Create | `src/helpers/profile-courses/build-user-course-filter-params.ts` |
| Create | `src/helpers/profile-courses/build-next-session-by-course-id.ts` |
| Create | `src/helpers/profile-courses/build-user-course-filter-params.test.ts` |
| Create | `src/helpers/profile-courses/build-next-session-by-course-id.test.ts` |
| Modify | `src/app/(internal)/users/[id]/page.tsx` |
| Modify | `src/components/record/academic/record-course-list.tsx` |
| Modify | `src/components/record/sections/record-academic.tsx` |
| Modify | `src/helpers/record-academic/calendar-sessions.ts` |
| Modify | `src/helpers/record-academic/shared-courses.ts` |

---

## 11. Rollout

Single PR to `dev`. No feature flag — behavior equivalent for small enrollments; large enrollments get faster path automatically.
