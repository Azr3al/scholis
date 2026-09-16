# Course Attendance Marking — DESIGN.md Reskin

## Context

The **course attendance marking page** at `/courses/[id]/attendance/marking/[eventIndex]` is where teachers mark per-student status and notes for a single class session. The route accepts a numeric event index or `today` (redirects via `getPreferredEventIndex`).

The page still uses legacy shadcn patterns (`BackButton`, `Card`-styled sticky toolbar, `UnManagedDataTable`, shadcn `Calendar`/`ToggleGroup`, Lucide icons). It does not match [`DESIGN.md`](../../../DESIGN.md) or the companion [**Course Attendance Dashboard spec**](2026-06-28-course-attendance-dashboard-design.md).

This spec reskins the marking surface via a **full primitive migration** (Approach C visually; **big-bang cutover** for implementation). Behavior already defined elsewhere (autosave, mark-all undo) is preserved.

## Goals

- Replace all shadcn/Radix UI and Lucide icons on the marking page and its attendance subcomponents with Schedjuice primitives, semantic tokens, and Iconoir.
- Restructure layout to a type-led, non-card-stacked composition per DESIGN.md §9.
- Replace shadcn `Calendar` with a new **`TeachingDayCalendar`** (custom month grid in primitive `Popover`).
- Replace `UnManagedDataTable` + column strategy with a hand-composed **`AttendanceMarkingTable`** (fixed columns).
- Reskin the sticky action bar as a **flat strip** (no card chrome); preserve mark-all + undo UX per [mark-all-present-undo spec](2026-06-27-mark-all-present-undo-design.md).
- Mobile: **stacked student rows** (not a horizontal-scroll table).
- Preserve existing API contracts, autosave, event navigation, and `today` redirect logic.

## Non-Goals

- Do not change the attendance dashboard (`/courses/[id]/attendance`) — covered by the dashboard spec.
- Do not change org-wide Attendance Overview (`/attendances/god-view`).
- Do not change mark-all undo behavior, autosave debounce, or backend endpoints.
- Do not migrate column strategy globally or keep artifact columns on this page.
- Do not add new marking features (bulk absent, filters, CSV export).
- Do not build a reusable org-wide primitive `Calendar` — scope is `TeachingDayCalendar` for this surface only.

## Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Scope | Course attendance marking page only |
| Visual approach | Full primitive migration (Approach C) |
| Implementation approach | **Big-bang cutover** — rewrite page + all subcomponents in one pass; no phased half-migrated state |
| Day picker | Custom **`TeachingDayCalendar`** — month grid in primitive `Popover` |
| Student roster | Hand-composed **`AttendanceMarkingTable`**; drop column strategy on this page |
| Sticky action bar | Flat sticky strip — mark-all, undo, present count, autosave all pinned |
| Mobile roster | Stacked rows with full-width status grid + note field |
| Visual companion | Lofi text mockups only |

---

## Section 1: Page layout

### Structure (desktop, lo-fi)

```
← Back to attendance dashboard

Mark attendance                          ← font-serif text-2xl
Wednesday, 9 April 2026                  ← text-text-secondary
4:00–6:00 PM · {course.title}           ← text-text-muted

                                [ Daily note ]   ← Button secondary, Iconoir Notes

                      Go to today (9 Apr) →      ← text link; hidden when viewing today

[ ← Previous day ]   [ Wed, 9 Apr 2026 ▾ ]   [ Next day → ]
                      TeachingDayCalendar trigger

────────────────── border-border-subtle ──────────────────

┌─ sticky action bar (flat) ──────────────────────────────────────────────┐
│ [ Mark all as present ]  Undo     Present (12/15) 80%      ● Saved     │
└─────────────────────────────────────────────────────────────────────────┘

<table> … AttendanceMarkingTable … </table>
```

### Rules

- **No Card wrapper**, no shadcn `Separator`.
- Page title: `font-serif text-2xl`; date and session metadata use sans secondary/muted tokens.
- **Back link** → `/courses/[id]/attendance` with Iconoir `NavArrowLeft` — not legacy `BackButton`.
- **Daily note** → `/courses/[id]/daily-notes/{eventId}?ref=…`; primitive `Button` `variant="secondary"`.
- **Go to today** — quiet underlined text link with Iconoir `NavArrowRight`; calls `changeCurrentEvent(todayIndex)`; destructive toast when no class today (unchanged copy).
- **Previous / next day** — primitive outline `Button` with Iconoir `NavArrowLeft` / `NavArrowRight`; uses `getAdjacentTeachingDayIndex`.
- Day navigation waits for autosave flush before route change (existing `waitForFlush`).

