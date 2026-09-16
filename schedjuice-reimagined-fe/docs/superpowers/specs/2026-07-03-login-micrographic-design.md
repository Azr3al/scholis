# Login page micrographic — Design Spec

> Add a static, geometry-heavy ornamental micrographic beneath the login form in `schedjuice-reimagined-fe`. Visual language is engineering-schematic (hairline lines, circles, grids); copy is quiet timetable notation with **Yangon** and **tenant name** as the only proper-noun nods.

**Status:** Approved (brainstorming 2026-07-03)
**Authority:** [`docs/AGENT_UI_SYSTEM.md`](../../AGENT_UI_SYSTEM.md) — semantic tokens, shadcn composition
**Date:** 2026-07-03

---

## 1. Problem

The login page (`src/components/auth/login-form.tsx`) is functional but visually sparse below the form card. The only footer ornament today is an 8px mono line: *"Developed by Schedjuice in Yangon."* There is no decorative anchor that reinforces Schedjuice’s scheduling domain or adds craft beneath the form.

The product needs a **micrographic** — dense geometric line art with minimal text — placed **under the login form**, visible on both login flows (email/password and Microsoft-only).

---

## 2. Goals

1. **Ornamental only** — no fake live data, no interactive elements, no animation.
2. **Geometry-first** — multiple static clusters (dot grid, segmented dial, node schematic, cross grid, flow lines) inspired by technical/engineering micrographics.
3. **Quiet copy** — timetable-style fragments (`Mon`, `Wk 12`, `08:30`, `Room 214`, `Ready`); **no** hex codes, `SCREAMING_SNAKE`, or cyberpunk HUD jargon.
4. **Schedjuice nods** — always show **`Yangon`**; show **`tenant.name`** (truncated when long).
5. **Responsive** — full panel on desktop (`md+`); compact horizontal strip on mobile.
6. **Theme-safe** — works in light and dark via semantic color (`currentColor` strokes).

### Non-goals

- Animation or interaction feedback on focus/submit.
- Replacing the photo carousel or left-column hero art.
- Live tenant/session data from the API.
- Changes to `schedjuice-rereimagined` or backend.
- Replacing or removing the existing *"Developed by Schedjuice in Yangon."* line.

---

## 3. Locked decisions (brainstorming)

| Topic | Decision |
| --- | --- |
| App | `schedjuice-reimagined-fe` |
| Placement | Inside login `Card`, below terms/footer links, above *"Developed by Schedjuice in Yangon."* |
| Login flows | Both email/password **and** Microsoft-only tenants |
| Content tone | Schedjuice-flavored (timetable notation) + hybrid nod (`Yangon` + `tenant.name`) |
| Buzzwords | Avoid — no hex, no system-style labels |
| Motion | Fully static |
| Desktop | Full schematic panel (~384px wide, ~48–64px tall content area) |
| Mobile | Compact strip (~24–28px tall); fewer labels, same geometric glyphs |
| Implementation | Static SVG asset(s) with `currentColor` strokes + thin React wrapper for tenant overlay |
| A11y | `aria-hidden`, `pointer-events-none` — decorative |

---

## 4. Visual composition

### 4.1 Geometric clusters (desktop panel)

All strokes **1px hairline**. Fictional data only.

| Cluster | Elements |
| --- | --- |
| **Header row** | `Mon · Wk 12` (left), `3 sessions` (right) — small mono caps/sentence case |
| **Status array** | 4×4 dot grid; 2–3 cells as `×` or filled `●` |
| **Segmented dial** | Open arc ring with `88%` inside (progress readout, not “system status”) |
| **Node schematic** | Circles connected by **orthogonal** (90°) paths; center node filled |
| **Cross micro-grid** | 3×3 grid of `+` and one `×` |
| **Flow baseline** | Horizontal line with forked branches to small circles |
| **Connector labels** | `08:30` and `Room 214` near schematic arms — timetable hints, not tech labels |
| **Bottom readout** | `Ready · Yangon · {tenant.name}` — middle-dot separated, tenant truncated |

### 4.2 Desktop lofi mockup

```
┌──────────────────────────────────────────────────────┐
│  Mon · Wk 12                              3 sessions │
│                                                      │
│  ┌─┬─┬─┬─┐     ╭──╮         ○───────┐               │
│  │●│●│×│○│     │88│    ○───┘       └───○            │
│  ├─┼─┼─┼─┤     ╰──╯         │                        │
│  │○│●│●│○│              ┌───┴───┐                    │
│  └─┴─┴─┘                │   ●   │                    │
│                           └───┬───┘                    │
│                               │                        │
│     +  +  +            ○──────┴──────○                 │
│     +  ×  +            08:30          Room 214         │
│     +  +  +                                          │
│                                                      │
│  ───●──────────────●──────────●───                   │
│       ╲            │          ╱                        │
│        ○───────────┴─────────○                         │
│                                                      │
│  Ready · Yangon · Teachers Union Center              │
└──────────────────────────────────────────────────────┘
```

