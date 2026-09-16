# Student payments Glide hover preview render isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop hover screenshot preview updates from re-rendering the student-payments Glide `DataSheet`, restoring usable scroll while keeping immediate hover-to-preview.

**Architecture:** Move preview URL out of React shell state into a tiny module store (`useSyncExternalStore`). Only a connected preview column subscribes. Shell/grid call a stable setter that resolves `getPaymentScreenshotUrl`, skips no-ops, and clears on `null`. Glide keeps a stable `sidePanel` element that does not take `url` as a prop from the shell.

**Tech Stack:** React `useSyncExternalStore`, Vitest (`npm run test:unit`), existing Glide `onItemHovered` + `ScreenshotPreviewColumn`.

**Spec:** `docs/superpowers/specs/2026-07-11-student-payments-glide-hover-preview-perf-design.md`

All commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/screenshot-preview-store.ts` | Create | Module store: get / set (equality) / subscribe |
| `src/lib/finances/screenshot-preview-store.test.ts` | Create | Unit tests for equality + notify |
| `src/lib/finances/apply-screenshot-preview-hover.ts` | Create | Row → URL → store; clear on null; respect enabled flag |
| `src/lib/finances/apply-screenshot-preview-hover.test.ts` | Create | Unit tests for hover adapter |
| `src/hooks/finances/use-screenshot-preview-url.ts` | Create | `useSyncExternalStore` wrapper |
| `src/components/finances/screenshot-preview-column-connected.tsx` | Create | Column that reads store; no `url` prop from parent |
| `src/components/finances/student-payments-report-shell.tsx` | Modify | Drop `previewUrl` state; wire store + connected column |
| `src/components/finances/student-payments-grid.tsx` | Modify | Stable `onItemHovered` via `useCallback` + `rows` ref |

---

### Task 1: Screenshot preview store (TDD)

**Files:**
- Create: `src/lib/finances/screenshot-preview-store.ts`
- Test: `src/lib/finances/screenshot-preview-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/finances/screenshot-preview-store.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getScreenshotPreviewUrl,
  setScreenshotPreviewUrl,
  subscribeScreenshotPreviewUrl,
} from "./screenshot-preview-store";

