# Academic Hub — Panel header & course-page chrome — Design Spec

> Migrate Academic Hub (`/courses`) onto the Users-style panel header pattern: grouped action buttons, segmented toolbar controls, and an optional secondary toolbar row for program-adaptive filters. Establishes a reusable course-page header contract for later Course Hub migration.

**Status:** Approved (brainstorming 2026-06-23)
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — palette §5, type §6, layout §9, banned list §14
**Builds on:** [`2026-06-21-app-shell-sidebar-design.md`](2026-06-21-app-shell-sidebar-design.md) (panel header), [`2026-05-22-academic-hub-design.md`](2026-05-22-academic-hub-design.md) (filter behavior), [`2026-06-22-academic-surfaces-reskin-design.md`](2026-06-22-academic-surfaces-reskin-design.md) (course cards — no card changes here)
**Reference implementation:** Users hub — `src/components/user-hub/user-hub-page.tsx`, `user-hub-toolbar.tsx`
**Date:** 2026-06-23

---

## 1. Problem

Academic Hub still ships legacy in-page chrome:

1. **In-page title block** — `TypographyH1` + optional program subtitle + isolated "Add classes" link in `academic-hub-header.tsx`, below the app shell panel header.
2. **Stacked shadcn filter bar** — vertical rows with labeled chip groups (`ui/button`, `ui/input`, `ui/switch`) that do not match the grouped segmented controls on Users.
3. **No shared course-page contract** — Course Hub (`/courses/[id]/*`) uses its own in-layout toolbar; there is no documented slot pattern tying course surfaces to `usePageHeader`.

Users already migrated: title and actions in panel header row 1, filters in row 2 via `usePageHeader`. Academic Hub is the next course surface in the `DESIGN.md` strangler migration and should establish the pattern Course Hub will adopt later.

---

## 2. Goals

1. **Full Users-style chrome on `/courses`** — title + actions in panel header row 1; primary filters in row 2; program-adaptive filters in optional row 3.
2. **Reusable course-page header contract** — extend `PageHeaderConfig` with `toolbarSecondary` and document slot usage for future `/courses/*` routes.
3. **Primitives-only toolbar** — migrate filter controls from shadcn to `src/components/primitives/*` and Iconoir.
4. **Preserve filter behavior** — URL state (`nuqs`), program-adaptive axes, aggregate counts, my-classes preference, and search semantics unchanged.

### Non-goals

- Migrating Course Hub (`/courses/[id]/*`) in this spec — contract only.
- Grid/list view toggle (hub remains grid-only).
- Backend, URL param, or aggregate API changes.
- Course card visual or structural changes (handled by academic-surfaces-reskin).
- Extracting `useCoursePageHeader()` wrapper hook (YAGNI until a second consumer ships).
- shadcn removal from course grid pagination buttons (legacy `ui/button` may remain in page body until a later tranche).

---

## 3. Locked decisions

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Scope | **Pattern + Academic Hub** — migrate `/courses`; define contract for course routes |
| 2 | Secondary filters | **Second toolbar row** (`toolbarSecondary`) — rendered only when selected program exposes intake, subject, or category controls |
| 3 | Implementation | **Approach 1** — extend `PageHeaderConfig` + extract `ToolbarSegmentGroup` primitive; refactor User Hub to consume it |
| 4 | Title | Panel header breadcrumb: **"Academic Hub"** (`font-serif text-lg text-text-primary`) |
| 5 | Single-program subtitle | When `program_count === 1`, show program name as **muted sans subtitle inside the breadcrumb slot** below the title |
| 6 | Primary action | **"Add classes"** → `/courses/create`; same permission gate as today |
| 7 | Page body layout | Match Users padding (`px-4 pb-20 pt-4 sm:px-6 lg:px-8`); remove in-page header and filter stack |
| 8 | Route wrapper | Drop `PageContainer` from `courses/page.tsx` (align with `users/page.tsx`) |
| 9 | Intake control | Keep **select dropdown** (primitives `Select`) in secondary row — not segmented tabs (intake lists can be long) |
| 10 | Subject / category | **Horizontal scrollable toggle segments** using `ToolbarSegmentToggle` in secondary row |

