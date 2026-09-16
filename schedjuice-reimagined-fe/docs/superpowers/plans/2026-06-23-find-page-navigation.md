# Find a page — Global navigation palette — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a mouse-first “Find a page” palette in the app shell header — sidebar pages + shortcut tools, permission-filtered, with two-step onboarding and ⌘K / Ctrl+K as a secondary shortcut.

**Architecture:** Pure `buildFindPageItems()` flattens `navLinks` + `shortcuts-tools`; `FindPageProvider` in `AppShell` owns open state, global keyboard listener, and onboarding orchestration; `FindPageDialog` composes Base UI `Dialog` + headless `cmdk` (not `@/components/ui/command`); `FindPageTrigger` lives in `PanelHeader`.

**Tech Stack:** Next.js App Router, Base UI primitives, `cmdk`, Iconoir, Vitest, existing `nav-routes` / `nav-visibility` / `shortcuts-tools`.

**Spec:** [`docs/superpowers/specs/2026-06-23-find-page-navigation-design.md`](../specs/2026-06-23-find-page-navigation-design.md)

---

## File map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/config/find-page-items.ts` | Create | Flatten nav + shortcuts into searchable items |
| `src/config/__tests__/find-page-items.test.ts` | Create | Unit tests for item builder |
| `src/lib/find-page-onboarding-storage.ts` | Create | localStorage keys for onboarding steps |
| `src/lib/__tests__/find-page-onboarding-storage.test.ts` | Create | Storage unit tests |
| `src/lib/find-page-shortcut-label.ts` | Create | Platform-aware ⌘K / Ctrl K label |
| `src/lib/is-typing-target.ts` | Create | Shared guard for global shortcuts |
| `src/components/find-page/use-find-page.ts` | Create | Context consumer hook |
| `src/components/find-page/find-page-provider.tsx` | Create | Context, items memo, ⌘K listener, onboarding state |
| `src/components/find-page/find-page-dialog.tsx` | Create | Dialog + styled cmdk list |
| `src/components/find-page/find-page-trigger.tsx` | Create | Header field button + Tips link |
| `src/components/find-page/find-page-onboarding.tsx` | Create | Welcome dialog + coachmark popover |
| `src/components/shell/panel-header.tsx` | Modify | Mount `FindPageTrigger` |
| `src/components/shell/app-shell.tsx` | Modify | Wrap shell in `FindPageProvider` |

---

### Task 1: Find-page item builder

**Files:**
- Create: `src/config/find-page-items.ts`
- Create: `src/config/__tests__/find-page-items.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/config/__tests__/find-page-items.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn() } }));

import { buildFindPageItems } from "../find-page-items";
import { makePermissionChecker } from "@/hooks/usePermissions";
import type { organizationType } from "@/types/organization";
import { accountType, role } from "@/types/user";

const STUDENT_PERMS = [
  "course.view",
  "payment.make",
  "library.view",
  "chat.participate",
  "grade.view",
  "assignment.submit",
  "quiz.take",
];

const tenant = { id: 1 } as unknown as organizationType;

describe("buildFindPageItems", () => {
  it("includes permission-visible nav pages for a student-like user", () => {
    const items = buildFindPageItems({
      checker: makePermissionChecker(STUDENT_PERMS),
      tenant,
      user: undefined,
    });
    const pageHrefs = items.filter((i) => i.group === "pages").map((i) => i.href);
    expect(pageHrefs).toContain("/home");
    expect(pageHrefs).toContain("/courses");
    expect(pageHrefs).not.toContain("/users");
  });

  it("includes shortcut tools for a teacher when tenant gates pass", () => {
    const teacher = { roles: [role.teacher] } as accountType;
    const items = buildFindPageItems({
      checker: makePermissionChecker(["course.view"]),
      tenant,
      user: teacher,
    });
    const shortcutHrefs = items
      .filter((i) => i.group === "shortcuts")
      .map((i) => i.href);
    expect(shortcutHrefs).toContain("/shortcuts/todays-classes");
  });

  it("drops shortcut entries whose href already appears in pages", () => {
    const teacher = { roles: [role.teacher] } as accountType;
    const items = buildFindPageItems({
      checker: makePermissionChecker(["course.view"]),
      tenant,
      user: teacher,
    });
    const shortcutsIndex = items.filter((i) => i.href === "/shortcuts");
    expect(shortcutsIndex).toHaveLength(1);
    expect(shortcutsIndex[0]?.group).toBe("pages");
  });

  it("skips unresolved :id nav hrefs when tenant id is missing", () => {
    const items = buildFindPageItems({
      checker: makePermissionChecker(["org.manage_all"]),
      tenant: undefined,
      user: { roles: [role.superadmin] } as accountType,
    });
    expect(items.every((i) => !i.href.includes(":id"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/config/__tests__/find-page-items.test.ts`
