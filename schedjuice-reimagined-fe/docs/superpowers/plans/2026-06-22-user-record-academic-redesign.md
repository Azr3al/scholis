# User Record — Academic Section Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Replace the vertically stacked Academic section with pane-based navigation (`Courses · Schedule · Assessments · History`), a typography-first `RecordCourseRow` list with "Your classes" default for teachers viewing students, and a this-week agenda strip — all in `.sj-root` styling with locked motion recipes.

**Architecture:** Add `?pane=` URL state via `nuqs` alongside existing `?section=`. Rewrite `record-academic.tsx` as a thin pane router. Extract course list, shared-course helpers, and pane wrappers into `src/components/record/academic/`. Reuse calendar/assessments/history data paths; add `embedded` props to strip duplicate chrome. No backend changes.

**Tech Stack:** Next.js App Router, React 19, `nuqs`, TanStack Query v4, Base UI `Tabs` primitive, `motion/react` + `src/lib/sj/motion.ts`, existing calendar + assessment components.

**Spec:** `docs/superpowers/specs/2026-06-22-user-record-academic-design.md`

---

## File Structure

**Create:**
- `src/components/record/academic/academic-panes.ts`
- `src/components/record/academic/use-academic-pane.ts`
- `src/components/record/academic/academic-pane-switcher.tsx`
- `src/helpers/record-academic/shared-courses.ts`
- `src/helpers/record-academic/shared-courses.test.ts`
- `src/helpers/record-academic/course-identity.ts`
- `src/helpers/record-academic/course-identity.test.ts`
- `src/components/record/academic/record-course-row.tsx`
- `src/components/record/academic/record-course-list.tsx`
- `src/components/record/academic/record-this-week-agenda.tsx`
- `src/components/record/academic/record-academic-schedule.tsx`
- `src/components/record/academic/record-academic-assessments.tsx`
- `src/components/record/academic/record-academic-history.tsx`

**Modify:**
- `src/components/record/sections/record-academic.tsx` — rewrite as pane router
- `src/components/users/course-history/course-history.tsx` — `embedded` prop
- `src/components/users/profile/user-profile-assessments.tsx` — `embedded` prop
- `src/components/calendar/calendars/user-calendar.tsx` — pass `defaultView` / `showableViews`
- `src/app/(internal)/users/[id]/page.tsx` — pass `viewer` to `RecordAcademic`; remove props only used by old DataTable if lifted

---

## Task 1: Pane types + URL state

**Files:** Create `academic-panes.ts`, `use-academic-pane.ts`

- [ ] **Step 1: Create pane registry**

`src/components/record/academic/academic-panes.ts`:
```ts
export type AcademicPaneId = "courses" | "schedule" | "assessments" | "history";

export const ACADEMIC_PANES: { id: AcademicPaneId; label: string }[] = [
  { id: "courses", label: "Courses" },
  { id: "schedule", label: "Schedule" },
  { id: "assessments", label: "Assessments" },
  { id: "history", label: "History" },
];

export const DEFAULT_ACADEMIC_PANE: AcademicPaneId = "courses";

const VALID = new Set<string>(ACADEMIC_PANES.map((p) => p.id));

export function isAcademicPaneId(value: string): value is AcademicPaneId {
  return VALID.has(value);
}
```

- [ ] **Step 2: Create hook**

`src/components/record/academic/use-academic-pane.ts`:
```ts
"use client";

import { useCallback } from "react";
import { parseAsString, useQueryState } from "nuqs";
import {
  DEFAULT_ACADEMIC_PANE,
  isAcademicPaneId,
  type AcademicPaneId,
} from "./academic-panes";

export function useAcademicPane() {
  const [raw, setRaw] = useQueryState(
    "pane",
    parseAsString.withDefault(DEFAULT_ACADEMIC_PANE),
  );
  const pane: AcademicPaneId = isAcademicPaneId(raw) ? raw : DEFAULT_ACADEMIC_PANE;
  const setPane = useCallback(
    (next: AcademicPaneId) => {
      void setRaw(next);
    },
    [setRaw],
  );
  return { pane, setPane };
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run lint -- --max-warnings=0 src/components/record/academic/`
Expected: no errors (new files only).

- [ ] **Step 4: Stage**

```bash
git add src/components/record/academic/academic-panes.ts src/components/record/academic/use-academic-pane.ts
```

---

## Task 2: Shared courses helper (TDD)

**Files:** Create `shared-courses.ts`, `shared-courses.test.ts`

- [ ] **Step 1: Write failing tests**

