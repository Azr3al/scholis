# App launcher — Design Spec

> Add a Spotlight-style overlay with a Launchpad bento of apps, opened from a control under the school logo. The existing sidebar, record-mode inner rail, and Find a page stay as they are.

**Status:** Design approved (decisions locked), ready for implementation plan.
**Authority:** [`DESIGN.md`](../../../DESIGN.md). Builds on the app shell (`2026-06-21-app-shell-sidebar-design.md`), record-mode nav (`2026-06-22-record-mode-global-nav-design.md`), and Find a page (`2026-06-23-find-page-navigation-design.md`).
**Date:** 2026-08-16

---

## 1. Problem

The sidebar is the product catalog: every permission-visible destination sits in an accordion, including specialist tools (Certificates, Award titles) stuffed under Courses / Setup. Those tools are used by a small subset of people, and those people use them often. A dedicated Shortcuts hub is an extra click. Rewriting the rail into an Odoo-style app sitemap would confuse people who already know the current map.

We need a **second path**: a mouse-first app launcher for a small set of frequent surfaces, without moving or hiding anything in the current nav.

---

## 2. Goals & non-goals

### Goals

1. **Additive chrome** — school logo stays; an Applications control sits **below** it; accordion nav, collapsed icon rail, record-mode inner rail, panel header, and Find a page are unchanged.
2. **One-click specialist access** — Certificates and Award titles are tiles in the launcher, not a nested extra click.
3. **Finance as an app** — frequent Finance destinations are tiles in the same overlay.
4. **Permission parity** — a tile is visible only when the matching sidebar child would be visible (`isChildVisible` / `visibleChildren`: permissions, `canShow`, tenant).
5. **Teacher-discoverable** — primary open is a labeled button, not a keyboard shortcut.
6. **Schedjuice-native overlay** — cream paper, Iconoir, Base UI `Dialog`. Structure from macOS Spotlight + Launchpad, not dark glass or candy squircles.

### Non-goals (explicitly deferred)

- Changing sidebar IA, removing orphans from Courses / Setup, or replacing the inner rail.
- Merging Find a page into this overlay.
- A Design hub page, Form designer tile, AI Detector tile, pins, recents, Suggestions row, Show more, or a global `Cmd+Space`.
- Making Courses / People / Home into launcher apps.
- Entity search, quick actions, or onboarding coachmarks for the launcher.
- Burmese copy in v1 — English only; Burmese-safe (no `text-transform: uppercase`, no exclamation marks).

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Scope | **Additive.** Current nav structure stays, including Certificates and Award titles in their present groups. |
| 2 | Invocation | **Spotlight-style overlay** (centered dialog, search on top). Trigger under the tenant logo. |
| 3 | Empty state | **Launchpad-style bento** of app tiles, grouped. Not a search-only Spotlight field. |
| 4 | v1 apps | **Finance** and **Design** only. |
| 5 | Design tiles | **Certificates**, **Award titles**. Form designer is out. |
| 6 | Finance tiles | **Overview**, **Student Payments**, **Unpaid Students**, **Staff Payments**. |
| 7 | Click a tile | Navigate to that route and close the overlay. No hub page for Design or Finance. |
| 8 | Search | Filters **launcher tiles only** (title substring). Find a page stays in the header for the full catalog. |
| 9 | Keyboard | **No new global shortcut** in v1. `⌘K` / `Ctrl+K` remains Find a page. Overlay still supports Esc, ↑/↓/Enter once open. |
| 10 | Zero tiles | **Do not render** the Applications control. |
| 11 | Visual language | Cream / `bg-surface-elevated`, Iconoir, paper grain optional on the popup. Not macOS glass. |
| 12 | Primitives | Base UI `Dialog` + existing `Input`. No shadcn, no Radix, no lucide. |

---

## 4. User experience

### 4.1 Trigger

Mount in the desktop rail and the mobile nav sheet, **immediately below** `TenantHeader`, **above** `SidebarNav`.

**Expanded rail / mobile sheet**

- Full-width control, same horizontal padding as nav rows.
- Leading Iconoir grid glyph (implementer: one Iconoir icon, reused collapsed and expanded).
- Label: **Applications**.
- `aria-label="Applications"`.

**Collapsed rail (including record mode)**

- Icon-only button, same hit size as other rail icons (`p-2.5`).
- Tooltip: **Applications**.
- Still visible in record mode. Fullscreen already hides the rail, so the trigger hides with it.

**Mobile**

- Same control in `SidebarMobile` under the logo.
- Opening Applications **closes the nav sheet first**, then opens the overlay, so the dialog is not stacked inside the sheet.

### 4.2 Overlay

Centered Base UI `Dialog`. Wider than the default primitive (`sm:max-w-lg` is too narrow): **`max-w-2xl`**, `w-[calc(100vw-2rem)]`. `popIn` / existing dialog enter motion. Title **Applications** (visible or `sr-only`; must exist for AT).

```
┌─────────────────────────────────────────┐
│  Search apps                            │
│                                         │
│  Finance                                │
│  [Overview] [Student Payments]          │
│  [Unpaid Students] [Staff Payments]     │
│                                         │
│  Design                                 │
│  [Certificates] [Award titles]          │
└─────────────────────────────────────────┘
```

- Search field focused on open. Placeholder: **Search apps**.
- Group labels in sentence case (`Finance`, `Design`). No uppercase tracking.
- Hide a group when it has zero visible tiles.
- Dismiss: Esc, backdrop click, successful navigation.
- Register with the global overlay registry (same as other dialogs) so competing chrome (Find a page, sheets) does not fight it.
- One overlay at a time: opening Applications closes Find a page; opening Find a page closes Applications.

