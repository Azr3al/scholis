# Legacy UI Search Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared async-loading infrastructure (`primitives/skeleton`, `AsyncContentPanel`, `SearchField`) and migrate `StaffUserSearchCombobox`, `BackendSearchableCombobox`, and `EntityCombobox` to DESIGN.md §12 motion and loading patterns.

**Architecture:** Extract-from-reference (Approach B): generalize patterns from `StaffUserSearchCombobox` into reusable loading components, then migrate search widgets in four PR-sized commits. Preserve all public prop APIs and React Query cache keys on entity combobox.

**Tech Stack:** Next.js App Router, TanStack Query, Vitest, `@/components/primitives/*`, Iconoir, Motion (`motion/react`), `@/lib/sj/motion.ts`.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-07-06-legacy-ui-search-widgets-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/primitives/skeleton.tsx` | Token-based skeleton primitive |
| `src/components/loading/async-content-panel.tsx` | State-machine panel + AnimatePresence crossfade |
| `src/components/loading/async-content-panel.test.ts` | Unit tests for `deriveAsyncPanelState` |
| `src/components/form/search-field.tsx` | Search input with Iconoir icons + fetch spinner |
| `src/app/(design)/components/_demos/async-loading-demo.tsx` | Showcase all panel states |
| `src/components/loading/structured-skeletons.tsx` | Swap skeleton import to primitive |
| `src/components/form/staff-user-search-combobox.tsx` | Refactor to shared infra |
| `src/components/form/backend-searchable-combobox.tsx` | Full rewrite on primitives |
| `src/components/form/entity-combobox.tsx` | Full rewrite on primitives |
| `src/components/primitives/index.ts` | Export `Skeleton` |

---

## PR 1 — Shared infrastructure

### Task 1: `primitives/skeleton` (TDD-lite)

**Files:**
- Create: `src/components/primitives/skeleton.tsx`
- Modify: `src/components/primitives/index.ts`

- [ ] **Step 1: Create skeleton primitive**

Create `src/components/primitives/skeleton.tsx`:

```tsx
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="presentation"
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-surface-skeleton motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
```

- [ ] **Step 2: Export from primitives index**

Add to `src/components/primitives/index.ts`:

```ts
export { Skeleton } from "./skeleton";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/primitives/skeleton.tsx src/components/primitives/index.ts
git commit -m "feat(ui): add primitives/skeleton with surface-skeleton token"
```

---

### Task 2: `deriveAsyncPanelState` helper (TDD)

**Files:**
- Create: `src/components/loading/async-content-panel.test.ts`
- Create: `src/components/loading/async-content-panel.tsx` (helper only first)

- [ ] **Step 1: Write failing tests**

Create `src/components/loading/async-content-panel.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deriveAsyncPanelState } from "./async-content-panel";

