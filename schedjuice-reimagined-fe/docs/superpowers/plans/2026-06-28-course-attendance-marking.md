# Course Attendance Marking Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin `/courses/[id]/attendance/marking/[eventIndex]` to match DESIGN.md via full primitive migration — custom `TeachingDayCalendar`, hand-composed marking table, flat sticky toolbar — in one big-bang cutover.

**Architecture:** Pure-frontend change. Rewrite attendance marking subcomponents on Schedjuice primitives and Iconoir; extract a small month-grid helper for `TeachingDayCalendar`; compose new header/toolbar/table components in a slim page shell. Autosave, mark-all undo, and API contracts unchanged.

**Tech Stack:** Next.js App Router, React Query, Vitest, `@/components/primitives/*`, Iconoir, Motion (`motion/react`).

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-28-course-attendance-marking-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/helpers/teaching-day-calendar-utils.ts` | Month matrix builder, date-in-bounds check |
| `src/helpers/teaching-day-calendar-utils.test.ts` | Unit tests for grid helpers |
| `src/components/attendance/attendance-status-config.ts` | Iconoir icons + semantic token classes |
| `src/components/attendance/attendance-status-control.tsx` | Primitive Button segmented status picker |
| `src/components/attendance/attendance-note-field.tsx` | Primitive Input for row notes |
| `src/components/attendance/attendance-row-save-indicator.tsx` | Token reskin for row save dot |
| `src/components/attendance/attendance-autosave-status.tsx` | Token reskin + primitive Retry |
| `src/components/attendance/attendance-action-cell.tsx` | Mobile name block + status + note |
| `src/components/attendance/attendance-marking-table-states.tsx` | Loading/error/empty on primitives |
| `src/components/attendance/attendance-marking-toolbar.tsx` | Flat sticky mark-all / undo / count / autosave |
| `src/components/attendance/attendance-marking-header.tsx` | Back link, title, day nav, daily note |
| `src/components/attendance/teaching-day-calendar.tsx` | Popover month grid + session select |
| `src/components/attendance/attendance-marking-table.tsx` | Desktop table + mobile stacked rows |
| `src/components/primitives/empty/empty-copy-presets.ts` | Add `noStudentsToMark` preset |
| `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` | Slim shell composing new components |
| `src/components/attendance/attendance-day-calendar.tsx` | Delete after cutover (only used by marking page) |

---

### Task 1: Teaching day calendar grid helpers (TDD)

**Files:**
- Create: `src/helpers/teaching-day-calendar-utils.ts`
- Create: `src/helpers/teaching-day-calendar-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/helpers/teaching-day-calendar-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildMonthMatrix,
  isDateWithinInclusive,
} from "@/helpers/teaching-day-calendar-utils";

describe("buildMonthMatrix", () => {
  it("returns weeks covering April 2026", () => {
    const matrix = buildMonthMatrix(2026, 3); // 0-based month
    expect(matrix.length).toBeGreaterThanOrEqual(4);
    const flat = matrix.flat().filter(Boolean) as Date[];
    expect(flat.some((d) => d.getDate() === 1 && d.getMonth() === 3)).toBe(true);
    expect(flat.some((d) => d.getDate() === 30 && d.getMonth() === 3)).toBe(true);
  });

  it("pads leading nulls before first of month", () => {
    const matrix = buildMonthMatrix(2026, 3);
    expect(matrix[0]![0]).toBeNull(); // Apr 1 2026 is Wednesday → Sun/Tue null
  });
});

