# Academic Surfaces Reskin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" step as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Unify course identity rendering via `CourseIdentityBlock`, remove handwriting from User Record Academic surfaces, upgrade record course rows to Hub card v2 hierarchy, and reskin global calendar event boxes with `.sj-root` tokens.

**Architecture:** Extract shared helpers to `src/helpers/course-identity/` and UI to `src/components/course-identity/`. Record rows consume `variant="record"`; Hub card consumes `variant="hub"` (structural refactor, visual parity). Calendar gets `CalendarEventSlot` default renderer; `WeekView` respects `renderEvent`; optional `embedded` shell for `.sj-root` contexts.

**Tech Stack:** Next.js App Router, React 19, Vitest, Tailwind v4 + `.sj-root` semantic tokens, `motion/react`, existing `Calendar` / `WeekView` / `DayBox`.

**Spec:** `docs/superpowers/specs/2026-06-22-academic-surfaces-reskin-design.md`

---

## File Structure

**Create:**
- `src/helpers/course-identity/breadcrumb.ts`
- `src/helpers/course-identity/schedule-pattern.ts`
- `src/helpers/course-identity/status-label.ts`
- `src/helpers/course-identity/subject-chips.ts`
- `src/helpers/course-identity/index.ts`
- `src/helpers/course-identity/breadcrumb.test.ts`
- `src/helpers/course-identity/schedule-pattern.test.ts`
- `src/helpers/course-identity/subject-chips.test.ts`
- `src/components/course-identity/course-identity-types.ts`
- `src/components/course-identity/subject-chips.tsx`
- `src/components/course-identity/course-identity-block.tsx`
- `src/components/calendar/calendar-event-slot.tsx`
- `src/components/calendar/calendar-event-slot.test.tsx`

**Modify:**
- `src/helpers/record-academic/course-identity.ts` — re-export shim
- `src/helpers/record-academic/course-identity.test.ts` — update imports or delete (tests move)
- `src/components/record/academic/record-course-row.tsx`
- `src/components/record/academic/record-course-list.tsx`
- `src/components/record/academic/record-this-week-agenda.tsx`
- `src/components/record/academic/record-academic-schedule.tsx`
- `src/components/calendar/week-view.tsx`
- `src/components/calendar/day-box.tsx`
- `src/components/calendar/calendar.tsx`
- `src/components/calendar/calendars/user-calendar.tsx`
- `src/components/academic-hub/course-card.tsx`

---

## Task 1: Extract course-identity helpers (TDD)

**Files:**
- Create: `src/helpers/course-identity/*.ts`
- Modify: `src/helpers/record-academic/course-identity.ts`
- Test: move from `src/helpers/record-academic/course-identity.test.ts`

- [ ] **Step 1: Create `breadcrumb.ts`**

`src/helpers/course-identity/breadcrumb.ts`:
```ts
export type CourseBreadcrumbLike = {
  program?: { name?: string } | null;
  level?: { name?: string } | null;
  section?: { name?: string } | null;
};

export function buildCourseBreadcrumb(course: CourseBreadcrumbLike): string {
  const parts: string[] = [];
  if (course.program?.name) parts.push(course.program.name);
  if (course.level?.name) parts.push(course.level.name);
  if (course.section?.name) parts.push(course.section.name);
  return parts.join(" · ");
}
```

- [ ] **Step 2: Create `schedule-pattern.ts`**

`src/helpers/course-identity/schedule-pattern.ts`:
```ts
export type CourseScheduleLike = {
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
};

function formatClock(time: string): string {
  return time.trim().slice(0, 5);
}

export function formatCourseSchedulePattern(
  course: CourseScheduleLike,
): string | null {
  const days = course.weekday_pattern?.trim();
  const from = course.first_event_time_from;
  const to = course.first_event_time_to;
  if (!days && !from) return null;
  const time =
    from && to
      ? `${formatClock(from)}–${formatClock(to)}`
      : (course.time_pattern?.trim() ?? null);
  if (days && time) return `${days} ${time}`;
  return days ?? time;
}
```

- [ ] **Step 3: Create `status-label.ts`**

`src/helpers/course-identity/status-label.ts`:
```ts
export function courseStatusLabel(status: string | undefined | null): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
```

