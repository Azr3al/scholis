# User Record — Spotify-style cover hero with scroll collapse

> **Status:** Design approved (direction + scroll behavior + screenshot presentation locked). Ready for implementation plan.
> **Authority:** [`DESIGN.md`](../../../DESIGN.md) — motion §12, no card-stacking §9, no gradients between brand colors §8 (exception noted below).
> **Date:** 2026-06-22
> **Scope:** `RecordProfileHeader` cover area on `/users/[id]` only. Panel-header edit actions for profile media. Does not change global `PageContainer` / app shell chrome.

---

## 1. Problem

The profile cover still reads as a **floating card**: rounded corners, inset from `PageContainer` padding, and a hard edge where the photo meets the cream page. The user wants a **Spotify artist-page feel**: atmospheric full-width cover, bottom gradient into the page surface, and **collapse + fade on scroll**.

Additionally, profiles should be **screenshot-worthy by default** — users share them on social media. Visible edit chrome in the hero (the bordered **Photos** dropdown, cover camera button, **ID Card** button) breaks that presentation.

Reference: [Spotify artist image guidelines](https://support.spotify.com/us/artists/article/artist-image-guidelines/) — wide header, bottom ~35% treated as overlay zone, content scrolls over the hero.

---

## 2. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Visual model | Spotify atmospheric header (not Notion flat, not typography-only) |
| 2 | Scroll behavior | **Collapse + fade** — cover height shrinks (~280px → ~72px) while opacity fades out |
| 3 | Gradient | Single-purpose **scrim**: photo → `--surface-elevated` at bottom (not a brand-color gradient) |
| 4 | Breakout | Cover **breaks out** of `PageContainer` horizontal padding via negative margin; no corner radius on cover |
| 5 | Identity layout | Keep current avatar overlap + name/roles on cream below the hero — **no action buttons in hero** |
| 6 | Scroll source | `#main-content` in `app-shell.tsx` (not `window`) |
| 7 | Screenshot presentation | Hero is **read-only display** by default — no Photos menu, no ID Card button, no cover camera, no avatar click-to-edit |
| 8 | Edit placement | **Panel header** — icon-only `⋯` in `usePageHeader` `actions` slot (next to notifications); photo uploads + ID Card link inside menu |
| 9 | Admin actions | Move `RecordActionsMenu` (disable/delete/resign) to the same panel-header action cluster — not in hero |

---

## 3. Visual design

### 3.1 At rest (scroll = 0)

```
┌─────────────────────────────────────────────── Panel (cream)
│  [Users / Name]                    header    │
├───────────────────────────────────────────────┤
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ COVER full bleed ▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← no radius, edge-to-edge in column
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│░░░░░░░░░░░░ gradient to cream ░░░░░░░░░░░░░░░│  ← scrim overlay (see §3.3)
│      (avatar)                                 │
│  Name · email · roles                         │  ← no buttons in hero
│                                               │
│  … profile sections …                         │
└───────────────────────────────────────────────┘
     ↑ Panel header (above):  Users / Name    [⋯ Edit menu]
```

- **Cover height:** `max-h-[280px]` mobile / `max-h-[320px]` desktop at rest (same as today); aspect ratio can relax when collapsing.
- **No** `rounded-t-xl`, **no** outer border/shadow on hero wrapper.
- **Breakout:** wrapper uses `-mx-4 sm:-mx-6 lg:-mx-8` to cancel `PageContainer` padding so cover touches the panel content edges (still inside the floating panel, not the outer shell).

### 3.2 Scrolled (scrollTop ≥ collapse distance)

- Cover **height** interpolates to **~72px** (enough for a sliver of color, not a full banner).
- Cover **opacity** interpolates **1 → 0** over the same scroll range.
- Avatar + identity block scroll normally (not sticky); only the cover layer collapses/fades.
- Camera edit button fades with cover opacity (hidden when opacity < 0.2). **Removed from hero** — cover upload only via panel-header menu (see §5.2).

### 3.5 Screenshot-worthy hero (presentation mode)

The hero never shows edit affordances. Specifically **removed from hero**:

| Removed | Replacement |
| --- | --- |
| **Photos** dropdown (bordered button) | Panel-header `⋯` menu items |
| **ID Card** link button | Panel-header menu item → `/id-card` |
| Cover **camera** FAB | Menu item: "Update cover image" |
| Avatar **click + hover camera** | Menu item: "Update profile photo"; avatar is display-only `<Avatar>` |

**Panel-header menu** (`usePageHeader` `actions` in `page.tsx`):

- Icon-only trigger (same ghost style as admin `RecordActionsMenu` — `size-9`, no border, no label).
- **Own profile / can edit media:** Update profile photo, Update cover image.
- **Can edit ID photo:** Update ID photo.
- **Own profile:** View ID card (navigates to `/id-card`).
- **Separator** then admin items from `RecordActionsMenu` when applicable.

Upload dialog state lives in a new `RecordProfileHeaderActions` component (or similar) mounted from `page.tsx` and registered as header actions — keeps `RecordProfileHeader` purely presentational.

**Out of scope for this spec:** hiding Overview inline-edit pencils on hover (broader "all pages screenshot-worthy" pass — follow-up).

### 3.3 Bottom scrim (DESIGN.md exception)

DESIGN.md §8 bans gradients between brand colors. This scrim is **photo → surface** only:

```css
/* conceptual */
background: linear-gradient(
  to bottom,
  transparent 0%,
  color-mix(in srgb, var(--surface-elevated) 40%, transparent) 55%,
  var(--surface-elevated) 100%
);
```

Warm cream (`--surface-elevated` / `#FFFAEC`), not green. Keeps important cover detail in the **upper two-thirds** (Spotify safe zone).

### 3.4 Default / tenant cover

When no custom cover: use tenant default or `/images/default-cover.jpg` as today. Default images should remain landscape and work when collapsed (avoid text in bottom third).

---

## 4. Scroll mechanics

### 4.1 Scroll container

Main content scrolls in:

```tsx
// app-shell.tsx
<main id="main-content" className="… overflow-auto …">
```

The hero hook must attach a `scroll` listener to `#main-content` (or accept a ref from a small context). **Do not** use `window.scrollY`.

### 4.2 Progress calculation

- `COLLAPSE_DISTANCE = 200` px (tunable constant; full collapse + fade complete at this scroll offset from page top).
- `progress = clamp(scrollTop / COLLAPSE_DISTANCE, 0, 1)`
- `coverHeight = lerp(EXPANDED_MAX, COLLAPSED_MIN, progress)`
- `coverOpacity = 1 - progress`

Use `requestAnimationFrame` or passive scroll listener; respect `prefers-reduced-motion`: skip collapse/fade (fixed expanded cover, no scroll-driven animation).

### 4.3 Hook API

New hook: `useMainContentScroll()` in `src/hooks/use-main-content-scroll.ts`

- Finds `#main-content` once on mount.
- Returns `{ scrollTop, progress }` or a callback ref pattern.
- Cleans up listener on unmount.
- Returns `{ scrollTop: 0, progress: 0 }` if element missing (SSR / tests).

### 4.4 Motion tokens

Per DESIGN.md §12: scroll-linked transforms are **direct** (not spring-animated). No `motion/react` required for the collapse itself — CSS `height` + `opacity` driven by inline style or CSS variables updated on scroll. Duration is implicit (1:1 with scroll position).

---

## 5. Component changes

| File | Change |
| --- | --- |
| `record-profile-header.tsx` | Collapsing hero; breakout; scrim; scroll progress; **strip all edit UI** — display-only avatar |
| `record-profile-header-actions.tsx` | **Create** — panel-header `⋯` menu + upload dialog state (photos + ID card + delegates admin menu) |
| `record-actions-menu.tsx` | Refactor to export menu items or render as submenu; trigger moves to panel header |
| `use-main-content-scroll.ts` | **Create** — scroll progress from `#main-content` |
| `page.tsx` | Register `actions: <RecordProfileHeaderActions …/>` via `usePageHeader`; optional `-mt-6` on hero breakout |

**Unchanged:** upload dialog component, crop presets, authorization helpers.

### 5.1 DOM structure (target)

```tsx
<div className="-mx-4 sm:-mx-6 lg:-mx-8">
  {/* Collapsing cover layer — no camera FAB */}
  <div style={{ height: coverHeight, opacity: coverOpacity }} className="relative overflow-hidden">
    <Image … className="object-cover" />
    <div className="absolute inset-0 bg-gradient-to-b …" /> {/* scrim */}
  </div>

  {/* Identity — normal document flow, no action buttons */}
  <div className="relative px-4 sm:px-6 …">
    <Avatar … />  {/* display-only */}
    … name, email, role badges …
  </div>
</div>
```

### 5.2 Panel header actions (target)

```tsx
// page.tsx — usePageHeader
actions: user && account ? (
  <RecordProfileHeaderActions
    subject={user}
    viewer={account}
    tenant={tenant}
    recordQueryKey={recordQueryKey}
  />
) : null,
```

Menu groups (when permitted):

1. Profile media (photo uploads)
2. View ID card (own profile only)
3. Admin actions (existing `RecordActionsMenu` items)

---

## 6. Accessibility

- Cover image keeps `alt="Cover image"` (decorative context; no critical info in image alone).
- Scroll-driven motion disabled when `prefers-reduced-motion: reduce`.
- Panel-header edit menu remains keyboard-accessible; hero has no hidden focus traps.

---

## 7. Non-goals

- Sticky mini identity bar in `PanelHeader` on scroll (future enhancement).
- Parallax scale on cover image (adds complexity; collapse+fade is enough).
- Changing `PageContainer` border-x globally.
- Spotify-style play buttons / listener count overlay.
- Hiding Overview inline-field edit pencils (separate screenshot pass).

---

## 8. Verification

1. `/users/[id]` at scroll 0 — cover full bleed, no rounded corners, smooth scrim into cream.
2. Scroll down — cover shrinks and fades by ~200px scroll; identity block scrolls up cleanly.
3. Scroll back to top — cover restores smoothly.
4. Edit photos / ID card — works from panel-header `⋯` only; hero has zero buttons.
5. Screenshot hero — crop from name downward: no Photos, ID Card, camera, or ⋯ visible.
6. `prefers-reduced-motion` — no collapse/fade.
6. Mobile — breakout margins match `PageContainer` breakpoints; no horizontal overflow.
7. Section switch (Overview → Academic) — scroll position resets or hero remounts without stuck opacity.

---

## 9. Spec self-review

- [x] No TBD placeholders
- [x] Scroll container explicitly `#main-content`
- [x] DESIGN.md gradient exception documented (surface scrim only)
- [x] Scoped to user record header — no unrelated refactors
- [x] Single implementation unit — suitable for one plan
