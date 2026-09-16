# App Shell & Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** This repo follows `no-git-commits` — do **not** run the commit steps until the user has authorized commits. Until then, treat each "Commit" step as "stage only" (`git add`) and pause. No feature branches; work on the current branch (`dev`).

**Goal:** Rebuild the global `(internal)` app shell (sidebar + in-panel header + content frame) in the Schedjuice v2 `.sj-root` design world — Linear-style recessed rail + floating content panel — while every un-migrated page stays pixel-identical.

**Architecture:** A new CSS-grid shell wraps the app in `.sj-root`; chrome uses new tokens, page bodies render behind a `.sj-content-reset` boundary that restores the old shadcn token world. The shadcn-collision token re-points move from `.sj-root` to a chrome-only `.sj-chrome` class. A unified theme controller drives both `data-theme` (new) and next-themes `.dark` (old). The sidebar reuses the existing nav config/permission/data layer and is rebuilt on Base UI primitives. The contextual record-swap is **out of scope** (P2b); this shell only ships the collapse-to-icon-rail capability.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4, Base UI primitives (`src/components/primitives/*`), Iconoir (`iconoir-react`), next-themes (kept until Phase N), vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-app-shell-sidebar-design.md`

---

## File Structure

**New (`src/components/shell/`):**
- `app-shell.tsx` — grid layout, content boundary, mounts integrations + providers, fullscreen hide rules
- `sidebar-context.tsx` — sidebar state provider (open/openMobile/isMobile/toggle/keyboard)
- `sidebar-cookie.ts` — pure cookie read/write helpers (unit-tested)
- `sidebar-cookie.test.ts` — tests
- `sidebar-rail.tsx` — desktop rail container (recessed cream + paper grain)
- `sidebar-nav.tsx` — nav groups/items from `navLinks` + `visibleChildren`
- `sidebar-mobile.tsx` — mobile drawer (Sheet)
- `tenant-header.tsx` — tenant monogram/name
- `account-menu.tsx` — avatar + Profile/Settings/Logout (Menu)
- `panel-header.tsx` — in-panel header (title + actions)
- `header-actions.tsx` — icon buttons: notifications, fullscreen, mobile nav trigger
- `theme-control.tsx` — 3-way theme control wired to unified setter
- `use-unified-theme.ts` — syncs `data-theme` + next-themes
- `nav-icons.tsx` — nav `title` → Iconoir icon map

**Modified:**
- `src/app/globals.css` — move collision re-points to `.sj-chrome`; add `.sj-content-reset`
- `src/components/primitives/theme-toggle.tsx` — add non-breaking `onChange` prop
- `src/app/(design)/components/layout.tsx` — add `.sj-chrome` to its `.sj-root` root
- `src/app/(internal)/layout.tsx` — replace internals with `<AppShell>`

**Reused as-is (imported, not changed):** `src/config/nav-routes.tsx`, `src/components/nav/nav-visibility.ts`, `src/hooks/{useUser,useTenant,usePermissions,use-mobile,use-fullscreen,useUtilityNotifications}.ts`, `src/components/layout/{view-as-banner,fullscreen-provider}.tsx`, `src/components/course/chat/chat-area.tsx`, `src/components/web-push/web-push-registrar.tsx`, `src/components/auth/logout-button.tsx`, `src/lib/sj/theme.ts`, `src/components/primitives/*`.

**Removed at the end (Task 11):** old shell wiring (`app-sidebar.tsx`, `app-topbar.tsx`, `sidebar-footer.tsx` references). The shadcn `ui/sidebar.tsx` file stays in the repo (other code may not use it, but removal belongs to Phase N cleanup).

---

## Task 0: Prerequisites verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm dependencies + fonts exist**

Run:
```bash
node -e "require.resolve('iconoir-react'); require.resolve('next-themes'); console.log('deps ok')"
ls public/fonts/noto-sans-latin-400.woff2 public/fonts/fraunces-latin-600.woff2
grep -n '"@base-ui' package.json
```
Expected: `deps ok`, the two font files listed, and a `@base-ui/react` (or equivalent) entry printed. If `@base-ui` is missing from `package.json` but primitives import it, stop and report — do not guess a version.

- [ ] **Step 2: Confirm the test runner works**

Run: `npm run test:unit -- --run` 
Expected: existing suite passes (establishes a green baseline).

---

## Task 1: Token boundary — `.sj-chrome` split + content reset

**Files:**
- Modify: `src/app/globals.css` (the `.sj-root` blocks added for the design world, ~lines 688–838)
- Modify: `src/app/(design)/components/layout.tsx:16`

This is the spec's #1 risk. Goal: `.sj-root` defines only the *new* world; the shadcn-name overrides move to `.sj-chrome`; a `.sj-content-reset` restores the old world for page bodies.

- [ ] **Step 1: In `globals.css`, remove the shadcn-collision overrides from the base `.sj-root` block**

In the `.sj-root { ... }` block (currently ~688–736), **delete** these four lines (they move to `.sj-chrome`):
```css
  --accent: var(--data-green-strong);
  --accent-foreground: #ffffff;
  --border: var(--warm-200);
  --ring: color-mix(in srgb, var(--accent) 58%, var(--terminal) 12%);
  /* --success overridden to the harmonized warm-palette green */
  --success: #2f7d54;