- [ ] **Step 4: Create `index.ts`**

`src/helpers/course-identity/index.ts`:
```ts
export { buildCourseBreadcrumb, type CourseBreadcrumbLike } from "./breadcrumb";
export {
  formatCourseSchedulePattern,
  type CourseScheduleLike,
} from "./schedule-pattern";
export { courseStatusLabel } from "./status-label";
export {
  selectSubjectChips,
  truncateSubjectChips,
  type SubjectChip,
  type SubjectChipSource,
} from "./subject-chips";
```

- [ ] **Step 5: Move tests**

Move `src/helpers/record-academic/course-identity.test.ts` → split into:
- `src/helpers/course-identity/breadcrumb.test.ts` (import from `./breadcrumb`)
- `src/helpers/course-identity/schedule-pattern.test.ts` (import from `./schedule-pattern`)

- [ ] **Step 6: Shim old path**

Replace `src/helpers/record-academic/course-identity.ts` with:
```ts
export {
  buildCourseBreadcrumb,
  formatCourseSchedulePattern,
  courseStatusLabel,
} from "@/helpers/course-identity";
```

Delete `src/helpers/record-academic/course-identity.test.ts` after move.

- [ ] **Step 7: Run tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/course-identity`
Expected: all PASS

- [ ] **Step 8: Stage**

```bash
git add src/helpers/course-identity src/helpers/record-academic/course-identity.ts
```

---

## Task 2: Subject chip selection helper (TDD)

**Files:**
- Create: `src/helpers/course-identity/subject-chips.ts`, `subject-chips.test.ts`

- [ ] **Step 1: Write failing tests**

`src/helpers/course-identity/subject-chips.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { selectSubjectChips, truncateSubjectChips } from "./subject-chips";
import { SubjectStrategy } from "@/types/program";

describe("selectSubjectChips", () => {
  it("returns single chip for required strategy", () => {
    const chips = selectSubjectChips({
      program: { subject_strategy: SubjectStrategy.required },
      subject: { id: 1, name: "Maths" },
    });
    expect(chips).toEqual([{ id: "1", name: "Maths" }]);
  });

  it("returns multi chips from course_subjects", () => {
    const chips = selectSubjectChips({
      program: { subject_strategy: SubjectStrategy.multi },
      course_subjects: [
        { subject: { id: 1, name: "F1" } },
        { subject: { id: 2, name: "F2" } },
      ],
    });
    expect(chips).toEqual([
      { id: "1", name: "F1" },
      { id: "2", name: "F2" },
    ]);
  });

  it("returns empty for none strategy", () => {
    expect(
      selectSubjectChips({
        program: { subject_strategy: SubjectStrategy.none },
        subject: { id: 1, name: "Maths" },
      }),
    ).toEqual([]);
  });
});

