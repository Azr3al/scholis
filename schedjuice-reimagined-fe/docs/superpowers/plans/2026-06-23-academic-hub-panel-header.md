# Academic Hub Panel Header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Academic Hub (`/courses`) onto the Users-style panel header — grouped actions, segmented toolbar controls, optional secondary toolbar row — and extract a shared `ToolbarSegmentGroup` primitive for course-page chrome.

**Architecture:** Extend `PageHeaderConfig` with `toolbarSecondary`; add `ToolbarSegmentGroup` under `src/components/shell/`; refactor User Hub to consume it; replace `AcademicHubHeader` + stacked `filter-bar` with `AcademicHubToolbar` + `AcademicHubSecondaryToolbar` registered via `usePageHeader`. Filter logic and URL state stay in existing hooks — UI-only migration.

**Tech Stack:** Next.js App Router, Base UI primitives (`Button`, `Input`, `Switch`, `Select`), Iconoir, `use-debounce`, `nuqs` (via `useHubFilters`), Vitest.

**Spec:** [`docs/superpowers/specs/2026-06-23-academic-hub-panel-header-design.md`](../specs/2026-06-23-academic-hub-panel-header-design.md)

---

## File map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/components/shell/sidebar-context.tsx` | Modify | Add `toolbarSecondary` to `PageHeaderConfig` |
| `src/components/shell/panel-header.tsx` | Modify | Render optional third toolbar row |
| `src/components/shell/toolbar-segment-group.tsx` | Create | Shared segmented control chrome |
| `src/components/shell/toolbar-segment-group.test.ts` | Create | Unit tests for segment class helper |
| `src/components/user-hub/user-hub-toolbar.tsx` | Modify | Consume `ToolbarSegmentGroup` |
| `src/helpers/academic-hub/secondary-toolbar-visible.ts` | Create | Pure visibility logic for row 3 |
| `src/helpers/academic-hub/secondary-toolbar-visible.test.ts` | Create | Tests for row 3 visibility |
| `src/helpers/academic-hub/status-counts.ts` | Create | Status count helper (from `status-chips.tsx`) |
| `src/helpers/academic-hub/status-counts.test.ts` | Create | Tests for paused→active rollup |
| `src/components/academic-hub/academic-hub-toolbar.tsx` | Create | Primary toolbar (program, status, search, my-classes) |
| `src/components/academic-hub/academic-hub-secondary-toolbar.tsx` | Create | Secondary toolbar (intake, subject, category) |
| `src/components/academic-hub/academic-hub-page.tsx` | Modify | `usePageHeader`, remove legacy header/filter bar |
| `src/app/(internal)/courses/page.tsx` | Modify | Drop `PageContainer` wrapper |
| `src/components/academic-hub/academic-hub-header.tsx` | Delete | Absorbed into page header |
| `src/components/academic-hub/filter-bar/filter-bar.tsx` | Delete | Replaced by toolbars |
| `src/components/academic-hub/filter-bar/status-chips.tsx` | Delete | Logic moved to toolbar + helper |
| `src/components/academic-hub/filter-bar/program-chips.tsx` | Delete | Logic moved to toolbar |
| `src/components/academic-hub/filter-bar/my-only-toggle.tsx` | Delete | Inlined in primary toolbar |
| `src/components/academic-hub/filter-bar/subject-chips.tsx` | Delete | Inlined in secondary toolbar |
| `src/components/academic-hub/filter-bar/category-pills.tsx` | Delete | Inlined in secondary toolbar (toggle segments, not MultiCombobox) |
| `src/components/academic-hub/filter-bar/intake-select.tsx` | Delete | Inlined in secondary toolbar with primitives `Select` |

---

### Task 1: Extend shell for `toolbarSecondary`

**Files:**
- Modify: `src/components/shell/sidebar-context.tsx`
- Modify: `src/components/shell/panel-header.tsx`

- [ ] **Step 1: Add `toolbarSecondary` to config type**

In `src/components/shell/sidebar-context.tsx`, extend the type:

```tsx
export type PageHeaderConfig = {
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  toolbarSecondary?: ReactNode;
};
```

- [ ] **Step 2: Render third row in `PanelHeader`**

In `src/components/shell/panel-header.tsx`, after the existing toolbar block:

