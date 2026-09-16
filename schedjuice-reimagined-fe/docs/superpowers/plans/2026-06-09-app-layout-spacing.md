# App Layout, Whitespace & Padding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single fixed `max-w-[1024px]` page frame with per-page width tiers (narrow/default/wide/full) via a `<PageContainer>` component, decouple the topbar to full-width, and apply a consistent "comfortable" spacing scale.

**Architecture:** The `(internal)` layout stops capping width; it owns a full-width sticky topbar and the scroll region. A new `<PageContainer width>` component owns the centered `border-x` body column, its width tier, comfortable gutters, and fullscreen override. Width-class resolution is a pure, unit-tested helper. Pages opt into a tier by wrapping their root in `<PageContainer>`.

**Tech Stack:** Next.js 15 (app router), React 19, Tailwind CSS v4, Vitest (node env, `src/**/*.test.ts`), zustand/nuqs (existing). `cn()` from `@/lib/utils`.

> **Repo policy note:** This repo follows a no-commit-until-requested rule. Commit steps are included per skill convention, but only run them once the user has explicitly asked for commits. Otherwise complete the code/test steps and skip the commit step.

---

## File Structure

**Create:**
- `src/lib/layout/page-width.ts` — pure width-tier → Tailwind max-width class mapping + fullscreen override logic.
- `src/lib/layout/page-width.test.ts` — unit tests for the mapping.
- `src/components/layout/page-container.tsx` — the `<PageContainer>` component (centered frame, gutters, fullscreen-aware).

**Modify:**
- `src/app/(internal)/layout.tsx` — remove the width cap from the frame; render full-width topbar + scroll region.
- `src/app/(internal)/**/page.tsx` (and the layout-owning component for pages that delegate, e.g. `src/components/user-hub/user-hub-page.tsx`) — wrap each page root in `<PageContainer width="…">`.

---

## Tier classification rules (use for every migrated page)

Decide a page's `width` by what it primarily renders:

- **`narrow`** (768px): a single form / create / edit / auth flow / single-record editor. Examples: `*/create`, `*/[id]/edit`, register, login.
- **`default`** (1024px): detail or dashboard pages mixing text + a few panels. Examples: course/user/intake detail, profile, notifications, debug index. This is also the value used when no `width` prop is passed.
- **`wide`** (1280px): any page whose main content is a list / table / data grid. Examples: users list, imports, all `finances/*`, question bank, course-roles, course members, recent-transactions, unpaid-students, payment-history.
- **`full`** (100%): edge-to-edge workspaces. Examples: attendance marking (`courses/[id]/attendance/marking/[eventIndex]`), attendance god-view (`attendances/god-view`), quiz taker.

When unsure between two tiers, choose the narrower one — widening later is a one-word change.

---

### Task 1: Pure width-tier resolution helper

**Files:**
- Create: `src/lib/layout/page-width.ts`
- Test: `src/lib/layout/page-width.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/layout/page-width.test.ts
import { describe, expect, it } from "vitest";
import { PAGE_WIDTHS, resolvePageWidthClass, type PageWidth } from "./page-width";

describe("resolvePageWidthClass", () => {
  it("maps each tier to its max-width class", () => {
    expect(resolvePageWidthClass("narrow", false)).toBe("max-w-[768px]");
    expect(resolvePageWidthClass("default", false)).toBe("max-w-[1024px]");
    expect(resolvePageWidthClass("wide", false)).toBe("max-w-[1280px]");
  });

  it("returns no max-width for the full tier", () => {
    expect(resolvePageWidthClass("full", false)).toBe("");
  });

  it("forces full width when fullscreen is active, ignoring the tier", () => {
    expect(resolvePageWidthClass("narrow", true)).toBe("");
    expect(resolvePageWidthClass("wide", true)).toBe("");
    expect(resolvePageWidthClass("default", true)).toBe("");
  });

  it("exposes the list of tiers", () => {
    const tiers: PageWidth[] = ["narrow", "default", "wide", "full"];
    expect(Object.keys(PAGE_WIDTHS)).toEqual(tiers);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/layout/page-width.test.ts`
Expected: FAIL — cannot resolve module `./page-width`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/layout/page-width.ts
export type PageWidth = "narrow" | "default" | "wide" | "full";

export const PAGE_WIDTHS: Record<PageWidth, string> = {
  narrow: "max-w-[768px]",
  default: "max-w-[1024px]",
  wide: "max-w-[1280px]",
  full: "",
};

export const DEFAULT_PAGE_WIDTH: PageWidth = "default";

