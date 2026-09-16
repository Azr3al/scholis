# Course Record UI Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Fix four course record shell regressions (find-page overlap, rail left-click navigation, duplicate status, hidden staff menu) and ship an Overview inline-edit slice for title, description, and status in the identity strip.

**Architecture:** Stage 1 ships three quick shell fixes (find-page record-route gate, stable context-rail registration with plain `<Link>` nav rows, promoted Edit + labeled Course actions). Stage 2 replaces `CourseRecordHeader` with `CourseRecordIdentityStrip` using `useAutosaveForm` + lifted `CourseStatusActions`, and dedupes legacy `CourseHeader`.

**Tech Stack:** Next.js 15 App Router, React 19, Base UI, Iconoir, `motion/react`, TanStack Query, react-hook-form + zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-24-course-record-ui-fixes-design.md`

---

## File structure

**Create:**
- `src/lib/is-course-record-route.ts` — pathname helper + unit test
- `src/lib/is-course-record-route.test.ts`
- `src/components/course/record/course-record-identity-strip.tsx` — inline title/description/status (Stage 2)
- `src/components/course/record/course-record-status-actions.tsx` — lifted from `course-header.tsx` (Stage 2)
- `src/components/course/record/course-record-inline-description.tsx` — textarea inline field (Stage 2; title reuses `InlineField`)

**Modify:**
- `src/components/find-page/find-page-dialog.tsx` — hide dock/skirt on course record routes
- `src/components/shell/sidebar-context.tsx` — `ContextRailConfig` render callback
- `src/components/shell/use-context-rail.ts` — stable registration (parent-only effect deps)
- `src/components/shell/app-shell.tsx` — call `contextRail.renderRail()`
- `src/app/(internal)/courses/[id]/layout.tsx` — pass render callback to `useContextRail`
- `src/app/(internal)/users/[id]/page.tsx` — migrate to render callback (same bug class)
- `src/components/course/record/course-section-rail.tsx` — plain `<Link>` nav rows
- `src/config/course-record-nav.ts` — export `PANEL_OVERFLOW_EXCLUDED_HREFS` (rail + promoted edit)
- `src/components/course/record/course-overflow-menu-items.tsx` — use expanded exclusion set
- `src/components/course/record/course-record-header-actions.tsx` — Edit button + labeled menu
- `src/components/course/record/course-hub-route-shell.tsx` — mount identity strip
- `src/components/course/overveiw/course-header.tsx` — remove status row + duplicate title/description
- `src/components/course/record/course-record-header.tsx` — delete or re-export strip (Stage 2 cleanup)

**Delete (Stage 2, after strip ships):**
- `src/components/course/record/course-record-header.tsx` — replaced by `course-record-identity-strip.tsx`

---

# Stage 1 — Shell fixes (shippable alone)

## Task 1: `isCourseRecordRoute` helper + tests

**Files:**
- Create: `src/lib/is-course-record-route.ts`
- Create: `src/lib/is-course-record-route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/is-course-record-route.test.ts
import { describe, expect, it } from "vitest";
import { isCourseRecordRoute } from "./is-course-record-route";