### 4.3 Mobile compact strip

Horizontal ribbon — three tiny geometric glyphs + minimal text:

```
●●×○○ │ +×+ │ ○─┬─○ │ Mon · Yangon · Teachers Union Center
```

- Same SVG vocabulary, cropped or separate compact asset.
- Max **3** text fragments on mobile (`Mon`, `Yangon`, truncated tenant).
- `hidden md:block` for panel; `md:hidden` for strip.

### 4.4 Label budget

| Breakpoint | Max text fragments | Includes |
| --- | --- | --- |
| Desktop | 6 | header pair, dial %, two timetable labels, bottom readout (counts as one row with 3 parts) |
| Mobile | 3 | `Mon`, `Yangon`, tenant name |

**Never use:** hex strings, `UPPER_SNAKE` system names, fake errors, non-English filler for aesthetic only.

---

## 5. Typography and color

| Element | Style |
| --- | --- |
| SVG strokes | `currentColor`, 1px; wrapper `text-muted-foreground/60` |
| SVG text (static labels in asset) | `font-family: ui-monospace` at ~9–10px; same color inheritance |
| Tenant overlay (React) | `font-mono text-[10px] text-muted-foreground/70 tabular-nums`; truncate with `max-w-[140px]` inline or ellipsis in readout row |
| Border frame (optional) | `border border-border/40 rounded-sm` on wrapper — subtle, not Card-heavy |

Dark mode: no separate asset if `currentColor` is used throughout; verify contrast on `bg-background` and over mobile photo overlay (card may use `bg-background` on small screens — graphic sits inside card).

---

## 6. Component architecture

```
src/components/auth/
  login-micrographic.tsx   # wrapper + inline SVG (panel + compact variants)
```

**Note:** This repo has no SVGR/webpack SVG-as-component pipeline. Static art is authored as inline `<svg>` markup inside `login-micrographic.tsx` so strokes inherit `currentColor` in light and dark mode. Optional standalone `.svg` files may be kept alongside for design iteration but are not loaded at runtime.

**`LoginMicrographic` props:**

```tsx
type LoginMicrographicProps = {
  tenantName: string;
  className?: string;
};
```

**Behavior:**

- Renders compact strip on `< md`, full panel on `md+`.
- Injects `tenantName` into bottom readout (desktop) and end of strip (mobile) with CSS truncation.
- `Yangon` and static labels live in SVG; tenant name is React-rendered adjacent to or over a reserved slot in the readout row.

**Integration point** — `login-form.tsx`, inside `Card`, after terms block (~line 378), before the 8px mono footer:

```tsx
<LoginMicrographic tenantName={tenant.name} className="mt-6" />
```

Also render for Microsoft-only branch (currently only MS button — graphic still applies).

---

## 7. SVG export requirements

1. **Strokes/fills:** `stroke="currentColor"`; avoid hardcoded `#000` / `#fff`.
2. **ViewBox:** Panel `0 0 384 64` (adjust to final art); compact `0 0 320 24`.
3. **Text in SVG:** Static fragments only (`Mon · Wk 12`, `88%`, `08:30`, `Room 214`, `Ready · Yangon ·` prefix leaving gap for tenant overlay).
4. **No embedded fonts** — system monospace stack via CSS on `<text>` elements.
5. **Optimize** with SVGO or hand-trim; target < 8KB per file.

---

## 8. Accessibility

- Wrapper: `aria-hidden="true"`.
- No focusable children.
- Decorative — no alt text needed on inline `<img>` if used; prefer inline SVG component import for color inheritance.

---

## 9. Testing and verification

Manual checklist (no automated test required for static ornament):

| Check | Expected |
| --- | --- |
| Desktop login (email flow) | Panel visible below form, tenant name shown |
| Desktop login (MS-only tenant) | Same panel visible |
| Mobile width | Compact strip only; panel hidden |
| Long tenant name | Truncates without breaking layout |
| Dark mode toggle | Strokes remain visible, not pure black on black |
| `prefers-reduced-motion` | N/A (static) |

---

## 10. Files touched

| File | Action |
| --- | --- |
| `src/components/auth/login-micrographic.tsx` | Create (wrapper + inline panel/compact SVG) |
| `src/components/auth/login-form.tsx` | Import + render component (both login flows) |

---

## 11. Future extensions (out of scope)

- Animated scan line or status pulse.
- Tenant-specific timetable copy from API.
- Shared micrographic system for other auth pages (register, forgot-password).
