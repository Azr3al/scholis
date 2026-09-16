# Find a page — Global navigation palette — Design Spec

> Teachers and other staff need a fast way to jump to any app page or shortcut tool without hunting the sidebar. The feature must be discoverable by mouse — not keyboard shortcuts alone — and introduced with a gentle two-step onboarding flow.

**Status:** Design approved. Ready for implementation plan.
**Authority:** [`DESIGN.md`](../../../DESIGN.md). Builds on the app shell (`2026-06-21-app-shell-sidebar-design.md`) and complements record-mode global nav (`2026-06-22-record-mode-global-nav-design.md`).
**Date:** 2026-06-23

---

## 1. Problem

Schedjuice’s sidebar is deep: dozens of permission-filtered destinations grouped across Home, Courses, Finance, People, and more. Shortcut tools (Today’s classes, Meeting link sheet, Analytics, …) live on a separate index page.

Primary users are **teachers who are not tech-literate**. They do not know what ⌘K means and will not discover a keyboard-only command palette. Without a visible, click-friendly entry point and a one-time introduction, fast navigation stays invisible to the people who need it most.

---

## 2. Goals & non-goals

### Goals

1. **Fast navigation** — search and jump to any sidebar page or shortcut tool the user is allowed to see.
2. **Mouse-first discoverability** — always-visible header search trigger; keyboard shortcut is secondary.
3. **Teacher-friendly onboarding** — welcome dialog, then coachmark on the search field; replayable via Tips.
4. **Schedjuice-native UI** — Base UI primitives + design tokens; no shadcn.
5. **Permission parity** — palette shows exactly what the sidebar and shortcuts index would show for the current user/tenant.

### Non-goals

- Entity search (courses, students, users by name) — deferred to a future spec.
- Quick actions (create course, mark attendance, …).
- Burmese copy in v1 — English only; strings must be Burmese-safe (no `text-transform: uppercase`, no exclamation marks per `DESIGN.md` §4).
- Replacing or redesigning the sidebar IA.
- Using `components/ui/command.tsx` or any shadcn-derived component shell.

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Scope | **Sidebar pages + shortcut tools** (scope B) |
| 2 | Technical approach | **Base UI `Dialog` + headless `cmdk`** — Schedjuice-styled; not shadcn |
| 3 | Primary affordance | **Always-visible search trigger** in `PanelHeader` (approach A) |
| 4 | Feature name (user-facing) | **“Find a page”** — never “command palette” |
| 5 | Onboarding | **Welcome dialog → coachmark** on the search field (approach C) |
| 6 | Replay onboarding | **Tips link** beside the header search trigger (approach A) |
| 7 | Keyboard shortcut | **⌘K / Ctrl+K** in `(internal)` shell — secondary hint only |
| 8 | Audience | All authenticated `(internal)` users; teachers are the design target |
| 9 | Persistence | **localStorage**, per browser (same pattern as utility notifications last-seen) |

---

## 4. User experience

### 4.1 Header search trigger

Mount in `PanelHeader`, between the breadcrumb area and the existing icon cluster (notifications, fullscreen, theme).

**Desktop**

- Quiet field-shaped **button** (not a live text input in the header — avoids fighting page scroll and focus).
- Left: search icon (Iconoir).
- Center: placeholder **“Find a page…”**
- Right inside field: muted kbd badge **⌘K** (Mac) or **Ctrl K** (Windows/Linux), detected via `navigator.platform` / `userAgentData`.
- Beside the field: text link **“Tips”** — replays onboarding (§4.4).

**Mobile**

- Same control; placeholder may shorten to **“Find…”** when horizontal space is tight (`truncate` / responsive copy).
- Tips link stays visible (may wrap below on very narrow widths).

**Interaction**

- Click anywhere on the field → open palette (§4.2) with search input focused.
- `aria-label="Find a page"` on the trigger button.
- Visible focus ring per `DESIGN.md` §13.

**Visibility**

- Render when `PanelHeader` renders (not in effective fullscreen mode where the header is hidden).
- `(internal)` routes only — not on public, quiz-taker, or registration surfaces.

### 4.2 Palette (modal)

Opens as a centered Base UI `Dialog`:

