# Course Attendance Dashboard — DESIGN.md Reskin

## Context

The **Course Attendance Dashboard** at `/courses/[id]/attendance` shows a student × session matrix for one course. Teachers use it to review monthly attendance and jump to marking.

The page still uses legacy shadcn patterns (Card wrapper, Select, Badge, Table, Sheet) and generic gray status pills. It defaults the month picker to **All**, which loads every session and produces a wide, hard-to-scan table. There is no visual anchor for “where we are in the schedule” relative to today.

This spec reskins the dashboard to match [`DESIGN.md`](../../../DESIGN.md) via a **full primitive migration** on this surface, auto-selects the current month, and highlights today’s column (or the closest past teaching day in the current month).

## Goals

- Replace all shadcn/Radix UI on this page with Schedjuice primitives and semantic tokens.
- Restructure layout to a type-led, non-card-stacked composition per DESIGN.md §9.
- Default month selection to the **current calendar month**, clamped to the course date range.
- Keep **All months** as an explicit picker option.
- Highlight the anchor session column when viewing the **current calendar month** (today, or closest past teaching day in that month).
- Preserve existing API contract (`GET attendances/monthly-attendance/:courseId/:date`) and mobile student-detail drill-down.
- Add subtle motion on month change and sheet open per DESIGN.md §12.

## Non-Goals

- Do not change the org-wide Attendance Overview at `/attendances/god-view`.
- Do not migrate `YearMonthSelector` or other shared selectors globally — scope is this page only.
- Do not change backend matrix shape or attendance calculation logic.
- Do not add CSV export, new filters, or marking workflow changes.
- Do not delete `report-table.tsx` until the new matrix component is wired and verified (may deprecate after cutover).

## Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Scope | Course Attendance Dashboard only (`/courses/[id]/attendance`) |
| Approach | Full primitive migration (Approach C) |
| Month default | Current calendar month, clamped to course range; **All months** remains selectable |
| Anchor column | Closest **past** teaching day in month (reuse `getPreferredEventIndex` semantics) |
| Highlight when | Only while viewing the **current calendar month**; cleared for other months and for **All months** |
| Visual companion | Lofi text mockups only |

---

## Section 1: Page layout

### Structure (desktop, lo-fi)

```
← Back to course

Attendance                          ← font-serif text-2xl
{course.title}                      ← text-text-secondary
{schedule meta line}                ← text-text-muted (times + date range)

[ Search student_______________ ]    Month  [ April 2026 ▾ ]

[ Mark attendance ]                  ← primitives Button variant=primary

────────────────── border-subtle / RoughDivider ──────────────────

<table> … matrix … </table>
```

### Rules

- **No Card wrapper** around title, controls, or table.
- Page title uses `font-serif`; metadata uses sans secondary/muted tokens.
- Toolbar: search (`Input`) and month select on one row; wraps on narrow viewports.
- **Mark attendance** links to `/courses/[id]/attendance/marking/today` (unchanged).
- Back navigation: text link with Iconoir `NavArrowLeft`, consistent with course record shell — do not use legacy `BackButton` (shadcn Button + Lucide).

---

## Section 2: Primitive migration map

| Current import | Replacement |
|----------------|---------------|
| `@/components/ui/card` | Plain layout divs |
| `@/components/ui/button`, `buttonVariants` | `@/components/primitives/button` |
| `@/components/ui/input` | `@/components/primitives/input` |
| `@/components/ui/select` | `@/components/primitives/select` via new `AttendanceMonthSelect` |
| `@/components/ui/table` | Semantic `<table>` with token utility classes |
| `@/components/ui/badge` | New `AttendanceStatusLabel` (word + color, no filled pill) |
| `@/components/ui/sheet` | `@/components/primitives/sheet` (+ new `bottom` side variant) |
| `lucide-react` icons | Iconoir equivalents (`NavArrowLeft`, `NavArrowRight`, `Search`) |
| `@/components/misc/back-button` | Inline back link (see Section 1) |

**Shared infra (keep):** `PageContainer`, `structured-skeletons`, `makeGetRequest` / `fetchEntity`.

