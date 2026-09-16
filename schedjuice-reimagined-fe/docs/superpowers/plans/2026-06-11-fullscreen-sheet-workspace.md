# Fullscreen Sheet Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an opt-in app fullscreen mode for grid-heavy internal pages, starting with a Google Sheets-like Import review fullscreen workspace.

**Architecture:** Fullscreen is a requested URL state gated by page/step capability. A provider under the internal layout derives `effectiveFullscreen`, hides app chrome only when allowed, and exposes registration/toggle APIs. Import review reuses its current store and actions while switching between normal layout and a compact sheet shell.

**Tech Stack:** Next.js 15, React 19 client components, `nuqs` query state, Tailwind CSS v4, Glide Data Grid, Vitest.

**Important repo rule:** Do not create branches, worktrees, or git commits unless the user explicitly asks. Treat each task's "checkpoint" as a git diff/status review, not a commit.

---

## File Structure

- Create `src/lib/fullscreen/fullscreen-state.ts`
  - Pure helpers for deriving effective fullscreen, topbar visibility, and stale query cleanup.
- Create `src/lib/fullscreen/fullscreen-state.test.ts`
  - Vitest coverage for eligibility and stale fullscreen behavior.
- Replace `src/hooks/use-fullscreen.ts`
  - Convert the current query-only hook into a context-backed hook that exposes requested/effective state, eligibility, registration, and exit/toggle actions.
- Create `src/components/layout/fullscreen-provider.tsx`
  - Client provider for `useFullscreen`, route cleanup, and page capability registration.
- Create `src/components/layout/fullscreen-toggle.tsx`
  - Topbar button that renders only when fullscreen is available.
- Create `src/components/layout/fullscreen-exit-button.tsx`
  - Floating exit button for fullscreen workspaces.
- Create `src/components/layout/sheet-fullscreen-shell.tsx`
  - Reusable compact sheet layout with top bar, optional control row, main grid area, right rail, and floating exit.
- Modify `src/app/(internal)/layout.tsx`
  - Wrap the internal shell in `FullscreenProvider`; hide `AppSidebar`, `AppTopbar`, and `ChatArea` when `effectiveFullscreen` is true.
- Modify `src/components/nav/app-topbar.tsx`
  - Replace the always-visible fullscreen button with `FullscreenToggle`.
- Modify `src/components/import-grid/import-data-grid.tsx`
  - Add optional `height` and `className` props so fullscreen can size the grid to its workspace.
- Modify `src/components/import-wizard/review-step.tsx`
  - Register fullscreen availability while review is active and not complete.
  - Extract shared review UI fragments enough to render normal mode and fullscreen mode without duplicating business logic.

---

### Task 1: Add Pure Fullscreen Rules

**Files:**
- Create: `src/lib/fullscreen/fullscreen-state.ts`
- Test: `src/lib/fullscreen/fullscreen-state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fullscreen/fullscreen-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  deriveEffectiveFullscreen,
  shouldClearRequestedFullscreen,
  shouldShowFullscreenToggle,
} from "./fullscreen-state";

describe("fullscreen-state", () => {
  it("uses requested fullscreen only when the page allows fullscreen", () => {
    expect(
      deriveEffectiveFullscreen({
        requestedFullscreen: true,
        isFullscreenAvailable: true,
      }),
    ).toBe(true);

    expect(
      deriveEffectiveFullscreen({
        requestedFullscreen: true,
        isFullscreenAvailable: false,
      }),
    ).toBe(false);
  });

  it("never enables fullscreen when the URL requested state is false", () => {
    expect(
      deriveEffectiveFullscreen({
        requestedFullscreen: false,
        isFullscreenAvailable: true,
      }),
    ).toBe(false);
  });

  it("shows the topbar toggle only when fullscreen is available", () => {
    expect(shouldShowFullscreenToggle({ isFullscreenAvailable: true })).toBe(true);
    expect(shouldShowFullscreenToggle({ isFullscreenAvailable: false })).toBe(false);
  });

  it("clears stale requested fullscreen when a page does not allow it", () => {
    expect(
      shouldClearRequestedFullscreen({
        requestedFullscreen: true,
        isFullscreenAvailable: false,
      }),
    ).toBe(true);

    expect(
      shouldClearRequestedFullscreen({
        requestedFullscreen: true,
        isFullscreenAvailable: true,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test:unit -- src/lib/fullscreen/fullscreen-state.test.ts
```

