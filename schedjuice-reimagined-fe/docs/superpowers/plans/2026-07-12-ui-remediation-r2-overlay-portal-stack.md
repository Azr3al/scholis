# R2 — Overlay, Portal, Stacking, Focus, and Hit-Testing Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define named overlay/portal z-index layers, migrate primitives and documented exceptions to the contract, eliminate invalid ad-hoc stacking (`z-400`, scattered `z-[300]`), and verify pointer-event, focus-trap, and clipping behavior for high-risk overlays in unit and browser tests.

**Architecture:** A single source of truth (`src/lib/ui/overlay-layers.ts`) exports layer names and numeric values mirrored in `globals.css` `@theme` z-index tokens. Primitives (`dialog`, `popover`, `select`, `menu`, `combobox`, `tooltip`, `toast`) consume layer helpers — consumers stop inventing numeric z-index. A static gate fails on undocumented z-index classes in product code. Playwright specs assert geometry and hit-testing on student-payments, dialog+banner, and select-in-table scenarios.

**Tech Stack:** Tailwind CSS v4, Base UI primitives, Vitest, Playwright (R0 harness).

**Spec:** [`../specs/2026-07-12-ui-migration-remediation-program-design.md`](../specs/2026-07-12-ui-migration-remediation-program-design.md) §8.3  
**Planning base SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Depends on:** R0 merged, R1 merged  
**Blocks:** R3–R5 and route cohorts touching overlays  
**Branch:** `remediate/ui-r2-overlay` from R1 merge commit

---

## Current-state evidence (planning SHA)

### Fragmented z-index (selected)

| File | Line | Current class | Issue |
| --- | --- | --- | --- |
| `src/components/primitives/select.tsx` | 62 | `z-400` | Invalid/non-contract Tailwind scale |
| `src/components/primitives/dialog.tsx` | 9, 13 | `z-50` | Same value for backdrop and content |
| `src/components/primitives/popover.tsx` | 9 | `z-50` | Collides with dialog |
| `src/components/primitives/combobox.tsx` | 46 | `z-50` | Collides |
| `src/components/primitives/menu.tsx` | 9 | `z-50` | Collides |
| `src/components/primitives/tooltip.tsx` | 11 | `z-50` | Collides |
| `src/components/primitives/toast.tsx` | 53 | `z-[60]` | Ad hoc |
| `src/components/layout/view-as-banner.tsx` | 24 | `z-[350]` | Ad hoc |
| `src/components/form/multi-combo-box.tsx` | 85 | `z-[300]` | Ad hoc |
| `src/components/date/date-picker.tsx` | 79 | `z-[300]` | Ad hoc |
| `src/app/layout.tsx` | 71 | `z-50` on `#portal` | Glide portal |
| `src/components/shell/app-shell.tsx` | 26 | `z-[400]` skip link | Ad hoc |
| `src/components/find-page/find-page-island.tsx` | 109, 119 | `z-[49]` | Documented fillet decoration |

### Portal destinations

- Base UI primitives: internal `Portal` components
- Glide / data-sheet: `#portal` in `src/app/layout.tsx:71`
- Toast: `BaseToast.Portal` in `src/components/primitives/toast.tsx:52-56`

---

## Named layer contract (locked)

| Layer name | Value | Tailwind utility | Use |
| --- | --- | --- | --- |
| `base` | 0 | `z-base` | In-flow content |
| `sticky` | 10 | `z-sticky` | Sticky in-flow headers/toolbars |
| `navigation` | 20 | `z-navigation` | Shell nav, sidebar |
| `dropdown` | 50 | `z-dropdown` | Select, menu, combobox, popover, tooltip |
| `banner` | 100 | `z-banner` | View-as, global alert, persistent banners |
| `modalBackdrop` | 200 | `z-modal-backdrop` | Dialog/sheet scrim |
| `modalContent` | 210 | `z-modal-content` | Dialog/sheet surface (above backdrop) |
| `toast` | 300 | `z-toast` | Toast viewport |
| `emergency` | 400 | `z-emergency` | Skip link, MathLive keyboard, documented escapes |

**Rules:** Consumers use named utilities only. Nested overlays portal to `document.body` (Base UI default) or `#portal` for Glide. Hidden panels use `pointer-events-none` with interactive children restoring `pointer-events-auto`.

---