| Property | Value |
| --- | --- |
| Width | `max-w-lg` (wider than default primitive dialog) |
| Motion | `popIn` from `src/lib/sj/motion.ts` on the popup |
| Title | **“Find a page”** — visible or `sr-only` (implementer choice; must exist for screen readers) |
| Input placeholder | **“Type to search…”** |
| Groups | **Pages** then **Shortcuts** — section headings in small caps (**Latin only**) |
| Row content | Title + one-line description from `nav-routes` / `shortcuts-tools` |
| Empty state | `<EmptyCopy />` — “No pages match that search.” |
| Select behavior | Navigate to `href`, close palette |
| Dismiss | Esc, backdrop click, or successful navigation |

**Keyboard (inside palette)**

- ↑ / ↓ — move selection
- Enter — navigate to selected row
- Esc — close

**Global shortcut**

- `⌘K` / `Ctrl+K` toggles open when focus is not trapped in a typing surface (`input`, `textarea`, `[contenteditable=true]`), unless the palette is already open (then Esc semantics apply via dialog).
- Register listener in `FindPageProvider` mounted from `AppShell`.

**Filtering**

- Case-insensitive substring match on **title** and **description**.
- `cmdk` built-in filter or equivalent; groups remain in declaration order; empty groups hidden.

### 4.3 Copy & voice

- Non-corporate, teacher-facing tone per `DESIGN.md` §4.
- No exclamation marks.
- Do not lead onboarding with “Press ⌘K” — lead with the search bar; mention keyboard shortcut once in the welcome dialog as optional.

**Welcome dialog body (locked EN copy):**

> Jump to any screen from the search bar at the top. You can also press ⌘K on a Mac or Ctrl+K on Windows.

(Substitute platform-appropriate shortcut label when rendering.)

**Coachmark body (locked EN copy):**

> Click here anytime to find a page.

**Tips link**

- Label: **“Tips”**
- `aria-label`: “Show Find a page tips again”

### 4.4 Onboarding flow

Two steps, stored separately in localStorage:

| Step | Key | Trigger |
| --- | --- | --- |
| 1 — Welcome dialog | `sj:find-page-onboarding-dialog` | First `(internal)` shell mount after feature ships, if key absent |
| 2 — Coachmark | `sj:find-page-onboarding-coachmark` | Immediately after step 1 dismiss (~300ms delay), if coachmark key absent |

**Step 1 — Welcome dialog**

- Base UI `Dialog` with title “Find a page”, body copy from §4.3, primary button **“Got it”**.
- On dismiss: set dialog key; schedule coachmark.

**Step 2 — Coachmark**

- Base UI `Popover` anchored to the header search trigger (`Popover.Arrow` pointing at the field).
- Non-modal overlay acceptable; dismiss on **“Got it”** or outside click.
- On dismiss: set coachmark key.

**Replay (Tips link)**

- Clear both localStorage keys.
- Restart flow: dialog → coachmark (same sequence as first run).
- Does **not** open the palette.

**Skip / edge cases**

- If header is hidden (effective fullscreen), defer onboarding until header is visible again.
- If user opens palette before coachmark fires, coachmark still shows after dialog dismiss unless user already dismissed coachmark via Tips replay mid-flow (implementer: cancel pending coachmark if dialog dismissed and user navigates away from shell — acceptable to show coachmark on next header-visible mount if key still unset).

---

## 5. Data model

### 5.1 Find-page item

```typescript
type FindPageGroup = "pages" | "shortcuts";

type FindPageItem = {
  id: string;           // stable slug, e.g. "pages:/courses" or "shortcuts:/shortcuts/todays-classes"
  title: string;
  description?: string;
  href: string;
  group: FindPageGroup;
};
```

### 5.2 Item sources

**Pages group**

- Walk `navLinks` from `@/config/nav-routes`.
- For each section, take `visibleChildren(section, checker, tenant, user)`.
- Emit one item per child with `href` defined (skip `:id` template links without a resolved id — same rule as sidebar).
- `description` from nav child `description` when present; otherwise omit.

**Shortcuts group**

- `filterShortcutToolsForUser(user, tenant)` from `@/config/shortcuts-tools`.
- Map each tool to an item using existing `title`, `description`, `href`.

**Deduplication**

- If the same `href` appears in both sources, keep the **Pages** entry and drop the duplicate from Shortcuts.

### 5.3 Building items

New module: `src/config/find-page-items.ts`

```typescript
export function buildFindPageItems(args: {
  checker: NavPermissionChecker;
  tenant: organizationType | null | undefined;
  user: accountType | undefined;
}): FindPageItem[];
```

Pure function — unit-testable with existing nav visibility fixtures.

