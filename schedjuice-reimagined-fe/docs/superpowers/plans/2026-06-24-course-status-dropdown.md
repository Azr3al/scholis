# Course Status Badge Dropdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Hide course status action buttons behind a clickable status badge dropdown on the course record identity strip.

**Architecture:** Extract menu item visibility into a pure helper (`getCourseStatusMenuItems`). Refactor `CourseRecordStatusActions` to render the badge as a `DropdownMenu` trigger when `canManageStatus`, with existing mutations and dialogs unchanged. Simplify `CourseRecordIdentityStrip` to a single status component.

**Tech Stack:** Next.js 15, React 19, Radix DropdownMenu (shadcn), Lucide icons, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-24-course-status-dropdown-design.md`

---

## File structure

**Create:**
- `src/lib/course-status-menu-items.ts` — pure helper + action key type
- `src/lib/course-status-menu-items.test.ts` — unit tests

**Modify:**
- `src/components/course/record/course-record-status-actions.tsx` — dropdown trigger + menu items
- `src/components/course/record/course-record-identity-strip.tsx` — pass `canManageStatus`, remove standalone badge

---

## Task 1: `getCourseStatusMenuItems` helper + tests

**Files:**
- Create: `src/lib/course-status-menu-items.ts`
- Create: `src/lib/course-status-menu-items.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/course-status-menu-items.test.ts
import { describe, expect, it } from "vitest";
import { getCourseStatusMenuItems } from "./course-status-menu-items";
import { courseStatus } from "@/types/course";

