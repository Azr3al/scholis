# Course Record — UI Fixes + Overview Inline Edit — Design Spec

> Fix four shipped regressions on the course record shell (find-page overlap, rail navigation, duplicate status, hidden staff menu) and introduce an Overview inline-edit slice for core course metadata.

**Status:** Design approved (brainstorming 2026-06-24).
**Authority:** [`DESIGN.md`](../../../DESIGN.md).
**Predecessors:**
- Course record shell — `2026-06-24-course-record-shell-design.md`
- Find a page — `2026-06-23-find-page-navigation-design.md`
- User record inline edit — `2026-06-21-user-record-inline-design.md`

---

## 1. Context

The course record shell shipped with persistent context rail, identity strip, and panel-header overflow. Four UI issues were reported on `/courses/[id]/**`:

1. **Find a page** — the fixed, panel-centered Dynamic Island overlaps long breadcrumbs (`Academic Hub / {title} / Overview`).
2. **Context rail navigation** — left-click on section links does not navigate; middle-click opens the correct URL in a new tab (hrefs are valid; client-side routing is broken).
3. **Duplicate status** — “Active” appears in both `CourseRecordHeader` (green text) and legacy `CourseHeader` (`StatusBadge` + `CourseStatusActions`).
4. **Hidden staff menu** — icon-only `⋯` in the panel header action cluster is easy to miss.

Separately, the course shell spec deferred inline editing. This pass adds an **Overview inline-edit slice** (scope B): core metadata editable in the identity strip without removing `/courses/[id]/edit`.

---

## 2. Goals & non-goals

### Goals

1. **No breadcrumb overlap** on course record routes.
2. **Reliable rail navigation** — left-click, middle-click, and keyboard activation all work.
3. **Single status surface** on Overview — status badge + staff actions live in the identity strip only.
4. **Discoverable staff tools** — promoted **Edit course** button + labeled **Course actions** menu.
5. **Overview inline-edit foundation** — title, description (editable); schedule hint (read-only); status (staff mutations); reuse user-record autosave patterns.
6. **Shrink legacy `CourseHeader`** — remove duplicated title/description/status; keep domain blocks (Zoom, category, dates, etc.).

### Non-goals

- Moving find-page trigger into `PanelHeader` globally (deferred; course routes use record-route exception instead).
- Removing `/courses/[id]/edit` or inline-editing all edit-tab fields.
- Inline-editing category, dates, recurrence, or members on Overview.
- Reskinning non-Overview hub sections or sub-route bodies.
- Backend API changes.

---

## 3. Locked decisions

| # | Issue | Decision |
| --- | --- | --- |
| 1 | Find a page overlap | **C — Record-route exception:** hide find-page closed-state UI on all `/courses/[id]/**` routes |
| 2 | Rail left-click | **A — Fix shell registration + link tree** (stable `useContextRail`; plain `<Link>` nav rows) |
| 3 | Status + inline edit | **B — Overview inline-edit slice** in identity strip; dedupe legacy `CourseHeader` |
| 4 | Staff menu | **A + promote Edit:** visible **Edit course** button when permitted + labeled **Course actions** menu for remaining overflow items |
| 5 | Find-page keyboard | **⌘K / Ctrl+K still opens** the palette on course record routes (only the visible dock/trigger/skirt is hidden) |
| 6 | Edit route | **`/courses/[id]/edit` stays** for full course editing |

---

## 4. Find a page — record-route exception

### 4.1 Problem

`FindPageDialog` renders a fixed trigger at `panelRect.centerX`, overlapping the breadcrumb on record routes with long course titles.

### 4.2 Behavior

On any route where the course context rail is active (`recordMode === true` **and** pathname matches `/courses/[id]/**`):

| Affordance | Visible? |
| --- | --- |
| Closed-state island / “find a page” trigger | **No** |
| Notch skirt (shoulder grooves) | **No** |
| Tips link beside trigger | **No** |
| ⌘K / Ctrl+K palette | **Yes** |
| Open palette (when invoked via keyboard) | **Yes** — existing dialog + backdrop |

On all other `(internal)` routes, find-page UI is unchanged (centered island remains).

### 4.3 Implementation notes