Expected: fail because `src/lib/fullscreen/fullscreen-state.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

Create `src/lib/fullscreen/fullscreen-state.ts`:

```ts
export interface FullscreenDerivationInput {
  requestedFullscreen: boolean;
  isFullscreenAvailable: boolean;
}

export function deriveEffectiveFullscreen({
  requestedFullscreen,
  isFullscreenAvailable,
}: FullscreenDerivationInput): boolean {
  return requestedFullscreen && isFullscreenAvailable;
}

export function shouldShowFullscreenToggle({
  isFullscreenAvailable,
}: Pick<FullscreenDerivationInput, "isFullscreenAvailable">): boolean {
  return isFullscreenAvailable;
}

export function shouldClearRequestedFullscreen({
  requestedFullscreen,
  isFullscreenAvailable,
}: FullscreenDerivationInput): boolean {
  return requestedFullscreen && !isFullscreenAvailable;
}
```

- [ ] **Step 4: Verify the helper tests pass**

Run:

```bash
npm run test:unit -- src/lib/fullscreen/fullscreen-state.test.ts
```

Expected: pass.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- src/lib/fullscreen/fullscreen-state.ts src/lib/fullscreen/fullscreen-state.test.ts
```

Expected: only the helper and its tests are changed.

---

### Task 2: Build The Fullscreen Provider And Hook

**Files:**
- Modify: `src/hooks/use-fullscreen.ts`
- Create: `src/components/layout/fullscreen-provider.tsx`
- Modify: `src/app/(internal)/layout.tsx`

- [ ] **Step 1: Replace the hook contract**

Replace `src/hooks/use-fullscreen.ts` with a context-backed hook:

```ts
"use client";

import { createContext, useContext } from "react";

export interface FullscreenAvailabilityConfig {
  enabled: boolean;
  label?: string;
}

export interface FullscreenContextValue {
  isFullscreen: boolean;
  requestedFullscreen: boolean;
  effectiveFullscreen: boolean;
  isFullscreenAvailable: boolean;
  label: string;
  toggle: () => void;
  exit: () => void;
  setAvailability: (config: FullscreenAvailabilityConfig) => void;
}

export const FullscreenContext = createContext<FullscreenContextValue | null>(
  null,
);

export const DEFAULT_FULLSCREEN_LABEL = "Fullscreen";

export const useFullscreen = () => {
  const context = useContext(FullscreenContext);
  if (!context) {
    throw new Error("useFullscreen must be used within FullscreenProvider.");
  }
  return context;
};
```

- [ ] **Step 2: Create the provider**