```
Keep everything else in `.sj-root` (raw palette, new semantic tokens, `color-scheme`, `color`).

- [ ] **Step 2: Convert the `@layer theme { .sj-root { ... } }` re-point block to `.sj-chrome`**

Change the selector of the light re-point block (currently `@layer theme { .sj-root { ... } }`, ~740–773) so the shadcn-name re-points apply to `.sj-chrome` instead, while the **new** `--color-*` utility tokens stay on `.sj-root`. Replace that block with:
```css
/* New utility tokens stay on .sj-root (available to any new-world subtree). */
@layer theme {
  .sj-root {
    --color-surface: var(--surface);
    --color-surface-elevated: var(--surface-elevated);
    --color-surface-inverse: var(--surface-inverse);
    --color-surface-hover: var(--surface-hover);
    --color-surface-active: var(--surface-active);
    --color-surface-skeleton: var(--surface-skeleton);
    --color-text-primary: var(--text-primary);
    --color-text-secondary: var(--text-secondary);
    --color-text-muted: var(--text-muted);
    --color-text-on-inverse: var(--text-on-inverse);
    --color-brand: var(--brand);
    --color-brand-foreground: var(--brand-foreground);
    --color-border-strong: var(--border-strong);
    --color-danger: var(--danger);
    --color-warning: var(--warning);
    --color-zebra-row: var(--zebra-row);
    --color-tab-highlight: var(--tab-highlight);
  }
}

/* Chrome-only: shadcn-name overrides + accent/border/ring/success live here so
   page bodies (without .sj-chrome) keep the original shadcn tokens. */
.sj-chrome {
  --accent: var(--data-green-strong);
  --accent-foreground: #ffffff;
  --border: var(--warm-200);
  --ring: color-mix(in srgb, var(--accent) 58%, var(--terminal) 12%);
  --success: #2f7d54;
}
@layer theme {
  .sj-chrome {
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-border: var(--border);
    --color-foreground: var(--text-primary);
    --color-background: var(--surface);
    --color-muted-foreground: var(--text-muted);
    --color-card: var(--surface-elevated);
    --color-card-foreground: var(--text-primary);
    --color-popover: var(--surface-elevated);
    --color-popover-foreground: var(--text-primary);
    --foreground: var(--text-primary);
    --background: var(--surface);
    --muted-foreground: var(--text-muted);
  }
}
```

- [ ] **Step 3: Mirror the same split for dark mode**

For the `html[data-theme="dark"] .sj-root` re-point block (~806–838) and the `@media (prefers-color-scheme: dark) html[data-theme="system"] .sj-root` block (~870–903): keep the `--color-surface*/text*/brand/border-strong/danger/warning/zebra/tab-highlight` re-points on `.sj-root`, and move the shadcn-name re-points (`--color-accent`, `--color-border`, `--color-foreground`, `--color-background`, `--color-muted-foreground`, `--color-card*`, `--color-popover*`, bare `--foreground/--background/--muted-foreground`) to `html[data-theme="dark"] .sj-chrome` and `html[data-theme="system"] .sj-chrome` respectively. (The dark token *values* — `--accent`, `--border`, etc. in the `html[data-theme="dark"] .sj-root` value block ~776–803 — also move to `html[data-theme="dark"] .sj-chrome`.)

- [ ] **Step 4: Add the content-reset boundary**

Append to `globals.css`:
```css
/* Page bodies inside the new shell: restore the legacy shadcn world so
   un-migrated routes render exactly as before. */
