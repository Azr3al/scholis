# Record Mode — Dual-Path Global Navigation — Design Spec

> When a context rail is active (e.g. user record), users must be able to return to the parent list **and** jump to any other app area without hunting for a hidden back link.

**Status:** Design approved. Ready for implementation plan.
**Authority:** [`DESIGN.md`](../../../DESIGN.md). Builds on P2a shell (`2026-06-21-app-shell-sidebar-design.md`) and P2b context-rail swap (`2026-06-21-user-record-inline-design.md`).
**Date:** 2026-06-22

---

## 1. Problem

On user-related pages (`/users/[id]`), the shell enters **record mode**: the global rail collapses to icons and a **record section rail** appears beside it. The only obvious “up” affordance in the section rail is a small `← Users` link at the top — easy to miss.

The P2b spec promised that global icons remain navigable in record mode (“click any global icon to navigate away”), but the implementation only calls `setOpen(true)` on icon click. Because `expanded = open && !recordMode`, labels never expand in record mode and **no navigation occurs**. Users are effectively trapped unless they find `← Users` or use the browser back button.

**User requirement (locked):** Both escape intents must be equally discoverable:

- **A — Back to parent list** (e.g. Users list at `/users`)
- **B — Go to another app area** (Courses, Finance, Home, …)

---

## 2. Goals & non-goals

### Goals

1. **Dual-path navigation** in record mode — breadcrumb for parent list, icon rail for cross-app jumps.
2. **Fix icon rail** so it navigates in record mode (honors P2b contract).
3. **Shell-level reusability** — any future context rail (course detail, settings drill-in) registers the same parent metadata and gets the same behavior.
4. Preserve existing motion, mobile behavior, and permission-filtered nav.

### Non-goals

- Flyout menus from icons (extra click; poor on touch).
- “Exit record” pill or temporary rail expand overlay.
- Nav IA changes or new routes.
- Redesigning the section rail IA.

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Primary “back to list” | **Panel header breadcrumb** — `Users / {name}` with `Users` linked to parent href |
| 2 | Primary “go anywhere else” | **Global icon rail** — single-click navigates to section default route |
| 3 | Active section icon click | Navigates to **context parent href** (e.g. People icon → `/users` while on a user record) |
| 4 | Inactive section icon click | Navigates to that section’s **first permission-visible child href** |
| 5 | Section rail `← Users` | **Keep, demoted** — tertiary affordance; do not remove |
| 6 | Record mode rail expand | **Disabled** — icons never expand labels while `recordMode`; tooltips show destination |
| 7 | Navigation guard | Respect autosave in-flight + explicit-save dirty state before in-app navigation |
| 8 | Breadcrumb on user record | **Already implemented** in `users/[id]/page.tsx`; formalize as the shell contract for all context rails |

---

## 4. Architecture

### 4.1 Dual-path model (desktop)

```
┌────────┬──────────────┬─────────────────────────────────────┐
│ Icon   │ Section      │ Panel header                        │
│ rail   │ rail         │  Users / Aung Zeya        [actions] │
│ (~4rem)│ (~13rem)     ├─────────────────────────────────────┤
│        │              │                                     │
│ 🏠     │ ← Users      │  Record content                     │
│ 📚     │ [avatar]     │                                     │
│ 👥 ●   │ Overview     │                                     │
│ 💰     │ Academic     │                                     │
│ …      │ …            │                                     │
└────────┴──────────────┴─────────────────────────────────────┘
  ↑ B: click icon → navigate     ↑ A: click "Users" → /users
```

- **Path A:** Breadcrumb in `PanelHeader` (registered via `usePageHeader`).
- **Path B:** Icon rail items become `Link` (or router push with guard) when `recordMode === true`.

### 4.2 Context rail metadata (shell extension)

Extend `sidebar-context.tsx`:

```typescript
type ContextRailConfig = {
  /** The rendered section rail (existing). */
  rail: ReactNode;
  /** Breadcrumb parent — label + href for "back to list". */
  parent: { label: string; href: string };
};
```

- Replace `contextRail: ReactNode | null` with `contextRail: ContextRailConfig | null` (or parallel `contextRailParent` field — implementer’s choice; single object preferred).
- `recordMode` remains derived: `contextRail !== null`.
- Update `useContextRail(node, parent)` to accept parent metadata alongside the rail node.

**User record registration** (`users/[id]/page.tsx` or layout):

```typescript
useContextRail(<RecordSectionRail … />, { label: "Users", href: "/users" });
```

Breadcrumb composition stays in the page (needs live subject name); parent `{ label, href }` is duplicated intentionally — parent label matches breadcrumb link text.

### 4.3 Section default href resolver

Add `resolveSectionNavHref(section, ctx)` in `src/config/nav-routes.tsx` (or `src/components/nav/`):

- Input: nav section (`navLinkType`), permission context (`canAny`), `tenant`, `user`.
- Output: resolved href string for the **first visible child** (same filter as `visibleChildren` in `sidebar-nav.tsx`).
- Used by icon rail in record mode for **inactive** sections.

**Active section:** when `navSectionContainsActivePath(section, pathname, tenantId)`, use `contextRail.parent.href` instead of the generic default (ensures People icon → `/users`, not `/users?tab=students` or another People child).

### 4.4 Icon rail behavior matrix

| State | Click behavior | Tooltip |
| --- | --- | --- |
| `recordMode === false`, collapsed | Expand rail (`setOpen(true)`) — **unchanged** | Section title |
| `recordMode === false`, expanded | Toggle section accordion — **unchanged** | — |
| `recordMode === true`, any icon | Navigate to href per §4.3 | Destination label (section title for inactive; parent label for active, e.g. "Users list") |