Create `src/components/layout/fullscreen-provider.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { parseAsBoolean, useQueryState } from "nuqs";

import {
  DEFAULT_FULLSCREEN_LABEL,
  FullscreenContext,
  type FullscreenAvailabilityConfig,
} from "@/hooks/use-fullscreen";
import {
  deriveEffectiveFullscreen,
  shouldClearRequestedFullscreen,
} from "@/lib/fullscreen/fullscreen-state";

const DEFAULT_AVAILABILITY: FullscreenAvailabilityConfig = {
  enabled: false,
  label: DEFAULT_FULLSCREEN_LABEL,
};

interface FullscreenProviderProps {
  children: ReactNode;
}

export function FullscreenProvider({ children }: FullscreenProviderProps) {
  const pathname = usePathname();
  const [requestedFullscreen, setRequestedFullscreen] = useQueryState(
    "isFullscreen",
    parseAsBoolean.withDefault(false),
  );
  const [availability, setAvailabilityState] =
    useState<FullscreenAvailabilityConfig>(DEFAULT_AVAILABILITY);

  const isFullscreenAvailable = availability.enabled;
  const effectiveFullscreen = deriveEffectiveFullscreen({
    requestedFullscreen,
    isFullscreenAvailable,
  });

  useEffect(() => {
    setAvailabilityState(DEFAULT_AVAILABILITY);
    void setRequestedFullscreen(false);
  }, [pathname, setRequestedFullscreen]);

  useEffect(() => {
    if (
      shouldClearRequestedFullscreen({
        requestedFullscreen,
        isFullscreenAvailable,
      })
    ) {
      void setRequestedFullscreen(false);
    }
  }, [requestedFullscreen, isFullscreenAvailable, setRequestedFullscreen]);

  const setAvailability = useCallback(
    (config: FullscreenAvailabilityConfig) => {
      setAvailabilityState({
        enabled: config.enabled,
        label: config.label ?? DEFAULT_FULLSCREEN_LABEL,
      });
    },
    [],
  );

  const exit = useCallback(() => {
    void setRequestedFullscreen(false);
  }, [setRequestedFullscreen]);

  const toggle = useCallback(() => {
    if (!isFullscreenAvailable) {
      void setRequestedFullscreen(false);
      return;
    }
    void setRequestedFullscreen(!requestedFullscreen);
  }, [isFullscreenAvailable, requestedFullscreen, setRequestedFullscreen]);

  const value = useMemo(
    () => ({
      isFullscreen: effectiveFullscreen,
      requestedFullscreen,
      effectiveFullscreen,
      isFullscreenAvailable,
      label: availability.label ?? DEFAULT_FULLSCREEN_LABEL,
      toggle,
      exit,
      setAvailability,
    }),
    [
      effectiveFullscreen,
      requestedFullscreen,
      isFullscreenAvailable,
      availability.label,
      toggle,
      exit,
      setAvailability,
    ],
  );

  return (
    <FullscreenContext.Provider value={value}>
      {children}
    </FullscreenContext.Provider>
  );
}
```

- [ ] **Step 3: Wrap the internal layout**

Modify `src/app/(internal)/layout.tsx` so `RootLayout` renders the provider around the existing layout tree:

```tsx
import { FullscreenProvider } from "@/components/layout/fullscreen-provider";
```

Then wrap the returned JSX:

```tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FullscreenProvider>
      <SidebarProvider>
        <InternalLayoutShell>{children}</InternalLayoutShell>
      </SidebarProvider>
    </FullscreenProvider>
  );
}
```

If `InternalLayoutShell` does not exist yet, create it in the same file in Task 4 when chrome hiding is added. For this task, the minimal acceptable change is:

```tsx
return (
  <FullscreenProvider>
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset
        id="main-content"
        tabIndex={-1}
        className="min-w-0 scroll-mt-4 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Suspense>
          <TempLayout>{children}</TempLayout>
        </Suspense>
      </SidebarInset>

      <ChatArea />
      <WebPushRegistrar />
    </SidebarProvider>
  </FullscreenProvider>
);
```

- [ ] **Step 4: Run type-aware feedback**

Run:

```bash
npm run test:unit -- src/lib/fullscreen/fullscreen-state.test.ts
```

Expected: pass. If TypeScript import issues appear during editor linting, fix them before continuing.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- src/hooks/use-fullscreen.ts src/components/layout/fullscreen-provider.tsx "src/app/(internal)/layout.tsx"
```

Expected: provider and hook exist; the current visual behavior is unchanged because no page has opted in yet.

---

### Task 3: Gate The Topbar Fullscreen Button

**Files:**
- Create: `src/components/layout/fullscreen-toggle.tsx`
- Modify: `src/components/nav/app-topbar.tsx`

- [ ] **Step 1: Create the gated topbar toggle**

Create `src/components/layout/fullscreen-toggle.tsx`:

```tsx
"use client";

import { Expand, Minimize } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFullscreen } from "@/hooks/use-fullscreen";