### New files

| File | Purpose |
|------|---------|
| `src/helpers/attendance-dashboard.ts` | Month default, highlight date resolution, course month clamping |
| `src/components/attendance/attendance-month-select.tsx` | Month picker on primitive Select |
| `src/components/attendance/attendance-status-label.tsx` | Status word + semantic color |
| `src/components/attendance/attendance-matrix-table.tsx` | Desktop matrix + mobile list + sheet detail |
| `src/components/attendance/attendance-dashboard-toolbar.tsx` | Search, month select, mark CTA |

### Sheet bottom variant

`src/components/primitives/sheet.tsx` currently supports `left` and `right` only. Add `bottom` side for mobile student session detail:

- Fixed to bottom, full width, `max-h-[85vh]`, rounded top corners.
- Same motion tokens as existing sides (`duration-normal`, `ease-out-soft`).
- Used only by attendance matrix mobile detail in this change; reusable by future surfaces.

---

## Section 3: Month default and URL state

### URL param

Keep existing `dateRange` query param (nuqs):

| Value | API call | Meaning |
|-------|----------|---------|
| `YYYY-MM-01` | `…/monthly-attendance/:id/YYYY-MM-01` | Single month |
| `all` | `…/monthly-attendance/:id/all` | All months |

### Default when param absent

On first load (no `dateRange` in URL), set month to `resolveDefaultMonth(course)`:

```ts
function resolveDefaultMonth(course: courseType, today = new Date()): string {
  const start = course.start_date ? new Date(course.start_date) : null;
  const end = course.end_date ? new Date(course.end_date) : null;
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-based

  if (start && today < start) {
    return formatMonthAnchor(start); // YYYY-MM-01
  }
  if (end && today > end) {
    return formatMonthAnchor(end);
  }
  return formatMonthAnchor(today);
}
```

Do **not** default to `all`. Users choose **All months** explicitly from the picker.

### Month picker UI

`AttendanceMonthSelect` built on primitive `Select`:

- First item: `{ value: "all", label: "All months" }`.
- Then months grouped by year (year as non-interactive label rows or section headings in the popup).
- Month values: first day of month as `YYYY-MM-01` (matches existing API).
- Options derived from course `start_date`–`end_date` (same range logic as today’s `getDates()`).

---

## Section 4: Column highlight

### When to highlight

All must be true:

1. Displayed scope is a **single month** (`dateRange !== "all"`).
2. That month is the **current calendar month** (same year and month as today in local time).
3. `resolveHighlightSessionDate(sessionDates, today)` returns a date string.

### Anchor resolution

Add to `src/helpers/attendance-dashboard.ts`:

```ts
function resolveHighlightSessionDate(
  sessionDateHeaders: string[], // ISO date strings from matrix header row
  todayYmd = getTodayYmd(),
): string | null
```

Algorithm (aligned with `getPreferredEventIndex`):

1. If `todayYmd` is in `sessionDateHeaders`, return `todayYmd`.
2. Else return the **latest** date in `sessionDateHeaders` where `date <= todayYmd`.
3. If none (today is before the first class of the month), return `null`.

### Visual treatment

For the matching column index:

- **Header cell:** `bg-brand/10`, date label `text-text-primary`.
- **Body cells:** same column tint `bg-brand/8`.
- Optional caption under date header: `Today` when anchor equals today; omit otherwise (no “Latest” label — tint alone is sufficient).

Sticky student-name column styling unchanged.

### Scroll into view

On mount and when `dateRange` changes to the current month, scroll the highlighted column header into view:

```ts
columnRef.current?.scrollIntoView({
  inline: "center",
  block: "nearest",
  behavior: prefersReducedMotion ? "auto" : "smooth",
});
```

No highlight when viewing past/future months or **All months**.

---

## Section 5: Matrix table and status labels

### Table typography (DESIGN.md §9)

- Minimum row height: **52px** (`min-h-[52px]` on `tr` or `td`).
- Numeric columns (Total, %): `font-mono tabular-nums`.
- Date headers: `text-xs uppercase tracking-wide` — **Latin only**; student name column is not uppercased.
- Borders: `border-border-subtle` between cells; prefer subtle dividers over heavy chrome.

