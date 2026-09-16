# Schedjuice Design Foundation — Phase 1 (Re-alignment to DESIGN.md v2)

**Date:** 2026-06-21
**Status:** Approved (design); implementation pending
**Author:** brainstorming session
**Scope:** Phase 1 of a multi-phase re-alignment. Each later phase gets its own spec → plan → implementation cycle.

## 1. Summary

`DESIGN.md` was rewritten to define **Schedjuice v2**: a warm cream + two-tone data-green palette,
a bilingual type system, paper/rough-drawn texture, **Base UI** primitives (no Radix, no shadcn),
and a `data-theme` dark mode. The current app is, by contrast, a **generic shadcn-on-Radix app**
(slate/neutral OKLCH tokens, Geist, Lucide, `next-themes`) with ~71 `components/ui/*` components
imported across **~150+ feature files**.

A big-bang rewrite is not viable. Phase 1 therefore builds the **entire new design foundation as a
fully isolated "new world"** that coexists with the existing app and changes none of it. The new
world is proven in a **superadmin-only `/components`** in-house component library. Real feature
surfaces are migrated onto it later, surface-by-surface (strangler-fig), in subsequent phases.

## 2. Context — current vs. target gap

| Area | Current (v1, untouched by Phase 1) | Target (`DESIGN.md` v2) |
| --- | --- | --- |
| Components | `src/components/ui/*` shadcn on Radix; `components.json` | Hand-composed Base UI primitives in `src/components/primitives/` |
| Tokens | shadcn slate/neutral OKLCH (`--background`, `--primary`, `--muted`…) | Cream + data-green semantic tokens (§5) |
| Type | Geist sans/serif/mono | Bilingual stack w/ `unicode-range` routing (§6) |
| Dark mode | `.dark` class + `next-themes` | `data-theme` + cookie + inline script (§16) |
| Icons | `lucide-react` | Iconoir (`iconoir-react`), sparingly (§11) |
| Texture/motion | none | Paper grain + rough.js; `--ease-paper` etc. (§8, §12) |
| Showcase | none | Superadmin `/components` library (4 pages) |

## 3. Decisions (from brainstorming)

| Topic | Decision |
| --- | --- |
| Migration philosophy | **Parallel / strangler-fig.** New foundation is isolated; existing app is untouched. Migrate surfaces one-by-one in later phases. |
| Phase 1 boundary | **Showcase-only foundation.** No feature migrated. Proof = the `/components` library + the §15 "screenshot test". |
| Showcase access | **Superadmin-only `/components`** — doubles as the in-house component library future agents reference. |
| Dark mode | **Included, scoped to the new world.** Author light+dark tokens, `data-theme` infra, toggle on the showcase. Do **not** remove `next-themes` yet; the two theme systems coexist. |
| Token isolation | **`.sj-root` scope class** + scoped CSS-variable overrides (not a Tailwind prefix, not `@scope`). |
| Icon library | **Iconoir** (`iconoir-react`) — single distinctive stroke, on-brand vs. generic SaaS sets. |
| Dependency removal | **Deferred to Phase N.** The §14 "no Radix/shadcn" ban applies to **new code** now; removal of the packages happens only after their consumers are migrated. |

## 4. Phased roadmap (decomposition)

| Phase | Goal | Touches existing app? |
| --- | --- | --- |
| **1 — Foundation** *(this spec)* | Isolated new design world: scoped tokens (light+dark), bilingual type, `data-theme` infra, paper/rough decoration, motion easing tokens, ~21 Base UI primitives, superadmin `/components` library. Adds deps; removes none. | No — additive only |
| **2 — Pilot migration** | Migrate **one** low-risk real surface (e.g. login or profile) onto the primitives. Produces the repeatable migration playbook + first real-data/Burmese validation. | One surface |
| **3 … N-1 — Strangler tranches** | Migrate route-group by route-group; each tranche swaps shadcn→primitives and deletes the shadcn components it fully retires. The shared-shell flip to `data-theme` (retiring `next-themes`) lands in one of these. | Incrementally |
| **N — Cleanup** | Remove `components/ui`, Radix deps, `lucide-react`, `next-themes`, `components.json`, `auto-form`. The §14 "clean break" is fully realized here. | Final removal |