describe("deriveAsyncPanelState", () => {
  const base = {
    enabled: true,
    queryLength: 3,
    minLength: 2,
    isError: false,
    isFetching: false,
    resultCount: 0,
  };

  it("returns idle when disabled", () => {
    expect(deriveAsyncPanelState({ ...base, enabled: false })).toBe("idle");
  });

  it("returns hint when query too short", () => {
    expect(deriveAsyncPanelState({ ...base, queryLength: 1 })).toBe("hint");
  });

  it("returns error when isError", () => {
    expect(deriveAsyncPanelState({ ...base, isError: true })).toBe("error");
  });

  it("returns loading when fetching with no results", () => {
    expect(
      deriveAsyncPanelState({ ...base, isFetching: true, resultCount: 0 }),
    ).toBe("loading");
  });

  it("returns empty when not fetching and zero results", () => {
    expect(deriveAsyncPanelState({ ...base, resultCount: 0 })).toBe("empty");
  });

  it("returns ready when results exist", () => {
    expect(deriveAsyncPanelState({ ...base, resultCount: 2 })).toBe("ready");
  });

  it("returns ready when refetching with stale results", () => {
    expect(
      deriveAsyncPanelState({ ...base, isFetching: true, resultCount: 3 }),
    ).toBe("ready");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm test -- src/components/loading/async-content-panel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

Create `src/components/loading/async-content-panel.tsx` with exports:

```ts
export type AsyncPanelState =
  | "idle"
  | "hint"
  | "loading"
  | "empty"
  | "error"
  | "ready";

export type DeriveAsyncPanelStateInput = {
  enabled: boolean;
  queryLength: number;
  minLength: number;
  isError: boolean;
  isFetching: boolean;
  resultCount: number;
};

export function deriveAsyncPanelState(input: DeriveAsyncPanelStateInput): AsyncPanelState {
  if (!input.enabled) return "idle";
  if (input.queryLength < input.minLength) return "hint";
  if (input.isError) return "error";
  if (input.isFetching && input.resultCount === 0) return "loading";
  if (input.resultCount === 0) return "empty";
  return "ready";
}
```

- [ ] **Step 4: Run tests**

Run: `cd schedjuice-reimagined-fe && npm test -- src/components/loading/async-content-panel.test.ts`
Expected: PASS (6–7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/loading/async-content-panel.tsx src/components/loading/async-content-panel.test.ts
git commit -m "feat(ui): add deriveAsyncPanelState helper with tests"
```

---

### Task 3: `AsyncContentPanel` component

**Files:**
- Modify: `src/components/loading/async-content-panel.tsx`

- [ ] **Step 1: Add client component with motion**

Append to `async-content-panel.tsx` (keep helper exports):

```tsx
"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  crossfade,
  crossfadeInstant,
  crossfadeOpacity,
  staggerItem,
  staggerList,
} from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

export type AsyncContentPanelProps = {
  state: AsyncPanelState;
  ariaBusy?: boolean;
  className?: string;
  idle?: React.ReactNode;
  hint?: React.ReactNode;
  empty?: React.ReactNode;
  error?: React.ReactNode;
  loading?: React.ReactNode;
  children?: React.ReactNode;
  staggerResults?: boolean;
};

export function AsyncContentPanel({
  state,
  ariaBusy = false,
  className,
  idle,
  hint,
  empty,
  error,
  loading,
  children,
  staggerResults = false,
}: AsyncContentPanelProps) {
  const reducedMotion = useReducedMotion();
  const stateVariants = reducedMotion ? crossfadeInstant : crossfade;
  const resultsContainerVariants = reducedMotion ? crossfadeInstant : staggerList;
  const resultRowVariants = reducedMotion ? crossfadeOpacity : staggerItem;

  const centered = "px-4 py-6 text-center text-sm text-text-muted";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-surface",
        className,
      )}
      aria-busy={ariaBusy}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state}
          variants={stateVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {state === "idle" && idle ? idle : null}
          {state === "hint" && hint ? <p className={centered}>{hint}</p> : null}
          {state === "loading" && loading ? loading : null}
          {state === "error" && error ? (
            <p className={cn(centered, "text-destructive")} role="alert">
              {error}
            </p>
          ) : null}
          {state === "empty" && empty ? <p className={centered}>{empty}</p> : null}
          {state === "ready" && children ? (
            staggerResults ? (
              <motion.div
                variants={resultsContainerVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                {children}
              </motion.div>
            ) : (
              children
            )
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Wrap each result row when `staggerResults` is true. */
export function AsyncContentPanelRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const resultRowVariants = reducedMotion ? crossfadeOpacity : staggerItem;
  return (
    <motion.div variants={resultRowVariants} className={className}>
      {children}
    </motion.div>
  );
}
```

Note: move `"use client"` to top of file; helper `deriveAsyncPanelState` stays usable from tests (Vitest handles client boundary).

- [ ] **Step 2: Commit**

```bash
git add src/components/loading/async-content-panel.tsx
git commit -m "feat(ui): add AsyncContentPanel with crossfade motion"
```

---

### Task 4: `SearchField`

**Files:**
- Create: `src/components/form/search-field.tsx`

- [ ] **Step 1: Create SearchField**

```tsx
"use client";

import { Refresh, Search } from "iconoir-react";

import { Input } from "@/components/primitives/input";
import { cn } from "@/lib/utils";

type SearchFieldProps = Omit<
  React.ComponentProps<typeof Input>,
  "type"
> & {
  isFetching?: boolean;
  ariaLabel?: string;
};

export function SearchField({
  className,
  isFetching = false,
  disabled,
  placeholder,
  ariaLabel,
  ...props
}: SearchFieldProps) {
  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
      />
      <Input
        {...props}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn("pl-9", isFetching && "pr-9", className)}
      />
      {isFetching ? (
        <Refresh
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-text-muted motion-reduce:animate-none"
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/form/search-field.tsx
git commit -m "feat(ui): add SearchField with fetch indicator"
```

---

### Task 5: Structured skeletons + showcase demo

**Files:**
- Modify: `src/components/loading/structured-skeletons.tsx`
- Create: `src/app/(design)/components/_demos/async-loading-demo.tsx`
- Modify: `src/app/(design)/components/page.tsx`

- [ ] **Step 1: Swap skeleton import in structured-skeletons**

In `structured-skeletons.tsx`, replace:

```ts
import { Skeleton } from "@/components/ui/skeleton";
```

with:

```ts
import { Skeleton } from "@/components/primitives/skeleton";
```

Add `motion-reduce:animate-none` to skeleton classNames if missing.

- [ ] **Step 2: Create async-loading-demo**

Create `async-loading-demo.tsx` with buttons cycling `AsyncContentPanel` through `idle`, `hint`, `loading`, `empty`, `error`, `ready` states; include `SearchField` with a toggle for `isFetching`.

- [ ] **Step 3: Mount demo on components page**

Import and render `<AsyncLoadingDemo />` in `src/app/(design)/components/page.tsx` below existing demos.

- [ ] **Step 4: Commit**

```bash
git add src/components/loading/structured-skeletons.tsx src/app/(design)/components/_demos/async-loading-demo.tsx src/app/(design)/components/page.tsx
git commit -m "feat(ui): showcase async loading demo and migrate structured skeletons"
```

---

## PR 2 — StaffUserSearchCombobox

### Task 6: Refactor staff combobox to shared infra

**Files:**
- Modify: `src/components/form/staff-user-search-combobox.tsx`

- [ ] **Step 1: Replace imports**

- Remove direct `Input`, `AnimatePresence`, `motion`, motion variant imports used only for panel shell
- Add `SearchField`, `AsyncContentPanel`, `AsyncContentPanelRow`, `deriveAsyncPanelState`
- Replace `@/components/ui/skeleton` → `@/components/primitives/skeleton`
- Replace `@/components/ui/checkbox` → `@/components/primitives/checkbox`

- [ ] **Step 2: Map checkbox API**

Primitive checkbox uses Base UI `Checkbox.Root` with `checked` and `onCheckedChange`. Replace Radix-style usage:

```tsx
<Checkbox
  checked={isSelected}
  disabled={rowDisabled}
  onCheckedChange={() => onToggleUser(user)}
  className="mt-0.5"
/>
```

If type mismatch, cast or wrap — Base UI accepts boolean for `onCheckedChange`.

- [ ] **Step 3: Replace panel shell**

Replace the outer panel `div` + `AnimatePresence` block with:

```tsx
const panelState = deriveAsyncPanelState({
  enabled,
  queryLength: debouncedSearch.length,
  minLength: MIN_SEARCH_LENGTH,
  isError: staffSearch.isError,
  isFetching,
  resultCount: users.length,
});

<SearchField
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  disabled={inputDisabled}
  isFetching={enabled && isFetching}
  placeholder={enabled ? placeholder : disabledPlaceholder}
  ariaLabel={enabled ? placeholder : disabledPlaceholder}
/>

<AsyncContentPanel
  state={panelState}
  ariaBusy={isFetching}
  idle="Choose a role to start searching for staff."
  hint="Type at least 2 characters to search."
  error="Couldn't load results."
  empty="No staff found."
  loading={<StaffUserSearchRowsSkeleton rows={5} />}
  staggerResults
>
  <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
    {users.map((user) => (
      <AsyncContentPanelRow key={user.id}>
        {/* existing label + checkbox row */}
      </AsyncContentPanelRow>
    ))}
  </div>
</AsyncContentPanel>
```

Remove duplicate `useMemo` panel state if fully replaced by helper.

- [ ] **Step 4: Verify grep**

Run:

```bash
rg '@/components/ui/(skeleton|checkbox)' src/components/form/staff-user-search-combobox.tsx
```

Expected: no matches

- [ ] **Step 5: Run tests**

Run: `npm test -- src/lib/users/staff-user-search-display.test.ts src/components/loading/async-content-panel.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/components/form/staff-user-search-combobox.tsx
git commit -m "refactor(ui): staff user search combobox uses shared async loading infra"
```

---

## PR 3 — BackendSearchableCombobox

### Task 7: Rewrite backend searchable combobox

**Files:**
- Modify: `src/components/form/backend-searchable-combobox.tsx`

- [ ] **Step 1: Replace legacy stack**

Remove imports from `@/components/ui/command`, `@/components/ui/popover`, `@/components/ui/button`, `lucide-react`, `@/components/form/loader`.

Add:
- `@/components/primitives/popover` (Popover, PopoverTrigger, PopoverContent — verify export names in `primitives/popover.tsx`)
- `@/components/primitives/button`
- `@/components/form/search-field` (inside popover for search variant) or primitive Input in popover header
- `@/components/loading/async-content-panel`
- `@/components/primitives/skeleton`
- Iconoir: `Check`, `NavArrowDown`, `Search`

- [ ] **Step 2: Popover list interior**

Inside `PopoverContent`, use `AsyncContentPanel` with states:

| Condition | State |
| --- | --- |
| `isLoading && options.length === 0` | `loading` |
| `fetchError` | `error` |
| `!isLoading && options.length === 0` | `empty` |
| else | `ready` |

Loading slot: 3–5 single-line row skeletons (not `Loader` spinner).

List items: map `options` with Check icon for selected row; `onSelect` preserves deselect behavior.

- [ ] **Step 3: Token cleanup**

Replace `text-muted-foreground`, `bg-card`, `border-input`, `ring-offset-background` with `text-text-muted`, `bg-surface`, `border-border`, focus ring tokens.

- [ ] **Step 4: Remove external loading row**

Delete the duplicate loading/error paragraphs below the popover (lines ~237–247 in current file) — panel states cover this.

- [ ] **Step 5: Verify grep**

```bash
rg 'lucide-react|ui/command|ui/popover|ui/button' src/components/form/backend-searchable-combobox.tsx
```

Expected: no matches

- [ ] **Step 6: Manual smoke**

Open course-student-add-bar or checkin-histories page; open combobox, type search, confirm skeleton → results crossfade.

- [ ] **Step 7: Commit**

```bash
git add src/components/form/backend-searchable-combobox.tsx
git commit -m "refactor(ui): migrate BackendSearchableCombobox to primitives and async panel"
```

---

## PR 4 — EntityCombobox + stragglers

### Task 8: Build `EntityComboboxList` internal primitive combobox

**Files:**
- Create: `src/components/form/entity-combobox-list.tsx`
- Modify: `src/components/form/entity-combobox.tsx`

Extract list UI from legacy `ui/combo-box` into a focused component:

```tsx
"use client";
// Props: options, value, onChange, disabled, isLoading, isSaving, placeholder, allowDeselect, triggerClassName, contentClassName
// Uses: primitives/popover, primitives/button, AsyncContentPanel, Skeleton rows, Iconoir Check + NavArrowDown
// isSaving: close popover + button isLoading on trigger
```

Keep file under ~180 lines; entity-combobox.tsx owns query + create dialog.

- [ ] **Step 1: Implement EntityComboboxList** following `primitives/combobox.tsx` popup styling (border-border, bg-surface-elevated, popIn CSS classes on popup).

- [ ] **Step 2: Wire EntityCombobox**

Replace `import Combobox from "../ui/combo-box"` with `EntityComboboxList`.

Replace dialog stack:
- `@/components/ui/dialog` → `@/components/primitives/dialog`
- `@/components/ui/input` → `@/components/primitives/input`
- `@/components/ui/label` → `@/components/primitives/field` (`Field.Label`)
- `@/components/ui/button` → `@/components/primitives/button`
- Lucide `Plus` → Iconoir `Plus`

**Keep** `@/components/ui/use-toast` for now — shadcn toast API differs from Base UI `useToastManager`; swapping toast is out of scope.

Replace `text-muted-foreground` labels with `text-text-secondary` or `text-text-muted`.

Preserve: all exports (`useGetAllEntitiesQuery`, `mergeEntityListQueryParams`, `getGetAllEntitiesQueryKey`, `EntityComboboxCreateNewConfig`), default-value effect, `customComponent`, create mutation flow.

- [ ] **Step 3: Verify grep on entity-combobox**

```bash
rg 'ui/combo-box|ui/dialog|ui/input|ui/label|ui/button|lucide-react' src/components/form/entity-combobox.tsx src/components/form/entity-combobox-list.tsx
```

Expected: no matches (except `ui/use-toast` if kept)

- [ ] **Step 4: Commit**

```bash
git add src/components/form/entity-combobox-list.tsx src/components/form/entity-combobox.tsx
git commit -m "refactor(ui): migrate EntityCombobox to primitives"
```

---

### Task 9: Direct `ui/combo-box` stragglers

**Files:** (~6 files — verify with `rg 'ui/combo-box' src`)

- [ ] **Step 1: List stragglers**

Run: `rg 'from \"@/components/ui/combo-box\"|from \"../ui/combo-box\"' src -l`

- [ ] **Step 2: Migrate each**

For each file: switch to `EntityCombobox` where it wraps entity search, or `EntityComboboxList` / `BackendSearchableCombobox` for static options. Do not add new `ui/combo-box` imports.

Known files: `student-payments-report.tsx`, `course-header.tsx`, `course-zoom-meeting-edit-section.tsx`, `shortcuts/student-data/page.tsx`, `course-subject-field.tsx`, `screenshots/create/page.tsx`.

- [ ] **Step 3: Final grep**

```bash
rg '@/components/ui/combo-box' src
```

Expected: 0 hits (or only `ui/combo-box.tsx` itself)

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(ui): remove remaining ui/combo-box direct imports"
```

---

## Verification checklist (all PRs)

```bash
cd schedjuice-reimagined-fe
npm test -- src/components/loading/async-content-panel.test.ts src/lib/users/staff-user-search-display.test.ts
rg '@/components/ui/(skeleton|checkbox)' src/components/form/
rg 'lucide-react' src/components/form/backend-searchable-combobox.tsx src/components/form/entity-combobox.tsx src/components/form/entity-combobox-list.tsx
rg 'AnimatePresence' src/components/form/staff-user-search-combobox.tsx src/components/form/backend-searchable-combobox.tsx
```

Manual:
- RBAC → Roles → Assign tab (staff search full flow)
- One finance page with EntityCombobox filter
- course-student-add-bar BackendSearchableCombobox

---

## Spec coverage self-review

| Spec § | Task |
| --- | --- |
| §6.1 skeleton | Task 1, 5 |
| §6.2 AsyncContentPanel | Task 2, 3 |
| §6.3 SearchField | Task 4 |
| §6.4 showcase | Task 5 |
| §7.1 StaffUserSearchCombobox | Task 6 |
| §7.2 BackendSearchableCombobox | Task 7 |
| §7.3 EntityCombobox | Task 8 |
| §7.4 stragglers | Task 9 |
| §8 motion recipes | Tasks 3, 6, 7, 8 |
| §9 rollout 4 PRs | PR sections 1–4 |
| §10 testing | Tasks 2, 6, verification |

No gaps. Toast migration explicitly deferred per shadcn/Base UI API mismatch.