---

## Section 2: Primitive migration map

| Current import | Replacement |
|----------------|-------------|
| `@/components/ui/button` | `@/components/primitives/button` |
| `@/components/ui/separator` | `border-border-subtle` or `RoughDivider` |
| `@/components/ui/input` | `@/components/primitives/input` |
| `@/components/ui/calendar` + popover + select | `TeachingDayCalendar` |
| `@/components/ui/toggle-group` | Reskinned `AttendanceStatusControl` (primitive `Button` group) |
| `@/components/ui/tooltip` | `@/components/primitives/tooltip` |
| `@/components/ui/unmanaged-data-table` | `AttendanceMarkingTable` |
| `useStrategy` / artifact columns | **Removed** from marking page |
| `lucide-react` | Iconoir |
| `@/components/misc/back-button` | Inline back link |

**Preserve unchanged:**

- `useAttendanceAutosave`, `useMarkAllPresentUndo`, mark-all undo core
- `src/helpers/attendance-marking.ts` (event index, adjacent day, session labels)
- API: `fetchEntity("courses")`, `searchEntities("events")`, `fetchEntities("attendances/get-by-event/:id")`
- Route: `/courses/[id]/attendance/marking/today` → preferred index redirect

**Relationship to dashboard spec:**

- Reuse the same **semantic status color tokens** (`text-success`, `text-warning`, `text-danger`, `text-text-muted`).
- Marking uses **interactive** status controls, not read-only `AttendanceStatusLabel` from the dashboard spec.

### New / rewritten files

| File | Purpose |
|------|---------|
| `src/components/attendance/teaching-day-calendar.tsx` | Day grid popover + multi-session select |
| `src/components/attendance/attendance-marking-table.tsx` | Desktop table + mobile stacked rows |
| `src/components/attendance/attendance-marking-toolbar.tsx` | Sticky flat action bar |
| `src/components/attendance/attendance-marking-header.tsx` | Title, metadata, daily note, go-to-today, day nav row |
| Rewrite | `src/components/attendance/attendance-status-control.tsx` |
| Rewrite | `src/components/attendance/attendance-status-config.ts` (Iconoir + tokens) |
| Rewrite | `src/components/attendance/attendance-action-cell.tsx` |
| Rewrite | `src/components/attendance/attendance-note-field.tsx` |
| Rewrite | `src/components/attendance/attendance-autosave-status.tsx` |
| Rewrite | `src/components/attendance/attendance-marking-table-states.tsx` |
| Rewrite | `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` |
| Remove usage | `AttendanceDayCalendar` (delete if fully unused after cutover) |

---

## Section 3: `TeachingDayCalendar`

Replaces `AttendanceDayCalendar`. Custom month grid — **not** shadcn `Calendar`.

### Trigger (outline button)

```
MARKING ATTENDANCE FOR          ← text-xs uppercase tracking-wide text-text-muted
Wednesday, 9 April 2026         ← font-semibold text-text-primary
4:00–6:00 PM — Session 1        ← text-xs text-text-muted
```

Built on primitive `Popover.Trigger` + `Button` `variant="outline"`.

### Popover content

- Month header with prev/next month arrows (Iconoir `NavArrowLeft` / `NavArrowRight`).
- 7-column day grid (Su–Sa).
- **Teaching days** (from `isTeachingDay`) — clickable, `hover:bg-brand/10`.
- **Selected day** — `bg-brand/15 ring-1 ring-brand/30`.
- **Today** (when a teaching day) — subtle ring or dot indicator in addition to selection state.
- **Non-teaching days** — `text-text-muted/40`, not interactive.
- Bounds: `courseStartDate`–`courseEndDate` (fallback to first/last event), same as today.
- Default visible month: selected teaching day’s month.

### Multi-session days

When user picks a date with multiple events (`getEventIndicesForDate` length > 1):

- Show primitive `Select` below grid: “Multiple sessions on {date}. Choose one:”
- Options labeled via `formatSessionLabel(event)`.
- Single-session day: close popover and call `onSelectEventIndex` immediately (unchanged behavior).

