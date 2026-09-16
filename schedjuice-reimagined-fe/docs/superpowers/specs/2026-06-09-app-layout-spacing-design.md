# App Layout, Whitespace & Padding Philosophy

**Date:** 2026-06-09
**Status:** Approved (design) — pending implementation plan
**Scope:** `schedjuice-reimagined-fe` internal app (`src/app/(internal)`)

## Problem

Every internal page is locked inside a single centered column capped at
`max-w-[1024px]` with only `p-2` (8px) of padding, defined in
`src/app/(internal)/layout.tsx`. The sticky topbar lives *inside* that same
framed column. The only way to get more horizontal room is the fullscreen
toggle (`useFullscreen`), which is all-or-nothing (1024px → 100%).

Consequences:

- Dense pages (the Import data grid, list/table pages, finances, attendance
  god-view, question bank) feel cramped at 1024px.
- Form and detail pages look fine narrow, so a single global width can't serve
  both.
- The 8px gutter feels tight and unintentional; spacing is applied ad-hoc per
  page with no shared scale.

Goal: give pages **more space when they need it** while keeping the app
**centered, compact, and beautiful**, with a consistent spacing philosophy.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Width strategy | **Width tiers** — per-page named max-widths (not fluid, not two-zone) |
| Density | **Comfortable** — responsive 16→32px gutters, ~24px section rhythm |
| Default tier | **1024px** (unchanged from today; opt-in widening) |
| Mechanism | **`<PageContainer width>`** wrapper component the page renders |
| Tables/lists | **All** list/table/data-grid pages default to **wide** |
| Topbar | **Decoupled** — full-width sticky topbar; only the body column resizes |

## Architecture

Split today's single framed column into two responsibilities:

**Layout** (`(internal)/layout.tsx`) owns:
- `SidebarProvider` + `AppSidebar` (unchanged)
- The skip-to-content link
- A **full-width sticky topbar** (moved out of the width-capped frame)
- The scroll region wrapping `{children}`
- It **no longer imposes a max-width** on the body.

**`<PageContainer>`** (new, `src/components/layout/page-container.tsx`) owns:
- The centered, `border-x border-border` framed body column
- The width tier (`max-width`)
- The comfortable gutters and vertical padding
- Fullscreen awareness (reads `useFullscreen()`; forces `full` when active)

```
SidebarProvider
└─ SidebarInset
   ├─ skip link
   ├─ AppTopbar              ← full-width, sticky, decoupled
   └─ scroll region
      └─ {children}          ← each page renders <PageContainer width="…">
```

## `<PageContainer>` component

```tsx
interface PageContainerProps {
  width?: "narrow" | "default" | "wide" | "full";
  className?: string;
  children: React.ReactNode;
}
```

Usage (page root):

```tsx
<PageContainer width="wide" className="space-y-6">
  <AcademicPageHeader title="Import" description="…" />
  {/* … */}
</PageContainer>
```

### Width tiers

| `width` | max-width |
|---|---|
| `narrow` | `768px` |
| `default` (default value) | `1024px` |
| `wide` | `1280px` |
| `full` | none (100%) |

All values sit below the theme's `--breakpoint-xl: 1400px`, so `wide` never
collides with the xl breakpoint.

### Applied classes

- Centering + frame: `mx-auto w-full min-w-0 border-x border-border`
- Gutters (comfortable): `px-4 sm:px-6 lg:px-8` (16 / 24 / 32px)
- Vertical: `pt-6 pb-20` (top breathing room; bottom space for scroll + chat
  launcher)
- Max-width applied per tier via a mapping (e.g. `max-w-[768px]`,
  `max-w-[1024px]`, `max-w-[1280px]`, or none for `full`)

### Fullscreen behavior

`PageContainer` reads `useFullscreen()`. When fullscreen is active, the
effective width is forced to `full` (100%) regardless of the `width` prop,
preserving today's expand toggle behavior. The slow `duration-3000` width
transition in today's layout is reduced to a snappy value (e.g. `duration-200`)
so tier/fullscreen changes don't drag.

## Comfortable density tokens

- **Gutters:** `px-4 sm:px-6 lg:px-8` (replaces flat `p-2`).
- **Section rhythm:** standardize page roots on `space-y-6` (24px) — already the
  common pattern.
- **Page header:** `AcademicPageHeader` unchanged (`gap-4` internal).

## Topbar (decoupled)

`AppTopbar` moves out of the width-capped frame and renders as a full-width
sticky bar spanning the `SidebarInset` content area. It keeps its existing
`h-16`, `px-4`, backdrop-blur, and sticky behavior. Width stays stable across
navigation; only the body column below it resizes per tier.

## Tier mapping (defaults)

| Tier | Pages |
|---|---|
| `narrow` | create/edit forms, auth, single-record editors (`users/create`, `programs/[id]/edit`, `payment-infos/create`, `subjects/create`, etc.) |
| `default` | detail & dashboard pages (course detail, user detail, intake detail) |
| `wide` | **all** list/table/data-grid pages (`users`, `imports`, `finances/*`, `quizzes-v3/question-bank`, `course-roles`, course members, recent-transactions, unpaid-students) |
| `full` | edge-to-edge workspaces (attendance marking, attendance god-view, quiz taker) |

This is the default classification; individual pages can be reassigned during
implementation if they look better in another tier.

## Migration

Because the page is the width authority, every internal page's root wrapper is
swapped to `<PageContainer width="…">`. This is the main effort (~190 page
files under `src/app/(internal)`), but:

- It is mechanical — most pages already wrap content in a single root
  `<div className="space-y-6">`, which becomes
  `<PageContainer width="…" className="space-y-6">`.
- The `default` tier reproduces today's look exactly, so a page that is wrapped
  but left at default has **no visual regression**.
- It can be rolled out section-by-section (e.g. finances, then academic, then
  courses) rather than in one pass.

## Rejected alternatives

- **Fluid width up to a large cap** — loses the deliberate centered-column
  identity; treats all pages the same when forms and tables have different
  needs.
- **Content-aware two-zone** (narrow prose + full-bleed tables within one page)
  — most flexible but materially more complex to build and reason about per
  page; not worth it for current needs (YAGNI).
- **Context/store-driven width** (layout owns the frame, pages set width via a
  zustand store or context) — lower migration churn, but introduces
  child→parent effect-ordering fragility (stale width on navigation) and a
  potential width-flash on wide pages. Rejected in favor of the predictable,
  no-flicker per-page wrapper.

## Testing

- Visual spot-check one page per tier (narrow form, default detail, wide table,
  full workspace) at mobile / tablet / desktop / ultrawide widths.
- Verify the fullscreen toggle forces full width from any tier and restores the
  tier on exit.
- Confirm the sticky topbar stays full-width and visually stable when navigating
  between pages of different tiers.
- Confirm no horizontal overflow / `min-w-0` regressions on data grids.
