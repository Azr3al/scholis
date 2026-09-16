# Workspaces — Design Spec

> Rename Applications to Workspaces. The overlay is a grid of workspace logos. Clicking an enterable workspace opens its home and context rail. Studio becomes a real workspace (combined template library + rail). HR and Admissions are visible but coming soon.

**Status:** Design approved (decisions locked), ready for implementation plan.
**Authority:** [`DESIGN.md`](../../../DESIGN.md). Amends the app launcher (`2026-08-16-app-launcher-design.md`). Studio home amends the document-template library surface (`2026-08-17-document-template-editor-design.md`: `/documents` is deleted; library lives at `/studio`). Builds on finance internal rail (`2026-08-10-finance-internal-rail-parity-design.md`) and record-mode nav (`2026-06-22-record-mode-global-nav-design.md`).
**Date:** 2026-08-17
**Repo:** `schedjuice-reimagined-fe` (no backend)

---

## 1. Problem

The Applications overlay is a second catalog of **destination tiles** (Overview, Award titles, …). That is the wrong object. People pick a **workspace**, then use that workspace’s context rail. Finance already works that way once you are on `/finances`. Design/Studio does not: Documents and Award titles are launcher shortcuts with no rail, and Documents lives at `/documents`.

The launcher also still says Applications, uses Iconoir at 22px, and has no identity marks for the workspaces we actually have (and the two we will have).

---

## 2. Goals & non-goals

### Goals

1. **Workspaces overlay** — trigger, title, and tooltip say **Workspaces**. Card grid of logo + name. No search.
2. **Click enters a workspace** — navigate to that workspace’s home, close the overlay, existing or new context rail appears.
3. **Studio workspace** — context rail registered via `useContextRail` (same slot as Finance / course / user). Home is a combined template library.
4. **Animated workspace logos** — Finance, Studio, HR, Admissions glyphs with enter + hover motion from the Fable source, implemented with design tokens and CSS (no runtime `<style>` inject).
5. **Coming soon** — HR and Admissions cards are visible and not clickable whenever the overlay is shown.
6. **Permission parity** — a workspace is enterable only when the user can use it; rail items and library sections hide independently when their permission fails.
7. **Delete `/documents`** — no page, no redirect. Library and editor Back use `/studio`.

### Non-goals (explicitly deferred)

- Google Docs / Drive gallery (thumbnails, folders). Combined home keeps today’s list/table UI.
- Building HR or Admissions rails, homes, or click targets.
- Slimming or removing the Finance sidebar accordion.
- Using workspace logos in favicons or marketing. **Amended 2026-08-17:** compact logos are allowed in the Studio/Finance context-rail identity (see `2026-08-17-record-rail-header-design.md`). Not in the global icon rail.
- Refactoring Finance’s rail into a generic “workspace rail” primitive (the shell slot already exists).
- Merging Find a page into this overlay, pins, recents, `Cmd+Space`.
- Form designer, AI Detector, Courses, or People as workspaces.
- Burmese copy in v1 — English only; Burmese-safe (no `text-transform: uppercase`, no exclamation marks).

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Overlay contents | **Workspace cards** (logo + name). Not destination tiles. |
| 2 | Search | **Removed.** Find a page remains the catalog. |
| 3 | Product name | **Workspaces.** Drop Applications / Design / “Search apps”. |
| 4 | Design group name | **Studio** everywhere (card, rail `aria-label`, copy). |
| 5 | Click enterable card | Navigate to `homeHref`, close overlay, navigation guard unchanged. |
| 6 | Finance home | `/finances`. Existing finance rail unchanged. |
| 7 | Studio home | `/studio` combined library (document templates + award titles, current list UI). |
| 8 | Studio rail | **Documents** → `/studio`. **Award titles** → `/award-titles`. Each `canAny`’d. |
| 9 | `/documents` | **Deleted.** No redirect. Update every href (editor Back, permissions, tests). |
| 10 | Future workspaces | HR and Admissions **shown, not clickable**, caption **Coming soon**. |
| 11 | Who sees the trigger | Only if Finance **or** Studio is enterable. Then coming-soon cards sit beside those. |
| 12 | Studio card | **Omitted** when the user has neither `document_template.manage` nor `award_title.manage`. |
| 13 | Shell | Reuse `useContextRail` / `ContextRailSlot`. Do not invent a second shell. Do not rewrite Finance rail internals. |
| 14 | Logo CSS | Keyframes in `globals.css` next to other motion. **No** `document.head` injection. **No** raw hex in UI. |
| 15 | Motion replay | Logos **remount when the overlay opens** so enter animations replay. |
| 16 | Approach | Picker overlay + Studio rail as a **Finance-pattern sibling** (nav config + section rail + layout provider). |
| 17 | Module folder | Rename `src/components/app-launcher/` → `src/components/workspaces/`. |

