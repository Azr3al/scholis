# Cream Surface Tuning & Table Contrast — Design Spec

> Tone down the dominant cream background to match the Framer marketing prototype, harmonize the warm ramp, and fix high-contrast surface splits and borders on data tables (especially pinned columns and dark-mode row rules).

**Status:** Design approved (brainstorming 2026-06-25). Ready for implementation.
**Repo:** `schedjuice-reimagined-fe` only.

**Reference:** [Framer marketing prototype](https://renewed-cogwheel-792072.framer.app/) — main canvas `#FAF7F2`, section bands `#F5F0E8`.

---

## 1. Problem

### 1.1 Cream too saturated

`--pixel-white` (`#FCF4E3`) reads noticeably yellower than the Framer prototype. The product should feel calmer — warm off-white, not parchment-heavy.

### 1.2 Data table surface splits (light + dark)

Pinned columns in `DataTable` use `!bg-background` and `hover:!bg-muted`. Inside `.sj-root`, `--background` maps to `--surface` (cream), but **`--muted` is not mapped** in `.sj-root` and falls back to shadcn defaults:

| Mode | `--muted` fallback | Effect on pinned Student column |
| --- | --- | --- |
| Light | `#f5f5f5` (cool gray) | Pure white strip vs cream row |
| Dark | `#262626` (cool gray) | Near-black strip vs warm charcoal row |

### 1.3 Borders too loud (especially dark mode)

`TableRow` applies `border-b border-border`. Dark `--border` is `#3a332b` on `#1f1a15` — reads as bright grid lines. User feedback: borders have too much contrast; surfaces should not jump between too-white and too-dark.

---

## 2. Goals & non-goals

### Goals

1. Shift light cream base to Framer-anchored `#FAF7F2` with harmonized `--warm-50` / `--warm-100` / `--warm-200`.
2. Map missing shadcn collision tokens (`--muted`, `--card`) in `.sj-root` to semantic warm surfaces.
3. Introduce `--border-subtle` for internal dividers (table rows); soften dark structural `--border`.
4. Slightly lift and compress dark surface ramp so panels feel one family.
5. Fix `data-table.tsx` pinned column classes to use semantic surfaces.
6. Soften `table.tsx` row chrome per data-table brief (subtle dividers, semantic hover).

### Non-goals

- Changing `schedjuice-landing-4`, `schedjuice-rereimagined`, or other repos.
- Re-tuning `--warm-300` through `--warm-900` (text-muted and darker UI still work).
- Replacing legacy shadcn tables outside `.sj-root`.
- New table features (zebra implementation in DataTable — only token tuning if zebra already consumed elsewhere).

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Scope | `schedjuice-reimagined-fe` only |
| 2 | Cream approach | Framer-anchored harmonized ramp (brainstorm option B) |
| 3 | `--pixel-white` | `#FAF7F2` |
| 4 | `--warm-100` | `#F5F0E8` (Framer section band) |
| 5 | Pinned columns | `bg-surface` + `bg-surface-hover` on hover (not `background` / `muted`) |
| 6 | Row dividers | `--border-subtle` (mix-based, lower contrast) |
| 7 | `--muted` in `.sj-root` | `var(--surface-hover)` |

---

## 4. Light mode tokens

### 4.1 Raw ramp (changed values only)

| Token | Old | New |
| --- | --- | --- |
| `--pixel-white` | `#FCF4E3` | `#FAF7F2` |
| `--warm-50` | `#FBF6EC` | `#F8F5F0` |
| `--warm-100` | `#F3EAD8` | `#F5F0E8` |
| `--warm-200` | `#E7D9BF` | `#E8E2D9` |
| `--warm-300`–`900` | unchanged | unchanged |

### 4.2 Semantic aliases (changed)

| Token | New value |
| --- | --- |
| `--surface` | `var(--pixel-white)` |
| `--surface-elevated` | `#FDFBF8` |
| `--surface-sunken` | `var(--warm-100)` |
| `--surface-hover` | `var(--warm-100)` |
| `--surface-skeleton` | `var(--warm-100)` |
| `--border` | `var(--warm-200)` |
| `--border-subtle` | `color-mix(in srgb, var(--terminal) 6%, transparent)` |
| `--zebra-row` | `color-mix(in srgb, var(--warm-100) 50%, transparent)` |
| `--muted` | `var(--surface-hover)` |
| `--muted-foreground` | `var(--text-muted)` |
| `--card` | `var(--surface)` |
| `--card-foreground` | `var(--text-primary)` |

### 4.3 Contrast (must hold after change)

| Pairing | Target |
| --- | --- |
| `--terminal` on `--pixel-white` | ≥ 7:1 (AAA body) |
| `--circuit-board` on `--pixel-white` | ≥ 7:1 |
| `--data-green-strong` on `--pixel-white` | ≥ 4.5:1 (AA links) |
| White on `--data-green-strong` | ≥ 4.5:1 |

---

## 5. Dark mode tokens

### 5.1 Surface ramp (lifted, compressed)

| Token | Old | New |
| --- | --- | --- |
| `--surface-sunken` | `#1b1712` | `#1e1914` |
| `--surface` | `#1f1a15` | `#222019` |
| `--surface-elevated` | `#221d18` | `#252018` |
| `--surface-hover` | `#29231b` | `#2a241c` |
| `--surface-active` | `#2f2820` | `#2f2820` |
| `--surface-skeleton` | `#29231b` | `var(--surface-hover)` |

### 5.2 Borders (softened)

| Token | New value |
| --- | --- |
| `--border` | `color-mix(in srgb, var(--text-primary) 10%, transparent)` |
| `--border-subtle` | `color-mix(in srgb, var(--text-primary) 5%, transparent)` |
| `--border-strong` | `#4c443a` (unchanged) |

### 5.3 Shadcn collision (dark)

| Token | New value |
| --- | --- |
| `--muted` | `var(--surface-hover)` |
| `--muted-foreground` | `var(--text-muted)` |
| `--card` | `var(--surface)` |
| `--card-foreground` | `var(--text-primary)` |

Dark contrast targets from DESIGN.md §16 remain: body text on `--surface` ≥ 4.5:1; accent pairings AA.

---

## 6. Component changes

### 6.1 `src/components/ui/table.tsx`

- `TableRow`: `border-b border-border-subtle` (was `border-border`).
- `TableRow`: `hover:bg-surface-hover/50` and `data-[state=selected]:bg-surface-hover` (was `hover:bg-muted/50` / `bg-muted`).
- `TableFooter`: `bg-surface-hover/50` (was `bg-muted/50`).

### 6.2 `src/components/ui/data-table.tsx`

Pinned header/cell classes:

- `!bg-surface hover:!bg-surface-hover` (was `!bg-background hover:!bg-muted`).
- Selected row pinned cells: `group-data-[state=selected]:!bg-surface-hover`.

Table wrapper: `border border-border-subtle` (was `border-border`).

### 6.3 `src/app/globals.css`

- Mirror all token changes in `@theme` literal block and `html[data-theme="dark"]` + `system` media blocks (keep identical).
- Register `--color-border-subtle` in `@layer theme .sj-root`.
- Wire `--muted`, `--card`, `--card-foreground` in `.sj-root` light + dark.

---

## 7. Documentation & tests

| File | Update |
| --- | --- |
| `src/lib/sj/palette.ts` | New hex literals; optional `borderSubtle` if needed for tests |
| `src/lib/sj/palette.test.ts` | Uses updated `RAW.pixelWhite` / `LIGHT` |
| `src/lib/sj/contrast.test.ts` | Symmetry test uses `#FAF7F2` |
| `DESIGN.md` §5 | Raw palette table |
| `src/app/(design)/components/color/page.tsx` | Auto from CSS vars (verify visually) |

---

## 8. Verification

Manual smoke (light + dark):

1. **Finances → Student payments** (or any page with pinned Student column + row borders).
2. Pinned column matches row surface — no white/black vertical strip.
3. Row dividers visible but quiet; dark mode grid not harsh.
4. App shell: content panel vs rail — subtle elevation, no flash-white card.
5. `/components/color` — new cream reads closer to Framer reference.

Automated: `npm run test:unit -- src/lib/sj/palette.test.ts src/lib/sj/contrast.test.ts`

---

## 9. Changelog

- **2026-06-25:** Initial spec — cream tone-down + table contrast fixes (brainstorming with James).