## Documented exceptions (do not migrate to dropdown)

| Component | File:line | Layer | Rationale |
| --- | --- | --- | --- |
| Find page fillet grooves | `src/components/find-page/find-page-island.tsx:109,119` | below dropdown (`z-[49]`) | Decorative non-interactive fillets |
| MathLive keyboard | `src/components/editor/math-equation-dialog.tsx:11` | `emergency` (400) | Third-party keyboard must clear modal scrim |
| Glide portal carrier | `src/app/layout.tsx:71` | `dropdown` (50) | Shared overlay editor origin |

---

## Forbidden scope

Do **not** in R2:

- Change token colors or `.sj-content-reset` (R1)
- Refactor route business logic or table column widths (R3)
- Remove finance/student-payments feature code
- Add new arbitrary `z-[N]` in product code outside the exception table

Stop if:

- R0/R1 gates fail
- Playwright cannot authenticate (report blocker, do not weaken specs)
- A migrated overlay fails primitive unit tests

---

## File structure

```
src/lib/ui/overlay-layers.ts
src/lib/ui/overlay-layers.test.ts
src/lib/ui/overlay-classnames.ts
src/app/globals.css                     # @theme z-index tokens
scripts/check-overlay-z-index.ts
docs/OVERLAY_STACK.md
src/components/primitives/dialog.tsx    # layer migration
src/components/primitives/popover.tsx
src/components/primitives/select.tsx
src/components/primitives/menu.tsx
src/components/primitives/combobox.tsx
src/components/primitives/tooltip.tsx
src/components/primitives/toast.tsx
src/components/layout/view-as-banner.tsx
src/components/form/multi-combo-box.tsx
src/components/date/date-picker.tsx
src/components/date/date-time-picker.tsx
src/components/datatable/inline-time-select.tsx
src/app/_chrome/date-picker.tsx
src/app/_chrome/date-time-picker.tsx
src/components/shell/app-shell.tsx
e2e/smoke/overlay-dialog-above-banner.spec.ts
e2e/smoke/overlay-select-student-payments.spec.ts
e2e/smoke/overlay-hidden-pointer-events.spec.ts
```

---

### Task 1: Overlay layer constants (test-first)

**Files:**
- Create: `src/lib/ui/overlay-layers.test.ts`
- Create: `src/lib/ui/overlay-layers.ts`
- Create: `src/lib/ui/overlay-classnames.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/ui/overlay-layers.test.ts
import { describe, expect, it } from "vitest";
import {
  OVERLAY_LAYERS,
  overlayZClass,
  isDocumentedOverlayException,
} from "./overlay-layers";

describe("OVERLAY_LAYERS", () => {
  it("orders modal content above backdrop and banner", () => {
    expect(OVERLAY_LAYERS.modalContent).toBeGreaterThan(OVERLAY_LAYERS.modalBackdrop);
    expect(OVERLAY_LAYERS.modalBackdrop).toBeGreaterThan(OVERLAY_LAYERS.banner);
    expect(OVERLAY_LAYERS.banner).toBeGreaterThan(OVERLAY_LAYERS.dropdown);
    expect(OVERLAY_LAYERS.toast).toBeGreaterThan(OVERLAY_LAYERS.modalContent);
  });

  it("exposes tailwind utilities", () => {
    expect(overlayZClass("dropdown")).toBe("z-dropdown");
    expect(overlayZClass("emergency")).toBe("z-emergency");
  });
});

describe("isDocumentedOverlayException", () => {
  it("allows find-page fillet and mathlive paths", () => {
    expect(isDocumentedOverlayException("src/components/find-page/find-page-island.tsx")).toBe(true);
    expect(isDocumentedOverlayException("src/components/editor/math-equation-dialog.tsx")).toBe(true);
    expect(isDocumentedOverlayException("src/components/users/user-form.tsx")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:unit -- src/lib/ui/overlay-layers.test.ts
```

- [ ] **Step 3: Implement layers**

