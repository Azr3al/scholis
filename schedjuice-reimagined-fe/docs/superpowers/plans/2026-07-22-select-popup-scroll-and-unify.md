# Select Popup Scroll + Unify Primitive Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap Select (and Combobox) open menus at `min(24rem, available height)` with scroll, constrain width to available space while growing for full labels up to that cap, and keep one Select primitive as the sole stylistic source.

**Architecture:** Add shared popup sizing helpers in `src/lib/ui/select-layout.ts`. Wire `primitives/select.tsx` and `primitives/combobox.tsx` to those helpers. Audit that product Selects already wrap the primitive; do not restyle near-misses.

**Tech Stack:** React, Base UI Select/Combobox, Tailwind CSS utilities, Vitest

**Spec:** `docs/superpowers/specs/2026-07-22-select-popup-scroll-and-unify-design.md`

## Global Constraints

- Max height token: `min(24rem, var(--available-height))` for Select and Combobox (verbatim from spec).
- Max width: ≤ `var(--available-width)`; grow for full labels up to that cap; truncate only past the cap.
- Select min width: ≥ trigger (`var(--anchor-width)`).
- One Select primitive only — no compound API, no Combobox→Select merge.
- Out of scope: `multi-select-popover`, payment `CommandList`, native calendar `<select>`.
- High-value tests only — assert shared class tokens / contracts, not happy-path “renders”.
- Working directory: `schedjuice-reimagined-fe`. Unit tests: `pnpm test:unit -- src/lib/ui/select-layout.test.ts`.

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/ui/select-layout.ts` | Shared trigger (existing) + **new** popup height/width/chrome helpers |
| `src/lib/ui/select-layout.test.ts` | Assert popup helper class contracts |
| `src/components/primitives/select.tsx` | Apply popup + item-text helpers |
| `src/components/primitives/combobox.tsx` | Apply shared max-height (and max-width where duplicated) |

---

### Task 1: Shared popup layout helpers (TDD)

**Files:**
- Modify: `src/lib/ui/select-layout.ts`
- Modify: `src/lib/ui/select-layout.test.ts`

**Interfaces:**
- Consumes: existing `selectValueClassName` / `selectTriggerClassName` (unchanged)
- Produces:
  - `selectPopupMaxHeightClassName(): string` — height + vertical scroll only
  - `selectPopupClassName(): string` — Select popup size + chrome
  - `selectPopupItemTextClassName(): string` — item label classes that respect width cap
  - `comboboxPopupWidthClassName(): string` — Combobox popup width contract

- [ ] **Step 1: Extend the failing tests**

Replace / extend `src/lib/ui/select-layout.test.ts` so it imports the new helpers and asserts the contracts (keep the existing left-align test):

```ts
import { describe, expect, it } from "vitest";
import {
  selectValueClassName,
  selectPopupMaxHeightClassName,
  selectPopupClassName,
  selectPopupItemTextClassName,
  comboboxPopupWidthClassName,
} from "./select-layout";

describe("selectValueClassName", () => {
  it("left-aligns the selected label", () => {
    expect(selectValueClassName()).toContain("text-left");
  });
});

describe("selectPopupMaxHeightClassName", () => {
  it("caps height at 24rem and available height with vertical scroll", () => {
    const cls = selectPopupMaxHeightClassName();
    expect(cls).toContain("max-h-[min(24rem,var(--available-height))]");
    expect(cls).toContain("overflow-y-auto");
  });
});

describe("selectPopupClassName", () => {
  it("grows from trigger width up to available width and scrolls vertically", () => {
    const cls = selectPopupClassName();
    expect(cls).toContain("min-w-[var(--anchor-width)]");
    expect(cls).toContain("max-w-[var(--available-width)]");
    expect(cls).toContain("max-h-[min(24rem,var(--available-height))]");
    expect(cls).toContain("overflow-y-auto");
  });
});

describe("selectPopupItemTextClassName", () => {
  it("allows truncation past the popup width cap", () => {
    const cls = selectPopupItemTextClassName();
    expect(cls).toContain("min-w-0");
    expect(cls).toContain("truncate");
    expect(cls).not.toContain("whitespace-nowrap");
  });
});

