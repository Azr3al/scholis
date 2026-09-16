# Design Foundation — Plan 1: Tokens, Theme, Fonts & Showcase Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the isolated "new design world" — a `.sj-root`-scoped token layer (light + dark), the bilingual font stack, `data-theme` infrastructure, paper/rough decoration, and a superadmin-only `/components` shell with the color/type/bilingual showcase pages — without changing the existing app.

**Architecture:** All new tokens live under a `.sj-root` scope class. Genuinely-new token names are registered once in Tailwind's `@theme` and defined only inside `.sj-root`; names that collide with the existing shadcn tokens (`--accent`, `--accent-foreground`, `--border`, `--ring`, `--success`, plus the font tokens) are NOT re-registered — we override the underlying CSS variable inside `.sj-root` only, relying on lazy `var()` resolution so the old app is untouched. Dark mode is pure token redefinition under `html[data-theme="dark"] .sj-root` (no Tailwind `dark:` variant in new code), driven by a `theme` cookie + a pre-paint inline script, coexisting with the existing `next-themes` `.dark` system.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, TypeScript, Vitest, `roughjs`, `iconoir-react`. Conventions: `cn()` from `@/lib/utils`, no raw hex in components (tokens only), `--legacy-peer-deps` for installs.

**Spec:** `docs/superpowers/specs/2026-06-21-design-foundation-phase-1.md` (§6 deps, §7 tokens/theme, §8 fonts, §9 decoration, §11 showcase).
**Design source:** `DESIGN.md` §5 (color), §6 (type), §8 (texture), §12 (motion), §16 (dark mode).
**Depends on:** nothing (additive foundation). **Blocks:** Plans 2–4 (primitives) consume these tokens, fonts, and the `.sj-root` scope.

> **Commit policy:** This repo defers commits until the user requests them (`no-git-commits.mdc`). The `Commit` steps below describe the intended cadence; when executing, confirm with the user before actually committing (or batch at the end if they prefer).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json` / `package-lock.json` | Add `roughjs`, `iconoir-react` |
| `src/lib/sj/contrast.ts` (NEW) | Pure WCAG contrast-ratio util (hex → ratio) |
| `src/lib/sj/contrast.test.ts` (NEW) | Contrast util unit tests |
| `src/lib/sj/palette.ts` (NEW) | Canonical token hex constants (single source for tests) |
| `src/lib/sj/palette.test.ts` (NEW) | Asserts §5 contrast pairings meet AA |
| `src/lib/sj/theme.ts` (NEW) | `theme` cookie read/write + `resolveTheme` |
| `src/lib/sj/theme.test.ts` (NEW) | Theme helper unit tests |
| `src/lib/theme-inline-script.ts` (NEW) | Pre-paint `data-theme` bootstrap string |
| `src/app/globals.css` | ADD `@theme` new tokens, `.sj-root` light/dark tokens, `@font-face` (all additive) |
| `src/app/layout.tsx` | ADD `data-theme` cookie seed + inline script (additive; keep `next-themes`) |
| `public/fonts/` (NEW) | Self-hosted `.woff2` (Noto Sans, Noto Sans Myanmar, Fraunces, Caveat, IBM Plex Mono, Padauk) |
| `src/components/primitives/theme-toggle.tsx` (NEW) | 3-way light/dark/system toggle |
| `src/components/primitives/decoration/paper-grain.tsx` (NEW) | Inline SVG grain overlay |
| `src/components/primitives/decoration/rough-underline.tsx` (NEW) | rough.js underline |
| `src/components/primitives/decoration/rough-frame.tsx` (NEW) | rough.js frame |
| `src/components/primitives/decoration/rough-divider.tsx` (NEW) | rough.js divider |
| `src/components/primitives/decoration/rough-callout.tsx` (NEW) | rough.js callout box |
| `src/middleware.ts` | ADD superadmin gate for `/components` |
| `src/app/(design)/components/layout.tsx` (NEW) | `.sj-root` shell: fonts, grain, toggle, nav |
| `src/app/(design)/components/page.tsx` (NEW) | Gallery index (stub; filled by Plans 2–4) |
| `src/app/(design)/components/color/page.tsx` (NEW) | Color/token showcase |
| `src/app/(design)/components/type/page.tsx` (NEW) | Typography showcase |
| `src/app/(design)/components/bilingual/page.tsx` (NEW) | Bilingual stress test |

**Run a single test:** `npm run test:unit -- src/lib/sj/contrast.test.ts`
**Run the dev server:** `npm run dev` (port 3000) — log in as a superadmin to view `/components`.

---

## Task 1: Install dependencies

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install roughjs iconoir-react --legacy-peer-deps
```

(`roughjs` ships its own types; `iconoir-react` is typed. `--legacy-peer-deps` per `AGENTS.md`. `@base-ui/react` is installed in Plan 2 where the first primitive uses it.)

- [ ] **Step 2: Verify the project still builds**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(design): add roughjs + iconoir-react for the design foundation"
```

---

## Task 2: WCAG contrast utility (TDD)

**Files:**
- Create: `src/lib/sj/contrast.ts`
- Test: `src/lib/sj/contrast.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/sj/contrast.test.ts
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";