```tsx
const hasToolbar = Boolean(pageHeader?.toolbar);
const hasToolbarSecondary = Boolean(pageHeader?.toolbarSecondary);

// ... existing row 1 and row 2 unchanged ...

{hasToolbarSecondary ? (
  <div className="flex min-h-10 items-center gap-3 border-t border-[color-mix(in_srgb,var(--border-chrome)_60%,transparent)] px-4 py-2">
    {pageHeader!.toolbarSecondary}
  </div>
) : null}
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no new errors from these files.

- [ ] **Step 4: Checkpoint**

```bash
git add src/components/shell/sidebar-context.tsx src/components/shell/panel-header.tsx
git diff --cached --stat
```

---

### Task 2: `ToolbarSegmentGroup` primitive

**Files:**
- Create: `src/components/shell/toolbar-segment-group.tsx`
- Create: `src/components/shell/toolbar-segment-group.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/shell/toolbar-segment-group.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { segmentButtonClassName } from "./toolbar-segment-group";

describe("segmentButtonClassName", () => {
  it("returns active classes when pressed", () => {
    expect(segmentButtonClassName(true)).toContain("bg-surface-active");
    expect(segmentButtonClassName(true)).toContain("text-text-primary");
  });

  it("returns inactive classes when not pressed", () => {
    expect(segmentButtonClassName(false)).toContain("text-text-secondary");
    expect(segmentButtonClassName(false)).not.toContain("bg-surface-active");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/components/shell/toolbar-segment-group.test.ts`
Expected: FAIL — `segmentButtonClassName` not exported

- [ ] **Step 3: Implement primitive**

Create `src/components/shell/toolbar-segment-group.tsx`:

```tsx
"use client";

import { type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const GROUP_CLASS =
  "inline-flex h-8 items-center rounded-md border border-border bg-surface p-0.5";

const ICON_BTN =
  "inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors " +
  "duration-[var(--duration-fast)] hover:bg-surface-hover hover:text-text-primary " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

export function segmentButtonClassName(active: boolean, opts?: { icon?: boolean }) {
  return cn(
    opts?.icon ? cn(ICON_BTN, "size-7") : "inline-flex h-7 items-center justify-center rounded px-3 text-sm transition-colors",
    active
      ? "bg-surface-active font-medium text-text-primary"
      : "text-text-secondary hover:text-text-primary",
  );
}

type GroupProps = ComponentProps<"div"> & {
  "aria-label"?: string;
  role?: "group" | "tablist";
};

export function ToolbarSegmentGroup({
  className,
  role = "group",
  ...props
}: GroupProps) {
  return (
    <div
      role={role}
      className={cn(GROUP_CLASS, className)}
      {...props}
    />
  );
}

type SegmentProps = ComponentProps<"button"> & {
  active?: boolean;
  icon?: boolean;
};

export function ToolbarSegment({
  active = false,
  icon = false,
  className,
  type = "button",
  ...props
}: SegmentProps) {
  return (
    <button
      type={type}
      className={cn(segmentButtonClassName(active, { icon }), className)}
      {...props}
    />
  );
}

type ToggleProps = SegmentProps & {
  count?: number | string;
  children: ReactNode;
};

export function ToolbarSegmentToggle({
  active = false,
  count,
  children,
  className,
  ...props
}: ToggleProps) {
  return (
    <ToolbarSegment
      active={active}
      aria-pressed={active}
      className={cn("gap-1 whitespace-nowrap", className)}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="text-xs opacity-80">{count}</span>
      ) : null}
    </ToolbarSegment>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/components/shell/toolbar-segment-group.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Checkpoint**

```bash
git add src/components/shell/toolbar-segment-group.tsx src/components/shell/toolbar-segment-group.test.ts
```

---

### Task 3: Refactor User Hub toolbar

**Files:**
- Modify: `src/components/user-hub/user-hub-toolbar.tsx`

- [ ] **Step 1: Replace inline segment markup with primitive**

Replace tab list and view group containers with `ToolbarSegmentGroup` / `ToolbarSegment`. Full file after edit:

```tsx
"use client";

import { useDebouncedCallback } from "use-debounce";
import { List, Search, ViewGrid } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import { Switch } from "@/components/primitives/switch";
import {
  ToolbarSegment,
  ToolbarSegmentGroup,
} from "@/components/shell/toolbar-segment-group";
import { useHubUserFilters } from "@/hooks/user-hub/use-hub-user-filters";
import { UserHubTab, UserHubViewMode } from "@/types/user-hub";

const TAB_OPTIONS: { value: UserHubTab; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "students", label: "Students" },
];

const VIEW_OPTIONS: { value: UserHubViewMode; label: string; icon: typeof ViewGrid }[] = [
  { value: "grid", label: "Grid view", icon: ViewGrid },
  { value: "list", label: "List view", icon: List },
];

export function UserHubToolbar() {
  const filters = useHubUserFilters();
  const { state } = filters;
  const setQDebounced = useDebouncedCallback(filters.setQ, 150);

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <ToolbarSegmentGroup role="tablist" aria-label="User type">
        {TAB_OPTIONS.map(({ value, label }) => (
          <ToolbarSegment
            key={value}
            role="tab"
            aria-selected={state.tab === value}
            active={state.tab === value}
            className="min-w-[5.5rem]"
            onClick={() => filters.setTab(value)}
          >
            {label}
          </ToolbarSegment>
        ))}
      </ToolbarSegmentGroup>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            width={15}
            height={15}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            aria-label="Search users"
            placeholder="Search name, email, phone…"
            defaultValue={state.q}
            onChange={(e) => setQDebounced(e.target.value)}
            className="h-8 w-52 pl-8 text-sm sm:w-64"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <Switch
            checked={state.includeInactive}
            onCheckedChange={filters.setIncludeInactive}
            aria-label="Include inactive users"
          />
          <span className="hidden whitespace-nowrap sm:inline">Include inactive</span>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <Switch
            checked={state.incomplete}
            onCheckedChange={filters.setIncomplete}
            aria-label="Incomplete profiles only"
          />
          <span className="hidden whitespace-nowrap sm:inline">Incomplete</span>
        </label>

        <ToolbarSegmentGroup aria-label="View mode">
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
            <ToolbarSegment
              key={value}
              icon
              aria-label={label}
              aria-pressed={state.view === value}
              active={state.view === value}
              onClick={() => filters.setView(value)}
            >
              <Icon width={16} height={16} aria-hidden />
            </ToolbarSegment>
          ))}
        </ToolbarSegmentGroup>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Checkpoint**

```bash
git add src/components/user-hub/user-hub-toolbar.tsx
```

---

### Task 4: Academic Hub helpers

**Files:**
- Create: `src/helpers/academic-hub/status-counts.ts`
- Create: `src/helpers/academic-hub/status-counts.test.ts`
- Create: `src/helpers/academic-hub/secondary-toolbar-visible.ts`
- Create: `src/helpers/academic-hub/secondary-toolbar-visible.test.ts`

- [ ] **Step 1: Write failing status count test**

Create `src/helpers/academic-hub/status-counts.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { countForStatus } from "./status-counts";

describe("countForStatus", () => {
  const counts = { active: 10, planned: 3, ended: 5, paused: 2 };

  it("rolls paused into active", () => {
    expect(countForStatus("active", counts)).toBe(12);
  });

  it("returns planned and ended directly", () => {
    expect(countForStatus("planned", counts)).toBe(3);
    expect(countForStatus("ended", counts)).toBe(5);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/helpers/academic-hub/status-counts.test.ts`

- [ ] **Step 3: Implement status count helper**

Create `src/helpers/academic-hub/status-counts.ts`:

```typescript
import {
  HUB_STATUS_VALUES,
  HubStatusAggregate,
  HubStatusFilter,
} from "@/types/academic-hub";

export const STATUS_LABEL: Record<HubStatusFilter, string> = {
  active: "Active",
  planned: "Planned",
  ended: "Ended",
};

export function countForStatus(
  status: HubStatusFilter,
  counts?: HubStatusAggregate,
): number | undefined {
  if (!counts) return undefined;
  if (status === "active") return counts.active + counts.paused;
  if (status === "planned") return counts.planned;
  return counts.ended;
}

export function toggleStatusSelection(
  selected: HubStatusFilter[],
  status: HubStatusFilter,
): HubStatusFilter[] {
  const isOn = selected.includes(status);
  const next = isOn
    ? selected.filter((s) => s !== status)
    : [...selected, status];
  return next.length === 0 ? ["active"] : next;
}

export { HUB_STATUS_VALUES };
```

- [ ] **Step 4: Write failing secondary toolbar visibility test**

Create `src/helpers/academic-hub/secondary-toolbar-visible.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { HUB_PROGRAM_ALL } from "@/types/academic-hub";
import { shouldShowSecondaryToolbar } from "./secondary-toolbar-visible";

describe("shouldShowSecondaryToolbar", () => {
  it("returns false when program is all", () => {
    expect(
      shouldShowSecondaryToolbar({ program: HUB_PROGRAM_ALL, isOnlyTeacher: false }),
    ).toBe(false);
  });

  it("returns false for teacher-only users", () => {
    expect(
      shouldShowSecondaryToolbar({ program: "1", isOnlyTeacher: true }),
    ).toBe(false);
  });

  it("returns true for a specific program when advanced filters apply", () => {
    expect(
      shouldShowSecondaryToolbar({ program: "1", isOnlyTeacher: false }),
    ).toBe(true);
  });
});
```

- [ ] **Step 5: Implement visibility helper**

Matches existing `filter-bar.tsx` rule `showAdvancedFilters = !isOnlyTeacher` plus `program !== all`:

Create `src/helpers/academic-hub/secondary-toolbar-visible.ts`:

```typescript
import { HUB_PROGRAM_ALL } from "@/types/academic-hub";

export function shouldShowSecondaryToolbar(args: {
  program: string;
  isOnlyTeacher: boolean;
}): boolean {
  return args.program !== HUB_PROGRAM_ALL && !args.isOnlyTeacher;
}
```

- [ ] **Step 6: Run all helper tests**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/helpers/academic-hub/status-counts.test.ts src/helpers/academic-hub/secondary-toolbar-visible.test.ts`
Expected: PASS

- [ ] **Step 7: Checkpoint**

```bash
git add src/helpers/academic-hub/status-counts.ts src/helpers/academic-hub/status-counts.test.ts \
  src/helpers/academic-hub/secondary-toolbar-visible.ts src/helpers/academic-hub/secondary-toolbar-visible.test.ts
```

---

### Task 5: `AcademicHubToolbar` (primary row)

**Files:**
- Create: `src/components/academic-hub/academic-hub-toolbar.tsx`

- [ ] **Step 1: Create primary toolbar component**

Create `src/components/academic-hub/academic-hub-toolbar.tsx`:

```tsx
"use client";

import { useDebouncedCallback } from "use-debounce";
import { Search } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import { Switch } from "@/components/primitives/switch";
import {
  ToolbarSegment,
  ToolbarSegmentGroup,
  ToolbarSegmentToggle,
} from "@/components/shell/toolbar-segment-group";
import { useHubFilters } from "@/hooks/academic-hub/use-hub-filters";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { HUB_PROGRAM_ALL, HubStatusAggregate } from "@/types/academic-hub";
import type { HubProgram } from "@/hooks/academic-hub/use-programs";
import {
  countForStatus,
  HUB_STATUS_VALUES,
  STATUS_LABEL,
  toggleStatusSelection,
} from "@/helpers/academic-hub/status-counts";
import { useEffect, useState } from "react";

interface Props {
  programs: HubProgram[];
  statusCounts?: HubStatusAggregate;
  isStatusCountsLoading?: boolean;
  onSetMy: (value: boolean) => void;
}

export function AcademicHubToolbar({
  programs,
  statusCounts,
  isStatusCountsLoading = false,
  onSetMy,
}: Props) {
  const filters = useHubFilters();
  const { state } = filters;
  const { isTeacher } = useUser();
  const { tenant } = useTenant();
  const programCount = tenant?.program_count ?? programs.length;
  const showProgramTabs = programCount > 1;

  const setQDebounced = useDebouncedCallback(filters.setQ, 200);
  const [draftQ, setDraftQ] = useState(state.q);
  useEffect(() => setDraftQ(state.q), [state.q]);

  const programItems = [
    { id: HUB_PROGRAM_ALL, label: "All" },
    ...programs.map((p) => ({ id: String(p.id), label: p.name })),
  ];

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      {showProgramTabs ? (
        <ToolbarSegmentGroup role="tablist" aria-label="Program">
          {programItems.map((item) => (
            <ToolbarSegment
              key={item.id}
              role="tab"
              aria-selected={state.program === item.id}
              active={state.program === item.id}
              onClick={() => filters.setProgram(item.id)}
            >
              {item.label}
            </ToolbarSegment>
          ))}
        </ToolbarSegmentGroup>
      ) : (
        <span className="sr-only">Single program tenant</span>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
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
            className="h-8 w-52 pl-8 text-sm sm:w-64"
          />
        </div>

        {isTeacher ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <Switch
              checked={state.my}
              onCheckedChange={onSetMy}
              aria-label="My classes only"
            />
            <span className="hidden whitespace-nowrap sm:inline">My classes only</span>
          </label>
        ) : null}

        <ToolbarSegmentGroup aria-label="Course status">
          {HUB_STATUS_VALUES.map((status) => {
            const count = countForStatus(status, statusCounts);
            const on = state.status.includes(status);
            return (
              <ToolbarSegmentToggle
                key={status}
                active={on}
                count={
                  isStatusCountsLoading
                    ? "…"
                    : count !== undefined
                      ? count
                      : undefined
                }
                onClick={() =>
                  filters.setStatus(toggleStatusSelection(state.status, status))
                }
              >
                {STATUS_LABEL[status]}
              </ToolbarSegmentToggle>
            );
          })}
        </ToolbarSegmentGroup>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -30`

- [ ] **Step 3: Checkpoint**

```bash
git add src/components/academic-hub/academic-hub-toolbar.tsx
```

---

### Task 6: `AcademicHubSecondaryToolbar` (secondary row)

**Files:**
- Create: `src/components/academic-hub/academic-hub-secondary-toolbar.tsx`

- [ ] **Step 1: Create secondary toolbar**

Create `src/components/academic-hub/academic-hub-secondary-toolbar.tsx`. Port logic from `filter-bar.tsx`, `intake-select.tsx`, `subject-chips.tsx`, and `category-pills.tsx`:

- Use `useHubFilters`, `useHubAggregate`, `useHubIntakes`, `useUser`, `useSearchParams`
- Intake: primitives `Select` with `items` built from intakes + `ALL_VALUE`; preserve default intake `useEffect` from `intake-select.tsx`
- Subject/category: `ToolbarSegmentGroup` + `ToolbarSegmentToggle` with multi-select toggle (same toggle pattern as subject-chips)
- Category replaces MultiCombobox with toggle segments per spec (list all categories as toggles with counts)
- Layout: `flex flex-wrap items-center gap-3 overflow-x-auto`
- Each axis prefixed with inline label (`text-sm text-text-secondary`): `Intake`, `Subject`, `Category`

Key intake select snippet (primitives):

```tsx
<Select
  className="h-8 min-w-48 text-sm"
  items={[
    { value: ALL_VALUE, label: "All intakes" },
    ...(intakes ?? []).map((i) => ({ value: String(i.id), label: i.name })),
  ]}
  value={state.intake ?? ALL_VALUE}
  onValueChange={(v) => filters.setIntake(v === ALL_VALUE ? null : v)}
/>
```

Export a named component; parent decides whether to mount via `shouldShowSecondaryToolbar`.

- [ ] **Step 2: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -30`

- [ ] **Step 3: Checkpoint**

```bash
git add src/components/academic-hub/academic-hub-secondary-toolbar.tsx
```

---

### Task 7: Wire `AcademicHubPage` + clean up legacy files

**Files:**
- Modify: `src/components/academic-hub/academic-hub-page.tsx`
- Modify: `src/app/(internal)/courses/page.tsx`
- Delete: legacy header/filter-bar files (see file map)

- [ ] **Step 1: Update `courses/page.tsx`**

```tsx
"use client";

import { AcademicHubPage } from "@/components/academic-hub/academic-hub-page";

export default function CoursesRoute() {
  return <AcademicHubPage />;
}
```

- [ ] **Step 2: Rewrite `academic-hub-page.tsx` header registration**

Add imports:

```tsx
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/primitives/button";
import { usePageHeader } from "@/components/shell/use-page-header";
import { AcademicHubToolbar } from "./academic-hub-toolbar";
import { AcademicHubSecondaryToolbar } from "./academic-hub-secondary-toolbar";
import { shouldShowSecondaryToolbar } from "@/helpers/academic-hub/secondary-toolbar-visible";
```

Inside `AcademicHubPageInner`, after `can` / `tenant` / `programs` are available:

```tsx
const hasCreatePermission = can("course.create");
const canCreate =
  hasCreatePermission &&
  (!isOnlyTeacher || Boolean(tenant?.can_teacher_create_course));
const showSingleProgramName =
  (tenant?.program_count ?? programs.length) === 1 && programs[0]?.name;

const showSecondary = shouldShowSecondaryToolbar({
  program: state.program,
  isOnlyTeacher,
});

const headerConfig = useMemo(
  () => ({
    breadcrumb: (
      <div className="min-w-0">
        <h1 className="truncate font-serif text-lg text-text-primary">Academic Hub</h1>
        {showSingleProgramName ? (
          <p className="truncate text-xs text-text-muted">{programs[0].name}</p>
        ) : null}
      </div>
    ),
    actions: canCreate ? (
      <Link href="/courses/create">
        <Button size="sm">Add classes</Button>
      </Link>
    ) : undefined,
    toolbar: (
      <AcademicHubToolbar
        programs={programs}
        statusCounts={statusCounts}
        isStatusCountsLoading={list.isLoading && !statusCounts}
        onSetMy={handleSetMy}
      />
    ),
    toolbarSecondary: showSecondary ? (
      <AcademicHubSecondaryToolbar programs={programs} />
    ) : undefined,
  }),
  [
    canCreate,
    showSingleProgramName,
    programs,
    statusCounts,
    list.isLoading,
    handleSetMy,
    showSecondary,
  ],
);
usePageHeader(headerConfig);
```

Remove `<AcademicHubHeader />` and `<AcademicHubFilterBar />`.

Change outer wrapper from `space-y-4 mt-3` to:

```tsx
<div className="space-y-4 px-4 pb-20 pt-4 sm:px-6 lg:px-8">
```

Update Suspense fallback skeleton to match (drop header skeleton rows; keep filter-ish skeleton optional or simplify to grid skeleton only — mirror `UserHubPage` fallback).

- [ ] **Step 3: Delete legacy files**

```bash
rm src/components/academic-hub/academic-hub-header.tsx
rm src/components/academic-hub/filter-bar/filter-bar.tsx
rm src/components/academic-hub/filter-bar/status-chips.tsx
rm src/components/academic-hub/filter-bar/program-chips.tsx
rm src/components/academic-hub/filter-bar/my-only-toggle.tsx
rm src/components/academic-hub/filter-bar/subject-chips.tsx
rm src/components/academic-hub/filter-bar/category-pills.tsx
rm src/components/academic-hub/filter-bar/intake-select.tsx
```

- [ ] **Step 4: Fix any broken imports**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -40`
Expected: no errors

- [ ] **Step 5: Run filter param tests**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/helpers/academic-hub/filter-params.test.ts`
Expected: PASS (unchanged behavior)

- [ ] **Step 6: Run full unit suite (spot check)**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit`
Expected: all tests pass

- [ ] **Step 7: Checkpoint**

```bash
git add -A src/components/academic-hub src/app/\(internal\)/courses/page.tsx src/helpers/academic-hub
git status
```

---

### Task 8: Manual acceptance

- [ ] **Step 1: Start dev server**

Run: `cd schedjuice-reimagined-fe && pnpm dev`

- [ ] **Step 2: Verify `/courses`**

Checklist from spec §12:

1. Title + "Add classes" in panel header row 1 beside notifications
2. Segmented program tabs (multi-program tenant) or subtitle only (single-program)
3. Search, my-classes toggle, status segments in row 2
4. Secondary row appears when a specific program is selected (non-teacher-only)
5. Intake select / subject toggles / category toggles work; URL updates
6. Course grid unchanged

- [ ] **Step 3: Verify `/users` regression**

Staff/Students tabs and grid/list switcher look identical to before Task 3.

- [ ] **Step 4: Final checkpoint**

```bash
git status
git diff --stat
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `toolbarSecondary` on `PageHeaderConfig` | Task 1 |
| Third sticky row in `PanelHeader` | Task 1 |
| `ToolbarSegmentGroup` primitive | Task 2 |
| User Hub refactor (no visual change) | Task 3 |
| Row 1 breadcrumb + "Add classes" | Task 7 |
| Row 2 program/status/search/my-classes | Task 5 |
| Row 3 intake/subject/category | Task 6 |
| Drop `PageContainer` | Task 7 |
| Primitives-only toolbar | Tasks 5–6 |
| Delete legacy header/filter bar | Task 7 |
| Filter behavior preserved | Task 7 Step 5 + Task 8 |
| Course-page contract documented | Spec §4 (no code beyond Task 1) |

---

## Manual test matrix (Task 8)

| Scenario | Expected |
| --- | --- |
| Admin, multi-program, select ACCA | Program tab active; secondary row if ACCA is intake/subject/category configured |
| Single-program tenant | No program tabs; program name under title |
| Teacher with my-classes | Toggle visible; preference persists on reload |
| Non-teacher | No my-classes toggle; no secondary row if `isOnlyTeacher` path |
| No create permission | No "Add classes" button |
| Status deselect all | Falls back to `active` only |
| Search active | Existing empty states still work |