export function resolvePageWidthClass(
  width: PageWidth,
  isFullscreen: boolean,
): string {
  if (isFullscreen) return PAGE_WIDTHS.full;
  return PAGE_WIDTHS[width];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/layout/page-width.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit** (only if commits requested)

```bash
git add src/lib/layout/page-width.ts src/lib/layout/page-width.test.ts
git commit -m "feat(layout): add page-width tier resolution helper"
```

---

### Task 2: `<PageContainer>` component

**Files:**
- Create: `src/components/layout/page-container.tsx`

Reference existing patterns: `cn` lives in `@/lib/utils`; `useFullscreen` in `@/hooks/use-fullscreen` returns `{ isFullscreen, toggle }` where `isFullscreen` is `boolean | null` (from nuqs `parseAsBoolean`).

- [ ] **Step 1: Write the component**

```tsx
// src/components/layout/page-container.tsx
"use client";

import { cn } from "@/lib/utils";
import { useFullscreen } from "@/hooks/use-fullscreen";
import {
  DEFAULT_PAGE_WIDTH,
  resolvePageWidthClass,
  type PageWidth,
} from "@/lib/layout/page-width";

interface PageContainerProps {
  width?: PageWidth;
  className?: string;
  children: React.ReactNode;
}

export function PageContainer({
  width = DEFAULT_PAGE_WIDTH,
  className,
  children,
}: PageContainerProps) {
  const { isFullscreen } = useFullscreen();
  const maxWidthClass = resolvePageWidthClass(width, Boolean(isFullscreen));

  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 border-x border-border",
        "px-4 pb-20 pt-6 sm:px-6 lg:px-8",
        "transition-[max-width] duration-200 ease-in-out",
        maxWidthClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks / lints**

Run: `npm run lint`
Expected: no new errors referencing `page-container.tsx`.

- [ ] **Step 3: Commit** (only if commits requested)

```bash
git add src/components/layout/page-container.tsx
git commit -m "feat(layout): add PageContainer with width tiers and fullscreen override"
```

---

### Task 3: Refactor `(internal)` layout — decouple topbar, drop width cap

**Files:**
- Modify: `src/app/(internal)/layout.tsx`

Current `TempLayout` (lines ~17-42) wraps the topbar and body in a `mx-auto max-w-[1024px] border-x p-2` frame. Replace it so the topbar is full-width and the body width is owned by each page's `<PageContainer>`.

- [ ] **Step 1: Replace `TempLayout`**

```tsx
const TempLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="w-full min-w-0">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[400] -translate-y-24 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-md transition focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to main content
      </a>
      <AppTopbarSuspence />
      <div className="w-full min-w-0">{children}</div>
    </div>
  );
};
```

Notes:
- `useFullscreen` is no longer used in `TempLayout`; remove its import/usage from this file if nothing else references it there.
- Leave `RootLayout` (the `SidebarProvider` / `SidebarInset` / `ChatArea` / `WebPushRegistrar` wiring) unchanged.
- The topbar (`AppTopbarSuspence`) already renders a `sticky top-0 w-full` header, so moving it out of the capped frame makes it span the full `SidebarInset` width with no change to the topbar component itself.

- [ ] **Step 2: Verify layout renders without the cap**

Run: `npm run dev` and load any internal page.
Expected: page content is full-width (no 1024 cap) and flush, because pages haven't been wrapped yet. The topbar spans full width. This is the intended intermediate state before Task 4+.

- [ ] **Step 3: Commit** (only if commits requested)

```bash
git add "src/app/(internal)/layout.tsx"
git commit -m "refactor(layout): decouple topbar and remove fixed width cap"
```

---

## Migration tasks (Task 4+)

Each migration task wraps every `page.tsx` in one route area in `<PageContainer width="…">`, choosing the tier via the classification rules above. The transform is mechanical:

**Canonical transform** — a page whose root is a plain wrapper:

```tsx
// BEFORE
export default function Foo() {
  return (
    <div className="space-y-6">
      {/* … */}
    </div>
  );
}

// AFTER
import { PageContainer } from "@/components/layout/page-container";