---

## 4. Course-page header contract

### 4.1 Extended config type

```tsx
// src/components/shell/sidebar-context.tsx
export type PageHeaderConfig = {
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  toolbarSecondary?: ReactNode; // NEW — optional third sticky row
};
```

Registration remains via `usePageHeader(config)` (`src/components/shell/use-page-header.ts`). Config is cleared on unmount (existing behavior).

### 4.2 Slot matrix

| Slot | Academic Hub (`/courses`) | Course Hub (`/courses/[id]`) — future spec |
| --- | --- | --- |
| `breadcrumb` | "Academic Hub" + optional program subtitle | Course title; link back to `/courses` |
| `actions` | "Add classes" (`Button` primary sm) | Staff actions, status controls, overflow menu |
| `toolbar` | Program (multi), status, search, my-classes | Sub-nav tabs (Overview, Roster, …) |
| `toolbarSecondary` | Intake select, subject/category toggles | Usually **omitted** |

### 4.3 Panel header rendering

`PanelHeader` (`src/components/shell/panel-header.tsx`):

- Row 1 (existing): breadcrumb left; `actions` + notifications + fullscreen + theme right.
- Row 2 (existing): `toolbar` when non-null — `border-t`, `px-4 py-2`, `min-h-10`.
- Row 3 (**new**): `toolbarSecondary` when non-null — same chrome as row 2 (`border-t`, `px-4 py-2`). **Do not render** the row when the slot is `undefined`/`null`.

Both toolbar rows use `.sj-chrome` tokens (already inside panel header).

---

## 5. Shared primitive: `ToolbarSegmentGroup`

**New file:** `src/components/shell/toolbar-segment-group.tsx`

Extract visual chrome from `UserHubToolbar`:

```
inline-flex h-8 items-center rounded-md border border-border bg-surface p-0.5
```

### Exports

| Component | Role | ARIA |
| --- | --- | --- |
| `ToolbarSegmentGroup` | Container | `role="group"` default; pass `role="tablist"` for exclusive tabs |
| `ToolbarSegment` | Single-select segment | `role="tab"` + `aria-selected` when used in tablist; `aria-pressed` in toggle group |
| `ToolbarSegmentToggle` | Multi-select segment with optional count suffix | `aria-pressed`; used for status and subject/category filters |

### Segment styling (locked)

Active segment:

```
bg-surface-active font-medium text-text-primary
```

Inactive:

```
text-text-secondary hover:text-text-primary
```

Icon-only segments (future): `size-7` inner hit target; 16×16 Iconoir icon.

### User Hub refactor

`src/components/user-hub/user-hub-toolbar.tsx` refactors to import `ToolbarSegmentGroup` / `ToolbarSegment`. **No intentional visual or behavioral change** — regression-check Users after extraction.

---

## 6. Academic Hub — row 1 (actions)

Registered in `academic-hub-page.tsx` via `usePageHeader`:

```tsx
breadcrumb: (
  <div className="min-w-0">
    <h1 className="truncate font-serif text-lg text-text-primary">Academic Hub</h1>
    {showSingleProgramName && (
      <p className="truncate text-xs text-text-muted">{programs[0].name}</p>
    )}
  </div>
),
actions: canCreate ? (
  <Link href="/courses/create">
    <Button size="sm">Add classes</Button>
  </Link>
) : undefined,
```

Permission logic unchanged from `academic-hub-header.tsx`:

- `can("course.create")` AND
- `!isOnlyTeacher || tenant.can_teacher_create_course`

Uses `Button` from `@/components/primitives/button`.

---

## 7. Academic Hub — row 2 (`AcademicHubToolbar`)

**New file:** `src/components/academic-hub/academic-hub-toolbar.tsx`

Layout: `flex w-full flex-wrap items-center justify-between gap-3` (same as User Hub).

### Left cluster