`src/helpers/record-academic/shared-courses.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sharedCourseIds, viewerTeachingCourseIds } from "./shared-courses";
import { seniorityEnum } from "@/types/course";

describe("viewerTeachingCourseIds", () => {
  it("returns course ids where assigned role seniority qualifies", () => {
    const ids = viewerTeachingCourseIds([
      { course: { id: 1, status: "active" }, assigned_as_role: { seniority: "main" } },
      { course: { id: 2, status: "active" }, assigned_as_role: { seniority: seniorityEnum.OTHER } },
      { course: { id: 3, status: "ended" }, assigned_as_role: { seniority: "main" } },
    ]);
    expect(ids).toEqual([1]);
  });
});

describe("sharedCourseIds", () => {
  it("returns intersection of viewer teaching courses and subject enrollments", () => {
    const viewer = [
      { course: { id: 10, status: "active" }, assigned_as_role: { seniority: "main" } },
      { course: { id: 20, status: "active" }, assigned_as_role: { seniority: "main" } },
    ];
    const subject = [
      { course: { id: 10 } },
      { course: { id: 30 } },
    ];
    expect(sharedCourseIds(viewer, subject)).toEqual([10]);
  });

  it("returns empty when no overlap", () => {
    expect(
      sharedCourseIds(
        [{ course: { id: 1, status: "active" }, assigned_as_role: { seniority: "main" } }],
        [{ course: { id: 99 } }],
      ),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:unit -- --run src/helpers/record-academic/shared-courses.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/helpers/record-academic/shared-courses.ts`:
```ts
import {
  assignedRoleSeniorityCountsForTeachingStat,
} from "@/helpers/user-profile";
import { courseStatus } from "@/types/course";

type UserCourseLike = {
  course?: number | { id?: number; status?: string } | null;
  assigned_as_role?: { seniority?: string | null } | null;
};

function courseIdFromRow(row: UserCourseLike): number | null {
  const c = row.course;
  if (c == null) return null;
  return typeof c === "object" ? (c.id ?? null) : c;
}

export function viewerTeachingCourseIds(
  viewerUserCourses: UserCourseLike[] | null | undefined,
): number[] {
  if (!viewerUserCourses?.length) return [];
  const out = new Set<number>();
  for (const row of viewerUserCourses) {
    if (!assignedRoleSeniorityCountsForTeachingStat(row.assigned_as_role?.seniority)) {
      continue;
    }
    const cid = courseIdFromRow(row);
    const st =
      typeof row.course === "object" && row.course != null
        ? row.course.status
        : null;
    if (cid == null) continue;
    if (st && st !== courseStatus.planned && st !== courseStatus.active) continue;
    out.add(cid);
  }
  return [...out];
}

export function sharedCourseIds(
  viewerUserCourses: UserCourseLike[] | null | undefined,
  subjectUserCourses: UserCourseLike[] | null | undefined,
): number[] {
  const teaching = new Set(viewerTeachingCourseIds(viewerUserCourses));
  if (!teaching.size || !subjectUserCourses?.length) return [];
  const shared: number[] = [];
  for (const row of subjectUserCourses) {
    const cid = courseIdFromRow(row);
    if (cid != null && teaching.has(cid)) shared.push(cid);
  }
  return shared;
}

export function isSharedCourse(courseId: number, sharedIds: number[]): boolean {
  return sharedIds.includes(courseId);
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm run test:unit -- --run src/helpers/record-academic/shared-courses.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Stage**

```bash
git add src/helpers/record-academic/shared-courses.ts src/helpers/record-academic/shared-courses.test.ts
```

---

## Task 3: Course identity helpers (TDD)

**Files:** Create `course-identity.ts`, `course-identity.test.ts`

- [ ] **Step 1: Write failing tests**

`src/helpers/record-academic/course-identity.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildCourseBreadcrumb, formatCourseSchedulePattern } from "./course-identity";

describe("buildCourseBreadcrumb", () => {
  it("joins program, level, section with middle dots", () => {
    expect(
      buildCourseBreadcrumb({
        program: { name: "ACCA" },
        level: { name: "Year 1" },
        section: { name: "Sec A" },
      }),
    ).toBe("ACCA · Year 1 · Sec A");
  });

  it("collapses missing pieces", () => {
    expect(buildCourseBreadcrumb({ program: { name: "Diploma" } })).toBe("Diploma");
  });
});