```typescript
// src/lib/ui/overlay-layers.ts
export const OVERLAY_LAYERS = {
  base: 0,
  sticky: 10,
  navigation: 20,
  dropdown: 50,
  banner: 100,
  modalBackdrop: 200,
  modalContent: 210,
  toast: 300,
  emergency: 400,
} as const;

export type OverlayLayerName = keyof typeof OVERLAY_LAYERS;

const UTILITY_BY_LAYER: Record<OverlayLayerName, string> = {
  base: "z-base",
  sticky: "z-sticky",
  navigation: "z-navigation",
  dropdown: "z-dropdown",
  banner: "z-banner",
  modalBackdrop: "z-modal-backdrop",
  modalContent: "z-modal-content",
  toast: "z-toast",
  emergency: "z-emergency",
};

export function overlayZClass(layer: OverlayLayerName): string {
  return UTILITY_BY_LAYER[layer];
}

const DOCUMENTED_EXCEPTION_FILES = new Set([
  "src/components/find-page/find-page-island.tsx",
  "src/components/editor/math-equation-dialog.tsx",
]);

export function isDocumentedOverlayException(relativePath: string): boolean {
  return DOCUMENTED_EXCEPTION_FILES.has(relativePath.replace(/\\/g, "/"));
}
```

```typescript
// src/lib/ui/overlay-classnames.ts
import { overlayZClass } from "./overlay-layers";

export const dropdownPositionerClassName = `sj-root ${overlayZClass("dropdown")} outline-none`;
export const modalBackdropClassName = `sj-root ${overlayZClass("modalBackdrop")} bg-overlay-scrim`;
export const modalPopupClassName = `sj-root ${overlayZClass("modalContent")}`;
export const toastViewportClassName = `sj-root fixed right-4 bottom-4 ${overlayZClass("toast")} w-[22rem] max-w-[calc(100vw-2rem)]`;
export const bannerStickyClassName = `sticky top-0 ${overlayZClass("banner")} w-full shrink-0`;
export const emergencyFixedClassName = `fixed ${overlayZClass("emergency")}`;
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm run test:unit -- src/lib/ui/overlay-layers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/overlay-layers.ts src/lib/ui/overlay-layers.test.ts src/lib/ui/overlay-classnames.ts
git commit -m "feat(r2): define named overlay z-index layers"
```

---

### Task 2: Register z-index tokens in `globals.css`

**Files:**
- Modify: `src/app/globals.css` inside `@theme` block at lines 27-94 (after `--breakpoint-xl`)

- [ ] **Step 1: Add z-index theme tokens**

After line 28 (`--breakpoint-xl: 1400px;`) insert:

```css
  --z-base: 0;
  --z-sticky: 10;
  --z-navigation: 20;
  --z-dropdown: 50;
  --z-banner: 100;
  --z-modal-backdrop: 200;
  --z-modal-content: 210;
  --z-toast: 300;
  --z-emergency: 400;
```

And matching color-style utilities (Tailwind v4 `@theme` z-index):

```css
  --z-index-base: 0;
  --z-index-sticky: 10;
  --z-index-navigation: 20;
  --z-index-dropdown: 50;
  --z-index-banner: 100;
  --z-index-modal-backdrop: 200;
  --z-index-modal-content: 210;
  --z-index-toast: 300;
  --z-index-emergency: 400;
```

Add utility aliases in a new `@layer utilities` block after the R1 legacy alias section:

```css
@layer utilities {
  .z-base { z-index: var(--z-index-base); }
  .z-sticky { z-index: var(--z-index-sticky); }
  .z-navigation { z-index: var(--z-index-navigation); }
  .z-dropdown { z-index: var(--z-index-dropdown); }
  .z-banner { z-index: var(--z-index-banner); }
  .z-modal-backdrop { z-index: var(--z-index-modal-backdrop); }
  .z-modal-content { z-index: var(--z-index-modal-content); }
  .z-toast { z-index: var(--z-index-toast); }
  .z-emergency { z-index: var(--z-index-emergency); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(r2): register overlay z-index theme utilities"
```

---

### Task 3: Migrate dialog and alert-dialog primitives

**Files:**
- Modify: `src/components/primitives/dialog.tsx:8-17`
- Modify: `src/components/primitives/alert-dialog.tsx` (inherits via dialog exports)

- [ ] **Step 1: Update dialog class names**

Replace `src/components/primitives/dialog.tsx` lines 8-17 with:

```typescript
import { modalBackdropClassName, modalPopupClassName } from "@/lib/ui/overlay-classnames";

export const backdropClassName =
  `${modalBackdropClassName} fixed inset-0 transition-opacity duration-[var(--duration-normal)] ` +
  "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0";

export const popupClassName =
  `${modalPopupClassName} fixed top-1/2 left-1/2 flex w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 ` +
  "flex-col gap-4 rounded-lg border border-border bg-surface-elevated p-6 text-text-primary shadow-lg " +
  "transition-[transform,opacity] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] " +
  "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 " +
  "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0";
```

- [ ] **Step 2: Run build smoke**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/primitives/dialog.tsx
git commit -m "feat(r2): migrate dialog primitive to modal overlay layers"
```

---

### Task 4: Migrate dropdown-family primitives

**Files:**
- Modify: `src/components/primitives/select.tsx:62`
- Modify: `src/components/primitives/popover.tsx:9`
- Modify: `src/components/primitives/menu.tsx:9`
- Modify: `src/components/primitives/combobox.tsx:46`
- Modify: `src/components/primitives/tooltip.tsx:11`

- [ ] **Step 1: Select — fix invalid `z-400`**

In `src/components/primitives/select.tsx`, add import:

```typescript
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
```

Replace line 62:

```typescript
          className={cn(dropdownPositionerClassName, "align-start")}
```

- [ ] **Step 2: Popover positioner**

Replace `src/components/primitives/popover.tsx` line 9:

```typescript
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";

function Positioner({ sideOffset = 6, className, ...props }: ComponentProps<typeof BasePopover.Positioner>) {
  return <BasePopover.Positioner sideOffset={sideOffset} className={cn(dropdownPositionerClassName, className)} {...props} />;
}
```

- [ ] **Step 3: Menu positioner**

Replace `src/components/primitives/menu.tsx` line 9:

```typescript
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
  return <BaseMenu.Positioner sideOffset={sideOffset} className={cn(dropdownPositionerClassName, className)} {...props} />;
```

- [ ] **Step 4: Combobox positioner**

Replace `src/components/primitives/combobox.tsx` line 46:

```typescript
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
        <BaseCombobox.Positioner className={dropdownPositionerClassName} sideOffset={4}>
```

- [ ] **Step 5: Tooltip positioner**

Replace `src/components/primitives/tooltip.tsx` line 11:

```typescript
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
  return <BaseTooltip.Positioner sideOffset={sideOffset} className={cn(dropdownPositionerClassName, className)} {...props} />;
```

- [ ] **Step 6: Commit**

```bash
git add src/components/primitives/select.tsx src/components/primitives/popover.tsx \
  src/components/primitives/menu.tsx src/components/primitives/combobox.tsx \
  src/components/primitives/tooltip.tsx
git commit -m "feat(r2): migrate dropdown primitives to z-dropdown layer"
```

---

### Task 5: Migrate toast, banner, shell skip link

**Files:**
- Modify: `src/components/primitives/toast.tsx:53`
- Modify: `src/components/layout/view-as-banner.tsx:24`
- Modify: `src/components/shell/app-shell.tsx:26`

- [ ] **Step 1: Toast viewport**

In `src/components/primitives/toast.tsx`:

```typescript
import { toastViewportClassName } from "@/lib/ui/overlay-classnames";
```

Replace line 53:

```typescript
        <BaseToast.Viewport className={toastViewportClassName}>
```

- [ ] **Step 2: View-as banner**

In `src/components/layout/view-as-banner.tsx`:

```typescript
import { bannerStickyClassName } from "@/lib/ui/overlay-classnames";
import { cn } from "@/lib/utils";
```

Replace line 24 opening div class with:

```typescript
    <div className={cn(bannerStickyClassName, "border-b border-amber-500/40 bg-amber-50 px-4 py-2 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50")}>
```

- [ ] **Step 3: Skip link**

In `src/components/shell/app-shell.tsx`:

```typescript
import { emergencyFixedClassName } from "@/lib/ui/overlay-classnames";
```

Replace line 26 class beginning with:

```typescript
        className={cn(emergencyFixedClassName, "left-3 top-3 -translate-y-24 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary shadow-md transition focus:translate-y-0")}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/primitives/toast.tsx src/components/layout/view-as-banner.tsx src/components/shell/app-shell.tsx
