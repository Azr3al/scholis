# Student payments collapsible screenshot pane — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the student-payments screenshot preview pane collapsible (remembered in localStorage, DESIGN.md §12 rail morph + click sound) and bump Transaction ID / Description column floors so the table uses horizontal space better.

**Architecture:** Shell owns `previewCollapsed` via a small preference helper (same pattern as `use-grid-view-preference`). A new `ScreenshotPreviewColumn` wraps `ScreenshotPreviewPane` in a `motion.aside` that morphs width 20rem ↔ ~2rem with fixed inner width, Hide + edge chevron, and a collapsed ▶ rail. Original and Glide both receive that column; side grid tracks use `_auto` so the motion width drives layout. Column floors update in `student-payments-filter-ui.ts`.

**Tech Stack:** Next.js App Router, React, `motion/react`, `@/lib/sj/motion`, `playClick` from `@/lib/sound/click-sound`, Iconoir, Vitest (`npm run test:unit`).

**Spec:** `docs/superpowers/specs/2026-07-11-student-payments-collapsible-screenshot-pane-design.md`

All commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/screenshot-preview-collapsed-preference.ts` | Create | Pure read/write/default for collapsed preference |
| `src/lib/finances/screenshot-preview-collapsed-preference.test.ts` | Create | Unit tests for preference helper |
| `src/hooks/use-screenshot-preview-collapsed.ts` | Create | Client hook: hydrate + toggle + `playClick` |
| `src/lib/finances/student-payments-filter-ui.ts` | Modify | Bump Glide widths + ResourceTable `min-w` floors |
| `src/lib/finances/student-payments-filter-ui.test.ts` | Modify | Assert new width floors |
| `src/components/finances/screenshot-preview-column.tsx` | Create | Morphing column UI (expanded pane + collapsed rail) |
| `src/components/finances/screenshot-preview-pane.tsx` | Modify | Optional header slot / drop duplicate title if column owns chrome |
| `src/components/finances/student-payments-report-shell.tsx` | Modify | Wire preference, column, Show button, `_auto` split |
| `src/components/finances/student-payments-grid.tsx` | Modify | Side column `_auto` when `sidePanel` present |
| `src/components/layout/sheet-fullscreen-shell.tsx` | Modify | Optional `sidePanelGridClassName` (default unchanged) |

---

### Task 1: Collapsed preference helper (TDD)

**Files:**
- Create: `src/lib/finances/screenshot-preview-collapsed-preference.ts`
- Test: `src/lib/finances/screenshot-preview-collapsed-preference.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/finances/screenshot-preview-collapsed-preference.test.ts
import { afterEach, describe, expect, it } from "vitest";
import {
  SCREENSHOT_PREVIEW_COLLAPSED_KEY,
  readScreenshotPreviewCollapsed,
  writeScreenshotPreviewCollapsed,
} from "./screenshot-preview-collapsed-preference";

