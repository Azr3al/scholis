# User Profile Course Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Academic Hub-style server-side course search to the user record Courses pane, scoped to the profile subject's enrollments.

**Architecture:** Dual-mode `RecordCourseList` — empty `q` keeps the existing client-side path; non-empty `q` calls `POST /courses/search` with `user_courses__user_id` (and optional `id__in` for Your classes scope), then merges results with embedded enrollment metadata. URL state via `nuqs` (`q`, `page`).

**Tech Stack:** Next.js App Router, TanStack Query v4, `nuqs`, Vitest, existing `searchEntities` client API.

**Design spec:** [`docs/superpowers/specs/2026-06-27-user-profile-course-search-design.md`](../specs/2026-06-27-user-profile-course-search-design.md)

---

## File map

| File | Responsibility |
| --- | --- |
| `src/helpers/profile-courses/build-profile-course-filter-params.ts` | Build search `filter_params` |
| `src/helpers/profile-courses/build-profile-course-filter-params.test.ts` | Unit tests |
| `src/helpers/profile-courses/merge-search-with-enrollments.ts` | Join API courses with enrollments |
| `src/helpers/profile-courses/merge-search-with-enrollments.test.ts` | Unit tests |
| `src/hooks/profile-courses/use-profile-course-filters.ts` | `nuqs` for `q` + `page` |
| `src/hooks/profile-courses/use-profile-course-search.ts` | React Query search hook |
| `src/components/record/academic/record-course-list.tsx` | Search UI + dual-mode list |

---

### Task 1: Filter params helper

**Files:**
- Create: `src/helpers/profile-courses/build-profile-course-filter-params.ts`
- Create: `src/helpers/profile-courses/build-profile-course-filter-params.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/helpers/profile-courses/build-profile-course-filter-params.test.ts
import { describe, expect, it } from "vitest";
import { buildProfileCourseFilterParams } from "./build-profile-course-filter-params";
import { operatorEnum } from "@/types/api";

describe("buildProfileCourseFilterParams", () => {
  it("scopes to subject enrollments", () => {
    expect(
      buildProfileCourseFilterParams({
        subjectId: "42",
        scope: "all",
        sharedIds: [],
      }),
    ).toEqual({
      filter_params: [
        {
          field_name: "user_courses__user_id",
          operator: operatorEnum.exact,
          value: "42",
        },
      ],
    });
  });

  it("adds id__in when scope is your and sharedIds present", () => {
    expect(
      buildProfileCourseFilterParams({
        subjectId: 7,
        scope: "your",
        sharedIds: [10, 20],
      }),
    ).toEqual({
      filter_params: [
        {
          field_name: "user_courses__user_id",
          operator: operatorEnum.exact,
          value: "7",
        },
        {
          field_name: "id",
          operator: operatorEnum.in,
          value: "10,20",
        },
      ],
    });
  });

  it("omits id__in when scope is your but sharedIds empty", () => {
    const result = buildProfileCourseFilterParams({
      subjectId: "1",
      scope: "your",
      sharedIds: [],
    });
    expect(result.filter_params).toHaveLength(1);
    expect(result.filter_params[0].field_name).toBe("user_courses__user_id");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/build-profile-course-filter-params.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

```ts
// src/helpers/profile-courses/build-profile-course-filter-params.ts
import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";

export type ProfileCourseScope = "your" | "all";

export interface BuildProfileCourseFilterParamsArgs {
  subjectId: number | string;
  scope: ProfileCourseScope;
  sharedIds: number[];
}

