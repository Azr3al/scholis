# Record Mode Global Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make global navigation equally discoverable in record mode via panel-header breadcrumb (formalized) and icon-rail direct navigation.

**Architecture:** Extend the shell's context-rail slot with `{ label, href }` parent metadata; add `resolveSectionNavHref()` for icon destinations; change `SidebarNav` collapsed icons from expand-buttons to `Link` when `recordMode`. Breadcrumb already exists on the user record — wire parent metadata through `useContextRail`.

**Tech Stack:** Next.js App Router, Base UI Tooltip, Iconoir, existing `nav-routes` + `nav-visibility`.

**Spec:** [`docs/superpowers/specs/2026-06-22-record-mode-global-nav-design.md`](../specs/2026-06-22-record-mode-global-nav-design.md)

---

## File map

| File | Responsibility |
| --- | --- |
| `src/config/nav-routes.tsx` | Add `resolveSectionNavHref()` |
| `src/components/shell/sidebar-context.tsx` | `ContextRailConfig` with `parent` |
| `src/components/shell/use-context-rail.ts` | Accept `parent` arg |
| `src/components/shell/app-shell.tsx` | Render `contextRail.rail` instead of raw node |
| `src/components/shell/sidebar-nav.tsx` | Record-mode icon links |
| `src/app/(internal)/users/[id]/page.tsx` | Pass parent to `useContextRail` |
| `src/app/(design)/components/mockups/user-record/page.tsx` | Mockup parity (optional) |

---

### Task 1: Section default href resolver

**Files:**
- Modify: `src/config/nav-routes.tsx`

- [ ] **Step 1: Add imports and helper**

At the bottom of `nav-routes.tsx`, add (import `visibleChildren` from `@/components/nav/nav-visibility` and types):

```typescript
import { visibleChildren, type NavPermissionChecker } from "@/components/nav/nav-visibility";

/**
 * Default navigation target for a top-level nav section icon.
 * Returns the first permission-visible child href, resolved for tenant.
 */
export function resolveSectionNavHref(
  section: navLinkType,
  checker: NavPermissionChecker,
  tenant: organizationType | null | undefined,
  user?: accountType,
): string | null {
  const children = visibleChildren(section, checker, tenant, user);
  const first = children.find((c) => c.href);
  if (!first?.href) return null;
  return resolveNavHref(first.href, tenant?.id);
}
```