---

## 4. User experience

### 4.1 Trigger

Same placement as Applications: under the tenant logo in the desktop rail and the mobile nav sheet.

| Surface | Copy |
| --- | --- |
| Expanded / mobile label | Workspaces |
| `aria-label` | Workspaces |
| Collapsed tooltip | Workspaces |
| Overlay title | Workspaces |

Zero enterable workspaces → **do not render** the control.

Mobile: opening Workspaces still closes the nav sheet first, then opens the overlay.

### 4.2 Overlay

Centered Base UI `Dialog`, same width as today (`max-w-2xl`). **No search field.** Title **Workspaces**.

```
┌──────────────────────────────────────────┐
│  Workspaces                              │
│                                          │
│  ┌────┐  ┌────┐  ┌────┐  ┌────┐         │
│  │ $  │  │pen │  │ HR │  │door│         │
│  └────┘  └────┘  └────┘  └────┘         │
│  Finance  Studio   HR      Admissions   │
│                    Coming  Coming soon  │
│                    soon                 │
└──────────────────────────────────────────┘
```

**Card order (fixed):** Finance, Studio, HR, Admissions. Omit a card only when that workspace is not enterable **and** not coming-soon (Studio omitted without Studio permission). HR and Admissions always appear when the overlay appears.

**Enterable card:** link. Logo (~48–64px) + name. Hover uses the logo’s hover motion. Click → `homeHref`, overlay closes.

**Coming soon card:** not a link. Same glyph, muted. Caption **Coming soon** under the name. `aria-disabled`. No hover motion. Click / Enter does nothing.

Dismiss: Esc, backdrop, successful navigation. Overlay registry unchanged (Workspaces ↔ Find a page, one at a time).

Keyboard: first **enterable** card focused on open; ↑ / ↓ move among enterable cards only; Enter navigates. Coming-soon cards are not in the move list. Esc closes.

### 4.3 Entering a workspace

| Workspace | Enterable when | Home |
| --- | --- | --- |
| Finance | Any destination in `visibleFinanceRecordNavSections` would show | `/finances` |
| Studio | `document_template.manage` **or** `award_title.manage` | `/studio` |
| HR | never | — |
| Admissions | never | — |

### 4.4 Studio home (`/studio`)

Combined template library, **current list UI** (not a Drive gallery):

```
Documents
  Org templates | My templates     (existing documents list behavior)
  [New]

Award titles
  Name | Family | Pinned | Origin | Retired | actions
  [Create award title]
```

- Documents block only if `document_template.manage`.
- Award titles block only if `award_title.manage`.
- Independent fetches. If one fails, that block shows its existing error line; the other still renders.
- Each empty block keeps its existing empty copy. No new combined empty state.

### 4.5 Studio context rail

Same slot and motion language as Finance (`RecordRailGroupHeader` / stagger / panel wipe). Two items, no groups required:

```
Documents      →  /studio
Award titles   →  /award-titles
```

Hide an item when its permission fails. If the user is not on `/studio`, a back control to Documents (`/studio`) matches Finance’s Overview back link.

