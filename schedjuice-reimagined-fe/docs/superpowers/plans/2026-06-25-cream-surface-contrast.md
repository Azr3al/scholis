# Cream Surface Tuning & Table Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tone down the product cream to Framer-aligned `#FAF7F2`, harmonize the warm ramp, map missing shadcn tokens in `.sj-root`, soften borders in dark mode, and fix data-table pinned-column surface splits.

**Architecture:** Token changes are centralized in `palette.ts` (test source of truth) and mirrored in `globals.css` under `.sj-root` + dark overrides. Table components switch from unmapped `background`/`muted` shadcn tokens to semantic `surface` tokens and new `--border-subtle` for row rules.

**Tech Stack:** Next.js 15, Tailwind CSS v4 (`@theme`), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-25-cream-surface-contrast-design.md`
**Design source:** `DESIGN.md` §5, §16

> **Commit policy:** Defer commits until the user requests them (`no-git-commits.mdc`). Commit steps describe intended cadence.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/sj/palette.ts` | Canonical hex constants for tests |
| `src/lib/sj/palette.test.ts` | AA contrast assertions |
| `src/lib/sj/contrast.test.ts` | Symmetry test literal |
| `src/app/globals.css` | `.sj-root` tokens, `@theme` literals, dark blocks, `--border-subtle` |
| `src/components/ui/table.tsx` | Row borders + hover use semantic tokens |
| `src/components/ui/data-table.tsx` | Pinned column surfaces + wrapper border |
| `DESIGN.md` | §5 raw palette table |

**Run tests:** `npm run test:unit -- src/lib/sj/palette.test.ts src/lib/sj/contrast.test.ts`
**Dev server:** `npm run dev` — check `/finances/student-payments` light + dark.

---

## Task 1: Update palette constants (TDD)

**Files:**
- Modify: `src/lib/sj/palette.ts`
- Modify: `src/lib/sj/contrast.test.ts`
- Test: `src/lib/sj/palette.test.ts`

- [ ] **Step 1: Update `palette.ts` literals**

```typescript
// src/lib/sj/palette.ts — RAW + WARM + LIGHT blocks
export const RAW = {
  pixelWhite: "#FAF7F2",
  // terminal, circuitBoard, dataGreen, ... unchanged
} as const;

export const WARM = {
  50: "#F8F5F0",
  100: "#F5F0E8",
  200: "#E8E2D9",
  300: "#D3BE9A",
  // 400–900 unchanged
} as const;

export const LIGHT = {
  surface: RAW.pixelWhite,
  surfaceElevated: "#FDFBF8",
  // textPrimary, textSecondary, textMuted, accent, border, borderStrong unchanged refs
} as const;

export const DARK = {
  surface: "#222019",
  surfaceElevated: "#252018",
  // update textPrimary etc. only if tests require — keep existing DARK text tokens
} as const;
```

Add dark surface literals to `DARK` for documentation parity:

```typescript
export const DARK = {
  surface: "#222019",
  surfaceElevated: "#252018",
  surfaceSunken: "#1e1914",
  surfaceHover: "#2a241c",
  // ... existing text/accent fields
} as const;
```

- [ ] **Step 2: Update symmetry test in `contrast.test.ts`**

Replace `#FCF4E3` with `#FAF7F2` in the symmetric contrast test.

- [ ] **Step 3: Run palette tests**

Run: `npm run test:unit -- src/lib/sj/palette.test.ts src/lib/sj/contrast.test.ts`
Expected: PASS (contrast ratios still meet AA on new cream).

---

## Task 2: Light-mode tokens in `globals.css`

**Files:**
- Modify: `src/app/globals.css` (`@theme` block ~683–706, `.sj-root` ~708–769)

- [ ] **Step 1: Update `@theme` literal block**

```css
@theme {
  --color-surface: #faf7f2;
  --color-surface-elevated: #fdfbf8;
  --color-surface-sunken: #f5f0e8;
  --color-surface-hover: #f5f0e8;
  --color-surface-active: #e8e2d9;
  --color-surface-skeleton: #f5f0e8;
  --color-text-on-inverse: #faf7f2;
  --color-border-strong: #d3be9a;
  --color-zebra-row: color-mix(in srgb, #f5f0e8 50%, transparent);
  /* add after border-strong registration in @layer theme (Task 3) */
}
```

- [ ] **Step 2: Update `.sj-root` light raw + semantic block**

```css
.sj-root {
  --pixel-white: #faf7f2;
  --warm-50: #f8f5f0;
  --warm-100: #f5f0e8;
  --warm-200: #e8e2d9;
  /* warm-300–900 unchanged */

  --surface-elevated: #fdfbf8;
  --zebra-row: color-mix(in srgb, var(--warm-100) 50%, transparent);

  --border-subtle: color-mix(in srgb, var(--terminal) 6%, transparent);

  --muted: var(--surface-hover);
  --muted-foreground: var(--text-muted);
  --card: var(--surface);
  --card-foreground: var(--text-primary);
}
```

- [ ] **Step 3: Verify CSS parses**