Note: move the import to the top of the file with other imports (don't leave mid-file).

- [ ] **Step 2: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors in `nav-routes.tsx`

---

### Task 2: Context rail parent metadata

**Files:**
- Modify: `src/components/shell/sidebar-context.tsx`
- Modify: `src/components/shell/use-context-rail.ts`
- Modify: `src/components/shell/app-shell.tsx`

- [ ] **Step 1: Extend sidebar context types**

In `sidebar-context.tsx`, replace `contextRail: ReactNode | null` with:

```typescript
export type ContextRailParent = {
  label: string;
  href: string;
};

export type ContextRailConfig = {
  rail: ReactNode;
  parent: ContextRailParent;
};
```

Update `SidebarState`:
```typescript
contextRail: ContextRailConfig | null;
setContextRail: (config: ContextRailConfig | null) => void;
```

- [ ] **Step 2: Update useContextRail**

```typescript
import type { ContextRailConfig, ContextRailParent } from "./sidebar-context";

export function useContextRail(rail: ReactNode, parent: ContextRailParent) {
  const { setContextRail } = useSidebar();
  useEffect(() => {
    const config: ContextRailConfig = { rail, parent };
    setContextRail(config);
    return () => setContextRail(null);
  }, [rail, parent, setContextRail]);
}
```

- [ ] **Step 3: Update app-shell render**

In `app-shell.tsx`, change:
```typescript
{!effectiveFullscreen && contextRail ? (
  <div className="hidden h-full md:flex">{contextRail}</div>
) : null}
```
to:
```typescript
{!effectiveFullscreen && contextRail ? (
  <div className="hidden h-full md:flex">{contextRail.rail}</div>
) : null}
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: errors only in call sites not yet updated (users page) — fixed in Task 4.

---

### Task 3: Icon rail navigation in record mode

**Files:**
- Modify: `src/components/shell/sidebar-nav.tsx`

- [ ] **Step 1: Add imports**

```typescript
import Link from "next/link";
import {
  navLinks,
  resolveNavHref,
  resolveSectionNavHref,
  navSectionContainsActivePath,
} from "@/config/nav-routes";
```

- [ ] **Step 2: Read contextRail parent in SidebarNav**

```typescript
const { open, isMobile, setOpen, recordMode, contextRail } = useSidebar();
```

- [ ] **Step 3: Replace collapsed icon button with conditional Link**

Inside the `if (!expanded)` branch, before the existing `return`, compute href:

```typescript
const sectionHref = (() => {
  if (!recordMode || !contextRail) return null;
  const active = navSectionContainsActivePath(route, pathname, tenant?.id);
  if (active) return contextRail.parent.href;
  return resolveSectionNavHref(route, { canAny }, tenant, user);
})();
```

When `sectionHref` is non-null, render a `Link` instead of the expand `button`:

```typescript
if (sectionHref) {
  return (
    <Tooltip.Root key={route.title}>
      <Tooltip.Trigger
        render={
          <Link
            href={sectionHref}
            aria-label={
              navSectionContainsActivePath(route, pathname, tenant?.id)
                ? `${contextRail!.parent.label} list`
                : route.title
            }
            onClick={() => playClick()}
            className={cn(
              "flex items-center justify-center rounded-md p-2.5 transition-colors duration-[var(--duration-fast)]",
              active
                ? "bg-surface-active text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          />
        }
      >
        <Icon width={18} height={18} aria-hidden />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="right">
          <Tooltip.Popup>
            {navSectionContainsActivePath(route, pathname, tenant?.id)
              ? contextRail!.parent.label
              : route.title}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
```

Keep the existing expand-button branch for `!recordMode`.

- [ ] **Step 4: Manual verification**

Run dev server, open `/users/[id]` on desktop width:
- Click Courses icon → lands on `/courses` (or first visible child)
- Click People icon → lands on `/users`
- Navigate to `/home`, confirm icon click still expands rail (not record mode)

---

### Task 4: Wire user record context rail parent

**Files:**
- Modify: `src/app/(internal)/users/[id]/page.tsx`

- [ ] **Step 1: Pass parent to useContextRail**

Find the `useContextRail(...)` call and update:

```typescript
useContextRail(
  <RecordSectionRail
    subject={user}
    section={section}
    onSelect={setSection}
  />,
  { label: "Users", href: "/users" },
);
```

Ensure `user` null case: the hook runs after user loads (rail registers when subject available — match existing pattern).

- [ ] **Step 2: Confirm breadcrumb unchanged**

Breadcrumb in `pageHeaderConfig` already links `Users` → `/users`. No change needed unless extracting `RecordBreadcrumb` primitive (YAGNI — skip for now).

- [ ] **Step 3: TypeScript clean**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: PASS (no errors)

---

### Task 5: Navigation guard stub (optional, no-op until edit state wired)

**Files:**
- Create: `src/components/shell/use-navigation-guard.ts`

- [ ] **Step 1: Create no-op hook**

```typescript
"use client";
import { useCallback } from "react";

/** Returns whether navigation to `href` should proceed. Extend when record edit dirty state exists. */
export function useNavigationGuard() {
  const confirmNavigation = useCallback((_href: string): boolean => {
    return true;
  }, []);
  return { confirmNavigation };
}
```

- [ ] **Step 2: Defer wiring**

Do not integrate into `SidebarNav` yet — spec §5.3 allows shipping icon nav first. Add a TODO comment referencing the spec section. Full guard lands with inline editing stages.

---

### Task 6: Mockup parity (optional)

**Files:**
- Modify: `src/app/(design)/components/mockups/user-record/page.tsx`

- [ ] **Step 1: Make global nav icons clickable in record mode**

In `LeftRail`, when `mode === "record"`, wrap icons in buttons that set `mode` to `"global"` or navigate conceptually (mockup-only — can toggle mode to simulate leaving record).

Low priority — skip if time-constrained.

---

## Test plan

- [ ] Desktop `/users/[id]`: breadcrumb **Users** → `/users`
- [ ] Desktop `/users/[id]`: inactive icon (Courses) → correct section default
- [ ] Desktop `/users/[id]`: active icon (People) → `/users`
- [ ] Desktop `/users/[id]`: section rail `← Users` → `/users`
- [ ] Desktop `/home`: collapsed icon click expands rail (not record mode)
- [ ] Mobile `/users/[id]`: breadcrumb works; hamburger opens full nav
- [ ] Reduced motion: no new animations introduced
- [ ] Keyboard: icon links focusable with visible ring; Enter navigates

---

## Plan self-review (spec coverage)

| Spec § | Task |
| --- | --- |
| §4.2 Context rail metadata | Task 2 |
| §4.3 Section default href | Task 1 |
| §4.4 Icon rail matrix | Task 3 |
| §4.5 Breadcrumb contract | Already done; Task 4 wires parent |
| §4.6 Section rail back link | No change (kept) |
| §5 Navigation guard | Task 5 stub; full wiring deferred |
| §6 Mobile | No code change; verify in test plan |
| §10 Acceptance criteria | Test plan |

No placeholders. All tasks have concrete code.