export function buildProfileCourseFilterParams(
  args: BuildProfileCourseFilterParamsArgs,
): Required<Pick<filterParamsBody, "filter_params">> {
  const filter_params: filterParam[] = [
    {
      field_name: "user_courses__user_id",
      operator: operatorEnum.exact,
      value: String(args.subjectId),
    },
  ];

  if (args.scope === "your" && args.sharedIds.length > 0) {
    filter_params.push({
      field_name: "id",
      operator: operatorEnum.in,
      value: args.sharedIds.join(","),
    });
  }

  return { filter_params };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/build-profile-course-filter-params.test.ts`
Expected: PASS (3 tests)

---

### Task 2: Merge search results with enrollments

**Files:**
- Create: `src/helpers/profile-courses/merge-search-with-enrollments.ts`
- Create: `src/helpers/profile-courses/merge-search-with-enrollments.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/helpers/profile-courses/merge-search-with-enrollments.test.ts
import { describe, expect, it } from "vitest";
import { mergeSearchWithEnrollments } from "./merge-search-with-enrollments";
import { seniorityEnum } from "@/types/course";

describe("mergeSearchWithEnrollments", () => {
  const enrollments = [
    {
      id: 100,
      course: { id: 1, title: "Math A", code: "M1", status: "active" },
      assigned_as_role: { name: "Student", seniority: null },
    },
    {
      id: 101,
      course: { id: 2, title: "Physics", code: "P1", status: "active" },
      assigned_as_role: {
        name: "Teacher",
        seniority: seniorityEnum.MAIN_TEACHER,
      },
    },
  ];

  it("merges course search rows with enrollment metadata", () => {
    const rows = mergeSearchWithEnrollments({
      courses: [
        {
          id: 1,
          title: "Math A",
          code: "M1",
          status: "active",
        },
        {
          id: 99,
          title: "Orphan",
          code: "X",
          status: "active",
        },
      ],
      enrollments,
      sharedIds: [1],
      calendarEvents: [],
      tenantTimezone: "Asia/Yangon",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userCourseId: 100,
      courseId: 1,
      title: "Math A",
      assignedRoleName: "Student",
      isShared: true,
    });
  });

  it("sorts by role seniority rank", () => {
    const rows = mergeSearchWithEnrollments({
      courses: [
        { id: 1, title: "Math A", status: "active" },
        { id: 2, title: "Physics", status: "active" },
      ],
      enrollments,
      sharedIds: [],
      calendarEvents: [],
      tenantTimezone: null,
    });

    expect(rows.map((r) => r.courseId)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/merge-search-with-enrollments.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement merge helper**

```ts
// src/helpers/profile-courses/merge-search-with-enrollments.ts
import { nextSessionLabelForCourse } from "@/helpers/record-academic/calendar-sessions";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";
import type { RecordCourseRowData } from "@/components/record/academic/record-course-row";
import { seniorityEnum } from "@/types/course";
import type { courseType } from "@/types/course";

type EnrollmentRow = {
  id: number;
  course?: courseType | number | null;
  assigned_as_role?: { name?: string; seniority?: string | null } | null;
};

function roleSeniorityRank(seniority: string | null | undefined): number {
  if (seniority === seniorityEnum.MAIN_TEACHER) return 0;
  if (seniority === seniorityEnum.ASSISTANT_TEACHER) return 1;
  return 2;
}

function enrollmentByCourseId(
  enrollments: EnrollmentRow[],
): Map<number, EnrollmentRow> {
  const map = new Map<number, EnrollmentRow>();
  for (const row of enrollments) {
    const c = row.course;
    const id = typeof c === "object" && c != null ? c.id : typeof c === "number" ? c : null;
    if (id != null) map.set(id, row);
  }
  return map;
}

export interface MergeSearchWithEnrollmentsArgs {
  courses: courseType[];
  enrollments: EnrollmentRow[];
  sharedIds: number[];
  calendarEvents: ProfileCalendarEventLike[];
  tenantTimezone?: string | null;
}

export function mergeSearchWithEnrollments(
  args: MergeSearchWithEnrollmentsArgs,
): (RecordCourseRowData & { roleSeniority?: string | null })[] {
  const byCourseId = enrollmentByCourseId(args.enrollments);
  const shared = new Set(args.sharedIds);

  const rows = args.courses.flatMap((course) => {
    const courseId = course.id;
    if (courseId == null) return [];
    const enrollment = byCourseId.get(courseId);
    if (!enrollment) return [];

    return [
      {
        userCourseId: enrollment.id,
        courseId,
        title: course.title ?? "Untitled course",
        code: course.code ?? null,
        status: course.status,
        assignedRoleName: enrollment.assigned_as_role?.name,
        roleSeniority: enrollment.assigned_as_role?.seniority,
        program: course.program,
        level: course.level,
        section: course.section,
        subject: course.subject ?? undefined,
        course_subjects: course.course_subjects ?? undefined,
        weekday_pattern: course.weekday_pattern,
        time_pattern: course.time_pattern,
        first_event_time_from: course.first_event_time_from,
        first_event_time_to: course.first_event_time_to,
        nextSessionLabel: nextSessionLabelForCourse(
          courseId,
          args.calendarEvents,
          args.tenantTimezone,
        ),
        isShared: shared.has(courseId),
      },
    ];
  });

  return rows.sort(
    (a, b) =>
      roleSeniorityRank(a.roleSeniority) - roleSeniorityRank(b.roleSeniority),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/merge-search-with-enrollments.test.ts`
Expected: PASS (2 tests)

---

### Task 3: URL filter hook

**Files:**
- Create: `src/hooks/profile-courses/use-profile-course-filters.ts`

- [ ] **Step 1: Implement hook**

```ts
// src/hooks/profile-courses/use-profile-course-filters.ts
"use client";

import { useCallback, useMemo } from "react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";

const parsers = {
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
};

export function useProfileCourseFilters() {
  const [raw, setRaw] = useQueryStates(parsers, { history: "replace" });

  const state = useMemo(
    () => ({
      q: raw.q ?? "",
      page: raw.page ?? 1,
    }),
    [raw],
  );

  const setQ = useCallback((q: string) => setRaw({ q, page: 1 }), [setRaw]);
  const setPage = useCallback((page: number) => setRaw({ page }), [setRaw]);
  const clearQ = useCallback(() => setRaw({ q: "", page: 1 }), [setRaw]);

  return { state, setQ, setPage, clearQ };
}
```

No dedicated test file — covered by integration in `RecordCourseList` manual QA.

---

### Task 4: Search query hook

**Files:**
- Create: `src/hooks/profile-courses/use-profile-course-search.ts`

- [ ] **Step 1: Implement hook**

```ts
// src/hooks/profile-courses/use-profile-course-search.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import {
  buildProfileCourseFilterParams,
  type ProfileCourseScope,
} from "@/helpers/profile-courses/build-profile-course-filter-params";
import { courseType } from "@/types/course";

export const PROFILE_COURSE_PAGE_SIZE = 10;

const EXPAND = [
  "program",
  "level",
  "section",
  "subject",
  "course_subjects",
  "course_subjects.subject",
];

export interface UseProfileCourseSearchArgs {
  subjectId: string;
  q: string;
  page: number;
  scope: ProfileCourseScope;
  sharedIds: number[];
  enabled?: boolean;
}

export interface ProfileCourseSearchResult {
  rows: courseType[];
  totalCount: number;
  totalPages: number;
  usedFallback: boolean;
}

export function useProfileCourseSearch({
  subjectId,
  q,
  page,
  scope,
  sharedIds,
  enabled = true,
}: UseProfileCourseSearchArgs) {
  const trimmed = q.trim();
  const scopeBlocksSearch = scope === "your" && sharedIds.length === 0;

  return useQuery({
    queryKey: [
      "profile-course-search",
      subjectId,
      trimmed,
      page,
      scope,
      sharedIds.join(","),
    ],
    enabled: enabled && trimmed.length > 0 && !scopeBlocksSearch,
    keepPreviousData: true,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<ProfileCourseSearchResult> => {
      const { filter_params } = buildProfileCourseFilterParams({
        subjectId,
        scope,
        sharedIds,
      });

      const res = await searchEntities(
        "courses",
        {
          page,
          size: PROFILE_COURSE_PAGE_SIZE,
          q: trimmed,
          sorts: ["-created_at"],
          expand: EXPAND,
        },
        { filter_params },
        { signal },
      );

      const payload = res.data ?? {};
      const rows = (payload.data ?? []) as courseType[];
      const totalCount = payload.count ?? rows.length;
      const totalPages = payload.total_pages ?? Math.max(1, Math.ceil(totalCount / PROFILE_COURSE_PAGE_SIZE));

      return {
        rows,
        totalCount,
        totalPages,
        usedFallback: Boolean(payload.used_fallback),
      };
    },
  });
}
```

---

### Task 5: Wire search into RecordCourseList

**Files:**
- Modify: `src/components/record/academic/record-course-list.tsx`

- [ ] **Step 1: Add imports**

Add to top of `record-course-list.tsx`:

```ts
import { useEffect, useState } from "react"; // useEffect already imported — merge if present
import { useDebouncedCallback } from "use-debounce";
import { Search } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import { useProfileCourseFilters } from "@/hooks/profile-courses/use-profile-course-filters";
import { useProfileCourseSearch } from "@/hooks/profile-courses/use-profile-course-search";
import { mergeSearchWithEnrollments } from "@/helpers/profile-courses/merge-search-with-enrollments";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets"; // already imported
```

- [ ] **Step 2: Add search state and query inside component**

After existing `const [page, setPage] = useState(1);`, add:

```ts
const { state: urlFilters, setQ, setPage: setUrlPage, clearQ } = useProfileCourseFilters();
const debouncedQ = urlFilters.q.trim();
const isSearchMode = debouncedQ.length > 0;

const setQDebounced = useDebouncedCallback(setQ, 200);
const [draftQ, setDraftQ] = useState(urlFilters.q);
useEffect(() => setDraftQ(urlFilters.q), [urlFilters.q]);

const searchQuery = useProfileCourseSearch({
  subjectId,
  q: debouncedQ,
  page: urlFilters.page,
  scope,
  sharedIds,
  enabled: isSearchMode && !loading,
});
```

- [ ] **Step 3: Build search-mode row data**

After `sortedRowData` useMemo, add:

```ts
const searchRowData = useMemo(() => {
  if (!isSearchMode || !searchQuery.data) return [];
  return mergeSearchWithEnrollments({
    courses: searchQuery.data.rows,
    enrollments: subjectCourses,
    sharedIds,
    calendarEvents,
    tenantTimezone,
  });
}, [
  isSearchMode,
  searchQuery.data,
  subjectCourses,
  sharedIds,
  calendarEvents,
  tenantTimezone,
]);

const displayRowData = isSearchMode ? searchRowData : paginatedRowData;
const displayTotalPages = isSearchMode
  ? (searchQuery.data?.totalPages ?? 1)
  : totalPages;
const displayPage = isSearchMode ? urlFilters.page : page;
const handlePageChange = isSearchMode ? setUrlPage : setPage;
```

- [ ] **Step 4: Add search input to toolbar**

Inside the toolbar `div` (before scope toggles), add:

```tsx
<div className="relative w-full min-w-[13rem] max-w-xs sm:w-auto">
  <Search
    width={15}
    height={15}
    aria-hidden
    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
  />
  <Input
    aria-label="Search courses"
    placeholder="Search title, code, subject, level, section…"
    value={draftQ}
    onChange={(e) => {
      setDraftQ(e.target.value);
      setQDebounced(e.target.value);
    }}
    className="h-8 w-full pl-8 text-sm sm:w-64"
  />
</div>
```

- [ ] **Step 5: Update count line and list rendering**

Replace count paragraph and list section to branch on search mode:

```tsx
<p className="text-xs text-text-muted">
  {isSearchMode ? (
    <>
      {searchQuery.data?.totalCount ?? 0} match
      {(searchQuery.data?.totalCount ?? 0) === 1 ? "" : "es"}
      {searchQuery.data?.usedFallback ? " (showing close matches)" : ""}
    </>
  ) : (
    <>
      {activeCount} active · {subjectCourses.length} total
    </>
  )}
</p>

{searchQuery.isError && isSearchMode ? (
  <div className="rounded-md border border-border bg-card p-3 text-sm" role="alert">
    <p className="text-destructive font-medium">Could not search courses.</p>
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-2"
      onClick={() => void searchQuery.refetch()}
    >
      Retry
    </Button>
  </div>
) : null}

{/* Replace sortedRowData.length checks with appropriate search vs client empty logic */}
{isSearchMode && searchQuery.isLoading ? (
  <div className="flex flex-col gap-2 py-4" aria-busy="true">
    <Skeleton className="h-16 w-full" />
    <Skeleton className="h-16 w-full" />
  </div>
) : displayRowData.length === 0 ? (
  /* existing empty states + new search empty: */
  isSearchMode ? (
    <EmptyState
      action={
        <button
          type="button"
          onClick={clearQ}
          className="text-sm text-accent hover:underline"
        >
          Clear search
        </button>
      }
    >
      <EmptyCopy {...EMPTY_COPY_PRESETS.noCoursesFound} />
    </EmptyState>
  ) : (
    /* keep existing non-search empty branches unchanged */
  )
) : (
  <>
    <motion.div
      variants={staggerList}
      initial="hidden"
      animate="show"
      className={cn(
        "flex flex-col gap-2 transition-opacity",
        isSearchMode && searchQuery.isFetching && "opacity-60",
      )}
    >
      {displayRowData.map((row) => (
        <RecordCourseRow key={row.userCourseId} row={row} />
      ))}
    </motion.div>
    <ControlledPagination
      page={displayPage}
      totalPages={displayTotalPages}
      onPageChange={handlePageChange}
      className="pt-2"
    />
  </>
)}
```

- [ ] **Step 6: Reset client page when scope/status changes (unchanged) and disable status chip effect when searching**

Optionally dim Active/All chips when `isSearchMode` (`aria-disabled` + `opacity-50`) to signal they are ignored — visual only, no click blocking required.

- [ ] **Step 7: Run unit tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/`
Expected: PASS (all profile-courses tests)

- [ ] **Step 8: Run lint on touched files**

Run: `cd schedjuice-reimagined-fe && npm run lint`
Expected: no new errors in modified files

- [ ] **Step 9: Manual smoke test**

1. Open `/users/{studentId}?section=academic&pane=courses`
2. Type a course title fragment — results filter via server
3. Confirm URL updates with `q=`
4. Clear search — client list returns
5. Teacher viewing student: **Your classes** + search respects shared scope

---

## Plan self-review

| Spec requirement | Task |
| --- | --- |
| Hub-style search input | Task 5 Step 4 |
| Server-side FTS | Task 4 |
| Subject enrollment scope | Task 1 `user_courses__user_id` |
| Your classes `id__in` | Task 1 |
| Status ignored when searching | Task 5 (no status in filter params; optional chip dim) |
| URL `q` + `page` | Task 3 |
| Dual-mode list | Task 5 |
| `used_fallback` hint | Task 5 Step 5 |
| Empty / error states | Task 5 Step 5 |
| Unit tests | Tasks 1–2 |
| No backend changes | ✓ |

No placeholders remain. Types align across tasks (`ProfileCourseScope`, `RecordCourseRowData`).
