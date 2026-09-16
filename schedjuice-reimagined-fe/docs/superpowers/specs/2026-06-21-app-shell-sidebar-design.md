# App Shell & Sidebar Redesign — Design Spec (P2a)

> Rebuild the global `(internal)` app shell in the Schedjuice v2 design world: a Linear-style recessed rail + floating content panel, with the existing app untouched behind a content boundary.

**Status:** Design approved (decisions locked), ready for implementation plan.
**Authority:** [`DESIGN.md`](../../../DESIGN.md) is the sole source of truth. Where the older "User Record Redesign" context doc conflicts (Radix, terracotta, data-green-as-accent), DESIGN.md wins.
**Date:** 2026-06-21

---

## 1. Context

We are re-aligning the frontend to `DESIGN.md` via a **strangler-fig** migration: a new design world grows alongside the untouched shadcn app and surfaces migrate one at a time.

- **Foundation is already built** (`src/components/primitives/*`, `src/app/globals.css`, `src/app/(design)/components/*`): scoped `.sj-root` token system (cream + data-green, dark via `html[data-theme] .sj-root`), bilingual `unicode-range` font stacks, type scale, motion easings, paper grain + rough.js, ~22 Base UI primitives, the `/components` library, and theme infra (`lib/theme-inline-script.ts`, `lib/sj/theme.ts`).
- This spec is the **first chrome migration**: the global app shell. It is **P2a** of the pilot ("sidebar + user record"). The user-record inline redesign is **P2b** (separate spec).

### Migration roadmap (for orientation)

| Phase | Goal |
| --- | --- |
| P1 — Foundation | Tokens, type, theme, decoration, primitives, `/components` library. **Done.** |
| **P2a — App shell & sidebar** | **This spec.** Global Linear shell rebuilt in `.sj-root`. |
| P2b — User record (inline) | Identity strip, section IA, inline editing, Activity (re-skin report-type log), avatars, **and the contextual sidebar swap**. |
| P3…N-1 — Strangler tranches | Migrate remaining surfaces; eventually flip theming fully to `data-theme`. |
| N — Cleanup | Remove `components/ui`, Radix, `lucide-react`, `next-themes`, `components.json`. |

---

## 2. Goals & non-goals

### Goals

1. Replace `src/app/(internal)/layout.tsx` and the sidebar/topbar chrome with a hand-composed shell in the `.sj-root` design world, for **all** internal routes.
2. Deliver the Linear feel: a **recessed cream rail** and a **floating, elevated content panel**.
3. Keep every un-migrated page **pixel-identical** to today, framed inside the new panel.
4. Unify theme control so chrome (`data-theme`) and old page bodies (next-themes `.dark`) never diverge.
5. Preserve all shell behaviors: permission-filtered nav, icon-collapse + persistence + `Cmd/Ctrl+B`, mobile drawer, fullscreen, chat FAB, view-as banner, web-push, notifications badge, skip-link, a11y.
6. Be **swap-ready**: the rail can collapse to an icon rail, so P2b can add the record section rail without re-architecting.

### Non-goals (explicitly deferred)

- The **contextual sidebar swap** content (global nav → record section rail + motion) → **P2b**.
- The **user-record page** redesign → **P2b**.
- **Nav IA reorganization** — the 11 nav sections are reused as-is, only restyled. A true IA slim-down is a separate future effort.
- Removing `next-themes`, Radix, shadcn, or lucide → **Phase N**.
- Migrating any page **body** to the new design world.

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Migration philosophy | Parallel / strangler-fig; new world isolated, existing app stable |
| 2 | Shell scope | **Global rebuild** in `.sj-root` for all `(internal)` routes |
| 3 | Header | **In-panel header** (no separate global topbar) |
| 4 | Theme | **Unified toggle** drives both `data-theme` (new) and next-themes `.dark` (old) |
| 5 | Contextual swap | **Deferred to P2b**; P2a ships the collapse-to-icon-rail capability only |
| 6 | Primitives / icons | Base UI + `src/components/primitives/*`; Iconoir (`iconoir-react`). No Radix/shadcn/lucide in new code |

---

## 4. Architecture

### 4.1 Layout structure