## 5. Phase 1 scope

### Goals

- A complete, isolated token layer (raw palette + semantic aliases + type scale + motion), light & dark.
- The bilingual type system (`unicode-range`-routed families) self-hosted and wired.
- `data-theme` theme infrastructure (cookie + inline pre-paint script + 3-way toggle), coexisting with `next-themes`.
- Paper-grain + rough.js decoration primitives with cached seeds.
- **~21 hand-composed Base UI primitives** under `src/components/primitives/`.
- A **superadmin-only `/components`** library with four pages (gallery, type, color, bilingual).

### Non-goals

- Migrating any feature surface or `components/ui/*` component (Phase 2+).
- Removing Radix, shadcn, `lucide-react`, or `next-themes` (Phase N).
- App composites (`<CourseCard>`, etc.) — primitives only (§10).
- Custom hand-drawn hero icon set (§11 tier 1 — later).
- Sound design (§12 — product-vision, later).

## 6. Dependencies

**Add** (used only by the new world in Phase 1):

| Purpose | Package | Notes |
| --- | --- | --- |
| Headless primitives | `@base-ui/react` | Renamed from `@base-ui-components/react`; v1.x stable. Import per-component, e.g. `{ Dialog } from "@base-ui/react/dialog"`. |
| Hand-drawn marks | `roughjs` | `import rough from "roughjs"`. Cache seeds (§8). |
| Utility icons | `iconoir-react` | Named imports; single 1.5px stroke. Used sparingly (§11). |
| Bilingual fonts | self-hosted `.woff2` | Noto Sans, Noto Sans Myanmar, Fraunces, Caveat, IBM Plex Mono, Padauk — all OFL, free to ship. |

**Remove:** nothing in Phase 1.
**Reuse (already installed):** `class-variance-authority`, `clsx`, `tailwind-merge` (`cn` at `@/lib/utils`), `motion`.

> Install note (AGENTS.md): `npm install --legacy-peer-deps` (React 19 vs `@azure/msal-react`).
> Verify the exact current `@base-ui/react` version at install; do not pin a guessed version.

## 7. Token & theme architecture (the isolation mechanism)

### 7.1 The `.sj-root` scope class

Every new token lives under a single scope class, applied at the `/components` layout root in
Phase 1 (and at the migrated app shell in later phases). This lets the same Tailwind utility name
mean different things inside vs. outside the new world.

### 7.2 Two kinds of tokens

- **New names (no collision)** — registered once in `@theme` (so `bg-surface`, `text-brand`, etc.
  exist), but the raw values are **defined only inside `.sj-root`**, so they are inert in the old
  app and correct in the new one.
  New: `--surface`, `--surface-elevated`, `--surface-inverse`, `--text-primary/secondary/muted`,
  `--text-on-inverse`, `--brand`, `--brand-foreground`, `--border-strong`, `--danger`, `--warning`,
  `--data-green(-strong)`, `--terminal`, `--circuit-board`, `--pixel-white`, `--warm-50…900`, and
  dark extras `--surface-hover/-active/-skeleton`, `--zebra-row`, `--overlay-scrim`, `--shadow-color`,
  `--tab-highlight`, `--tab-highlight-blend-mode`.
- **Colliding names** — do **not** touch the global `@theme`; **redefine the underlying variable
  inside `.sj-root`** only. CSS custom properties resolve lazily at use-site, so `bg-accent` becomes
  data-green-strong for descendants of `.sj-root` and stays shadcn-gray everywhere else.

#### Collision table (scope-override these; never re-register in `@theme`)

