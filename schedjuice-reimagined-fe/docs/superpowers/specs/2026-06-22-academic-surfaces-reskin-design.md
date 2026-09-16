# Academic Surfaces Reskin — Design Spec

> Unify course identity rendering across User Record Academic, Academic Hub, and the global calendar. Remove misplaced handwriting accents. Reskin week/month calendar event boxes with `.sj-root` tokens.

**Status:** Approved (brainstorming 2026-06-22)
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — palette, type §6, layout §9, motion §12, banned list §14
**Amends:** [`2026-06-22-user-record-academic-design.md`](2026-06-22-user-record-academic-design.md) — §5.3 shared-course signal, §5.4 agenda label, §5.5 empty state, §6 schedule event styling
**Hub DNA:** [`2026-05-22-academic-hub-design.md`](2026-05-22-academic-hub-design.md) §8 (course card v2 identity hierarchy)
**Date:** 2026-06-22

---

## 1. Problem

Three related surfaces shipped with the User Record Academic redesign but read generic and off-brand:

1. **Handwriting overuse.** `font-hand text-hand text-brand` appears on every shared course row, every shared agenda row, and the no-enrollment empty state. `DESIGN.md` §6.3 limits Schedjuice Hand to **3–5 moments per surface** and forbids it in nav, tables, and repeated UI chrome. At record density the `--text-hand` clamp (1.25–1.75rem) makes inline "Your class" labels loud and decorative — they fight the quiet classroom feel.

2. **Record course rows look generic.** `RecordCourseRow` is a single bordered `divide-y` stack with mono breadcrumb and minimal meta. It lacks the program-centered identity hierarchy from Academic Hub card v2 (subject chips, schedule prominence, teacher line). Reads like a default shadcn list.

3. **Calendar event boxes are legacy shadcn.** `WeekView` renders events as `bg-muted/60 border-border rounded-md text-xs` pills inside a shadcn `Card rounded-2xl`. Week view **ignores `renderEvent`** from calendar context, so shared-course highlighting and custom event rendering only work in month view. Event positioning and truncation are poor on short and multi-hour blocks.

---

## 2. Goals

1. **Extract `CourseIdentityBlock`** — one composable identity renderer with density variants consumed by Hub card, record rows, and calendar defaults.
2. **Remove all handwriting** from User Record Academic surfaces (course rows, agenda, empty states). Shared-course signal uses structural tokens only.
3. **Upgrade `RecordCourseRow`** to Hub card v2 hierarchy at record list density — individual elevated rows, not a generic stacked box.
4. **Reskin calendar event boxes globally** — week view and month cells use semantic `.sj-root` tokens; week view respects `renderEvent`.
5. **Refactor `AcademicHubCourseCard`** to consume `CourseIdentityBlock` (`variant="hub"`) — no visual regression on `/courses`.

### Non-goals

- Backend API changes.
- Replacing the calendar component architecture (overlap clustering, view switching, edit mode).
- Redesigning `/courses/[id]` overview.
- Migrating legacy `src/components/course/course-card.tsx` consumers.
- New calendar views or Myanmar calendar integration.
- shadcn → Base UI primitive migration beyond touched calendar chrome.

---

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Approach | **C — shared `CourseIdentityBlock` primitive** with variants |
| Handwriting on "Your class" / "Teaching" | **Removed entirely** from Academic surfaces |
| Shared-course label (record rows only) | Sans pill: `Teaching` — `text-xs font-medium text-brand-strong bg-brand/10 rounded-full px-2 py-0.5` |
| Shared-course structural signal | `border-l-2 border-brand` on rows and calendar events |
| Record layout | **Typography-first list** — individual rows, not card grid (`DESIGN.md` §9) |
| Agenda shared courses | Left accent only — **no text label** |
| Empty state (no enrollments) | Plain sans: `"Not enrolled in any classes yet."` — no handwriting |
| Calendar scope | **Global** — `WeekView`, `DayBox`, and calendar shell reskin applies everywhere `Calendar` is used |
| Week view + `renderEvent` | **Required** — call context `renderEvent` when provided; fall back to default slot |
| Event typography | Sans title + mono tabular times — **never** hand or serif inside event blocks |
| Hub card | Refactor to consume shared primitive — **no intentional visual change** on `/courses` |