describe("isCourseRecordRoute", () => {
  it("matches course detail paths", () => {
    expect(isCourseRecordRoute("/courses/42")).toBe(true);
    expect(isCourseRecordRoute("/courses/42/schedule")).toBe(true);
    expect(isCourseRecordRoute("/courses/42/edit")).toBe(true);
  });

  it("rejects non-course paths", () => {
    expect(isCourseRecordRoute("/courses")).toBe(false);
    expect(isCourseRecordRoute("/courses/create")).toBe(false);
    expect(isCourseRecordRoute("/users/1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/lib/is-course-record-route.test.ts`

- [ ] **Step 3: Implement helper**

```typescript
// src/lib/is-course-record-route.ts
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";

/** True for `/courses/[id]/**` (course record workspace). */
export function isCourseRecordRoute(pathname: string): boolean {
  const match = /^\/courses\/([^/]+)(?:\/.*)?$/.exec(pathname);
  if (!match) return false;
  return isValidApiEntityIdParam(match[1]);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/lib/is-course-record-route.test.ts`

- [ ] **Step 5: Stage only**

```bash
git add src/lib/is-course-record-route.ts src/lib/is-course-record-route.test.ts
```

---

## Task 2: Hide find-page dock on course record routes

**Files:**
- Modify: `src/components/find-page/find-page-dialog.tsx`

- [ ] **Step 1: Import helpers and gate closed-state UI**

At top of `FindPageDialog`, add:

```typescript
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/shell/sidebar-context";
import { isCourseRecordRoute } from "@/lib/is-course-record-route";
```

Inside component:

```typescript
const pathname = usePathname();
const { recordMode } = useSidebar();
const hideDock = recordMode && isCourseRecordRoute(pathname);
```

- [ ] **Step 2: Skip skirt + fixed trigger when `hideDock`**

Wrap the skirt `AnimatePresence` block and the fixed trigger `div` (lines ~191–257) with `{!hideDock ? ( … ) : null}`.

When `open === true`, still render the open palette (backdrop + expanded island). Keyboard ⌘K must still call `setOpen(true)` — unchanged in provider.

- [ ] **Step 3: Manual verify**

Run dev server, open `/courses/[id]`:
- No “find a page” dock or notch skirt visible
- Breadcrumb fully readable
- ⌘K still opens palette

- [ ] **Step 4: Stage only**

```bash
git add src/components/find-page/find-page-dialog.tsx
```

---

## Task 3: Stabilize `useContextRail` registration

**Files:**
- Modify: `src/components/shell/sidebar-context.tsx`
- Modify: `src/components/shell/use-context-rail.ts`
- Modify: `src/components/shell/app-shell.tsx`
- Modify: `src/app/(internal)/courses/[id]/layout.tsx`
- Modify: `src/app/(internal)/users/[id]/page.tsx`

- [ ] **Step 1: Change `ContextRailConfig` to use render callback**

In `sidebar-context.tsx`:

```typescript
export type ContextRailConfig = {
  parent: ContextRailParent;
  renderRail: () => ReactNode | null;
};
```

- [ ] **Step 2: Refactor `useContextRail`**

Replace `useContextRail(rail: ReactNode | null, parent)` with:

```typescript
"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { ContextRailParent } from "./sidebar-context";
import { useSidebar } from "./sidebar-context";

export function useContextRail(
  renderRail: () => ReactNode | null,
  parent: ContextRailParent,
) {
  const { setContextRail } = useSidebar();
  const renderRef = useRef(renderRail);
  renderRef.current = renderRail;

  useEffect(() => {
    setContextRail({
      parent,
      renderRail: () => renderRef.current(),
    });
    return () => setContextRail(null);
  }, [parent.href, parent.label, setContextRail]);
}
```

Effect deps are **only** `parent.href`, `parent.label`, `setContextRail` — not the React element tree.

- [ ] **Step 3: Update `app-shell.tsx`**

Change:

```tsx
{contextRail ? (
  <div className="hidden h-full md:flex">{contextRail.rail}</div>
) : null}
```

To:

```tsx
{contextRail ? (
  <div className="hidden h-full md:flex">{contextRail.renderRail()}</div>
) : null}
```

- [ ] **Step 4: Update course layout**

In `courses/[id]/layout.tsx`, replace `useContextRail(sectionRail, …)` with:

```typescript
useContextRail(
  () =>
    courseId ? (
      <CourseSectionRail
        courseId={courseId}
        course={hasCourse ? typedCourse : null}
        user={user}
        tenant={tenant ?? null}
        pathname={pathname}
        isLoading={isCourseLoading}
      />
    ) : null,
  COURSE_CONTEXT_PARENT,
);
```

Remove the `sectionRail` `useMemo` block entirely.

- [ ] **Step 5: Update user record page**

In `users/[id]/page.tsx`, replace:

```typescript
useContextRail(sectionRail, USER_RECORD_CONTEXT_PARENT);
```

With:

```typescript
useContextRail(
  () =>
    isAuthCheckFinished && !userQueryIsError ? (
      <RecordSectionRail subject={user} section={section} onSelect={setSection} />
    ) : null,
  USER_RECORD_CONTEXT_PARENT,
);
```

Remove the `sectionRail` `useMemo`.

- [ ] **Step 6: Manual verify rail navigation**

On `/courses/[id]`, left-click Schedule → URL changes to `/schedule`, calendar renders. Repeat for Members. No rail flash.

- [ ] **Step 7: Stage only**

```bash
git add src/components/shell/sidebar-context.tsx \
  src/components/shell/use-context-rail.ts \
  src/components/shell/app-shell.tsx \
  src/app/(internal)/courses/[id]/layout.tsx \
  src/app/(internal)/users/[id]/page.tsx
```

---

## Task 4: Plain `<Link>` rows in `CourseSectionRail`

**Files:**
- Modify: `src/components/course/record/course-section-rail.tsx`

- [ ] **Step 1: Remove per-item `motion.div` wrappers from nav links**

Change the `<nav>` block to:

```tsx
<motion.nav
  variants={staggerList}
  initial="hidden"
  animate="show"
  className="flex flex-col gap-0.5 px-2 py-2"
>
  {entries.map((entry) => {
    const href = courseRecordHref(courseId, entry);
    const active = courseRecordNavActive(entry.id, pathname, courseId);
    return (
      <Link
        key={entry.id}
        href={href}
        onClick={() => {
          if (!active) playClick();
        }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "block rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
          active
            ? "bg-surface-active font-medium text-text-primary"
            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        {entry.label}
      </Link>
    );
  })}
</motion.nav>
```

Keep stagger on back link + identity block `motion.div` wrappers (non-nav).

- [ ] **Step 2: Re-test left-click navigation**

Run: manual click test on all visible rail entries.

- [ ] **Step 3: Stage only**

```bash
git add src/components/course/record/course-section-rail.tsx
```

---

## Task 5: Promoted Edit + labeled Course actions

**Files:**
- Modify: `src/config/course-record-nav.ts`
- Modify: `src/components/course/record/course-overflow-menu-items.tsx`
- Modify: `src/components/course/record/course-record-header-actions.tsx`

- [ ] **Step 1: Add panel overflow exclusion constant**

In `course-record-nav.ts`, after `RAIL_OVERFLOW_EXCLUDED_HREFS`:

```typescript
/** Also exclude from Course actions menu (promoted to visible header button). */
export const PANEL_OVERFLOW_EXCLUDED_HREFS = new Set([
  ...RAIL_OVERFLOW_EXCLUDED_HREFS,
  "edit",
]);
```

- [ ] **Step 2: Update overflow menu filter**

In `course-overflow-menu-items.tsx`, replace `RAIL_OVERFLOW_EXCLUDED_HREFS` import/usage with `PANEL_OVERFLOW_EXCLUDED_HREFS`.

- [ ] **Step 3: Rewrite `CourseRecordHeaderActions`**

```tsx
"use client";

import Link from "next/link";
import { EditPencil, MoreHoriz } from "iconoir-react";
import { Button } from "@/components/primitives/button";
import { Menu } from "@/components/primitives/menu";
import CourseJoinCode from "@/components/course/join-code-handler";
import { CourseOverflowMenuItems } from "@/components/course/record/course-overflow-menu-items";
import { getDropdownMenuItems } from "@/config/course";
import { PANEL_OVERFLOW_EXCLUDED_HREFS } from "@/config/course-record-nav";
import { canAccessCourseStaffActions, permissionsFor } from "@/helpers/authorization";
import type { courseType } from "@/types/course";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

function hasOverflowItems(
  user: accountType,
  course: courseType,
  tenant: organizationType | null,
): boolean {
  return getDropdownMenuItems(user, course, tenant).some((group) =>
    group.some((item) => !PANEL_OVERFLOW_EXCLUDED_HREFS.has(item.href.split("?")[0])),
  );
}

export function CourseRecordHeaderActions({ courseId, course, user, tenant }: { … }) {
  const showJoinCode = canAccessCourseStaffActions(user);
  const showEdit = permissionsFor(user).can("course.update");
  const showOverflow = hasOverflowItems(user, course, tenant);

  if (!showJoinCode && !showEdit && !showOverflow) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {showJoinCode ? <CourseJoinCode course={course} /> : null}
      {showEdit ? (
        <Button
          variant="secondary"
          size="sm"
          render={<Link href={`/courses/${courseId}/edit`} />}
        >
          <EditPencil width={16} height={16} aria-hidden />
          Edit course
        </Button>
      ) : null}
      {showOverflow ? (
        <Menu.Root>
          <Menu.Trigger
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-text-secondary outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            aria-label="Course actions"
          >
            <span className="hidden sm:inline">Course actions</span>
            <span className="sm:hidden">Actions</span>
            <MoreHoriz width={16} height={16} aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end">
              <Menu.Popup>
                <CourseOverflowMenuItems … />
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
    </div>
  );
}
```

Adjust `Button` `render` prop to match existing primitive API if different (check `components/primitives/button.tsx` — use `asChild` + Link pattern if needed).

- [ ] **Step 4: Extend `course-record-nav.test.ts`**

```typescript
import { PANEL_OVERFLOW_EXCLUDED_HREFS } from "./course-record-nav";

it("excludes promoted edit from panel overflow", () => {
  expect(PANEL_OVERFLOW_EXCLUDED_HREFS.has("edit")).toBe(true);
});
```

Run: `pnpm vitest run src/config/course-record-nav.test.ts`

- [ ] **Step 5: Manual verify**

Staff user on course page sees **Edit course** button + **Course actions** menu; Edit is not duplicated in menu.

- [ ] **Step 6: Stage only**

```bash
git add src/config/course-record-nav.ts \
  src/config/course-record-nav.test.ts \
  src/components/course/record/course-overflow-menu-items.tsx \
  src/components/course/record/course-record-header-actions.tsx
```

---

## Task 6: Stage 1 verification

- [ ] **Step 1: Run unit tests**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/lib/is-course-record-route.test.ts src/config/course-record-nav.test.ts`

- [ ] **Step 2: Run build**

Run: `cd schedjuice-reimagined-fe && pnpm run build`

Expected: PASS

- [ ] **Stage 1 manual checklist**

- [ ] Breadcrumb readable on course Overview (no find-page dock)
- [ ] ⌘K opens palette on course route
- [ ] Rail left-click navigates between sections
- [ ] Edit course button visible; Course actions menu labeled

---

# Stage 2 — Overview identity strip + inline edit

## Task 7: Extract `CourseRecordStatusActions`

**Files:**
- Create: `src/components/course/record/course-record-status-actions.tsx`
- Modify: `src/components/course/overveiw/course-header.tsx`

- [ ] **Step 1: Cut `CourseStatusActions` component** (~lines 91–807 in `course-header.tsx`) into new file `course-record-status-actions.tsx`.

Export as `CourseRecordStatusActions`. Keep imports for mutations (`pauseCourse`, `resumeCourse`, `endCourse`, `reactivateCourse`), dialogs (use Base UI `Dialog` if migrating, or keep existing AlertDialog from shadcn **inside this extracted file only** — do not expand scope to reskin dialogs).

- [ ] **Step 2: Replace usage in `course-header.tsx`**

Remove local `CourseStatusActions` definition. Remove the render block:

```tsx
<StatusBadge … />
{canManageCourseStatus ? <CourseStatusActions course={course} /> : null}
```

- [ ] **Step 3: Stage only**

```bash
git add src/components/course/record/course-record-status-actions.tsx \
  src/components/course/overveiw/course-header.tsx
```

---

## Task 8: Inline description field component

**Files:**
- Create: `src/components/course/record/course-record-inline-description.tsx`

- [ ] **Step 1: Create textarea inline field**

Mirror `InlineField` display/edit pattern but multi-line:

```tsx
"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, EditPencil } from "iconoir-react";
import { savedTick } from "@/lib/sj/motion";
import type { FieldSaveState } from "@/lib/autosave/autosave-core";
import { cn } from "@/lib/utils";
import type { UseFormReturn } from "react-hook-form";

export function CourseRecordInlineDescription({
  form,
  name,
  status,
  bindField,
  commitField,
  canEdit,
}: {
  form: UseFormReturn<any>;
  name: string;
  status?: FieldSaveState;
  bindField: (name: string) => { onBlur: () => void };
  commitField: (name: string) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const value = (form.watch(name) as string | undefined) ?? "";
  const fieldBind = bindField(name);

  if (!canEdit) {
    return (
      <p className="max-w-3xl text-pretty text-sm leading-relaxed text-text-muted">
        {value || "—"}
      </p>
    );
  }

  // … same click-to-edit / blur-save pattern as InlineField but <textarea rows={3}>
}
```

- [ ] **Step 2: Stage only**

```bash
git add src/components/course/record/course-record-inline-description.tsx
```

---

## Task 9: `CourseRecordIdentityStrip`

**Files:**
- Create: `src/components/course/record/course-record-identity-strip.tsx`
- Modify: `src/components/course/record/course-hub-route-shell.tsx`
- Delete: `src/components/course/record/course-record-header.tsx` (after migration)

- [ ] **Step 1: Implement strip with autosave**

```tsx
"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { updateEntity } from "@/app/client-api/utils";
import { CourseIdentityBlock } from "@/components/course-identity/course-identity-block";
import { InlineField } from "@/components/record/inline/inline-field";
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import {
  canEditCourse,
  canManuallyChangeCourseStatus,
} from "@/helpers/authorization";
import {
  getCreatedByIdFromCourse,
  getTeacherMemberIdsFromCourse,
} from "@/helpers/course-hub";
import { formatCourseSchedulePattern } from "@/helpers/course-identity";
import { useUser } from "@/hooks/useUser";
import { CourseRecordInlineDescription } from "./course-record-inline-description";
import { CourseRecordStatusActions } from "./course-record-status-actions";
import type { courseType } from "@/types/course";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

export function CourseRecordIdentityStrip({ course }: { course: courseType }) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const teacherMemberIds = getTeacherMemberIdsFromCourse(course);
  const createdById = getCreatedByIdFromCourse(course);
  const canEdit = Boolean(user && canEditCourse(user, teacherMemberIds, createdById));
  const canManageStatus = Boolean(
    user && canManuallyChangeCourseStatus(user, teacherMemberIds, createdById),
  );
  const queryKey = ["getCourse", String(course.id)];

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: course.title ?? "",
      description: course.description ?? "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    form.reset({
      title: course.title ?? "",
      description: course.description ?? "",
    });
  }, [course.title, course.description, form]);

  const { bindField, commitField, fieldStatus } = useAutosaveForm({
    form,
    save: (diff) => updateEntity("courses", String(course.id), diff),
    queryKey,
  });

  const schedule = formatCourseSchedulePattern(course);

  return (
    <header className="sj-root flex flex-col gap-3 border-b border-border pb-6">
      <CourseIdentityBlock variant="hub" course={course} showBreadcrumb />
      {/* Title: InlineField with custom display className font-serif text-2xl OR wrapper */}
      {/* Schedule hint read-only */}
      {/* Description: CourseRecordInlineDescription */}
      {/* Status row: pill + CourseRecordStatusActions when canManageStatus */}
    </header>
  );
}
```

Wire `InlineField` for title — pass `label="Course title"` and override display typography via a thin wrapper or add optional `displayClassName` prop to `InlineField` if needed (prefer wrapper div with `font-serif text-2xl` around read mode).

Status row: show read-only status pill for all users; render `CourseRecordStatusActions` only when `canManageStatus`.

- [ ] **Step 2: Update `course-hub-route-shell.tsx`**

Replace `CourseRecordHeader` import with `CourseRecordIdentityStrip`.

- [ ] **Step 3: Delete `course-record-header.tsx`**

Remove file; grep for imports and update.

- [ ] **Step 4: Stage only**

```bash
git add src/components/course/record/course-record-identity-strip.tsx \
  src/components/course/record/course-hub-route-shell.tsx
git rm src/components/course/record/course-record-header.tsx
```

---

## Task 10: Dedupe legacy `CourseHeader`

**Files:**
- Modify: `src/components/course/overveiw/course-header.tsx`

- [ ] **Step 1: Remove duplicate description paragraph** in card header (~lines 1146–1148) if identity strip now owns description.

- [ ] **Step 2: Confirm no StatusBadge / status actions row remains** (removed in Task 7).

- [ ] **Step 3: Manual verify Overview**

- Single status control in identity strip
- Title editable on blur (staff)
- Description editable on blur (staff)
- Students see read-only title/description
- Zoom / category / dates blocks still render in card below

- [ ] **Step 4: Stage only**

```bash
git add src/components/course/overveiw/course-header.tsx
```

---

## Task 11: Final verification

- [ ] **Step 1: Run all related tests**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/lib/is-course-record-route.test.ts src/config/course-record-nav.test.ts`

- [ ] **Step 2: Run build**

Run: `cd schedjuice-reimagined-fe && pnpm run build`

- [ ] **Step 3: Lint touched files**

Run: `pnpm exec eslint src/components/course/record src/components/find-page/find-page-dialog.tsx src/components/shell/use-context-rail.ts --max-warnings 0`

- [ ] **Step 4: Full manual checklist (spec §9)**

| Check | Pass |
| --- | --- |
| Breadcrumb never covered on course routes | |
| ⌘K opens find page on course routes | |
| Rail left-click navigates all sections | |
| Status shown once with staff actions in strip | |
| Edit course + Course actions visible | |
| Title/description inline autosave (staff) | |

---

## Spec coverage self-review

| Spec § | Task |
| --- | --- |
| §4 Find-page record exception | Task 1–2 |
| §5 Rail navigation fix | Task 3–4 |
| §6 Identity strip + inline edit | Task 7–10 |
| §7 Staff actions (Edit + labeled menu) | Task 5 |
| §9 Tests | Task 1, 5, 11 |
| ⌘K still works | Task 2 (open state not gated) |
| `/edit` route stays | Task 5 (Edit button links there) |

No placeholders. Type names consistent across tasks.