| Token | shadcn meaning (outside) | Schedjuice meaning (inside `.sj-root`) |
| --- | --- | --- |
| `--accent` | muted gray hover | `--data-green-strong` `#2F6E58` |
| `--accent-foreground` | dark text | white `#FFFFFF` |
| `--border` | light gray | warm ramp |
| `--ring` | gray | `color-mix(in srgb, var(--accent) 58%, var(--terminal) 12%)` |
| `--success` | generic green | `#2F7D54` (harmonized) |

> `--danger` (vs shadcn `--destructive`) and `--warning` (vs shadcn `--warning-yellow`) have
> **different names**, so they are additive, not overrides.

### 7.3 Illustrative CSS (additive; existing `:root`/`.dark` blocks untouched)

```css
@theme {
  /* ONLY the genuinely-new utilities */
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-brand: var(--brand);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  /* …warm ramp, data-green, terminal, tab-highlight, etc. */
}

.sj-root {
  /* raw palette (§5) */
  --pixel-white: #fcf4e3;  --terminal: #102c24;  --circuit-board: #2e4e49;
  --data-green: #60a17e;   --data-green-strong: #2f6e58;
  /* warm-50..900 ramp (brown undertone; no cool grays) */
  --danger: #b7432f;       --warning: #c98a2b;

  /* semantic — NEW names */
  --surface: var(--pixel-white);   --surface-elevated: #fffaec;
  --surface-inverse: var(--terminal);
  --text-primary: var(--terminal); --text-secondary: var(--circuit-board);
  --text-muted: var(--warm-600);   --text-on-inverse: var(--pixel-white);
  --brand: var(--data-green);      --brand-foreground: var(--terminal);
  --border-strong: /* warm ramp */;

  /* semantic — OVERRIDES of colliding shadcn names, scoped here only */
  --accent: var(--data-green-strong);  --accent-foreground: #fff;
  --ring: color-mix(in srgb, var(--accent) 58%, var(--terminal) 12%);
  --border: /* warm ramp */;           --success: #2f7d54;

  /* type scale (§6.5), motion (§12) */
  --text-xs: …; --text-base: 16px/1.6; --text-4xl: 44px/1.15; --text-hand: clamp(…);
  --ease-paper: …; --ease-quiet: …; --ease-out-soft: …;
  --duration-fast: …; --duration-normal: …; --duration-slow: …;
}

/* dark = pure token redefinition; NO Tailwind dark: variant needed in primitives */
html[data-theme="dark"] .sj-root {
  --surface: /* warm dark grey-brown */;  --text-primary: /* lifted cream */;
  --accent: /* lifted data-green for AA */;  --tab-highlight-blend-mode: screen;
  /* …all semantic + dark-extra overrides per §16 */
}
@media (prefers-color-scheme: dark) {
  html[data-theme="system"] .sj-root { /* same dark overrides */ }
}
```

Because primitives consume **semantic tokens** (`bg-surface`, `text-accent`, `border-border`),
dark mode is just the tokens being redefined — **no `dark:` utilities in primitive code**, so the
new theme system never collides with the existing `.dark` / `next-themes` one. The light-mode
`--tab-highlight-blend-mode` is `multiply`; dark flips it to `screen` (§16).

> Re-verify all computed WCAG ratios when the literal token values land in code (§5, §16).

### 7.4 Theme infrastructure (§16), additive to `next-themes`

- **`theme` cookie** — non-`httpOnly`, `path:/`, `sameSite:lax`, long `maxAge`.
- **`src/lib/theme-inline-script.ts`** — `beforeInteractive` (`next/script`) bootstrap that sets
  `data-theme` on `<html>` **before first paint** from cookie/`localStorage`.
- **Root `layout.tsx`** — seeds `data-theme` from the cookie via `cookies()` (Server Component),
  injects the blocking script, adds `suppressHydrationWarning` on `<html>`. This sits **alongside**
  the existing `next-themes` provider; they manage different attributes (`data-theme` vs `.dark`),
  so there is zero conflict. `color-scheme` set per resolved theme.