---

## 4. Architecture

```
src/components/course-identity/
  course-identity-block.tsx    ← shared UI primitive
  course-identity-types.ts     ← shared prop shapes
  subject-chips.tsx            ← chip row (max N by variant)

src/helpers/course-identity/
  breadcrumb.ts                ← move from record-academic/course-identity.ts
  schedule-pattern.ts
  subject-chips.ts             ← chip selection logic (mirrors hub card rules)
  index.ts
```

Existing `src/helpers/record-academic/course-identity.ts` re-exports from `src/helpers/course-identity/` for backward compatibility.

### Variant matrix

| Variant | Breadcrumb | Title | Code | Subject chips | Schedule | Teacher / role | Status | Shared pill |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hub` | yes | yes (semibold) | yes (mono) | max 3 | yes + weeks | yes (primary teacher, counts) | StatusBadge | no |
| `record` | yes | yes (serif lg) | inline in meta | max 2 | yes | assigned role in meta | word + color | Teaching pill |
| `calendar-event` | no | yes (sans xs medium) | no | no | time range only (mono) | no | no | no (wrapper handles tint) |

---

## 5. Handwriting removal

Remove `font-hand text-hand text-brand` from:

| File | Current use | After |
| --- | --- | --- |
| `record-course-row.tsx` | "Your class" inline label | `Teaching` sans pill (§6) |
| `record-this-week-agenda.tsx` | "Your class" on link | Remove label; optional `border-l-2 border-brand pl-2` on `<li>` when shared |
| `record-course-list.tsx` | Empty state callout | Plain `text-sm text-text-secondary` |

Update [`2026-06-22-user-record-academic-design.md`](2026-06-22-user-record-academic-design.md) locked decisions row for shared-course signal to reference this spec.

---

## 6. Record course rows

### 6.1 Layout

Replace the single `divide-y rounded-lg border` container with **stacked individual rows**:

```
┌─ border-l-brand ─────────────────────────────────────┐
│  ACCA · Year 1 · Sec A    [Teaching]          Active │
│  Algebra II — Term 1                                 │
│  [F1] [Maths]                                        │
│  Mon Wed · 14:00–16:00 · Student                     │
│                              Next: Wed 14:00 →       │
└──────────────────────────────────────────────────────┘
   ↑ gap-2 between rows, each row is surface-elevated
