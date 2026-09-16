# Academic Hub "My classes only" preference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admin/manager/superadmin users an "show all courses" first-load default on Academic Hub, persist the toggle preference in device-local `localStorage` after manual changes, and keep URL params shareable.

**Architecture:** Add a small preference module (`get`/`set`/`resolveMyDefault`) with unit tests. Replace the teacher-only bootstrap effect in `academic-hub-page.tsx` with URL → localStorage → role-default resolution. Pass a wrapped `onSetMy` handler into `AcademicHubFilterBar` so manual toggles persist without touching `useHubFilters`.

**Tech Stack:** Next.js 15 App Router, React 19, nuqs, Vitest, TypeScript, browser `localStorage`.

**Spec:** [2026-06-15-academic-hub-my-classes-preference-design.md](../specs/2026-06-15-academic-hub-my-classes-preference-design.md)

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/academic-hub-my-preference.ts` | Create | localStorage get/set + `resolveMyDefault` role helper |
| `src/lib/academic-hub-my-preference.test.ts` | Create | Unit tests for preference module |
| `src/components/academic-hub/academic-hub-page.tsx` | Modify | Bootstrap effect + `handleSetMy` wrapper |
| `src/components/academic-hub/filter-bar/filter-bar.tsx` | Modify | Accept optional `onSetMy` prop for toggle persistence |

Unchanged: `use-hub-filters.ts`, `my-only-toggle.tsx`, `filter-params.ts`.

---

### Task 1: Preference module — tests first

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/academic-hub-my-preference.test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/academic-hub-my-preference.ts`

- [ ] **Step 1: Write the failing test file**

Create `schedjuice-reimagined-fe/src/lib/academic-hub-my-preference.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACADEMIC_HUB_MY_CLASSES_ONLY_KEY_PREFIX,
  getAcademicHubMyClassesOnly,
  resolveMyDefault,
  setAcademicHubMyClassesOnly,
} from "./academic-hub-my-preference";

function keyFor(userId: number) {
  return `${ACADEMIC_HUB_MY_CLASSES_ONLY_KEY_PREFIX}${userId}`;
}

describe("resolveMyDefault", () => {
  it("returns false for admin/manager/superadmin even when also teacher", () => {
    expect(resolveMyDefault(true, true)).toBe(false);
  });

  it("returns false for admin/manager/superadmin without teacher", () => {
    expect(resolveMyDefault(true, false)).toBe(false);
  });

  it("returns true for teacher-only users", () => {
    expect(resolveMyDefault(false, true)).toBe(true);
  });

  it("returns false when user has neither role", () => {
    expect(resolveMyDefault(false, false)).toBe(false);
  });
});

describe("academic hub my-classes-only localStorage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("get returns null when key is absent", () => {
    expect(getAcademicHubMyClassesOnly(42)).toBeNull();
  });

  it("set/get round-trips true and false", () => {
    setAcademicHubMyClassesOnly(7, true);
    expect(getAcademicHubMyClassesOnly(7)).toBe(true);
    expect(store.get(keyFor(7))).toBe("true");

    setAcademicHubMyClassesOnly(7, false);
    expect(getAcademicHubMyClassesOnly(7)).toBe(false);
    expect(store.get(keyFor(7))).toBe("false");
  });

  it("scopes keys by user id", () => {
    setAcademicHubMyClassesOnly(1, true);
    setAcademicHubMyClassesOnly(2, false);
    expect(getAcademicHubMyClassesOnly(1)).toBe(true);
    expect(getAcademicHubMyClassesOnly(2)).toBe(false);
  });

  it("returns null for invalid stored values", () => {
    store.set(keyFor(99), "maybe");
    expect(getAcademicHubMyClassesOnly(99)).toBeNull();
  });

  it("returns null when window is undefined (SSR guard)", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("window", undefined);
    expect(getAcademicHubMyClassesOnly(1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root:

```bash
cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/academic-hub-my-preference.test.ts
```

Expected: FAIL — cannot resolve `./academic-hub-my-preference`

- [ ] **Step 3: Implement the preference module**

Create `schedjuice-reimagined-fe/src/lib/academic-hub-my-preference.ts`:

```ts
export const ACADEMIC_HUB_MY_CLASSES_ONLY_KEY_PREFIX =
  "academicHub:myClassesOnly:";