Expected: FAIL — cannot find module `../find-page-items`

- [ ] **Step 3: Implement `buildFindPageItems`**

Create `src/config/find-page-items.ts`:

```typescript
import { visibleChildren, type NavPermissionChecker } from "@/components/nav/nav-visibility";
import { navLinks, resolveNavHref } from "@/config/nav-routes";
import { filterShortcutToolsForUser } from "@/config/shortcuts-tools";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type FindPageGroup = "pages" | "shortcuts";

export type FindPageItem = {
  id: string;
  title: string;
  description?: string;
  href: string;
  group: FindPageGroup;
};

export function buildFindPageItems(args: {
  checker: NavPermissionChecker;
  tenant: organizationType | null | undefined;
  user: accountType | undefined;
}): FindPageItem[] {
  const pageHrefs = new Set<string>();
  const pages: FindPageItem[] = [];

  for (const section of navLinks) {
    const children = visibleChildren(
      section,
      args.checker,
      args.tenant,
      args.user,
    );
    for (const child of children) {
      if (!child.href) continue;
      const resolved = resolveNavHref(child.href, args.tenant?.id);
      if (resolved === "#" || resolved.includes(":id")) continue;
      pageHrefs.add(resolved);
      pages.push({
        id: `pages:${resolved}`,
        title: child.title,
        description: child.description,
        href: resolved,
        group: "pages",
      });
    }
  }

  const shortcuts: FindPageItem[] = filterShortcutToolsForUser(
    args.user,
    args.tenant,
  )
    .filter((tool) => !pageHrefs.has(tool.href))
    .map((tool) => ({
      id: `shortcuts:${tool.href}`,
      title: tool.title,
      description: tool.description,
      href: tool.href,
      group: "shortcuts" as const,
    }));

  return [...pages, ...shortcuts];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/config/__tests__/find-page-items.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/find-page-items.ts src/config/__tests__/find-page-items.test.ts
git commit -m "feat: add find-page item builder for nav palette"
```

---

### Task 2: Onboarding storage + shortcut label helpers

**Files:**
- Create: `src/lib/find-page-onboarding-storage.ts`
- Create: `src/lib/__tests__/find-page-onboarding-storage.test.ts`
- Create: `src/lib/find-page-shortcut-label.ts`
- Create: `src/lib/is-typing-target.ts`

- [ ] **Step 1: Write failing onboarding storage test**