**Program segment group** — single-select `ToolbarSegmentGroup` with `role="tablist"`:

- Segments: `All` + one per program (sorted by `sort_order`).
- Hidden when `program_count <= 1` (per hub spec §3).
- Selecting a program calls existing `filters.setProgram`.

### Right cluster

| Control | Implementation | Notes |
| --- | --- | --- |
| Search | Iconoir `Search` + primitives `Input`, `h-8`, debounce 200ms | Placeholder: `Search title, code, subject, level, section…`; clear via empty string (no separate Clear button in toolbar) |
| My classes only | primitives `Switch` + label | Hidden when user is not a teacher; uses `onSetMy` callback + localStorage preference (existing) |
| Status | `ToolbarSegmentGroup` + `ToolbarSegmentToggle` × 3 | Labels: Active, Planned, Ended; counts from `statusCounts`; multi-select with fallback to `["active"]` when all deselected (existing `StatusChips` logic) |

Status group is always visible with counts; loading shows `…` suffix (existing behavior).

---

## 8. Academic Hub — row 3 (`AcademicHubSecondaryToolbar`)

**New file:** `src/components/academic-hub/academic-hub-secondary-toolbar.tsx`

Rendered as `toolbarSecondary` **only when** at least one control would be visible for the current program selection. Omitted when:

- `program === "all"`, or
- User is `isOnlyTeacher` (advanced filters hidden — existing `showAdvancedFilters` rule), or
- Selected program has no intake row AND no subject/category row.

### Visibility rules (unchanged from `filter-bar.tsx`)

| Control | Condition |
| --- | --- |
| Intake select | `!isAllPrograms && course_creation_method === "intake_based"` |
| Subject toggles | `!isAllPrograms && subject_strategy === "required"` |
| Category toggles | `!isAllPrograms && subject_strategy !== "required"` |

### Layout

`flex flex-wrap items-center gap-3 overflow-x-auto` — long subject/category lists scroll horizontally on narrow viewports.

### Control styling

| Control | Styling |
| --- | --- |
| Intake | Label `Intake` (sans `text-sm text-text-secondary`) + primitives `Select`, compact width (`w-48`–`w-56`); default intake auto-select logic preserved from `IntakeSelect` |
| Subject | Label + `ToolbarSegmentGroup` with `ToolbarSegmentToggle` per subject (name + count) |
| Category | Same as subject |

Migrate `IntakeSelect`, `SubjectChips`, `CategoryFilterPills` internals to primitives; delete labeled `w-20` column layout from old filter bar.

---

## 9. Page body changes

### `academic-hub-page.tsx`

- Call `usePageHeader({ breadcrumb, actions, toolbar, toolbarSecondary })`.
- Remove `<AcademicHubHeader />` and `<AcademicHubFilterBar />`.
- Wrap content in `div` with Users-matching padding.
- Pass `programs`, `statusCounts`, `onSetMy`, and loading flags into toolbar components via props or shared hooks (`useHubFilters`, `useHubPrograms` — toolbar components call hooks directly where simpler).

### `courses/page.tsx`

```tsx
export default function CoursesRoute() {
  return <AcademicHubPage />;
}
```

Remove `PageContainer` wrapper.

### Deleted files

| File | Reason |
| --- | --- |
| `academic-hub-header.tsx` | Absorbed into `usePageHeader` |
| `filter-bar/filter-bar.tsx` | Replaced by toolbar components |

Filter subcomponents (`status-chips.tsx`, `program-chips.tsx`, etc.) are either inlined into toolbar files or reduced to logic-only helpers — implementation plan chooses minimal file count.

---

## 10. Responsive behavior

| Breakpoint | Behavior |
| --- | --- |
| Desktop | Row 2: program left, search + status + toggle right; may wrap to two lines |
| Tablet | Same; status group may wrap below search |
| Mobile | All clusters wrap; secondary row scrolls horizontally for chip overflow |
| My classes label | `hidden sm:inline` on label text (match User Hub toggle pattern) |

No filter drawer or bottom sheet in v1.

---

## 11. Accessibility