- **Toggle** — a 3-way (light / dark / system) control on the showcase writes the cookie +
  `localStorage` + the `<html>` attribute.

> Phase 1 changes to the shared root layout are **strictly additive** (attribute + script). The
> app-wide cutover that *removes* `next-themes` is a later phase.

## 8. Typography (bilingual, §6)

Self-host `.woff2` and hand-write `@font-face` with `unicode-range` in `globals.css` (`next/font`
cannot express a single family that routes Latin vs. Burmese, which §6.1 requires). Four families,
each a Latin face + a Myanmar face under one family name:

| Family token | Latin | Myanmar (routed via `unicode-range`) | Role |
| --- | --- | --- | --- |
| `--font-sans` ("Schedjuice Sans") | Noto Sans | Noto Sans Myanmar | Body (16px min, 1.6 lh) |
| `--font-serif` ("Schedjuice Serif") | Fraunces | Noto Sans Myanmar | Headers (`text-balance`) |
| `--font-hand` ("Schedjuice Hand") | Caveat | Padauk *(placeholder)* | 3–5 accent moments/surface |
| `--font-mono` ("Schedjuice Mono") | IBM Plex Mono | — | Codes, tabular numbers |

- Give each `@font-face` an explicit, **non-overlapping** `unicode-range` (Myanmar block
  `U+1000–109F` + extensions `U+A9E0–A9FF`, `U+AA60–AA7F`) so the Myanmar face always wins for
  Burmese codepoints. Verify ranges in the bilingual showcase.
