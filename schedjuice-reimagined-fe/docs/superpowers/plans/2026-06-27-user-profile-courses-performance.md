# User Profile Courses Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate first-load freeze on `/users/[id]?section=academic` for subjects with 150+ enrollments by slimming the profile fetch and loading courses, counts, and calendar data in bounded chunks.

**Architecture:** Remove `user_courses*` from `USER_PROFILE_EXPAND`. Browse mode uses paginated `POST /user-courses/search`; counts and teaching stats use `size: 1` count queries; calendar uses windowed `POST /events/search` scoped by `course__user_courses__user_id`. Search mode stays on `POST /courses/search` but merges enrollment metadata via a small `user-courses` fetch for the current result page only.

**Tech Stack:** Next.js App Router, TanStack Query v4, `nuqs`, Vitest, existing `searchEntities` client API.

**Design spec:** [`docs/superpowers/specs/2026-06-27-user-profile-courses-performance-design.md`](../specs/2026-06-27-user-profile-courses-performance-design.md)

---

## File map

| File | Responsibility |
| --- | --- |
| `src/helpers/profile-courses/build-user-course-filter-params.ts` | Filter params for paginated `user-courses` list |
| `src/helpers/profile-courses/build-next-session-by-course-id.ts` | One-pass map: courseId → next session label |
| `src/helpers/profile-courses/map-user-course-to-row.ts` | Map API enrollment row → `RecordCourseRowData` |
| `src/hooks/profile-courses/use-profile-enrollment-counts.ts` | Total + active enrollment counts |
| `src/hooks/profile-courses/use-profile-has-shared-courses.ts` | Whether viewer teaches any of subject's courses |
| `src/hooks/profile-courses/use-profile-teaching-count.ts` | Teaching stat for profile header |
| `src/hooks/profile-courses/use-viewer-teaching-course-ids.ts` | Viewer's teaching course IDs (shared query key) |
| `src/hooks/profile-courses/use-profile-course-list.ts` | Paginated browse-mode list |
| `src/hooks/profile-courses/use-profile-enrollments-by-course-ids.ts` | Enrollment rows for search-result course IDs |
| `src/hooks/profile-courses/use-profile-upcoming-events.ts` | 14-day events window (Courses pane) |
| `src/hooks/profile-courses/use-profile-schedule-events.ts` | ±3 month events (Schedule pane) |
| `src/app/(internal)/users/[id]/page.tsx` | Slim expand; gated calendar; teaching count hook |
| `src/components/record/academic/record-course-list.tsx` | Wire hooks; remove embedded enrollments |
| `src/components/record/sections/record-academic.tsx` | Remove duplicate viewer fetch; schedule events |
| `src/helpers/record-academic/calendar-sessions.ts` | Optional precomputed map in `nextSessionLabelForCourse` |
| `src/helpers/profile-courses/merge-search-with-enrollments.ts` | Accept optional session map |

---

### Task 1: `buildUserCourseFilterParams`

**Files:**
- Create: `src/helpers/profile-courses/build-user-course-filter-params.ts`
- Create: `src/helpers/profile-courses/build-user-course-filter-params.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/helpers/profile-courses/build-user-course-filter-params.test.ts
import { describe, expect, it } from "vitest";
import { buildUserCourseFilterParams } from "./build-user-course-filter-params";
import { operatorEnum } from "@/types/api";

describe("buildUserCourseFilterParams", () => {
  it("filters by subject user_id", () => {
    expect(
      buildUserCourseFilterParams({
        subjectId: "42",
        scope: "all",
        status: "all",
        viewerTeachingCourseIds: [],
      }),
    ).toEqual({
      filter_params: [
        {
          field_name: "user_id",
          operator: operatorEnum.exact,
          value: "42",
        },
      ],
    });
  });

  it("adds course_id__in for your scope", () => {
    expect(
      buildUserCourseFilterParams({
        subjectId: 7,
        scope: "your",
        status: "all",
        viewerTeachingCourseIds: [10, 20],
      }),
    ).toEqual({
      filter_params: [
        { field_name: "user_id", operator: operatorEnum.exact, value: "7" },
        { field_name: "course_id", operator: operatorEnum.in, value: "10,20" },
      ],
    });
  });

  it("adds course__status for active filter", () => {
    expect(
      buildUserCourseFilterParams({
        subjectId: "1",
        scope: "all",
        status: "active",
        viewerTeachingCourseIds: [],
      }),
    ).toEqual({
      filter_params: [
        { field_name: "user_id", operator: operatorEnum.exact, value: "1" },
        {
          field_name: "course__status",
          operator: operatorEnum.in,
          value: "active,planned",
        },
      ],
    });
  });

  it("combines your scope and active status", () => {
    const result = buildUserCourseFilterParams({
      subjectId: "5",
      scope: "your",
      status: "active",
      viewerTeachingCourseIds: [99],
    });
    expect(result.filter_params).toHaveLength(3);
    expect(result.filter_params.map((p) => p.field_name)).toEqual([
      "user_id",
      "course_id",
      "course__status",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/build-user-course-filter-params.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

```ts
// src/helpers/profile-courses/build-user-course-filter-params.ts
import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";
import { courseStatus } from "@/types/course";