describe("formatCourseSchedulePattern", () => {
  it("returns weekday and time when both exist", () => {
    expect(
      formatCourseSchedulePattern({
        weekday_pattern: "Mon Wed",
        first_event_time_from: "14:00:00",
        first_event_time_to: "16:00:00",
      }),
    ).toContain("Mon Wed");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:unit -- --run src/helpers/record-academic/course-identity.test.ts`

- [ ] **Step 3: Implement**

`src/helpers/record-academic/course-identity.ts`:
```ts
import { formatSessionClock } from "@/helpers/date";

type CourseIdentityLike = {
  program?: { name?: string } | null;
  level?: { name?: string } | null;
  section?: { name?: string } | null;
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
};

export function buildCourseBreadcrumb(course: CourseIdentityLike): string {
  const parts: string[] = [];
  if (course.program?.name) parts.push(course.program.name);
  if (course.level?.name) parts.push(course.level.name);
  if (course.section?.name) parts.push(course.section.name);
  return parts.join(" · ");
}

export function formatCourseSchedulePattern(course: CourseIdentityLike): string | null {
  const days = course.weekday_pattern?.trim();
  const from = course.first_event_time_from;
  const to = course.first_event_time_to;
  if (!days && !from) return null;
  const time =
    from && to
      ? `${formatSessionClock(from)}–${formatSessionClock(to)}`
      : course.time_pattern?.trim() ?? null;
  if (days && time) return `${days} ${time}`;
  return days ?? time;
}

export function courseStatusLabel(status: string | undefined | null): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Stage**

```bash
git add src/helpers/record-academic/course-identity.ts src/helpers/record-academic/course-identity.test.ts
```

---

## Task 4: RecordCourseRow

**Files:** Create `record-course-row.tsx`

- [ ] **Step 1: Implement row component**

`src/components/record/academic/record-course-row.tsx`:
```tsx
"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { staggerItem } from "@/lib/sj/motion";
import {
  buildCourseBreadcrumb,
  courseStatusLabel,
  formatCourseSchedulePattern,
} from "@/helpers/record-academic/course-identity";
import { cn } from "@/lib/utils";

export type RecordCourseRowData = {
  userCourseId: number;
  courseId: number;
  title: string;
  code?: string | null;
  status?: string | null;
  assignedRoleName?: string | null;
  program?: { name?: string } | null;
  level?: { name?: string } | null;
  section?: { name?: string } | null;
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
  nextSessionLabel?: string | null;
  isShared?: boolean;
};

export function RecordCourseRow({ row }: { row: RecordCourseRowData }) {
  const breadcrumb = buildCourseBreadcrumb(row);
  const schedule = formatCourseSchedulePattern(row);
  const status = courseStatusLabel(row.status);
  const meta = [row.code, row.assignedRoleName, schedule].filter(Boolean).join(" · ");

  return (
    <motion.div variants={staggerItem} className="sj-root">
      <Link
        href={`/courses/${row.courseId}`}
        className={cn(
          "group block rounded-md px-3 py-4 transition-colors hover:bg-surface-hover",
          row.isShared && "border-l-2 border-brand pl-4",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-xs text-text-muted truncate">
            {breadcrumb || "Course"}
            {row.isShared ? (
              <span className="ml-2 font-hand text-hand text-brand">Your class</span>
            ) : null}
          </p>
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              row.status === "active" || row.status === "planned"
                ? "text-success"
                : "text-text-muted",
            )}
          >
            {status}
          </span>
        </div>
        <p className="mt-1 font-serif text-lg text-text-primary group-hover:text-accent">
          {row.title}
        </p>
        {meta ? <p className="mt-0.5 text-sm text-text-muted">{meta}</p> : null}
        {row.nextSessionLabel ? (
          <p className="mt-2 text-right text-sm text-text-secondary">
            Next: {row.nextSessionLabel} →
          </p>
        ) : null}
      </Link>
    </motion.div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint -- --max-warnings=0 src/components/record/academic/record-course-row.tsx`

- [ ] **Step 3: Stage**

```bash
git add src/components/record/academic/record-course-row.tsx
```

---

## Task 5: RecordCourseList + filters

**Files:** Create `record-course-list.tsx`

- [ ] **Step 1: Implement list with query**

`record-course-list.tsx` fetches via `searchEntities("user-courses", …)` with expand from spec §12. Props:

```ts
type Props = {
  subjectId: string;
  viewer: accountType;
  subject: accountType;
  onViewSchedule?: () => void;
};
```

Internal state:
- `scope: "your" | "all"` — default `"your"` when `sharedCourseIds(...).length > 0`, else `"all"`
- `status: "active" | "all"` — default `"active"`

Filter logic:
- Build course id list from `subject.user_courses`
- When `scope === "your"`, restrict to `sharedCourseIds`
- When `status === "active"`, filter `course.status ∈ {active, planned}` client-side (or via filter_params matching page's `getFilterParams`)

Render:
- Toggle row: text buttons `Your classes` / `All courses` (hidden when no shared)
- Status chips: `Active` / `All`
- `motion.div variants={staggerList}` wrapping `RecordCourseRow` items
- Empty states per spec §5.5

- [ ] **Step 2: Wire count quiet zone**

Show `N active · M total` under filters.

- [ ] **Step 3: Lint + manual smoke**

Run: `npm run lint -- --max-warnings=0 src/components/record/academic/record-course-list.tsx`

- [ ] **Step 4: Stage**

```bash
git add src/components/record/academic/record-course-list.tsx
```

---

## Task 6: This-week agenda

**Files:** Create `record-this-week-agenda.tsx`

- [ ] **Step 1: Implement agenda strip**

Props: `events: ProfileCalendarEventLike[]`, `courseIds: number[]`, `sharedIds: number[]`, `onViewSchedule: () => void`, `tenantTimezone?: string | null`

Use `getTenantTodayDateString`, `eventDateToTenantDateString` from `user-profile.ts`. Filter events where `courseIdFromProfileEvent(e)` is in `courseIds` and date >= today. Sort ascending; slice(0, 7).

Render under `.sj-root`:
- `h3` "This week" — `font-serif text-xl`
- Rows: `{weekday} {time}` · linked course title
- Button/link: "View full schedule →" calls `onViewSchedule`

- [ ] **Step 2: Stage**

```bash
git add src/components/record/academic/record-this-week-agenda.tsx
```

---

## Task 7: Pane switcher + pane wrappers

**Files:** Create `academic-pane-switcher.tsx`, `record-academic-schedule.tsx`, `record-academic-assessments.tsx`, `record-academic-history.tsx`

- [ ] **Step 1: Pane switcher**

`academic-pane-switcher.tsx` uses `Tabs` from `@/components/primitives/tabs`:

```tsx
"use client";

import { Tabs } from "@/components/primitives/tabs";
import { ACADEMIC_PANES, type AcademicPaneId } from "./academic-panes";

export function AcademicPaneSwitcher({
  pane,
  onPaneChange,
}: {
  pane: AcademicPaneId;
  onPaneChange: (p: AcademicPaneId) => void;
}) {
  return (
    <Tabs.Root
      value={pane}
      onValueChange={(v) => onPaneChange(v as AcademicPaneId)}
      className="sj-root"
    >
      <Tabs.List className="border-b border-border">
        {ACADEMIC_PANES.map((p) => (
          <Tabs.Tab key={p.id} value={p.id}>
            {p.label}
          </Tabs.Tab>
        ))}
        <Tabs.Indicator className="!h-0.5 !rounded-none !bg-accent bottom-0 top-auto" />
      </Tabs.List>
    </Tabs.Root>
  );
}
```

Adjust Indicator classes so active tab shows accent underline (not pill fill).

- [ ] **Step 2: Schedule wrapper**

`record-academic-schedule.tsx` — props: calendar props + `sharedIds`, `yourClassesOnly` toggle state, filtered events.

Modify `user-calendar.tsx` to accept optional `defaultView` and `showableViews` passthrough to `Calendar`.

```tsx
// user-calendar.tsx — add to props:
defaultView?: CalendarView;
showableViews?: CalendarView[];

// default:
defaultView = CalendarView.WEEK,
showableViews = [CalendarView.WEEK, CalendarView.MONTH, CalendarView.LIST],
```

- [ ] **Step 3: Assessments + History wrappers**

Thin components rendering embedded child:

```tsx
// record-academic-assessments.tsx
export function RecordAcademicAssessments({ userId }: { userId: string }) {
  return (
    <div className="sj-root">
      <UserProfileAssessments userId={userId} embedded />
    </div>
  );
}
```

- [ ] **Step 4: Stage**

```bash
git add src/components/record/academic/academic-pane-switcher.tsx \
  src/components/record/academic/record-academic-schedule.tsx \
  src/components/record/academic/record-academic-assessments.tsx \
  src/components/record/academic/record-academic-history.tsx \
  src/components/calendar/calendars/user-calendar.tsx
```

---

## Task 8: Embedded mode for History + Assessments

**Files:** Modify `course-history.tsx`, `user-profile-assessments.tsx`

- [ ] **Step 1: CourseHistory embedded prop**

Add to props: `embedded?: boolean` (default `false`).

When `embedded === true`:
- Do not render outer `h1` / "Total courses attended" block
- Render quiet count: `<p className="text-sm text-text-muted">{totalCount} prior enrollments</p>` above list
- Keep Add new button (admin gated) aligned right in a flex row with count

- [ ] **Step 2: UserProfileAssessments embedded prop**

When `embedded === true`:
- Remove any duplicate top-level headings if present
- Wrap sections in `.sj-root` typography classes (`font-serif` for subsection titles)

- [ ] **Step 3: Lint**

Run: `npm run lint -- --max-warnings=0 src/components/users/course-history/course-history.tsx src/components/users/profile/user-profile-assessments.tsx`

- [ ] **Step 4: Stage**

```bash
git add src/components/users/course-history/course-history.tsx \
  src/components/users/profile/user-profile-assessments.tsx
```

---

## Task 9: Rewrite record-academic.tsx

**Files:** Modify `record-academic.tsx`, `page.tsx`

- [ ] **Step 1: Update RecordAcademicProps**

Add `viewer: accountType`. Remove props only used by old DataTable if query moves into `RecordCourseList`:
- Remove: `coursesTabLoading`, `filterParamsReady`, `showAllCourses`, `setShowAllCourses`, `getFilterParams`
- Keep: calendar props, `userId`, `user`, `tenant`, `recordQueryKey`, `editConfigFields`, `viewer`

- [ ] **Step 2: Rewrite component body**

```tsx
export function RecordAcademic({ userId, user, viewer, ... }: RecordAcademicProps) {
  const { pane, setPane } = useAcademicPane();
  const subjectIsTeacher = (user.roles ?? []).includes(role.teacher);
  const sharedIds = useMemo(
    () => sharedCourseIds(viewer.user_courses, user.user_courses),
    [viewer, user],
  );

  return (
    <div className="sj-root flex flex-col gap-6">
      <AcademicPaneSwitcher pane={pane} onPaneChange={setPane} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pane}
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {pane === "courses" && (
            <>
              <RecordCourseList subjectId={userId} viewer={viewer} subject={user} onViewSchedule={() => setPane("schedule")} />
              <RecordThisWeekAgenda ... onViewSchedule={() => setPane("schedule")} />
            </>
          )}
          {pane === "schedule" && <RecordAcademicSchedule ... sharedIds={sharedIds} />}
          {pane === "assessments" && <RecordAcademicAssessments userId={userId} />}
          {pane === "history" && <RecordAcademicHistory user={user} viewer={viewer} />}
        </motion.div>
      </AnimatePresence>
      {subjectIsTeacher ? <RecordPublicProfile ... /> : null}
    </div>
  );
}
```

Public profile stays below panes (teacher-as-subject case only).

- [ ] **Step 3: Update page.tsx**

Pass `viewer={account!}` to `RecordAcademic`. Remove `showAllCourses` state and related props if fully lifted. Ensure `account` expand includes `user_courses` for shared-course detection (already on logged-in user from `useUser()` — verify expand).

- [ ] **Step 4: Verify deep links**

Manual: `/users/{id}?section=academic&pane=schedule` opens Schedule pane.

- [ ] **Step 5: Stage**

```bash
git add src/components/record/sections/record-academic.tsx src/app/(internal)/users/[id]/page.tsx
```

---

## Task 10: Verification

- [ ] **Step 1: Unit tests**

Run: `npm run test:unit -- --run src/helpers/record-academic/`
Expected: all PASS.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Acceptance checklist (manual)**

1. Teacher opens student record → Academic → Courses pane default, Your classes when overlap.
2. Tab switch crossfades; URL updates.
3. No DataTable on Academic.
4. This-week strip visible on Courses pane; link opens Schedule.
5. Schedule opens week view.
6. History has no h1; admin sees Add new.
7. Assessments load without duplicate title.

---

## Plan self-review

**Spec coverage:**
- Pane IA + URL → Tasks 1, 9
- RecordCourseRow + filters → Tasks 3, 4, 5
- This-week agenda → Task 6
- Schedule pane week default → Task 7
- Embedded history/assessments → Tasks 7, 8
- Shared courses default → Tasks 2, 5, 9
- Motion crossfade/stagger → Tasks 4, 9
- Acceptance checks → Task 10

**Gaps intentionally deferred (spec §16):** URL-backed course filters, calendar full reskin, mockup page update.

**Type consistency:** `AcademicPaneId` used in switcher, hook, and router. `RecordCourseRowData` built in list from API rows. `sharedCourseIds` used in list, schedule, agenda.