.sj-content-reset {
  --font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
  font-family: var(--font-sans);
  color: var(--foreground);
  font-size: 1rem;
  line-height: 1.5;
}
```

- [ ] **Step 5: Keep the `/components` showcase protected**

In `src/app/(design)/components/layout.tsx:16`, add `sj-chrome` to the root element so the showcase keeps the collision re-points it relied on:
```tsx
    <div className="sj-root sj-chrome relative min-h-screen bg-surface text-text-primary antialiased">
```

- [ ] **Step 6: Verify build + showcase unchanged**

Run: `npm run build`
Expected: build succeeds.
Then `npm run dev`, visit `/components`, `/components/color`, `/components/bilingual` in light AND dark (toggle in header). Expected: visually identical to before this task.

- [ ] **Step 7: Commit**
```bash
git add src/app/globals.css "src/app/(design)/components/layout.tsx"
git commit -m "refactor(shell): split .sj-root collision tokens into .sj-chrome + add content reset"
```

---

## Task 2: Unified theme controller

**Files:**
- Modify: `src/components/primitives/theme-toggle.tsx`
- Create: `src/components/shell/use-unified-theme.ts`
- Create: `src/components/shell/theme-control.tsx`

- [ ] **Step 1: Add a non-breaking `onChange` to the ThemeToggle primitive**

In `theme-toggle.tsx`, extend props and call it inside `choose`:
```tsx
export function ThemeToggle({
  className,
  onChange,
}: {
  className?: string;
  onChange?: (pref: ThemePreference) => void;
}) {
  const [pref, setPref] = useState<ThemePreference>("system");
  // ...unchanged effect...
  function choose(next: ThemePreference) {
    setPref(next);
    applyTheme(next);
    onChange?.(next);
  }
  // ...unchanged JSX...
}
```

- [ ] **Step 2: Create the unified-theme hook**

`src/components/shell/use-unified-theme.ts`:
```ts
"use client";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { normalizeTheme } from "@/lib/sj/theme";

/**
 * Keeps next-themes (.dark class, old app) in lockstep with data-theme (new world).
 * Returns a setter that updates next-themes; data-theme/cookie are handled by applyTheme
 * in the ThemeToggle primitive's onChange.
 */
export function useUnifiedTheme() {
  const { setTheme } = useTheme();

  useEffect(() => {
    const current = normalizeTheme(document.documentElement.dataset.theme);
    setTheme(current); // reconcile next-themes to whatever the inline script resolved
  }, [setTheme]);

  return { syncNextThemes: (pref: string) => setTheme(normalizeTheme(pref)) };
}
```

- [ ] **Step 3: Create the shell theme control**

`src/components/shell/theme-control.tsx`:
```tsx
"use client";
import { ThemeToggle } from "@/components/primitives/theme-toggle";
import { useUnifiedTheme } from "./use-unified-theme";

export function ThemeControl({ className }: { className?: string }) {
  const { syncNextThemes } = useUnifiedTheme();
  return <ThemeToggle className={className} onChange={syncNextThemes} />;
}
```

- [ ] **Step 4: Verify**

Run: `npm run build` → succeeds.
(Behavioral verification happens in Task 10 once the control is mounted in the header.)

- [ ] **Step 5: Commit**
```bash
git add src/components/primitives/theme-toggle.tsx src/components/shell/use-unified-theme.ts src/components/shell/theme-control.tsx
git commit -m "feat(shell): unified theme control syncing data-theme + next-themes"
```

---

## Task 3: Sidebar state provider (TDD on persistence)

**Files:**
- Create: `src/components/shell/sidebar-cookie.ts`
- Create: `src/components/shell/sidebar-cookie.test.ts`
- Create: `src/components/shell/sidebar-context.tsx`

- [ ] **Step 1: Write failing tests for cookie helpers**

`src/components/shell/sidebar-cookie.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseSidebarCookie, SIDEBAR_COOKIE } from "./sidebar-cookie";