A CSS-grid shell: **rail** (left) + **content column** (right). The content column holds the in-panel header and the floating content panel.

```
RootLayout (src/app/layout.tsx)               # unchanged: html[data-theme] + next-themes + providers
└── (internal)/layout.tsx  ← REBUILT
    └── <AppShell>                             # grid; mounts providers + integrations
        ├── ViewAsBanner                       # reused; above the grid
        ├── grid:
        │   ├── <SidebarRail class="sj-root sj-chrome">   # recessed cream rail (new world)
        │   │     ├── TenantHeader (monogram / name)
        │   │     ├── Nav (groups from nav-routes + visibleChildren)
        │   │     └── AccountMenu (Menu + Avatar + Logout)
        │   └── <ContentColumn>
        │         ├── <PanelHeader class="sj-root sj-chrome">  # in-panel header
        │         │     ├── left:  mobile NavTrigger + page title (getNavPageTitle)
        │         │     └── right: ThemeToggle · notifications · fullscreen · account
        │         └── <ContentPanel class="sj-root">          # floating elevated panel
        │               └── <ContentReset>{children}</ContentReset>  # OLD world restored
        ├── ChatArea                            # reused; fixed FAB
        └── WebPushRegistrar                    # reused; renders null
```

- **Rail** — flat `bg-surface`, no hard divider, `<PaperGrain />` bleed, quiet/low-chrome, Iconoir icons. Collapsible to ~48px icon rail.
- **Content panel** — `bg-surface-elevated`, rounded, hairline `border-border`, soft `shadow`, inset margin so it floats off the rail.
- Dark mode handled entirely by tokens (warm dark-brown rail, lifted panel).

### 4.2 The token/theme boundary (primary risk)

**Problem.** When the shell becomes `.sj-root`, un-migrated shadcn pages render inside the new token world. Today the foundation re-points shadcn token *names* inside `.sj-root` (`--background`, `--foreground`, `--card`, `--popover`, `--muted-foreground`, `--accent`, `--border`, `--ring`, `--success`, plus `--color-*` equivalents in an `@layer theme` block) and overrides `--font-sans`. Old pages under `.sj-root` would get a **partial reskin** (warm borders, green hovers, cream cards, Schedjuice Sans) — inconsistent and unintended.

**Resolution — separate "chrome" scope from "world" scope:**

1. **Foundation tweak (globals.css):** move the *shadcn-collision* re-points out of `.sj-root` into a dedicated **`.sj-chrome`** class (light + dark variants). After the tweak:
   - `.sj-root` defines **only** the new world: new tokens (`--surface`, `--text-primary`, `--brand`, warm ramp…), their dark flips, type scale, motion, and `--font-*`.
   - `.sj-chrome` carries the shadcn-name overrides (`--color-foreground`/`background`/`card`/`popover`/`muted-foreground`, `--accent`/`--border`/`--ring`/`--success`) so chrome can freely mix new + shadcn utilities and stays protected from next-themes `.dark` washing.
2. **Chrome elements** (rail, panel header, panel frame) use `class="sj-root sj-chrome"` and author with **new utilities only** (`bg-surface`, `text-text-primary`, `border-border-strong`, …).
3. **Content boundary:** `{children}` render inside `<ContentReset>` which restores the old world for the page body — Geist `--font-sans`, `color: var(--foreground)`, and (because collision re-points now live on `.sj-chrome`, not `.sj-root`) the shadcn color tokens resolve to their normal `:root` / `.dark` values. Net effect: **old pages look exactly as today**.

> The exact selectors are finalized during implementation and **validated with before/after screenshots** of representative un-migrated pages (a form page, a data-table page) in **both light and dark**. This validation is a required acceptance gate.

### 4.3 Theme unification

Today: new world ← `html[data-theme]`; old app ← next-themes `.dark`. These can diverge (e.g. `data-theme=light` while OS-dark drives next-themes `system → dark`).

**Mechanism:** a small client `ThemeController` wraps the toggle so one action updates both systems:

- On change: `applyTheme(pref)` (sets `data-theme` + `theme` cookie + `sj-theme` localStorage + `color-scheme`) **and** next-themes `setTheme(pref)` (drives `.dark`).
- On mount: reconcile so next-themes preference matches `data-theme` (both default to `system`, so they align by default).
- Storage keys do not collide: ours = cookie `theme` + localStorage `sj-theme`; next-themes = localStorage `theme`. next-themes `ThemeProvider` **stays** (removed in Phase N).

The shell exposes the existing `ThemeToggle` primitive in the panel header, rewired through `ThemeController`.

### 4.4 Reuse vs rebuild

**Reused as-is (data/config/integrations — not chrome):**
- `src/config/nav-routes.tsx` (taxonomy, permissions, `canShow`, `getNavPageTitle`, `resolveNavHref`)
- `src/components/nav/nav-visibility.ts` (`visibleChildren`)
- `src/hooks/useUser.ts`, `useTenant.ts`, `usePermissions.ts`, `useUtilityNotifications.ts`
- `src/components/layout/fullscreen-provider.tsx` + `src/hooks/use-fullscreen.ts`
- `src/components/course/chat/chat-area.tsx`, `src/components/layout/view-as-banner.tsx`, `src/components/web-push/web-push-registrar.tsx`

**Rebuilt in the new world (Base UI + primitives + tokens):**
- The sidebar: rail container, tenant header, collapsible groups, nav items, icon-collapse, mobile drawer (new `Sheet`), collapsed-state `Tooltip`s, account menu (`Menu` + `Avatar` + `Logout`).
- The shell layout + content boundary.
- The in-panel header.
- Sidebar state provider (replaces shadcn `SidebarProvider`).

---

## 5. Components to build

Each is a focused unit under `src/components/shell/` (new) unless noted.

| Component | Purpose | Key deps / notes |
| --- | --- | --- |
| `(internal)/layout.tsx` | Compose providers + `<AppShell>` | Replaces current layout |
| `AppShell` | Grid; mounts ViewAsBanner, ChatArea, WebPushRegistrar; applies content boundary; honors fullscreen hide rules | Reuses fullscreen + integrations |
| `SidebarProvider` (new) | State: `open`, `setOpen`, `isMobile`, `openMobile`, `setOpenMobile`, `toggle`; cookie persistence (`sidebar:state`, 7d); `Cmd/Ctrl+B`; mobile breakpoint 768 | Replaces shadcn provider; same contract so reuse is easy |
| `SidebarRail` | The rail: tenant header + nav + account footer; recessed cream; collapsible to icon rail | `bg-surface`, PaperGrain, Iconoir |
| `SidebarNav` | Renders `navLinks` filtered by `visibleChildren`; collapsible groups; active state (`aria-current`); collapsed tooltips | Reuse nav-routes + nav-visibility |
| `SidebarMobileDrawer` | Mobile off-canvas nav | New `Sheet`; close on route change + link click |
| `AccountMenu` | Avatar + name + roles → menu (Profile, Settings, Logout) | New `Menu` + `Avatar`; `LogoutButton` |
| `PanelHeader` | In-panel header: mobile NavTrigger + page title (left); ThemeToggle, notifications, fullscreen, account (right) | `getNavPageTitle`, `useUtilityNotifications`, `FullscreenToggle` |
| `ContentPanel` + `ContentReset` | Floating elevated frame + old-world reset for `{children}` | The §4.2 boundary |
| `ThemeController` | Unify `data-theme` + next-themes | §4.3 |

---

## 6. Behavior contracts to preserve

- **Mobile breakpoint:** `< 768px` → drawer; `≥ 768px` → fixed rail.
- **Collapse persistence:** cookie `sidebar:state` (true/false), 7-day max-age. (Current code writes but does not read on mount; **improve**: seed initial desktop state from the cookie to avoid a flash.)
- **Keyboard:** `Cmd/Ctrl+B` toggles; `aria-keyshortcuts` advertised.
- **Mobile drawer:** closes on route change and on nav-link click; `sr-only` title "Navigation"; autofocus first nav link.
- **Fullscreen:** when `effectiveFullscreen`, hide rail + panel header + chat; keep view-as banner, content, web-push. Reuse existing `nuqs`-based logic.
- **View-as:** amber banner above the panel when `useViewAsStore().active`.
- **Notifications:** unread dot from `useUtilityNotifications` (`["utility-notifications", user?.id]`).
- **A11y:** skip-link to `#main-content`; `aria-current="page"`; visible themed focus rings (`--ring`); `sr-only` labels on icon-only controls.
- **Z-index stack:** chat `z-50`, header sticky `~z-200`, view-as `~z-350`, skip-link `z-400` (preserve ordering; verify Base UI popovers/menus portal above content).
- **Empty-state gating:** nav renders only when `user && tenant` are present.