- No `text-transform: uppercase` on Burmese (§6.1, §7, banned §14 #13).
- Padauk-for-Hand is a **documented placeholder** until a licensed Burmese hand face is sourced.

## 9. Decoration (§8)

In `src/components/primitives/decoration/`:

- **`<PaperGrain />`** — inline SVG noise (~5–6% opacity), `fill="var(--text-primary)"` so grain
  flips with ink. Mounted once in the showcase layout.
- **`<RoughUnderline />`, `<RoughFrame />`, `<RoughDivider />`, `<RoughCallout />`** — rough.js
  helpers with **cached seeds** (no re-wobble per render); strokes use `currentColor` or semantic
  vars (`--accent`/`--brand`/status), never orphaned raw palette reads (§16).
- Prefer rough strokes over hard 1px borders for dividers/callouts (§8); no `<hr>` where a
  `<RoughDivider />` fits (banned §14 #14).

## 10. Primitives (~21, §10 + §273 checklist)

In `src/components/primitives/`, each hand-composed on a Base UI primitive with tokens + `cva`/`cn`:

- **Form/inputs:** `Button`, `Input`, `Textarea`, `NumberField`, `Select`, `Combobox`, `Checkbox`,
  `RadioGroup`, `Switch`, `Slider`, `Field` (verbose field-by-field composition; **no `<AutoForm>`**).
- **Overlays:** `Dialog`, `AlertDialog`, `Sheet` (side-anchored Base UI `Dialog`, or the now-stable
  `Drawer`), `Popover`, `Tooltip`, `Menu`, `Toast`.
- **Navigation/structure:** `Tabs`, `Separator`, `Avatar`.

Rules: buttons **text-led** (icons only on destructive/confirm, §11); modal/sheet titles mandatory
for SR (`sr-only` if hidden, §13); focus rings visible/themed via `--ring` (§13). Target **WCAG AA**
on every primitive (contrast, keyboard, focus, `aria-label` on icon-only controls).

> `Avatar`: §10 said "compose" because Base UI lacked it; Base UI now ships `Avatar`, so use it
> (doc reconciliation §15 below). If any primitive is genuinely missing, implement with proper ARIA
> — never vendor-pull from elsewhere (§10).

## 11. Showcase — superadmin `/components`

Route group `(design)/components/` with its **own layout** (not the shadcn app shell):

```
src/app/(design)/components/
  layout.tsx         # sets .sj-root, loads fonts, mounts <PaperGrain/> + 3-way theme toggle
  page.tsx           # primitive gallery — the in-house library agents reference
  type/page.tsx      # typography + locked scale
  color/page.tsx     # raw palette + semantic tokens, light & dark
  bilingual/page.tsx # §7 stress tests
```

- **Bilingual page must include** (§7): one Burmese-only paragraph, one mixed paragraph, a Burmese
  name in a `Button`, a Burmese name in a table cell, a handwriting-style quote, a Myanmar-digit
  currency string, and mixed-script form labels.
- **Gating:** an explicit `isSuperAdmin(account)` branch in `middleware.ts` for paths under
  `/components` (superadmins already bypass the permission guard); non-superadmins redirect to
  `/home`. Optionally surface a nav entry only to superadmins.

## 12. Directory layout (new files only)

```
src/
  app/
    (design)/components/{layout,page}.tsx + {type,color,bilingual}/page.tsx
    globals.css                 # ADD @theme new tokens + .sj-root + @font-face (additive)
    layout.tsx                  # ADD data-theme seed + inline script (additive)
    fonts/                      # self-hosted .woff2 (or public/fonts/)
  components/primitives/
    button.tsx, input.tsx, … (the ~21)
    decoration/{paper-grain,rough-underline,rough-frame,rough-divider,rough-callout}.tsx
  lib/
    theme-inline-script.ts
    sj/                         # theme cookie helpers (reuse cn from @/lib/utils)
```

## 13. What Phase 1 does NOT touch

`src/components/ui/*`, all Radix/`lucide-react`/`next-themes`, `components.json`, `auto-form`, and
every existing feature surface. The only shared file edits are **additive**: `globals.css`
(`@theme` additions + `.sj-root` + `@font-face`) and root `layout.tsx` (theme seed + script).

## 14. Phase 1 "done" criteria (§15)

- All four `/components` pages render correctly under superadmin auth.
- Every primitive implemented with passing **AA** contrast + keyboard support + focus visibility.
- The bilingual page shows **no broken rendering** (mixed-script, MY-in-button/table, MY digits).
- **Both light & dark** themes work via the toggle, with no flash of wrong theme (inline script).
- The **screenshot test** is unambiguous: the gallery placed next to a vanilla shadcn dashboard is
  immediately identifiable as Schedjuice.
- The existing app is visually and behaviorally **unchanged**.

## 15. Doc reconciliations (fold into `DESIGN.md`)

- **§15 living references** currently point at `/design/*`; update to **`/components/*`** (superadmin).
- **§10 Avatar** ("compose; no Base UI Avatar") — Base UI now ships `Avatar`; note we use it.
- Record the **`.sj-root` scoping** + `next-themes` coexistence as the transitional mechanism until
  the Phase-N shell cutover.

## 16. Risks & open questions

- **Tailwind v4 `@theme` + scoped overrides:** relies on lazy `var()` resolution at use-site.
  Validate early with a tiny spike (one new token + one overridden token, in and out of `.sj-root`).
- **`@base-ui/react` ↔ React 19 / Next 15 / Turbopack:** confirm SSR + `--legacy-peer-deps` install.
- **Font payload:** six self-hosted families is heavy; subset `.woff2` (Latin + Myanmar blocks),
  `font-display: swap`, and preload the body face.
- **`Sheet` base:** decide `Dialog`-side-anchored vs. Base UI `Drawer` during implementation.
- **Primitive count:** ~21 is large for one phase; the implementation plan should batch them
  (e.g. inputs → overlays → structure) behind the showcase, not split the spec.
- **Open:** exact warm-ramp hex values (`--warm-50…900`) and the dark-mode literal values are not
  in `DESIGN.md`; derive them during implementation and verify AA, then back-fill into `DESIGN.md` §5/§16.
