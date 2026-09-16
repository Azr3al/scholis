# Course Attendance Dashboard Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin `/courses/[id]/attendance` to match DESIGN.md via full primitive migration, default to the current month, and highlight today’s session column (or closest past teaching day in the current month).

**Architecture:** Pure-frontend change. Extract month/highlight logic into testable helpers, build new attendance components on Schedjuice primitives, extend `Sheet` with a bottom variant for mobile detail, and rewrite the page to compose them. Backend matrix API unchanged.

**Tech Stack:** Next.js App Router, React Query, nuqs, Vitest, `@/components/primitives/*`, Iconoir, Motion (`motion/react`).

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-28-course-attendance-dashboard-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/helpers/attendance-dashboard.ts` | Month anchor formatting, course month options, default month, highlight date, current-month check, matrix header normalization |
| `src/helpers/attendance-dashboard.test.ts` | Unit tests for helpers |
| `src/components/primitives/sheet.tsx` | Add `bottom` side to Popup |
| `src/components/attendance/attendance-status-label.tsx` | Word + color status display |
| `src/components/attendance/attendance-month-select.tsx` | Month picker on primitive Select |
| `src/components/attendance/attendance-matrix-table.tsx` | Desktop matrix, mobile list, bottom sheet detail, column highlight + scroll |
| `src/components/attendance/attendance-dashboard-toolbar.tsx` | Search input, month select, mark-attendance link |
| `src/components/primitives/empty/empty-copy-presets.ts` | Add `noSessions` preset |
| `src/app/(internal)/courses/[id]/attendance/page.tsx` | Page shell: data fetching, default month URL sync, compose new components |
| `src/components/attendance/report-table.tsx` | Delete after page cutover (only consumer is this page) |

---

### Task 1: Attendance dashboard helpers (TDD)

**Files:**
- Create: `src/helpers/attendance-dashboard.ts`
- Create: `src/helpers/attendance-dashboard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/helpers/attendance-dashboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildCourseMonthOptions,
  formatMonthAnchor,
  isViewingCurrentCalendarMonth,
  normalizeSessionHeaderDate,
  resolveDefaultMonth,
  resolveHighlightSessionDate,
} from "@/helpers/attendance-dashboard";

describe("formatMonthAnchor", () => {
  it("returns YYYY-MM-01 for a date", () => {
    expect(formatMonthAnchor(new Date(2026, 3, 15))).toBe("2026-04-01");
  });
});

describe("resolveDefaultMonth", () => {
  const course = (start: string | null, end: string | null) =>
    ({ start_date: start, end_date: end }) as { start_date: string | null; end_date: string | null };

  it("returns current month when today is within course range", () => {
    const today = new Date(2026, 3, 10);
    expect(
      resolveDefaultMonth(course("2026-01-01", "2026-12-31"), today),
    ).toBe("2026-04-01");
  });

  it("returns course start month when today is before course", () => {
    const today = new Date(2026, 0, 5);
    expect(
      resolveDefaultMonth(course("2026-03-01", "2026-12-31"), today),
    ).toBe("2026-03-01");
  });

  it("returns course end month when today is after course", () => {
    const today = new Date(2027, 0, 5);
    expect(
      resolveDefaultMonth(course("2026-01-01", "2026-06-30"), today),
    ).toBe("2026-06-01");
  });

  it("returns current month when course dates missing", () => {
    const today = new Date(2026, 3, 10);
    expect(resolveDefaultMonth(course(null, null), today)).toBe("2026-04-01");
  });
});

describe("resolveHighlightSessionDate", () => {
  const headers = ["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-06"];

  it("returns today when it is a session day", () => {
    expect(resolveHighlightSessionDate(headers, "2026-04-03")).toBe("2026-04-03");
  });

  it("returns closest past session when today is not a session day", () => {
    expect(resolveHighlightSessionDate(headers, "2026-04-05")).toBe("2026-04-03");
  });

  it("returns null when today is before first session in month", () => {
    expect(resolveHighlightSessionDate(headers, "2026-04-01")).toBe("2026-04-01");
    expect(resolveHighlightSessionDate(headers, "2026-03-31")).toBeNull();
  });

  it("returns null for empty headers", () => {
    expect(resolveHighlightSessionDate([], "2026-04-03")).toBeNull();
  });
});