describe("comboboxPopupWidthClassName", () => {
  it("matches trigger width and caps at available width", () => {
    const cls = comboboxPopupWidthClassName();
    expect(cls).toContain("w-[var(--anchor-width)]");
    expect(cls).toContain("max-w-[var(--available-width)]");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/lib/ui/select-layout.test.ts
```

Expected: FAIL — imports / functions not defined (`selectPopupMaxHeightClassName`, etc.).

- [ ] **Step 3: Implement helpers**

Append to `src/lib/ui/select-layout.ts` (keep existing exports unchanged):

```ts
/** Shared open-list height: scroll after ~24rem or sooner if viewport is smaller. */
export function selectPopupMaxHeightClassName(): string {
  return "max-h-[min(24rem,var(--available-height))] overflow-y-auto";
}

/**
 * Select popup: ≥ trigger, ≤ available width, scroll vertically.
 * `w-max` lets long labels widen the menu up to max-w; then item truncate kicks in.
 */
export function selectPopupClassName(): string {
  return [
    "w-max min-w-[var(--anchor-width)] max-w-[var(--available-width)]",
    selectPopupMaxHeightClassName(),
    "overflow-x-hidden rounded-md border border-border bg-surface-elevated py-1 text-text-primary shadow-md",
    "opacity-100",
  ].join(" ");
}

/** Option label inside Select: truncate only once the popup hits max width. */
export function selectPopupItemTextClassName(): string {
  return "col-start-2 min-w-0 truncate";
}

/** Combobox popup width (height lives on the list via selectPopupMaxHeightClassName). */
export function comboboxPopupWidthClassName(): string {
  return "w-[var(--anchor-width)] max-w-[var(--available-width)]";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/lib/ui/select-layout.test.ts
```

Expected: PASS (all tests in that file).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/ui/select-layout.ts src/lib/ui/select-layout.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add shared select/combobox popup sizing helpers

EOF
)"
```

---

### Task 2: Wire Select primitive to shared popup helpers

**Files:**
- Modify: `src/components/primitives/select.tsx`

**Interfaces:**
- Consumes: `selectPopupClassName()`, `selectPopupItemTextClassName()`, existing `selectTriggerClassName` / `selectValueClassName`
- Produces: Select open menu that scrolls at 24rem and respects available width

- [ ] **Step 1: Update imports**

In `src/components/primitives/select.tsx`, change the `select-layout` import to:

```ts
import {
  selectTriggerClassName,
  selectValueClassName,
  selectPopupClassName,
  selectPopupItemTextClassName,
} from "@/lib/ui/select-layout";
```

- [ ] **Step 2: Replace Popup className**

Replace the `BaseSelect.Popup` `className={cn(...)}` block so it uses the shared helper (drop the inline `max-h-[var(--available-height)] min-w-[var(--anchor-width)]` / overflow / chrome duplication):

```tsx
<BaseSelect.Popup className={cn(selectPopupClassName())}>
```

- [ ] **Step 3: Replace ItemText className**

Change:

```tsx
<BaseSelect.ItemText className="col-start-2 whitespace-nowrap">
```

to:

```tsx
<BaseSelect.ItemText className={selectPopupItemTextClassName()}>
```

Also ensure the item row grid can shrink: keep the existing item `className` grid, but confirm the `1fr` column can shrink by leaving `min-w-0` on the text (from the helper). No other item class changes required.

- [ ] **Step 4: Sanity-check unit tests still pass**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/lib/ui/select-layout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/primitives/select.tsx
git commit -m "$(cat <<'EOF'
fix(ui): cap Select popup height and width via shared helpers

EOF
)"
```

---

### Task 3: Align Combobox popup height (and width helpers)

**Files:**
- Modify: `src/components/primitives/combobox.tsx`

**Interfaces:**
- Consumes: `selectPopupMaxHeightClassName()`, `comboboxPopupWidthClassName()`
- Produces: Combobox list height `24rem` (was `20rem`); width classes via shared helper

- [ ] **Step 1: Add imports**

At the top of `src/components/primitives/combobox.tsx`, import:

```ts
import {
  selectPopupMaxHeightClassName,
  comboboxPopupWidthClassName,
} from "@/lib/ui/select-layout";
```

- [ ] **Step 2: Wire Popup width**

Replace the Popup width classes:

```tsx
<BaseCombobox.Popup
  className={cn(
    comboboxPopupWidthClassName(),
    "rounded-md border border-border bg-surface-elevated text-text-primary shadow-md",
  )}
>
```

- [ ] **Step 3: Wire List max-height**

Replace:

```tsx
<BaseCombobox.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto py-1 data-empty:p-0">
```

with:

```tsx
<BaseCombobox.List
  className={cn(
    selectPopupMaxHeightClassName(),
    "py-1 data-empty:p-0",
  )}
>
```

- [ ] **Step 4: Grep for stale 20rem combobox height**

Run:

```bash
cd schedjuice-reimagined-fe
rg -n "max-h-\\[min\\(20rem" src/components/primitives/combobox.tsx src/components/primitives/select.tsx src/lib/ui/select-layout.ts
```

Expected: no matches.

- [ ] **Step 5: Run unit tests**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/lib/ui/select-layout.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/primitives/combobox.tsx
git commit -m "$(cat <<'EOF'
fix(ui): raise Combobox list max-height to shared 24rem token

EOF
)"
```

---

### Task 4: Audit Select call sites (no stylistic forks)

**Files:**
- Read-only audit under `src/` (no product restyles unless a true fork is found)

**Interfaces:**
- Consumes: Task 2 Select primitive
- Produces: Confirmation that product Selects derive from `@/components/primitives` Select (or a thin wrapper)

- [ ] **Step 1: Find Select primitive imports**

Run:

```bash
cd schedjuice-reimagined-fe
rg -n "from [\"']@/components/primitives/select[\"']|from [\"']@/components/primitives[\"']" src --glob '*.tsx' | rg "Select" || true
rg -n "import \\{[^}]*Select" src --glob '*.tsx' | head -80
```

- [ ] **Step 2: Confirm no parallel Base UI Select chrome**

Run:

```bash
cd schedjuice-reimagined-fe
rg -n "@base-ui/react/select" src
```

Expected: **only** `src/components/primitives/select.tsx`.

- [ ] **Step 3: Confirm known wrappers still wrap the primitive**

Open and confirm each imports `Select` from `@/components/primitives` (or re-exports that path):

- `src/components/form/selectors/selector.tsx`
- `src/components/form/entity-select.tsx`
- `src/components/calendar/time-select.tsx`
- `src/components/form/selectors/month-selector.tsx`
- `src/components/form/selectors/year-selector.tsx`
- `src/components/form/selectors/year-month-selector.tsx`
- `src/components/form/selectors/timezone-selector.tsx`

If any file builds its own popup (`BaseSelect.Popup` / duplicate max-h chrome) outside the primitive, stop and fix by routing through the primitive — do **not** invent a second select component.

- [ ] **Step 4: Document out-of-scope near-misses (no code changes)**

These may look like selects but are explicitly out of scope per spec — do not restyle in this plan:

- `src/components/form/multi-select-popover.tsx`
- payment `CommandList` popovers under finances
- native `<select>` in calendar month/year chrome

- [ ] **Step 5: Commit only if Step 3 required a fix**

If wrappers were already correct and no code changed, skip commit.

If a fork was fixed, commit that fix alone:

```bash
cd schedjuice-reimagined-fe
git add <fixed-files>
git commit -m "$(cat <<'EOF'
refactor(ui): route stray Select chrome through the shared primitive

EOF
)"
```

---

### Task 5: Manual verification checklist

**Files:** none (manual)

- [ ] **Step 1: Long Select list scrolls**

In the running app, open a Select with many options (e.g. EntitySelect category / any long options list, or TimeSelect minutes when precise).

Expected: open menu height ≤ ~24rem (or less on short viewports); list scrolls; page does not feel taken over by a full-height menu.

- [ ] **Step 2: Long labels respect width**

Open a Select whose options include a long label (or temporarily use a long item in the design-system inputs demo if available: `src/app/(design)/components/_demos/inputs-demo.tsx`).

Expected: menu ≥ trigger width, ≤ available width; label fully visible when space allows; truncates only when past the cap.

- [ ] **Step 3: Combobox height matches**

Open any Combobox with a long filtered list.

Expected: list max height uses the same ~24rem ceiling (noticeably taller than the old 20rem if you can compare, otherwise just confirm scroll inside a compact panel).

- [ ] **Step 4: No commit required for manual QA**

If something fails, fix in the relevant task’s file (helpers / select / combobox) with a focused follow-up commit; do not patch call sites with one-off `max-h`.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Select max-height `min(24rem, available)` + scroll | Task 1 helpers, Task 2 wire |
| Select max-width available; grow then truncate | Task 1 `selectPopupClassName` + item text, Task 2 |
| Combobox same 24rem height | Task 1 + Task 3 |
| One Select primitive; wrappers derive | Task 4 audit |
| Out of scope near-misses | Task 4 Step 4 |
| High-value unit tests on tokens | Task 1 |
| Manual long-list / width / Combobox check | Task 5 |

No placeholders left in steps. Helper names are consistent across tasks (`selectPopupMaxHeightClassName`, `selectPopupClassName`, `selectPopupItemTextClassName`, `comboboxPopupWidthClassName`).
