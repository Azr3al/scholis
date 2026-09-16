# App Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** This repo follows `no-git-commits` — do **not** run the commit steps until the user has authorized commits. Until then, treat each "Commit" step as "stage only" (`git add`) and pause. No feature branches; work on the current branch.

**Goal:** Add an Applications control under the school logo that opens a Spotlight-style overlay with a Launchpad bento of Finance and Design tiles, without changing the existing sidebar, record-mode inner rail, or Find a page.

**Architecture:** A pure config module maps six nav `href`s to launcher groups and resolves visibility through existing `isChildVisible` / `resolveNavItemHref`. A provider holds open state. A trigger sits under `TenantHeader` in the desktop rail and mobile sheet. A Base UI `Dialog` renders search + bento. Find a page stays a separate overlay; opening one closes the other.

**Tech Stack:** Next.js App Router, React 19, Base UI `Dialog` + `Input` (`src/components/primitives/*`), Iconoir (`ViewGrid`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-16-app-launcher-design.md`

## Global Constraints

- Additive only: do not remove, reorder, or hide any `navLinks` item.
- Tile visibility = the matching `navLinks` child via `isChildVisible` (permissions + `canShow` + tenant). Do not duplicate permission lists in launcher config.
- Design tiles are Certificates and Award titles only. No Form designer, AI Detector, pins, recents, Suggestions, Show more, or `Cmd+Space`.
- Search filters launcher tiles by title substring only. Do not search sidebar pages or shortcut tools.
- `⌘K` / `Ctrl+K` remains Find a page. No new global keyboard shortcut.
- Copy is English, Burmese-safe: no `text-transform: uppercase`, no exclamation marks.
- Visual: cream `bg-surface-elevated`, Iconoir, not macOS glass. Overlay is Base UI `Dialog` at `max-w-2xl`.
- Hide the Applications trigger when `buildVisibleLauncherGroups` returns `[]`.
- One overlay at a time: opening Applications closes Find a page; opening Find a page closes Applications.
- High-value tests only (permission / `canShow` / empty / navigate / filter). No “renders Applications” smoke.
- Always `vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn() } }))` before importing modules that pull `nav-routes` / `usePermissions`.
- Run FE tests with `npm run test:unit -- --run <path>` from `schedjuice-reimagined-fe`.

---

## File Structure

**Create:**

- `src/config/app-launcher.ts` — tile defs, `buildVisibleLauncherGroups`, `filterLauncherGroups`
- `src/config/__tests__/app-launcher.test.ts` — visibility + filter + href contract
- `src/components/app-launcher/use-app-launcher.ts` — context + hook
- `src/components/app-launcher/app-launcher-provider.tsx` — open state, groups, Find a page exclusion
- `src/components/app-launcher/app-launcher-trigger.tsx` — rail / mobile button
- `src/components/app-launcher/app-launcher-dialog.tsx` — dialog, search, bento
- `src/components/app-launcher/app-launcher-trigger.test.tsx` — trigger hidden when empty; opens overlay
- `src/components/app-launcher/app-launcher-dialog.test.tsx` — navigate, filter, empty copy

**Modify:**

- `src/components/shell/sidebar-rail.tsx` — trigger under `TenantHeader`
- `src/components/shell/sidebar-mobile.tsx` — same; close sheet then open overlay
- `src/components/shell/app-shell.tsx` — wrap with `AppLauncherProvider` inside `FindPageProvider`
- `src/components/primitives/empty/empty-copy-presets.ts` — `noAppsMatch` preset

**Do not modify:** `src/config/nav-routes.tsx`, Find a page dialog chrome, record-mode inner rail.

---

### Task 1: Launcher config and visibility

**Files:**
- Create: `src/config/app-launcher.ts`
- Test: `src/config/__tests__/app-launcher.test.ts`

**Interfaces:**
- Consumes: `navLinks`, `resolveNavItemHref` from `@/config/nav-routes`; `isChildVisible`, `NavPermissionChecker` from `@/components/nav/nav-visibility`
- Produces:
  - `AppLauncherGroupId = "finance" | "design"`
  - `AppLauncherTileDef = { group: AppLauncherGroupId; href: string }`
  - `APP_LAUNCHER_TILES: AppLauncherTileDef[]`
  - `APP_LAUNCHER_GROUP_ORDER: AppLauncherGroupId[]` = `["finance", "design"]`
  - `APP_LAUNCHER_GROUP_LABEL: Record<AppLauncherGroupId, string>` = `{ finance: "Finance", design: "Design" }`
  - `AppLauncherTile = { group: AppLauncherGroupId; href: string; title: string; icon: navLinkType["icon"] }`
  - `AppLauncherGroup = { id: AppLauncherGroupId; label: string; tiles: AppLauncherTile[] }`
  - `buildVisibleLauncherGroups(args: { checker: NavPermissionChecker; tenant: organizationType | null | undefined; user: accountType | undefined }): AppLauncherGroup[]`
  - `filterLauncherGroups(groups: AppLauncherGroup[], query: string): AppLauncherGroup[]`

- [ ] **Step 1: Write the failing tests**

Create `src/config/__tests__/app-launcher.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn() } }));