export function FullscreenToggle() {
  const { toggle, effectiveFullscreen, isFullscreenAvailable, label } =
    useFullscreen();

  if (!isFullscreenAvailable) return null;

  return (
    <Button
      size="icon"
      variant="outline"
      onClick={toggle}
      aria-label={effectiveFullscreen ? `Exit ${label}` : `Enter ${label}`}
      title={effectiveFullscreen ? `Exit ${label}` : `Enter ${label}`}
    >
      {effectiveFullscreen ? (
        <Minimize className="size-4" aria-hidden />
      ) : (
        <Expand className="size-4" aria-hidden />
      )}
    </Button>
  );
}
```

- [ ] **Step 2: Replace the topbar's inline fullscreen button**

In `src/components/nav/app-topbar.tsx`, remove these imports:

```tsx
import { useFullscreen } from "@/hooks/use-fullscreen";
import { Button, buttonVariants } from "../ui/button";
import { Bell, Expand, Minimize } from "lucide-react";
```

Replace with:

```tsx
import { Button, buttonVariants } from "../ui/button";
import { Bell } from "lucide-react";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
```

Remove:

```tsx
const { toggle, isFullscreen } = useFullscreen();
```

Replace the existing fullscreen `<Button>` with:

```tsx
<FullscreenToggle />
```

- [ ] **Step 3: Verify no fullscreen button appears before page opt-in**

Run the app if it is not already running:

```bash
npm run dev
```

Expected manual check: ordinary pages do not show the fullscreen button.

- [ ] **Step 4: Checkpoint**

Run:

```bash
git diff -- src/components/layout/fullscreen-toggle.tsx src/components/nav/app-topbar.tsx
```

Expected: topbar uses `FullscreenToggle`; no page has opted in yet.

---

### Task 4: Hide App Chrome When Effective Fullscreen Is Active

**Files:**
- Modify: `src/app/(internal)/layout.tsx`

- [ ] **Step 1: Extract a client shell that can read fullscreen state**

Because `src/app/(internal)/layout.tsx` is already a client component, keep this in the same file. Add:

```tsx
import { useFullscreen } from "@/hooks/use-fullscreen";
```

Create a local component below `TempLayout`:

```tsx
const InternalLayoutShell = ({ children }: { children: React.ReactNode }) => {
  const { effectiveFullscreen } = useFullscreen();

  return (
    <>
      {!effectiveFullscreen ? <AppSidebar /> : null}
      <SidebarInset
        id="main-content"
        tabIndex={-1}
        className="min-w-0 scroll-mt-4 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Suspense>
          <TempLayout hideTopbar={effectiveFullscreen}>{children}</TempLayout>
        </Suspense>
      </SidebarInset>

      {!effectiveFullscreen ? <ChatArea /> : null}
      <WebPushRegistrar />
    </>
  );
};
```

- [ ] **Step 2: Let `TempLayout` hide the topbar**

Change `TempLayout` from:

```tsx
const TempLayout = ({ children }: { children: React.ReactNode }) => {
```

To:

```tsx
const TempLayout = ({
  children,
  hideTopbar = false,
}: {
  children: React.ReactNode;
  hideTopbar?: boolean;
}) => {
```

Then change:

```tsx
<AppTopbarSuspence />
```

To:

```tsx
{!hideTopbar ? <AppTopbarSuspence /> : null}
```

- [ ] **Step 3: Use the extracted shell in `RootLayout`**

Change `RootLayout` to:

```tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FullscreenProvider>
      <SidebarProvider>
        <InternalLayoutShell>{children}</InternalLayoutShell>
      </SidebarProvider>
    </FullscreenProvider>
  );
}
```

- [ ] **Step 4: Check the no-opt-in behavior**

Run:

```bash
npm run test:unit -- src/lib/fullscreen/fullscreen-state.test.ts
```

Expected: pass. Manual check: ordinary pages still show sidebar/topbar because no page opts in.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- "src/app/(internal)/layout.tsx"
```

Expected: app chrome is conditional on `effectiveFullscreen`, not raw query state.

---

### Task 5: Add The Reusable Sheet Fullscreen Shell

**Files:**
- Create: `src/components/layout/fullscreen-exit-button.tsx`
- Create: `src/components/layout/sheet-fullscreen-shell.tsx`

- [ ] **Step 1: Create the floating exit button**

Create `src/components/layout/fullscreen-exit-button.tsx`:

```tsx
"use client";

import { Minimize } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFullscreen } from "@/hooks/use-fullscreen";

interface FullscreenExitButtonProps {
  className?: string;
}

export function FullscreenExitButton({ className }: FullscreenExitButtonProps) {
  const { exit, effectiveFullscreen, label } = useFullscreen();

  if (!effectiveFullscreen) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={exit}
      className={cn(
        "fixed bottom-4 right-4 rounded-full border-border bg-background/95 px-3 shadow-[0_12px_30px_-18px_rgba(24,24,27,0.45)] backdrop-blur",
        "focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={`Exit ${label}`}
      title={`Exit ${label}`}
    >
      <Minimize className="mr-1.5 size-3.5" aria-hidden />
      Exit
    </Button>
  );
}
```

- [ ] **Step 2: Create the sheet shell**

Create `src/components/layout/sheet-fullscreen-shell.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

import { FullscreenExitButton } from "@/components/layout/fullscreen-exit-button";
import { cn } from "@/lib/utils";

interface SheetFullscreenShellProps {
  title: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  controls?: ReactNode;
  main: ReactNode;
  sidePanel?: ReactNode;
  className?: string;
}

export function SheetFullscreenShell({
  title,
  summary,
  actions,
  controls,
  main,
  sidePanel,
  className,
}: SheetFullscreenShellProps) {
  return (
    <section
      className={cn(
        "relative flex min-h-[100dvh] w-full min-w-0 flex-col bg-background text-foreground",
        className,
      )}
    >
      <div className="flex min-h-10 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="truncate text-sm font-semibold">{title}</div>
          {summary ? (
            <div className="min-w-0 truncate text-xs text-muted-foreground">
              {summary}
            </div>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      {controls ? (
        <div className="flex min-h-10 shrink-0 items-center gap-3 border-b border-border bg-muted/35 px-3">
          {controls}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-h-0 min-w-0 overflow-hidden">{main}</div>
        {sidePanel ? (
          <aside className="min-h-0 border-t border-border bg-background lg:border-l lg:border-t-0">
            {sidePanel}
          </aside>
        ) : null}
      </div>

      <FullscreenExitButton />
    </section>
  );
}
```

- [ ] **Step 3: Manual visual check with temporary local usage only**

Do not leave temporary code in the final diff. If needed, temporarily render `SheetFullscreenShell` from a scratch page or from Import review, verify the layout fills the viewport, then remove the temporary usage before the checkpoint.

- [ ] **Step 4: Checkpoint**

Run:

```bash
git diff -- src/components/layout/fullscreen-exit-button.tsx src/components/layout/sheet-fullscreen-shell.tsx
```

Expected: only reusable shell components are added.

---

### Task 6: Let Import Data Grid Accept Workspace Height

**Files:**
- Modify: `src/components/import-grid/import-data-grid.tsx`

- [ ] **Step 1: Extend props**

Change the function signature block to include `height` and `className`:

```tsx
export function ImportDataGrid({
  duplicateResolution,
  validationErrors = [],
  focusTarget = null,
  onCellActivated,
  onCellEdited: onCellEditedExternal,
  height,
  className,
}: {
  duplicateResolution?: DuplicateEmailResolution | null;
  validationErrors?: ImportValidationError[];
  focusTarget?: ImportGridFocusTarget | null;
  onCellActivated?: (
    item: Item,
    bounds: Rectangle | null,
    field: string,
    sourceRow: number,
  ) => void;
  onCellEdited?: (sourceRow: number, field: string, value: string) => void;
  height?: number;
  className?: string;
}) {
```

- [ ] **Step 2: Use explicit height when provided**

After `viewportMaxHeight`, add:

```tsx
const resolvedGridHeight = height ?? gridHeight;
```

Because `gridHeight` is declared later today, place this line after the existing `gridHeight` calculation, not near `viewportMaxHeight`.

- [ ] **Step 3: Apply the class and resolved height**

Change the wrapper:

```tsx
className="w-full overflow-hidden rounded-md border border-border"
style={{ height: gridHeight }}
```