Create `src/lib/__tests__/find-page-onboarding-storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  hasSeenFindPageDialog,
  hasSeenFindPageCoachmark,
  markFindPageDialogSeen,
  markFindPageCoachmarkSeen,
  replayFindPageOnboarding,
} from "../find-page-onboarding-storage";

describe("find-page-onboarding-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts unseen", () => {
    expect(hasSeenFindPageDialog()).toBe(false);
    expect(hasSeenFindPageCoachmark()).toBe(false);
  });

  it("marks dialog and coachmark independently", () => {
    markFindPageDialogSeen();
    expect(hasSeenFindPageDialog()).toBe(true);
    expect(hasSeenFindPageCoachmark()).toBe(false);

    markFindPageCoachmarkSeen();
    expect(hasSeenFindPageCoachmark()).toBe(true);
  });

  it("replay clears both keys", () => {
    markFindPageDialogSeen();
    markFindPageCoachmarkSeen();
    replayFindPageOnboarding();
    expect(hasSeenFindPageDialog()).toBe(false);
    expect(hasSeenFindPageCoachmark()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/lib/__tests__/find-page-onboarding-storage.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement storage + helpers**

Create `src/lib/find-page-onboarding-storage.ts`:

```typescript
export const FIND_PAGE_DIALOG_KEY = "sj:find-page-onboarding-dialog";
export const FIND_PAGE_COACHMARK_KEY = "sj:find-page-onboarding-coachmark";

function canUseLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function hasSeenFindPageDialog(): boolean {
  if (!canUseLocalStorage()) return true;
  return localStorage.getItem(FIND_PAGE_DIALOG_KEY) === "1";
}

export function hasSeenFindPageCoachmark(): boolean {
  if (!canUseLocalStorage()) return true;
  return localStorage.getItem(FIND_PAGE_COACHMARK_KEY) === "1";
}

export function markFindPageDialogSeen(): void {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(FIND_PAGE_DIALOG_KEY, "1");
}

export function markFindPageCoachmarkSeen(): void {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(FIND_PAGE_COACHMARK_KEY, "1");
}

export function replayFindPageOnboarding(): void {
  if (!canUseLocalStorage()) return;
  localStorage.removeItem(FIND_PAGE_DIALOG_KEY);
  localStorage.removeItem(FIND_PAGE_COACHMARK_KEY);
}
```

Create `src/lib/find-page-shortcut-label.ts`:

```typescript
export function getFindPageShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl K";
  const platform =
    navigator.userAgentData?.platform ?? navigator.platform ?? "";
  const isApple =
    /Mac|iPhone|iPad|iPod/i.test(platform) ||
    /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isApple ? "⌘K" : "Ctrl K";
}

/** Welcome-dialog sentence fragment before the shortcut token. */
export function getFindPageWelcomeShortcutHint(): string {
  const label = getFindPageShortcutLabel();
  if (label.startsWith("⌘")) {
    return `You can also press ${label} on a Mac or Ctrl+K on Windows.`;
  }
  return `You can also press ${label} on Windows or ⌘K on a Mac.`;
}
```

Create `src/lib/is-typing-target.ts`:

```typescript
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null | undefined;
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const ce = el.getAttribute?.("contenteditable");
  return ce === "true" || el.isContentEditable;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit src/lib/__tests__/find-page-onboarding-storage.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/find-page-onboarding-storage.ts src/lib/__tests__/find-page-onboarding-storage.test.ts src/lib/find-page-shortcut-label.ts src/lib/is-typing-target.ts
git commit -m "feat: add find-page onboarding storage and shortcut helpers"
```

---

### Task 3: Find-page context provider

**Files:**
- Create: `src/components/find-page/use-find-page.ts`
- Create: `src/components/find-page/find-page-provider.tsx`

- [ ] **Step 1: Create the hook**

Create `src/components/find-page/use-find-page.ts`:

```typescript
"use client";

import { createContext, useContext } from "react";
import type { RefObject } from "react";
import type { FindPageItem } from "@/config/find-page-items";

export type FindPageContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  items: FindPageItem[];
  triggerRef: RefObject<HTMLButtonElement | null>;
  replayOnboarding: () => void;
  welcomeOpen: boolean;
  setWelcomeOpen: (open: boolean) => void;
  coachmarkOpen: boolean;
  setCoachmarkOpen: (open: boolean) => void;
};

export const FindPageContext = createContext<FindPageContextValue | null>(null);