describe("isViewingCurrentCalendarMonth", () => {
  it("returns false for all", () => {
    expect(isViewingCurrentCalendarMonth("all", new Date(2026, 3, 10))).toBe(false);
  });

  it("returns true when dateRange matches today month", () => {
    expect(isViewingCurrentCalendarMonth("2026-04-01", new Date(2026, 3, 10))).toBe(true);
  });

  it("returns false for other months", () => {
    expect(isViewingCurrentCalendarMonth("2026-03-01", new Date(2026, 3, 10))).toBe(false);
  });
});

describe("buildCourseMonthOptions", () => {
  it("lists months from start to end inclusive", () => {
    const options = buildCourseMonthOptions("2026-01-15", "2026-03-10");
    expect(options.map((o) => o.value)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    expect(options[0]?.label).toMatch(/January/i);
  });
});

describe("normalizeSessionHeaderDate", () => {
  it("normalizes ISO datetime to YMD", () => {
    expect(normalizeSessionHeaderDate("2026-04-03T00:00:00Z")).toBe("2026-04-03");
  });

  it("passes through YMD", () => {
    expect(normalizeSessionHeaderDate("2026-04-03")).toBe("2026-04-03");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/attendance-dashboard.test.ts`

Expected: FAIL — module `@/helpers/attendance-dashboard` not found.

- [ ] **Step 3: Implement helpers**

Create `src/helpers/attendance-dashboard.ts`:

```ts
import { dateOnly } from "@/helpers/attendance-marking";

export type CourseMonthBounds = {
  start_date?: string | null;
  end_date?: string | null;
};

export type MonthOption = {
  value: string;
  label: string;
  year: string;
};

export function formatMonthAnchor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function resolveDefaultMonth(
  course: CourseMonthBounds,
  today = new Date(),
): string {
  const start = course.start_date ? new Date(course.start_date) : null;
  const end = course.end_date ? new Date(course.end_date) : null;

  if (start && today < start) {
    return formatMonthAnchor(start);
  }
  if (end && today > end) {
    return formatMonthAnchor(end);
  }
  return formatMonthAnchor(today);
}

export function normalizeSessionHeaderDate(raw: string): string {
  return dateOnly(raw);
}

export function resolveHighlightSessionDate(
  sessionDateHeaders: string[],
  todayYmd: string,
): string | null {
  const normalized = sessionDateHeaders
    .map(normalizeSessionHeaderDate)
    .filter(Boolean);

  if (normalized.length === 0) return null;
  if (normalized.includes(todayYmd)) return todayYmd;

  let best: string | null = null;
  for (const d of normalized) {
    if (d <= todayYmd) best = d;
  }
  return best;
}

export function isViewingCurrentCalendarMonth(
  dateRange: string,
  today = new Date(),
): boolean {
  if (dateRange === "all") return false;
  const [y, m] = dateRange.split("-").map(Number);
  if (!y || !m) return false;
  return today.getFullYear() === y && today.getMonth() + 1 === m;
}

export function buildCourseMonthOptions(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): MonthOption[] {
  if (!startDate || !endDate) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const options: MonthOption[] = [];

  while (cursor <= last) {
    const value = formatMonthAnchor(cursor);
    options.push({
      value,
      label: cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      year: String(cursor.getFullYear()),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return options;
}

export function parseAttendanceMatrix(data: string[][]) {
  if (data.length < 2) return null;
  const [header, ...rows] = data;
  const sessionHeaders = header.slice(3).map(String);
  return {
    sessionHeaders,
    rows: rows.map((row) => ({
      name: String(row[0] ?? ""),
      total: String(row[1] ?? ""),
      percentage: String(row[2] ?? ""),
      statuses: row.slice(3).map(String),
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/attendance-dashboard.test.ts`

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/attendance-dashboard.ts src/helpers/attendance-dashboard.test.ts
git commit -m "feat(attendance): add dashboard month and highlight helpers"
```

---

### Task 2: Sheet bottom variant

**Files:**
- Modify: `src/components/primitives/sheet.tsx`

- [ ] **Step 1: Extend Side type and classes**

Replace the top of `sheet.tsx`:

```ts
type Side = "right" | "left" | "bottom";

const sideClasses: Record<Side, string> = {
  right:
    "inset-y-0 right-0 w-96 max-w-[calc(100vw-3rem)] border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
  left:
    "inset-y-0 left-0 w-96 max-w-[calc(100vw-3rem)] border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
  bottom:
    "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-2xl border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
};
```

Update `Popup` base classes — remove hard-coded `inset-y-0` / width from the shared cn string; apply via `sideClasses[side]`:

```ts
function Popup({
  className,
  side = "right",
  ...props
}: ComponentProps<typeof BaseDialog.Popup> & { side?: Side }) {
  return (
    <BaseDialog.Popup
      className={cn(
        "sj-root fixed z-50 flex flex-col gap-4 border-border bg-surface-elevated p-6 text-text-primary shadow-lg",
        "transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        sideClasses[side],
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit --pretty false 2>&1 | head -30`

Expected: no new errors referencing `sheet.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/primitives/sheet.tsx
git commit -m "feat(primitives): add bottom side to Sheet popup"
```

---

### Task 3: AttendanceStatusLabel component

**Files:**
- Create: `src/components/attendance/attendance-status-label.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";

import { attendanceStatus } from "@/types/attendance";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  [attendanceStatus.present]: "text-success",
  [attendanceStatus.late]: "text-warning",
  [attendanceStatus.absent]: "text-danger",
  [attendanceStatus.unregistered]: "text-text-muted",
};

function normalizeStatus(raw: string): string {
  return raw.trim().toLowerCase();
}

export function AttendanceStatusLabel({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = normalizeStatus(status);
  const colorClass = STATUS_CLASS[key] ?? "text-text-muted";
  const label = key.charAt(0).toUpperCase() + key.slice(1);

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm capitalize", colorClass, className)}>
      <span aria-hidden className="text-[0.5rem] leading-none">
        ●
      </span>
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/attendance-status-label.tsx
git commit -m "feat(attendance): add semantic status label component"
```

---

### Task 4: AttendanceMonthSelect component

**Files:**
- Create: `src/components/attendance/attendance-month-select.tsx`

- [ ] **Step 1: Create month select**

Primitive `Select` does not support non-selectable year headings — use flat `"April 2026"` labels from `MonthOption.label`.

```tsx
"use client";

import { Select } from "@/components/primitives/select";
import type { MonthOption } from "@/helpers/attendance-dashboard";
import { useMemo } from "react";

const ALL_MONTHS_VALUE = "all";

export function AttendanceMonthSelect({
  value,
  onValueChange,
  months,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  months: MonthOption[];
  disabled?: boolean;
}) {
  const selectItems = useMemo(
    () => [
      { value: ALL_MONTHS_VALUE, label: "All months" },
      ...months.map((m) => ({ value: m.value, label: m.label })),
    ],
    [months],
  );

  return (
    <div className="flex min-w-[11rem] flex-col gap-1.5">
      <span className="text-xs text-text-muted">Month</span>
      <Select
        items={selectItems}
        value={value}
        onValueChange={(v) => onValueChange(v ?? ALL_MONTHS_VALUE)}
        disabled={disabled}
        placeholder="Select month"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/attendance-month-select.tsx
git commit -m "feat(attendance): add primitive month select for dashboard"
```

---

### Task 5: AttendanceMatrixTable component

**Files:**
- Create: `src/components/attendance/attendance-matrix-table.tsx`

- [ ] **Step 1: Create matrix table with desktop, mobile, and highlight**

Create `src/components/attendance/attendance-matrix-table.tsx` with:

**Props:**

```ts
type Props = {
  data: string[][];
  dateRange: string;
  highlightDate: string | null;
};
```

**Imports:** `formatDate` from `@/helpers/date`, `getTodayYmd` from `@/helpers/attendance-marking`, `parseAttendanceMatrix`, `normalizeSessionHeaderDate` from `@/helpers/attendance-dashboard`, `AttendanceStatusLabel`, primitive `Sheet`, Iconoir `NavArrowRight`, `motion`/`AnimatePresence`/`useReducedMotion`, `crossfade` from `@/lib/sj/motion`, `useEffect`, `useMemo`, `useRef`, `useState`.

**Desktop table structure:**

```tsx
const STICKY =
  "sticky left-0 z-10 min-w-[9rem] max-w-[12rem] border-r border-border-subtle bg-surface-elevated";

<div className="hidden min-w-0 overflow-x-auto md:block">
  <table className="w-full min-w-max border-collapse text-sm">
    <thead>
      <tr className="border-b border-border-subtle">
        <th className={cn(STICKY, "px-3 py-3 text-left font-medium")}>Student name</th>
        <th className="min-w-[5rem] px-3 py-3 text-left text-xs uppercase tracking-wide">Total</th>
        <th className="min-w-[4rem] px-3 py-3 text-left text-xs uppercase tracking-wide">%</th>
        {sessionHeaders.map((header, colIndex) => {
          const ymd = normalizeSessionHeaderDate(header);
          const isHighlight = highlightDate != null && ymd === highlightDate;
          return (
            <th
              key={`${header}-${colIndex}`}
              ref={isHighlight ? highlightRef : undefined}
              className={cn(
                "min-w-[7.5rem] px-3 py-3 text-left text-xs uppercase tracking-wide",
                isHighlight && "bg-brand/10",
              )}
            >
              <span>{formatDate(header, "MMM d, yyyy")}</span>
              {isHighlight && ymd === getTodayYmd() ? (
                <span className="mt-0.5 block text-[10px] font-normal normal-case text-text-muted">
                  Today
                </span>
              ) : null}
            </th>
          );
        })}
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.name} className="min-h-[52px] border-b border-border-subtle">
          <td className={cn(STICKY, "px-3 py-3 font-medium text-text-primary")}>{row.name}</td>
          <td className="px-3 py-3 font-mono tabular-nums">{row.total}</td>
          <td className="px-3 py-3 font-mono tabular-nums">{row.percentage}%</td>
          {row.statuses.map((status, colIndex) => {
            const ymd = normalizeSessionHeaderDate(sessionHeaders[colIndex] ?? "");
            const isHighlight = highlightDate != null && ymd === highlightDate;
            return (
              <td
                key={`${row.name}-${colIndex}`}
                className={cn("px-3 py-3", isHighlight && "bg-brand/[0.08]")}
              >
                <AttendanceStatusLabel status={status} />
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

**Scroll effect:**

```tsx
const highlightRef = useRef<HTMLTableCellElement>(null);
const reducedMotion = useReducedMotion();

useEffect(() => {
  if (!highlightDate || !highlightRef.current) return;
  highlightRef.current.scrollIntoView({
    inline: "center",
    block: "nearest",
    behavior: reducedMotion ? "auto" : "smooth",
  });
}, [highlightDate, dateRange, reducedMotion]);
```

**Mobile list + bottom sheet:**

```tsx
// md:hidden list — button rows with border-b border-border-subtle, NOT cards
// Sheet.Root open={detail != null} side="bottom" on OpenChange
// Sheet.Popup side="bottom" className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
// motion.div variants={popIn} wrapping sheet inner content
```

Reuse `buildStudentDetail` pattern from old `report-table.tsx` (name, total, percentage, sessions array with label + status).

- [ ] **Step 2: Commit**

```bash
git add src/components/attendance/attendance-matrix-table.tsx
git commit -m "feat(attendance): add DESIGN.md matrix table with column highlight"
```

---

### Task 6: AttendanceDashboardToolbar + empty preset

**Files:**
- Create: `src/components/attendance/attendance-dashboard-toolbar.tsx`
- Modify: `src/components/primitives/empty/empty-copy-presets.ts`

- [ ] **Step 1: Add empty preset**

In `empty-copy-presets.ts`, append:

```ts
  noSessions: {
    enBefore: "No ",
    enHighlight: "sessions",
    enAfter: " yet",
    myBefore: "သင်ခန်းစာ ",
    myHighlight: "မရှိ",
    myAfter: "သေးပါ",
  } satisfies EmptyCopySlots,
```

- [ ] **Step 2: Create toolbar**

```tsx
"use client";

import Link from "next/link";
import { Search } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import { Button } from "@/components/primitives/button";
import { AttendanceMonthSelect } from "@/components/attendance/attendance-month-select";
import type { MonthOption } from "@/helpers/attendance-dashboard";

export function AttendanceDashboardToolbar({
  courseId,
  searchTerm,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  months,
  disabled,
}: {
  courseId: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  dateRange: string;
  onDateRangeChange: (value: string) => void;
  months: MonthOption[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search
            width={15}
            height={15}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="search"
            placeholder="Search student"
            className="pl-9"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={disabled}
          />
        </div>
        <AttendanceMonthSelect
          value={dateRange}
          onValueChange={onDateRangeChange}
          months={months}
          disabled={disabled}
        />
      </div>
      <Button variant="primary" size="md" className="w-full sm:w-auto" asChild>
        <Link href={`/courses/${courseId}/attendance/marking/today`}>Mark attendance</Link>
      </Button>
    </div>
  );
}
```

**Note:** If primitive `Button` does not support `asChild`, render `Link` with `className={buttonVariants({ variant: "primary" })}` instead.

- [ ] **Step 3: Commit**

```bash
git add src/components/attendance/attendance-dashboard-toolbar.tsx src/components/primitives/empty/empty-copy-presets.ts
git commit -m "feat(attendance): add dashboard toolbar and noSessions empty preset"
```

---

### Task 7: Rewrite attendance page

**Files:**
- Modify: `src/app/(internal)/courses/[id]/attendance/page.tsx`

- [ ] **Step 1: Replace page implementation**

Key behaviors to implement:

1. **Remove** all shadcn imports (`Card`, `Select`, `Input`, `Skeleton`, `BackButton`, `ReportTable`, `buttonVariants`).
2. **Add** imports for new components, helpers, `NavArrowLeft` from Iconoir, `Link`, `PageContainer`, `TableSkeleton`, `EmptyCopy` + `EMPTY_COPY_PRESETS`, `AnimatePresence`/`motion`, `crossfade`.
3. **URL state** — no default `"all"`:

```tsx
const [dateRange, setDateRange] = useQueryState("dateRange");

const course = getCourse.data?.data?.data ?? null;
const monthOptions = useMemo(
  () => buildCourseMonthOptions(course?.start_date, course?.end_date),
  [course?.start_date, course?.end_date],
);

useEffect(() => {
  if (dateRange != null || !course) return;
  void setDateRange(resolveDefaultMonth(course));
}, [course, dateRange, setDateRange]);

const effectiveDateRange =
  dateRange ?? (course ? resolveDefaultMonth(course) : null);
```

4. **Query** keyed on `effectiveDateRange`:

```tsx
const getMonthlyAttendance = useQuery({
  queryKey: ["getMonthlyAttendance", id, effectiveDateRange],
  enabled: Boolean(id && effectiveDateRange),
  queryFn: async () => {
    const data = await makeGetRequest(
      `attendances/monthly-attendance/${id}/${effectiveDateRange}`,
      { size: -1 },
    );
    return data;
  },
});
```

5. **Search filter** — keep debounced filter; apply to matrix rows (preserve structure via filtered copy of `data` array).

6. **Highlight date** — compute once matrix loaded:

```tsx
const highlightDate = useMemo(() => {
  if (!effectiveDateRange || !isViewingCurrentCalendarMonth(effectiveDateRange)) {
    return null;
  }
  const parsed = parseAttendanceMatrix(filteredData);
  if (!parsed) return null;
  return resolveHighlightSessionDate(parsed.sessionHeaders, getTodayYmd());
}, [effectiveDateRange, filteredData]);
```

7. **Page JSX skeleton:**

```tsx
return (
  <PageContainer width="wide" className="space-y-6">
    <Link
      href={`/courses/${id}`}
      className="inline-flex w-fit items-center gap-2 text-sm text-text-muted hover:text-text-primary"
    >
      <NavArrowLeft width={16} height={16} aria-hidden />
      Back to course
    </Link>

    <header className="space-y-1">
      <h1 className="font-serif text-2xl text-text-primary">Attendance</h1>
      {course ? (
        <>
          <p className="text-sm text-text-secondary">{course.title}</p>
          {/* optional schedule meta from course.time_from/time_to/start_date/end_date */}
        </>
      ) : null}
    </header>

    {loading ? (
      <div className="space-y-4" aria-busy="true">
        <div className="h-10 w-full max-w-md animate-pulse rounded-md bg-surface-hover" />
        <TableSkeleton columns={6} rows={8} />
      </div>
    ) : error ? (
      <p className="text-sm text-danger" role="alert">
        Failed to load attendance. Please try again.
      </p>
    ) : hasMatrix ? (
      <>
        <AttendanceDashboardToolbar ... />
        <AnimatePresence mode="wait">
          <motion.div
            key={effectiveDateRange}
            variants={crossfade}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <AttendanceMatrixTable
              data={filteredData}
              dateRange={effectiveDateRange!}
              highlightDate={highlightDate}
            />
          </motion.div>
        </AnimatePresence>
      </>
    ) : (
      <EmptyCopy {...EMPTY_COPY_PRESETS.noSessions} action={
        <Link href={`/courses/${id}`} className="text-sm text-accent hover:underline">
          Set up course schedule
        </Link>
      } />
    )}
  </PageContainer>
);
```

8. **Remove** `moment` dependency from this page (month options now use `buildCourseMonthOptions`).

- [ ] **Step 2: Run unit tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/attendance-dashboard.test.ts`

Expected: PASS

- [ ] **Step 3: Run lint on touched files**

Run: `cd schedjuice-reimagined-fe && npx eslint src/app/\(internal\)/courses/\[id\]/attendance/page.tsx src/components/attendance/attendance-*.tsx --max-warnings 0`

Expected: exit 0 (fix any import/order issues).

- [ ] **Step 4: Commit**

```bash
git add src/app/(internal)/courses/[id]/attendance/page.tsx
git commit -m "feat(attendance): reskin course dashboard with primitives and month default"
```

---

### Task 8: Remove legacy ReportTable

**Files:**
- Delete: `src/components/attendance/report-table.tsx`

- [ ] **Step 1: Verify no remaining imports**

Run: `cd schedjuice-reimagined-fe && rg "report-table|ReportTable" src`

Expected: no matches (except docs).

- [ ] **Step 2: Delete file**

```bash
git rm src/components/attendance/report-table.tsx
git commit -m "chore(attendance): remove legacy report-table component"
```

---

### Task 9: Manual verification

- [ ] **Step 1: Start dev server and smoke-test**

Run: `cd schedjuice-reimagined-fe && npm run dev`

Manual checklist (from spec §10):

1. Open `/courses/{id}/attendance` for an active course → URL gets current month (`dateRange=YYYY-MM-01`), not `all`.
2. Current month view → anchor column tinted; scrolls into view on wide tables.
3. Switch to a past month → no highlight.
4. Select **All months** → all sessions visible, no highlight.
5. Search filters students; clear restores list.
6. Narrow viewport → mobile list; tap student → bottom sheet with statuses.
7. **Mark attendance** → `/courses/{id}/attendance/marking/today`.
8. Toggle dark mode → readable tokens and subtle highlight.

- [ ] **Step 2: Final commit if any fixups needed**

Only if manual testing surfaced bugs; one commit per fix.

---

## Spec Coverage Checklist

| Spec section | Task |
|--------------|------|
| §1 Layout (no Card, serif title, back link) | Task 7 |
| §2 Primitive migration | Tasks 2–7 |
| §3 Month default + All months | Tasks 1, 4, 7 |
| §4 Column highlight + scroll | Tasks 1, 5, 7 |
| §5 Matrix typography + status labels | Tasks 3, 5 |
| §6 Search | Tasks 6, 7 |
| §7 Loading/empty/error | Tasks 6, 7 |
| §8 Motion | Tasks 5, 7 |
| §9 Data flow unchanged | Task 7 |
| §10 Testing | Tasks 1, 9 |

## Plan Self-Review

- No TBD/TODO placeholders.
- Helper names consistent across tasks (`resolveDefaultMonth`, `resolveHighlightSessionDate`, `parseAttendanceMatrix`).
- `Button asChild` — fallback documented if unsupported.