- Gate in `FindPageDialog` (or `FindPageProvider`) using `useSidebar().recordMode` + pathname prefix `/courses/` with valid course id segment, **or** a small helper `isCourseRecordRoute(pathname)`.
- Do **not** unmount `FindPageProvider` on course routes — keyboard handler and palette must remain.
- Breadcrumb row regains full width on course routes; no layout padding hack required.

### 4.4 Future follow-up (out of scope)

Relocate find-page trigger into `PanelHeader` per `2026-06-23-find-page-navigation-design.md` §4.1 — would remove the need for this exception globally.

---

## 5. Context rail navigation fix

### 5.1 Problem

Middle-click on rail `<Link>` hrefs works; left-click does not navigate. Hrefs from `courseRecordHref()` are correct.

### 5.2 Root cause (working theory)

1. **`useContextRail(rail, parent)`** passes `rail` as a `ReactNode` in the `useEffect` dependency array. The layout’s `useMemo` recreates the element when `pathname`, `course`, or other deps change → `setContextRail` fires on many renders → rail remount/race during click handling.
2. **Per-item `motion.div` wrappers** around each `<Link>` may interfere with click delivery during/after stagger animation.

### 5.3 Fix

**A. Stabilize context rail registration**

Refactor `useContextRail` so the effect does **not** depend on an unstable `ReactNode` reference. Acceptable patterns (pick one in implementation):

- Register a **component + props** tuple: `{ parent, Rail: CourseSectionRail, props: { courseId, … } }` and render `<Rail {...props} />` in `app-shell.tsx`.
- Or register via **render callback** stored in a ref; effect depends only on `parent` + stable serializable props.

Goal: pathname/course updates re-render rail **in place** without unregister/register cycles.

**B. Simplify clickable nav rows**

In `CourseSectionRail`:

- Keep stagger animation on the **container** (`motion.nav` or outer `motion.div`).
- Nav items are plain Next.js `<Link>` elements — no `motion.div` per row.
- Retain `playClick()` on click when navigating to a non-active href; do not call `preventDefault`.

**C. Verification**

- Left-click Overview → Schedule → Members navigates and updates URL + content.
- Middle-click and “Open in new tab” still work.
- Active rail highlight updates with pathname.
- No visible rail flash/remount on navigation.

---

## 6. Overview identity strip + inline edit (scope B)

### 6.1 Replace `CourseRecordHeader`

Evolve `CourseRecordHeader` into **`CourseRecordIdentityStrip`** (same mount point in `CourseHubRouteShell` on hub routes).

| Field | All viewers | Editors (`canEditCourse`) | Commit |
| --- | --- | --- | --- |
| Program breadcrumb + chips | Read-only (existing `CourseIdentityBlock` hierarchy) | — | — |
| **Title** | Fraunces display | Click-to-edit inline input | Blur autosave via course PATCH |
| **Schedule hint** | Read-only (`formatCourseSchedulePattern`) | — | — |
| **Description** | Plain text or em dash | Click-to-edit textarea | Blur autosave |
| **Status** | Status pill (label + color) | Staff with `canManageCourseStatus`: **Pause / End / Reactivate** controls inline | Existing pause/resume/end/reactivate mutations |

**Remove** the standalone green status text line from the current header — status is **only** the pill + action controls.

### 6.2 Lift status actions

Move `CourseStatusActions` (and its dialogs/mutations) from `course-header.tsx` into the identity strip (new file e.g. `course-record-status-actions.tsx`). One status surface; no duplicate badge row in the card below.

### 6.3 Inline-edit implementation

Reuse user-record patterns where applicable:

- `useAutosaveForm` + `InlineField` (or a thin `CourseInlineField` wrapper) for **title** and **description**.
- Field save states: saving / saved / error per `autosave-core`.
- Permissions: non-editors see read-only text with no edit affordance (no pencil, no focus ring).
- Invalidate `["getCourse", courseId, …]` on successful save (same as existing course mutations).

**Title editing:** single-line; preserve Fraunces typography in display mode.

**Description editing:** multi-line textarea; `max-w-3xl` readable width in display mode.

### 6.4 Shrink legacy `CourseHeader`

In `CourseRecordOverview`, after identity strip handles metadata:

**Remove from `CourseHeader` render:**
- Top `StatusBadge` + `CourseStatusActions` row
- Duplicate title/description blocks if they repeat identity strip content