export type UserCourseListScope = "your" | "all";
export type UserCourseListStatus = "active" | "all";

export interface BuildUserCourseFilterParamsArgs {
  subjectId: number | string;
  scope: UserCourseListScope;
  status: UserCourseListStatus;
  viewerTeachingCourseIds: number[];
}

export function buildUserCourseFilterParams(
  args: BuildUserCourseFilterParamsArgs,
): Required<Pick<filterParamsBody, "filter_params">> {
  const filter_params: filterParam[] = [
    {
      field_name: "user_id",
      operator: operatorEnum.exact,
      value: String(args.subjectId),
    },
  ];

  if (args.scope === "your" && args.viewerTeachingCourseIds.length > 0) {
    filter_params.push({
      field_name: "course_id",
      operator: operatorEnum.in,
      value: args.viewerTeachingCourseIds.join(","),
    });
  }

  if (args.status === "active") {
    filter_params.push({
      field_name: "course__status",
      operator: operatorEnum.in,
      value: [courseStatus.active, courseStatus.planned].join(","),
    });
  }

  return { filter_params };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/build-user-course-filter-params.test.ts`  
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/helpers/profile-courses/build-user-course-filter-params.ts src/helpers/profile-courses/build-user-course-filter-params.test.ts
git commit -m "feat(profile): add user-course list filter params helper"
```

---

### Task 2: `buildNextSessionByCourseId`

**Files:**
- Create: `src/helpers/profile-courses/build-next-session-by-course-id.ts`
- Create: `src/helpers/profile-courses/build-next-session-by-course-id.test.ts`
- Modify: `src/helpers/record-academic/calendar-sessions.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/helpers/profile-courses/build-next-session-by-course-id.test.ts
import { describe, expect, it } from "vitest";
import { buildNextSessionByCourseId } from "./build-next-session-by-course-id";

describe("buildNextSessionByCourseId", () => {
  it("returns empty map for no events", () => {
    expect(buildNextSessionByCourseId([], "UTC").size).toBe(0);
  });

  it("maps each course to its earliest upcoming session label", () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const day = `${y}-${m}-${d}`;

    const map = buildNextSessionByCourseId(
      [
        {
          id: 1,
          date: day,
          time_from: "14:00:00",
          time_to: "15:00:00",
          course: { id: 10, title: "Math" },
        },
        {
          id: 2,
          date: day,
          time_from: "16:00:00",
          time_to: "17:00:00",
          course: { id: 10, title: "Math" },
        },
        {
          id: 3,
          date: day,
          time_from: "09:00:00",
          time_to: "10:00:00",
          course: { id: 20, title: "English" },
        },
      ],
      "UTC",
    );

    expect(map.get(10)).toMatch(/14:00/);
    expect(map.get(20)).toMatch(/09:00/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/build-next-session-by-course-id.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement builder + update calendar helper**

```ts
// src/helpers/profile-courses/build-next-session-by-course-id.ts
import { getUpcomingSessions } from "@/helpers/record-academic/calendar-sessions";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";

export function buildNextSessionByCourseId(
  events: ProfileCalendarEventLike[],
  tenantTimezone?: string | null,
): Map<number, string> {
  const upcoming = getUpcomingSessions(events, tenantTimezone, 500);
  const map = new Map<number, string>();
  for (const row of upcoming) {
    if (!map.has(row.courseId)) {
      map.set(row.courseId, row.label);
    }
  }
  return map;
}
```

In `calendar-sessions.ts`, extend `nextSessionLabelForCourse`:

```ts
export function nextSessionLabelForCourse(
  courseId: number,
  events: ProfileCalendarEventLike[],
  tenantTimezone?: string | null,
  precomputed?: Map<number, string>,
): string | null {
  if (precomputed) return precomputed.get(courseId) ?? null;
  const upcoming = getUpcomingSessions(events, tenantTimezone, 50);
  const match = upcoming.find((row) => row.courseId === courseId);
  return match?.label ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/build-next-session-by-course-id.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/helpers/profile-courses/build-next-session-by-course-id.ts src/helpers/profile-courses/build-next-session-by-course-id.test.ts src/helpers/record-academic/calendar-sessions.ts
git commit -m "feat(profile): precompute next-session labels by course id"
```

---

### Task 3: `mapUserCourseToRow`

**Files:**
- Create: `src/helpers/profile-courses/map-user-course-to-row.ts`

- [ ] **Step 1: Add mapper (no test — thin transform; covered by list hook integration)**

```ts
// src/helpers/profile-courses/map-user-course-to-row.ts
import type { RecordCourseRowData } from "@/components/record/academic/record-course-row";

type UserCourseApiRow = {
  id: number;
  course?: {
    id?: number;
    title?: string;
    code?: string | null;
    status?: string;
    program?: RecordCourseRowData["program"];
    level?: RecordCourseRowData["level"];
    section?: RecordCourseRowData["section"];
    subject?: RecordCourseRowData["subject"];
    course_subjects?: RecordCourseRowData["course_subjects"];
    weekday_pattern?: string | null;
    time_pattern?: string | null;
    first_event_time_from?: string | null;
    first_event_time_to?: string | null;
  } | number | null;
  assigned_as_role?: { name?: string; seniority?: string | null } | null;
};

export function mapUserCourseToRow(
  row: UserCourseApiRow,
  opts: {
    nextSessionLabel?: string | null;
    isShared: boolean;
  },
): (RecordCourseRowData & { roleSeniority?: string | null }) | null {
  const course = row.course;
  if (course == null || typeof course !== "object") return null;
  const courseId = course.id;
  if (courseId == null) return null;

  return {
    userCourseId: row.id,
    courseId,
    title: course.title ?? "Untitled course",
    code: course.code ?? null,
    status: course.status,
    assignedRoleName: row.assigned_as_role?.name,
    roleSeniority: row.assigned_as_role?.seniority,
    program: course.program,
    level: course.level,
    section: course.section,
    subject: course.subject ?? undefined,
    course_subjects: course.course_subjects ?? undefined,
    weekday_pattern: course.weekday_pattern,
    time_pattern: course.time_pattern,
    first_event_time_from: course.first_event_time_from,
    first_event_time_to: course.first_event_time_to,
    nextSessionLabel: opts.nextSessionLabel ?? null,
    isShared: opts.isShared,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/helpers/profile-courses/map-user-course-to-row.ts
git commit -m "feat(profile): map user-course API row to RecordCourseRowData"
```

---

### Task 4: Data hooks (counts, teaching IDs, list, events)

**Files:**
- Create: `src/hooks/profile-courses/use-profile-enrollment-counts.ts`
- Create: `src/hooks/profile-courses/use-profile-has-shared-courses.ts`
- Create: `src/hooks/profile-courses/use-profile-teaching-count.ts`
- Create: `src/hooks/profile-courses/use-viewer-teaching-course-ids.ts`
- Create: `src/hooks/profile-courses/use-profile-course-list.ts`
- Create: `src/hooks/profile-courses/use-profile-enrollments-by-course-ids.ts`
- Create: `src/hooks/profile-courses/use-profile-upcoming-events.ts`
- Create: `src/hooks/profile-courses/use-profile-schedule-events.ts`

- [ ] **Step 1: `useViewerTeachingCourseIds`**

```ts
// src/hooks/profile-courses/use-viewer-teaching-course-ids.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { viewerTeachingCourseIds } from "@/helpers/record-academic/shared-courses";
import { operatorEnum } from "@/types/api";

export const VIEWER_TEACHING_COURSE_IDS_KEY = "viewerTeachingCourseIds";

export function useViewerTeachingCourseIds(viewerId: number | undefined) {
  return useQuery({
    queryKey: [VIEWER_TEACHING_COURSE_IDS_KEY, viewerId],
    enabled: Boolean(viewerId),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await searchEntities(
        "user-courses",
        {
          size: -1,
          expand: ["assigned_as_role", "course"],
          fields: ["course_id", "assigned_as_role.seniority", "course.status"],
        },
        {
          filter_params: [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: String(viewerId),
            },
          ],
        },
      );
      return viewerTeachingCourseIds(res.data?.data ?? []);
    },
  });
}
```

- [ ] **Step 2: `useProfileEnrollmentCounts`**

```ts
// src/hooks/profile-courses/use-profile-enrollment-counts.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { courseStatus } from "@/types/course";

async function countUserCourses(filter_params: Parameters<typeof searchEntities>[2]["filter_params"]) {
  const res = await searchEntities("user-courses", { page: 1, size: 1 }, { filter_params });
  return res.data?.count ?? 0;
}

export function useProfileEnrollmentCounts(subjectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["profileEnrollmentCounts", subjectId],
    enabled: enabled && Boolean(subjectId),
    staleTime: 30_000,
    queryFn: async () => {
      const base = [
        { field_name: "user_id", operator: operatorEnum.exact, value: String(subjectId) },
      ];
      const [totalCount, activeCount] = await Promise.all([
        countUserCourses(base),
        countUserCourses([
          ...base,
          {
            field_name: "course__status",
            operator: operatorEnum.in,
            value: [courseStatus.active, courseStatus.planned].join(","),
          },
        ]),
      ]);
      return { totalCount, activeCount };
    },
  });
}
```

- [ ] **Step 3: `useProfileHasSharedCourses`**

Uses count query: subject enrollments where `course_id__in` viewer teaching IDs.

```ts
// src/hooks/profile-courses/use-profile-has-shared-courses.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export function useProfileHasSharedCourses(
  subjectId: string | undefined,
  viewerTeachingCourseIds: number[],
  enabled = true,
) {
  return useQuery({
    queryKey: ["profileHasSharedCourses", subjectId, viewerTeachingCourseIds.join(",")],
    enabled: enabled && Boolean(subjectId) && viewerTeachingCourseIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await searchEntities(
        "user-courses",
        { page: 1, size: 1 },
        {
          filter_params: [
            { field_name: "user_id", operator: operatorEnum.exact, value: String(subjectId) },
            {
              field_name: "course_id",
              operator: operatorEnum.in,
              value: viewerTeachingCourseIds.join(","),
            },
          ],
        },
      );
      return (res.data?.count ?? 0) > 0;
    },
  });
}
```

- [ ] **Step 4: `useProfileTeachingCount`**

```ts
// src/hooks/profile-courses/use-profile-teaching-count.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { courseStatus, seniorityEnum } from "@/types/course";