describe("getCourseStatusMenuItems", () => {
  it("returns pause and end for active courses", () => {
    expect(getCourseStatusMenuItems(courseStatus.active)).toEqual([
      "pause",
      "end",
    ]);
  });

  it("returns resume and end for paused courses", () => {
    expect(getCourseStatusMenuItems(courseStatus.paused)).toEqual([
      "resume",
      "end",
    ]);
  });

  it("returns end only for planned courses", () => {
    expect(getCourseStatusMenuItems(courseStatus.planned)).toEqual(["end"]);
  });

  it("returns reactivate only for ended courses", () => {
    expect(getCourseStatusMenuItems(courseStatus.ended)).toEqual([
      "reactivate",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/course-status-menu-items.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

```typescript
// src/lib/course-status-menu-items.ts
import { courseStatus } from "@/types/course";

export type CourseStatusMenuAction = "pause" | "resume" | "end" | "reactivate";

export function getCourseStatusMenuItems(
  status: courseStatus,
): CourseStatusMenuAction[] {
  switch (status) {
    case courseStatus.active:
      return ["pause", "end"];
    case courseStatus.paused:
      return ["resume", "end"];
    case courseStatus.planned:
      return ["end"];
    case courseStatus.ended:
      return ["reactivate"];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/course-status-menu-items.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Stage**

```bash
git add src/lib/course-status-menu-items.ts src/lib/course-status-menu-items.test.ts
```

---

## Task 2: Refactor `CourseRecordStatusActions` to dropdown

**Files:**
- Modify: `src/components/course/record/course-record-status-actions.tsx`

- [ ] **Step 1: Update props and imports**

Change signature to accept `canManageStatus`:

```typescript
export function CourseRecordStatusActions({
  course,
  canManageStatus,
}: {
  course: courseType;
  canManageStatus: boolean;
}) {
```

Add imports:

```typescript
import { ChevronDown, CirclePause, CircleX, RotateCcw, StepForward } from "lucide-react";
import StatusBadge from "@/components/course/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getCourseStatusMenuItems,
  type CourseStatusMenuAction,
} from "@/lib/course-status-menu-items";
```

Remove `Button` import if no longer used.

- [ ] **Step 2: Add read-only early return**

Before mutations/render logic, if `!canManageStatus`:

```typescript
if (!canManageStatus) {
  return <StatusBadge status={course.status} border={false} bg={false} />;
}
```

- [ ] **Step 3: Replace button row with dropdown**

Remove the two early-return blocks that render standalone buttons for `ended` vs other statuses. Replace the final `return` with:

```tsx
const menuItems = getCourseStatusMenuItems(course.status);

const handleMenuAction = (action: CourseStatusMenuAction) => {
  switch (action) {
    case "pause":
      pauseMutation.mutate();
      break;
    case "resume":
      resumeMutation.mutate();
      break;
    case "end":
      setEndDialogOpen(true);
      break;
    case "reactivate":
      openReactivateDialog();
      break;
  }
};

const menuLabels: Record<
  CourseStatusMenuAction,
  { label: string; icon: React.ReactNode; destructive?: boolean }
> = {
  pause: { label: "Pause course", icon: <CirclePause size={16} /> },
  resume: { label: "Resume course", icon: <StepForward size={16} /> },
  end: {
    label: "End course",
    icon: <CircleX size={16} />,
    destructive: true,
  },
  reactivate: { label: "Reactivate course", icon: <RotateCcw size={16} /> },
};

return (
  <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Course status actions"
          className="inline-flex items-center gap-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatusBadge status={course.status} border={false} bg={false} />
          <ChevronDown className="size-4 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        {menuItems.map((action) => {
          const { label, icon, destructive } = menuLabels[action];
          return (
            <DropdownMenuItem
              key={action}
              disabled={isPending}
              className={
                destructive
                  ? "gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                  : "gap-2"
              }
              onSelect={() => handleMenuAction(action)}
            >
              {icon}
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>

    {/* Keep existing AlertDialog (end) and Dialog (reactivate) unchanged below */}
  </>
);
```

Keep both dialog blocks exactly as they are today (end confirmation + reactivate date pickers).

- [ ] **Step 4: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit --pretty false 2>&1 | head -30`
Expected: no errors in modified files

- [ ] **Step 5: Stage**

```bash
git add src/components/course/record/course-record-status-actions.tsx
```

---

## Task 3: Simplify identity strip

**Files:**
- Modify: `src/components/course/record/course-record-identity-strip.tsx`

- [ ] **Step 1: Replace status row**

Remove `StatusBadge` import.

Change status row from:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <StatusBadge status={course.status} border={false} bg={false} />
  {canManageStatus ? <CourseRecordStatusActions course={course} /> : null}
</div>
```

To:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <CourseRecordStatusActions
    course={course}
    canManageStatus={canManageStatus}
  />
</div>
```

- [ ] **Step 2: Stage**

```bash
git add src/components/course/record/course-record-identity-strip.tsx
```

---

## Task 4: Verification

- [ ] **Step 1: Run unit tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/course-status-menu-items.test.ts`
Expected: PASS

- [ ] **Step 2: Manual QA checklist**

On a course record page (`/courses/[id]/overview` or any hub route with identity strip):

| Scenario | Expected |
| --- | --- |
| Student / read-only user | Badge only, no chevron, not clickable |
| Manager on **active** course | Badge + chevron; click → Pause course, End course |
| Click End course | AlertDialog opens; confirm ends course |
| Manager on **paused** course | Menu: Resume course, End course |
| Manager on **planned** course | Menu: End course only |
| Manager on **ended** course | Menu: Reactivate course; opens date dialog |
| During mutation | Menu items disabled |

- [ ] **Step 3: Stage all (if not already)**

```bash
git add src/lib/course-status-menu-items.ts \
  src/lib/course-status-menu-items.test.ts \
  src/components/course/record/course-record-status-actions.tsx \
  src/components/course/record/course-record-identity-strip.tsx
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Badge-only default UI | Task 2 + 3 |
| Dropdown on badge click (managers) | Task 2 |
| Reactivate behind badge | Task 1 + 2 |
| Read-only non-interactive badge | Task 2 early return |
| Preserve mutations/dialogs/toasts | Task 2 (dialogs kept) |
| Chevron + interactive affordance | Task 2 trigger |
| Destructive End styling | Task 2 menu item className |
| Pending disables items | Task 2 `disabled={isPending}` |
| Unit tests for menu helper | Task 1 |