To:

```tsx
className={cn("w-full overflow-hidden rounded-md border border-border", className)}
style={{ height: resolvedGridHeight }}
```

Add this import if it is not already present:

```tsx
import { cn } from "@/lib/utils";
```

Change `DataEditor`:

```tsx
height={gridHeight}
```

To:

```tsx
height={resolvedGridHeight}
```

- [ ] **Step 4: Verify existing grid behavior remains unchanged**

Run:

```bash
npm run test:unit -- src/lib/imports/resolution.test.ts
```

Expected: pass. Manual check: normal Import review grid still uses its current calculated height when `height` is not passed.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- src/components/import-grid/import-data-grid.tsx
```

Expected: only optional sizing/class props were added.

---

### Task 7: Register Import Review Fullscreen Availability

**Files:**
- Modify: `src/components/import-wizard/review-step.tsx`

- [ ] **Step 1: Import the fullscreen hook**

Add:

```tsx
import { useFullscreen } from "@/hooks/use-fullscreen";
```

- [ ] **Step 2: Read fullscreen state near the top of `ReviewStep`**

After `useResolution();`, add:

```tsx
const { effectiveFullscreen, setAvailability } = useFullscreen();
```

- [ ] **Step 3: Register availability only while review is active and incomplete**

After `commitMutation` is declared and before early returns, add:

```tsx
useEffect(() => {
  setAvailability({
    enabled: Boolean(parse) && !commitMutation.isSuccess,
    label: "Import fullscreen",
  });

  return () => {
    setAvailability({ enabled: false });
  };
}, [parse, commitMutation.isSuccess, setAvailability]);
```

This effect intentionally lives in `ReviewStep`, so upload and map steps never register fullscreen availability.

- [ ] **Step 4: Verify the topbar button appears only on review**

Run the app:

```bash
npm run dev
```

Expected manual checks:

- `/imports` upload step: no fullscreen button.
- `/imports` map step: no fullscreen button.
- `/imports` review step with parsed data: fullscreen button appears.
- Completing the import: fullscreen button disappears.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- src/components/import-wizard/review-step.tsx
```

Expected: hook import, fullscreen state read, availability effect only.

---

### Task 8: Render Import Review In The Compact Sheet Shell

**Files:**
- Modify: `src/components/import-wizard/review-step.tsx`

- [ ] **Step 1: Import the sheet shell**

Add:

```tsx
import { SheetFullscreenShell } from "@/components/layout/sheet-fullscreen-shell";
```

- [ ] **Step 2: Extract reusable action JSX for the Import button**

Before `return`, add:

```tsx
const importAction = (
  <Tooltip>
    <TooltipTrigger asChild>
      <span>
        <Button
          type="button"
          disabled={!canImport}
          onClick={() => commitMutation.mutate()}
        >
          {commitMutation.isLoading ? "Importing…" : "Import"}
        </Button>
      </span>
    </TooltipTrigger>
    {importDisabledReason ? (
      <TooltipContent>{importDisabledReason}</TooltipContent>
    ) : null}
  </Tooltip>
);
```

Then replace the existing inline `Tooltip` import button in normal mode with:

```tsx
{importAction}
```

- [ ] **Step 3: Extract the summary text**

Before `return`, add:

```tsx
const summaryText = `${parse.rowCount} rows · ${summary.newUsers} new · ${summary.linkedEmails} updates · ${enrollmentCount} enrollments${
  validationErrors.length > 0
    ? ` · ${validationErrors.length} error${validationErrors.length === 1 ? "" : "s"}`
    : ""
}${
  skippedDuplicateRows > 0
    ? ` · ${skippedDuplicateRows} row${skippedDuplicateRows === 1 ? "" : "s"} skipped (${duplicateEmailCount} duplicate email${duplicateEmailCount === 1 ? "" : "s"})`
    : ""
}${
  summary.needsAttention > 0
    ? ` · ${summary.needsAttention} need attention`
    : ""
}`;
```

Replace the normal summary `<p>` contents with:

```tsx
{summaryText}
```

- [ ] **Step 4: Extract shared side panels**