**Rail mounts on:** `/studio`, `/award-titles`, `/award-titles/create`, `/award-titles/[id]/edit`.

**Rail does not mount on:** `/templates/document/:id` (fullscreen editor). Editor Back / exit → `/studio`.

Mobile: a Studio section picker equivalent to `FinanceMobileSections` (two links, permission-filtered).

### 4.6 Copy

| Surface | Copy |
| --- | --- |
| Trigger / title / tooltip | Workspaces |
| Coming soon caption | Coming soon |
| Studio rail `aria-label` | Studio sections |
| Documents rail item | Documents |
| Award titles rail item | Award titles |

No “Applications”, “Search apps”, “No apps match that search.” Remove `EMPTY_COPY_PRESETS.noAppsMatch` if nothing else uses it.

---

## 5. Architecture

### 5.1 Config

Replace launcher **tile** defs with workspace defs in `src/config/workspaces.ts`:

```typescript
type WorkspaceId = "finance" | "studio" | "hr" | "admissions";

type WorkspaceDef = {
  id: WorkspaceId;
  label: string;
  /** Always one of the four logo names; same as `id`. */
  logo: WorkspaceId;
  status: "enterable" | "coming_soon";
  homeHref?: string; // only enterable
};

export const WORKSPACE_ORDER: WorkspaceId[] = [
  "finance",
  "studio",
  "hr",
  "admissions",
];
```

`buildVisibleWorkspaces(checker, tenant, user)`:

1. Finance enterable ⇔ at least one finance record-nav destination is visible (reuse `visibleFinanceRecordNavSections`, not the old four launcher hrefs).
2. Studio enterable ⇔ `canAny(["document_template.manage"])` or `canAny(["award_title.manage"])`.
3. If neither enterable → `[]`.
4. Else return cards in `WORKSPACE_ORDER`: include Finance and/or Studio only when enterable; always include HR and Admissions as `coming_soon`.

Coming-soon cards have no `homeHref`.

Delete `APP_LAUNCHER_TILES`, group labels Finance/Design, and `filterLauncherGroups`.

### 5.2 Shell wiring

- Trigger / provider / dialog stay mounted from AppShell as today.
- Rename `src/components/app-launcher/` → `src/components/workspaces/` and `src/config/app-launcher.ts` → `src/config/workspaces.ts`.
- Collapsed-rail click still opens the overlay only (does not expand the rail).

Find a page dock hide: treat Studio record routes like Finance (`isStudioRecordRoute` alongside `isFinanceRecordRoute`) so the find dock hides while the Studio rail is up.

### 5.3 Studio rail (Finance-pattern sibling)

| Piece | Role |
| --- | --- |
| `src/config/studio-record-nav.ts` | Entries, permissions, `STUDIO_CONTEXT_PARENT` (`label: "Documents"`, `href: "/studio"`) |
| `isStudioRecordRoute` | `/studio`, `/award-titles` prefixes. **Not** `/templates/document`. |
| `StudioSectionRail` | Two links, stagger, back to Documents off-home |
| `StudioRecordRailProvider` | `useContextRail(StudioSectionRail, …)` + mobile picker |
| Layouts | Wrap `/studio` and `/award-titles/**` |

Do not extract a generic workspace rail from Finance in this slice.

### 5.4 `/documents` removal

Delete `src/app/(internal)/documents/`. Replace the route-permissions prefix `/documents` with `/studio` (`anyOf`: `document_template.manage`, `award_title.manage`). Point document editor Back to `/studio`. Grep-clean remaining `/documents` hrefs in FE. **No Next.js redirect.**

`/award-titles` stays.

### 5.5 Logos

`WorkspaceLogo` in e.g. `src/components/workspaces/workspace-logo.tsx`.