**Keep in `CourseHeader`:**
- Category chip + link
- Zoom meeting section
- Start/end dates, created-by footer
- Any other domain-specific cards (recurrence summary, etc.)

Long-term the card wrapper may go away; this pass only removes duplicated chrome.

### 6.5 Non-goals (this pass)

- Inline edit for category, dates, code, subject chips, or recurrence rules.
- Removing or redirecting `/courses/[id]/edit`.
- Inline edit on non-Overview hub routes (Schedule, Members, etc.).

---

## 7. Staff actions discoverability

### 7.1 Panel header actions (`CourseRecordHeaderActions`)

Order left → right within the course actions cluster:

```
[ Join code (staff) ] [ Edit course (staff, promoted) ] [ Course actions ▾ ] … global icons
```

| Control | When shown | Behavior |
| --- | --- | --- |
| **Join code** | `canAccessCourseStaffActions` | Unchanged |
| **Edit course** | `permissionsFor(user).can("course.update")` | **Visible button** — navigates to `/courses/[id]/edit` |
| **Course actions** | Overflow menu has ≥1 item after exclusions | **Labeled** ghost/secondary button (not icon-only); opens existing grouped menu |

### 7.2 Menu contents

Source: `getDropdownMenuItems(user, course, tenant)`.

**Exclude from menu** (already elsewhere):

- Rail entries: `attendance`, `checkin-history`, `meeting-attendance`, `grading`
- **Promoted Edit:** exclude `edit` href (the visible Edit course button replaces it)

All other groups/separators unchanged.

### 7.3 Copy & a11y

- Trigger label: **“Course actions”** (visible text on `md+`; on narrow widths may shorten to “Actions” with same `aria-label="Course actions"`).
- Edit button label: **“Edit course”**.
- Icons: Iconoir (`EditPencil` for Edit, `MoreHoriz` or chevron on menu — optional icon beside label).

---

## 8. Architecture & files (expected touch points)

| Area | Files |
| --- | --- |
| Find-page gate | `find-page-dialog.tsx`, possibly `find-page-provider.tsx`; helper in `lib/` or `config/` |
| Context rail | `use-context-rail.ts`, `app-shell.tsx`, `course-section-rail.tsx`, `courses/[id]/layout.tsx` |
| Identity + inline edit | `course-record-header.tsx` → `course-record-identity-strip.tsx`, new `course-record-status-actions.tsx`, `course-record-overview.tsx`, `course-header.tsx` (dedupe) |
| Staff actions | `course-record-header-actions.tsx`, `course-overflow-menu-items.tsx` |
| Shared inline | Reuse `hooks/use-autosave-form.ts`, `components/record/inline/*` or thin course wrappers |

---

## 9. Error handling & testing

### Error handling

- Autosave failures: toast + inline field error state; do not lose user input.
- Status mutations: existing toast/error behavior from `CourseStatusActions`.
- Rail navigation: no user-visible error path; must work silently on every click.

### Testing

**Manual**

- Course Overview: breadcrumb fully readable; no find-page dock visible; ⌘K opens palette.
- Rail: click every visible section; URL and body change.
- Overview: edit title/description as staff; read-only as student; single status control.
- Header: Edit course button visible for staff with permission; Course actions menu excludes Edit; join code still works.

**Automated (where cheap)**

- Unit test for `isCourseRecordRoute` (or equivalent) if extracted.
- Existing `course-record-nav.test.ts` unchanged unless href helpers move.

---

## 10. Success criteria

1. Breadcrumb on course routes is never covered by find-page chrome.
2. Rail section links navigate on left-click reliably.
3. Overview shows status exactly once, with staff actions integrated in the identity strip.
4. Staff users see **Edit course** and **Course actions** without hunting for a `⋯` icon.
5. Title and description inline-edit with blur autosave for permitted editors.

---

## 11. Relationship to prior specs

- **Supersedes** (for these four issues only) the implicit “always show find-page dock” behavior from `2026-06-23-find-page-navigation-design.md` on course record routes.
- **Extends** `2026-06-24-course-record-shell-design.md` §non-goals — inline editing on Overview core fields is now in scope; full edit-page removal remains deferred.
- **Aligns with** user record inline patterns from `2026-06-21-user-record-inline-design.md` without matching full record scope.