describe("truncateSubjectChips", () => {
  it("truncates at max and reports overflow", () => {
    const chips = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "3", name: "C" },
    ];
    const result = truncateSubjectChips(chips, 2);
    expect(result.visible).toHaveLength(2);
    expect(result.overflow).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm run test:unit -- src/helpers/course-identity/subject-chips.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`src/helpers/course-identity/subject-chips.ts`:
```ts
import { SubjectStrategy } from "@/types/program";

export type SubjectChip = { id: string; name: string };

export type SubjectChipSource = {
  program?: { subject_strategy?: string } | null;
  subject?: { id: number; name: string } | null;
  course_subjects?: { subject: { id: number; name: string } }[];
};

export function selectSubjectChips(source: SubjectChipSource): SubjectChip[] {
  const strategy = source.program?.subject_strategy ?? SubjectStrategy.none;

  if (strategy === SubjectStrategy.required && source.subject?.name) {
    return [{ id: String(source.subject.id), name: source.subject.name }];
  }

  if (strategy === SubjectStrategy.multi && source.course_subjects?.length) {
    return source.course_subjects
      .map((cs) => cs.subject)
      .filter((s): s is { id: number; name: string } => Boolean(s))
      .map((s) => ({ id: String(s.id), name: s.name }));
  }

  if (strategy === SubjectStrategy.optional && source.subject?.name) {
    return [{ id: String(source.subject.id), name: source.subject.name }];
  }

  return [];
}

export function truncateSubjectChips(
  chips: SubjectChip[],
  max: number,
): { visible: SubjectChip[]; overflow: number } {
  if (chips.length <= max) {
    return { visible: chips, overflow: 0 };
  }
  return { visible: chips.slice(0, max), overflow: chips.length - max };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test:unit -- src/helpers/course-identity/subject-chips.test.ts`
Expected: PASS

- [ ] **Step 5: Stage**

```bash
git add src/helpers/course-identity/subject-chips.ts src/helpers/course-identity/subject-chips.test.ts src/helpers/course-identity/index.ts
```

---

## Task 3: SubjectChips UI component

**Files:**
- Create: `src/components/course-identity/subject-chips.tsx`

- [ ] **Step 1: Create component**

`src/components/course-identity/subject-chips.tsx`:
```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import {
  selectSubjectChips,
  truncateSubjectChips,
  type SubjectChipSource,
} from "@/helpers/course-identity";

type Props = {
  source: SubjectChipSource;
  maxVisible: number;
  /** Hub uses shadcn Badge; record uses sj chip styling */
  variant?: "hub" | "record";
};

export function SubjectChips({
  source,
  maxVisible,
  variant = "hub",
}: Props) {
  const all = selectSubjectChips(source);
  const { visible, overflow } = truncateSubjectChips(all, maxVisible);
  if (visible.length === 0) return null;

  if (variant === "record") {
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {visible.map((chip) => (
          <span
            key={chip.id}
            className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-text-secondary"
          >
            {chip.name}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="text-xs text-text-muted">+{overflow} more</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {visible.map((chip) => (
        <Badge key={chip.id} variant="secondary">
          {chip.name}
        </Badge>
      ))}
      {overflow > 0 ? <Badge variant="outline">+{overflow} more</Badge> : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npm run lint -- --max-warnings=0 src/components/course-identity/subject-chips.tsx`
Expected: no errors

- [ ] **Step 3: Stage**

```bash
git add src/components/course-identity/subject-chips.tsx
```

---

## Task 4: CourseIdentityBlock primitive

**Files:**
- Create: `src/components/course-identity/course-identity-types.ts`, `course-identity-block.tsx`

- [ ] **Step 1: Create types**

`src/components/course-identity/course-identity-types.ts`:
```ts
import type { SubjectChipSource } from "@/helpers/course-identity";

export type CourseIdentityVariant = "hub" | "record";

export type CourseIdentityCourse = SubjectChipSource & {
  title?: string | null;
  code?: string | null;
  status?: string | null;
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
  program?: { name?: string; subject_strategy?: string } | null;
  level?: { name?: string } | null;
  section?: { name?: string } | null;
};

export type RecordIdentityExtras = {
  assignedRoleName?: string | null;
  isShared?: boolean;
  nextSessionLabel?: string | null;
};
```

- [ ] **Step 2: Create block — record variant focus**

`src/components/course-identity/course-identity-block.tsx`:
```tsx
"use client";

import {
  buildCourseBreadcrumb,
  courseStatusLabel,
  formatCourseSchedulePattern,
} from "@/helpers/course-identity";
import { cn } from "@/lib/utils";
import { SubjectChips } from "./subject-chips";
import type {
  CourseIdentityCourse,
  CourseIdentityVariant,
  RecordIdentityExtras,
} from "./course-identity-types";

type HubProps = {
  variant: "hub";
  course: CourseIdentityCourse;
  titleClassName?: string;
  /** Hub renders title/code/chips only — shell handles status badge */
  showTitle?: boolean;
};

type RecordProps = {
  variant: "record";
  course: CourseIdentityCourse;
} & RecordIdentityExtras;

type Props = HubProps | RecordProps;

function TeachingPill() {
  return (
    <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-accent">
      Teaching
    </span>
  );
}

export function CourseIdentityBlock(props: Props) {
  const { course, variant } = props;
  const breadcrumb = buildCourseBreadcrumb(course);
  const schedule = formatCourseSchedulePattern(course);

  if (variant === "record") {
    const { assignedRoleName, isShared, nextSessionLabel } = props;
    const meta = [course.code, assignedRoleName, schedule]
      .filter(Boolean)
      .join(" · ");
    const status = courseStatusLabel(course.status);
    const statusColor =
      course.status === "active" || course.status === "planned"
        ? "text-success"
        : "text-text-muted";

    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-xs text-text-muted">
            {breadcrumb || "Course"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {isShared ? <TeachingPill /> : null}
            <span className={cn("text-xs font-medium", statusColor)}>
              {status}
            </span>
          </div>
        </div>
        <p className="mt-1 font-serif text-lg text-text-primary group-hover:text-accent">
          {course.title ?? "Untitled course"}
        </p>
        <SubjectChips source={course} maxVisible={2} variant="record" />
        {meta ? (
          <p className="mt-0.5 text-sm text-text-muted">{meta}</p>
        ) : null}
        {nextSessionLabel ? (
          <p className="mt-2 text-right text-sm text-text-secondary">
            Next: {nextSessionLabel} →
          </p>
        ) : null}
      </>
    );
  }

  // hub variant — title + code block (status badge stays in card shell)
  return (
    <>
      {breadcrumb ? (
        <p className="truncate text-xs text-muted-foreground">{breadcrumb}</p>
      ) : null}
      <div className="space-y-0.5">
        <h3
          className={cn(
            "text-base font-semibold leading-snug line-clamp-2",
            props.titleClassName,
          )}
        >
          {course.title}
        </h3>
        {course.code ? (
          <p className="font-mono text-xs text-muted-foreground">{course.code}</p>
        ) : null}
      </div>
      <SubjectChips source={course} maxVisible={3} variant="hub" />
    </>
  );
}
```

- [ ] **Step 3: Verify lint**

Run: `npm run lint -- --max-warnings=0 src/components/course-identity/`
Expected: no errors

- [ ] **Step 4: Stage**

```bash
git add src/components/course-identity/
```

---

## Task 5: Upgrade RecordCourseRow + RecordCourseList

**Files:**
- Modify: `record-course-row.tsx`, `record-course-list.tsx`

- [ ] **Step 1: Rewrite `RecordCourseRow`**

`src/components/record/academic/record-course-row.tsx` — replace body with:
```tsx
"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { CourseIdentityBlock } from "@/components/course-identity/course-identity-block";
import { staggerItem } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

export type RecordCourseRowData = {
  userCourseId: number;
  courseId: number;
  title: string;
  code?: string | null;
  status?: string | null;
  assignedRoleName?: string | null;
  program?: { name?: string; subject_strategy?: string } | null;
  level?: { name?: string } | null;
  section?: { name?: string } | null;
  subject?: { id: number; name: string } | null;
  course_subjects?: { subject: { id: number; name: string } }[];
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
  nextSessionLabel?: string | null;
  isShared?: boolean;
};

export function RecordCourseRow({ row }: { row: RecordCourseRowData }) {
  return (
    <motion.div variants={staggerItem}>
      <Link
        href={`/courses/${row.courseId}`}
        className={cn(
          "group block rounded-lg border border-border-strong bg-surface-elevated px-3 py-4 transition-colors hover:bg-surface-hover",
          row.isShared && "border-l-2 border-brand pl-4",
        )}
      >
        <CourseIdentityBlock
          variant="record"
          course={row}
          assignedRoleName={row.assignedRoleName}
          isShared={row.isShared}
          nextSessionLabel={row.nextSessionLabel}
        />
      </Link>
    </motion.div>
  );
}
```

- [ ] **Step 2: Update list wrapper + empty state + row data**

In `record-course-list.tsx`:

1. Change list container from `divide-y rounded-lg border` to:
   ```tsx
   className="flex flex-col gap-2"
   ```

2. Replace empty state handwriting:
   ```tsx
   <p className="text-sm text-text-secondary">
     Not enrolled in any classes yet.
   </p>
   ```

3. Extend `rowData` builder to pass subject fields when present on `course`:
   ```tsx
   subject: course.subject ?? undefined,
   course_subjects: course.course_subjects ?? undefined,
   program: course.program ?? undefined,
   ```

4. Grep confirm zero handwriting:
   ```bash
   rg 'font-hand' src/components/record/academic/
   ```
   Expected: no matches

- [ ] **Step 3: Stage**

```bash
git add src/components/record/academic/record-course-row.tsx src/components/record/academic/record-course-list.tsx
```

---

## Task 6: Reskin RecordThisWeekAgenda

**Files:**
- Modify: `record-this-week-agenda.tsx`

- [ ] **Step 1: Remove handwriting; add shared accent**

Replace list + row styling:
```tsx
<ul className="divide-y divide-border rounded-lg border border-border-strong bg-surface-elevated">
  {sessions.map((session) => {
    const shared = isSharedCourse(session.courseId, sharedIds);
    return (
      <li
        key={`${session.courseId}-${session.sortKey}`}
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm",
          shared && "border-l-2 border-brand pl-4",
        )}
      >
        <span className="font-mono text-xs tabular-nums text-text-secondary">
          {session.label}
        </span>
        <Link
          href={`/courses/${session.courseId}`}
          className="min-w-0 truncate font-medium text-text-primary hover:text-accent"
        >
          {session.courseTitle}
        </Link>
      </li>
    );
  })}
</ul>
```

Remove all `font-hand` / "Your class" spans.

- [ ] **Step 2: Stage**

```bash
git add src/components/record/academic/record-this-week-agenda.tsx
```

---

## Task 7: CalendarEventSlot helper (TDD)

**Files:**
- Create: `calendar-event-slot.tsx`, `calendar-event-slot.test.tsx`

- [ ] **Step 1: Write failing test**

`src/components/calendar/calendar-event-slot.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarEventSlot } from "./calendar-event-slot";

describe("CalendarEventSlot", () => {
  it("renders title and time", () => {
    render(
      <CalendarEventSlot title="Algebra II" timeFrom="14:00" timeTo="16:00" />,
    );
    expect(screen.getByText("Algebra II")).toBeTruthy();
    expect(screen.getByText(/14:00/)).toBeTruthy();
  });

  it("hides time when compact", () => {
    render(
      <CalendarEventSlot
        title="Algebra II"
        timeFrom="14:00"
        timeTo="16:00"
        compact
      />,
    );
    expect(screen.getByText("Algebra II")).toBeTruthy();
    expect(screen.queryByText(/14:00/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm run test:unit -- src/components/calendar/calendar-event-slot.test.tsx`

- [ ] **Step 3: Implement**

`src/components/calendar/calendar-event-slot.tsx`:
```tsx
import { formateEventTime } from "@/helpers/date";

type Props = {
  title: string;
  timeFrom?: string;
  timeTo?: string;
  compact?: boolean;
};

export function CalendarEventSlot({
  title,
  timeFrom,
  timeTo,
  compact = false,
}: Props) {
  return (
    <>
      <p className="truncate text-xs font-medium text-text-primary">{title}</p>
      {!compact && timeFrom && timeTo ? (
        <p className="truncate font-mono text-[11px] tabular-nums text-text-muted">
          {formateEventTime(timeFrom)} – {formateEventTime(timeTo)}
        </p>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Stage**

```bash
git add src/components/calendar/calendar-event-slot.tsx src/components/calendar/calendar-event-slot.test.tsx
```

---

## Task 8: WeekView reskin + renderEvent

**Files:**
- Modify: `src/components/calendar/week-view.tsx`

- [ ] **Step 1: Import helpers**

Add:
```tsx
import { CalendarEventSlot } from "./calendar-event-slot";
```

- [ ] **Step 2: Read renderEvent from context**

At top of `WeekView`:
```tsx
const { currentDate, events, renderEvent } = useCalendar();
```

- [ ] **Step 3: Extract event content renderer**

Add helper inside file:
```tsx
function WeekEventContent({
  event,
  compact,
  renderEvent,
}: {
  event: { title?: string; time_from: string; time_to: string; assignment?: unknown };
  compact: boolean;
  renderEvent?: (event: any) => React.ReactNode;
}) {
  if (renderEvent) {
    return <>{renderEvent(event)}</>;
  }
  return (
    <CalendarEventSlot
      title={event.title ?? "Session"}
      timeFrom={event.time_from}
      timeTo={event.time_to}
      compact={compact}
    />
  );
}
```

- [ ] **Step 4: Update event button classes**

Replace both event button `className` blocks (≤2 cluster and 2-of-N cluster paths):
```tsx
className={cn(
  "absolute rounded-md border border-border-strong bg-surface-elevated px-1.5 py-1 text-left shadow-xs transition-colors hover:bg-surface-hover",
  !event.assignment && "border-l-[3px] border-l-accent",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
)}
style={{
  top: `${start * 4}rem`,
  height: `${Math.max(duration * 4, 1.75)}rem`,
  // ... width/left unchanged
}}
```

- [ ] **Step 5: Replace inner content**

Replace hardcoded `<p>{event.title}</p>` blocks with:
```tsx
<WeekEventContent
  event={event}
  compact={duration < 0.5}
  renderEvent={renderEvent}
/>
```

- [ ] **Step 6: Update "+N more" chip classes**

```tsx
"absolute z-10 rounded border border-dashed border-border-strong bg-surface-elevated px-1 py-0.5 text-center text-[11px] font-medium text-text-muted shadow-xs transition-colors hover:bg-surface-hover hover:text-text-primary"
```

- [ ] **Step 7: Manual smoke**

Open user record → Academic → Schedule → week view. Events should use cream elevated blocks; custom `renderCalendarEvent` content from user page should appear in week columns.

- [ ] **Step 8: Stage**

```bash
git add src/components/calendar/week-view.tsx
```

---

## Task 9: DayBox token alignment

**Files:**
- Modify: `src/components/calendar/day-box.tsx`

- [ ] **Step 1: Update default event cell chrome**

Change base cell classes from:
```tsx
"min-w-0 rounded-md border border-border px-1.5 py-1 text-xs leading-snug"
```
to:
```tsx
"min-w-0 rounded-md border border-border-strong bg-surface-elevated px-1.5 py-1 text-xs leading-snug"
```

- [ ] **Step 2: Preserve assignment bgClass overrides**

Keep existing assignment color branches — only change the neutral base. Do not remove `bgClass` ternary.

- [ ] **Step 3: Stage**

```bash
git add src/components/calendar/day-box.tsx
```

---

## Task 10: Calendar embedded shell

**Files:**
- Modify: `calendar.tsx`, `user-calendar.tsx`, `record-academic-schedule.tsx`

- [ ] **Step 1: Add prop to Calendar**

In `CalendarProps`:
```tsx
embedded?: boolean;
```

Destructure with default `embedded = false`.

- [ ] **Step 2: Conditional shell**

Replace outer wrapper:
```tsx
const Shell = embedded ? "div" : Card;
const shellClass = embedded
  ? "flex flex-col gap-0 rounded-lg border border-border-strong bg-surface"
  : "flex flex-col gap-0 rounded-2xl py-6";

return (
  <CalendarContext.Provider value={contextValue}>
    <Shell className={shellClass}>
      {embedded ? (
        <div className="flex flex-col gap-4 px-4 pb-4 pt-4">
          {/* CalendarMenu + legends — same inner content as CardHeader */}
        </div>
      ) : (
        <>
          <CardHeader className="...">...</CardHeader>
          <CardContent className="...">...</CardContent>
        </>
      )}
    </Shell>
  </CalendarContext.Provider>
);
```

Extract shared header/content into a local fragment to avoid duplication — both paths render identical `CalendarMenu`, legends, and view switcher.

- [ ] **Step 3: Forward from UserCalendar**

`UserCalendarProps`:
```tsx
embedded?: boolean;
```

Pass to `<Calendar embedded={embedded} ... />`.

- [ ] **Step 4: Record schedule passes embedded**

In `record-academic-schedule.tsx`:
```tsx
<UserCalendar
  embedded
  events={displayEvents as eventType[]}
  ...
/>
```

- [ ] **Step 5: Stage**

```bash
git add src/components/calendar/calendar.tsx src/components/calendar/calendars/user-calendar.tsx src/components/record/academic/record-academic-schedule.tsx
```

---

## Task 11: Shared-course calendar tint wrapper

**Files:**
- Modify: `record-academic-schedule.tsx`

- [ ] **Step 1: Update wrapper**

Replace border-only wrapper with tint:
```tsx
return function SharedAwareCalendarEvent(event: eventType) {
  const courseId = courseIdFromProfileEvent(event as ProfileCalendarEventLike);
  const isShared = courseId != null && sharedIds.includes(courseId);
  const inner = renderCalendarEvent(event);
  if (!isShared) return inner;
  return (
    <div className="rounded-md bg-brand/8 px-1 py-0.5">{inner}</div>
  );
};
```

Remove `border-l-2 border-brand pl-2` from wrapper — week view block already has `border-l-accent`; tint is sufficient per spec §8.4.

- [ ] **Step 2: Stage**

```bash
git add src/components/record/academic/record-academic-schedule.tsx
```

---

## Task 12: Refactor AcademicHubCourseCard

**Files:**
- Modify: `src/components/academic-hub/course-card.tsx`

- [ ] **Step 1: Import CourseIdentityBlock**

Remove local `Breadcrumb` component and inline subject chip `useMemo` (keep category/intake row separate — not part of identity block).

- [ ] **Step 2: Replace identity section**

Inside card body, replace breadcrumb + title + code + subject chips with:
```tsx
<div className="flex items-start justify-between gap-2">
  <div className="min-w-0 flex-1 space-y-3">
    <CourseIdentityBlock variant="hub" course={course} />
  </div>
  <StatusBadge status={course.status} />
</div>
```

Adjust layout so StatusBadge stays top-right (same as before).

- [ ] **Step 3: Keep hub-only rows**

Preserve unchanged below identity block:
- Category chip + intake right-align row
- Clock / weekday / weeks / PrimaryTeacherLine / student counts
- `matchedOutside` pill
- Card shell + Link

- [ ] **Step 4: Remove dead imports**

Remove unused `SubjectStrategy`, `MAX_SUBJECT_CHIPS`, local `Breadcrumb`, subject chip memos.

- [ ] **Step 5: Lint + manual check `/courses`**

Run: `npm run lint -- --max-warnings=0 src/components/academic-hub/course-card.tsx`
Manual: Academic Hub grid — breadcrumb, title, code, subject chips unchanged visually.

- [ ] **Step 6: Stage**

```bash
git add src/components/academic-hub/course-card.tsx
```

---

## Task 13: Final verification

- [ ] **Step 1: Unit tests**

Run: `npm run test:unit -- src/helpers/course-identity src/components/calendar/calendar-event-slot.test.tsx`
Expected: all PASS

- [ ] **Step 2: No handwriting in record academic**

Run: `rg 'font-hand' schedjuice-reimagined-fe/src/components/record/academic/`
Expected: no matches

- [ ] **Step 3: Lint touched paths**

Run: `npm run lint -- --max-warnings=0 src/components/course-identity src/components/record/academic src/components/calendar src/components/academic-hub/course-card.tsx src/helpers/course-identity`
Expected: no errors

- [ ] **Step 4: Manual checklist (spec §11)**

1. Teacher → student → Courses: elevated rows, Teaching pill, no handwriting
2. This week: left accent on shared, no labels
3. Empty enrollment: plain sans
4. Schedule week view: sj tokens, renderEvent works, shared tint
5. Course page calendar (legacy): Card chrome when not `embedded`
6. `/courses` hub: visual parity

- [ ] **Step 5: Stage all remaining**

```bash
git add -A
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| CourseIdentityBlock primitive | 4 |
| Handwriting removed | 5, 6 |
| Teaching pill + brand left rule | 4, 5 |
| Record elevated rows | 5 |
| Agenda reskin | 6 |
| WeekView renderEvent + tokens | 7, 8 |
| DayBox tokens | 9 |
| Calendar embedded shell | 10 |
| Shared calendar tint | 11 |
| Hub card refactor | 12 |
| Helper extraction | 1, 2 |
| Subject chips shared | 2, 3 |

---

## Suggested execution order

Tasks **1 → 2 → 3 → 4** (foundation) can ship independently. Tasks **5 → 6** (record surfaces) deliver immediate visible fix. Tasks **7 → 11** (calendar). Task **12** (hub refactor) last to validate primitive against production card.