Before `return`, add:

```tsx
const sidePanels = (
  <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
    <ValidationErrorsPanel
      errors={validationErrors}
      fields={fields}
      initialCount={sessionErrorCount}
      collapsed={validationPanelCollapsed}
      focusTarget={focusTarget}
      onToggleCollapsed={() => setValidationPanelCollapsed((c) => !c)}
      onFocusError={(err) => focusGridCell(err.sourceRow, err.field)}
    />
    <NeedsAttentionPanel
      groups={unresolvedGroups}
      conflicts={conflicts}
      progress={courseProgress}
      collapsed={panelCollapsed}
      onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
      onResolve={(group, rect) => {
        const firstRow = rowIds.find((rid) =>
          resolution
            .get(cellKey(rid, "courses"))
            ?.tokens?.some((t) => t.raw === group.raw && t.origin !== "manual"),
        );
        if (!firstRow) return;
        setPickerTarget({
          rowId: firstRow,
          tokenRaw: group.raw,
          rect,
          candidates: group.candidates,
          affectedRows: group.count,
        });
      }}
    />
  </div>
);
```

Then replace the existing normal-mode `<aside>` contents with:

```tsx
<aside className="flex w-72 shrink-0 flex-col gap-3">
  {sidePanels}
</aside>
```

If the extra `p-3` is too much in normal mode, split `sidePanels` into `sidePanelContent` without the wrapper and wrap it differently in normal/fullscreen mode.

- [ ] **Step 5: Add viewport-based fullscreen grid height**

Near the other `useState` calls, add:

```tsx
const [fullscreenGridHeight, setFullscreenGridHeight] = useState(700);
```

Near the other effects, add:

```tsx
useEffect(() => {
  const updateHeight = () => {
    setFullscreenGridHeight(Math.max(420, window.innerHeight - 96));
  };

  updateHeight();
  window.addEventListener("resize", updateHeight);
  return () => window.removeEventListener("resize", updateHeight);
}, []);
```

- [ ] **Step 6: Add the fullscreen return branch**

Immediately before the existing normal `return (`, add:

```tsx
if (effectiveFullscreen && !commitMutation.isSuccess) {
  return (
    <>
      <SheetFullscreenShell
        title="Import"
        summary={summaryText}
        actions={importAction}
        controls={
          <div className="flex min-w-0 flex-1 items-center gap-3 text-xs text-muted-foreground">
            {summary.newUsers > 0 ? (
              <MicrosoftCreateToggle
                checked={sendWelcomeEmails}
                onChange={setSendWelcomeEmails}
                title="Send welcome emails"
                description={`Send login instructions to ${summary.newUsers} newly created user${summary.newUsers === 1 ? "" : "s"} when import completes. Existing linked users are not emailed.`}
              />
            ) : null}
            {coursesColIndex >= 0 ? <ImportCourseScopeBar /> : null}
          </div>
        }
        main={
          <div className="h-full min-h-0 p-2">
            <ImportDataGrid
              duplicateResolution={duplicateEmailResolution}
              validationErrors={validationErrors}
              focusTarget={focusTarget}
              onCellActivated={handleCellActivated}
              onCellEdited={handleCellEdited}
              height={fullscreenGridHeight}
              className="h-full rounded-none"
            />
          </div>
        }
        sidePanel={sidePanels}
      />
      <LinkNoticeBar notice={notice} onDismiss={dismissNotice} />
      <CoursePickerPopover
        target={pickerTarget}
        onClose={() => setPickerTarget(null)}
        onPick={(tokenRaw, rowId, choice) => {
          if (coursesColIndex < 0) return;
          const { next, affected, snapshot } = propagateCoursePick(
            resolution,
            parse.rows,
            coursesColIndex,
            rowIds,
            rowId,
            tokenRaw,
            choice,
          );
          useImportStore.getState().mergeResolutions(next);
          if (choice && affected.length > 1) {
            setNotice({
              id: Date.now(),
              tokenRaw,
              count: affected.length,
              onUndo: () => {
                const current = useImportStore.getState().resolution;
                const restored = new Map(current);
                snapshot.forEach((v, k) => restored.set(k, v));
                useImportStore.setState({ resolution: restored });
              },
            });
          }
          setPickerTarget(null);
        }}
      />
    </>
  );
}
```