---

## 6. Architecture

### 6.1 Component tree

```
AppShell
└── FindPageProvider          # open state, ⌘K listener, items memo, onboarding orchestration
    └── Shell (existing)
        └── PanelHeader
            └── FindPageTrigger    # field button + Tips link
    └── FindPageDialog             # portal; cmdk list inside Dialog
    └── FindPageOnboarding         # welcome dialog + coachmark popover
```

### 6.2 New files

| File | Responsibility |
| --- | --- |
| `src/config/find-page-items.ts` | Flatten nav + shortcuts into searchable items |
| `src/lib/find-page-onboarding-storage.ts` | get/set/clear/replay localStorage keys |
| `src/components/find-page/find-page-provider.tsx` | Context + global shortcut |
| `src/components/find-page/find-page-trigger.tsx` | Header control |
| `src/components/find-page/find-page-dialog.tsx` | Dialog + styled cmdk |
| `src/components/find-page/find-page-onboarding.tsx` | Dialog + coachmark UI |
| `src/components/find-page/use-find-page.ts` | Consumer hook |

### 6.3 Styling cmdk (not shadcn)

- Import `Command` from `cmdk` directly — **do not** import from `@/components/ui/command`.
- Wrap in `.sj-root` scoped classes using design tokens: `bg-surface-elevated`, `text-text-primary`, `border-border`, `data-[selected=true]:bg-accent`, etc.
- Group headings: small caps, `text-text-muted`, per §7 / table header rhythm — not shadcn `[cmdk-group-heading]` copy-paste.
- Icons on rows: **omit** in v1 (DESIGN.md §11 — reduce icon noise); group headings carry structure.

### 6.4 Navigation

- Prefer `router.push(href)` for selection (dynamic post-filter navigation — matches `prefer-link-over-router-push` exception for command palette).
- If a shell-level dirty/autosave navigation guard exists at implementation time, await/consult it before navigating — same contract as record-mode icon rail (2026-06-22 spec §3 #7).

### 6.5 Dependencies

- **Keep** existing `cmdk` package — headless only.
- **Use** `@/components/primitives` (`Dialog`, `Popover`, `Button`, `EmptyCopy`).
- **Use** Iconoir icons in chrome (search icon); Lucide is not used in new code per DESIGN.md §11.

---

## 7. Accessibility

- WCAG AA contrast on all states.
- Dialog focus trap while open; restore focus to trigger on close.
- Coachmark: associate popover with trigger via `aria-describedby` or Popover Title/Description.
- Global shortcut does not steal keys from text fields.
- Reduced motion: respect `prefers-reduced-motion` / `useReducedMotion()` — opacity-only fallback for `popIn` and coachmark entrance.

---

## 8. Testing

### Unit

- `buildFindPageItems` — respects `visibleChildren` and `filterShortcutToolsForUser`; dedupes hrefs; omits `:id` templates without tenant.
- `find-page-onboarding-storage` — set/get/clear/replay semantics.

### Manual QA checklist

- [ ] First visit: welcome dialog → coachmark on search field.
- [ ] Tips replay: both steps run again.
- [ ] Click header field → palette opens, input focused.
- [ ] ⌘K / Ctrl+K opens palette from non-typing context.
- [ ] Search filters Pages and Shortcuts groups.
- [ ] Selecting row navigates and closes.
- [ ] Empty query shows all allowed items; nonsense query shows empty state.
- [ ] Teacher role sees teacher-appropriate subset (no admin-only pages).
- [ ] Mobile: trigger usable; palette full-width.
- [ ] Record mode: trigger visible in header; palette works.
- [ ] Fullscreen mode: trigger hidden with header; no onboarding stuck state.

---

## 9. Future extensions (out of scope)

- Entity search (courses, students, users).
- Recent / frequent destinations.
- Burmese onboarding strings via `<EmptyCopy />`-style dual script.
- Server-persisted onboarding completion (cross-device).

---

## 10. Acceptance criteria

1. A teacher can click **Find a page…** in the header, type “today”, select **Today’s classes**, and land on `/shortcuts/todays-classes`.
2. A teacher who has never used ⌘K completes onboarding without needing documentation.
3. A screenshot of the palette next to a generic shadcn command menu is visually distinguishable as Schedjuice (warm tokens, serif title, no shadcn chrome).
4. No new route appears in the palette that the user cannot already reach via sidebar or shortcuts index.