describe("screenshot preview collapsed preference", () => {
  afterEach(() => {
    localStorage.removeItem(SCREENSHOT_PREVIEW_COLLAPSED_KEY);
  });

  it("defaults to expanded (false) when missing", () => {
    expect(readScreenshotPreviewCollapsed()).toBe(false);
  });

  it("reads collapsed when stored as 1", () => {
    localStorage.setItem(SCREENSHOT_PREVIEW_COLLAPSED_KEY, "1");
    expect(readScreenshotPreviewCollapsed()).toBe(true);
  });

  it("reads expanded when stored as 0", () => {
    localStorage.setItem(SCREENSHOT_PREVIEW_COLLAPSED_KEY, "0");
    expect(readScreenshotPreviewCollapsed()).toBe(false);
  });

  it("treats invalid values as expanded", () => {
    localStorage.setItem(SCREENSHOT_PREVIEW_COLLAPSED_KEY, "yes");
    expect(readScreenshotPreviewCollapsed()).toBe(false);
  });

  it("writeScreenshotPreviewCollapsed persists 1 / 0", () => {
    writeScreenshotPreviewCollapsed(true);
    expect(localStorage.getItem(SCREENSHOT_PREVIEW_COLLAPSED_KEY)).toBe("1");
    writeScreenshotPreviewCollapsed(false);
    expect(localStorage.getItem(SCREENSHOT_PREVIEW_COLLAPSED_KEY)).toBe("0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-collapsed-preference.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/finances/screenshot-preview-collapsed-preference.ts
export const SCREENSHOT_PREVIEW_COLLAPSED_KEY =
  "student-payments:screenshot-preview-collapsed";

export function readScreenshotPreviewCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(SCREENSHOT_PREVIEW_COLLAPSED_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return false;
  } catch {
    return false;
  }
}

export function writeScreenshotPreviewCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(
      SCREENSHOT_PREVIEW_COLLAPSED_KEY,
      collapsed ? "1" : "0",
    );
  } catch {
    /* ignore quota / private mode */
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-collapsed-preference.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/screenshot-preview-collapsed-preference.ts \
  src/lib/finances/screenshot-preview-collapsed-preference.test.ts
git commit -m "feat(finances): add screenshot preview collapsed preference helper"
```

---

### Task 2: Preference hook with click sound

**Files:**
- Create: `src/hooks/use-screenshot-preview-collapsed.ts`

- [ ] **Step 1: Implement the hook**

Mirror `use-grid-view-preference` hydration; call `playClick` on every user toggle (not on hydrate).

```ts
// src/hooks/use-screenshot-preview-collapsed.ts
"use client";

import { useCallback, useEffect, useState } from "react";

import {
  readScreenshotPreviewCollapsed,
  writeScreenshotPreviewCollapsed,
} from "@/lib/finances/screenshot-preview-collapsed-preference";
import { playClick } from "@/lib/sound/click-sound";

/** Default expanded; persists collapsed/expanded for student-payments screenshot pane. */
export function useScreenshotPreviewCollapsed() {
  const [collapsed, setCollapsedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsedState(readScreenshotPreviewCollapsed());
    setHydrated(true);
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    writeScreenshotPreviewCollapsed(next);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writeScreenshotPreviewCollapsed(next);
      return next;
    });
    playClick();
  }, []);

  return { collapsed, setCollapsed, toggleCollapsed, hydrated };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-screenshot-preview-collapsed.ts
git commit -m "feat(finances): add useScreenshotPreviewCollapsed hook"
```

---

### Task 3: Wider column floors (TDD)

**Files:**
- Modify: `src/lib/finances/student-payments-filter-ui.ts`
- Modify: `src/lib/finances/student-payments-filter-ui.test.ts`

- [ ] **Step 1: Update tests to the new floors (fail first)**

In `student-payments-filter-ui.test.ts`, change expectations:

```ts
describe("paymentEditableFieldInputClassName", () => {
  it("uses 14rem floor for transaction_id", () => {
    expect(paymentEditableFieldInputClassName("transaction_id")).toContain(
      "min-w-[14rem]",
    );
  });

  it("uses 16rem floor for description", () => {
    expect(paymentEditableFieldInputClassName("description")).toContain(
      "min-w-[16rem]",
    );
  });
  // …keep shared sizing assertions
});

describe("Glide column width constants", () => {
  it("match the collapsible-pane wider floors", () => {
    expect(STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH).toBe(280);
    expect(STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH).toBe(320);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/finances/student-payments-filter-ui.test.ts`

Expected: FAIL on width / min-w assertions

- [ ] **Step 3: Update constants and helper**

```ts
// src/lib/finances/student-payments-filter-ui.ts
export const STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH = 280;
export const STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH = 320;

export function paymentEditableFieldInputClassName(
  field: EditablePaymentFieldName,
): string {
  const minW = field === "transaction_id" ? "min-w-[14rem]" : "min-w-[16rem]";
  return `h-8 ${minW} flex-1 text-sm`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/finances/student-payments-filter-ui.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/student-payments-filter-ui.ts \
  src/lib/finances/student-payments-filter-ui.test.ts
git commit -m "fix(finances): widen student payment txn/description column floors"
```

---

### Task 4: ScreenshotPreviewColumn (motion morph)

**Files:**
- Create: `src/components/finances/screenshot-preview-column.tsx`
- Modify: `src/components/finances/screenshot-preview-pane.tsx`

Reference pattern: `src/app/(design)/components/mockups/user-record/page.tsx` (`LeftRail` / `SectionRail` — `transition.railMorph` / `transition.panelWipe`, fixed inner width, `fadeFast` labels).

- [ ] **Step 1: Slim the pane title when the column owns chrome**

Add optional `hideTitle` (default `false`) so the column can render “Screenshot” + Hide once:

```tsx
// In ScreenshotPreviewPane props:
hideTitle?: boolean;

// In JSX:
{hideTitle ? null : (
  <p className="text-xs font-medium text-muted-foreground">Screenshot</p>
)}
```

- [ ] **Step 2: Implement ScreenshotPreviewColumn**

```tsx
// src/components/finances/screenshot-preview-column.tsx
"use client";

import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { ScreenshotPreviewPane } from "@/components/finances/screenshot-preview-pane";
import { Button } from "@/components/primitives";
import { crossfadeInstant, transition } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

const EXPANDED_WIDTH = "20rem";
const COLLAPSED_WIDTH = "2rem";
const INNER_WIDTH_CLASS = "w-[20rem]";

export function ScreenshotPreviewColumn({
  url,
  collapsed,
  onToggle,
  className,
}: {
  url: string | null;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const widthTransition = collapsed
    ? transition.railMorph
    : transition.panelWipe;

  return (
    <motion.aside
      className={cn(
        "relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-t border-border bg-muted/10 lg:border-l lg:border-t-0",
        className,
      )}
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={reduced ? { duration: 0 } : widthTransition}
      aria-label="Payment screenshot preview"
    >
      {/* Fixed inner width so content does not reflow mid-wipe (DESIGN.md §12). */}
      <div className={cn("flex h-full min-h-0 flex-col", INNER_WIDTH_CLASS)}>
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.div
              key="rail"
              className="flex h-full w-[2rem] flex-col items-center py-2"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={reduced ? { duration: 0 } : transition.fadeFast}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 active:scale-[0.98]"
                aria-label="Show screenshot preview"
                onClick={onToggle}
              >
                <NavArrowLeft width={16} height={16} />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="pane"
              className="flex h-full min-h-0 flex-col"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={reduced ? { duration: 0 } : transition.fadeFast}
              variants={reduced ? crossfadeInstant : undefined}
            >
              <div className="flex items-center gap-1 px-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 p-0 active:scale-[0.98]"
                  aria-label="Hide screenshot preview"
                  onClick={onToggle}
                >
                  <NavArrowRight width={16} height={16} />
                </Button>
                <p className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
                  Screenshot
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 shrink-0 active:scale-[0.98]"
                  onClick={onToggle}
                >
                  Hide
                </Button>
              </div>
              <ScreenshotPreviewPane
                url={url}
                hideTitle
                className="min-h-0 flex-1 pt-0"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
```

Notes for the implementer:
- Collapsed rail uses **NavArrowLeft** (▶ toward content / expand); expanded edge uses **NavArrowRight** (◀ collapse). If Iconoir directions feel inverted in LTR, swap the two icons — keep `aria-label`s correct.
- Do **not** hand-type durations/easings; only import from `@/lib/sj/motion`.
- First mount: `initial={false}` on the width morph avoids a flash; opacity enter on pane/rail still satisfies “no instant pop” for the chrome swap.

- [ ] **Step 3: Commit**

```bash
git add src/components/finances/screenshot-preview-column.tsx \
  src/components/finances/screenshot-preview-pane.tsx
git commit -m "feat(finances): add morphing screenshot preview column"
```

---

### Task 5: SheetFullscreenShell optional side column class

**Files:**
- Modify: `src/components/layout/sheet-fullscreen-shell.tsx`

Spec forbids a generic collapse API; allow an optional grid class so student-payments can use `_auto` without changing other consumers.

- [ ] **Step 1: Add optional prop with unchanged default**

```tsx
interface SheetFullscreenShellProps {
  // …existing props
  /** Override the main+side grid template. Default keeps legacy 16rem side column. */
  sidePanelGridClassName?: string;
}

// In the split branch:
className={cn(
  "grid min-h-0 flex-1 overflow-hidden",
  useSidePanel
    ? (sidePanelGridClassName ??
      "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem]")
    : "grid-cols-1",
)}
```

Pass `sidePanelGridClassName` through from props (default `undefined`).

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/sheet-fullscreen-shell.tsx
git commit -m "feat(layout): allow SheetFullscreenShell side panel grid class override"
```

---

### Task 6: Wire shell + Glide layouts

**Files:**
- Modify: `src/components/finances/student-payments-report-shell.tsx`
- Modify: `src/components/finances/student-payments-grid.tsx`

- [ ] **Step 1: Shell — preference, column, Show control**

In `student-payments-report-shell.tsx`:

1. Import `useScreenshotPreviewCollapsed`, `ScreenshotPreviewColumn`, `Button` (already imported).
2. Call the hook next to other state.
3. Replace bare `ScreenshotPreviewPane` with:

```tsx
const previewColumn = canViewScreenshots ? (
  <ScreenshotPreviewColumn
    url={previewUrl}
    collapsed={collapsed}
    onToggle={toggleCollapsed}
  />
) : null;
```

4. Pass `previewColumn` as Glide `sidePanel` (instead of `previewPane`).
5. Original split: always include the column when `canViewScreenshots`; change grid to:

```tsx
className={cn(
  "grid min-h-0 flex-1 overflow-hidden",
  canViewScreenshots
    ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]"
    : "grid-cols-1",
)}
```

Render `{previewColumn}` in the side slot (no extra bordered wrapper — the column owns the border).

6. When `canViewScreenshots && collapsed`, add a **Show screenshot** button into `headerActions` (both Glide and original share `headerActions`):

```tsx
{canViewScreenshots && collapsed ? (
  <Button
    type="button"
    variant="secondary"
    size="sm"
    className="active:scale-[0.98]"
    onClick={toggleCollapsed}
  >
    Show screenshot
  </Button>
) : null}
```

Place it beside `GridViewToggle` / upload link inside the existing `headerActions` fragment.

7. Hydration: shell already waits on grid-view `hydrated`. Also wait on screenshot preference `hydrated` before rendering the live layout (same skeleton) so the pane does not flash expanded→collapsed.

- [ ] **Step 2: Glide — `_auto` side column + fullscreen override**

In `student-payments-grid.tsx`, change the non-fullscreen split:

```tsx
<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_auto]">
```

For fullscreen `SheetFullscreenShell`:

```tsx
<SheetFullscreenShell
  layout={sidePanel ? "split" : "grid-first"}
  sidePanelGridClassName={
    sidePanel ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]" : undefined
  }
  // …existing props
  sidePanel={sidePanel}
/>
```

Remove the extra bordered `<aside>` wrapper around `sidePanel` in the non-fullscreen path if the column already provides border/background (avoid double chrome). Keep a plain flex child:

```tsx
<div className="min-h-0 overflow-hidden">{sidePanel}</div>
```

- [ ] **Step 3: Manual smoke (implementer)**

- Expanded default on first visit; Hide + edge chevron collapse with slow morph; ▶ + Show expand with panel wipe.
- Refresh keeps collapsed.
- Original + Glide; finance + course page.
- View image dialog while collapsed.
- Interface sounds on/off for click.
- No-permission user: no column / Show.

- [ ] **Step 4: Run unit tests**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-collapsed-preference.test.ts src/lib/finances/student-payments-filter-ui.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/student-payments-report-shell.tsx \
  src/components/finances/student-payments-grid.tsx \
  src/components/layout/sheet-fullscreen-shell.tsx
git commit -m "feat(finances): wire collapsible screenshot preview into student payments"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Collapsible pane; Hide + edge chevron; collapsed rail + Show | Tasks 4, 6 |
| Default expanded; localStorage remember | Tasks 1, 2, 6 |
| Open pane ~20rem; bump column floors | Tasks 3, 4 |
| railMorph / panelWipe / fadeFast / fixed inner width | Task 4 |
| useReducedMotion opacity/snap | Task 4 |
| brown-switch `playClick` on toggle | Task 2 |
| Original + Glide; finance + course (shared shell) | Task 6 |
| No generic collapse API; optional grid class only | Task 5 |
| View dialog while collapsed; hover URL retained | Task 6 (column hides chrome only) |
| Unit tests for preference + widths | Tasks 1, 3 |

No TBD/placeholder steps. Types/names consistent: `collapsed` / `toggleCollapsed` / `ScreenshotPreviewColumn` / `SCREENSHOT_PREVIEW_COLLAPSED_KEY`.