export default function Foo() {
  return (
    <PageContainer width="wide" className="space-y-6">
      {/* … */}
    </PageContainer>
  );
}
```

**Delegating pages** — when `page.tsx` just returns a component (e.g. `users/page.tsx` returns `<UserHubPage />`), wrap inside the component that owns the visual root (e.g. `src/components/user-hub/user-hub-page.tsx`), not the one-line route file. Apply the same transform to that component's outermost layout `<div>`.

For each task: after wrapping, run `npm run lint`, then load the page in `npm run dev` to confirm it is centered, framed, and uncramped at desktop width and not overflowing on mobile.

---

### Task 4: Management & imports area → mostly `wide`

**Files (Modify):**
- `src/components/user-hub/user-hub-page.tsx` (root of `users/page.tsx`) → `wide`
- `src/app/(internal)/user-hub/page.tsx` → `wide`
- `src/app/(internal)/imports/page.tsx` → `wide`
- `src/app/(internal)/students/page.tsx` (if present) → `wide`
- `src/app/(internal)/student-registration/page.tsx` → `wide`
- `src/app/(internal)/users/create/page.tsx` → `narrow`
- `src/app/(internal)/users/[id]/page.tsx` → `default`
- `src/app/(internal)/users/[id]/edit/page.tsx` → `narrow`

- [ ] **Step 1:** Apply the canonical transform to each file above with its listed tier. For `imports/page.tsx`, the root is `<div className="space-y-6">` → `<PageContainer width="wide" className="space-y-6">`.
- [ ] **Step 2:** Run `npm run lint`. Expected: no new errors.
- [ ] **Step 3:** Load `/imports` and `/users` in dev. Expected: wide centered column, comfortable gutters, no overflow.
- [ ] **Step 4: Commit** (only if commits requested)

```bash
git add "src/app/(internal)/imports" "src/app/(internal)/users" "src/app/(internal)/user-hub" "src/app/(internal)/student-registration" src/components/user-hub/user-hub-page.tsx
git commit -m "refactor(layout): adopt PageContainer for management pages"
```

---

### Task 5: Finances area → `wide`

**Files (Modify):** every `page.tsx` under `src/app/(internal)/finances/` — `payment-history`, `student-payments/upload`, `recent-transactions`, `unpaid-students`, `microsoft-payroll`. All `wide` (they are tables/reports), except `student-payments/upload` which is a form → `narrow`.

- [ ] **Step 1:** Apply the canonical transform to each finances `page.tsx` with its tier (`wide` for the lists/reports, `narrow` for `student-payments/upload`).
- [ ] **Step 2:** Run `npm run lint`. Expected: no new errors.
- [ ] **Step 3:** Load `/finances/payment-history` and `/finances/unpaid-students` in dev. Expected: wide centered tables, no overflow.
- [ ] **Step 4: Commit** (only if commits requested)

```bash
git add "src/app/(internal)/finances"
git commit -m "refactor(layout): adopt PageContainer for finances pages"
```

---

### Task 6: Academic area (programs, intakes, subjects, course-roles, certificates) → mixed

**Files (Modify):** every `page.tsx` under `programs/`, `intakes/`, `subjects/`, `course-roles/`, `certificates/`, `quizzes-v3/` (incl. `question-bank`). Tiers by rule:
- Lists/tables (`programs`, `intakes`, `subjects`, `course-roles`, `quizzes-v3`, `quizzes-v3/question-bank`, `certificates/categories`) → `wide`
- Detail (`programs/[id]/settings`, `intakes/[id]`) → `default`
- Forms (`subjects/create`, `programs/[id]/edit`, `certificates/create`, `announcements/[id]/edit`, `assignments/[id]/edit`) → `narrow`

- [ ] **Step 1:** Apply the canonical transform to each `page.tsx` in these areas with its tier.
- [ ] **Step 2:** Run `npm run lint`. Expected: no new errors.
- [ ] **Step 3:** Load `/programs`, `/subjects`, `/quizzes-v3/question-bank` in dev. Expected: wide centered, framed, no overflow.
- [ ] **Step 4: Commit** (only if commits requested)

```bash
git add "src/app/(internal)/programs" "src/app/(internal)/intakes" "src/app/(internal)/subjects" "src/app/(internal)/course-roles" "src/app/(internal)/certificates" "src/app/(internal)/quizzes-v3"
git commit -m "refactor(layout): adopt PageContainer for academic pages"
```

---

### Task 7: Courses area → mixed, incl. `full` workspaces

**Files (Modify):** every `page.tsx` under `src/app/(internal)/courses/`. Tiers by rule:
- Course detail tabs (`courses/[id]/materials`, `schedule`, `members`, `recordings`, `assessments`, `announcements`) → `members`/`assessments` (tables) `wide`; the rest `default`.
- `courses/[id]/edit`, the create-flow steps under `courses/create/program/[programId]/intake/*` → `narrow` (forms/wizard).
- `courses/[id]/attendance/marking/[eventIndex]` → `full`.
- Note: `courses/[id]/layout.tsx`, `courses/layout.tsx`, `courses/create/layout.tsx`, and the intake `layout.tsx` already wrap their children. If one of these layouts owns the visual root, wrap there instead of each child `page.tsx` — but do NOT double-wrap (a `<PageContainer>` must never contain another `<PageContainer>`). Inspect each layout first; put exactly one `<PageContainer>` on the outermost content root per rendered page.

- [ ] **Step 1:** Inspect the `courses` layouts to find where the content root lives, then apply exactly one `<PageContainer>` per rendered page at the correct tier.
- [ ] **Step 2:** Run `npm run lint`. Expected: no new errors.
- [ ] **Step 3:** Load `/courses/[id]/members`, a course edit page, and an attendance marking page in dev. Expected: `members` wide, edit narrow, marking full-bleed; exactly one frame each.
- [ ] **Step 4: Commit** (only if commits requested)

```bash
git add "src/app/(internal)/courses"
git commit -m "refactor(layout): adopt PageContainer for course pages"
```

---

### Task 8: Remaining areas (organizations, payment-infos, attendances, assignments, submissions, announcements, notifications, profile, search, shortcuts, screenshots, debug)

**Files (Modify):** every remaining `page.tsx` under `src/app/(internal)` not covered by Tasks 4-7. Tiers by rule:
- `attendances/god-view` → `full`; quiz taker route → `full`.
- Lists/tables (`organizations/[id]/admins`, `payment-infos`, `debug/*` lists, `search`) → `wide`.
- Forms (`organizations/profile/edit`, `organizations/[id]/edit`, `payment-infos/create`, `payment-infos/[id]/edit`, `organizations/[id]/admins/create`) → `narrow`.
- Detail/misc (`notifications`, `profile`, `submissions/[id]`, `assignments/[id]`, `payment-infos/[id]`, `debug` index, `shortcuts/*`, `screenshots/create`) → `default`.

- [ ] **Step 1:** Apply the canonical transform to each remaining `page.tsx` with its tier.
- [ ] **Step 2:** Run `npm run lint`. Expected: no new errors.
- [ ] **Step 3: Sweep check** — grep for any internal page still not wrapped:

Run: `rg -L "PageContainer" "src/app/(internal)" --glob "page.tsx" -l | rg -v "layout"` and manually confirm each remaining file either delegates to an already-wrapped component or is intentionally unwrapped. Expected: no unaccounted pages.

- [ ] **Step 4: Commit** (only if commits requested)

```bash
git add "src/app/(internal)"
git commit -m "refactor(layout): adopt PageContainer for remaining internal pages"
```

---

### Task 9: Cleanup & final verification

**Files:**
- Modify: `src/app/(internal)/layout-styles.css` (remove the now-unused `.container` width rules if nothing references them)

- [ ] **Step 1:** Run `rg "layout-styles" src` and `rg "\\bcontainer\\b" "src/app/(internal)"` to confirm the `.container` class from `layout-styles.css` is unused; if so, delete the `.container` block (keep `.scrollbar-hide`). If still referenced, leave it.
- [ ] **Step 2:** Run the full unit suite.

Run: `npm run test:unit`
Expected: PASS (existing suite + the new `page-width` tests).

- [ ] **Step 3:** Run lint.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual matrix check** — for one page per tier (a narrow form, a default detail, a wide table, a full workspace), verify at mobile (375px), tablet (768px), desktop (1440px), ultrawide (1920px):
  - Centered, `border-x` frame visible (except `full`).
  - Comfortable gutters (16→32px); no flush-to-edge content.
  - No horizontal overflow on data grids (`min-w-0` preserved).
  - Fullscreen toggle forces full width from any tier and restores the tier on exit.
  - Sticky topbar stays full-width and stable when navigating across tiers.

- [ ] **Step 5: Commit** (only if commits requested)

```bash
git add "src/app/(internal)/layout-styles.css"
git commit -m "chore(layout): remove unused fixed-width container styles"
```

---

## Self-Review

- **Spec coverage:** width tiers (Task 1-2), `<PageContainer>` mechanism (Task 2), comfortable density gutters/rhythm (Task 2 classes + `space-y-6` preserved per page), default tier 1024 (Task 1 `DEFAULT_PAGE_WIDTH`), all tables → wide (classification rules + Tasks 4-8), decoupled full-width topbar (Task 3), fullscreen override (Task 1 + 2), tier mapping (Tasks 4-8), migration of all internal pages (Tasks 4-8), testing (Task 9). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; the migration recipe is shown once and applied uniformly with explicit per-area file lists and tiers.
- **Type consistency:** `PageWidth`, `PAGE_WIDTHS`, `DEFAULT_PAGE_WIDTH`, `resolvePageWidthClass(width, isFullscreen)` are defined in Task 1 and used unchanged in Task 2; `<PageContainer width className>` props are consistent across all migration tasks.
- **Double-wrap guard:** Task 7 explicitly warns against nesting `<PageContainer>` inside layouts that already wrap children.