Implementation in `sidebar-nav.tsx`:

- When `recordMode`, render `<Link href={…}>` (or guarded click handler) instead of `<button onClick={() => setOpen(true)}>`.
- Use `resolveNavHref` for tenant `:id` substitution.
- `playClick()` on successful navigation intent (consistent with shell toggle sound).

### 4.5 Breadcrumb contract

Pages with a context rail **must** register a breadcrumb via `usePageHeader`:

```tsx
<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
  <Link href={parent.href} className="shrink-0 text-text-muted transition-colors hover:text-text-primary">
    {parent.label}
  </Link>
  <span className="shrink-0 text-text-muted" aria-hidden>/</span>
  <span className="truncate font-serif text-lg text-text-primary">{subjectName}</span>
</nav>
```

Reference implementation: `src/app/(internal)/users/[id]/page.tsx` (already matches this contract).

Optional follow-up: extract a `RecordBreadcrumb` primitive under `src/components/shell/` to DRY parent + subject markup.

### 4.6 Section rail back link

Keep `← Users` in `record-section-rail.tsx` unchanged in styling and placement. It is a tertiary affordance for users who scan the left rail; primary escape is breadcrumb + icons.

---

## 5. Navigation guard

Prevent data loss when leaving a record mid-edit.

### 5.1 Blocking conditions

| Condition | Behavior |
| --- | --- |
| Autosave **in-flight** (`status === "saving"`) | Block navigation; optional inline “Saving…” on clicked link until idle |
| Autosave **error** (`status === "error"`) | Confirm: “Save failed. Leave anyway?” |
| Explicit-save group **dirty** | Confirm: “You have unsaved changes. Leave anyway?” |
| Auto-saved / idle | Navigate immediately |

### 5.2 Scope

- Applies to: breadcrumb link, icon rail links, section rail `← Users`, programmatic `router.push` from record chrome.
- `beforeunload` already handled by `AutosaveUnloadGuard` for tab close/refresh.
- In-app guard: introduce a small `useNavigationGuard()` hook or context at the record layout level that intercepts link clicks and `router` events. Reuse confirm dialog primitive from existing form flows.

### 5.3 Phasing

- **Ship with icon rail fix** even if inline editing guard is not yet wired — guard hooks no-op when no dirty state.
- Wire guard to record autosave status as inline editing lands (P2b stages B+).

---

## 6. Mobile (<768px)

No second rail on mobile (unchanged P2b behavior).

| Intent | Affordance |
| --- | --- |
| Back to Users list | Breadcrumb in panel header (same as desktop) |
| Go anywhere else | Hamburger → full global nav drawer (unchanged) |
| Record sections | In-content segmented header (`RecordMobileSections`) |

Icon rail record-mode navigation applies only on desktop where the icon rail is visible.

---

## 7. Motion & sound

- No new motion. Icon rail item click uses existing `playClick()` (same as nav toggle).
- Tooltip fade unchanged.
- Breadcrumb is static chrome — no crossfade on parent link.

---

## 8. Accessibility

- Breadcrumb: `<nav aria-label="Breadcrumb">`; parent is a real link; `/` separator `aria-hidden`.
- Icon rail in record mode: each icon remains a link with `aria-label` describing destination (e.g. `aria-label="Courses"` or `aria-label="Users list"` when active section).
- Tooltips supplement but do not replace accessible names.
- Focus rings per DESIGN.md §14 — visible on breadcrumb link and icon links.
- Navigation guard confirm dialog traps focus and returns focus to trigger on cancel.

---

## 9. Components & files

| Unit | Change |
| --- | --- |
| `sidebar-context.tsx` | Extend context rail config with `parent: { label, href }` |
| `use-context-rail.ts` | Accept parent metadata |
| `sidebar-nav.tsx` | Record-mode icon → Link + href resolver |
| `nav-routes.tsx` (or new helper) | `resolveSectionNavHref()` |
| `users/[id]/page.tsx` | Pass parent to `useContextRail` (breadcrumb already done) |
| `record-section-rail.tsx` | No change (keep demoted back link) |
| `use-navigation-guard.ts` (new, optional phase) | In-app dirty/saving block |
| `/components/mockups/user-record` | Update icon rail to navigate in record mode (visual parity) |

---

## 10. Acceptance criteria

1. On `/users/[id]` desktop: clicking **Courses** icon navigates to `/courses` (or first visible Courses child).
2. On `/users/[id]` desktop: clicking **People** icon (active) navigates to `/users`.
3. Breadcrumb **Users** link navigates to `/users`.
4. Section rail `← Users` still works.
5. Outside record mode, icon rail collapse/expand behavior is unchanged.
6. Mobile breadcrumb works; hamburger global nav unchanged.
7. When autosave is in-flight or explicit-save is dirty, navigation shows guard (once wired to edit state).
8. Pattern documented so a future context rail can register `{ label, href }` and get the same icon-rail behavior.

---

## 11. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Accidental navigation away from record | Navigation guard for dirty/saving state; autosave fields reduce data loss |
| Active section default href ambiguous (multiple People children) | Active section always uses `contextRail.parent.href`, not generic first-child |
| Permission changes hide all section children | Icon omitted by existing `visibleChildren` filter — no orphan icons |
| Breaking P2a collapse persistence | `setOpen` path untouched when not in record mode |

---

## 12. Open items (none)

All requirements are specified. Navigation guard phasing is explicit in §5.3 — not an open design question.