describe("isDateWithinInclusive", () => {
  it("returns true inside range", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 11, 31);
    expect(isDateWithinInclusive(new Date(2026, 5, 15), from, to)).toBe(true);
  });

  it("returns false outside range", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 11, 31);
    expect(isDateWithinInclusive(new Date(2027, 0, 1), from, to)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/helpers/teaching-day-calendar-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/helpers/teaching-day-calendar-utils.ts`:

```ts
/** Build a 6×7 month grid (Sun–Sat). Null = outside month. */
export function buildMonthMatrix(year: number, monthIndex: number): (Date | null)[][] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, monthIndex, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function isDateWithinInclusive(date: Date, from: Date, to: Date): boolean {
  const t = date.getTime();
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime();
  return t >= start && t <= end;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/helpers/teaching-day-calendar-utils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/teaching-day-calendar-utils.ts src/helpers/teaching-day-calendar-utils.test.ts
git commit -m "Add teaching day calendar grid helpers."
```

---

### Task 2: Reskin attendance status config (Iconoir + tokens)

**Files:**
- Modify: `src/components/attendance/attendance-status-config.ts`

- [ ] **Step 1: Replace Lucide with Iconoir and semantic tokens**

Replace entire file:

```ts
import { attendanceStatus } from "@/types/attendance";
import { Check, Clock, Minus, Xmark } from "iconoir-react";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { width?: number; height?: number }>;

export type AttendanceStatusOption = {
  value: attendanceStatus;
  label: string;
  shortLabel: string;
  Icon: IconComponent;
  selectedClass: string;
  idleClass: string;
};

export const ATTENDANCE_STATUS_OPTIONS: AttendanceStatusOption[] = [
  {
    value: attendanceStatus.present,
    label: "Present",
    shortLabel: "P",
    Icon: Check,
    selectedClass: "border-success bg-success/10 text-success",
    idleClass: "border-border-subtle hover:border-success/50 hover:bg-success/5",
  },
  {
    value: attendanceStatus.late,
    label: "Late",
    shortLabel: "L",
    Icon: Clock,
    selectedClass: "border-warning bg-warning/10 text-warning",
    idleClass: "border-border-subtle hover:border-warning/50 hover:bg-warning/5",
  },
  {
    value: attendanceStatus.absent,
    label: "Absent",
    shortLabel: "A",
    Icon: Xmark,
    selectedClass: "border-danger bg-danger/10 text-danger",
    idleClass: "border-border-subtle hover:border-danger/50 hover:bg-danger/5",
  },
  {
    value: attendanceStatus.unregistered,
    label: "Unregistered",
    shortLabel: "N/A",
    Icon: Minus,
    selectedClass: "border-border-strong bg-surface-muted text-text-muted",
    idleClass: "border-border-subtle hover:bg-surface-hover",
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/attendance-status-config.ts
git commit -m "Reskin attendance status config with Iconoir and semantic tokens."
```

---

### Task 3: Rewrite AttendanceStatusControl on primitive Button

**Files:**
- Modify: `src/components/attendance/attendance-status-control.tsx`

- [ ] **Step 1: Replace ToggleGroup with Button segmented control**

Replace entire file:

```tsx
"use client";

import { Button } from "@/components/primitives/button";
import { Tooltip } from "@/components/primitives/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { attendanceStatus } from "@/types/attendance";
import { ATTENDANCE_STATUS_OPTIONS } from "./attendance-status-config";

type AttendanceStatusControlProps = {
  value: attendanceStatus;
  onChange: (status: attendanceStatus) => void;
  disabled?: boolean;
  isMobile?: boolean;
  "aria-label"?: string;
};

export function AttendanceStatusControl({
  value,
  onChange,
  disabled = false,
  isMobile: isMobileProp,
  "aria-label": ariaLabel = "Attendance status",
}: AttendanceStatusControlProps) {
  const isMobileFallback = useIsMobile();
  const isMobile = isMobileProp ?? isMobileFallback;

  const group = (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap justify-start",
        isMobile ? "grid w-full grid-cols-2 gap-2" : "gap-1",
      )}
    >
      {ATTENDANCE_STATUS_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        const btn = (
          <Button
            key={option.value}
            type="button"
            variant="secondary"
            size={isMobile ? "md" : "sm"}
            disabled={disabled}
            aria-pressed={isSelected}
            aria-label={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "border transition-all duration-200 active:scale-[0.98]",
              isMobile
                ? "h-11 min-h-11 w-full justify-start gap-2 px-3"
                : "size-9 shrink-0 p-0",
              isSelected ? option.selectedClass : option.idleClass,
            )}
          >
            <option.Icon width={16} height={16} aria-hidden />
            {isMobile ? (
              <span className="font-medium">{option.label}</span>
            ) : (
              <span className="sr-only">{option.label}</span>
            )}
          </Button>
        );

        if (isMobile) return btn;

        return (
          <Tooltip.Root key={option.value}>
            <Tooltip.Trigger render={<span className="inline-flex">{btn}</span>} />
            <Tooltip.Portal>
              <Tooltip.Positioner>
                <Tooltip.Popup>{option.label}</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </div>
  );

  return isMobile ? group : <Tooltip.Provider delay={300}>{group}</Tooltip.Provider>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/attendance-status-control.tsx
git commit -m "Rewrite attendance status control on primitive Button group."
```

---

### Task 4: Reskin note field, row indicator, and autosave bar

**Files:**
- Modify: `src/components/attendance/attendance-note-field.tsx`
- Modify: `src/components/attendance/attendance-row-save-indicator.tsx`
- Modify: `src/components/attendance/attendance-autosave-status.tsx`

- [ ] **Step 1: Rewrite attendance-note-field.tsx**

```tsx
"use client";

import { Input } from "@/components/primitives/input";
import { cn } from "@/lib/utils";
import { attendanceStatus } from "@/types/attendance";

type AttendanceNoteFieldProps = {
  id: string;
  value: string;
  status: attendanceStatus;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function AttendanceNoteField({
  id,
  value,
  status,
  onChange,
  disabled = false,
}: AttendanceNoteFieldProps) {
  const isUnregistered = status === attendanceStatus.unregistered;
  const isDisabled = disabled || isUnregistered;
  const hintText =
    "Notes are available after marking a status other than unregistered.";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Input
        id={id}
        disabled={isDisabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isUnregistered ? "Select a status first" : "Add a note"}
        {...(isUnregistered ? { "aria-describedby": `${id}-hint` } : {})}
        title={isUnregistered ? hintText : undefined}
        className={cn("min-w-0", isUnregistered && "cursor-not-allowed opacity-50")}
      />
      {isUnregistered ? (
        <p id={`${id}-hint`} className="text-xs leading-snug text-text-muted">
          {hintText}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Reskin attendance-row-save-indicator.tsx tokens**

Replace color classes:

```tsx
        state === "pending" && "animate-pulse bg-warning motion-reduce:animate-none",
        state === "saving" && "animate-pulse bg-success motion-reduce:animate-none",
        state === "saved" && "bg-success",
        state === "error" && "bg-danger",
```

- [ ] **Step 3: Rewrite attendance-autosave-status.tsx**

Replace `@/components/ui/button` with `@/components/primitives/button` and hardcoded colors:

```tsx
"use client";

import { Button } from "@/components/primitives/button";
import { useEffect, useState } from "react";
import type { AttendanceAutosaveStatus } from "./use-attendance-autosave";

type AttendanceAutosaveStatusProps = {
  status: AttendanceAutosaveStatus;
  lastSavedAt: number | null;
  onRetry: () => void;
};

function savedSuffix(lastSavedAt: number | null, nowTick: number): string {
  if (lastSavedAt == null) return "";
  const elapsed = Math.max(0, nowTick - lastSavedAt);
  if (elapsed < 4000) return " · Just now";
  if (elapsed >= 60_000) return "";
  return ` · ${Math.floor(elapsed / 1000)}s ago`;
}

export function AttendanceAutosaveStatusBar({
  status,
  lastSavedAt,
  onRetry,
}: AttendanceAutosaveStatusProps) {
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "saved") return;
    const interval = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    setClock(Date.now());
  }, [lastSavedAt, status]);

  const relativeSuffix =
    status === "saved" ? savedSuffix(lastSavedAt, clock) : "";
  const showRelative =
    relativeSuffix !== "" && status === "saved" && lastSavedAt != null;

  if (status === "idle") {
    return <div className="flex min-h-[1.25rem] items-center gap-2 text-xs" />;
  }

  if (status === "saving") {
    return (
      <div className="flex min-h-[1.25rem] items-center gap-2 text-xs text-text-muted" aria-busy>
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-success motion-reduce:animate-none" aria-hidden />
        <span>Saving</span>
      </div>
    );
  }

  if (status === "saved") {
    return (
      <div className="flex min-h-[1.25rem] items-center gap-2 text-xs text-text-muted">
        <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
        <span>Saved</span>
        {showRelative ? (
          <span className="text-text-muted/70">{relativeSuffix}</span>
        ) : null}
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div className="flex min-h-[1.25rem] items-center gap-2 text-xs text-warning" role="status" aria-live="polite">
        <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
        <span>Offline — changes queued on this device</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-[1.25rem] items-center gap-2 text-xs text-danger" role="alert">
      <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
      <span>Could not save</span>
      <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/attendance/attendance-note-field.tsx \
  src/components/attendance/attendance-row-save-indicator.tsx \
  src/components/attendance/attendance-autosave-status.tsx
git commit -m "Reskin attendance note field, row indicator, and autosave bar."
```

---

### Task 5: Rewrite AttendanceActionCell

**Files:**
- Modify: `src/components/attendance/attendance-action-cell.tsx`

- [ ] **Step 1: Update tokens in action cell**

Replace `text-muted-foreground` → `text-text-muted`, `text-destructive` → `text-danger`, `bg-muted/40` → `bg-brand/5`:

```tsx
        recentlyChanged && "rounded-md bg-brand/5",
...
              isDroppedOut ? "text-danger" : "text-text-muted",
...
            alternateName ? "text-text-muted" : "invisible",
```

(No other structural changes — file stays as compositor.)

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/attendance-action-cell.tsx
git commit -m "Reskin attendance action cell tokens."
```

---

### Task 6: Empty preset + marking table states

**Files:**
- Modify: `src/components/primitives/empty/empty-copy-presets.ts`
- Modify: `src/components/attendance/attendance-marking-table-states.tsx`

- [ ] **Step 1: Add preset to empty-copy-presets.ts**

After `noSessions` block, add:

```ts
  noStudentsToMark: {
    enBefore: "No students to ",
    enHighlight: "mark",
    enAfter: "",
    myBefore: "မှတ်ရန် ကျောင်းသား ",
    myHighlight: "မရှိ",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,
```

- [ ] **Step 2: Rewrite attendance-marking-table-states.tsx**

Replace shadcn Button/Lucide with primitives:

```tsx
"use client";

import { Button } from "@/components/primitives/button";
import { EmptyCopy } from "@/components/primitives/empty/empty-copy";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
import { Loader } from "@/components/form/loader";

type AttendanceMarkingTableStatesProps = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  onRetry?: () => void;
  children: React.ReactNode;
};

export function AttendanceMarkingTableStates({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  children,
}: AttendanceMarkingTableStatesProps) {
  if (isError) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 border-b border-border-subtle py-12 text-center" role="alert">
        <p className="text-sm font-medium text-text-primary">Could not load attendance</p>
        <p className="max-w-md text-sm text-text-muted">
          Check your connection and try again. Any changes already saved on this device remain on the server.
        </p>
        {onRetry ? (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="divide-y divide-border-subtle">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-1 py-4">
            <div className="h-4 w-32 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
            <div className="h-9 w-40 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
            <div className="h-9 flex-1 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
          </div>
        ))}
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
          <Loader />
          <span>Loading attendance roster…</span>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="py-12 text-center">
        <EmptyCopy preset={EMPTY_COPY_PRESETS.noStudentsToMark} />
        <p className="mt-3 max-w-md mx-auto text-sm text-text-muted">
          This class session has no enrolled students yet. Add students to the course to start marking attendance.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/primitives/empty/empty-copy-presets.ts \
  src/components/attendance/attendance-marking-table-states.tsx
git commit -m "Add noStudentsToMark preset and reskin marking table states."
```

---

### Task 7: AttendanceMarkingToolbar

**Files:**
- Create: `src/components/attendance/attendance-marking-toolbar.tsx`

- [ ] **Step 1: Create flat sticky toolbar component**

```tsx
"use client";

import { Button } from "@/components/primitives/button";
import { AttendanceAutosaveStatusBar } from "@/components/attendance/attendance-autosave-status";
import type { AttendanceAutosaveStatus } from "@/components/attendance/use-attendance-autosave";
import { cn } from "@/lib/utils";

type AttendanceMarkingToolbarProps = {
  presentCount: number;
  totalCount: number;
  presentPercent: number;
  autosaveStatus: AttendanceAutosaveStatus;
  lastSavedAt: number | null;
  onRetryAutosave: () => void;
  onMarkAllPresent: () => void;
  onUndoMarkAll: () => void;
  markAllDisabled: boolean;
  undoVisible: boolean;
  className?: string;
};

export function AttendanceMarkingToolbar({
  presentCount,
  totalCount,
  presentPercent,
  autosaveStatus,
  lastSavedAt,
  onRetryAutosave,
  onMarkAllPresent,
  onUndoMarkAll,
  markAllDisabled,
  undoVisible,
  className,
}: AttendanceMarkingToolbarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 border-b border-border-subtle bg-surface-elevated py-3",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full border-success sm:w-auto"
            onClick={onMarkAllPresent}
            disabled={markAllDisabled}
          >
            Mark all as present
          </Button>
          {undoVisible ? (
            <span
              role="button"
              tabIndex={0}
              onClick={onUndoMarkAll}
              onKeyDown={(e) => {
                if (e.key === "Enter") onUndoMarkAll();
              }}
              className="cursor-pointer text-sm text-accent underline-offset-2 hover:underline"
            >
              Undo
            </span>
          ) : null}
          <p className="font-mono text-sm font-medium tabular-nums sm:hidden">
            Present ({presentCount}/{totalCount}) {presentPercent}%
          </p>
        </div>

        <p className="hidden text-center text-sm font-medium font-mono tabular-nums sm:block">
          Present ({presentCount}/{totalCount}) {presentPercent}%
        </p>

        <div className="flex justify-end sm:min-w-[10rem]">
          <AttendanceAutosaveStatusBar
            status={autosaveStatus}
            lastSavedAt={lastSavedAt}
            onRetry={onRetryAutosave}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/attendance-marking-toolbar.tsx
git commit -m "Add flat sticky attendance marking toolbar."
```

---

### Task 8: AttendanceMarkingHeader

**Files:**
- Create: `src/components/attendance/attendance-marking-header.tsx`

- [ ] **Step 1: Create header with back link, day nav, daily note**

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/primitives/button";
import { TeachingDayCalendar } from "@/components/attendance/teaching-day-calendar";
import { formatDate } from "@/helpers/date";
import { formatSessionLabel } from "@/helpers/attendance-marking";
import type { courseType, eventType } from "@/types/course";
import { NavArrowLeft, NavArrowRight, Notes } from "iconoir-react";

type AttendanceMarkingHeaderProps = {
  courseId: string;
  course: courseType | null;
  events: eventType[];
  eventIndex: number;
  pathname: string;
  currentEvent: eventType | undefined;
  pageDateLabel: string | null;
  isViewingToday: boolean;
  todayLabel: string;
  prevTeachingDayIndex: number | null;
  nextTeachingDayIndex: number | null;
  onGoToToday: () => void;
  onChangeEventIndex: (index: number) => void;
};

export function AttendanceMarkingHeader({
  courseId,
  course,
  events,
  eventIndex,
  pathname,
  currentEvent,
  pageDateLabel,
  isViewingToday,
  todayLabel,
  prevTeachingDayIndex,
  nextTeachingDayIndex,
  onGoToToday,
  onChangeEventIndex,
}: AttendanceMarkingHeaderProps) {
  const sessionMeta = currentEvent
    ? [formatSessionLabel(currentEvent), course?.title].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/courses/${courseId}/attendance`}
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary"
          >
            <NavArrowLeft width={16} height={16} aria-hidden />
            Back to attendance dashboard
          </Link>
          <h1 className="font-serif text-2xl text-text-primary">Mark attendance</h1>
          {pageDateLabel ? (
            <p className="text-sm text-text-secondary">{pageDateLabel}</p>
          ) : null}
          {sessionMeta ? (
            <p className="text-sm text-text-muted">{sessionMeta}</p>
          ) : null}
        </div>

        {currentEvent?.id ? (
          <Link
            href={`/courses/${courseId}/daily-notes/${currentEvent.id}?ref=${encodeURIComponent(pathname)}`}
          >
            <Button variant="secondary" size="sm" className="gap-2">
              <Notes width={16} height={16} aria-hidden />
              Daily note
            </Button>
          </Link>
        ) : null}
      </div>

      {!isViewingToday && events.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onGoToToday}
            className="inline-flex items-center gap-1 text-sm text-accent underline-offset-2 hover:underline"
          >
            Go to today ({todayLabel})
            <NavArrowRight width={14} height={14} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={prevTeachingDayIndex == null}
          onClick={() => {
            if (prevTeachingDayIndex != null) onChangeEventIndex(prevTeachingDayIndex);
          }}
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
          Previous day
        </Button>

        <TeachingDayCalendar
          events={events}
          selectedEventIndex={eventIndex}
          onSelectEventIndex={onChangeEventIndex}
          courseStartDate={course?.start_date}
          courseEndDate={course?.end_date}
          disabled={events.length === 0}
        />

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={nextTeachingDayIndex == null}
          onClick={() => {
            if (nextTeachingDayIndex != null) onChangeEventIndex(nextTeachingDayIndex);
          }}
        >
          Next day
          <NavArrowRight width={16} height={16} aria-hidden />
        </Button>
      </div>

      <div className="border-b border-border-subtle" />
    </div>
  );
}
```

Note: `TeachingDayCalendar` is created in Task 9 — implement Task 9 before wiring the page, or use a temporary stub import during development.

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/attendance-marking-header.tsx
git commit -m "Add attendance marking header component."
```

---

### Task 9: TeachingDayCalendar

**Files:**
- Create: `src/components/attendance/teaching-day-calendar.tsx`

- [ ] **Step 1: Create calendar with primitive Popover + custom grid**

Create `src/components/attendance/teaching-day-calendar.tsx` — port logic from `attendance-day-calendar.tsx` but replace shadcn Calendar/Popover/Select/Button with primitives. Key structure:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/primitives/button";
import { Popover } from "@/components/primitives/popover";
import { Select } from "@/components/primitives/select";
import {
  buildMonthMatrix,
  isDateWithinInclusive,
} from "@/helpers/teaching-day-calendar-utils";
import { formatDate } from "@/helpers/date";
import {
  dateOnly,
  formatSessionLabel,
  getEventIndicesForDate,
  getTodayYmd,
  isTeachingDay,
  ymdToLocalDate,
} from "@/helpers/attendance-marking";
import type { eventType } from "@/types/course";
import { Calendar, NavArrowLeft, NavArrowRight } from "iconoir-react";
import { cn } from "@/lib/utils";

// ... same props as AttendanceDayCalendar

export function TeachingDayCalendar({ events, selectedEventIndex, onSelectEventIndex, courseStartDate, courseEndDate, disabled }: TeachingDayCalendarProps) {
  const [open, setOpen] = useState(false);
  const [pendingDateKey, setPendingDateKey] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = events[selectedEventIndex]?.date;
    return d ? ymdToLocalDate(dateOnly(d)) : new Date();
  });

  const todayYmd = getTodayYmd();
  const selectedEvent = events[selectedEventIndex];
  const selectedDateKey = dateOnly(selectedEvent?.date);

  const bounds = useMemo(() => {
    const first = events[0]?.date;
    const last = events[events.length - 1]?.date;
    return {
      from: new Date(courseStartDate ?? first ?? new Date()),
      to: new Date(courseEndDate ?? last ?? new Date()),
    };
  }, [courseStartDate, courseEndDate, events]);

  const matrix = buildMonthMatrix(visibleMonth.getFullYear(), visibleMonth.getMonth());
  const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const handlePickDate = (date: Date) => {
    if (!isTeachingDay(events, date)) return;
    const key = dateOnly(date);
    const indices = getEventIndicesForDate(events, key);
    if (indices.length === 0) return;
    if (indices.length === 1) {
      setPendingDateKey(null);
      setOpen(false);
      onSelectEventIndex(indices[0]!);
      return;
    }
    setPendingDateKey(key);
  };

  const pendingIndices = pendingDateKey
    ? getEventIndicesForDate(events, pendingDateKey)
    : [];

  const dayLabel = selectedEvent?.date
    ? formatDate(selectedEvent.date, "EEEE, d MMMM yyyy")
    : "Select a teaching day";
  const sessionLabel = selectedEvent ? formatSessionLabel(selectedEvent) : null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || events.length === 0}
            className="h-auto min-w-[220px] max-w-[min(100vw-2rem,320px)] flex-col items-start gap-0.5 px-4 py-3 text-left"
          />
        }
      >
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
          <Calendar width={14} height={14} aria-hidden />
          Marking attendance for
        </span>
        <span className="text-base font-semibold leading-tight text-text-primary">{dayLabel}</span>
        {sessionLabel ? (
          <span className="text-xs text-text-muted">{sessionLabel}</span>
        ) : null}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner align="center">
          <Popover.Popup className="w-auto p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Previous month"
                onClick={() =>
                  setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
              >
                <NavArrowLeft width={16} height={16} />
              </Button>
              <span className="text-sm font-medium">
                {formatDate(visibleMonth, "MMMM yyyy")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Next month"
                onClick={() =>
                  setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
              >
                <NavArrowRight width={16} height={16} />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-0 p-2 text-center text-xs text-text-muted">
              {weekDays.map((d) => (
                <div key={d} className="py-1 font-medium uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0 px-2 pb-2">
              {matrix.flat().map((date, i) => {
                if (!date) return <div key={`empty-${i}`} className="h-9" />;
                const key = dateOnly(date);
                const teaching = isTeachingDay(events, date);
                const inBounds = isDateWithinInclusive(date, bounds.from, bounds.to);
                const isSelected = key === selectedDateKey;
                const isToday = key === todayYmd;
                const clickable = teaching && inBounds;

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!clickable}
                    onClick={() => handlePickDate(date)}
                    className={cn(
                      "mx-auto flex h-9 w-9 items-center justify-center rounded-md text-sm",
                      !clickable && "cursor-default text-text-muted/40",
                      clickable && "hover:bg-brand/10",
                      isSelected && "bg-brand/15 ring-1 ring-brand/30",
                      isToday && teaching && !isSelected && "ring-1 ring-brand/20",
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {pendingDateKey && pendingIndices.length > 1 ? (
              <div className="border-t border-border-subtle p-3">
                <p className="mb-2 text-xs font-medium text-text-muted">
                  Multiple sessions on {formatDate(pendingDateKey, "MMM d, yyyy")}. Choose one:
                </p>
                <Select
                  items={pendingIndices.map((index) => ({
                    value: String(index),
                    label: formatSessionLabel(events[index]!),
                  }))}
                  placeholder="Select session"
                  onValueChange={(value) => {
                    const index = Number(value);
                    if (Number.isNaN(index)) return;
                    setPendingDateKey(null);
                    setOpen(false);
                    onSelectEventIndex(index);
                  }}
                />
              </div>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

Adjust `Popover.Trigger` API to match `@/components/primitives/popover` — read that file and wire `render` prop the same way other primitives use Base UI.

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/teaching-day-calendar.tsx
git commit -m "Add TeachingDayCalendar with primitive popover and custom grid."
```

---

### Task 10: AttendanceMarkingTable

**Files:**
- Create: `src/components/attendance/attendance-marking-table.tsx`

- [ ] **Step 1: Create hand-composed desktop table + mobile stacked rows**

```tsx
"use client";

import { AttendanceActionCell } from "@/components/attendance/attendance-action-cell";
import type { RowSaveState } from "@/components/attendance/use-attendance-autosave";
import { cn } from "@/lib/utils";
import type { attendanceType } from "@/types/attendance";

type AttendanceMarkingTableProps = {
  rows: attendanceType[];
  isMobile: boolean;
  rowStates: Record<number, RowSaveState>;
  recentlyChangedIds: number[];
  onStatusChange: (rowId: number, status: attendanceType["attendance_status"]) => void;
  onNoteChange: (rowId: number, note: string) => void;
};

function enrollmentLabel(row: attendanceType & { is_dropped_out?: boolean }) {
  return row.is_dropped_out ? (
    <span className="text-danger text-xs">dropped out</span>
  ) : (
    <span className="text-xs text-text-muted">active student</span>
  );
}

export function AttendanceMarkingTable({
  rows,
  isMobile,
  rowStates,
  recentlyChangedIds,
  onStatusChange,
  onNoteChange,
}: AttendanceMarkingTableProps) {
  if (isMobile) {
    return (
      <div className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              "px-1 py-4",
              recentlyChangedIds.includes(row.id) && "bg-brand/5",
            )}
          >
            <AttendanceActionCell
              rowId={row.id}
              status={row.attendance_status}
              note={row.attendance_note || ""}
              studentName={row.user.name}
              alternateName={row.user.alternative_name ?? null}
              isDroppedOut={Boolean((row as attendanceType & { is_dropped_out?: boolean }).is_dropped_out)}
              rowSaveState={rowStates[row.id] ?? "idle"}
              recentlyChanged={recentlyChangedIds.includes(row.id)}
              isMobile
              onStatusChange={onStatusChange}
              onNoteChange={onNoteChange}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            {["Student", "Alt name", "Phone", "Enrollment", "Status", "Note"].map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "min-h-[52px] border-b border-border-subtle",
                recentlyChangedIds.includes(row.id) && "bg-brand/5",
              )}
            >
              <td className="px-3 py-3 font-medium text-text-primary">{row.user.name}</td>
              <td className="px-3 py-3 text-text-secondary">
                {row.user.alternative_name || "—"}
              </td>
              <td className="px-3 py-3 text-text-secondary">
                {row.user.phone_number || "—"}
              </td>
              <td className="px-3 py-3">
                {enrollmentLabel(row as attendanceType & { is_dropped_out?: boolean })}
              </td>
              <td className="px-3 py-3" colSpan={2}>
                <AttendanceActionCell
                  rowId={row.id}
                  status={row.attendance_status}
                  note={row.attendance_note || ""}
                  studentName={row.user.name}
                  alternateName={row.user.alternative_name ?? null}
                  isDroppedOut={Boolean((row as attendanceType & { is_dropped_out?: boolean }).is_dropped_out)}
                  rowSaveState={rowStates[row.id] ?? "idle"}
                  recentlyChanged={recentlyChangedIds.includes(row.id)}
                  isMobile={false}
                  onStatusChange={onStatusChange}
                  onNoteChange={onNoteChange}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Refine desktop layout so status and note sit in separate `<td>` cells (split colSpan) — final markup should have 6 columns matching headers.

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/attendance-marking-table.tsx
git commit -m "Add hand-composed attendance marking table."
```

---

### Task 11: Rewrite marking page (big-bang cutover)

**Files:**
- Modify: `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx`
- Delete: `src/components/attendance/attendance-day-calendar.tsx`

- [ ] **Step 1: Slim page shell — remove shadcn, column strategy, inline layout**

Rewrite `page.tsx` to:
- Remove imports: `BackButton`, `@/components/ui/*`, `UnManagedDataTable`, `useStrategy`, `ColumnStrategyType`, `ArtifactType`, `Separator`, Lucide, `AttendanceDayCalendar`, inline header/toolbar JSX
- Add imports: `AttendanceMarkingHeader`, `AttendanceMarkingToolbar`, `AttendanceMarkingTable`, `AttendanceMarkingTableStates`
- Keep all data/autosave/mark-all logic unchanged
- Wrap table in `AnimatePresence` + `motion.div` keyed by `eventIndex` using `crossfade` from `@/lib/sj/motion`
- Pass props to new components

Skeleton of return JSX:

```tsx
return (
  <PageContainer width="full" className="space-y-4">
    <AttendanceMarkingHeader
      courseId={id}
      course={course}
      events={events}
      eventIndex={eventIndex}
      pathname={pathname}
      currentEvent={currentEvent}
      pageDateLabel={pageDateLabel}
      isViewingToday={isViewingToday}
      todayLabel={formatDate(new Date())}
      prevTeachingDayIndex={prevTeachingDayIndex}
      nextTeachingDayIndex={nextTeachingDayIndex}
      onGoToToday={handleGoToToday}
      onChangeEventIndex={(index) => void changeCurrentEvent(index)}
    />

    <AttendanceMarkingToolbar
      presentCount={presentCount}
      totalCount={attendances.length}
      presentPercent={presentPercent}
      autosaveStatus={autosaveStatus}
      lastSavedAt={lastSavedAt}
      onRetryAutosave={retryNow}
      onMarkAllPresent={markAllAsPresent}
      onUndoMarkAll={handleMarkAllUndo}
      markAllDisabled={
        isInitialAttendanceLoad ||
        attendances.length === 0 ||
        markAllUndo.isVisible
      }
      undoVisible={markAllUndo.isVisible}
    />

    <AttendanceMarkingTableStates
      isLoading={isInitialAttendanceLoad}
      isError={fetchAttendances.isError}
      isEmpty={!isInitialAttendanceLoad && !fetchAttendances.isError && attendances.length === 0}
      onRetry={() => void fetchAttendances.refetch()}
    >
      <AnimatePresence mode="wait">
        <motion.div key={eventIndex} {...crossfade}>
          <AttendanceMarkingTable
            rows={attendances}
            isMobile={isMobile}
            rowStates={rowStates}
            recentlyChangedIds={recentlyChangedIds}
            onStatusChange={handleStatusChange}
            onNoteChange={handleNoteChange}
          />
        </motion.div>
      </AnimatePresence>
    </AttendanceMarkingTableStates>
  </PageContainer>
);
```

Extract `handleGoToToday` from existing ghost button logic (toast when `todayIndex === -1`).

- [ ] **Step 2: Delete attendance-day-calendar.tsx**

```bash
rm src/components/attendance/attendance-day-calendar.tsx
```

- [ ] **Step 3: Verify zero shadcn/Lucide on marking route**

Run:

```bash
cd schedjuice-reimagined-fe
rg '@/components/ui/|lucide-react' \
  src/app/\(internal\)/courses/\[id\]/attendance/marking/ \
  src/components/attendance/attendance-marking-*.tsx \
  src/components/attendance/teaching-day-calendar.tsx \
  src/components/attendance/attendance-status-control.tsx \
  src/components/attendance/attendance-note-field.tsx \
  src/components/attendance/attendance-autosave-status.tsx \
  src/components/attendance/attendance-action-cell.tsx \
  src/components/attendance/attendance-marking-table-states.tsx
```

Expected: no matches

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-fe && pnpm vitest run src/helpers/teaching-day-calendar-utils.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A src/app/\(internal\)/courses/\[id\]/attendance/marking/ \
  src/components/attendance/
git commit -m "Big-bang cutover: reskin course attendance marking page."
```

---

### Task 12: Manual QA checklist

- [ ] **Step 1: Run through spec manual test plan**

1. `/courses/[id]/attendance/marking/today` → preferred session
2. TeachingDayCalendar: teaching day pick + multi-session select
3. Prev/next + autosave flush on navigation
4. Go to today link; hidden when on today
5. Mark all → undo within 5s
6. Row autosave + flash
7. Note disabled for unregistered
8. Desktop table columns; mobile stacked rows
9. Sticky toolbar on long roster scroll
10. Daily note link with `ref`
11. Dark mode tokens
12. Empty roster shows `EmptyCopy`

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Final commit if fixes needed**

---

## Spec Coverage Self-Review

| Spec section | Task |
|--------------|------|
| Page layout | Task 8, 11 |
| Primitive migration map | Tasks 2–11 |
| TeachingDayCalendar | Tasks 1, 9 |
| Sticky toolbar | Task 7 |
| AttendanceMarkingTable | Task 10 |
| AttendanceStatusControl | Tasks 2, 3 |
| Supporting components | Tasks 4, 5, 6 |
| Motion | Task 11 |
| Data flow preserved | Task 11 (logic unchanged) |
| Big-bang cutover | Task 11 |
| Delete AttendanceDayCalendar | Task 11 |
| Empty preset | Task 6 |

No placeholder steps. All spec requirements mapped.