import {
  APP_LAUNCHER_TILES,
  buildVisibleLauncherGroups,
  filterLauncherGroups,
} from "../app-launcher";
import { navLinks } from "@/config/nav-routes";
import { makePermissionChecker } from "@/hooks/usePermissions";
import { TransactionScreenshotStrategy } from "@/types/organization";
import type { organizationType } from "@/types/organization";
import { accountType, role } from "@/types/user";

const tenant = { id: 1 } as unknown as organizationType;

function hrefsInNav(): Set<string> {
  const hrefs = new Set<string>();
  for (const section of navLinks) {
    for (const child of section.children ?? []) {
      if (child.href) hrefs.add(child.href);
    }
  }
  return hrefs;
}

describe("APP_LAUNCHER_TILES", () => {
  it("every tile href matches a navLinks child", () => {
    const hrefs = hrefsInNav();
    for (const tile of APP_LAUNCHER_TILES) {
      expect(hrefs.has(tile.href), tile.href).toBe(true);
    }
  });

  it("does not include form designer", () => {
    expect(APP_LAUNCHER_TILES.map((t) => t.href)).not.toContain(
      "/form-designer",
    );
  });
});

describe("buildVisibleLauncherGroups", () => {
  it("omits Unpaid Students when screenshot strategy blocks canShow", () => {
    const groups = buildVisibleLauncherGroups({
      checker: makePermissionChecker(["payment.view_unpaid", "payment.view_all"]),
      tenant: {
        id: 1,
        transaction_screenshot_strategy: "none",
      } as unknown as organizationType,
      user: { roles: [role.admin] } as accountType,
    });
    const finance = groups.find((g) => g.id === "finance");
    expect(finance?.tiles.map((t) => t.href)).not.toContain(
      "/finances/unpaid-students",
    );
  });

  it("includes Unpaid Students when screenshot strategy is admin_upload", () => {
    const groups = buildVisibleLauncherGroups({
      checker: makePermissionChecker(["payment.view_unpaid", "payment.view_all"]),
      tenant: {
        id: 1,
        transaction_screenshot_strategy:
          TransactionScreenshotStrategy.admin_upload,
      } as unknown as organizationType,
      user: { roles: [role.admin] } as accountType,
    });
    const finance = groups.find((g) => g.id === "finance");
    expect(finance?.tiles.map((t) => t.href)).toContain(
      "/finances/unpaid-students",
    );
  });

  it("omits Certificates, Award titles, and Staff Payments without their permissions", () => {
    const groups = buildVisibleLauncherGroups({
      checker: makePermissionChecker(["course.view"]),
      tenant,
      user: { roles: [role.teacher] } as accountType,
    });
    const hrefs = groups.flatMap((g) => g.tiles.map((t) => t.href));
    expect(hrefs).not.toContain("/certificates");
    expect(hrefs).not.toContain("/award-titles");
    expect(hrefs).not.toContain("/finances/staff-payments");
  });

  it("includes Overview when any Finance Overview permission is held", () => {
    const groups = buildVisibleLauncherGroups({
      checker: makePermissionChecker(["analytics.view"]),
      tenant,
      user: { roles: [role.admin] } as accountType,
    });
    const finance = groups.find((g) => g.id === "finance");
    expect(finance?.tiles.map((t) => t.href)).toContain("/finances");
  });

  it("omits an empty Design group when only Finance tiles pass", () => {
    const groups = buildVisibleLauncherGroups({
      checker: makePermissionChecker(["payment.view_all"]),
      tenant,
      user: { roles: [role.finance] } as accountType,
    });
    expect(groups.map((g) => g.id)).toEqual(["finance"]);
    expect(groups.find((g) => g.id === "design")).toBeUndefined();
  });

  it("returns an empty array when nothing is visible", () => {
    const groups = buildVisibleLauncherGroups({
      checker: makePermissionChecker(["course.view"]),
      tenant,
      user: { roles: [role.teacher] } as accountType,
    });
    expect(groups).toEqual([]);
  });
});