git commit -m "feat(r2): migrate toast, banner, and skip link overlay layers"
```

---

### Task 6: Migrate ad-hoc consumer `z-[300]` popovers

**Files:**
- Modify: `src/components/form/multi-combo-box.tsx:85`
- Modify: `src/components/date/date-picker.tsx:79`
- Modify: `src/components/date/date-time-picker.tsx:114`
- Modify: `src/components/datatable/inline-time-select.tsx:150`
- Modify: `src/app/_chrome/date-picker.tsx:81`
- Modify: `src/app/_chrome/date-time-picker.tsx:119`

- [ ] **Step 1: Replace all six `z-[300]` consumers with exact named-layer markup**

Add this import to each of the six files listed in Task 6:

```typescript
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
```

Replace `src/components/form/multi-combo-box.tsx:85-86` with:

```typescript
        <Popover.Positioner
          className={dropdownPositionerClassName}
          align="start"
        >
          <Popover.Popup className={cn(contentClassName ?? "w-[240px]", "p-0")}>
```

Replace `src/components/date/date-picker.tsx:79-80` with:

```typescript
          <Popover.Positioner className={dropdownPositionerClassName}>
            <Popover.Popup className="w-auto p-0">
```

Replace `src/components/date/date-time-picker.tsx:114-115` with:

```typescript
          <Popover.Positioner className={dropdownPositionerClassName}>
            <Popover.Popup className="w-auto p-0">
```

Replace `src/components/datatable/inline-time-select.tsx:148-151` with:

```typescript
        <Popover.Positioner
          align="start"
          className={dropdownPositionerClassName}
        >
          <Popover.Popup className="w-auto p-3">
```

Replace `src/app/_chrome/date-picker.tsx:81-82` with:

```typescript
          <Popover.Positioner className={dropdownPositionerClassName}>
            <Popover.Popup className="w-auto p-0">
```

Replace `src/app/_chrome/date-time-picker.tsx:119-120` with:

```typescript
          <Popover.Positioner className={dropdownPositionerClassName}>
            <Popover.Popup className="w-auto p-0">
```

- [ ] **Step 2: Migrate calendar menu and date-search `z-[400]`**

Modify:
- `src/components/calendar/calendar-menu.tsx:316,623`
- `src/components/datatable/date-search.tsx:64`

Add this import to both files:

```typescript
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
```

Replace `src/components/calendar/calendar-menu.tsx:315-316` with:

```typescript
                <Popover.Positioner className={dropdownPositionerClassName}>
                  <Popover.Popup>
```

Replace `src/components/calendar/calendar-menu.tsx:622-623` with:

```typescript
                <Popover.Positioner className={dropdownPositionerClassName}>
                  <Popover.Popup className="w-auto p-2">
```

Replace `src/components/datatable/date-search.tsx:63-64` with:

```typescript
            <Popover.Positioner className={dropdownPositionerClassName}>
              <Popover.Popup className="w-auto p-0">
```

- [ ] **Step 3: Update Glide portal**

In `src/app/layout.tsx` line 71:

```typescript
import { overlayZClass } from "@/lib/ui/overlay-layers";
        <div id="portal" className={cn("fixed top-0 left-0 h-0 w-0 overflow-visible", overlayZClass("dropdown"))} />
```

- [ ] **Step 4: Update MathLive exception**

In `src/components/editor/math-equation-dialog.tsx` line 11:

```typescript
import { OVERLAY_LAYERS } from "@/lib/ui/overlay-layers";
const MATHLIVE_KEYBOARD_Z_INDEX = String(OVERLAY_LAYERS.emergency);
```

- [ ] **Step 5: Commit**

```bash
git add src/components/form/multi-combo-box.tsx src/components/date/date-picker.tsx \
  src/components/date/date-time-picker.tsx src/components/datatable/inline-time-select.tsx \
  src/app/_chrome/date-picker.tsx src/app/_chrome/date-time-picker.tsx \
  src/components/calendar/calendar-menu.tsx src/components/datatable/date-search.tsx \
  src/app/layout.tsx src/components/editor/math-equation-dialog.tsx
git commit -m "feat(r2): migrate consumer popovers to z-dropdown layer"
```

---

### Task 7: Static gate for undocumented z-index

**Files:**
- Create: `scripts/check-overlay-z-index.ts`
- Create: `docs/OVERLAY_STACK.md`
- Modify: `package.json`, `scripts/verify-all.sh`

- [ ] **Step 1: Gate script**

```typescript
// scripts/check-overlay-z-index.ts
import fs from "node:fs";
import path from "node:path";
import { isDocumentedOverlayException } from "../src/lib/ui/overlay-layers";