describe("parseSidebarCookie", () => {
  it("returns true when no cookie is set (default open)", () => {
    expect(parseSidebarCookie("")).toBe(true);
  });
  it("reads false", () => {
    expect(parseSidebarCookie(`${SIDEBAR_COOKIE}=false`)).toBe(false);
  });
  it("reads true among other cookies", () => {
    expect(parseSidebarCookie(`a=1; ${SIDEBAR_COOKIE}=true; b=2`)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npm run test:unit -- --run src/components/shell/sidebar-cookie.test.ts`
Expected: FAIL ("Cannot find module './sidebar-cookie'").

- [ ] **Step 3: Implement the helpers**

`src/components/shell/sidebar-cookie.ts`:
```ts
export const SIDEBAR_COOKIE = "sidebar:state";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function parseSidebarCookie(cookieString: string): boolean {
  const m = cookieString.match(new RegExp(`(?:^|; )${SIDEBAR_COOKIE}=([^;]+)`));
  if (!m) return true; // default open
  return m[1] !== "false";
}

export function writeSidebarCookie(open: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIDEBAR_COOKIE}=${open}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test:unit -- --run src/components/shell/sidebar-cookie.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the provider**

`src/components/shell/sidebar-context.tsx`:
```tsx
"use client";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseSidebarCookie, writeSidebarCookie } from "./sidebar-cookie";

type SidebarState = {
  open: boolean;
  setOpen: (v: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (v: boolean) => void;
  isMobile: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [open, setOpenState] = useState(true);
  const [openMobile, setOpenMobile] = useState(false);

  useEffect(() => {
    setOpenState(parseSidebarCookie(document.cookie));
  }, []);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    writeSidebarCookie(v);
  }, []);

  const toggle = useCallback(() => {
    if (isMobile) setOpenMobile((v) => !v);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(
    () => ({ open, setOpen, openMobile, setOpenMobile, isMobile, toggle }),
    [open, setOpen, openMobile, isMobile, toggle],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
```

- [ ] **Step 6: Commit**
```bash
git add src/components/shell/sidebar-cookie.ts src/components/shell/sidebar-cookie.test.ts src/components/shell/sidebar-context.tsx
git commit -m "feat(shell): sidebar state provider with cookie persistence + Cmd/Ctrl+B"
```

---

## Task 4: Nav icon map (Iconoir)

**Files:** Create `src/components/shell/nav-icons.tsx`

Reduce icons per DESIGN.md §11: icons on items, sourced from Iconoir (no lucide in new chrome). Keyed by nav `title` (stable).

- [ ] **Step 1: Create the map with a safe fallback**

`src/components/shell/nav-icons.tsx`:
```tsx
import {
  Home, AppWindow, GraduationCap, Group, Wallet, Computer, Megaphone,
  StatsUpSquare, Settings, ShieldCheck, Terminal, Page, Calendar,
  Bell, Book, Coins, ReportColumns, NavArrowRight,
} from "iconoir-react";
import type { ComponentType, SVGProps } from "react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const ICONS: Record<string, Icon> = {
  Home, Courses: GraduationCap, People: Group, CRM: AppWindow,
  "User Logs": Page, Finance: Wallet, Operations: Settings,
  Content: Megaphone, Insights: StatsUpSquare, Setup: Settings,
  Administration: ShieldCheck, Platform: Terminal,
};

export const FallbackIcon = NavArrowRight;

export function navIcon(title: string): Icon {
  return ICONS[title] ?? FallbackIcon;
}
```

- [ ] **Step 2: Verify every import resolves**

Run: `npm run build`
Expected: success. If any named import is not exported by `iconoir-react`, the build fails with "has no exported member" — replace that name with the closest existing export (browse `node_modules/iconoir-react/dist/index.d.ts` or https://iconoir.com). Do not leave an unresolved import.

- [ ] **Step 3: Commit**
```bash
git add src/components/shell/nav-icons.tsx
git commit -m "feat(shell): Iconoir nav icon map"
```

---

## Task 5: Tenant header + sidebar nav + rail

**Files:** Create `src/components/shell/tenant-header.tsx`, `src/components/shell/sidebar-nav.tsx`, `src/components/shell/sidebar-rail.tsx`

- [ ] **Step 1: Tenant header**

`src/components/shell/tenant-header.tsx`:
```tsx
"use client";
import { useTenant } from "@/hooks/useTenant";
import { useSidebar } from "./sidebar-context";

function monogram(name?: string | null) {
  if (!name?.trim()) return "?";
  const p = name.trim().split(/\s+/).filter(Boolean);
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

export function TenantHeader() {
  const { tenant } = useTenant();
  const { open, isMobile } = useSidebar();
  const expanded = open || isMobile;
  return (
    <div className="flex h-16 items-center gap-2 px-3">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground"
        aria-hidden
      >
        {monogram(tenant?.name)}
      </div>
      {expanded ? (
        <p className="truncate font-serif text-lg text-text-primary">{tenant?.name}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Sidebar nav**

`src/components/shell/sidebar-nav.tsx`:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NavArrowRight } from "iconoir-react";
import { navLinks, resolveNavHref, navSectionContainsActivePath } from "@/config/nav-routes";
import { visibleChildren } from "@/components/nav/nav-visibility";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { usePermissions } from "@/hooks/usePermissions";
import { navIcon } from "./nav-icons";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useUser();
  const { tenant } = useTenant();
  const { canAny } = usePermissions();
  const pathname = usePathname();
  const { open, isMobile } = useSidebar();
  const expanded = open || isMobile;

  if (!user || !tenant) return null;

  const sections = navLinks
    .map((route) => ({ route, children: visibleChildren(route, { canAny }, tenant, user) }))
    .filter(({ children }) => children.length > 0);

  return (
    <nav className="flex flex-col gap-1 px-2 py-2">
      {sections.map(({ route, children }) => (
        <NavSection
          key={route.title}
          title={route.title}
          expanded={expanded}
          defaultOpen={navSectionContainsActivePath(route, pathname, tenant?.id)}
        >
          {children.map((item) => {
            const href = resolveNavHref(item.href, tenant?.id);
            const active = href !== "#" && (pathname === href || pathname.startsWith(`${href}/`));
            const Icon = navIcon(item.title);
            return (
              <Link
                key={item.title}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
                  active
                    ? "bg-surface-active font-medium text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <Icon width={16} height={16} className="shrink-0" aria-hidden />
                {expanded ? <span className="truncate">{item.title}</span> : null}
              </Link>
            );
          })}
        </NavSection>
      ))}
    </nav>
  );
}

function NavSection({
  title, defaultOpen, expanded, children,
}: { title: string; defaultOpen: boolean; expanded: boolean; children: React.ReactNode }) {
  const [openSection, setOpenSection] = useState(defaultOpen);
  if (!expanded) return <div className="flex flex-col gap-1">{children}</div>;
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpenSection((v) => !v)}
        aria-expanded={openSection}
        className="group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-semibold tracking-wide text-text-muted hover:text-text-primary"
      >
        <span className="truncate">{title}</span>
        <NavArrowRight
          width={14} height={14} aria-hidden
          className={cn("transition-transform", openSection && "rotate-90")}
        />
      </button>
      {openSection ? <div className="flex flex-col gap-0.5">{children}</div> : null}
    </div>
  );
}
```

- [ ] **Step 3: Rail container**

`src/components/shell/sidebar-rail.tsx`:
```tsx
"use client";
import { PaperGrain } from "@/components/primitives/decoration/paper-grain";
import { TenantHeader } from "./tenant-header";
import { SidebarNav } from "./sidebar-nav";
import { AccountMenu } from "./account-menu";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

export function SidebarRail() {
  const { open } = useSidebar();
  return (
    <aside
      data-state={open ? "expanded" : "collapsed"}
      className={cn(
        "sj-root sj-chrome relative hidden h-svh shrink-0 flex-col bg-surface md:flex",
        "transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        open ? "w-64" : "w-[4rem]",
      )}
    >
      <PaperGrain />
      <div className="relative z-10 flex h-full flex-col">
        <TenantHeader />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          <SidebarNav />
        </div>
        <AccountMenu />
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Verify build (depends on Task 6 AccountMenu — do Task 6 first if building in isolation)**

Run: `npm run build` after Task 6.

- [ ] **Step 5: Commit**
```bash
git add src/components/shell/tenant-header.tsx src/components/shell/sidebar-nav.tsx src/components/shell/sidebar-rail.tsx
git commit -m "feat(shell): tenant header, permission-filtered nav, recessed rail"
```

---

## Task 6: Account menu

**Files:** Create `src/components/shell/account-menu.tsx`

- [ ] **Step 1: Implement using Base UI Menu + Avatar**

`src/components/shell/account-menu.tsx`:
```tsx
"use client";
import Link from "next/link";
import { NavArrowUp } from "iconoir-react";
import { Menu } from "@/components/primitives/menu";
import { Avatar } from "@/components/primitives/avatar";
import LogoutButton from "@/components/auth/logout-button";
import { useUser } from "@/hooks/useUser";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

export function AccountMenu() {
  const { user } = useUser();
  const { open, isMobile } = useSidebar();
  const expanded = open || isMobile;
  return (
    <div className="border-t border-border p-2">
      <Menu.Root>
        <Menu.Trigger
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md p-2 text-left outline-none",
            "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
          )}
        >
          <Avatar src={user?.profile_image} name={user?.name ?? "?"} className="size-8" />
          {expanded ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text-primary">{user?.name}</span>
              <span className="block truncate text-xs text-text-muted">{user?.roles?.join(" · ")}</span>
            </span>
          ) : null}
          {expanded ? <NavArrowUp width={16} height={16} className="text-text-muted" aria-hidden /> : null}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="top" align="start">
            <Menu.Popup>
              <Menu.Item render={<Link href={`/users/${user?.id}`} />}>Profile</Menu.Item>
              <Menu.Item render={<Link href={`/users/${user?.id}/settings`} />}>Settings</Menu.Item>
              <Menu.Separator />
              <Menu.Item render={<LogoutButton />} />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
```

- [ ] **Step 2: Verify the Base UI `render` prop pattern + LogoutButton**

Run: `npm run build`. If Base UI's `Menu.Item` does not accept `render` in this version, fall back to `<Menu.Item>` wrapping the content directly (e.g. `<Menu.Item><Link .../></Menu.Item>`). Confirm `LogoutButton` renders an actionable element; if it carries shadcn styling that clashes, wrap its `onClick`/`logout()` in a plain `Menu.Item` instead. Verify in dev that Profile/Settings/Logout work.

- [ ] **Step 3: Commit**
```bash
git add src/components/shell/account-menu.tsx
git commit -m "feat(shell): account menu on Base UI Menu + Avatar"
```

---

## Task 7: Mobile drawer

**Files:** Create `src/components/shell/sidebar-mobile.tsx`

- [ ] **Step 1: Implement with the Sheet primitive**

`src/components/shell/sidebar-mobile.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sheet } from "@/components/primitives/sheet";
import { TenantHeader } from "./tenant-header";
import { SidebarNav } from "./sidebar-nav";
import { AccountMenu } from "./account-menu";
import { useSidebar } from "./sidebar-context";

export function SidebarMobile() {
  const { openMobile, setOpenMobile, isMobile } = useSidebar();
  const pathname = usePathname();

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);

  if (!isMobile) return null;

  return (
    <Sheet.Root open={openMobile} onOpenChange={setOpenMobile}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup side="left" className="sj-chrome w-72 gap-0 p-0">
          <Sheet.Title className="sr-only">Navigation</Sheet.Title>
          <TenantHeader />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarNav onNavigate={() => setOpenMobile(false)} />
          </div>
          <AccountMenu />
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build` → success. (Dev verification of the drawer happens in Task 10.)

- [ ] **Step 3: Commit**
```bash
git add src/components/shell/sidebar-mobile.tsx
git commit -m "feat(shell): mobile nav drawer on Sheet primitive"
```

---

## Task 8: In-panel header + actions

**Files:** Create `src/components/shell/header-actions.tsx`, `src/components/shell/panel-header.tsx`

- [ ] **Step 1: Header action icon buttons (notifications + fullscreen + mobile trigger)**

`src/components/shell/header-actions.tsx`:
```tsx
"use client";
import Link from "next/link";
import { Bell, Expand, Minimize, Menu as MenuIcon } from "iconoir-react";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useUtilityNotifications } from "@/hooks/useUtilityNotifications";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

const iconBtn =
  "relative inline-flex size-9 items-center justify-center rounded-md text-text-secondary " +
  "transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover hover:text-text-primary " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

export function MobileNavTrigger() {
  const { toggle } = useSidebar();
  return (
    <button type="button" onClick={toggle} aria-label="Open navigation" className={cn(iconBtn, "md:hidden")}>
      <MenuIcon width={18} height={18} aria-hidden />
    </button>
  );
}

export function NotificationsButton() {
  const { unreadCount } = useUtilityNotifications();
  const hasUnread = unreadCount > 0;
  return (
    <Link
      href="/notifications"
      aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
      className={iconBtn}
    >
      <Bell width={18} height={18} aria-hidden />
      {hasUnread ? <span className="absolute right-2 top-2 size-2 rounded-full bg-accent" aria-hidden /> : null}
    </Link>
  );
}

export function FullscreenButton() {
  const { toggle, effectiveFullscreen, isFullscreenAvailable, label } = useFullscreen();
  if (!isFullscreenAvailable) return null;
  const Icon = effectiveFullscreen ? Minimize : Expand;
  return (
    <button
      type="button" onClick={toggle} className={iconBtn}
      aria-label={effectiveFullscreen ? `Exit ${label}` : `Enter ${label}`}
    >
      <Icon width={18} height={18} aria-hidden />
    </button>
  );
}
```

> Confirmed: `useUtilityNotifications()` returns `{ items, unreadCount, isLoading, isRefetching, error, refetch }` — `unreadCount` is a number. Iconoir names here (`Bell`, `Expand`, `Minimize`, `Menu`) are build-verified; if any is not exported by `iconoir-react`, swap for the closest export (e.g. `Minimize` → `Collapse`). The Base UI `render={<Element/>}` prop and plain-children `Menu.Item` patterns are confirmed against `_demos/overlays-demo.tsx`.

- [ ] **Step 2: Panel header**

`src/components/shell/panel-header.tsx`:
```tsx
"use client";
import { usePathname } from "next/navigation";
import { getNavPageTitle } from "@/config/nav-routes";
import { useTenant } from "@/hooks/useTenant";
import { ThemeControl } from "./theme-control";
import { MobileNavTrigger, NotificationsButton, FullscreenButton } from "./header-actions";

export function PanelHeader() {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const title = getNavPageTitle(pathname, tenant?.id);
  return (
    <header className="sj-root sj-chrome sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface-elevated px-4">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavTrigger />
        <h1 className="truncate font-serif text-lg text-text-primary">{title ?? <span className="sr-only">Main</span>}</h1>
      </div>
      <div className="flex items-center gap-1.5">
        <NotificationsButton />
        <FullscreenButton />
        <ThemeControl />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build` → success.

- [ ] **Step 4: Commit**
```bash
git add src/components/shell/header-actions.tsx src/components/shell/panel-header.tsx
git commit -m "feat(shell): in-panel header with theme/notifications/fullscreen actions"
```

---

## Task 9: App shell + layout wiring

**Files:** Create `src/components/shell/app-shell.tsx`; Modify `src/app/(internal)/layout.tsx`

- [ ] **Step 1: App shell**

`src/components/shell/app-shell.tsx`:
```tsx
"use client";
import { Suspense } from "react";
import { TooltipProvider } from "@/components/primitives/tooltip";
import { FullscreenProvider } from "@/components/layout/fullscreen-provider";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { ViewAsBanner } from "@/components/layout/view-as-banner";
import { WebPushRegistrar } from "@/components/web-push/web-push-registrar";
import ChatArea from "@/components/course/chat/chat-area";
import { SidebarProvider } from "./sidebar-context";
import { SidebarRail } from "./sidebar-rail";
import { SidebarMobile } from "./sidebar-mobile";
import { PanelHeader } from "./panel-header";

function Shell({ children }: { children: React.ReactNode }) {
  const { effectiveFullscreen } = useFullscreen();
  return (
    <div className="sj-root flex h-svh w-full overflow-hidden bg-surface">
      <a
        href="#main-content"
        className="sj-chrome fixed left-3 top-3 z-[400] -translate-y-24 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary shadow-md transition focus:translate-y-0"
      >
        Skip to main content
      </a>

      {!effectiveFullscreen ? <SidebarRail /> : null}
      <SidebarMobile />

      <div className="flex min-w-0 flex-1 flex-col p-2 md:p-3">
        <ViewAsBanner />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-sm sj-root">
          {!effectiveFullscreen ? <PanelHeader /> : null}
          <main
            id="main-content"
            tabIndex={-1}
            className="sj-content-reset min-h-0 flex-1 overflow-auto bg-background outline-none focus-visible:outline-none"
          >
            <Suspense>{children}</Suspense>
          </main>
        </div>
      </div>

      {!effectiveFullscreen ? <ChatArea /> : null}
      <WebPushRegistrar />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <FullscreenProvider>
      <TooltipProvider>
        <SidebarProvider>
          <Shell>{children}</Shell>
        </SidebarProvider>
      </TooltipProvider>
    </FullscreenProvider>
  );
}
```

> Note: the floating content panel carries `sj-root` (so `bg-surface-elevated` flips in dark), and `<main>` carries `sj-content-reset` so page bodies render in the legacy world. The panel frame border/shadow come from the new tokens.

- [ ] **Step 2: Replace the internal layout**

Replace the body of `src/app/(internal)/layout.tsx` with:
```tsx
import "../globals.css";
import "./layout-styles.css";
import { AppShell } from "@/components/shell/app-shell";

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success. Fix any unresolved imports/types surfaced here.

- [ ] **Step 4: Commit**
```bash
git add src/components/shell/app-shell.tsx "src/app/(internal)/layout.tsx"
git commit -m "feat(shell): assemble new app shell and wire internal layout"
```

---

## Task 10: Validation gate (screenshots + behavior)

**Files:** none (verification); fix-ups land in the relevant component files.

- [ ] **Step 1: Token-boundary screenshot gate (the spec's required acceptance)**

Run `npm run dev`, log in (`james@schedjuice.com` / `password123`). Capture an un-migrated **form page** (e.g. `/users/<id>/edit`) and a **data-table page** (e.g. `/users`) in **light and dark**. Compare the page-body region against `git stash`-ed main (or a screenshot taken before this branch). Expected: **page body unchanged**; only the surrounding rail/header/frame are new. If the body shifts color/font, fix `.sj-content-reset` (Task 1 Step 4) until it matches.

- [ ] **Step 2: Behavior checklist**

Verify in dev:
- Rail collapse/expand persists across reload (cookie); `Cmd/Ctrl+B` toggles.
- Mobile (<768px): hamburger opens the drawer; nav link closes it; route change closes it.
- Admin vs student nav differs (login as each if available) — `visibleChildren` still gates.
- Theme control flips chrome **and** page body together; reload shows no FOUC.
- Fullscreen page hides rail + header + chat; `ViewAsBanner` still shows when active.
- Keyboard: tab order, focus rings, skip-link to `#main-content`.
- Base UI menus/tooltips/sheet render above content (no clipping vs `#portal`).

- [ ] **Step 3: Run the full gate**

Run: `npm run lint && npm run build && npm run test:unit -- --run`
Expected: all pass.

- [ ] **Step 4: Commit any fixes**
```bash
git add -A
git commit -m "fix(shell): validation pass (token boundary, responsive, a11y)"
```

---

## Task 11: Retire old shell wiring

**Files:** Delete `src/components/nav/app-sidebar.tsx`, `src/components/nav/app-topbar.tsx`, `src/components/nav/sidebar-footer.tsx` (only if nothing else imports them).

- [ ] **Step 1: Confirm no remaining importers**

Run: `grep -rn "app-sidebar\|app-topbar\|nav/sidebar-footer" src --include=*.tsx --include=*.ts`
Expected: no matches outside the files themselves. If other code imports them, stop and leave them.

- [ ] **Step 2: Delete the dead files** (only the unreferenced ones)

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: success.

> Keep `src/components/ui/sidebar.tsx`, Radix, next-themes, lucide installed — their removal is Phase N cleanup, not this plan.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "chore(shell): remove old sidebar/topbar wiring"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** §4.1 layout → Task 9; §4.2 token boundary → Task 1 + Task 10 gate; §4.3 theme unification → Task 2; §4.4 reuse/rebuild → Tasks 5–8; §5 components → Tasks 2–9; §6 behavior contracts → Tasks 3,7,10; §7 motion → rail/drawer transitions (Tasks 5,7); §8 a11y → Tasks 5–10; §9 responsive → Tasks 5,7,10; §10 risks → Task 1/10 gate; §11 acceptance → Task 10; §12 open items (collapsed-rail flyout) noted below. Deferred (P2b swap, record page) correctly absent.

**Known refinements left to implementation (not placeholders — concrete defaults given, verified by build/dev):**
- Iconoir export names (Tasks 4, 8) — build-verified with a fallback procedure.
- `useUtilityNotifications` (Task 8) — confirmed `{ unreadCount }`; plan updated.
- Base UI `render={...}` prop + plain-children `Menu.Item` — confirmed against `_demos/overlays-demo.tsx`; `Menu.Item render={<LogoutButton/>}` keeps a concrete fallback in Task 6.
- Collapsed icon-rail currently shows item icons with section grouping flattened; a section-icon **flyout** (DESIGN.md §12 open item) is a follow-up polish, not required for P2a sign-off.

**Type consistency:** `useSidebar()` shape (`open/setOpen/openMobile/setOpenMobile/isMobile/toggle`) is defined in Task 3 and consumed identically in Tasks 5–9. `navIcon(title)` (Task 4) used in Task 5. `ThemeControl` (Task 2) used in Task 8. `parseSidebarCookie/writeSidebarCookie` (Task 3) consistent across helper + provider.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-app-shell-sidebar.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.