export function useFindPage(): FindPageContextValue {
  const ctx = useContext(FindPageContext);
  if (!ctx) {
    throw new Error("useFindPage must be used within FindPageProvider");
  }
  return ctx;
}
```

- [ ] **Step 2: Implement provider**

Create `src/components/find-page/find-page-provider.tsx`:

```typescript
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildFindPageItems } from "@/config/find-page-items";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { isTypingTarget } from "@/lib/is-typing-target";
import {
  hasSeenFindPageCoachmark,
  hasSeenFindPageDialog,
  markFindPageCoachmarkSeen,
  markFindPageDialogSeen,
  replayFindPageOnboarding as clearOnboardingStorage,
} from "@/lib/find-page-onboarding-storage";
import { FindPageContext } from "./use-find-page";
import { FindPageDialog } from "./find-page-dialog";
import { FindPageOnboarding } from "./find-page-onboarding";

export function FindPageProvider({ children }: { children: ReactNode }) {
  const { user } = useUser(false);
  const checker = usePermissions();
  const { tenant } = useTenant();
  const { effectiveFullscreen } = useFullscreen();

  const [open, setOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [coachmarkOpen, setCoachmarkOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const coachmarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items = useMemo(
    () =>
      buildFindPageItems({
        checker,
        tenant,
        user,
      }),
    [checker, tenant, user],
  );

  const scheduleCoachmark = useCallback(() => {
    if (coachmarkTimerRef.current) clearTimeout(coachmarkTimerRef.current);
    coachmarkTimerRef.current = setTimeout(() => {
      if (!hasSeenFindPageCoachmark()) {
        setCoachmarkOpen(true);
      }
    }, 300);
  }, []);

  const dismissWelcome = useCallback(() => {
    markFindPageDialogSeen();
    setWelcomeOpen(false);
    scheduleCoachmark();
  }, [scheduleCoachmark]);

  const dismissCoachmark = useCallback(() => {
    markFindPageCoachmarkSeen();
    setCoachmarkOpen(false);
  }, []);

  const replayOnboarding = useCallback(() => {
    if (coachmarkTimerRef.current) clearTimeout(coachmarkTimerRef.current);
    clearOnboardingStorage();
    setCoachmarkOpen(false);
    setWelcomeOpen(true);
  }, []);

  useEffect(() => {
    if (effectiveFullscreen) return;
    if (!hasSeenFindPageDialog()) {
      setWelcomeOpen(true);
    }
  }, [effectiveFullscreen]);

  useEffect(() => {
    return () => {
      if (coachmarkTimerRef.current) clearTimeout(coachmarkTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "k") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      items,
      triggerRef,
      replayOnboarding,
      welcomeOpen,
      setWelcomeOpen,
      coachmarkOpen,
      setCoachmarkOpen,
    }),
    [open, items, replayOnboarding, welcomeOpen, coachmarkOpen],
  );

  return (
    <FindPageContext.Provider value={value}>
      {children}
      <FindPageDialog />
      <FindPageOnboarding
        welcomeOpen={welcomeOpen}
        onWelcomeDismiss={dismissWelcome}
        coachmarkOpen={coachmarkOpen}
        onCoachmarkDismiss={dismissCoachmark}
        triggerRef={triggerRef}
      />
    </FindPageContext.Provider>
  );
}
```

- [ ] **Step 3: Verify TypeScript (dialog/onboarding stubs next task — add placeholder exports first if needed)**

Temporarily create minimal stubs so tsc passes:

`src/components/find-page/find-page-dialog.tsx`:
```typescript
"use client";
export function FindPageDialog() {
  return null;
}
```

`src/components/find-page/find-page-onboarding.tsx`:
```typescript
"use client";
import type { RefObject } from "react";

export function FindPageOnboarding(_props: {
  welcomeOpen: boolean;
  onWelcomeDismiss: () => void;
  coachmarkOpen: boolean;
  onCoachmarkDismiss: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return null;
}
```

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors in find-page files

- [ ] **Step 4: Commit**

```bash
git add src/components/find-page/use-find-page.ts src/components/find-page/find-page-provider.tsx src/components/find-page/find-page-dialog.tsx src/components/find-page/find-page-onboarding.tsx
git commit -m "feat: add find-page provider with keyboard shortcut and onboarding state"
```

---

### Task 4: Find-page dialog (Base UI Dialog + cmdk)

**Files:**
- Modify: `src/components/find-page/find-page-dialog.tsx`

- [ ] **Step 1: Replace stub with full dialog**

Replace `src/components/find-page/find-page-dialog.tsx` with:

```typescript
"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog } from "@/components/primitives/dialog";
import { cn } from "@/lib/utils";
import type { FindPageItem } from "@/config/find-page-items";
import { useFindPage } from "./use-find-page";

const GROUP_LABEL: Record<FindPageItem["group"], string> = {
  pages: "Pages",
  shortcuts: "Shortcuts",
};

function groupItems(items: FindPageItem[]) {
  const pages = items.filter((i) => i.group === "pages");
  const shortcuts = items.filter((i) => i.group === "shortcuts");
  return { pages, shortcuts };
}

export function FindPageDialog() {
  const router = useRouter();
  const { open, setOpen, items } = useFindPage();

  const grouped = useMemo(() => groupItems(items), [items]);

  const onSelect = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen],
  );

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        "[data-find-page-input]",
      );
      input?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup
          className={cn(
            "sj-root w-full max-w-lg gap-0 overflow-hidden p-0",
          )}
        >
          <Dialog.Title className="sr-only">Find a page</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search app pages and shortcut tools
          </Dialog.Description>

          <Command
            className="flex flex-col bg-surface-elevated text-text-primary"
            filter={(value, search) => {
              if (!search) return 1;
              return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <div className="border-b border-border px-3">
              <Command.Input
                data-find-page-input
                placeholder="Type to search…"
                className="h-12 w-full bg-transparent text-base outline-none placeholder:text-text-muted"
              />
            </div>
            <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-text-muted">
                No pages match that search.
              </Command.Empty>

              {(["pages", "shortcuts"] as const).map((groupKey) => {
                const rows = groupKey === "pages" ? grouped.pages : grouped.shortcuts;
                if (rows.length === 0) return null;
                return (
                  <Command.Group
                    key={groupKey}
                    heading={GROUP_LABEL[groupKey]}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-muted"
                  >
                    {rows.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${item.title} ${item.description ?? ""}`}
                        onSelect={() => onSelect(item.href)}
                        className={cn(
                          "cursor-default rounded-md px-3 py-2.5 outline-none select-none",
                          "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                        )}
                      >
                        <div className="text-base text-text-primary">{item.title}</div>
                        {item.description ? (
                          <div className="mt-0.5 text-sm text-text-secondary line-clamp-1">
                            {item.description}
                          </div>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}
            </Command.List>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/find-page/find-page-dialog.tsx
git commit -m "feat: add find-page dialog with cmdk and Base UI Dialog"
```

---

### Task 5: Header trigger

**Files:**
- Create: `src/components/find-page/find-page-trigger.tsx`
- Modify: `src/components/shell/panel-header.tsx`

- [ ] **Step 1: Implement trigger**

Create `src/components/find-page/find-page-trigger.tsx`:

```typescript
"use client";

import { Search } from "iconoir-react";
import { cn } from "@/lib/utils";
import { getFindPageShortcutLabel } from "@/lib/find-page-shortcut-label";
import { useFindPage } from "./use-find-page";

export function FindPageTrigger() {
  const { setOpen, triggerRef, replayOnboarding } = useFindPage();
  const shortcut = getFindPageShortcutLabel();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Find a page"
        className={cn(
          "flex h-9 min-w-[10rem] max-w-xs flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 text-left",
          "text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        )}
      >
        <Search width={16} height={16} aria-hidden className="shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate sm:hidden">Find…</span>
        <span className="min-w-0 flex-1 truncate hidden sm:inline">Find a page…</span>
        <kbd
          className="hidden shrink-0 rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-sans text-[10px] text-text-muted md:inline"
          aria-hidden
        >
          {shortcut}
        </kbd>
      </button>
      <button
        type="button"
        onClick={replayOnboarding}
        aria-label="Show Find a page tips again"
        className="shrink-0 text-sm text-text-secondary underline-offset-2 hover:text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      >
        Tips
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into panel header**

In `src/components/shell/panel-header.tsx`, add import and mount trigger between breadcrumb and icon cluster:

```typescript
import { FindPageTrigger } from "@/components/find-page/find-page-trigger";
```

Update the header row:

```tsx
<div className="flex h-12 items-center justify-between gap-3 px-4">
  <div className="flex min-w-0 flex-1 items-center gap-2">
    <MobileNavTrigger />
    <div className="min-w-0 truncate">{breadcrumb}</div>
  </div>
  <div className="hidden min-w-0 sm:flex sm:max-w-sm sm:flex-1 sm:justify-end">
    <FindPageTrigger />
  </div>
  <div className="flex shrink-0 items-center gap-1.5">
    {/* existing notifications / fullscreen / theme */}
  </div>
</div>
```

Add a mobile-visible row below the main header row (only on `sm:hidden`) so teachers on phones still get the trigger:

```tsx
<div className="flex border-t border-[color-mix(in_srgb,var(--border-chrome)_60%,transparent)] px-4 py-2 sm:hidden">
  <FindPageTrigger />
</div>
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/find-page/find-page-trigger.tsx src/components/shell/panel-header.tsx
git commit -m "feat: add find-page header trigger with Tips replay link"
```

---

### Task 6: Onboarding UI

**Files:**
- Modify: `src/components/find-page/find-page-onboarding.tsx`

- [ ] **Step 1: Replace onboarding stub**

Replace `src/components/find-page/find-page-onboarding.tsx`:

```typescript
"use client";

import type { RefObject } from "react";
import { Dialog } from "@/components/primitives/dialog";
import { Popover } from "@/components/primitives/popover";
import { Button } from "@/components/primitives/button";
import { getFindPageWelcomeShortcutHint } from "@/lib/find-page-shortcut-label";

type Props = {
  welcomeOpen: boolean;
  onWelcomeDismiss: () => void;
  coachmarkOpen: boolean;
  onCoachmarkDismiss: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

export function FindPageOnboarding({
  welcomeOpen,
  onWelcomeDismiss,
  coachmarkOpen,
  onCoachmarkDismiss,
  triggerRef,
}: Props) {
  return (
    <>
      <Dialog.Root open={welcomeOpen} onOpenChange={(next) => !next && onWelcomeDismiss()}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>Find a page</Dialog.Title>
            <Dialog.Description>
              Jump to any screen from the search bar at the top.{" "}
              {getFindPageWelcomeShortcutHint()}
            </Dialog.Description>
            <div className="flex justify-end">
              <Button type="button" onClick={onWelcomeDismiss}>
                Got it
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Popover.Root
        open={coachmarkOpen}
        onOpenChange={(next) => !next && onCoachmarkDismiss()}
      >
        <Popover.Trigger
          render={(props) => (
            <span
              {...props}
              ref={triggerRef}
              className="pointer-events-none fixed left-0 top-0 size-0 overflow-hidden opacity-0"
              aria-hidden
            />
          )}
        />
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="center" sideOffset={8}>
            <Popover.Popup className="max-w-xs">
              <Popover.Arrow />
              <Popover.Title className="font-serif text-lg">Find a page</Popover.Title>
              <Popover.Description className="mt-1 text-sm text-text-secondary">
                Click here anytime to find a page.
              </Popover.Description>
              <div className="mt-4 flex justify-end">
                <Button type="button" size="sm" onClick={onCoachmarkDismiss}>
                  Got it
                </Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
```

**Coachmark anchor note:** Base UI Popover needs an anchor element. The provider’s `triggerRef` is on the real header button; pass that ref to position the popover. If Base UI `Popover.Trigger` cannot attach to an external ref cleanly, use `Popover.Root` with `anchor={triggerRef}` (Base UI v1.6 supports anchor prop on Positioner) — adjust to the API exposed by `@base-ui/react/popover`:

```typescript
<Popover.Root open={coachmarkOpen} onOpenChange={...}>
  <Popover.Portal>
    <Popover.Positioner anchor={triggerRef} side="bottom" align="center" sideOffset={8}>
      ...
    </Popover.Positioner>
  </Popover.Portal>
</Popover.Root>
```

Verify against `src/components/primitives/popover.tsx` exports and Base UI docs during implementation; prefer `anchor={triggerRef}` over a hidden duplicate trigger.

- [ ] **Step 2: Verify TypeScript + lint**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit 2>&1 | head -20`
Run: `cd schedjuice-reimagined-fe && pnpm lint 2>&1 | tail -20`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/find-page/find-page-onboarding.tsx
git commit -m "feat: add find-page welcome dialog and coachmark onboarding"
```

---

### Task 7: App shell integration

**Files:**
- Modify: `src/components/shell/app-shell.tsx`

- [ ] **Step 1: Wrap shell in FindPageProvider**

In `src/components/shell/app-shell.tsx`:

```typescript
import { FindPageProvider } from "@/components/find-page/find-page-provider";
```

Update export:

```tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <FullscreenProvider>
      <TooltipProvider>
        <SidebarProvider>
          <FindPageProvider>
            <Shell>{children}</Shell>
          </FindPageProvider>
        </SidebarProvider>
      </TooltipProvider>
    </FullscreenProvider>
  );
}
```

- [ ] **Step 2: Run unit tests**

Run: `cd schedjuice-reimagined-fe && pnpm test:unit`
Expected: all tests PASS

- [ ] **Step 3: Manual smoke test**

Run: `cd schedjuice-reimagined-fe && pnpm dev`

Verify:
- Welcome dialog on first load → dismiss → coachmark on search field
- Tips replays both steps
- Click header field → palette opens, type "today" → Today's classes appears
- ⌘K / Ctrl+K toggles palette
- Teacher account does not see admin-only destinations

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/app-shell.tsx
git commit -m "feat: wire find-page provider into app shell"
```

---

## Manual QA checklist (from spec §8)

- [ ] First visit: welcome dialog → coachmark on search field
- [ ] Tips replay: both steps run again
- [ ] Click header field → palette opens, input focused
- [ ] ⌘K / Ctrl+K opens palette from non-typing context
- [ ] Search filters Pages and Shortcuts groups
- [ ] Selecting row navigates and closes
- [ ] Empty query shows all allowed items; nonsense query shows empty state
- [ ] Teacher role sees teacher-appropriate subset
- [ ] Mobile: trigger usable; palette full-width
- [ ] Record mode: trigger visible; palette works
- [ ] Fullscreen mode: trigger hidden; onboarding deferred

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| Scope B (pages + shortcuts) | Task 1 |
| No shadcn — cmdk direct + primitives | Task 4 |
| Header search trigger | Task 5 |
| ⌘K / Ctrl+K global shortcut | Task 3 |
| Welcome dialog → coachmark | Tasks 3, 6 |
| Tips replay | Tasks 2, 3, 5 |
| Permission parity | Task 1 |
| localStorage persistence | Task 2 |
| Fullscreen hides trigger / defers onboarding | Tasks 3, 5, 7 |
| Dedup hrefs | Task 1 test |
| Skip `:id` without tenant | Task 1 test |
| Iconoir in chrome | Task 5 |
| No exclamation marks in copy | Tasks 4, 6 |
| Unit tests | Tasks 1, 2 |

No gaps identified.