### Props (unchanged intent)

Same public API as current `AttendanceDayCalendar`:

```ts
type TeachingDayCalendarProps = {
  events: eventType[];
  selectedEventIndex: number;
  onSelectEventIndex: (index: number) => void;
  courseStartDate?: string | Date | null;
  courseEndDate?: string | Date | null;
  disabled?: boolean;
};
```

---

## Section 4: Sticky action bar (`AttendanceMarkingToolbar`)

Flat sticky strip — **not** a card.

### Styles

- `sticky top-0 z-10 bg-surface-elevated border-b border-border-subtle py-3 px-1`
- No `rounded-md`, no `bg-card`, no border box around the whole roster

### Layout

**Desktop:** single row, three zones:

| Left | Center | Right |
|------|--------|-------|
| Mark all as present + Undo link | Present (n/n) pct% — `font-mono tabular-nums` | Autosave status bar |

**Mobile:** two rows

1. Mark all + Undo + present count
2. Autosave status full width

### Mark all + undo

Unchanged behavior per [mark-all-present-undo spec](2026-06-27-mark-all-present-undo-design.md):

- Undo: underlined accent text link (`text-accent`), `role="button"`, Enter key support
- Mark all disabled while undo visible or loading/empty roster
- Mark all button: outline with success border accent (`border-success`) — primitive `Button`

### Autosave bar reskin

Replace hardcoded Tailwind colors with semantic tokens:

| Status | Treatment |
|--------|-----------|
| idle | Empty spacer (`min-h-[1.25rem]`) |
| saving | `text-text-muted` + pulsing `bg-success` dot |
| saved | `text-text-muted` + `bg-success` dot + relative time |
| offline | `text-warning` |
| error | `text-danger` + primitive `Button` Retry |

---

## Section 5: `AttendanceMarkingTable`

Hand-composed; **no** `UnManagedDataTable`, **no** column strategy.

### Desktop (`md+`)

Semantic `<table>`, typography-first per DESIGN.md §9:

| Column | Content |
|--------|---------|
| Student | `user.name` — `font-medium text-text-primary` |
| Alt name | `user.alternative_name` or em dash |
| Phone | `user.phone_number` or em dash |
| Enrollment | “active student” (`text-text-muted`) or “dropped out” (`text-danger`) — no badge pill |
| Status | `AttendanceStatusControl` |
| Note | `AttendanceNoteField` |

- Min row height: **52px**
- Headers: `text-xs uppercase tracking-wide` (Latin only)
- Borders: `border-border-subtle`
- Recently changed row: `bg-brand/5` (replaces `bg-muted/40`)
- Row save indicator: reskin to tokens; keep beside status control

### Mobile (`< md`)

Stacked rows separated by `border-b border-border-subtle` — **not** cards:

```
{student name}                     {enrollment label}
{alternate name if present}
{save indicator} {status 2×2 grid}
{note input}
```

- Status control: full-width 2×2 grid with icon + label (existing mobile intent)
- Hide desktop-only columns (phone shown only if useful — optional omit on mobile)

### Data

Rows are `attendanceType[]` from existing fetch. Sort order unchanged (server order).

---

## Section 6: `AttendanceStatusControl`

Replace shadcn `ToggleGroup` with a primitive **`Button` segmented control** (single-select).

### Desktop

- Four icon-only buttons (`size-9`), labels in primitive `Tooltip`
- Selected: semantic border + tint per status (from reskinned `attendance-status-config.ts`)
- Unselected: `border-border-subtle`, hover tint matching status family
- Icons: Iconoir `Check`, `Clock`, `Xmark`, `Minus` (replace Lucide)

### Mobile

- 2×2 grid, `h-11`, icon + label visible (unchanged UX intent)

### Status token mapping

| Status | Selected |
|--------|----------|
| present | `border-success bg-success/10 text-success` |
| late | `border-warning bg-warning/10 text-warning` |
| absent | `border-danger bg-danger/10 text-danger` |
| unregistered | `border-border-strong bg-surface-muted text-text-muted` |

---

## Section 7: Supporting components

### `AttendanceNoteField`

- Primitive `Input`
- Disabled when status is `unregistered` (unchanged logic + hint text)
- Hint: `text-xs text-text-muted`