export function useProfileTeachingCount(subjectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["profileTeachingCount", subjectId],
    enabled: enabled && Boolean(subjectId),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await searchEntities(
        "user-courses",
        { page: 1, size: 1 },
        {
          filter_params: [
            { field_name: "user_id", operator: operatorEnum.exact, value: String(subjectId) },
            {
              field_name: "assigned_as_role__seniority",
              operator: operatorEnum.in,
              value: [seniorityEnum.MAIN_TEACHER, seniorityEnum.ASSISTANT_TEACHER].join(","),
            },
            {
              field_name: "course__status",
              operator: operatorEnum.in,
              value: [courseStatus.active, courseStatus.planned].join(","),
            },
          ],
        },
      );
      const count = res.data?.count ?? 0;
      return count > 0 ? count : null;
    },
  });
}
```

**If `assigned_as_role__seniority` filter fails in manual QA:** fall back to client-side `viewerTeachingCourseIds`-style count using `size: -1` with fields-only fetch, or add backend allowlist entry in `UserCourseSearchView` (minimal BE change per spec §8).

- [ ] **Step 5: `useProfileCourseList`**

```ts
// src/hooks/profile-courses/use-profile-course-list.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import {
  buildUserCourseFilterParams,
  type UserCourseListScope,
  type UserCourseListStatus,
} from "@/helpers/profile-courses/build-user-course-filter-params";
import { PROFILE_COURSE_PAGE_SIZE } from "@/hooks/profile-courses/use-profile-course-search";