const ROOT = path.join(__dirname, "..", "src");
const ALLOWED = new Set([
  "z-base", "z-sticky", "z-navigation", "z-dropdown", "z-banner",
  "z-modal-backdrop", "z-modal-content", "z-toast", "z-emergency",
  "z-0", "z-10", "z-20", "z-30", // in-flow stacking (non-portal)
]);
const BANNED_PATTERN = /\bz-\[?\d+\]?/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const violations: string[] = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(path.join(__dirname, ".."), file).split(path.sep).join("/");
  if (isDocumentedOverlayException(rel)) continue;
  const content = fs.readFileSync(file, "utf8");
  const matches = content.match(BANNED_PATTERN) ?? [];
  for (const m of matches) {
    if (ALLOWED.has(m)) continue;
    if (m === "z-10" || m === "z-20" || m === "z-30") continue;
    violations.push(`${rel}: ${m}`);
  }
}

if (violations.length > 0) {
  console.error("Undocumented z-index utilities:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Overlay z-index gate OK");
```

- [ ] **Step 2: Write contract doc `docs/OVERLAY_STACK.md`**

```markdown
# Overlay and portal stack (R2)

Source: `src/lib/ui/overlay-layers.ts`

| Layer | Class | Value |
| --- | --- | --- |
| base | `z-base` | 0 |
| sticky | `z-sticky` | 10 |
| navigation | `z-navigation` | 20 |
| dropdown | `z-dropdown` | 50 |
| banner | `z-banner` | 100 |
| modalBackdrop | `z-modal-backdrop` | 200 |
| modalContent | `z-modal-content` | 210 |
| toast | `z-toast` | 300 |
| emergency | `z-emergency` | 400 |

## Rules

- Primitives own layer values via `src/lib/ui/overlay-classnames.ts`.
- Consumers must not use `z-[NNN]` or invalid utilities like `z-400`.
- Hidden decorative layers use `pointer-events-none`; interactive children opt in with `pointer-events-auto`.
- Modal content must exceed banner (`210 > 100`).
- Toasts must exceed modal content (`300 > 210`).

## Documented exceptions

- `src/components/find-page/find-page-island.tsx` — `z-[49]` fillet grooves (non-interactive)
- `src/components/editor/math-equation-dialog.tsx` — MathLive keyboard at emergency layer

## Verification

`npm run check:overlay-z-index`
```

- [ ] **Step 3: Add scripts**

```json
"check:overlay-z-index": "npx tsx scripts/check-overlay-z-index.ts"
```

Insert in `scripts/verify-all.sh` after `check:legacy-tokens`.

- [ ] **Step 4: Run gate**

```bash
npm run check:overlay-z-index
```

Expected: exit 0 after Task 6 migrations. Any listed violation is a STOP condition: return to the task owning that exact file and replace the numeric class with a named layer. Do not expand `ALLOWED` during R2.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-overlay-z-index.ts docs/OVERLAY_STACK.md package.json scripts/verify-all.sh
git commit -m "feat(r2): add overlay z-index static gate and contract doc"
```

---

### Task 8: Unit test — primitive class strings include contract layers

**Files:**
- Create: `src/components/primitives/__tests__/overlay-layers.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/components/primitives/__tests__/overlay-layers.test.ts
import { describe, expect, it } from "vitest";
import { backdropClassName, popupClassName } from "../dialog";
import { dropdownPositionerClassName, toastViewportClassName } from "@/lib/ui/overlay-classnames";

describe("primitive overlay classes", () => {
  it("dialog uses modal backdrop and content layers", () => {
    expect(backdropClassName).toContain("z-modal-backdrop");
    expect(popupClassName).toContain("z-modal-content");
  });

  it("dropdown positioner helper uses z-dropdown", () => {
    expect(dropdownPositionerClassName).toContain("z-dropdown");
  });

  it("toast viewport uses z-toast", () => {
    expect(toastViewportClassName).toContain("z-toast");
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm run test:unit -- src/components/primitives/__tests__/overlay-layers.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/primitives/__tests__/overlay-layers.test.ts
git commit -m "test(r2): assert primitive overlay layer classnames"
```

---

### Task 9: Playwright — dialog above banner

**Files:**
- Create: `e2e/smoke/overlay-dialog-above-banner.spec.ts`

- [ ] **Step 1: Spec**

```typescript
// e2e/smoke/overlay-dialog-above-banner.spec.ts
import { test, expect } from "../fixtures/auth";

test("dialog backdrop and content stack above view-as banner when both visible", async ({ page }) => {
  const fixtureText = process.env.PLAYWRIGHT_PAYMENT_FIXTURE_TEXT;
  expect(fixtureText, "PLAYWRIGHT_PAYMENT_FIXTURE_TEXT must be set by R0 preflight").toBeTruthy();

  await page.goto("/finances/student-payments");
  await page.waitForLoadState("networkidle");

  await page.evaluate(() => {
    const banner = document.createElement("div");
    banner.setAttribute("data-testid", "synthetic-banner");
    banner.className = "sticky top-0 z-banner w-full border-b bg-amber-100 p-2";
    banner.textContent = "Synthetic banner";
    document.body.prepend(banner);
  });

  const paymentRow = page.getByRole("row").filter({ hasText: fixtureText! });
  await expect(paymentRow, `payment fixture row "${fixtureText}"`).toHaveCount(1);
  const dialogTrigger = paymentRow.getByRole("button", { name: "Delete payment" });
  await expect(dialogTrigger).toHaveCount(1);
  await dialogTrigger.click();
  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible();

  const dialogZ = await dialog.evaluate((el) => parseInt(getComputedStyle(el).zIndex, 10));
  const bannerZ = await page.getByTestId("synthetic-banner").evaluate((el) => parseInt(getComputedStyle(el).zIndex, 10));

  expect(dialogZ).toBeGreaterThan(bannerZ);

  const center = await dialog.boundingBox();
  expect(center).not.toBeNull();
  const topEl = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="dialog"]') != null, {
    x: center!.x + center!.width / 2,
    y: center!.y + center!.height / 2,
  });
  expect(topEl).toBe(true);
});
```

- [ ] **Step 2: Run**

```bash
npm run test:browser -- e2e/smoke/overlay-dialog-above-banner.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke/overlay-dialog-above-banner.spec.ts
git commit -m "test(r2): browser spec for dialog above banner stacking"
```

---

### Task 10: Playwright — student-payments select overlay

**Files:**
- Create: `e2e/smoke/overlay-select-student-payments.spec.ts`

- [ ] **Step 1: Spec**

```typescript
// e2e/smoke/overlay-select-student-payments.spec.ts
import { test, expect } from "../fixtures/auth";

test("student-payments status select listbox is visible and unclipped", async ({ page }) => {
  const fixtureText = process.env.PLAYWRIGHT_PAYMENT_FIXTURE_TEXT;
  expect(fixtureText, "PLAYWRIGHT_PAYMENT_FIXTURE_TEXT must be set by R0 preflight").toBeTruthy();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/finances/student-payments");
  await page.waitForLoadState("networkidle");

  const paymentRow = page.getByRole("row").filter({ hasText: fixtureText! });
  await expect(paymentRow, `payment fixture row "${fixtureText}"`).toHaveCount(1);
  const selectTrigger = paymentRow.locator('[role="combobox"]').first();
  await expect(selectTrigger, "editable payment status combobox").toBeVisible();

  await selectTrigger.click();
  const listbox = page.locator('[role="listbox"]').first();
  await expect(listbox).toBeVisible();

  const triggerBox = await selectTrigger.boundingBox();
  const listBox = await listbox.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(listBox).not.toBeNull();

  if (triggerBox && listBox) {
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(800 + 2);
    expect(listBox.x).toBeGreaterThanOrEqual(0);
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(1280 + 2);
  }

  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('[role="listbox"]') != null || el?.closest('[role="option"]') != null;
  }, { x: listBox!.x + 8, y: listBox!.y + 8 });
  expect(hit).toBe(true);
});
```

- [ ] **Step 2: Run**

```bash
npm run test:browser -- e2e/smoke/overlay-select-student-payments.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke/overlay-select-student-payments.spec.ts
git commit -m "test(r2): browser spec for student-payments select overlay geometry"
```

---

### Task 11: Playwright — hidden panels do not intercept clicks

**Files:**
- Create: `e2e/smoke/overlay-hidden-pointer-events.spec.ts`

- [ ] **Step 1: Spec**

```typescript
// e2e/smoke/overlay-hidden-pointer-events.spec.ts
import { test, expect } from "../fixtures/auth";

test("closed find-page island fillet does not block header clicks", async ({ page }) => {
  await page.goto("/campuses");
  await page.waitForLoadState("networkidle");

  const headerLink = page.getByRole("link", { name: /campuses|home|dashboard/i }).first();
  await expect(headerLink, "required shell navigation link").toHaveCount(1);
  await expect(headerLink).toBeVisible();

  const linkBox = await headerLink.boundingBox();
  expect(linkBox).not.toBeNull();

  const blocked = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return true;
    const style = getComputedStyle(el);
    return style.pointerEvents === "none" ? false : el.tagName === "SPAN" && style.position === "fixed";
  }, { x: linkBox!.x + 4, y: linkBox!.y + linkBox!.height / 2 });

  expect(blocked).toBe(false);
  await headerLink.click();
});
```

- [ ] **Step 2: Run**

```bash
npm run test:browser -- e2e/smoke/overlay-hidden-pointer-events.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke/overlay-hidden-pointer-events.spec.ts
git commit -m "test(r2): browser spec for pointer-events on decorative overlays"
```

---

### Task 12: Final verification gate

- [ ] **Step 1: Full verify**

```bash
npm run verify
```

Expected: lint, typecheck, unit, build, legacy-token gate, overlay-z-index gate, and every browser spec pass with zero skipped tests. Any missing prerequisite is a STOP condition reported by R0 preflight.

- [ ] **Step 2: Confirm invalid z-400 gone**

```bash
rg "z-400" src/
```

Expected: no matches.

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "chore(r2): overlay portal stack complete"
```

---

## Manual / browser checks (R2)

| Scenario | Route | Steps | Pass |
| --- | --- | --- | --- |
| Select in table | `/finances/student-payments` | Open payment status select in first row | Listbox above table, clickable options |
| Dialog vs banner | `/users` + view-as or synthetic banner | Open destructive dialog | Dialog covers banner; backdrop dims full viewport |
| Date popover | `/courses/create` or any date field | Open date picker | Calendar not clipped by `main` overflow |
| Toast | Trigger save toast on any autosave form | Toast visible top-right | Toast above page content |
| Math dialog | Course materials editor with math | Open equation dialog, focus math keyboard | Keyboard not under scrim |

Capture screenshot evidence for any FAIL.

---

## R2 completion gate

1. `src/lib/ui/overlay-layers.ts` and `docs/OVERLAY_STACK.md` committed
2. Primitives use contract layers (no `z-50` collision on dialog/dropdown)
3. `z-400` invalid utility eliminated from `src/components/primitives/select.tsx`
4. `npm run check:overlay-z-index` passes
5. Documented exceptions only in find-page fillet + math-equation-dialog
6. Playwright overlay specs pass with zero skipped tests; missing fixtures or controls stop execution before the suite
7. R0 + R1 gates still pass

---

## Independent QA prompt (paste-ready)

```
You are an independent QA subagent. Do NOT patch code.

Repository: schedjuice-reimagined-fe
Branch: remediate/ui-r2-overlay
Depends on: R0 + R1 merged

Verify R2 overlay contract:

1. Static
   - rg "z-400" src/ → no matches
   - npm run check:overlay-z-index → exit 0
   - src/lib/ui/overlay-layers.ts defines ordered layers through emergency (400)
   - docs/OVERLAY_STACK.md matches layer table

2. Primitives
   - dialog backdrop uses z-modal-backdrop, popup z-modal-content
   - select/popover/menu/combobox/tooltip positioners use z-dropdown
   - toast viewport uses z-toast
   - view-as-banner uses z-banner

3. Exceptions (only these may use non-contract z-[49] or MathLive 400)
   - find-page-island.tsx fillet spans
   - math-equation-dialog.tsx keyboard z-index from OVERLAY_LAYERS.emergency

4. Browser (npm run test:browser -- e2e/smoke/overlay-*.spec.ts)
   - Dialog above banner spec
   - Student-payments select geometry spec
   - Pointer-events decorative spec

5. npm run verify passes

Return PASS/FAIL with z-index computed style evidence screenshots for any FAIL.
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-12-ui-remediation-r2-overlay-portal-stack.md`.**