### `AttendanceActionCell`

- Composes status control + note + mobile name block + save indicator
- Used inside `AttendanceMarkingTable` for both breakpoints

### `AttendanceMarkingTableStates`

- **Error:** inline message + primitive Retry button; `text-danger` alert role
- **Loading:** structured skeleton rows (no dashed card box); optional `Loader`
- **Empty:** `<EmptyCopy />` preset — “No students to mark” + recovery hint (add preset if missing)

---

## Section 8: Motion

From `@/lib/sj/motion.ts`:

- **Session change:** `AnimatePresence` + `crossfade` on table keyed by `eventIndex`
- **TeachingDayCalendar popover:** primitive popover enter/exit (already tokenized)
- Respect `useReducedMotion()` — opacity-only fallback

No layout-shift hovers on table rows.

---

## Section 9: Data flow

Unchanged:

1. `fetchEntity("courses", id)` — course metadata for calendar bounds + header
2. `searchEntities("events", …)` — sorted session list
3. `rawEventIndex === "today"` → `router.replace(…/marking/${getPreferredEventIndex()})`
4. Invalid index → same preferred redirect
5. `fetchEntities("attendances/get-by-event/${eventId}")` — roster rows
6. Local edits → `useAttendanceAutosave` → bulk PUT (existing payload)
7. Day change → `waitForFlush(3000)` → `router.push(…/marking/${newIndex})`

No API changes required.

---

## Section 10: Big-bang implementation notes

Deliver as **one cohesive cutover** (Approach A):

1. Implement all new/rewritten components listed in Section 2.
2. Rewrite `page.tsx` to compose them; remove all `@/components/ui/*` and `useStrategy` imports from the marking route.
3. Swap `AttendanceDayCalendar` → `TeachingDayCalendar`; delete old calendar component if no other imports remain.
4. Verify no shadcn/Lucide remains under `attendance/` components used by marking or the marking page itself.
5. Manual QA pass before merge — do not land partial shadcn/primitive mix on this route.

Recommended PR checklist item: `grep` marking page tree for `@/components/ui/` and `lucide-react` → zero hits.

---

## Section 11: Testing

### Manual test plan

1. Open `/courses/[id]/attendance/marking/today` → lands on preferred session (today or closest past).
2. TeachingDayCalendar: pick teaching day, multi-session day shows session select.
3. Prev/next teaching day navigates; autosave flushes before navigation.
4. Go to today link works; hidden when already on today’s session.
5. Mark all present → undo within 5s; button disabled during window.
6. Individual status changes autosave; row flash on save.
7. Note field disabled for unregistered; enabled after status change.
8. Desktop table shows all columns; mobile shows stacked rows.
9. Sticky action bar stays visible while scrolling long roster.
10. Daily note link opens with correct `ref` param.
11. Dark mode: tokens readable; selected status buttons visible.
12. Empty roster and error states render with `EmptyCopy` / retry.

### Unit tests

No new pure helpers required beyond calendar grid utilities (optional `teaching-day-calendar.test.ts` for `isTeachingDay` click mapping if extracted). Existing tests for `attendance-marking.ts` and mark-all undo remain valid.

---

## File change summary

| Action | Path |
|--------|------|
| Rewrite | `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` |
| Add | `src/components/attendance/teaching-day-calendar.tsx` |
| Add | `src/components/attendance/attendance-marking-table.tsx` |
| Add | `src/components/attendance/attendance-marking-toolbar.tsx` |
| Add | `src/components/attendance/attendance-marking-header.tsx` |
| Rewrite | `src/components/attendance/attendance-status-control.tsx` |
| Rewrite | `src/components/attendance/attendance-status-config.ts` |
| Rewrite | `src/components/attendance/attendance-action-cell.tsx` |
| Rewrite | `src/components/attendance/attendance-note-field.tsx` |
| Rewrite | `src/components/attendance/attendance-autosave-status.tsx` |
| Rewrite | `src/components/attendance/attendance-marking-table-states.tsx` |
| Delete (if unused) | `src/components/attendance/attendance-day-calendar.tsx` |

## Related specs

- [Course Attendance Dashboard reskin](2026-06-28-course-attendance-dashboard-design.md)
- [Mark all present undo](2026-06-27-mark-all-present-undo-design.md)