Run: `npm run build` or `npx tsc --noEmit`
Expected: no errors.

---

## Task 3: Register `border-subtle` in Tailwind theme layer

**Files:**
- Modify: `src/app/globals.css` (`@layer theme { .sj-root { ... } }`)

- [ ] **Step 1: Add color registration**

Inside `@layer theme { .sj-root { ... } }` add:

```css
--color-border-subtle: var(--border-subtle);
```

Also add to `@theme` if needed for build-time utilities:

```css
@theme {
  --color-border-subtle: color-mix(in srgb, #102c24 6%, transparent);
}
```

(Light literal fallback; `.sj-root` overrides via `var(--border-subtle)`.)

- [ ] **Step 2: Confirm utility resolves**

In dev, any element with `border-border-subtle` inside `.sj-root` should show a faint rule. Quick check via `/components/color` or temporary class.

---

## Task 4: Dark-mode tokens in `globals.css`

**Files:**
- Modify: `src/app/globals.css` (`html[data-theme="dark"] .sj-root` and matching `@media` block)

- [ ] **Step 1: Update both dark blocks identically** (explicit dark + system)

```css
html[data-theme="dark"] .sj-root {
  --surface-sunken: #1e1914;
  --surface: #222019;
  --surface-elevated: #252018;
  --surface-hover: #2a241c;
  --surface-skeleton: var(--surface-hover);

  --border: color-mix(in srgb, var(--text-primary) 10%, transparent);
  --border-subtle: color-mix(in srgb, var(--text-primary) 5%, transparent);
  /* border-strong unchanged */

  --muted: var(--surface-hover);
  --muted-foreground: var(--text-muted);
  --card: var(--surface);
  --card-foreground: var(--text-primary);
}
```

Copy the same surface/border/muted/card lines into `html[data-theme="system"]` inside `@media (prefers-color-scheme: dark)`.

- [ ] **Step 2: Mirror in `@layer theme` dark overrides** if present (`html[data-theme="dark"] .sj-root` color vars block ~901+).

---

## Task 5: Table row chrome

**Files:**
- Modify: `src/components/ui/table.tsx`

- [ ] **Step 1: Replace row border + hover classes**

```tsx
// TableRow
className={cn(
  "hover:bg-surface-hover/50 data-[state=selected]:bg-surface-hover border-b border-border-subtle transition-colors",
  className
)}

// TableFooter
className={cn(
  "bg-surface-hover/50 border-t font-medium [&>tr]:last:border-b-0",
  className
)}
```

Remove `border-border` and `bg-muted/50` / `bg-muted` from these lines.

---

## Task 6: Data table pinned columns

**Files:**
- Modify: `src/components/ui/data-table.tsx`

- [ ] **Step 1: Pinned header cells (~704–707)**

```tsx
className={cn(
  header.column.getIsPinned() &&
    "!bg-surface hover:!bg-surface-hover",
)}
```

- [ ] **Step 2: Pinned body cells (~780–783)**

```tsx
className={cn(
  cell.column.getIsPinned() &&
    "!bg-surface hover:!bg-surface-hover group-data-[state=selected]:!bg-surface-hover",
  ...
)}
```

- [ ] **Step 3: Loading skeleton pinned cells (~811–814)**

```tsx
className={cn(
  column.getIsPinned() &&
    "!bg-surface hover:!bg-surface-hover group-data-[state=selected]:!bg-surface-hover",
)}
```

- [ ] **Step 4: Wrapper border (~680)**

```tsx
<div className="border border-border-subtle rounded-md p-1">
```

---

## Task 7: DESIGN.md + manual verification

**Files:**
- Modify: `DESIGN.md` §5 raw palette table

- [ ] **Step 1: Update hex in DESIGN.md**

| Token | Hex |
| --- | --- |
| `--pixel-white` | `#FAF7F2` |
| `--surface-elevated` | `#FDFBF8` |
| `--warm-50` | `#F8F5F0` |
| `--warm-100` | `#F5F0E8` |
| `--warm-200` | `#E8E2D9` |

Note new `--border-subtle` in semantic section (internal dividers).

- [ ] **Step 2: Manual smoke — light mode**

1. Open student payments table (pinned Student column).
2. Confirm no white vertical strip on pinned columns.
3. Row dividers subtle; cream base closer to Framer.

- [ ] **Step 3: Manual smoke — dark mode**

1. Toggle dark theme.
2. Pinned column matches row — no black strip.
3. Row borders quiet; no harsh grid.

- [ ] **Step 4: Run unit tests**

Run: `npm run test:unit -- src/lib/sj/palette.test.ts src/lib/sj/contrast.test.ts`
Expected: PASS

---

## Plan self-review (spec coverage)

| Spec § | Task |
| --- | --- |
| §4 Light tokens | Task 1, 2 |
| §5 Dark tokens | Task 1, 4 |
| §6 table.tsx | Task 5 |
| §6 data-table.tsx | Task 6 |
| §6 globals.css | Task 2, 3, 4 |
| §7 tests/docs | Task 1, 7 |
| §8 verification | Task 7 |

No placeholders. All file paths explicit.
