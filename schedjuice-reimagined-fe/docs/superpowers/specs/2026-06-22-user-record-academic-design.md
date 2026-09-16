# User Record — Academic Section Redesign — Design Spec

> Replace the vertically stacked Academic section (courses table + calendar + history + assessments) with pane-based navigation and a typography-first course list tuned for **teachers viewing students**.

**Status:** Approved (brainstorming 2026-06-22)
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — palette, type, motion §12, layout §9, banned list §14
**Parent spec:** [`2026-06-21-user-record-inline-design.md`](2026-06-21-user-record-inline-design.md) (Academic section = §4)
**Hub DNA:** [`2026-05-22-academic-hub-design.md`](2026-05-22-academic-hub-design.md) §8 (course card v2 identity hierarchy)
**Date:** 2026-06-22

---

## 1. Problem

The Academic section (`record-academic.tsx`) stacks five full-width blocks vertically:

1. Courses (`DataTable` — title, status, role)
2. Schedule (full `UserCalendar`, month default)
3. Course history (with its own page-level `h1` chrome)
4. Assessments
5. Public profile (teachers only — out of scope for this spec's primary lens)

Pain points:

- **Navigation:** The record rail switches Overview ↔ Academic, but Academic has no sub-IA. Calendar and history are scroll targets, not destinations.
- **Wrong density:** Generic `DataTable` contradicts `DESIGN.md` §9 (typography-first, no card-stacking) and ignores program-centered identity from the Academic Hub.
- **Wrong hierarchy for primary use case:** A **teacher viewing a student** needs shared enrollments, this week's schedule, and assessment status — not a month calendar buried under a sparse table.
- **Double chrome:** `CourseHistory` renders its own `h1` inside a section that already has an `h2`.

---

## 2. Goals

1. **Pane-based Academic IA** — one focused surface at a time; URL-deep-linkable (`?section=academic&pane=courses`).
2. **Courses-first default** with **"Your classes"** filter when the viewer teaches any of the student's courses.
3. **`RecordCourseRow`** — compact, typography-first list replacing `DataTable`; hub breadcrumb identity at record density.
4. **This-week agenda** on the Courses pane (supporting zone) — not the full calendar inline.
5. **Reskin embeds** for Schedule, Assessments, and History panes — reuse data/API; strip duplicate chrome; `.sj-root` styling where touched.
6. Motion per `DESIGN.md` §12 (`crossfade` pane swaps, `staggerList` on course rows).

### Non-goals

- Backend API changes.
- Redesigning `/courses` Academic Hub (already specced/shipped separately).
- Admin-primary flows (assign courses stays a secondary action; not the default teacher path).
- Public profile editor (stays at bottom of Academic when subject is a teacher — unchanged scope from parent spec).
- Replacing the legacy `Calendar` component wholesale — wrap and configure it.
- Activity / user-log timeline.

---

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Primary viewer | **Teacher viewing a student** — drives default filters and pane priority |
| Layout model | **Sub-panes** (not master–detail split, not vertical stack) |
| URL | `?section=academic&pane=courses\|schedule\|assessments\|history`; default `pane=courses` when omitted |
| Pane switcher | Text tabs, accent underline; **no icons** on tab labels |
| Pane order | Courses · Schedule · Assessments · History |
| Course list | **`RecordCourseRow`** list — not `DataTable`, not card grid |
| Default course filter | **Your classes** when viewer has ≥1 shared teaching enrollment with subject; else all courses |
| Status filter | Chips: **Active** (default) · **All** — replaces dropdown |
| Shared course signal | Subtle `--brand` left rule + `Teaching` sans pill on record rows — **amended by** [`2026-06-22-academic-surfaces-reskin-design.md`](2026-06-22-academic-surfaces-reskin-design.md) (handwriting removed) |
| Courses pane supporting zone | **This week** agenda (next 5–7 sessions for filtered set) + link to Schedule pane |
| Schedule pane | Reuse `UserCalendar`; **default view = week**; optional "Your classes only" chip |
| History pane | Reuse `CourseHistory`; strip page chrome; **Add new** admin-only |
| Assessments pane | Reuse `UserProfileAssessments` API; reskin in `.sj-root`; strip duplicate headings |
| Assign courses | Admin/authorized action only; link stays in Courses pane header when permitted |
| Data fetching | Same endpoints as today; expand course fields as needed for breadcrumb/schedule meta |

---

## 4. Pane IA

```
Academic
├── Courses      (default) — course list + this-week strip
├── Schedule     — week-first calendar, shared-course highlight
├── Assessments  — upcoming + past (existing API)
└── History      — archival enrollments (read-only for teachers)
```

When `section !== academic`, `pane` is ignored (may remain in URL for back/forward).

When switching to `section=academic` without `pane`, default to `courses`.

---

## 5. Courses pane

### 5.1 Layout (three-zone)

| Zone | Content |
| --- | --- |
| **Dominant** | Filtered `RecordCourseRow` list |
| **Supporting** | "This week" session list (5–7 items) |
| **Quiet** | Status chips + enrollment count; "Your classes · All courses" toggle when applicable |

### 5.2 Filters

**Your classes / All courses**

- Visible only when `sharedCourseIds(viewer, subject).length > 0`.
- Default: **Your classes**.
- Filters enrollments to courses where the viewer has a teaching `assigned_as_role` (seniority populated, not `OTHER` — same rule as `countTeachingAssignmentsDistinctCourses` in `user-profile.ts`).

**Active / All**

- **Active:** `course.status ∈ { active, planned }` (matches current `getFilterParams` behavior).
- **All:** no status filter on enrollments.

### 5.3 `RecordCourseRow`

```
ACCA · Year 1 · Sec A                    Active
Algebra II — Term 1
ACCA-Y1-A-ALG-T1 · Student · Mon Wed 14:00
                              Next: Wed 14:00 →
```

| Element | Token / style |
| --- | --- |
| Breadcrumb | `--text-mono-sm`, `--text-muted`; `program · level · section` |
| Title | `--text-lg`, Schedjuice Serif; links to `/courses/{id}` |
| Meta line | `--text-sm`, `--text-muted`; code · role · schedule pattern |
| Status | Word + semantic color (`--success`, `--text-muted` for ended) — no shadcn `Badge` farm |
| Next session | Right-aligned `--text-sm`; omit when unknown |
| Shared course | `border-l-2 border-brand pl-3`; `Teaching` sans pill — see reskin spec |
| Hover | `bg-surface-hover` only — no scale |
| Motion | Parent uses `staggerList` / `staggerItem` |

Extract breadcrumb + schedule pattern helpers shared with Academic Hub where practical (`src/helpers/course-identity.ts` or reuse from hub card logic).

### 5.4 This week agenda

- Source: existing `calendarEvents` prop (already merged on user page).
- Filter to courses in the active course-list filter set.
- Sort by datetime ascending; take first 5–7 future sessions (tenant timezone via `getTenantTodayDateString`).
- Each row: weekday + time · course title (link); shared rows get left accent only (no label).
- Footer text link: **View full schedule →** sets `pane=schedule`.

### 5.5 Empty states

| Condition | Copy / action |
| --- | --- |
| No enrollments | Plain sans: "Not enrolled in any classes yet." (no handwriting) |
| Your classes empty, student has others | "Not in any of your classes." + toggle to All courses |
| Active filter empty, ended exist | "No active classes." + chip to show All |

### 5.6 Header actions

- **Assign courses** — same visibility as today (`userHasRoles(subject, [teacher, student])` + authorization); links to `/users/{id}/assign-courses`.

---

## 6. Schedule pane

- Reuse `UserCalendar` with `defaultView={CalendarView.WEEK}` and `showableViews={[WEEK, MONTH, LIST]}`.
- Optional chip **Your classes only** when shared courses exist — filters displayed events to `sharedCourseIds`.
- Shared-course events: pass `renderEvent` wrapper that adds subtle `--brand` tint on event label (reuse/extend page-level `renderCalendarEvent`).
- No duplicate section `h2` — pane tab is the title.

---

## 7. Assessments pane

- Reuse `UserProfileAssessments` (`GET users/{id}/assessments`).
- Add `embedded?: boolean` prop: when true, omit outer headings and use `.sj-root` typography tokens.
- Structure unchanged: Upcoming, then Past with course links.
- Reskin: replace shadcn `Badge`/`Button`/`Skeleton` with primitives where this file is touched (minimal scope — wrapper + class overrides acceptable for v1).

---

## 8. History pane

- Reuse `CourseHistory` with `embedded?: boolean` prop.
- When embedded: remove `h1`, subtitle count moves to quiet meta under tabs ("12 prior enrollments"); keep pagination.
- **Add new** button: `hasAdminCredentials(viewer)` only (already gated — preserve).
- Teachers see read-only list.

---

## 9. URL map

```
/users/{id}?section=academic
/users/{id}?section=academic&pane=courses          (default)
/users/{id}?section=academic&pane=schedule
/users/{id}?section=academic&pane=assessments
/users/{id}?section=academic&pane=history
```

Optional future (out of v1): `&courses=your|all` and `&status=active|all` in URL. v1 may use component state for filters; pane must be URL-backed via `nuqs`.

---

## 10. Motion

| Transition | Recipe |
| --- | --- |
| Pane switch | `crossfade` keyed on `pane` |
| Course list mount | `staggerList` + `staggerItem` on rows |
| Tab indicator | Base UI `Tabs.Indicator` (existing primitive) |
| Reduced motion | `useReducedMotion()` → opacity-only |

---

## 11. File layout

```
src/components/record/academic/
  academic-panes.ts              — pane ids, labels, validation
  use-academic-pane.ts             — nuqs ?pane=
  academic-pane-switcher.tsx       — text tabs (Base UI Tabs)
  record-course-row.tsx            — single enrollment row
  record-course-list.tsx           — filters + list query + empty states
  record-this-week-agenda.tsx      — supporting agenda strip
  record-academic-schedule.tsx     — schedule pane wrapper
  record-academic-assessments.tsx  — assessments embed wrapper
  record-academic-history.tsx      — history embed wrapper

src/helpers/record-academic/
  shared-courses.ts                — sharedCourseIds, isSharedCourse (unit-tested)

src/components/record/sections/
  record-academic.tsx              — rewritten: pane switcher + pane bodies

Modify:
  src/components/users/course-history/course-history.tsx   — embedded prop
  src/components/users/profile/user-profile-assessments.tsx — embedded prop
  src/components/calendar/calendars/user-calendar.tsx      — defaultView, showableViews props
  src/app/(internal)/users/[id]/page.tsx                   — pass viewer to RecordAcademic; optional expand fields
```

---

## 12. Data & queries

### Course list source

Replace inline `DataTable` with `searchEntities("user-courses", …)` inside `record-course-list.tsx` (or lift query from page if cleaner). Expand:

```ts
expand: ["course", "course.program", "course.level", "course.section", "assigned_as_role"]
fields: [
  "id", "course.id", "course.title", "course.code", "course.status",
  "course.weekday_pattern", "course.time_pattern",
  "course.first_event_time_from", "course.first_event_time_to",
  "course.program.name", "course.level.name", "course.section.name",
  "assigned_as_role.name",
]
```

Filter params mirror current `getFilterParams()` logic; move into a shared helper `buildUserCourseFilterParams(subjectId, courseIds, { status, sharedOnly })`.

### Shared courses

Pure function:

```ts
sharedCourseIds(viewerUserCourses, subjectUserCourses): number[]
```

Teaching assignment on viewer side uses `assignedRoleSeniorityCountsForTeachingStat`. Intersect course IDs with subject enrollments.

### Calendar events

No new query — continue using `calendarEvents` from page. Schedule pane and this-week agenda receive filtered subsets.

---

## 13. Access control

- Unchanged server enforcement.
- Assign courses: existing authorization.
- History add: admin only.
- Assessments: existing API permissions.
- "Your classes" is a client filter — does not hide enrollments the teacher isn't assigned to when toggled to All.

---

## 14. Acceptance checks

1. **Teacher → student:** Academic opens on Courses pane; "Your classes" default when overlap exists; shared rows show left rule.
2. **Pane navigation:** Tabs switch content with crossfade; URL updates; refresh restores pane; back button works.
3. **No vertical stack:** Only one pane visible; no full calendar on Courses pane (only this-week strip).
4. **Course list:** No `DataTable`; rows show breadcrumb, title, code, role, schedule hint, status word.
5. **Schedule pane:** Opens week view by default; "Your classes only" filters events when toggled.
6. **History pane:** No duplicate `h1`; pagination works; Add new admin-only.
7. **Assessments pane:** Data loads; no duplicate page title.
8. **Motion:** Pane and list entrances animate; reduced-motion respected.
9. **Lint/build:** `npm run lint`, `npm run build`, `npm run test:unit` pass.

---

## 15. Reference map

| Reference | URL | Relevant pattern |
| --- | --- | --- |
| Khan Academy Learner Home | https://www.khanacademy.org/ | Class-centric focus |
| Khan learning queue | https://support.khanacademy.org/hc/en-us/articles/38555649696397 | Active vs past separation |
| Granola | https://www.granola.ai | Calm list, warm cream |
| Readwise Reader | https://readwise.io/read | List + depth without clutter |
| Schedjuice Academic Hub | `/courses` | Course identity hierarchy |
| P2b mockup | `/components/mockups/user-record` | Section crossfade shell |

---

## 16. Follow-ups (out of scope)

- URL-backed course filters (`courses=`, `status=`).
- Per-course assessments inline on Courses pane.
- Full `.sj-root` reskin of legacy `Calendar` card chrome.
- Design mockup page update for Academic panes (`/components/mockups/user-record`).