- `name`: `"hr" \| "finance" \| "studio" \| "admissions"`
- Size default 64; overlay uses ~48–64.
- `currentColor` for ink: `--text-primary` (light) / on dark surfaces `--text-primary` under `data-theme` (do **not** hardcode `#102C24` / `#FCF4E3`).
- Sage “k” accent: `--brand` (`data-green`). `mono={false}` on overlay cards.
- Overlay is cream: `onDark={false}` unless the dialog surface is inverse.

Port the Fable path data and animation choreography exactly:

| Workspace | Enter (overlay open / remount) | Hover (enterable only) |
| --- | --- | --- |
| HR | Badge swings to rest | Light jiggle |
| Finance | Paper lands; lines print L→R with delays | Sage line nudges |
| Studio | Pen falls in; ink drip | Pen shifts slightly |
| Admissions | Frame fades; slab shuts; door opens | Door scales slightly |

`prefers-reduced-motion: reduce`: no animation/transition; Admissions slab stays `opacity: 0` so it does not double-draw over the door.

Coming-soon cards still remount/play enter; they do not run hover motion.

### 5.6 Components (suggested split)

Keep units small:

- `workspace-logo.tsx` — SVG + classNames; keyframes in `globals.css`.
- `workspaces-trigger.tsx` / `workspaces-dialog.tsx` / `use-workspaces.ts` — chrome (moved from `app-launcher`).
- Config + `buildVisibleWorkspaces` in `src/config/` (testable without DOM).
- Studio rail files mirrored from finance record rail, not copied blindly with unused groups.

---

## 6. Error handling & empty states

| State | Behavior |
| --- | --- |
| User / tenant not ready | Trigger not rendered (same as nav). |
| Neither Finance nor Studio enterable | Trigger not rendered. Overlay unmounted or inert. |
| Coming-soon card activated | Not a link; no `router.push`. |
| Navigation guard blocks | Overlay stays open. |
| `/studio` with one Studio permission | Other section and rail item omitted. |
| One Studio list errors | That section’s existing error copy; the other section still renders. |
| Both Studio lists empty | Per-section empty copy only. |
| `/documents` | No route. No redirect. |
| Find a page already open | Opening Workspaces closes it; opening Find closes Workspaces. |

---

## 7. Testing

High-value only. No “renders Workspaces” smoke. No logo screenshots. No reduced-motion pixel tests.

**Config / visibility (Vitest, no DOM if possible)**

- `buildVisibleWorkspaces` → `[]` when neither workspace is enterable (caller-contract: empty array hides trigger).
- Finance-only: Finance enterable with `homeHref: "/finances"`; Studio omitted; HR + Admissions `coming_soon` and no `homeHref`.
- Studio-only (`document_template.manage` and/or `award_title.manage`, no finance visibility): Studio enterable with `homeHref: "/studio"`; Finance omitted; coming-soon cards present.
- Both enterable: Finance then Studio then HR then Admissions.
- Finance enterable uses **rail** visibility (e.g. Unpaid Students `canShow` still affects “any destination visible”), not the retired four-tile list.

**Overlay**

- Click Finance → `/finances` and close; click Studio → `/studio` and close.
- Guard blocks → no navigate, overlay stays.
- Coming soon is not a link (`push` not called).
- No search field; delete old “Search apps” / filter-to-Award-titles tests rather than rewriting them.

**Studio rail / home / routes**

- Award titles rail item omitted without `award_title.manage`.
- Documents rail item omitted without `document_template.manage`.
- `ruleForPath("/studio")` any-ofs both Studio permissions; `ruleForPath("/documents")` is undefined.
- Document editor Back / exit path is `/studio` (caller-contract on the editor, not a full mount).

Do not add a test that the sidebar Finance accordion still exists.

---

## 8. Out of scope follow-ups

- HR / Admissions homes and rails (logos already in `WorkspaceLogo`).
- Drive-style Studio gallery.
- Sidebar slimming once Workspaces is the primary entry.
- Generic rail abstraction beyond `useContextRail`.
- Workspace logos outside this overlay.