function storageKey(userId: number): string {
  return `${ACADEMIC_HUB_MY_CLASSES_ONLY_KEY_PREFIX}${userId}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function resolveMyDefault(
  isAdminOrManager: boolean,
  isTeacher: boolean,
): boolean {
  if (isAdminOrManager) return false;
  if (isTeacher) return true;
  return false;
}

export function getAcademicHubMyClassesOnly(userId: number): boolean | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function setAcademicHubMyClassesOnly(
  userId: number,
  value: boolean,
): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(storageKey(userId), value ? "true" : "false");
  } catch {
    // Quota / private mode — URL state still works for the session.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/academic-hub-my-preference.test.ts
```

Expected: PASS (5 tests in localStorage block + 4 in resolveMyDefault)

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-fe/src/lib/academic-hub-my-preference.ts \
        schedjuice-reimagined-fe/src/lib/academic-hub-my-preference.test.ts
git commit -m "feat(academic-hub): add my-classes-only localStorage preference module"
```

---

### Task 2: Wire filter bar to accept persisted toggle handler

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/filter-bar.tsx`

- [ ] **Step 1: Add optional `onSetMy` prop**

In `filter-bar.tsx`, extend `Props`:

```tsx
interface Props {
  programs: HubProgram[];
  statusCounts?: HubStatusAggregate;
  isStatusCountsLoading?: boolean;
  onSetMy?: (value: boolean) => void;
}
```

Destructure in the component signature:

```tsx
export function AcademicHubFilterBar({
  programs,
  statusCounts,
  isStatusCountsLoading = false,
  onSetMy,
}: Props) {
```

After `const filters = useHubFilters();`, derive the handler:

```tsx
  const handleSetMy = onSetMy ?? filters.setMy;
```

Replace the toggle wiring (around line 151–155):

```tsx
            <MyClassesOnlyToggle
              visible={Boolean(isTeacher)}
              value={state.my}
              onChange={handleSetMy}
            />
```

- [ ] **Step 2: Run lint on the touched file**

Run:

```bash
cd schedjuice-reimagined-fe && npm run lint -- --file src/components/academic-hub/filter-bar/filter-bar.tsx
```

Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/filter-bar.tsx
git commit -m "feat(academic-hub): allow filter bar my-toggle handler override"
```

---

### Task 3: Bootstrap effect and persistence in Academic Hub page

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/academic-hub/academic-hub-page.tsx`

- [ ] **Step 1: Add imports and replace bootstrap effect**

Add imports at top:

```tsx
import { useCallback } from "react";
import {
  getAcademicHubMyClassesOnly,
  resolveMyDefault,
  setAcademicHubMyClassesOnly,
} from "@/lib/academic-hub-my-preference";
```

Change `useUser()` destructure to include `isAdminOrManager`:

```tsx
  const { user, isTeacher, isAdminOrManager, isLoading: isUserLoading } = useUser();
```

Replace the existing teacher-default `useEffect` (lines 24–33) with:

```tsx
  // URL explicit `my` wins. Otherwise localStorage, then role default.
  useEffect(() => {
    if (isUserLoading || !user?.id) return;
    if (isMyExplicit) return;

    const stored = getAcademicHubMyClassesOnly(user.id);
    if (stored !== null) {
      setMy(stored);
      return;
    }

    setMy(resolveMyDefault(isAdminOrManager, isTeacher));
  }, [
    isUserLoading,
    user?.id,
    isMyExplicit,
    isAdminOrManager,
    isTeacher,
    setMy,
  ]);
```

- [ ] **Step 2: Add `handleSetMy` and pass to filter bar**

After the bootstrap effect, add:

```tsx
  const handleSetMy = useCallback(
    (value: boolean) => {
      setMy(value);
      if (user?.id) {
        setAcademicHubMyClassesOnly(user.id, value);
      }
    },
    [setMy, user?.id],
  );
```

Update the filter bar JSX:

```tsx
      <AcademicHubFilterBar
        programs={programs}
        statusCounts={list.data?.statusCounts}
        isStatusCountsLoading={list.isLoading && !statusCounts}
        onSetMy={handleSetMy}
      />
```

Update the React import at top from:

```tsx
import { Suspense, useEffect, useMemo } from "react";
```

to:

```tsx
import { Suspense, useCallback, useEffect, useMemo } from "react";
```

(remove duplicate `useCallback` import if added twice)

- [ ] **Step 3: Run unit tests**

Run:

```bash
cd schedjuice-reimagined-fe && npm run test:unit
```

Expected: all tests PASS (including new preference tests)

- [ ] **Step 4: Run lint on touched files**

Run:

```bash
cd schedjuice-reimagined-fe && npm run lint -- --file src/components/academic-hub/academic-hub-page.tsx
```

Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/academic-hub/academic-hub-page.tsx
git commit -m "feat(academic-hub): role-aware my-classes default with localStorage sync"
```

---

### Task 4: Manual verification (acceptance checks)

**Files:** none

- [ ] **Step 1: Admin+teacher first visit**

1. Log in as a user with admin/manager/superadmin role (with or without teacher).
2. Clear localStorage key `academicHub:myClassesOnly:<userId>` in DevTools.
3. Open `/courses` with no `?my=` param.
4. Confirm toggle is OFF and all visible courses load.

- [ ] **Step 2: Preference persists**

1. Toggle ON.
2. Confirm localStorage key is `"true"`.
3. Navigate away and return to `/courses` (no `?my=`).
4. Confirm toggle stays ON.

- [ ] **Step 3: URL overrides localStorage**

1. With localStorage `"false"`, open `/courses?my=1`.
2. Confirm filtered view; localStorage still `"false"`.

- [ ] **Step 4: Teacher-only unchanged**

1. Log in as teacher-only user; clear localStorage key.
2. Open `/courses` with no `?my=`.
3. Confirm toggle ON by default.

- [ ] **Step 5: Update spec status**

In `docs/superpowers/specs/2026-06-15-academic-hub-my-classes-preference-design.md`, change:

```markdown
> **Status:** Draft (brainstorming 2026-06-15)
```

to:

```markdown
> **Status:** Approved (implemented 2026-06-15)
```

- [ ] **Step 6: Commit spec status**

```bash
git add schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-15-academic-hub-my-classes-preference-design.md
git commit -m "docs(academic-hub): mark my-classes preference spec approved"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Admin/manager/superadmin default OFF | Task 1 (`resolveMyDefault`), Task 3 (bootstrap) |
| Teacher-only default ON | Task 1, Task 3 |
| URL → localStorage → role default precedence | Task 3 bootstrap effect |
| localStorage write on manual toggle only | Task 3 `handleSetMy` |
| User-scoped storage key | Task 1 module |
| URL shareable, no localStorage overwrite | Task 3 (`isMyExplicit` guard) |
| Toggle visibility unchanged | No code change needed |
| Unit tests for module + role helper | Task 1 |

## Risks (no extra tasks)

- Bootstrap flash: accepted per spec.
- localStorage write failure: swallowed in `setAcademicHubMyClassesOnly`; session URL state still works.
