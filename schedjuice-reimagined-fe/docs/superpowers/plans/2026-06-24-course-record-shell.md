# Course Record Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Give every `/courses/[id]/**` route a persistent course context rail (record mode), teaching-flow nav with Attendance/Grading promoted, panel-header staff overflow, typography identity on hub routes, and a redesigned Overview — mirroring the user record shell.

**Architecture:** Register `CourseSectionRail` from `courses/[id]/layout.tsx` via existing `useContextRail` + `COURSE_CONTEXT_PARENT`. Rail entries are real `<Link>`s driven by `course-record-nav.ts` (pathname active rules + permission gates). Hub routes optionally wrap content in `CourseHubRouteShell` (identity strip); sub-routes keep old bodies. Stage A ships shell-only; Stage B adds identity/Overview/⋯; Stage C wraps remaining hub pages.

**Tech Stack:** Next.js 15 App Router, React 19, Base UI primitives, Iconoir, `motion/react` + `src/lib/sj/motion.ts`, TanStack Query v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-24-course-record-shell-design.md`

---

## File structure

**Create:**
- `src/config/course-record-nav.ts` — rail IA, visibility, active matching, overflow filter
- `src/config/course-record-nav.test.ts` — pathname + visibility unit tests
- `src/components/course/record/course-section-rail.tsx` — desktop context rail
- `src/components/course/record/course-mobile-sections.tsx` — mobile link pills
- `src/components/course/record/use-course-record-page-header.ts` — breadcrumb + actions registration
- `src/components/course/record/course-record-header-actions.tsx` — `⋯` + join code (Stage B)
- `src/components/course/record/course-record-header.tsx` — typography strip (Stage B)
- `src/components/course/record/course-record-overview.tsx` — redesigned Overview (Stage B)
- `src/components/course/record/course-hub-route-shell.tsx` — hub wrapper with identity strip (Stage B)
- `src/components/course/record/course-overflow-menu-items.tsx` — maps `getDropdownMenuItems` to Menu items (Stage B)

**Modify:**
- `src/app/(internal)/courses/[id]/layout.tsx` — unified shell (rail always on)
- `src/app/(internal)/courses/[id]/page.tsx` — Overview uses new component (Stage B)
- Hub section pages: `schedule`, `members`, `assessments`, `announcements`, `materials` — thin wrappers (Stage C)
- `src/config/course.tsx` — export `RAIL_OVERFLOW_EXCLUDED_HREFS` constant (optional helper)

**Delete (Stage C after migration):**
- `src/components/course/course-hub/course-hub-toolbar.tsx`
- `src/components/course/course-hub/course-hub-nav.tsx`
- `src/components/course/course-hub/course-hub-title-header.tsx`
- `src/components/course/course-hub/course-hub-more-menu.tsx`
- `src/config/course-hub-nav.ts` (replace imports with `course-record-nav.ts`)

**Keep (refactor):**
- `src/components/course/course-hub/course-hub-staff-actions.tsx` — join code; consumed by header actions (Stage B)

---

# Stage A — Shell + rail (shippable alone)

## Task 1: Course record nav config + tests

**Files:**
- Create: `src/config/course-record-nav.ts`
- Create: `src/config/course-record-nav.test.ts`

- [ ] **Step 1: Write failing tests for active matching and hub route detection**

```typescript
// src/config/course-record-nav.test.ts
import { describe, expect, it } from "vitest";
import {
  courseRecordNavActive,
  isCourseHubRoute,
  RAIL_OVERFLOW_EXCLUDED_HREFS,
} from "./course-record-nav";

const ID = "42";

describe("isCourseHubRoute", () => {
  it("matches hub section base paths", () => {
    expect(isCourseHubRoute(`/courses/${ID}`, ID)).toBe(true);
    expect(isCourseHubRoute(`/courses/${ID}/schedule`, ID)).toBe(true);
    expect(isCourseHubRoute(`/courses/${ID}/materials`, ID)).toBe(true);
  });
  it("rejects sub-routes and nested hub paths", () => {
    expect(isCourseHubRoute(`/courses/${ID}/edit`, ID)).toBe(false);
    expect(isCourseHubRoute(`/courses/${ID}/attendance/marking/1`, ID)).toBe(false);
    expect(isCourseHubRoute(`/courses/${ID}/materials/123`, ID)).toBe(false);
  });
});