### 4.3 Tiles

Each tile is a link (or button that navigates):

- Icon from the matching `nav-routes` child.
- Title under the icon, centered, `truncate`.
- Square-ish cream tile: `border-border`, `bg-surface`, hover `bg-surface-hover`. Not iOS squircles, not a different icon color per app.
- `aria-current` is not required (overlay closes on navigate).

**v1 tile table** (hrefs and visibility must come from the existing nav child, not a parallel permission list):

| Group | Title | href | Nav home today |
| --- | --- | --- | --- |
| Finance | Overview | `/finances` | Finance |
| Finance | Student Payments | `/finances/student-payments` | Finance |
| Finance | Unpaid Students | `/finances/unpaid-students` | Finance (`canShow` on screenshot strategy) |
| Finance | Staff Payments | `/finances/staff-payments` | Finance |
| Design | Certificates | `/certificates` | Courses |
| Design | Award titles | `/award-titles` | Setup |

Student-only Finance children (Make Payment, My Payments) are **not** tiles in v1; they remain in the sidebar.

### 4.4 Search (inside overlay)

- Case-insensitive substring on tile **title**.
- Matching tiles stay in their groups; empty groups hide.
- Empty: `<EmptyCopy />` — **No apps match that search.**
- Keyboard: ↑ / ↓ move among visible tiles, Enter navigates, Esc closes.
- Query does **not** search the rest of the sidebar or shortcut tools. That remains Find a page.

### 4.5 Copy

| Surface | Copy |
| --- | --- |
| Trigger | Applications |
| Overlay title | Applications |
| Search placeholder | Search apps |
| Empty filter | No apps match that search. |

No exclamation marks. No `uppercase` CSS on these strings.

---

## 5. Architecture

### 5.1 Config

New module `src/config/app-launcher.ts` (name flexible; one module):

```typescript
type AppLauncherGroupId = "finance" | "design";

type AppLauncherTileDef = {
  group: AppLauncherGroupId;
  /** Must match a `navLinks` child `href` (exact). */
  href: string;
};

export const APP_LAUNCHER_TILES: AppLauncherTileDef[] = [
  { group: "finance", href: "/finances" },
  { group: "finance", href: "/finances/student-payments" },
  { group: "finance", href: "/finances/unpaid-students" },
  { group: "finance", href: "/finances/staff-payments" },
  { group: "design", href: "/certificates" },
  { group: "design", href: "/award-titles" },
];
```

Resolve each tile by finding the `navLinks` child with that `href`, then `isChildVisible` + `resolveNavItemHref`. Title and icon come from that child. Do not duplicate `requiredPermissions` / `canShow` in the launcher config.

If a href is missing from `nav-routes`, omit that tile at runtime. A unit test must fail if any config href does not match a `navLinks` child, so this cannot ship unnoticed.

`buildVisibleLauncherGroups(checker, tenant, user)` returns groups with visible tiles only, in the order above.

### 5.2 Shell wiring

- `SidebarRail`: `TenantHeader` → **Applications trigger** → scrollable `SidebarNav` → `AccountMenu`.
- `SidebarMobile`: same order inside the sheet.
- Overlay: provider + dialog mounted from `AppShell` (peer of Find a page), not inside the rail, so it portals above the content panel.

Collapsed-rail click on Applications **opens the overlay**. It does not call `setOpen(true)` and does not navigate.

### 5.3 Components (suggested split)

Keep units small:

- `app-launcher-trigger.tsx` — rail / mobile button.
- `app-launcher-dialog.tsx` — dialog, search, bento.
- `use-app-launcher.ts` — open state.
- Config + `buildVisibleLauncherGroups` stay in `src/config/` (testable without DOM).

---

## 6. Error handling & empty states

| State | Behavior |
| --- | --- |
| User / tenant not ready | Trigger not rendered (same as `SidebarNav`). |
| Zero visible tiles | Trigger not rendered. Overlay unmounted or inert. |
| Filter matches nothing | Overlay stays open; empty copy in §4.4. |
| Navigate fails (guard / dirty record) | Existing navigation guard wins; overlay stays open if navigation did not happen. |
| Find a page already open | Opening Applications closes Find a page. Opening Find a page closes Applications. |

---

## 7. Testing

High-value only. No “renders Applications” smoke.

**Config / visibility (Vitest, no DOM if possible)**

- Tile hrefs all resolve to a `navLinks` child.
- Unpaid Students tile omitted when `canShow` fails (screenshot strategy not admin/user upload), even if `payment.view_unpaid` is granted.
- Staff Payments / Certificates / Award titles omitted when `canAny` fails their nav permissions.
- Overview tile follows Finance Overview’s permission list (any-of).
- `buildVisibleLauncherGroups` omits an empty Design group when only Finance tiles pass.
- Returns `[]` when nothing passes → trigger hidden (caller-contract: empty array).

**Overlay behavior**

- Choosing a visible tile navigates to that href (mock router) and closes the dialog.
- Filter `award` shows Award titles and hides Finance tiles.
- Filter with no matches shows **No apps match that search.**
- Trigger absent when `buildVisibleLauncherGroups` is empty.

Do not add a test that the sidebar still lists Certificates — that is unchanged code. Do not screenshot the bento.

---

## 8. Out of scope follow-ups

These are valid later specs, not this one:

- More apps (Courses, People, shortcut tools, Form designer, AI Detector).
- Folding Find a page search into this overlay.
- Role-seeded pins / recents as a Suggestions row.
- Slimming the sidebar once people use the launcher.
- `Cmd+Space` or sharing `⌘K` with Find a page.