### Status labels

Replace gray Badge pills with `AttendanceStatusLabel`:

| Status | Token |
|--------|-------|
| `present` | `text-success` |
| `late` | `text-warning` |
| `absent` | `text-danger` |
| `unregistered` | `text-text-muted` |

Render as capitalized word with optional leading dot (`●`) in the same color. **No filled background.**

### Desktop matrix

- Sticky first column (student name) with `border-r border-border-subtle` and elevated surface background.
- Horizontal scroll for date columns inside `overflow-x-auto` container.
- Student names: `font-medium text-text-primary`.

### Mobile

- Hide wide matrix below `md` breakpoint.
- Show vertical list of tappable student rows (border-subtle dividers, **not** cards).
- Row shows name + `{total} sessions · {pct}%` + Iconoir `NavArrowRight`.
- Tap opens bottom `Sheet` with session list (date label + `AttendanceStatusLabel` per session).

---

## Section 6: Search

Keep client-side debounced filter on student name (first column). Behavior unchanged:

- Empty search → show full matrix.
- Header row always preserved when filtering.

Search input: primitive `Input` with Iconoir `Search` icon (pattern from `AcademicHubToolbar`).

---

## Section 7: Loading, empty, and error states

### Loading

Replace single Skeleton block with `TableSkeleton` + toolbar placeholders from `structured-skeletons`.

### Empty (no timeslots / no data)

Use `<EmptyCopy />` with an appropriate preset (add preset if none fits: “No sessions yet” + link to course schedule/timeslots). Pair with sans recovery action per DESIGN.md §6.3.

### Error

Inline alert text: `text-danger text-sm`, role=`alert`. Copy: “Failed to load attendance. Please try again.”

---

## Section 8: Motion

Import from `@/lib/sj/motion.ts`:

- **Month change:** wrap matrix in `AnimatePresence` + `crossfade` keyed by `dateRange`.
- **Mobile sheet:** `popIn` on open.
- Respect `useReducedMotion()` — opacity-only fallback, no slide/scale.

---

## Section 9: Data flow

Unchanged backend contract. Frontend still:

1. `fetchEntity("courses", id)` for course metadata and month option range.
2. `makeGetRequest(\`attendances/monthly-attendance/${id}/${dateRange}\`, { size: -1 })` for 2D string matrix.
3. Parse header row: `[Student Name, Total, %, …event dates]`.
4. Body rows: student name + totals + status strings per session.

No API changes required.

---

## Section 10: Testing

### Unit tests (`attendance-dashboard.test.ts`)

- `resolveDefaultMonth` — today in range, before start, after end, missing dates.
- `resolveHighlightSessionDate` — today is session, weekend fallback to Friday, no past session in month returns null, empty headers.

### Manual test plan

1. Open dashboard for active course → lands on current month, not All.
2. Today column highlighted (or closest past session); column scrolled into view on wide table.
3. Switch to previous month → no highlight.
4. Select All months → no highlight, all sessions visible.
5. Search filters students; clearing restores full list.
6. Mobile: tap student → bottom sheet with sessions and colored statuses.
7. Mark attendance button navigates to marking/today.
8. Dark mode: tokens readable, highlight tint visible but subtle.

---

## File change summary

| Action | Path |
|--------|------|
| Rewrite | `src/app/(internal)/courses/[id]/attendance/page.tsx` |
| Add | `src/helpers/attendance-dashboard.ts` |
| Add | `src/helpers/attendance-dashboard.test.ts` |
| Add | `src/components/attendance/attendance-month-select.tsx` |
| Add | `src/components/attendance/attendance-status-label.tsx` |
| Add | `src/components/attendance/attendance-matrix-table.tsx` |
| Add | `src/components/attendance/attendance-dashboard-toolbar.tsx` |
| Extend | `src/components/primitives/sheet.tsx` (bottom side) |
| Deprecate / remove usage | `src/components/attendance/report-table.tsx` (remove import from page; delete if fully unused) |