const EXPAND = [
  "assigned_as_role",
  "course",
  "course.program",
  "course.level",
  "course.section",
  "course.subject",
  "course.course_subjects",
  "course.course_subjects.subject",
];

export function useProfileCourseList(args: {
  subjectId: string;
  page: number;
  scope: UserCourseListScope;
  status: UserCourseListStatus;
  viewerTeachingCourseIds: number[];
  enabled?: boolean;
}) {
  const scopeBlocks =
    args.scope === "your" && args.viewerTeachingCourseIds.length === 0;

  return useQuery({
    queryKey: [
      "profileCourseList",
      args.subjectId,
      args.page,
      args.scope,
      args.status,
      args.viewerTeachingCourseIds.join(","),
    ],
    enabled: (args.enabled ?? true) && !scopeBlocks,
    keepPreviousData: true,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { filter_params } = buildUserCourseFilterParams({
        subjectId: args.subjectId,
        scope: args.scope,
        status: args.status,
        viewerTeachingCourseIds: args.viewerTeachingCourseIds,
      });

      const res = await searchEntities(
        "user-courses",
        {
          page: args.page,
          size: PROFILE_COURSE_PAGE_SIZE,
          expand: EXPAND,
          teacher_roster_order: true,
        },
        { filter_params },
        { signal },
      );

      const rows = res.data?.data ?? [];
      const totalCount = res.data?.count ?? rows.length;
      const totalPages =
        res.data?.total_pages ??
        Math.max(1, Math.ceil(totalCount / PROFILE_COURSE_PAGE_SIZE));

      return { rows, totalCount, totalPages };
    },
  });
}
```

- [ ] **Step 6: `useProfileEnrollmentsByCourseIds` (search merge)**

```ts
// src/hooks/profile-courses/use-profile-enrollments-by-course-ids.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export function useProfileEnrollmentsByCourseIds(
  subjectId: string,
  courseIds: number[],
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["profileEnrollmentsByCourseIds", subjectId, courseIds.join(",")],
    enabled: enabled && courseIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await searchEntities(
        "user-courses",
        {
          size: -1,
          expand: ["assigned_as_role", "course"],
        },
        {
          filter_params: [
            { field_name: "user_id", operator: operatorEnum.exact, value: subjectId },
            {
              field_name: "course_id",
              operator: operatorEnum.in,
              value: courseIds.join(","),
            },
          ],
        },
      );
      return res.data?.data ?? [];
    },
  });
}
```

- [ ] **Step 7: Event hooks**

```ts
// src/hooks/profile-courses/use-profile-upcoming-events.ts
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import {
  addCalendarDaysToTenantYmd,
  getTenantDayBoundariesIso,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";
import { operatorEnum } from "@/types/api";

export const PROFILE_UPCOMING_EVENT_DAYS = 14;

export function useProfileUpcomingEvents(
  subjectId: string | undefined,
  tenantTimezone: string | null | undefined,
  enabled: boolean,
) {
  const tz = tenantTimezone ?? "UTC";
  const { startIso, endIso } = useMemo(() => {
    const today = getTenantTodayYmd(tz);
    const endDay = addCalendarDaysToTenantYmd(today, tz, PROFILE_UPCOMING_EVENT_DAYS);
    const start = getTenantDayBoundariesIso(tz, today).startIso;
    const end = getTenantDayBoundariesIso(tz, endDay).endIso;
    return { startIso: start, endIso: end };
  }, [tz]);

  return useQuery({
    queryKey: ["profileUpcomingEvents", subjectId, startIso, endIso],
    enabled: enabled && Boolean(subjectId),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await searchEntities(
        "events",
        {
          size: -1,
          expand: ["course"],
          fields: ["id", "title", "date", "time_from", "time_to", "course"],
          sorts: ["date", "time_from"],
        },
        {
          filter_params: [
            {
              field_name: "course__user_courses__user_id",
              operator: operatorEnum.exact,
              value: String(subjectId),
            },
            { field_name: "date", operator: operatorEnum.gte, value: startIso },
            { field_name: "date", operator: operatorEnum.lte, value: endIso },
          ],
        },
      );
      return (res.data?.data ?? []) as ProfileCalendarEventLike[];
    },
  });
}
```

```ts
// src/hooks/profile-courses/use-profile-schedule-events.ts
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import {
  addCalendarDaysToTenantYmd,
  getTenantDayBoundariesIso,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";
import { operatorEnum } from "@/types/api";

const SCHEDULE_PAST_DAYS = 90;
const SCHEDULE_FUTURE_DAYS = 90;

export function useProfileScheduleEvents(
  subjectId: string | undefined,
  tenantTimezone: string | null | undefined,
  enabled: boolean,
) {
  const tz = tenantTimezone ?? "UTC";
  const { startIso, endIso } = useMemo(() => {
    const today = getTenantTodayYmd(tz);
    const startDay = addCalendarDaysToTenantYmd(today, tz, -SCHEDULE_PAST_DAYS);
    const endDay = addCalendarDaysToTenantYmd(today, tz, SCHEDULE_FUTURE_DAYS);
    return {
      startIso: getTenantDayBoundariesIso(tz, startDay).startIso,
      endIso: getTenantDayBoundariesIso(tz, endDay).endIso,
    };
  }, [tz]);

  return useQuery({
    queryKey: ["profileScheduleEvents", subjectId, startIso, endIso],
    enabled: enabled && Boolean(subjectId),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await searchEntities(
        "events",
        {
          size: -1,
          expand: ["course"],
          fields: ["id", "title", "date", "time_from", "time_to", "course"],
          sorts: ["date", "time_from"],
        },
        {
          filter_params: [
            {
              field_name: "course__user_courses__user_id",
              operator: operatorEnum.exact,
              value: String(subjectId),
            },
            { field_name: "date", operator: operatorEnum.gte, value: startIso },
            { field_name: "date", operator: operatorEnum.lte, value: endIso },
          ],
        },
      );
      return (res.data?.data ?? []) as ProfileCalendarEventLike[];
    },
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add src/hooks/profile-courses/
git commit -m "feat(profile): add paginated course list and calendar hooks"
```

---

### Task 5: Slim user profile page + gated calendar

**Files:**
- Modify: `src/app/(internal)/users/[id]/page.tsx`

- [ ] **Step 1: Slim `USER_PROFILE_EXPAND`**

Remove all `user_courses*` entries; keep:

```ts
const USER_PROFILE_EXPAND = ["visibility", "user_events"] as const;
```

- [ ] **Step 2: Replace `courseIds` / `getUserCourseEvents` / `teachingCoursesCount`**

- Delete `courseIds` useMemo and `getUserCourseEvents` query entirely.
- Add `useProfileTeachingCount(id, isAuthCheckFinished && Boolean(user))` for `UserProfileStats`.
- Gate student assignments query:

```ts
const assignmentsQuery = useQuery({
  queryKey: ["userAssignments", id],
  queryFn: async () => {
    const res = await searchEntities(
      "assignments",
      { size: -1, expand: ["submissions"] },
      {
        filter_params: [
          {
            field_name: "course__user_courses__user_id",
            operator: operatorEnum.exact,
            value: id,
          },
        ],
      },
    );
    return res.data.data;
  },
  enabled: !!user && isStudent(user) && section === "academic",
});
```

- [ ] **Step 3: Rewrite calendar `useEffect`**

- Remove dependency on `flatCourseEventsFromEnrollments` / `getUserCourseEvents`.
- Accept `academicEvents: ProfileCalendarEventLike[]` from `RecordAcademic` via callback **or** lift `useProfileUpcomingEvents` + `useProfileScheduleEvents` into page and merge:

```ts
const upcomingEvents = useProfileUpcomingEvents(id, tenant?.timezone, section === "academic");
const scheduleEvents = useProfileScheduleEvents(
  id,
  tenant?.timezone,
  section === "academic" && academicPane === "schedule",
);
```

Pass `academicPane` from `RecordAcademic` up via `onPaneChange` prop, or read `useAcademicPane` in page (requires moving hook or duplicating URL read — prefer `useAcademicPane` in page since it reads `nuqs`).

Merge logic in `useEffect`:

```ts
// Staff user_events (unchanged)
// Student: assignmentEvents + upcomingEvents (or scheduleEvents when on schedule pane)
// Teacher: upcomingEvents for courses pane; scheduleEvents when pane=schedule
```

For `getCourseTitle(courseId)`: resolve from event's expanded `course.title` or `courseTitle` field — remove scan of `user.user_courses`.

- [ ] **Step 4: Fix loading flags**

```ts
const calendarLoading =
  section === "academic" &&
  (upcomingEvents.isLoading || (academicPane === "schedule" && scheduleEvents.isLoading));
const calendarLoadError =
  section === "academic" &&
  (upcomingEvents.isError || scheduleEvents.isError);
```

Remove checks on `user.user_courses?.length`.

- [ ] **Step 5: Update `RecordAcademic` props**

Pass `viewerTeachingCourseIds`, drop reliance on embedded enrollments for calendar course ID list.

- [ ] **Step 6: Manual smoke — profile shell**

Open `/users/[id]` for a user with many courses. Header should render without multi-second skeleton.

- [ ] **Step 7: Commit**

```bash
git add src/app/(internal)/users/[id]/page.tsx
git commit -m "perf(profile): slim user fetch and windowed calendar events"
```

---

### Task 6: Refactor `RecordCourseList`

**Files:**
- Modify: `src/components/record/academic/record-course-list.tsx`
- Modify: `src/helpers/profile-courses/merge-search-with-enrollments.ts`

- [ ] **Step 1: Update props**

```ts
type Props = {
  subjectId: string;
  viewer: accountType;
  subject: accountType; // no longer needs user_courses
  calendarEvents: ProfileCalendarEventLike[];
  sessionByCourseId?: Map<number, string>;
  tenantTimezone?: string | null;
  viewerTeachingCourseIds: number[];
  enrollmentCounts?: { activeCount: number; totalCount: number };
  countsLoading?: boolean;
  hasSharedCourses: boolean;
  onViewSchedule?: () => void;
};
```

- [ ] **Step 2: Remove embedded `subjectCourses`, viewer query, client filter/sort**

- Use `useProfileCourseList` for browse mode (`!isSearchMode`).
- Use `useProfileEnrollmentsByCourseIds` when search returns course IDs.
- Map browse rows:

```ts
const teachingSet = useMemo(
  () => new Set(viewerTeachingCourseIds),
  [viewerTeachingCourseIds],
);

const browseRows = useMemo(() => {
  if (!listQuery.data) return [];
  return listQuery.data.rows.flatMap((row) => {
    const mapped = mapUserCourseToRow(row, {
      isShared: teachingSet.has(/* courseId from row */),
      nextSessionLabel: sessionByCourseId?.get(courseId) ?? null,
    });
    return mapped ? [mapped] : [];
  });
}, [listQuery.data, teachingSet, sessionByCourseId]);
```

- [ ] **Step 3: Scope toggle logic**

- `hasShared` → prop `hasSharedCourses`
- Default scope: `your` when `hasSharedCourses`, else `all`
- `scope === "your" && viewerTeachingCourseIds.length === 0` → empty state (unchanged copy)

- [ ] **Step 4: Counts line**

```tsx
{countsLoading ? (
  <span className="text-xs text-text-muted">— active · — total</span>
) : (
  <span>{activeCount} active · {totalCount} total</span>
)}
```

Use `enrollmentCounts` prop from parent hook.

- [ ] **Step 5: Update `mergeSearchWithEnrollments`**

Add optional `sessionByCourseId?: Map<number, string>`; pass to `nextSessionLabelForCourse` as 4th arg.

- [ ] **Step 6: Loading**

Browse mode loading = `listQuery.isLoading && !listQuery.data`. Remove `isLoading` prop tied to user fetch.

- [ ] **Step 7: Commit**

```bash
git add src/components/record/academic/record-course-list.tsx src/helpers/profile-courses/merge-search-with-enrollments.ts
git commit -m "perf(profile): paginated RecordCourseList browse mode"
```

---

### Task 7: Refactor `RecordAcademic`

**Files:**
- Modify: `src/components/record/sections/record-academic.tsx`

- [ ] **Step 1: Remove duplicate viewer fetch and `subjectCourses`**

- Accept `viewerTeachingCourseIds: number[]` and `hasSharedCourses: boolean` from parent.
- Build `sessionByCourseId` in parent or here:

```ts
const sessionByCourseId = useMemo(
  () => buildNextSessionByCourseId(calendarEvents, tenant?.timezone),
  [calendarEvents, tenant?.timezone],
);
```

- [ ] **Step 2: Wire hooks at parent level (preferred)**

Parent (`page.tsx`) runs:
- `useViewerTeachingCourseIds(account.id)`
- `useProfileHasSharedCourses(id, teachingIds)`
- `useProfileEnrollmentCounts(id, section === "academic")`

Pass results into `RecordAcademic` → `RecordCourseList`.

- [ ] **Step 3: `RecordThisWeekAgenda`**

Remove `courseIds={filteredCourseIds}` — pass `courseIds={[]}` so agenda uses all subject-scoped events from windowed query (see `filterEventsByCourseIds` early return).

- [ ] **Step 4: Schedule pane**

When `pane === "schedule"`, ensure parent loads `useProfileScheduleEvents` and passes merged `calendarEvents` including schedule range.

- [ ] **Step 5: Commit**

```bash
git add src/components/record/sections/record-academic.tsx src/app/(internal)/users/[id]/page.tsx
git commit -m "refactor(profile): wire academic section to paginated data hooks"
```

---

### Task 8: Query invalidation after assign-courses

**Files:**
- Modify: `src/app/(internal)/users/[id]/assign-courses/page.tsx` (if it invalidates user query)

- [ ] **Step 1: Invalidate new query keys on assign success**

```ts
queryClient.invalidateQueries({ queryKey: ["profileEnrollmentCounts", userId] });
queryClient.invalidateQueries({ queryKey: ["profileCourseList", userId] });
queryClient.invalidateQueries({ queryKey: ["profileUpcomingEvents", userId] });
queryClient.invalidateQueries({ queryKey: ["profileTeachingCount", userId] });
```

Keep existing `getUser${id}` invalidation for non-course fields.

- [ ] **Step 2: Commit**

```bash
git add src/app/(internal)/users/[id]/assign-courses/page.tsx
git commit -m "fix(profile): invalidate paginated course queries after assign"
```

---

### Task 9: Unit test updates + full test run

**Files:**
- Modify: `src/helpers/profile-courses/merge-search-with-enrollments.test.ts` (if exists — add session map case)

- [ ] **Step 1: Run all profile-courses tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/profile-courses/`  
Expected: all PASS

- [ ] **Step 2: Run lint**

Run: `cd schedjuice-reimagined-fe && npm run lint`  
Expected: no new errors in touched files

- [ ] **Step 3: Commit any test fixes**

```bash
git commit -m "test(profile): cover session map in search merge"
```

---

### Task 10: Manual QA checklist

- [ ] Teacher 150+ enrollments — shell paints quickly; list page 1 loads without freeze
- [ ] Toggle Active / All — refetches server-side; page resets to 1
- [ ] Your classes / All courses — correct filtering; empty state when no overlap
- [ ] Search by title/code — still works; pagination via URL
- [ ] This week agenda — shows upcoming sessions
- [ ] Schedule pane — calendar renders with ±3 month window
- [ ] Student profile — assignment events still appear on academic section
- [ ] Light profile (&lt;20 courses) — no regression
- [ ] Assign courses → return to profile — counts and list refresh

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| Slim user fetch | Task 5 |
| Paginated browse list | Tasks 1, 4, 6 |
| Count queries | Tasks 4, 6 |
| Teaching stat query | Tasks 4, 5 |
| Viewer teaching IDs / shared scope | Tasks 4, 6, 7 |
| Windowed upcoming events | Tasks 4, 5 |
| Schedule pane broader window | Tasks 4, 5, 7 |
| Session label precompute | Tasks 2, 6, 7 |
| Search mode unchanged semantics | Tasks 4, 6 |
| Assign-courses invalidation | Task 8 |
| Loading states | Tasks 5, 6 |
| Unit tests | Tasks 1, 2, 9 |

## Backend fallback (only if QA fails)

If `assigned_as_role__seniority` or `course__status` filters 400 on `user-courses/search`, add field to backend search allowlist in `app_course/views.py` `UserCourseSearchView` — do not proceed with client-side full fetch workaround without attempting the minimal BE fix first.