---

## 7. Motion (DESIGN.md §12)

- Rail collapse/expand and drawer slide use `--ease-paper` / `--ease-quiet` with `--duration-normal`.
- Respect `prefers-reduced-motion` (foundation already neutralizes durations in `.sj-root`).
- **No layout-shift hovers** on nav items/cards; press feedback reserved for buttons.

---

## 8. Accessibility & theming

- WCAG AA contrast in **both** light and dark for rail, header, nav active/hover, account menu.
- Both themes validated in the `/components` library style and on a real internal route.
- `color-scheme` tracks resolved theme (already handled by `applyTheme` / inline script).

---

## 9. Responsive

| Aspect | Desktop (≥768) | Mobile (<768) |
| --- | --- | --- |
| Nav | Fixed rail, collapsible to icon rail | Off-canvas drawer (`Sheet`) |
| Toggle | Rail control + `Cmd/Ctrl+B` | Hamburger in panel header |
| Header | In-panel; title + actions | In-panel; hamburger + title + actions |
| Content panel | Floating with inset margins | Full-bleed (minimal/no inset) |

---

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Token boundary leaks** (old pages reskinned) | §4.2 chrome/world split + `ContentReset`; **screenshot acceptance gate** on representative pages, light + dark |
| Theme divergence chrome vs body | §4.3 unified `ThemeController`; reconcile on mount |
| Base UI overlays z-index/portal vs Glide grid `#portal` | Verify menus/popovers/tooltips/sheet render above content and below intended layers; test data-table + chat open |
| Global blast radius (every route's chrome changes at once) | Validate a checklist of route archetypes (form, data-table, dashboard, fullscreen page, student vs admin nav) before sign-off |
| Foundation tweak regresses `/components` | Re-run the `/components` + bilingual pages after moving collision re-points to `.sj-chrome` |
| Paper grain perf on every route | Single shared `<PaperGrain />` instance in the rail; inline SVG, cached |

---

## 11. Validation / acceptance

- Before/after screenshots of ≥2 un-migrated pages (form + data-table) in light **and** dark show **no visual change** to the page body.
- New shell renders correctly for: admin nav, student nav (reduced), collapsed rail, mobile drawer, fullscreen page, view-as active.
- Keyboard: `Cmd/Ctrl+B`, tab order, focus rings, skip-link all work.
- Theme toggle flips chrome **and** body together; no FOUC on reload.
- Unit tests: `SidebarProvider` state + persistence; `ThemeController` reconcile logic; `visibleChildren` still drives nav (existing tests stay green).
- `npm run lint`, `npm run build`, `npm run test:unit` pass.

---

## 12. Open items to finalize in implementation

1. Exact `.sj-chrome` selector set and the `ContentReset` declarations (proven by the screenshot gate).
2. Whether the rail keeps **collapsible groups** (current) or a flatter always-expanded list within the quiet aesthetic — default: keep collapsible groups, restyled.
3. Where the tenant switcher / org context (if any) belongs — current shell has none; keep absent.

---

## 13. Follow-ups (next specs)

- **P2b — User record (inline):** identity strip, section IA (Overview/Academic/Finance/Records/Activity), inline editing (auto-save vs explicit-save by field type), Activity = re-skin of the report-type user-log (no backend change), avatars (PreviewCard hover + photo lightbox), per-section access — **and** the contextual sidebar swap that this shell is built to host.
- **Future — Institutional Memory:** Fact/Opinion (`claim_class`), corrections (`supersedes_id`), soft retractions, per-entry visibility, LLM read-time summary — **requires backend work**; out of the FE-only pilot.