```

### 6.2 Row tokens

| Element | Style |
| --- | --- |
| Row container | `rounded-lg border border-border-strong bg-surface-elevated px-3 py-4 transition-colors hover:bg-surface-hover` |
| Shared row | Add `border-l-2 border-brand pl-4` |
| Breadcrumb | `text-xs text-text-muted` (sans) |
| Teaching pill | `text-xs font-medium text-brand-strong bg-brand/10 rounded-full px-2 py-0.5 shrink-0` — only when `isShared` |
| Title | `font-serif text-lg text-text-primary group-hover:text-accent` |
| Subject chips | Reuse `SubjectChips` — max 2 visible, `+N` overflow |
| Meta line | `text-sm text-text-muted` — `{code} · {role} · {schedule}` when present |
| Status | `text-xs font-medium` + semantic color (`text-success` for active/planned, `text-text-muted` for ended) |
| Next session | `text-sm text-text-secondary text-right` — omit when unknown |
| List wrapper | `flex flex-col gap-2` — motion `staggerList` / `staggerItem` unchanged |

### 6.3 Data

`RecordCourseRowData` gains optional fields for subject chips (when available on enrollment expand):

- `subject?: { name: string } | null`
- `course_subjects?: { subject: { id: number; name: string } }[]`
- `program?: { subject_strategy?: string } | null`

If subject data is absent on the current API expand, chips are omitted — no new fetch. Extend user page / list expand in the same PR only if fields are already available on `user_courses.course` without backend change.

---

## 7. This-week agenda

| Element | Style |
| --- | --- |
| Row | `flex … px-3 py-2.5 text-sm border-b border-border last:border-0` inside `rounded-lg border border-border-strong bg-surface-elevated` |
| Shared row | `border-l-2 border-brand pl-4` on `<li>` — no text label |
| Time | `text-text-secondary font-mono tabular-nums text-xs` |
| Course link | `font-medium text-text-primary hover:text-accent truncate` |

Remove handwriting label entirely.

---

## 8. Global calendar reskin

### 8.1 Week view event blocks

**File:** `src/components/calendar/week-view.tsx`

| Concern | Implementation |
| --- | --- |
| `renderEvent` | Read from `useCalendar()`. When provided, render inside event button; else default slot via `CalendarEventSlot` helper |
| Default slot | Title (sans `text-xs font-medium text-text-primary truncate`) + time (mono `text-[11px] text-text-muted tabular-nums truncate`) |
| Event button | `absolute rounded-md border border-border-strong bg-surface-elevated px-1.5 py-1 text-left shadow-xs transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring` |
| Session accent | `border-l-[3px] border-l-accent` on non-assignment events |
| Short events (< 30 min) | `min-height: 1.75rem`; hide time line when height < 2rem (title only; full detail in click dialog) |
| Overlap "+N more" chip | `bg-surface-elevated border border-dashed border-border-strong text-text-muted hover:text-text-primary` |

Positioning logic (`top: start * 4rem`, `height: duration * 4rem`) unchanged — only chrome and content rendering change.

### 8.2 Month view cells

**File:** `src/components/calendar/day-box.tsx`

Align default (non-`renderEvent`) cell styling with week tokens:

- `bg-surface-elevated border border-border-strong rounded-md px-1.5 py-1 text-xs`
- Assignment type colors preserved but mapped to semantic tokens where touched (`bg-warning/20`, `bg-success/20`, etc.)
- Do not break assignment color coding in edit/selection modes

When `renderEvent` is provided, outer cell keeps neutral chrome; inner content from caller.

### 8.3 Calendar shell

**File:** `src/components/calendar/calendar.tsx`

Add prop `embedded?: boolean` (default `false`).

When `embedded === true` OR ancestor has `.sj-root` (detect via optional prop `useSjChrome?: boolean` passed from `UserCalendar` / record schedule):

- Replace shadcn `Card rounded-2xl py-6` with flat `rounded-lg border border-border-strong bg-surface`
- Header padding uses `text-text-primary` / `text-text-muted` tokens
- Empty state: plain sans, no handwriting

`UserCalendar` accepts `embedded?: boolean` and forwards to `Calendar`.

Record Academic Schedule passes `embedded`.

Non-`.sj-root` consumers (legacy course edit flows inside `.sj-content-reset`) keep existing Card chrome unless explicitly opted in — **default behavior unchanged outside `.sj-root`**.

### 8.4 Shared-course event tint (record context)

**File:** `record-academic-schedule.tsx`

Existing wrapper adds `border-l-2 border-brand pl-2` around `renderCalendarEvent` output. Extend to apply on week view blocks by passing shared-course metadata through `renderEvent` wrapper:

- Wrapper applies `bg-brand/8 rounded-md` on the outer event container when `isShared`
- Remove redundant inner border when week view block already has left accent — wrapper adds tint only

### 8.5 `CalendarEventSlot` helper

**New file:** `src/components/calendar/calendar-event-slot.tsx`

Default event content renderer used by week view and as documentation reference for custom `renderEvent` implementations:

```tsx
type Props = {
  title: string;
  timeFrom?: string;
  timeTo?: string;
  compact?: boolean; // short events — title only
};
```

Uses sans + mono per §8.1. No serif, no hand.

---

## 9. Hub card refactor

**File:** `src/components/academic-hub/course-card.tsx`

Replace inline breadcrumb, title, code, subject chip, and schedule sections with:

```tsx
<CourseIdentityBlock variant="hub" course={course} … />
```

Preserve:

- Card shell, hover shadow, `RandomPatternImage` gradient (if present)
- StatusBadge placement
- Primary teacher line, student counts, intake right-align
- Filter chip interactivity on breadcrumb/subject clicks
- `Matched outside [active]` pill

Visual parity is required — refactor is structural, not a redesign of `/courses`.

---

## 10. Files touched (expected)

| Action | Path |
| --- | --- |
| Create | `src/components/course-identity/course-identity-block.tsx` |
| Create | `src/components/course-identity/subject-chips.tsx` |
| Create | `src/components/course-identity/course-identity-types.ts` |
| Create | `src/helpers/course-identity/` (move + extend helpers) |
| Create | `src/components/calendar/calendar-event-slot.tsx` |
| Modify | `src/components/record/academic/record-course-row.tsx` |
| Modify | `src/components/record/academic/record-course-list.tsx` |
| Modify | `src/components/record/academic/record-this-week-agenda.tsx` |
| Modify | `src/components/record/academic/record-academic-schedule.tsx` |
| Modify | `src/components/calendar/week-view.tsx` |
| Modify | `src/components/calendar/day-box.tsx` |
| Modify | `src/components/calendar/calendar.tsx` |
| Modify | `src/components/calendar/calendars/user-calendar.tsx` |
| Modify | `src/components/academic-hub/course-card.tsx` |
| Modify | `src/helpers/record-academic/course-identity.ts` (re-export shim) |
| Test | `src/helpers/course-identity/*.test.ts` (move existing tests) |
| Test | `src/components/course-identity/course-identity-block.test.tsx` (chip truncation) |
| Amend | `docs/superpowers/specs/2026-06-22-user-record-academic-design.md` (handwriting rows) |

---

## 11. Testing

### Unit

- `buildCourseBreadcrumb`, `formatCourseSchedulePattern`, `courseStatusLabel` — existing tests move to `src/helpers/course-identity/`
- Subject chip selection: `required`, `multi` (truncate at variant max), `optional`, `none`
- `CalendarEventSlot`: renders title; omits time when `compact`

### Manual

1. **Teacher → student record → Courses pane:** shared rows show brand left rule + `Teaching` pill; no handwriting anywhere; rows are individual elevated cards with subject chips when data present.
2. **This week agenda:** shared sessions have left accent only; no script labels.
3. **Empty enrollment:** plain sans message.
4. **Schedule pane (week view):** events use cream/green tokens; shared courses tinted; click dialog works; `renderEvent` custom content visible in week view.
5. **Course page calendar** (non-sj): unchanged Card chrome unless inside `.sj-root`.
6. **`/courses` Academic Hub:** visual parity after Hub card refactor — screenshot diff optional.

---

## 12. Motion

Unchanged from parent spec:

- Course list: `staggerList` / `staggerItem`
- Calendar: no new motion — CSS transitions on hover only (`transition-colors`)

---

## 13. Amendment log (prior spec)

| Prior decision | Superseded by |
| --- | --- |
| Shared course: optional `--text-hand` "Your class" | Structural `border-l-brand` + `Teaching` sans pill on rows only |
| Empty state: hand-accent callout | Plain sans empty copy |
| Agenda row: optional "Your class" hand label | Left accent only |
| Schedule: `--brand` tint via renderEvent wrapper | Same, plus week view support |

---

## 14. Success criteria

1. Zero `font-hand` usage under `src/components/record/academic/`.
2. `CourseIdentityBlock` consumed by Hub card and `RecordCourseRow`.
3. Week view calls `renderEvent` when provided.
4. Calendar event blocks inside `.sj-root` use semantic surface/border tokens, not `bg-muted/60`.
5. No visual regression on `/courses` hub grid.