describe("courseRecordNavActive", () => {
  it("highlights overview on base path only", () => {
    expect(courseRecordNavActive("overview", `/courses/${ID}`, ID)).toBe(true);
    expect(courseRecordNavActive("overview", `/courses/${ID}/schedule`, ID)).toBe(false);
  });
  it("groups attendance family paths", () => {
    expect(courseRecordNavActive("attendance", `/courses/${ID}/attendance`, ID)).toBe(true);
    expect(courseRecordNavActive("attendance", `/courses/${ID}/checkin-history/-1`, ID)).toBe(true);
    expect(courseRecordNavActive("attendance", `/courses/${ID}/meeting-attendance`, ID)).toBe(true);
    expect(courseRecordNavActive("attendance", `/courses/${ID}/grading`, ID)).toBe(false);
  });
});

describe("RAIL_OVERFLOW_EXCLUDED_HREFS", () => {
  it("excludes promoted rail sections from overflow", () => {
    expect(RAIL_OVERFLOW_EXCLUDED_HREFS.has("attendance")).toBe(true);
    expect(RAIL_OVERFLOW_EXCLUDED_HREFS.has("grading")).toBe(true);
    expect(RAIL_OVERFLOW_EXCLUDED_HREFS.has("edit")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/config/course-record-nav.test.ts`

- [ ] **Step 3: Implement `course-record-nav.ts`**

```typescript
// src/config/course-record-nav.ts
import { permissionsFor } from "@/helpers/authorization";
import { tenantShowsMeetingAttendance } from "@/helpers/meeting-attendance-gate";
import type { courseType } from "@/types/course";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type CourseRecordNavId =
  | "overview"
  | "schedule"
  | "attendance"
  | "grading"
  | "members"
  | "assessments"
  | "announcements"
  | "materials";

export type CourseRecordNavEntry = {
  id: CourseRecordNavId;
  label: string;
  /** Path segment after /courses/[id]/ — empty string for overview */
  segment: string;
  canShow?: (
    user: accountType,
    course: courseType,
    tenant: organizationType | null,
  ) => boolean;
};

/** Hrefs promoted to rail — exclude from panel ⋯ menu */
export const RAIL_OVERFLOW_EXCLUDED_HREFS = new Set([
  "attendance",
  "checkin-history",
  "meeting-attendance",
  "grading",
]);

export const COURSE_RECORD_NAV_ENTRIES: CourseRecordNavEntry[] = [
  { id: "overview", label: "Overview", segment: "" },
  { id: "schedule", label: "Schedule", segment: "schedule" },
  {
    id: "attendance",
    label: "Attendance",
    segment: "attendance",
    canShow: (user) =>
      permissionsFor(user).canAny(["attendance.mark", "checkin.view_all"]),
  },
  {
    id: "grading",
    label: "Grading",
    segment: "grading",
    canShow: (user) =>
      permissionsFor(user).canAny(["assignment.grade", "grade.manage"]),
  },
  { id: "members", label: "Members", segment: "members" },
  { id: "assessments", label: "Assessments", segment: "assessments" },
  { id: "announcements", label: "Announcements", segment: "announcements" },
  { id: "materials", label: "Materials", segment: "materials" },
];

const HUB_SEGMENTS = new Set(
  COURSE_RECORD_NAV_ENTRIES.filter((e) => e.segment).map((e) => e.segment),
);

export function courseRecordHref(courseId: string, entry: CourseRecordNavEntry): string {
  if (!entry.segment) return `/courses/${courseId}`;
  return `/courses/${courseId}/${entry.segment}`;
}

export function visibleCourseRecordEntries(
  user: accountType | undefined,
  course: courseType,
  tenant: organizationType | null,
): CourseRecordNavEntry[] {
  return COURSE_RECORD_NAV_ENTRIES.filter((e) => {
    if (!e.canShow) return true;
    if (!user) return false;
    return e.canShow(user, course, tenant);
  });
}

export function isCourseHubRoute(pathname: string, courseId: string): boolean {
  const base = `/courses/${courseId}`;
  if (!pathname.startsWith(base)) return false;
  const tail = pathname.slice(base.length).replace(/^\//, "");
  if (!tail) return true;
  const first = tail.split("/")[0];
  if (!HUB_SEGMENTS.has(first)) return false;
  return !tail.includes("/");
}

export function courseRecordNavActive(
  id: CourseRecordNavId,
  pathname: string,
  courseId: string,
): boolean {
  const base = `/courses/${courseId}`;
  if (id === "overview") {
    return pathname === base || pathname === `${base}/`;
  }
  if (id === "attendance") {
    return (
      pathname.startsWith(`${base}/attendance`) ||
      pathname.startsWith(`${base}/checkin-history`) ||
      pathname.startsWith(`${base}/meeting-attendance`)
    );
  }
  const entry = COURSE_RECORD_NAV_ENTRIES.find((e) => e.id === id);
  if (!entry?.segment) return false;
  const prefix = `${base}/${entry.segment}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export const COURSE_CONTEXT_PARENT = {
  label: "Academic Hub",
  href: "/courses",
} as const;
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm vitest run src/config/course-record-nav.test.ts`

- [ ] **Step 5: Stage only (no commit until authorized)**

```bash
git add src/config/course-record-nav.ts src/config/course-record-nav.test.ts
```

---

## Task 2: Course section rail (desktop)

**Files:**
- Create: `src/components/course/record/course-section-rail.tsx`

- [ ] **Step 1: Create rail component (mirror `RecordSectionRail`, but `<Link>`-based)**

Key requirements:
- Import Iconoir icons: `NavArrowLeft`, `Calendar`, `Group`, `Book`, `Megaphone`, `Page`, `ViewGrid`, `UserBadgeCheck`, `ClipboardCheck`
- Props: `{ courseId, course, user, tenant, pathname }`
- Map `visibleCourseRecordEntries(user, course, tenant)` to `<Link href={courseRecordHref(...)}>` with `aria-current={courseRecordNavActive(...) ? "page" : undefined}`
- Rail header: compact `CourseIdentityBlock` with `variant="hub"` and `showBreadcrumb={false}` — map `course` from hub context to `CourseIdentityCourse` shape (reuse helpers from `course-identity.ts`)
- Back link: `Link href="/courses"` with `NavArrowLeft` + "Academic Hub"
- Motion: copy `RecordSectionRail` structure (`transition.panelWipe`, `staggerList`, `staggerItem`)
- Wrapper: `className="sj-root ..."`

- [ ] **Step 2: Manual smoke — import in a throwaway story or skip to Task 3 integration**

- [ ] **Step 3: Stage only**

```bash
git add src/components/course/record/course-section-rail.tsx
```

---

## Task 3: Mobile section links

**Files:**
- Create: `src/components/course/record/course-mobile-sections.tsx`

- [ ] **Step 1: Create horizontal scroll link row (md:hidden)**

Pattern: like `RecordMobileSections` but use `<Link>` instead of buttons:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  courseRecordHref,
  courseRecordNavActive,
  visibleCourseRecordEntries,
} from "@/config/course-record-nav";
import { cn } from "@/lib/utils";
import type { courseType } from "@/types/course";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export function CourseMobileSections({
  courseId,
  course,
  user,
  tenant,
}: {
  courseId: string;
  course: courseType;
  user: accountType | undefined;
  tenant: organizationType | null;
}) {
  const pathname = usePathname();
  const entries = visibleCourseRecordEntries(user, course, tenant);

  return (
    <nav
      aria-label="Course sections"
      className="sj-root -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden"
    >
      {entries.map((entry) => {
        const href = courseRecordHref(courseId, entry);
        const active = courseRecordNavActive(entry.id, pathname, courseId);
        return (
          <Link
            key={entry.id}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-text-secondary hover:bg-surface-hover",
            )}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Stage only**

---

## Task 4: Page header hook (breadcrumb)

**Files:**
- Create: `src/components/course/record/use-course-record-page-header.ts`

- [ ] **Step 1: Implement hook**

```typescript
"use client";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  COURSE_CONTEXT_PARENT,
  COURSE_RECORD_NAV_ENTRIES,
  courseRecordNavActive,
  isCourseHubRoute,
} from "@/config/course-record-nav";
import { usePageHeader } from "@/components/shell/use-page-header";
import type { courseType } from "@/types/course";

function activeSectionLabel(pathname: string, courseId: string): string | null {
  for (const entry of COURSE_RECORD_NAV_ENTRIES) {
    if (courseRecordNavActive(entry.id, pathname, courseId)) return entry.label;
  }
  return null;
}

/** Sub-route tail label — e.g. /edit → "Edit course" from getDropdownMenuItems title lookup */
function subRouteLabel(pathname: string, courseId: string): string | null {
  const base = `/courses/${courseId}/`;
  if (!pathname.startsWith(base)) return null;
  const tail = pathname.slice(base.length).split("/")[0];
  if (!tail || isCourseHubRoute(pathname, courseId)) return null;
  // Title-case first segment as fallback; Stage B can refine with config map
  return tail.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useCourseRecordPageHeader({
  courseId,
  course,
  actions,
}: {
  courseId: string;
  course: courseType | null;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const title = typeof course?.title === "string" ? course.title : null;

  const breadcrumb = useMemo(
    () => (
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link
          href={COURSE_CONTEXT_PARENT.href}
          className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
        >
          {COURSE_CONTEXT_PARENT.label}
        </Link>
        {title ? (
          <>
            <span className="shrink-0 text-text-muted" aria-hidden>
              /
            </span>
            <span className="truncate font-serif text-lg text-text-primary">{title}</span>
          </>
        ) : null}
        {(() => {
          const section = activeSectionLabel(pathname, courseId);
          const sub = !section ? subRouteLabel(pathname, courseId) : null;
          const extra = section ?? sub;
          if (!extra || !title) return null;
          return (
            <>
              <span className="shrink-0 text-text-muted" aria-hidden>
                /
              </span>
              <span className="truncate text-text-secondary">{extra}</span>
            </>
          );
        })()}
      </nav>
    ),
    [pathname, courseId, title],
  );

  usePageHeader({ breadcrumb, actions });
}
```

- [ ] **Step 2: Stage only**

---

## Task 5: Rewrite `courses/[id]/layout.tsx`

**Files:**
- Modify: `src/app/(internal)/courses/[id]/layout.tsx`

- [ ] **Step 1: Replace hub-only chrome with unified shell**

```tsx
"use client";

import { CourseHubProvider, useCourseHub } from "@/contexts/course-hub-context";
import InvoiceIndicator from "@/components/course/invoice-indicator";
import { CourseSectionRail } from "@/components/course/record/course-section-rail";
import { CourseMobileSections } from "@/components/course/record/course-mobile-sections";
import { useCourseRecordPageHeader } from "@/components/course/record/use-course-record-page-header";
import { useContextRail } from "@/components/shell/use-context-rail";
import { COURSE_CONTEXT_PARENT } from "@/config/course-record-nav";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { courseType } from "@/types/course";
import { useParams, usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";

function CourseShellLayoutInner({ children }: { children: ReactNode }) {
  const { id: courseId } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { user } = useUser();
  const { tenant } = useTenant();
  const { course, isCourseLoading } = useCourseHub();

  const typedCourse = course as unknown as courseType;
  const hasCourse = Boolean(course.id);

  const sectionRail = useMemo(
    () =>
      hasCourse ? (
        <CourseSectionRail
          courseId={courseId}
          course={typedCourse}
          user={user}
          tenant={tenant ?? null}
          pathname={pathname}
          isLoading={isCourseLoading}
        />
      ) : null,
    [courseId, typedCourse, user, tenant, pathname, hasCourse, isCourseLoading],
  );

  useContextRail(sectionRail, COURSE_CONTEXT_PARENT);
  useCourseRecordPageHeader({ courseId, course: hasCourse ? typedCourse : null });

  return (
    <>
      {!pathname.includes("locked") && <InvoiceIndicator courseId={courseId} />}
      {hasCourse ? (
        <CourseMobileSections
          courseId={courseId}
          course={typedCourse}
          user={user}
          tenant={tenant ?? null}
        />
      ) : null}
      {children}
    </>
  );
}

export default function CourseDetailsLayout({ children }: { children: ReactNode }) {
  return (
    <CourseHubProvider>
      <CourseShellLayoutInner>{children}</CourseShellLayoutInner>
    </CourseHubProvider>
  );
}
```

- [ ] **Step 2: Remove old imports** — delete references to `CourseHubToolbar`, `CourseHubTitleHeader`, `isCourseHubChromePath`, `pageContentInsetClassName`, mobile bottom padding hack.

- [ ] **Step 3: Verify record mode on sub-routes**

Manual checks:
- `/courses/[id]` — rail visible, Overview active
- `/courses/[id]/attendance` — rail visible, Attendance active
- `/courses/[id]/edit` — rail visible, no section active, breadcrumb shows tail
- Global icon rail still navigates away

- [ ] **Step 4: Run lint + unit tests**

Run: `pnpm vitest run src/config/course-record-nav.test.ts && pnpm run lint`

- [ ] **Step 5: Stage only**

---

## Task 6: Retire old hub chrome (Stage A cleanup)

**Files:**
- Modify: any remaining imports of `course-hub-nav.ts` in layout (already removed)
- Do **not** delete hub files until Stage C — but stop rendering them

- [ ] **Step 1: Grep for `CourseHubToolbar` / `course-hub-nav` — ensure zero runtime imports outside deleted path**

Run: `rg 'CourseHubToolbar|course-hub-nav' schedjuice-reimagined-fe/src --glob '!**/course-hub/**'`

Expected: only `course-record-nav` consumers.

- [ ] **Step 2: Stage A complete — pause for review**

---

# Stage B — Identity strip + Overview + panel actions

## Task 7: Overflow menu items helper

**Files:**
- Create: `src/components/course/record/course-overflow-menu-items.tsx`

- [ ] **Step 1: Filter `getDropdownMenuItems` excluding rail hrefs**

```tsx
"use client";
import Link from "next/link";
import { Menu } from "@/components/primitives/menu";
import { getDropdownMenuItems } from "@/config/course";
import { RAIL_OVERFLOW_EXCLUDED_HREFS } from "@/config/course-record-nav";
import type { courseType } from "@/types/course";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";
import { Fragment } from "react";

function overflowHref(href: string, courseId: string): string {
  if (href === "checkin-history") return `/courses/${courseId}/checkin-history/-1`;
  return `/courses/${courseId}/${href}`;
}

export function CourseOverflowMenuItems({
  user,
  course,
  tenant,
  courseId,
}: {
  user: accountType;
  course: courseType;
  tenant: organizationType | null;
  courseId: string;
}) {
  const groups = getDropdownMenuItems(user, course, tenant)
    .map((group) =>
      group.filter((item) => {
        const key = item.href.split("?")[0];
        return !RAIL_OVERFLOW_EXCLUDED_HREFS.has(key);
      }),
    )
    .filter((g) => g.length > 0);

  if (!groups.length) return null;

  return (
    <>
      {groups.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 ? <Menu.Separator /> : null}
          {group.map((item) => (
            <Menu.Item key={item.href} render={<Link href={overflowHref(item.href, courseId)} />}>
              {item.title}
            </Menu.Item>
          ))}
        </Fragment>
      ))}
    </>
  );
}
```

---

## Task 8: Panel header actions (`⋯` + join code)

**Files:**
- Create: `src/components/course/record/course-record-header-actions.tsx`
- Modify: `src/app/(internal)/courses/[id]/layout.tsx` — pass actions to `useCourseRecordPageHeader`

- [ ] **Step 1: Build actions component**

- Icon-only `Menu.Root` with `MoreHoriz` (Iconoir) — same sizing as `RecordProfileHeaderActions`
- Render `CourseOverflowMenuItems` inside popup
- Render `CourseJoinCode` from existing `course-hub-staff-actions` beside menu when `canAccessCourseStaffActions(user)`
- Return `null` when viewer is student with no overflow items

- [ ] **Step 2: Wire into layout**

```tsx
useCourseRecordPageHeader({
  courseId,
  course: hasCourse ? typedCourse : null,
  actions: hasCourse && user ? (
    <CourseRecordHeaderActions
      courseId={courseId}
      course={typedCourse}
      user={user}
      tenant={tenant ?? null}
    />
  ) : null,
});
```

---

## Task 9: Typography identity strip (hub routes)

**Files:**
- Create: `src/components/course/record/course-record-header.tsx`
- Create: `src/components/course/record/course-hub-route-shell.tsx`

- [ ] **Step 1: `CourseRecordHeader`**

- `.sj-root` wrapper, no edit buttons
- Extend `CourseIdentityBlock` hub variant OR add `variant="recordHub"` with:
  - Program breadcrumb, Fraunces title, code, status pill, subject chips
  - Next session line — extract from `CourseHeader` helpers (`getOngoingProfileSessionsWithCourse` pattern / existing course event queries in hub context)
  - Primary teacher — reuse `PrimaryTeacherLine` data fetching or pass from overview hooks

- [ ] **Step 2: `CourseHubRouteShell`**

```tsx
"use client";
import { isCourseHubRoute } from "@/config/course-record-nav";
import { CourseRecordHeader } from "./course-record-header";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { courseType } from "@/types/course";

export function CourseHubRouteShell({
  course,
  children,
}: {
  course: courseType;
  children: ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const showHeader = isCourseHubRoute(pathname, id);

  return (
    <div className="sj-root flex flex-col gap-6">
      {showHeader ? <CourseRecordHeader course={course} /> : null}
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Wrap hub page bodies** — each hub `page.tsx` wraps content in `CourseHubRouteShell` OR layout wraps children when `isCourseHubRoute` (prefer layout wrapper in Stage B to avoid editing every page twice):

Add to `CourseShellLayoutInner`:

```tsx
import { isCourseHubRoute } from "@/config/course-record-nav";
// ...
const wrapHub = hasCourse && isCourseHubRoute(pathname, courseId);
return (
  <>
    ...
    {wrapHub ? (
      <CourseHubRouteShell course={typedCourse}>{children}</CourseHubRouteShell>
    ) : (
      children
    )}
  </>
);
```

---

## Task 10: Redesigned Overview

**Files:**
- Create: `src/components/course/record/course-record-overview.tsx`
- Modify: `src/app/(internal)/courses/[id]/page.tsx`

- [ ] **Step 1: Extract read-only summary pieces from `course-header.tsx`**

Create focused modules under `src/components/course/record/overview/`:
- `course-overview-metrics.tsx` — member count, session count, status badge
- `course-overview-schedule-card.tsx` — next session / repeat summary (read-only)
- `course-overview-meeting-card.tsx` — meeting link display (reuse `MeetingLink`)
- `course-overview-status-actions.tsx` — pause/resume/end dialogs (port AlertDialog to primitives)

Do **not** copy all 1100 lines — port incrementally with existing API calls (`endCourse`, `pauseCourse`, etc.).

- [ ] **Step 2: Compose `CourseRecordOverview`**

Use `RecordSection` / primitive `Card` patterns from user record Overview for layout.

- [ ] **Step 3: Replace `OverviewTab` usage in page.tsx**

```tsx
"use client";
import { CourseRecordOverview } from "@/components/course/record/course-record-overview";
import { useCourseHub } from "@/contexts/course-hub-context";
import { courseType } from "@/types/course";
import { Skeleton } from "@/components/primitives/skeleton";

export default function CourseOverviewPage() {
  const { course, isCourseLoading } = useCourseHub();
  if (isCourseLoading) return <Skeleton className="min-h-[220px] w-full" aria-busy />;
  if (!course.id) return <p className="text-sm text-text-muted">Course could not be loaded.</p>;
  return <CourseRecordOverview course={course as unknown as courseType} />;
}
```

- [ ] **Step 4: Run build**

Run: `pnpm run build`

- [ ] **Step 5: Stage only**

---

# Stage C — Hub wrappers + delete dead chrome

## Task 11: Hub section page wrappers

**Files:**
- Modify: `src/app/(internal)/courses/[id]/schedule/page.tsx` (and members, assessments, announcements, materials)

- [ ] **Step 1: Remove redundant `PageContainer` top chrome if duplicated**

Each page keeps its body but drops any local back buttons pointing to course home (rail replaces them).

- [ ] **Step 2: Ensure `.sj-root` spacing consistent** — hub shell already wraps; pages use `PageContainer width="default"` inside.

---

## Task 12: Delete legacy hub chrome files

- [ ] **Step 1: Delete files listed in File structure**

- [ ] **Step 2: Grep cleanup**

Run: `rg 'course-hub-nav|CourseHubToolbar|CourseHubNav' schedjuice-reimagined-fe/src`

Expected: no matches.

- [ ] **Step 3: Final verification**

Run: `pnpm run lint && pnpm run test:unit && pnpm run build`

Checklist from spec §12:
- [ ] Rail on all `/courses/[id]/**`
- [ ] Teaching-flow order + permission gates
- [ ] Attendance family active state
- [ ] Hub identity strip; sub-routes without strip
- [ ] ⋯ overflow minus attendance/grading
- [ ] Join code in header
- [ ] Old tabs/bottom bar gone

- [ ] **Step 4: Stage only — ready for user-authorized commit**

---

## Plan self-review

**Spec coverage:**
- [x] Persistent shell all routes → Tasks 4–5
- [x] Context rail swap → Task 2 + 5
- [x] Teaching-flow IA → Task 1
- [x] Attendance/Grading promoted → Task 1 + rail
- [x] Panel ⋯ overflow → Tasks 7–8
- [x] Identity strip hub-only → Task 9
- [x] Overview redesign → Task 10
- [x] Sub-route bodies unchanged → Stage A keeps them
- [x] Mobile sections → Task 3
- [x] Dual-path nav breadcrumb → Task 4
- [x] Delete old chrome → Task 6 + 12

**Placeholder scan:** None found.

**Type consistency:** `CourseRecordNavId`, `courseRecordHref`, `courseRecordNavActive` used consistently across rail, mobile, header hook.