describe("relativeLuminance", () => {
  it("is 0 for black and ~1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });
  it("is symmetric and 1:1 for identical colors", () => {
    expect(contrastRatio("#102C24", "#102C24")).toBeCloseTo(1, 5);
    expect(contrastRatio("#FCF4E3", "#102C24")).toBeCloseTo(
      contrastRatio("#102C24", "#FCF4E3"),
      5,
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:unit -- src/lib/sj/contrast.test.ts`
Expected: FAIL ("Cannot find module './contrast'").

- [ ] **Step 3: Implement the util**

```typescript
// src/lib/sj/contrast.ts
/** WCAG 2.1 relative luminance + contrast ratio from #RRGGBB hex. */

function channel(srgb: number): number {
  const c = srgb / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const int = parseInt(m[1], 16);
  const r = channel((int >> 16) & 0xff);
  const g = channel((int >> 8) & 0xff);
  const b = channel(int & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm run test:unit -- src/lib/sj/contrast.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sj/contrast.ts src/lib/sj/contrast.test.ts
git commit -m "feat(design): add WCAG contrast utility"
```

---

## Task 3: Canonical palette constants + AA pairing tests (TDD)

These constants are the single source of truth the tests read; the CSS in later tasks uses the
same literal values (kept in sync by comment cross-reference). Derived warm-ramp and dark values
are concrete here so the plan has no placeholders; the tests guarantee they meet AA.

**Files:**
- Create: `src/lib/sj/palette.ts`
- Test: `src/lib/sj/palette.test.ts`

- [ ] **Step 1: Write the failing test (the AA contract)**

```typescript
// src/lib/sj/palette.test.ts
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { DARK, LIGHT, RAW } from "./palette";

describe("light theme contrast (DESIGN.md §5)", () => {
  it("body text (terminal on cream) is AAA", () => {
    expect(contrastRatio(RAW.terminal, RAW.pixelWhite)).toBeGreaterThanOrEqual(7);
  });
  it("secondary text (circuit-board on cream) is AAA", () => {
    expect(contrastRatio(RAW.circuitBoard, RAW.pixelWhite)).toBeGreaterThanOrEqual(7);
  });
  it("muted text (warm-600 on cream) is AA body", () => {
    expect(contrastRatio(LIGHT.textMuted, LIGHT.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("button label (white on accent) is AA body", () => {
    expect(contrastRatio(LIGHT.accentForeground, LIGHT.accent)).toBeGreaterThanOrEqual(4.5);
  });
  it("inline link (accent on cream) is AA body", () => {
    expect(contrastRatio(LIGHT.accent, LIGHT.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("dark theme contrast (DESIGN.md §16)", () => {
  it("body text on dark surface is AAA", () => {
    expect(contrastRatio(DARK.textPrimary, DARK.surface)).toBeGreaterThanOrEqual(7);
  });
  it("link/accent-as-text on dark surface is AA body", () => {
    expect(contrastRatio(DARK.accent, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("button label on dark accent is AA body", () => {
    expect(contrastRatio(DARK.accentForeground, DARK.accent)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:unit -- src/lib/sj/palette.test.ts`
Expected: FAIL ("Cannot find module './palette'").

- [ ] **Step 3: Implement the constants**

```typescript
// src/lib/sj/palette.ts
/**
 * Canonical Schedjuice token hexes (DESIGN.md §5/§16). Single source for AA tests.
 * The .sj-root CSS in globals.css MUST use these same literals (cross-referenced by comment).
 */

export const RAW = {
  pixelWhite: "#FCF4E3",
  terminal: "#102C24",
  circuitBoard: "#2E4E49",
  dataGreen: "#60A17E",
  dataGreenStrong: "#2F6E58",
  danger: "#B7432F",
  success: "#2F7D54",
  warning: "#C98A2B",
} as const;

/** Warm grayscale ramp — brown undertone, no cool grays (DESIGN.md §5). */
export const WARM = {
  50: "#FBF6EC",
  100: "#F3EAD8",
  200: "#E7D9BF",
  300: "#D3BE9A",
  400: "#B59E76",
  500: "#8F7A55",
  600: "#6F5E40",
  700: "#523F2A",
  800: "#36281A",
  900: "#1F160D",
} as const;

export const LIGHT = {
  surface: RAW.pixelWhite,
  surfaceElevated: "#FFFAEC",
  textPrimary: RAW.terminal,
  textSecondary: RAW.circuitBoard,
  textMuted: WARM[600],
  accent: RAW.dataGreenStrong,
  accentForeground: "#FFFFFF",
  brand: RAW.dataGreen,
  border: WARM[200],
  borderStrong: WARM[300],
} as const;

/** Warm dark grey-brown surfaces; lifted greens for AA (DESIGN.md §16). */
export const DARK = {
  surface: "#1A1714",
  surfaceElevated: "#24201B",
  textPrimary: "#F0E9D9",
  textSecondary: "#C8BBA0",
  textMuted: "#9A8E76",
  accent: "#66B393",
  accentForeground: RAW.terminal,
  brand: "#7FB89A",
  border: "#3A332B",
  borderStrong: "#4C443A",
} as const;
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm run test:unit -- src/lib/sj/palette.test.ts`
Expected: PASS (all 8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sj/palette.ts src/lib/sj/palette.test.ts
git commit -m "feat(design): add canonical palette constants with AA contrast tests"
```

---

## Task 4: Light token layer in globals.css (`@theme` + `.sj-root`)

**Files:** Modify: `src/app/globals.css`

Add the following **at the end** of `globals.css` (do not edit the existing `@theme`, `:root`, or
`.dark` blocks). New utility names are registered in a second `@theme` block; colliding names
(`--accent`, `--accent-foreground`, `--border`, `--ring`, `--success`, `--font-*`) are only
overridden inside `.sj-root`.

- [ ] **Step 1: Register the genuinely-new Tailwind tokens**

```css
/* === Schedjuice v2 design world (DESIGN.md). Additive; scoped to .sj-root. === */
@theme {
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-surface-inverse: var(--surface-inverse);
  --color-surface-hover: var(--surface-hover);
  --color-surface-active: var(--surface-active);
  --color-surface-skeleton: var(--surface-skeleton);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-text-on-inverse: var(--text-on-inverse);
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --color-border-strong: var(--border-strong);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  --color-zebra-row: var(--zebra-row);
  --color-tab-highlight: var(--tab-highlight);
  --font-hand: var(--font-hand);
  /* consumable font-size utilities: text-hand, text-mono-sm, text-mono-base */
  --text-hand: clamp(1.25rem, 1rem + 1.2vw, 1.75rem);
  --text-mono-sm: 0.875rem;
  --text-mono-base: 1rem;
}
```

(Registering `--text-*` keys generates the matching `text-*` font-size utilities without removing
Tailwind's defaults; the mono utilities still need `font-mono` for the family.)

- [ ] **Step 2: Define the light tokens on `.sj-root`** (values mirror `src/lib/sj/palette.ts`)

```css
.sj-root {
  /* raw palette — DESIGN.md §5 */
  --pixel-white: #fcf4e3;
  --terminal: #102c24;
  --circuit-board: #2e4e49;
  --data-green: #60a17e;
  --data-green-strong: #2f6e58;
  --danger: #b7432f;
  --success: #2f7d54;
  --warning: #c98a2b;
  /* warm ramp — palette.ts WARM */
  --warm-50: #fbf6ec;  --warm-100: #f3ead8;  --warm-200: #e7d9bf;
  --warm-300: #d3be9a; --warm-400: #b59e76;  --warm-500: #8f7a55;
  --warm-600: #6f5e40; --warm-700: #523f2a;  --warm-800: #36281a;
  --warm-900: #1f160d;

  /* semantic — NEW names */
  --surface: var(--pixel-white);
  --surface-elevated: #fffaec;
  --surface-inverse: var(--terminal);
  --surface-hover: var(--warm-100);
  --surface-active: var(--warm-200);
  --surface-skeleton: var(--warm-100);
  --text-primary: var(--terminal);
  --text-secondary: var(--circuit-board);
  --text-muted: var(--warm-600);
  --text-on-inverse: var(--pixel-white);
  --brand: var(--data-green);
  --brand-foreground: var(--terminal);
  --border-strong: var(--warm-300);
  --zebra-row: color-mix(in srgb, var(--warm-100) 60%, transparent);
  --overlay-scrim: color-mix(in srgb, var(--terminal) 38%, transparent);
  --shadow-color: 16 44 36;
  --tab-highlight: color-mix(in srgb, var(--brand) 30%, transparent);
  --tab-highlight-blend-mode: multiply;

  /* semantic — OVERRIDES of colliding shadcn names (scoped here only) */
  --accent: var(--data-green-strong);
  --accent-foreground: #ffffff;
  --border: var(--warm-200);
  --ring: color-mix(in srgb, var(--accent) 58%, var(--terminal) 12%);
  /* --success overridden to the harmonized warm-palette green */
  --success: #2f7d54;

  /* base chrome — safe to also apply to portaled .sj-root carriers (no forced background) */
  color-scheme: light;
  color: var(--text-primary);
}
```

> **Portals:** Base UI overlays render in a portal at `document.body`, **outside** this layout's
> `.sj-root`. So overlay primitives (Plan 3) and portaled inputs (Select/Combobox, Plan 2) add the
> `sj-root` class to their portaled element (Positioner / Backdrop+Popup / Viewport). Because the
> dark selector is `html[data-theme="dark"] .sj-root`, those portaled carriers still flip correctly.
> The page background comes from the layout's `bg-surface` class (Task 14), not this rule, so popups
> are free to set their own `bg-surface-elevated`.

- [ ] **Step 3: Verify the existing app is unaffected**

Run: `npm run dev`, open an existing page (e.g. `/login`).
Expected: identical to before (no `.sj-root` ancestor ⇒ new tokens never resolve).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): add scoped light token layer under .sj-root"
```

---

## Task 5: Dark token overrides (`data-theme`) in globals.css

**Files:** Modify: `src/app/globals.css`

Dark mode is pure token redefinition — no Tailwind `dark:` variant. Add **after** the `.sj-root`
block. `[data-theme="dark"]` is an explicit choice; `[data-theme="system"]` + the media query
follows the OS. Values mirror `DARK` in `src/lib/sj/palette.ts`.

- [ ] **Step 1: Add the explicit-dark override block**

```css
/* Dark = warm dark grey-brown surfaces, lifted greens (DESIGN.md §16). */
html[data-theme="dark"] .sj-root {
  --surface: #1a1714;
  --surface-elevated: #24201b;
  --surface-inverse: var(--pixel-white);
  --surface-hover: #24201b;
  --surface-active: #2e2922;
  --surface-skeleton: #24201b;
  --text-primary: #f0e9d9;
  --text-secondary: #c8bba0;
  --text-muted: #9a8e76;
  --text-on-inverse: var(--terminal);
  --brand: #7fb89a;
  --brand-foreground: var(--terminal);
  --accent: #66b393;
  --accent-foreground: #102c24;
  --border: #3a332b;
  --border-strong: #4c443a;
  --ring: color-mix(in srgb, var(--accent) 60%, #ffffff 8%);
  --success: #57b87e;
  --danger: #e07a64;
  --warning: #e0a94e;
  --zebra-row: color-mix(in srgb, #ffffff 4%, transparent);
  --overlay-scrim: color-mix(in srgb, #000000 60%, transparent);
  --shadow-color: 0 0 0;
  --tab-highlight: color-mix(in srgb, var(--brand) 34%, transparent);
  --tab-highlight-blend-mode: screen;
  color-scheme: dark;
}
```

- [ ] **Step 2: Add the system-follows-OS rule**

```css
@media (prefers-color-scheme: dark) {
  html[data-theme="system"] .sj-root {
    --surface: #1a1714;
    --surface-elevated: #24201b;
    --surface-inverse: var(--pixel-white);
    --surface-hover: #24201b;
    --surface-active: #2e2922;
    --surface-skeleton: #24201b;
    --text-primary: #f0e9d9;
    --text-secondary: #c8bba0;
    --text-muted: #9a8e76;
    --text-on-inverse: var(--terminal);
    --brand: #7fb89a;
    --brand-foreground: var(--terminal);
    --accent: #66b393;
    --accent-foreground: #102c24;
    --border: #3a332b;
    --border-strong: #4c443a;
    --ring: color-mix(in srgb, var(--accent) 60%, #ffffff 8%);
    --success: #57b87e;
    --danger: #e07a64;
    --warning: #e0a94e;
    --zebra-row: color-mix(in srgb, #ffffff 4%, transparent);
    --overlay-scrim: color-mix(in srgb, #000000 60%, transparent);
    --shadow-color: 0 0 0;
    --tab-highlight: color-mix(in srgb, var(--brand) 34%, transparent);
    --tab-highlight-blend-mode: screen;
    color-scheme: dark;
  }
}
```

(The two dark blocks are intentionally identical — one for explicit dark, one for system+OS-dark.
A SCSS-style mixin isn't available in plain CSS; the duplication is the cost of avoiding `next-themes`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): add scoped dark token overrides via data-theme"
```

---

## Task 6: Type scale + motion tokens in globals.css

**Files:** Modify: `src/app/globals.css`

Add inside the `.sj-root` block (append to it). Scale from `DESIGN.md` §6.5; easings from §12.

- [ ] **Step 1: Add type + motion tokens to `.sj-root`**

```css
.sj-root {
  /* type scale — DESIGN.md §6.5 (size / line-height) */
  --text-xs: 0.75rem;    --leading-xs: 1.5;
  --text-sm: 0.875rem;   --leading-sm: 1.55;
  --text-base: 1rem;     --leading-base: 1.6;
  --text-lg: 1.125rem;   --leading-lg: 1.55;
  --text-xl: 1.25rem;    --leading-xl: 1.45;
  --text-2xl: 1.5rem;    --leading-2xl: 1.35;
  --text-3xl: 2rem;      --leading-3xl: 1.25;
  --text-4xl: 2.75rem;   --leading-4xl: 1.15;
  /* --text-hand and --text-mono-sm/base are registered in @theme (Task 4) as utilities */

  /* motion — DESIGN.md §12 (paper-and-pencil physics) */
  --ease-paper: cubic-bezier(0.34, 1.2, 0.64, 1);
  --ease-quiet: cubic-bezier(0.33, 0, 0.2, 1);
  --ease-out-soft: cubic-bezier(0.22, 0.61, 0.36, 1);
  --duration-fast: 120ms;
  --duration-normal: 220ms;
  --duration-slow: 360ms;

  /* base body type (Burmese needs the vertical room) */
  font-size: var(--text-base);
  line-height: var(--leading-base);
}

@media (prefers-reduced-motion: reduce) {
  .sj-root {
    --ease-paper: var(--ease-out-soft);
    --duration-fast: 1ms;
    --duration-normal: 1ms;
    --duration-slow: 1ms;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): add scoped type scale and motion tokens"
```

---

## Task 7: Bilingual fonts (`@font-face` with unicode-range)

**Files:** `public/fonts/` (NEW), Modify: `src/app/globals.css`

`next/font` can't route Latin vs. Burmese within one family, so we self-host and hand-write
`@font-face` (DESIGN.md §6.1). The Myanmar face wins for the Myanmar block via `unicode-range`.

- [ ] **Step 1: Download subset `.woff2` into `public/fonts/`**

Fetch `latin` + `myanmar` `.woff2` subsets (e.g. via google-webfonts-helper or the Google Fonts
CSS API) and save as:

```
public/fonts/noto-sans-latin-400.woff2          public/fonts/noto-sans-latin-600.woff2
public/fonts/noto-sans-latin-700.woff2          public/fonts/noto-sans-myanmar-400.woff2
public/fonts/noto-sans-myanmar-600.woff2        public/fonts/fraunces-latin-500.woff2
public/fonts/fraunces-latin-600.woff2           public/fonts/caveat-latin-500.woff2
public/fonts/padauk-myanmar-400.woff2           public/fonts/ibm-plex-mono-latin-400.woff2
public/fonts/ibm-plex-mono-latin-500.woff2
```

(All OFL. Padauk-for-Hand is the documented placeholder per §6.3.)

- [ ] **Step 2: Add `@font-face` blocks to globals.css**

```css
/* === Schedjuice bilingual font stack (DESIGN.md §6). === */
/* MYANMAR_RANGE = U+1000-109F, U+A9E0-A9FF, U+AA60-AA7F */

/* Schedjuice Sans = Noto Sans (Latin) + Noto Sans Myanmar */
@font-face { font-family: "Schedjuice Sans"; font-weight: 400; font-display: swap;
  src: url("/fonts/noto-sans-latin-400.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2212, U+2215; }
@font-face { font-family: "Schedjuice Sans"; font-weight: 600; font-display: swap;
  src: url("/fonts/noto-sans-latin-600.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC; }
@font-face { font-family: "Schedjuice Sans"; font-weight: 700; font-display: swap;
  src: url("/fonts/noto-sans-latin-700.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC; }
@font-face { font-family: "Schedjuice Sans"; font-weight: 400; font-display: swap;
  src: url("/fonts/noto-sans-myanmar-400.woff2") format("woff2");
  unicode-range: U+1000-109F, U+A9E0-A9FF, U+AA60-AA7F; }
@font-face { font-family: "Schedjuice Sans"; font-weight: 600; font-display: swap;
  src: url("/fonts/noto-sans-myanmar-600.woff2") format("woff2");
  unicode-range: U+1000-109F, U+A9E0-A9FF, U+AA60-AA7F; }

/* Schedjuice Serif = Fraunces (Latin) + Noto Sans Myanmar fallback */
@font-face { font-family: "Schedjuice Serif"; font-weight: 500; font-display: swap;
  src: url("/fonts/fraunces-latin-500.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+2000-206F, U+20AC; }
@font-face { font-family: "Schedjuice Serif"; font-weight: 600; font-display: swap;
  src: url("/fonts/fraunces-latin-600.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+2000-206F, U+20AC; }
@font-face { font-family: "Schedjuice Serif"; font-weight: 600; font-display: swap;
  src: url("/fonts/noto-sans-myanmar-600.woff2") format("woff2");
  unicode-range: U+1000-109F, U+A9E0-A9FF, U+AA60-AA7F; }

/* Schedjuice Hand = Caveat (Latin) + Padauk (Myanmar placeholder) */
@font-face { font-family: "Schedjuice Hand"; font-weight: 500; font-display: swap;
  src: url("/fonts/caveat-latin-500.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: "Schedjuice Hand"; font-weight: 400; font-display: swap;
  src: url("/fonts/padauk-myanmar-400.woff2") format("woff2");
  unicode-range: U+1000-109F, U+A9E0-A9FF, U+AA60-AA7F; }

/* Schedjuice Mono = IBM Plex Mono (Latin only) */
@font-face { font-family: "Schedjuice Mono"; font-weight: 400; font-display: swap;
  src: url("/fonts/ibm-plex-mono-latin-400.woff2") format("woff2"); unicode-range: U+0000-00FF; }
@font-face { font-family: "Schedjuice Mono"; font-weight: 500; font-display: swap;
  src: url("/fonts/ibm-plex-mono-latin-500.woff2") format("woff2"); unicode-range: U+0000-00FF; }
```

- [ ] **Step 3: Override the family tokens inside `.sj-root`** (append to the `.sj-root` block)

```css
.sj-root {
  /* colliding font tokens — overridden in-scope only (old app keeps Geist) */
  --font-sans: "Schedjuice Sans", system-ui, sans-serif;
  --font-serif: "Schedjuice Serif", Georgia, serif;
  --font-mono: "Schedjuice Mono", ui-monospace, monospace;
  --font-hand: "Schedjuice Hand", cursive; /* new token */
  font-family: var(--font-sans);
}
```

- [ ] **Step 4: Verify routing in the browser**

Run `npm run dev`; temporarily add `<p className="sj-root">အောင်ဇေယျ submitted Quiz 4</p>` to any
page. Expected: Burmese renders in Noto Sans Myanmar, Latin in Noto Sans, on one line. Remove the
temp markup after checking (the bilingual page in Task 17 is the permanent home).

- [ ] **Step 5: Commit**

```bash
git add public/fonts src/app/globals.css
git commit -m "feat(design): add bilingual font stack with unicode-range routing"
```

---

## Task 8: Theme cookie + resolve helpers (TDD)

**Files:**
- Create: `src/lib/sj/theme.ts`
- Test: `src/lib/sj/theme.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/sj/theme.test.ts
import { describe, expect, it } from "vitest";
import { THEME_COOKIE, isThemePreference, normalizeTheme } from "./theme";

describe("theme helpers", () => {
  it("exposes the cookie name", () => {
    expect(THEME_COOKIE).toBe("theme");
  });
  it("validates preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
  it("normalizes unknown values to system", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("nonsense")).toBe("system");
    expect(normalizeTheme(undefined)).toBe("system");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:unit -- src/lib/sj/theme.test.ts`
Expected: FAIL ("Cannot find module './theme'").

- [ ] **Step 3: Implement the helpers**

```typescript
// src/lib/sj/theme.ts
"use client";

export const THEME_COOKIE = "theme";
export const THEME_STORAGE_KEY = "sj-theme";

export type ThemePreference = "light" | "dark" | "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function normalizeTheme(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

/** Writes the preference to cookie + localStorage and applies it to <html>. */
export function applyTheme(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = pref;
  const resolved =
    pref === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : pref;
  document.documentElement.style.colorScheme = resolved;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage may be unavailable (private mode) */
  }
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=${oneYear}; samesite=lax`;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm run test:unit -- src/lib/sj/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sj/theme.ts src/lib/sj/theme.test.ts
git commit -m "feat(design): add theme cookie/resolve helpers"
```

---

## Task 9: Pre-paint inline script + root layout wiring

**Files:**
- Create: `src/lib/theme-inline-script.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create the inline bootstrap string**

```typescript
// src/lib/theme-inline-script.ts
/**
 * Runs before paint (beforeInteractive). Reconciles cookie vs localStorage and sets
 * data-theme + color-scheme on <html> so the .sj-root subtree never flashes the wrong theme.
 * Kept dependency-free and tiny; stringified into a <script>.
 */
export const THEME_INLINE_SCRIPT = `(function(){try{
var d=document.documentElement;
var m=document.cookie.match(/(?:^|; )theme=([^;]+)/);
var c=m?decodeURIComponent(m[1]):null;
var s=null;try{s=localStorage.getItem('sj-theme');}catch(e){}
var t=s||c||'system';
if(t!=='light'&&t!=='dark'&&t!=='system'){t='system';}
d.dataset.theme=t;
var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;
d.style.colorScheme=r;
}catch(e){}})();`;
```

- [ ] **Step 2: Seed `data-theme` from the cookie + inject the script in `layout.tsx`**

Make `RootLayout` async and read the cookie. Add the import near the other imports:

```typescript
import { cookies } from "next/headers";
import { THEME_INLINE_SCRIPT } from "@/lib/theme-inline-script";
import { normalizeTheme } from "@/lib/sj/theme";
```

Change the signature and add the cookie read at the top of the function body:

```typescript
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const theme = normalizeTheme(cookieStore.get("theme")?.value);
```

Add `data-theme={theme}` to the existing `<html>` tag (keep `suppressHydrationWarning`), and add
the blocking script as the first child of `<body>` (before `<AppProviders>`):

```tsx
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body className={cn(GeistSans.variable, "font-sans")}>
        <script dangerouslySetInnerHTML={{ __html: THEME_INLINE_SCRIPT }} />
        <AppProviders>
```

Do **not** remove or alter the existing `<ThemeProvider attribute="class" ...>` — `next-themes`
keeps owning `.dark` for the old app; we own `data-theme`.

- [ ] **Step 3: Verify no hydration error + old app unchanged**

Run `npm run dev`; load `/login` and toggle OS dark mode. Expected: no console hydration warning;
existing app still themed by `next-themes` exactly as before; `<html>` now also carries `data-theme`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/theme-inline-script.ts src/app/layout.tsx
git commit -m "feat(design): seed data-theme via cookie + pre-paint inline script"
```

---

## Task 10: Theme toggle component

**Files:** Create: `src/components/primitives/theme-toggle.tsx`

- [ ] **Step 1: Implement the 3-way toggle**

```tsx
// src/components/primitives/theme-toggle.tsx
"use client";

import { useEffect, useState } from "react";
import { HalfMoon, Computer, SunLight } from "iconoir-react";
import { cn } from "@/lib/utils";
import {
  type ThemePreference,
  THEME_STORAGE_KEY,
  applyTheme,
  normalizeTheme,
} from "@/lib/sj/theme";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunLight }[] = [
  { value: "light", label: "Light", Icon: SunLight },
  { value: "dark", label: "Dark", Icon: HalfMoon },
  { value: "system", label: "System", Icon: Computer },
];

export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setPref(normalizeTheme(stored ?? document.documentElement.dataset.theme));
  }, []);

  function choose(next: ThemePreference) {
    setPref(next);
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated p-1",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          onClick={() => choose(value)}
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
            pref === value
              ? "bg-accent text-accent-foreground"
              : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <Icon width={16} height={16} aria-hidden />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (If an Iconoir icon name differs in the installed version, swap to the
nearest available equivalent — verify against `iconoir-react` exports.)

- [ ] **Step 3: Commit**

```bash
git add src/components/primitives/theme-toggle.tsx
git commit -m "feat(design): add 3-way theme toggle"
```

---

## Task 11: PaperGrain decoration

**Files:** Create: `src/components/primitives/decoration/paper-grain.tsx`

- [ ] **Step 1: Implement PaperGrain**

```tsx
// src/components/primitives/decoration/paper-grain.tsx
import { cn } from "@/lib/utils";

/**
 * Subtle paper-grain overlay (DESIGN.md §8). Inline SVG turbulence; fill follows --text-primary
 * so the grain flips with ink in dark mode. Fixed, non-interactive, ~5.5% opacity.
 */
export function PaperGrain({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 z-0 opacity-[0.055]", className)}
    >
      <svg className="size-full" xmlns="http://www.w3.org/2000/svg">
        <filter id="sj-paper-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves={2}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect
          width="100%"
          height="100%"
          filter="url(#sj-paper-grain)"
          fill="var(--text-primary)"
        />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/primitives/decoration/paper-grain.tsx
git commit -m "feat(design): add PaperGrain overlay"
```

---

## Task 12: rough.js decoration helpers (cached seeds)

**Files:**
- Create: `src/components/primitives/decoration/rough-underline.tsx`
- Create: `src/components/primitives/decoration/rough-frame.tsx`
- Create: `src/components/primitives/decoration/rough-divider.tsx`
- Create: `src/components/primitives/decoration/rough-callout.tsx`

Each caches its seed in `useMemo` so it doesn't re-wobble on every render (DESIGN.md §8), uses
`currentColor` (set via a text/`text-*` class by the caller), and re-draws on resize.

- [ ] **Step 1: Implement RoughUnderline**

```tsx
// src/components/primitives/decoration/rough-underline.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import rough from "roughjs";
import { cn } from "@/lib/utils";

export function RoughUnderline({
  className,
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const seed = useMemo(() => Math.floor(Math.random() * 2 ** 31), []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const draw = () => {
      const w = svg.clientWidth || 120;
      svg.replaceChildren();
      const rc = rough.svg(svg);
      svg.appendChild(
        rc.line(2, 6, w - 2, 5, { seed, strokeWidth, roughness: 1.4, stroke: "currentColor" }),
      );
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [seed, strokeWidth]);

  return (
    <svg
      ref={svgRef}
      aria-hidden
      height={10}
      className={cn("block w-full text-brand", className)}
    />
  );
}
```

- [ ] **Step 2: Implement RoughDivider**

```tsx
// src/components/primitives/decoration/rough-divider.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import rough from "roughjs";
import { cn } from "@/lib/utils";

/** Hand-drawn horizontal divider; prefer over <hr> (DESIGN.md §8, banned §14 #14). */
export function RoughDivider({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const seed = useMemo(() => Math.floor(Math.random() * 2 ** 31), []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const draw = () => {
      const w = svg.clientWidth || 240;
      svg.replaceChildren();
      const rc = rough.svg(svg);
      svg.appendChild(
        rc.line(2, 5, w - 2, 6, { seed, strokeWidth: 1.5, roughness: 1.6, stroke: "currentColor" }),
      );
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [seed]);

  return (
    <svg ref={svgRef} role="separator" aria-orientation="horizontal" height={11}
      className={cn("block w-full text-border-strong", className)} />
  );
}
```

- [ ] **Step 3: Implement RoughFrame**

```tsx
// src/components/primitives/decoration/rough-frame.tsx
"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import rough from "roughjs";
import { cn } from "@/lib/utils";

/** Wraps children in a hand-drawn rectangle that tracks the content box. */
export function RoughFrame({ children, className }: { children: ReactNode; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const seed = useMemo(() => Math.floor(Math.random() * 2 ** 31), []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg) return;
    const draw = () => {
      const { width: w, height: h } = wrap.getBoundingClientRect();
      svg.replaceChildren();
      const rc = rough.svg(svg);
      svg.appendChild(
        rc.rectangle(3, 3, Math.max(w - 6, 1), Math.max(h - 6, 1), {
          seed, strokeWidth: 1.6, roughness: 1.5, stroke: "currentColor",
        }),
      );
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [seed]);

  return (
    <div ref={wrapRef} className={cn("relative text-border-strong", className)}>
      <svg ref={svgRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      <div className="relative">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Implement RoughCallout**

```tsx
// src/components/primitives/decoration/rough-callout.tsx
"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RoughFrame } from "./rough-frame";

/** Soft callout box: framed content on a faint brand wash. */
export function RoughCallout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <RoughFrame
      className={cn(
        "rounded-md bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-brand",
        className,
      )}
    >
      <div className="p-4 text-text-primary">{children}</div>
    </RoughFrame>
  );
}
```

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit` (Expected: no new errors).

```bash
git add src/components/primitives/decoration
git commit -m "feat(design): add rough.js decoration helpers with cached seeds"
```

---

## Task 13: Superadmin gate for `/components`

**Files:** Modify: `src/middleware.ts`

`/components` is matched by the existing middleware `matcher` (not excluded). `isSuperAdmin` is
already imported. Add an explicit branch so only superadmins reach the showcase.

- [ ] **Step 1: Add the gate inside the `if (isLoggedIn) {` block**

Place this immediately after the `account` is parsed and `showGlobalAlert(account, tenant);` runs
(before the `/profile` redirect), so it short-circuits early:

```typescript
    // Superadmin-only in-house component library (design foundation).
    if (request.nextUrl.pathname.startsWith("/components")) {
      if (!isSuperAdmin(account)) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
      return NextResponse.next();
    }
```

- [ ] **Step 2: Verify the gate**

Run `npm run dev`. As a superadmin (`james@schedjuice.com` / `password123` if that account is
superadmin, else any superadmin), visit `/components` → allowed. As a non-superadmin → redirected
to `/home`. Logged-out → redirected to `/login` (existing `else` branch).

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(design): gate /components to superadmins"
```

---

## Task 14: Showcase shell layout

**Files:** Create: `src/app/(design)/components/layout.tsx`

This layout establishes the new world: `.sj-root`, the bilingual body font, the paper grain, a
header with the theme toggle, and section nav. It lives in its own route group `(design)` so it
does **not** inherit the existing `(internal)` shadcn shell.

- [ ] **Step 1: Implement the layout**

```tsx
// src/app/(design)/components/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { PaperGrain } from "@/components/primitives/decoration/paper-grain";
import { ThemeToggle } from "@/components/primitives/theme-toggle";

const SECTIONS = [
  { href: "/components", label: "Components" },
  { href: "/components/type", label: "Type" },
  { href: "/components/color", label: "Color" },
  { href: "/components/bilingual", label: "Bilingual" },
];

export default function ComponentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="sj-root relative min-h-screen bg-surface text-text-primary antialiased">
      <PaperGrain />
      <div className="relative z-10 mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10 flex items-baseline justify-between gap-6">
          <div>
            <p className="font-hand text-hand text-brand">Schedjuice</p>
            <h1 className="font-serif text-3xl text-text-primary">Component library</h1>
          </div>
          <ThemeToggle />
        </header>
        <nav className="mb-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="text-text-secondary underline-offset-4 hover:text-accent hover:underline"
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
```

(`font-hand` + `text-hand` come from the tokens registered in `@theme` (Task 4) and the
`@font-face` blocks (Task 7); `font-serif` resolves to Schedjuice Serif inside `.sj-root`.)

- [ ] **Step 2: Verify it renders for a superadmin**

Run `npm run dev`; visit `/components` (the page itself comes in Task 18, so expect a 404 on the
index for now but the layout chrome — header, toggle, nav, grain — should compile). Toggle theme
and confirm surfaces flip light/dark.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(design)/components/layout.tsx"
git commit -m "feat(design): add superadmin /components shell layout"
```

---

## Task 15: Color showcase page

**Files:** Create: `src/app/(design)/components/color/page.tsx`

- [ ] **Step 1: Implement the page**

```tsx
// src/app/(design)/components/color/page.tsx
const RAW = [
  ["--pixel-white", "Dominant surface"],
  ["--terminal", "Primary ink"],
  ["--circuit-board", "Secondary ink"],
  ["--data-green", "Soft brand"],
  ["--data-green-strong", "Strong accent"],
  ["--danger", "Destructive"],
  ["--success", "Positive"],
  ["--warning", "Caution"],
];

const WARM = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const SEMANTIC = [
  "--surface", "--surface-elevated", "--surface-inverse", "--surface-hover",
  "--text-primary", "--text-secondary", "--text-muted", "--text-on-inverse",
  "--accent", "--accent-foreground", "--brand", "--brand-foreground",
  "--border", "--border-strong", "--ring",
];

function Swatch({ token, note }: { token: string; note?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="size-10 shrink-0 rounded-md border border-border"
        style={{ backgroundColor: `var(${token})` }}
      />
      <div className="min-w-0">
        <code className="font-mono text-mono-sm text-text-primary">{token}</code>
        {note ? <p className="text-sm text-text-muted">{note}</p> : null}
      </div>
    </div>
  );
}

export default function ColorPage() {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 font-serif text-2xl">Raw palette</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {RAW.map(([token, note]) => (
            <Swatch key={token} token={token} note={note} />
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-4 font-serif text-2xl">Warm ramp</h2>
        <div className="flex flex-wrap gap-2">
          {WARM.map((step) => (
            <div key={step} className="text-center">
              <span
                className="block size-12 rounded-md border border-border"
                style={{ backgroundColor: `var(--warm-${step})` }}
              />
              <code className="font-mono text-xs text-text-muted">{step}</code>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-4 font-serif text-2xl">Semantic tokens</h2>
        <p className="mb-4 text-sm text-text-muted">
          Use the theme toggle to verify each token flips correctly in dark mode.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SEMANTIC.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify (light + dark)**

Visit `/components/color`; toggle themes. Expected: swatches resolve; semantic tokens visibly shift
between light/dark; no token renders transparent.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(design)/components/color/page.tsx"
git commit -m "feat(design): add color showcase page"
```

---

## Task 16: Type showcase page

**Files:** Create: `src/app/(design)/components/type/page.tsx`

- [ ] **Step 1: Implement the page**

```tsx
// src/app/(design)/components/type/page.tsx
const SCALE: { token: string; label: string; family: string }[] = [
  { token: "--text-4xl", label: "Hero — 44px", family: "font-serif" },
  { token: "--text-3xl", label: "Page title — 32px", family: "font-serif" },
  { token: "--text-2xl", label: "Section title — 24px", family: "font-serif" },
  { token: "--text-xl", label: "Sub-section — 20px", family: "font-sans" },
  { token: "--text-lg", label: "Emphasized body — 18px", family: "font-sans" },
  { token: "--text-base", label: "Body — 16px", family: "font-sans" },
  { token: "--text-sm", label: "Secondary — 14px", family: "font-sans" },
  { token: "--text-xs", label: "Caption — 12px", family: "font-sans" },
];

export default function TypePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Scale</h2>
        {SCALE.map(({ token, label, family }) => (
          <div key={token} className="border-b border-border pb-3">
            <span className={family} style={{ fontSize: `var(${token})` }}>
              The quiet classroom
            </span>
            <p className="text-xs text-text-muted">
              <code className="font-mono">{token}</code> · {label}
            </p>
          </div>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Families</h2>
        <p className="font-sans text-lg">Schedjuice Sans — body, bilingual by construction.</p>
        <p className="font-serif text-lg">Schedjuice Serif — headers and display.</p>
        <p className="font-hand text-hand text-brand">
          Schedjuice Hand — a few warm moments per surface
        </p>
        <p className="font-mono text-mono-base">Schedjuice Mono — 0123456789 codes &amp; totals</p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Visit `/components/type`. Expected: serif headers (Fraunces), hand line (Caveat), mono digits
(Plex Mono) all render with the self-hosted fonts.

```bash
git add "src/app/(design)/components/type/page.tsx"
git commit -m "feat(design): add type showcase page"
```

---

## Task 17: Bilingual stress-test page

**Files:** Create: `src/app/(design)/components/bilingual/page.tsx`

Covers every §7 stress case so font routing and vertical rhythm are verifiable.

- [ ] **Step 1: Implement the page**

```tsx
// src/app/(design)/components/bilingual/page.tsx
export default function BilingualPage() {
  return (
    <div className="max-w-2xl space-y-8 text-base">
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Burmese-only paragraph</h2>
        <p>
          ကျောင်းသားများသည် စာမေးပွဲကို ဖြေဆိုပြီးနောက် ရလဒ်များကို စောင့်ဆိုင်းနေကြသည်။
          ဆရာမသည် အတန်းထဲတွင် တိတ်ဆိတ်စွာ စာသင်ကြားနေသည်။
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Mixed script, one line</h2>
        <p>အောင်ဇေယျ submitted Quiz 4 — graded 18/20 by ဆရာ Daw Hla.</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Burmese in a button &amp; a table cell</h2>
        <button
          type="button"
          className="rounded-md bg-accent px-4 py-2 text-accent-foreground"
        >
          အတည်ပြုမည်
        </button>
        <table className="mt-3 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border-strong">
              <th className="py-2 text-sm text-text-muted">Name</th>
              <th className="py-2 text-sm text-text-muted">Course</th>
            </tr>
          </thead>
          <tbody>
            <tr className="h-[52px] border-b border-border">
              <td>သီရိ ကျော်</td>
              <td>အင်္ဂလိပ်စာ — Level 3</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Handwriting quote</h2>
        <p className="font-hand text-hand text-brand">
          “Keep going” — ဆက်လက်ကြိုးစားပါ
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Myanmar-digit currency</h2>
        <p className="font-mono text-mono-base">ကျပ် ၁၂၃,၄၅၀.၀၀ / 123,450.00 MMK</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Mixed-script form label</h2>
        <label className="block text-sm text-text-secondary" htmlFor="sj-demo">
          ကျောင်းသားအမည် (Student name)
        </label>
        <input
          id="sj-demo"
          className="mt-1 w-full rounded-md border border-border bg-surface-elevated px-3 py-2"
          placeholder="အမည် / Name"
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify — no broken rendering**

Visit `/components/bilingual`. Expected: Burmese never falls back to a system font; mixed lines do
not break between scripts; Myanmar digits render; the button/table/label all shape correctly in
both themes. This page is a §15 "done" gate.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(design)/components/bilingual/page.tsx"
git commit -m "feat(design): add bilingual stress-test page"
```

---

## Task 18: Gallery index (stub for Plans 2–4)

**Files:** Create: `src/app/(design)/components/page.tsx`

- [ ] **Step 1: Implement the index**

```tsx
// src/app/(design)/components/page.tsx
import Link from "next/link";
import { RoughCallout } from "@/components/primitives/decoration/rough-callout";

export default function ComponentsIndexPage() {
  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-text-secondary">
        The Schedjuice in-house component library. Foundation tokens, type, and decoration are live;
        primitives land here as Plans 2–4 are implemented.
      </p>
      <RoughCallout>
        <p className="font-hand text-hand">
          Build on Base UI. Tokens carry the weight. No shadcn, no Radix.
        </p>
      </RoughCallout>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { href: "/components/type", label: "Typography" },
          { href: "/components/color", label: "Color & tokens" },
          { href: "/components/bilingual", label: "Bilingual stress test" },
        ].map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-lg border border-border bg-surface-elevated p-4 text-text-primary hover:border-border-strong"
            >
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify the full shell end-to-end**

Visit `/components` as a superadmin. Expected: index renders inside the shell; nav links reach
type/color/bilingual; theme toggle flips all pages; paper grain visible; no shadcn styles leak in.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(design)/components/page.tsx"
git commit -m "feat(design): add /components gallery index"
```

---

## Done criteria for Plan 1

- `npm run test:unit` passes (contrast, palette AA, theme helpers).
- `npm run dev`: `/components`, `/components/type`, `/components/color`, `/components/bilingual`
  all render for a superadmin; non-superadmins are redirected.
- Theme toggle flips light/dark/system with no flash; existing app still themed by `next-themes`,
  visually unchanged.
- Bilingual page shows no broken Burmese rendering in either theme.
- `npx tsc --noEmit` clean. Ready for Plan 2 (input primitives) to build on `.sj-root`.