- [ ] **Step 7: Verify normal mode still works**

Run:

```bash
npm run test:unit -- src/lib/imports/validation-errors.test.ts src/lib/imports/resolution.test.ts
```

Expected: pass.

Manual checks:

- Normal review layout still renders.
- Fullscreen review hides app chrome.
- Floating exit returns to normal layout.
- Import button disabled tooltip still works.
- Course picker opens from grid cells.

- [ ] **Step 8: Checkpoint**

Run:

```bash
git diff -- src/components/import-wizard/review-step.tsx
```

Expected: review step has a clear fullscreen branch and shared data/actions.

---

### Task 9: Polish Responsive And Overflow Behavior

**Files:**
- Modify: `src/components/layout/sheet-fullscreen-shell.tsx`
- Modify: `src/components/import-wizard/review-step.tsx`
- Modify: `src/components/import-grid/import-data-grid.tsx` only if visual checks show grid overflow bugs.

- [ ] **Step 1: Verify desktop layout**

Run:

```bash
npm run dev
```

Manual checks at desktop width:

- Sheet top bar height is compact.
- Secondary controls do not wrap into excessive height.
- Grid uses the available viewport.
- Right rail is visible and scrolls internally if content is tall.

- [ ] **Step 2: Verify smaller widths**

Use browser responsive mode around 768px and 390px.

Expected:

- App shell does not create horizontal page overflow.
- The grid can scroll internally.
- Right rail stacks below the grid or remains usable through the shell's single-column fallback.
- Floating exit button remains visible.

- [ ] **Step 3: Tighten shell classes if needed**

If right rail consumes too much mobile space, update the shell workspace classes to:

```tsx
<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_18rem]">
```

And ensure the side panel has internal scrolling:

```tsx
<aside className="min-h-0 max-h-72 overflow-auto border-t border-border bg-background lg:max-h-none lg:border-l lg:border-t-0">
```

- [ ] **Step 4: Checkpoint**

Run:

```bash
git diff -- src/components/layout/sheet-fullscreen-shell.tsx src/components/import-wizard/review-step.tsx src/components/import-grid/import-data-grid.tsx
```

Expected: only responsive/overflow refinements after functional behavior is in place.

---

### Task 10: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm run test:unit -- src/lib/fullscreen/fullscreen-state.test.ts src/lib/layout/page-width.test.ts src/lib/imports/validation-errors.test.ts src/lib/imports/resolution.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Read lints for changed files**

Use IDE diagnostics or `ReadLints` scoped to:

```text
src/hooks/use-fullscreen.ts
src/components/layout/fullscreen-provider.tsx
src/components/layout/fullscreen-toggle.tsx
src/components/layout/fullscreen-exit-button.tsx
src/components/layout/sheet-fullscreen-shell.tsx
src/app/(internal)/layout.tsx
src/components/nav/app-topbar.tsx
src/components/import-grid/import-data-grid.tsx
src/components/import-wizard/review-step.tsx
```

Expected: no new lint or TypeScript errors in changed files.

- [ ] **Step 3: Manual acceptance checks**

Perform these checks in the browser:

- Ordinary internal pages do not show the fullscreen button.
- Import upload step does not show the fullscreen button.
- Import map step does not show the fullscreen button.
- Import review step shows the fullscreen button.
- Entering fullscreen hides the sidebar, topbar, normal page frame, and chat area.
- Fullscreen view uses Compact Sheet Shell with top sheet bar, control row, grid, right panels, and floating exit.
- Manually adding `?isFullscreen=true` to an ineligible page does not hide app chrome.
- Navigating away from Import review exits fullscreen.
- Import success exits fullscreen and shows the normal success state.

- [ ] **Step 4: Review working tree**

Run:

```bash
git status --short
git diff --stat
```

Expected: changes are limited to the files in this plan plus the already-approved spec and this plan file. Do not commit unless the user explicitly asks.