describe("screenshot-preview-store", () => {
  afterEach(() => {
    setScreenshotPreviewUrl(null);
  });

  it("starts as null", () => {
    expect(getScreenshotPreviewUrl()).toBeNull();
  });

  it("notifies subscribers when the URL changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeScreenshotPreviewUrl(listener);
    setScreenshotPreviewUrl("https://cdn.example/a.png");
    expect(getScreenshotPreviewUrl()).toBe("https://cdn.example/a.png");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not notify when setting the same URL", () => {
    setScreenshotPreviewUrl("https://cdn.example/a.png");
    const listener = vi.fn();
    const unsubscribe = subscribeScreenshotPreviewUrl(listener);
    setScreenshotPreviewUrl("https://cdn.example/a.png");
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("notifies when clearing to null", () => {
    setScreenshotPreviewUrl("https://cdn.example/a.png");
    const listener = vi.fn();
    const unsubscribe = subscribeScreenshotPreviewUrl(listener);
    setScreenshotPreviewUrl(null);
    expect(getScreenshotPreviewUrl()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not notify when clearing null to null", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeScreenshotPreviewUrl(listener);
    setScreenshotPreviewUrl(null);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-store.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/finances/screenshot-preview-store.ts
type Listener = () => void;

let url: string | null = null;
const listeners = new Set<Listener>();

export function getScreenshotPreviewUrl(): string | null {
  return url;
}

export function setScreenshotPreviewUrl(next: string | null): void {
  if (next === url) return;
  url = next;
  listeners.forEach((listener) => listener());
}

export function subscribeScreenshotPreviewUrl(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-store.test.ts`

Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/screenshot-preview-store.ts src/lib/finances/screenshot-preview-store.test.ts
git commit -m "feat(finances): add screenshot preview URL store with equality"
```

---

### Task 2: Hover adapter (TDD)

**Files:**
- Create: `src/lib/finances/apply-screenshot-preview-hover.ts`
- Test: `src/lib/finances/apply-screenshot-preview-hover.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/finances/apply-screenshot-preview-hover.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyScreenshotPreviewHover } from "./apply-screenshot-preview-hover";
import {
  getScreenshotPreviewUrl,
  setScreenshotPreviewUrl,
} from "./screenshot-preview-store";

vi.mock("@/lib/data-sheets/payment-row-utils", () => ({
  getPaymentScreenshotUrl: (row: { screenshot?: string | null }) =>
    row.screenshot ?? null,
}));

describe("applyScreenshotPreviewHover", () => {
  afterEach(() => {
    setScreenshotPreviewUrl(null);
  });

  it("clears the store when enabled is false", () => {
    setScreenshotPreviewUrl("https://cdn.example/a.png");
    applyScreenshotPreviewHover(
      { screenshot: "https://cdn.example/b.png" } as never,
      { enabled: false },
    );
    expect(getScreenshotPreviewUrl()).toBeNull();
  });

  it("clears the store when row is null", () => {
    setScreenshotPreviewUrl("https://cdn.example/a.png");
    applyScreenshotPreviewHover(null, { enabled: true });
    expect(getScreenshotPreviewUrl()).toBeNull();
  });

  it("sets the resolved screenshot URL", () => {
    applyScreenshotPreviewHover(
      { screenshot: "https://cdn.example/row.png" } as never,
      { enabled: true },
    );
    expect(getScreenshotPreviewUrl()).toBe("https://cdn.example/row.png");
  });

  it("sets null when the row has no screenshot", () => {
    setScreenshotPreviewUrl("https://cdn.example/a.png");
    applyScreenshotPreviewHover(
      { screenshot: null } as never,
      { enabled: true },
    );
    expect(getScreenshotPreviewUrl()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/finances/apply-screenshot-preview-hover.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/finances/apply-screenshot-preview-hover.ts
import { getPaymentScreenshotUrl } from "@/lib/data-sheets/payment-row-utils";
import { setScreenshotPreviewUrl } from "@/lib/finances/screenshot-preview-store";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";

export function applyScreenshotPreviewHover(
  row: StudentPaymentAdminReportRow | null,
  options: { enabled: boolean },
): void {
  if (!options.enabled) {
    setScreenshotPreviewUrl(null);
    return;
  }
  if (!row) {
    setScreenshotPreviewUrl(null);
    return;
  }
  setScreenshotPreviewUrl(getPaymentScreenshotUrl(row));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/finances/apply-screenshot-preview-hover.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/apply-screenshot-preview-hover.ts src/lib/finances/apply-screenshot-preview-hover.test.ts
git commit -m "feat(finances): apply hover row to screenshot preview store"
```

---

### Task 3: Hook + connected preview column

**Files:**
- Create: `src/hooks/finances/use-screenshot-preview-url.ts`
- Create: `src/components/finances/screenshot-preview-column-connected.tsx`

- [ ] **Step 1: Add the hook**

```ts
// src/hooks/finances/use-screenshot-preview-url.ts
"use client";

import { useSyncExternalStore } from "react";
import {
  getScreenshotPreviewUrl,
  subscribeScreenshotPreviewUrl,
} from "@/lib/finances/screenshot-preview-store";

export function useScreenshotPreviewUrl(): string | null {
  return useSyncExternalStore(
    subscribeScreenshotPreviewUrl,
    getScreenshotPreviewUrl,
    getScreenshotPreviewUrl,
  );
}
```

- [ ] **Step 2: Add the connected column**

```tsx
// src/components/finances/screenshot-preview-column-connected.tsx
"use client";

import { ScreenshotPreviewColumn } from "@/components/finances/screenshot-preview-column";
import { useScreenshotPreviewUrl } from "@/hooks/finances/use-screenshot-preview-url";
import { getScreenshotPreviewUrl } from "@/lib/finances/screenshot-preview-store";

export function ScreenshotPreviewColumnConnected({
  collapsed,
  onToggle,
  onImageClick,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onImageClick?: (url: string) => void;
  className?: string;
}) {
  const url = useScreenshotPreviewUrl();

  return (
    <ScreenshotPreviewColumn
      url={url}
      collapsed={collapsed}
      onToggle={onToggle}
      onImageClick={
        onImageClick
          ? () => {
              const current = getScreenshotPreviewUrl();
              if (current) onImageClick(current);
            }
          : undefined
      }
      className={className}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/finances/use-screenshot-preview-url.ts src/components/finances/screenshot-preview-column-connected.tsx
git commit -m "feat(finances): connected screenshot preview column via store"
```

---

### Task 4: Wire shell off React previewUrl state

**Files:**
- Modify: `src/components/finances/student-payments-report-shell.tsx`

- [ ] **Step 1: Replace imports and drop `previewUrl` state**

Remove:

```ts
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
```

Add imports:

```ts
import { ScreenshotPreviewColumnConnected } from "@/components/finances/screenshot-preview-column-connected";
import { applyScreenshotPreviewHover } from "@/lib/finances/apply-screenshot-preview-hover";
import { setScreenshotPreviewUrl } from "@/lib/finances/screenshot-preview-store";
import { useEffect } from "react";
```

(Keep existing `useCallback` / `useMemo` / `useState` import; add `useEffect`.)

- [ ] **Step 2: Replace `handleRowHover` and clear store on unmount**

```ts
  const handleRowHover = useCallback(
    (row: StudentPaymentAdminReportRow | null) => {
      applyScreenshotPreviewHover(row, { enabled: canViewScreenshots });
    },
    [canViewScreenshots],
  );

  useEffect(() => {
    return () => {
      setScreenshotPreviewUrl(null);
    };
  }, []);
```

- [ ] **Step 3: Replace `previewColumn` with the connected column**

```ts
  const previewColumn = canViewScreenshots ? (
    <ScreenshotPreviewColumnConnected
      collapsed={previewCollapsed}
      onToggle={togglePreviewCollapsed}
      onImageClick={(url) => setViewImageUrl(url)}
    />
  ) : null;
```

Glide path still passes `sidePanel={previewColumn ?? undefined}` and `onRowHover={handleRowHover}`. Original path still renders `{previewColumn}` beside the table. Because `previewUrl` is no longer shell state, hovering must not re-render the shell or `StudentPaymentsGrid` — only `ScreenshotPreviewColumnConnected` updates.

- [ ] **Step 4: Smoke-check TypeScript for the shell file**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -40`

Expected: no errors referencing the shell / connected column / store (ignore unrelated project errors if any; fix ones you introduced).

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/student-payments-report-shell.tsx
git commit -m "fix(finances): isolate hover preview from shell React state"
```

---

### Task 5: Stabilize Glide `onItemHovered`

**Files:**
- Modify: `src/components/finances/student-payments-grid.tsx`

- [ ] **Step 1: Keep a ref to the latest `rows` array**

Near other refs/state in `StudentPaymentsGridContent` (after `rows` is defined):

```ts
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
```

- [ ] **Step 2: Replace inline `onItemHovered` with a stable callback**

```ts
  const handleItemHovered = useCallback(
    (args: { kind: string; location: readonly [number, number] }) => {
      if (!onRowHover) return;
      if (args.kind !== "cell") {
        onRowHover(null);
        return;
      }
      const displayRow = args.location[1];
      if (displayRow < 0) {
        onRowHover(null);
        return;
      }
      const row = rowsRef.current[displayRow];
      onRowHover(row ?? null);
    },
    [onRowHover],
  );
```

Import Glide’s hover args type if preferred:

```ts
import type { GridMouseEventArgs } from "@glideapps/glide-data-grid";
// handleItemHovered = useCallback((args: GridMouseEventArgs) => { ... }, [onRowHover]);
```

Use whatever type `DataEditor`’s `onItemHovered` already expects (match existing Glide typings in the file; do not invent a weaker type if `GridMouseEventArgs` is available).

- [ ] **Step 3: Memoize `gridProps` (or at least wire the stable handler)**

Replace the inline handler:

```ts
  const gridProps = useMemo(
    () => ({
      freezeColumns: isReport ? 2 : 1,
      onCellEdited,
      onCellClicked: handleCellClicked,
      onItemHovered: handleItemHovered,
    }),
    [isReport, onCellEdited, handleCellClicked, handleItemHovered],
  );
```

Then:

```tsx
          gridProps={gridProps}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/student-payments-grid.tsx
git commit -m "perf(finances): stabilize Glide onItemHovered for payment preview"
```

---

### Task 6: Verify unit suite + manual checklist

- [ ] **Step 1: Run store + adapter unit tests**

Run:

```bash
npm run test:unit -- src/lib/finances/screenshot-preview-store.test.ts src/lib/finances/apply-screenshot-preview-hover.test.ts
```

Expected: all PASS

- [ ] **Step 2: Manual checklist (finance + course student-payments, Glide)**

1. Scroll with screenshot pane open — continuous, not sticky.
2. Move mouse across rows — pane updates; scroll still usable.
3. Leave the grid — preview clears.
4. Hover a row with no screenshot — empty state.
5. Collapse / expand pane — works; View dialog still works.
6. Toggle to original ResourceTable — hover preview still works.
7. (Optional) React DevTools: hover rows → `StudentPaymentsGrid` / `DataSheet` do **not** re-render; connected column does.

- [ ] **Step 3: Final commit only if manual fixes were needed**

If no code changes from manual QA, skip. Otherwise commit the fix with a focused message.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Preview URL not in shell React state | Task 4 |
| Only preview column subscribes | Tasks 3–4 |
| Stable hover setter; clear on null | Tasks 2, 4 |
| Same URL no-op | Task 1 |
| Glide stable `onItemHovered` / rows ref | Task 5 |
| ResourceTable shares same setter path | Task 4 (`handleRowHover`) |
| Leave-grid clear bug fixed | Task 2 (`row === null` → clear) |
| View dialog unchanged | Task 4 (`onImageClick`) |
| Unit tests for store equality | Task 1 |
| Manual scroll / hover success criteria | Task 6 |
| Approach 2/3 out of scope | Not planned |

**Placeholder scan:** none.  
**Type consistency:** `setScreenshotPreviewUrl` / `applyScreenshotPreviewHover` / `useScreenshotPreviewUrl` / `ScreenshotPreviewColumnConnected` names are consistent across tasks.