describe("filterLauncherGroups", () => {
  const sample = buildVisibleLauncherGroups({
    checker: makePermissionChecker([
      "payment.view_all",
      "certificate.view",
      "award_title.manage",
    ]),
    tenant: {
      id: 1,
      transaction_screenshot_strategy:
        TransactionScreenshotStrategy.admin_upload,
    } as unknown as organizationType,
    user: { roles: [role.admin] } as accountType,
  });

  it("keeps Award titles and hides Finance when querying award", () => {
    const filtered = filterLauncherGroups(sample, "award");
    expect(filtered.map((g) => g.id)).toEqual(["design"]);
    expect(filtered[0]?.tiles.map((t) => t.title)).toEqual(["Award titles"]);
  });

  it("returns no groups when nothing matches", () => {
    expect(filterLauncherGroups(sample, "zzzz")).toEqual([]);
  });

  it("is case-insensitive and treats empty query as no filter", () => {
    const upper = filterLauncherGroups(sample, "CERTIFICATE");
    expect(upper.flatMap((g) => g.tiles.map((t) => t.href))).toEqual([
      "/certificates",
    ]);
    expect(filterLauncherGroups(sample, "   ")).toEqual(sample);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --run src/config/__tests__/app-launcher.test.ts`

Expected: FAIL — `Cannot find module '../app-launcher'` (or equivalent).

- [ ] **Step 3: Write the config module**

Create `src/config/app-launcher.ts`:

```ts
import {
  isChildVisible,
  type NavPermissionChecker,
} from "@/components/nav/nav-visibility";
import {
  navLinks,
  resolveNavItemHref,
  type navLinkType,
} from "@/config/nav-routes";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type AppLauncherGroupId = "finance" | "design";

export type AppLauncherTileDef = {
  group: AppLauncherGroupId;
  href: string;
};

export const APP_LAUNCHER_GROUP_ORDER: AppLauncherGroupId[] = [
  "finance",
  "design",
];

export const APP_LAUNCHER_GROUP_LABEL: Record<AppLauncherGroupId, string> = {
  finance: "Finance",
  design: "Design",
};

export const APP_LAUNCHER_TILES: AppLauncherTileDef[] = [
  { group: "finance", href: "/finances" },
  { group: "finance", href: "/finances/student-payments" },
  { group: "finance", href: "/finances/unpaid-students" },
  { group: "finance", href: "/finances/staff-payments" },
  { group: "design", href: "/certificates" },
  { group: "design", href: "/award-titles" },
];

export type AppLauncherTile = {
  group: AppLauncherGroupId;
  href: string;
  title: string;
  icon: navLinkType["icon"];
};

export type AppLauncherGroup = {
  id: AppLauncherGroupId;
  label: string;
  tiles: AppLauncherTile[];
};

function findNavChildByHref(href: string): navLinkType | undefined {
  for (const section of navLinks) {
    const child = section.children?.find((c) => c.href === href);
    if (child) return child;
  }
  return undefined;
}

export function buildVisibleLauncherGroups(args: {
  checker: NavPermissionChecker;
  tenant: organizationType | null | undefined;
  user: accountType | undefined;
}): AppLauncherGroup[] {
  const byGroup = new Map<AppLauncherGroupId, AppLauncherTile[]>();

  for (const def of APP_LAUNCHER_TILES) {
    const child = findNavChildByHref(def.href);
    if (!child) continue;
    if (!isChildVisible(child, args.checker, args.tenant, args.user)) continue;
    const href = resolveNavItemHref(child, args.tenant);
    if (href === "#") continue;
    const tiles = byGroup.get(def.group) ?? [];
    tiles.push({
      group: def.group,
      href,
      title: child.title,
      icon: child.icon,
    });
    byGroup.set(def.group, tiles);
  }

  return APP_LAUNCHER_GROUP_ORDER.flatMap((id) => {
    const tiles = byGroup.get(id);
    if (!tiles?.length) return [];
    return [
      {
        id,
        label: APP_LAUNCHER_GROUP_LABEL[id],
        tiles,
      },
    ];
  });
}

export function filterLauncherGroups(
  groups: AppLauncherGroup[],
  query: string,
): AppLauncherGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.flatMap((group) => {
    const tiles = group.tiles.filter((t) =>
      t.title.toLowerCase().includes(q),
    );
    if (!tiles.length) return [];
    return [{ ...group, tiles }];
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --run src/config/__tests__/app-launcher.test.ts`

Expected: PASS. If Unpaid Students still appears for `"none"` strategy, the nav `canShow` already excludes it — keep the test; do not change `nav-routes`. If Overview does not appear for `analytics.view` alone, check Finance Overview’s `requiredPermissions` any-of list and keep the test aligned with `isChildVisible` (that list currently includes `analytics.view`).

- [ ] **Step 5: Stage**

```bash
git add src/config/app-launcher.ts src/config/__tests__/app-launcher.test.ts
```

Do not commit unless the user has authorized commits.

---

### Task 2: Provider, trigger, and rail placement

**Files:**
- Create: `src/components/app-launcher/use-app-launcher.ts`
- Create: `src/components/app-launcher/app-launcher-provider.tsx`
- Create: `src/components/app-launcher/app-launcher-trigger.tsx`
- Create: `src/components/app-launcher/app-launcher-dialog.tsx` (stub that returns `null` until Task 3)
- Test: `src/components/app-launcher/app-launcher-trigger.test.tsx`
- Modify: `src/components/shell/app-shell.tsx`
- Modify: `src/components/shell/sidebar-rail.tsx`
- Modify: `src/components/shell/sidebar-mobile.tsx`

**Interfaces:**
- Consumes: `buildVisibleLauncherGroups` from Task 1; `useFindPage` from `@/components/find-page/use-find-page`; `useSidebar` `setOpenMobile`
- Produces:
  - `AppLauncherContextValue = { open: boolean; setOpen: (open: boolean) => void; groups: AppLauncherGroup[] }`
  - `useAppLauncher(): AppLauncherContextValue` — throws if used outside `AppLauncherProvider`
  - `AppLauncherProvider({ children: ReactNode })`
  - `AppLauncherTrigger()` — renders nothing when `groups.length === 0`

`setOpen(true)` must call `useFindPage().setOpen(false)` first. When `useFindPage().open` becomes `true`, launcher `open` becomes `false`.

- [ ] **Step 1: Write the failing trigger tests**

Create `src/components/app-launcher/app-launcher-trigger.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppLauncherGroup } from "@/config/app-launcher";

const setOpen = vi.fn();
const setOpenMobile = vi.fn();
let groups: AppLauncherGroup[] = [];

vi.mock("./use-app-launcher", () => ({
  useAppLauncher: () => ({ open: false, setOpen, groups }),
}));

vi.mock("@/components/shell/sidebar-context", () => ({
  useSidebar: () => ({
    open: true,
    isMobile: false,
    recordMode: false,
    setOpenMobile,
  }),
}));

import { AppLauncherTrigger } from "./app-launcher-trigger";

afterEach(() => {
  cleanup();
  setOpen.mockClear();
  setOpenMobile.mockClear();
  groups = [];
});

describe("AppLauncherTrigger", () => {
  it("renders nothing when there are no visible groups", () => {
    groups = [];
    const { container } = render(<AppLauncherTrigger />);
    expect(container.firstChild).toBeNull();
  });

  it("opens the overlay when Applications is clicked", async () => {
    groups = [
      {
        id: "design",
        label: "Design",
        tiles: [
          {
            group: "design",
            href: "/certificates",
            title: "Certificates",
            icon: () => null,
          },
        ],
      },
    ];
    const user = userEvent.setup();
    render(<AppLauncherTrigger />);
    await user.click(screen.getByRole("button", { name: "Applications" }));
    expect(setOpen).toHaveBeenCalledWith(true);
  });
});
```

If `@testing-library/user-event` is not a dependency, use `fireEvent.click` from `@testing-library/react` instead. Do not add a new package.

- [ ] **Step 2: Run the trigger test to verify it fails**

Run: `npm run test:unit -- --run src/components/app-launcher/app-launcher-trigger.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement hook, stub dialog, provider, and trigger**

`src/components/app-launcher/use-app-launcher.ts`:

```ts
"use client";

import { createContext, useContext } from "react";
import type { AppLauncherGroup } from "@/config/app-launcher";

export type AppLauncherContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  groups: AppLauncherGroup[];
};

export const AppLauncherContext =
  createContext<AppLauncherContextValue | null>(null);

export function useAppLauncher(): AppLauncherContextValue {
  const ctx = useContext(AppLauncherContext);
  if (!ctx) {
    throw new Error("useAppLauncher must be used within AppLauncherProvider");
  }
  return ctx;
}
```

`src/components/app-launcher/app-launcher-dialog.tsx` (stub):

```tsx
export function AppLauncherDialog() {
  return null;
}
```

`src/components/app-launcher/app-launcher-provider.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildVisibleLauncherGroups } from "@/config/app-launcher";
import { useFindPage } from "@/components/find-page/use-find-page";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { AppLauncherDialog } from "./app-launcher-dialog";
import { AppLauncherContext } from "./use-app-launcher";

export function AppLauncherProvider({ children }: { children: ReactNode }) {
  const { user } = useUser(false);
  const checker = usePermissions();
  const { tenant } = useTenant();
  const findPage = useFindPage();
  const [open, setOpenState] = useState(false);

  const groups = useMemo(
    () => buildVisibleLauncherGroups({ checker, tenant, user }),
    [checker, tenant, user],
  );

  const setOpen = useCallback(
    (next: boolean) => {
      if (next) findPage.setOpen(false);
      setOpenState(next);
    },
    [findPage],
  );

  useEffect(() => {
    if (findPage.open) setOpenState(false);
  }, [findPage.open]);

  const value = useMemo(
    () => ({ open, setOpen, groups }),
    [open, setOpen, groups],
  );

  return (
    <AppLauncherContext.Provider value={value}>
      {children}
      <AppLauncherDialog />
    </AppLauncherContext.Provider>
  );
}
```

`src/components/app-launcher/app-launcher-trigger.tsx`:

```tsx
"use client";

import { ViewGrid } from "iconoir-react";
import { Tooltip } from "@/components/primitives/tooltip";
import { useSidebar } from "@/components/shell/sidebar-context";
import { cn } from "@/lib/utils";
import { useAppLauncher } from "./use-app-launcher";

export function AppLauncherTrigger() {
  const { groups, setOpen } = useAppLauncher();
  const { open, isMobile, recordMode, setOpenMobile } = useSidebar();
  const expanded = isMobile ? true : open && !recordMode;

  if (groups.length === 0) return null;

  const openLauncher = () => {
    if (isMobile) setOpenMobile(false);
    const show = () => setOpen(true);
    if (isMobile) {
      requestAnimationFrame(show);
      return;
    }
    show();
  };

  if (!expanded) {
    return (
      <div className="px-2 pb-1">
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <button
                type="button"
                aria-label="Applications"
                onClick={openLauncher}
                className={cn(
                  "flex w-full items-center justify-center rounded-md p-2.5",
                  "text-text-secondary transition-colors duration-[var(--duration-fast)]",
                  "hover:bg-surface-hover hover:text-text-primary",
                )}
              />
            }
          >
            <ViewGrid width={18} height={18} aria-hidden />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="right">
              <Tooltip.Popup>Applications</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    );
  }

  return (
    <div className="px-2 pb-1">
      <button
        type="button"
        aria-label="Applications"
        onClick={openLauncher}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium",
          "text-text-secondary transition-colors duration-[var(--duration-fast)]",
          "hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        <ViewGrid width={16} height={16} className="shrink-0" aria-hidden />
        <span className="truncate text-left">Applications</span>
      </button>
    </div>
  );
}
```

If `Tooltip.Trigger` `render` prop does not match the primitive (check `src/components/primitives/tooltip.tsx`), copy the exact pattern from `src/components/shell/sidebar-nav.tsx` collapsed-rail tooltips.

- [ ] **Step 4: Mount provider and trigger**

In `src/components/shell/app-shell.tsx`, import `AppLauncherProvider` and wrap inside `FindPageProvider` (launcher must call `useFindPage`):

```tsx
<FindPageProvider>
  <AppLauncherProvider>
    <Shell>{children}</Shell>
  </AppLauncherProvider>
</FindPageProvider>
```

In `src/components/shell/sidebar-rail.tsx`, import `AppLauncherTrigger` and place it immediately below `<TenantHeader />`:

```tsx
<TenantHeader />
<AppLauncherTrigger />
<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
```

In `src/components/shell/sidebar-mobile.tsx`, the same: `<TenantHeader />` then `<AppLauncherTrigger />` then the scrollable nav.

- [ ] **Step 5: Run trigger tests**

Run: `npm run test:unit -- --run src/components/app-launcher/app-launcher-trigger.test.tsx`

Expected: PASS.

Also run: `npm run test:unit -- --run src/components/shell/internal-app-shell.test.tsx src/config/__tests__/app-launcher.test.ts`

Expected: PASS (internal shell unchanged aside from not importing this trigger).

- [ ] **Step 6: Stage**

```bash
git add src/components/app-launcher src/components/shell/app-shell.tsx src/components/shell/sidebar-rail.tsx src/components/shell/sidebar-mobile.tsx
```

---

### Task 3: Overlay dialog — search, bento, navigate

**Files:**
- Modify: `src/components/app-launcher/app-launcher-dialog.tsx`
- Modify: `src/components/primitives/empty/empty-copy-presets.ts`
- Test: `src/components/app-launcher/app-launcher-dialog.test.tsx`

**Interfaces:**
- Consumes: `useAppLauncher()` (`open`, `setOpen`, `groups`); `filterLauncherGroups`; `useNavigationGuard().confirmNavigation`; `useRouter` from `next/navigation`
- Produces: `AppLauncherDialog` — Base UI `Dialog` `max-w-2xl`, search placeholder `Search apps`, group labels `Finance` / `Design`, empty preset `EMPTY_COPY_PRESETS.noAppsMatch`

Tile click: if `confirmNavigation(href)` is false, do not navigate and do not close. Otherwise `router.push(href)` and `setOpen(false)`.

Keyboard while open: ArrowUp / ArrowDown move a `selectedIndex` across the flattened visible tiles (declaration order); Enter activates the selected tile; Esc is handled by `Dialog`.

Focus the search input when `open` becomes true (`autoFocus` on `Input`).

- [ ] **Step 1: Add the empty-copy preset**

In `src/components/primitives/empty/empty-copy-presets.ts`, add:

```ts
  noAppsMatch: {
    enBefore: "No apps match ",
    enHighlight: "that search",
    enAfter: "",
    myBefore: "ရှာသောအက်ပ် ",
    myHighlight: "မတွေ့",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,
```

No exclamation marks. No uppercase CSS.

- [ ] **Step 2: Write the failing dialog tests**

Create `src/components/app-launcher/app-launcher-dialog.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppLauncherGroup } from "@/config/app-launcher";

const push = vi.fn();
const setOpen = vi.fn();
const confirmNavigation = vi.fn(() => true);

let open = true;
let groups: AppLauncherGroup[] = [
  {
    id: "finance",
    label: "Finance",
    tiles: [
      {
        group: "finance",
        href: "/finances",
        title: "Overview",
        icon: () => null,
      },
      {
        group: "finance",
        href: "/finances/student-payments",
        title: "Student Payments",
        icon: () => null,
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    tiles: [
      {
        group: "design",
        href: "/award-titles",
        title: "Award titles",
        icon: () => null,
      },
    ],
  },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/shell/use-navigation-guard", () => ({
  useNavigationGuard: () => ({ confirmNavigation }),
}));

vi.mock("./use-app-launcher", () => ({
  useAppLauncher: () => ({ open, setOpen, groups }),
}));

import { AppLauncherDialog } from "./app-launcher-dialog";

afterEach(() => {
  cleanup();
  push.mockClear();
  setOpen.mockClear();
  confirmNavigation.mockReturnValue(true);
  open = true;
});

describe("AppLauncherDialog", () => {
  it("navigates to a tile href and closes", () => {
    render(<AppLauncherDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Award titles" }));
    expect(push).toHaveBeenCalledWith("/award-titles");
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("does not close when the navigation guard blocks", () => {
    confirmNavigation.mockReturnValue(false);
    render(<AppLauncherDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Award titles" }));
    expect(push).not.toHaveBeenCalled();
    expect(setOpen).not.toHaveBeenCalled();
  });

  it("filters to Award titles and hides Finance", () => {
    render(<AppLauncherDialog />);
    fireEvent.change(screen.getByPlaceholderText("Search apps"), {
      target: { value: "award" },
    });
    expect(screen.getByRole("link", { name: "Award titles" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
    expect(screen.queryByText("Finance")).toBeNull();
  });

  it("shows empty copy when nothing matches", () => {
    render(<AppLauncherDialog />);
    fireEvent.change(screen.getByPlaceholderText("Search apps"), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/No apps match/)).toBeTruthy();
  });
});
```

Use `getByRole("link")` if tiles are `<a>` / Next `Link`. If they are `<button>`, switch the queries to `getByRole("button", { name: ... })` in both the test and the implementation — pick **one** and keep them matched. Prefer `Link`/`<a href>` so middle-click works.

- [ ] **Step 3: Run dialog tests to verify they fail**

Run: `npm run test:unit -- --run src/components/app-launcher/app-launcher-dialog.test.tsx`

Expected: FAIL (stub returns `null`).

- [ ] **Step 4: Implement the dialog**

Replace `src/components/app-launcher/app-launcher-dialog.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/primitives/dialog";
import { Input } from "@/components/primitives/input";
import { EmptyCopy } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
import { filterLauncherGroups } from "@/config/app-launcher";
import { useNavigationGuard } from "@/components/shell/use-navigation-guard";
import { cn } from "@/lib/utils";
import { useAppLauncher } from "./use-app-launcher";

export function AppLauncherDialog() {
  const { open, setOpen, groups } = useAppLauncher();
  const router = useRouter();
  const { confirmNavigation } = useNavigationGuard();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const visible = useMemo(
    () => filterLauncherGroups(groups, query),
    [groups, query],
  );
  const flat = visible.flatMap((g) => g.tiles);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const go = (href: string) => {
    if (!confirmNavigation(href)) return;
    router.push(href);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-2xl gap-5">
          <Dialog.Title>Applications</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search and open Finance and Design apps
          </Dialog.Description>
          <Input
            autoFocus
            value={query}
            placeholder="Search apps"
            aria-label="Search apps"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((i) =>
                  flat.length === 0 ? 0 : Math.min(i + 1, flat.length - 1),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && flat[selectedIndex]) {
                e.preventDefault();
                go(flat[selectedIndex].href);
              }
            }}
          />
          {visible.length === 0 ? (
            <EmptyCopy {...EMPTY_COPY_PRESETS.noAppsMatch} />
          ) : (
            <div className="flex flex-col gap-5">
              {visible.map((group) => (
                <section key={group.id}>
                  <h3 className="mb-2 text-sm font-medium text-text-secondary">
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {group.tiles.map((tile) => {
                      const Icon = tile.icon;
                      const flatIndex = flat.findIndex(
                        (t) => t.href === tile.href,
                      );
                      const selected = flatIndex === selectedIndex;
                      return (
                        <Link
                          key={tile.href}
                          href={tile.href}
                          aria-label={tile.title}
                          onClick={(e) => {
                            e.preventDefault();
                            go(tile.href);
                          }}
                          className={cn(
                            "flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 text-center",
                            "transition-colors duration-[var(--duration-fast)]",
                            "hover:bg-surface-hover",
                            selected && "ring-2 ring-[var(--ring)]",
                          )}
                        >
                          <Icon width={22} height={22} aria-hidden />
                          <span className="w-full truncate text-sm text-text-primary">
                            {tile.title}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Check `EmptyCopy` export path: `@/components/primitives/empty` is used elsewhere. If `EMPTY_COPY_PRESETS` is not re-exported there, keep the direct presets import as written.

`Dialog.Root` already calls `useRegisterGlobalOverlay`, which closes Find a page via `FindPageProvider`’s `overlayActive` effect.

- [ ] **Step 5: Run dialog + config tests**

Run: `npm run test:unit -- --run src/components/app-launcher/app-launcher-dialog.test.tsx src/components/app-launcher/app-launcher-trigger.test.tsx src/config/__tests__/app-launcher.test.ts`

Expected: PASS.

- [ ] **Step 6: Stage**

```bash
git add src/components/app-launcher/app-launcher-dialog.tsx src/components/app-launcher/app-launcher-dialog.test.tsx src/components/primitives/empty/empty-copy-presets.ts
```

---

### Task 4: Manual verification and regression

**Files:** none new. Confirm wiring from Tasks 2–3.

**Interfaces:** none.

- [ ] **Step 1: Run the unit slices plus shell tests**

Run: `npm run test:unit -- --run src/config/__tests__/app-launcher.test.ts src/components/app-launcher src/components/shell/internal-app-shell.test.tsx src/config/__tests__/find-page-items.test.ts src/components/nav/__tests__/nav-visibility.test.ts`

Expected: PASS. Find a page item builder and nav visibility must be unchanged.

- [ ] **Step 2: Manual check (dev app)**

As a user who can see Finance Overview and Certificates:

1. Expanded rail: Applications sits under the school name, above Home.
2. Click Applications → overlay; search focused; Finance and Design groups; click Certificates → `/certificates`, overlay closes; Certificates still listed under Courses in the sidebar.
3. Type `award` → only Award titles; type `zzzz` → “No apps match that search.”
4. `⌘K` still opens Find a page. With Applications open, `⌘K` / opening Find a page closes Applications.
5. Collapse the rail: grid icon under the logo; tooltip “Applications”; click opens the same overlay (does not expand the rail).
6. Record mode (open a user): Applications icon still in the outer rail; inner record rail unchanged.
7. Mobile: Applications in the drawer; tap it closes the drawer then shows the overlay.
8. As a teacher with only `course.view`: Applications control is absent.

- [ ] **Step 3: Stage any leftover edits**

```bash
git add src/config/app-launcher.ts src/config/__tests__/app-launcher.test.ts src/components/app-launcher src/components/shell/app-shell.tsx src/components/shell/sidebar-rail.tsx src/components/shell/sidebar-mobile.tsx src/components/primitives/empty/empty-copy-presets.ts docs/superpowers/specs/2026-08-16-app-launcher-design.md docs/superpowers/plans/2026-08-16-app-launcher.md
```

Do not commit unless authorized.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Trigger under tenant logo, expanded + collapsed + mobile | 2 |
| Spotlight overlay + Launchpad bento | 3 |
| Finance four tiles + Design two tiles; no Form designer | 1 |
| Permission / `canShow` parity via nav child | 1 |
| Hide trigger when zero tiles | 1 + 2 |
| Search tiles only; Find a page unchanged | 1 `filterLauncherGroups` + 3; Find a page files not edited |
| No new global shortcut | 2–3 (no keydown on window) |
| One overlay at a time | 2 provider + 3 `Dialog` overlay registry |
| Navigation guard | 3 |
| Empty copy, sentence-case labels, cream tiles | 3 |
| Sidebar IA unchanged | no edits to `nav-routes.tsx` |