- Program tabs: `role="tablist"` / `role="tab"` / `aria-selected`.
- Status and subject/category: `aria-pressed` on toggles; group `aria-label` (e.g. `"Course status"`, `"Subjects"`).
- Search: `aria-label="Search courses"`.
- My classes: `aria-label="My classes only"` on `Switch`.
- Intake select: associated `<label>` or `aria-labelledby`.

Focus rings: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]` (match User Hub).

---

## 12. Testing

### Automated

- Existing `filter-params.test.ts` — must pass unchanged.
- Optional: `toolbar-segment-group.test.tsx` — active/inactive class application, `aria-pressed` toggling.

### Manual acceptance

1. **Visual grouping** — Academic Hub header matches Users: segmented borders, `h-8` controls, action button beside notifications.
2. **Multi-program tenant** — program tabs visible; switching program updates URL and list; secondary row appears/disappears per program config.
3. **Single-program tenant** — no program tabs; program name under title; secondary row when config requires.
4. **Status multi-select** — toggle combinations work; counts update; empty selection falls back to active.
5. **Search** — debounced; overrides status per existing hub rules; empty state for no results.
6. **My classes** — teacher sees toggle; preference persists in localStorage; non-teacher hidden.
7. **Permissions** — no "Add classes" without create permission.
8. **Users regression** — Staff/Students tabs and grid/list switcher unchanged after primitive extraction.
9. **Course grid** — no visual regression on cards (academic-surfaces-reskin parity).

---

## 13. Files touched (expected)

| Action | Path |
| --- | --- |
| Modify | `src/components/shell/sidebar-context.tsx` |
| Modify | `src/components/shell/panel-header.tsx` |
| Create | `src/components/shell/toolbar-segment-group.tsx` |
| Modify | `src/components/user-hub/user-hub-toolbar.tsx` |
| Create | `src/components/academic-hub/academic-hub-toolbar.tsx` |
| Create | `src/components/academic-hub/academic-hub-secondary-toolbar.tsx` |
| Modify | `src/components/academic-hub/academic-hub-page.tsx` |
| Modify | `src/components/academic-hub/filter-bar/intake-select.tsx` (primitives) |
| Modify | `src/components/academic-hub/filter-bar/subject-chips.tsx` (or merge into secondary toolbar) |
| Modify | `src/components/academic-hub/filter-bar/category-pills.tsx` (or merge into secondary toolbar) |
| Modify | `src/components/academic-hub/filter-bar/my-only-toggle.tsx` (primitives) |
| Delete | `src/components/academic-hub/academic-hub-header.tsx` |
| Delete | `src/components/academic-hub/filter-bar/filter-bar.tsx` |
| Delete | `src/components/academic-hub/filter-bar/status-chips.tsx` (after merge) |
| Delete | `src/components/academic-hub/filter-bar/program-chips.tsx` (after merge) |
| Modify | `src/app/(internal)/courses/page.tsx` |
| Test | `src/components/shell/toolbar-segment-group.test.tsx` (optional) |

---

## 14. Future work (out of scope)

- **Course Hub migration** — separate spec; consumes same `PageHeaderConfig` slots.
- **`useCoursePageHeader()`** — typed wrapper if three or more course routes register headers.
- **List view** on Academic Hub — would add icon segment group to row 2 (mirror Users).
- **Find-a-page header trigger** — [`2026-06-23-find-page-navigation-design.md`](2026-06-23-find-page-navigation-design.md) mounts in row 1 between breadcrumb and actions; coordinate during implementation if that lands in parallel.

---

## 15. Success criteria

1. Academic Hub has no in-page `TypographyH1` or stacked shadcn filter bar.
2. `PageHeaderConfig` includes `toolbarSecondary`; `PanelHeader` renders it conditionally.
3. `ToolbarSegmentGroup` is shared by Users and Academic Hub toolbars.
4. All existing hub filter URL semantics and backend queries behave identically.
5. Course-page slot matrix (§4.2) is sufficient for Course Hub planning without further shell changes.
