# Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** This repo follows `no-git-commits` — do **not** run the commit steps until the user has authorized commits. Until then, treat each "Commit" step as "stage only" (`git add`) and pause. No feature branches; work on the current branch.

**Goal:** Replace the Applications destination-tile overlay with a Workspaces logo-card picker that opens Finance or Studio (home + context rail), ship animated workspace logos, show HR/Admissions as coming soon, and move the document library to `/studio` (delete `/documents`).

**Architecture:** `buildVisibleWorkspaces` decides which cards appear (Finance rail visibility and Studio permissions). Clicking an enterable card navigates to that workspace home. Finance’s rail is unchanged. Studio registers a sibling rail through the existing `useContextRail` slot. Logos are SVG + `globals.css` keyframes (no runtime style inject, no raw hex).

**Tech Stack:** Next.js App Router, React 19, Base UI `Dialog`, Vitest + Testing Library, existing finance rail primitives (`useContextRail`, `staggerList`, `transition.panelWipe`).

**Spec:** `docs/superpowers/specs/2026-08-17-workspaces-design.md`

## Global Constraints

- Overlay is workspace **cards**, not destination tiles. **No search field.**
- Copy: **Workspaces**. Studio not Design. Caption **Coming soon**. English, Burmese-safe: no `text-transform: uppercase`, no exclamation marks.
- Trigger hidden when `buildVisibleWorkspaces` returns `[]` (neither Finance nor Studio enterable).
- HR and Admissions are always `coming_soon` when the overlay is shown; not links; no `homeHref`.
- Studio card omitted without `document_template.manage` and without `award_title.manage`.
- Finance enterable ⇔ `visibleFinanceRecordEntries(...).length > 0`. Do not use the retired four-tile href list.
- `/documents` is **deleted**, not redirected. Editor Back is `/studio`.
- Reuse `useContextRail`. Do **not** rewrite `finance-section-rail.tsx` or `finance-record-nav.ts` entries.
- Logo CSS in `globals.css`. No `document.head` `<style>` injection. No raw `#102C24` / `#60A17E` / `#FCF4E3` in UI; ink is `currentColor` / `--text-primary`, sage is `--brand`.
- Logos remount when the overlay opens so enter animations replay.
- High-value tests only. No “renders Workspaces” smoke, no logo screenshots, no reduced-motion pixel tests.
- Always `vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn() } }))` before importing modules that pull nav / finance-record-nav / permissions.
- Run FE tests with `npm run test:unit -- --run <path>` from `schedjuice-reimagined-fe`.

---

## File Structure

**Create:**

- `docs/superpowers/assets/2026-08-17-workspace-logo-fable.tsx` — Fable glyph source (already in repo; copy `glyphs` into `workspace-logo.tsx`)
- `src/config/workspaces.ts` — workspace defs, `buildVisibleWorkspaces`
- `src/config/__tests__/workspaces.test.ts`
- `src/config/studio-record-nav.ts` — Studio rail entries
- `src/config/__tests__/studio-record-nav.test.ts`
- `src/lib/is-studio-record-route.ts`
- `src/lib/is-studio-record-route.test.ts`
- `src/components/workspaces/workspace-logo.tsx`
- `src/components/workspaces/use-workspaces.ts`
- `src/components/workspaces/workspaces-provider.tsx`
- `src/components/workspaces/workspaces-trigger.tsx`
- `src/components/workspaces/workspaces-dialog.tsx`
- `src/components/workspaces/workspaces-trigger.test.tsx`
- `src/components/workspaces/workspaces-dialog.test.tsx`
- `src/components/studio/record/studio-section-rail.tsx`
- `src/components/studio/record/studio-mobile-sections.tsx`
- `src/components/studio/record/studio-record-rail-provider.tsx`
- `src/app/(internal)/studio/layout.tsx`
- `src/app/(internal)/studio/page.tsx`
- `src/app/(internal)/award-titles/layout.tsx`
- `src/app/(internal)/studio/page.test.tsx`

**Modify:**

- `src/app/globals.css` — workspace logo keyframes (append; do not restyle unrelated motion)
- `src/components/shell/app-shell.tsx` — `WorkspacesProvider`
- `src/components/shell/sidebar-rail.tsx` — `WorkspacesTrigger`
- `src/components/shell/sidebar-mobile.tsx` — `WorkspacesTrigger`
- `src/config/route-permissions.ts` — `/studio` replaces `/documents`
- `src/config/__tests__/route-permissions.test.ts`
- `src/components/find-page/find-page-dialog.tsx` — hide dock on Studio record routes
- `src/components/document-editor/document-editor.tsx` — Back → `/studio`
- `src/components/document-editor/document-editor.test.ts` (create if missing) — caller-contract `/studio`
- `src/components/primitives/empty/empty-copy-presets.ts` — delete `noAppsMatch`

**Delete:**

- `src/config/app-launcher.ts` and `src/config/__tests__/app-launcher.test.ts`
- `src/components/app-launcher/` (after move)
- `src/app/(internal)/documents/`

**Do not modify:** `src/config/nav-routes.tsx`, `src/config/finance-record-nav.ts` (consume only), `src/components/finances/record/finance-section-rail.tsx`.

---

### Task 1: Workspace visibility config

**Files:**
- Create: `src/config/workspaces.ts`
- Test: `src/config/__tests__/workspaces.test.ts`

**Interfaces:**
- Consumes: `visibleFinanceRecordEntries` from `@/config/finance-record-nav`; `NavPermissionChecker` from `@/components/nav/nav-visibility`
- Produces:
  - `WorkspaceId = "finance" | "studio" | "hr" | "admissions"`
  - `WorkspaceStatus = "enterable" | "coming_soon"`
  - `WorkspaceCard = { id: WorkspaceId; label: string; logo: WorkspaceId; status: WorkspaceStatus; homeHref?: string }`
  - `WORKSPACE_ORDER: WorkspaceId[]` = `["finance", "studio", "hr", "admissions"]`
  - `buildVisibleWorkspaces(args: { checker: NavPermissionChecker; tenant: organizationType | null | undefined; user: accountType | undefined }): WorkspaceCard[]`

- [ ] **Step 1: Write the failing tests**

Create `src/config/__tests__/workspaces.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn() } }));

import { buildVisibleWorkspaces } from "../workspaces";
import { makePermissionChecker } from "@/hooks/usePermissions";
import { TransactionScreenshotStrategy } from "@/types/organization";
import type { organizationType } from "@/types/organization";
import { accountType, role } from "@/types/user";

const tenant = { id: 1 } as unknown as organizationType;

describe("buildVisibleWorkspaces", () => {
  it("returns [] when neither Finance nor Studio is enterable", () => {
    expect(
      buildVisibleWorkspaces({
        checker: makePermissionChecker(["course.view"]),
        tenant,
        user: { roles: [role.teacher] } as accountType,
      }),
    ).toEqual([]);
  });

  it("includes Finance plus coming-soon cards and omits Studio without Studio permissions", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["payment.view_all"]),
      tenant,
      user: { roles: [role.finance] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual(["finance", "hr", "admissions"]);
    expect(cards[0]).toMatchObject({
      status: "enterable",
      homeHref: "/finances",
      label: "Finance",
    });
    expect(cards.find((c) => c.id === "hr")).toMatchObject({
      status: "coming_soon",
    });
    expect(cards.find((c) => c.id === "hr")?.homeHref).toBeUndefined();
    expect(cards.find((c) => c.id === "admissions")?.homeHref).toBeUndefined();
  });

  it("includes Studio plus coming-soon cards and omits Finance without finance rail visibility", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["award_title.manage"]),
      tenant,
      user: { roles: [role.admin] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual(["studio", "hr", "admissions"]);
    expect(cards[0]).toMatchObject({
      status: "enterable",
      homeHref: "/studio",
      label: "Studio",
    });
  });

  it("treats document_template.manage as Studio-enterable", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["document_template.manage"]),
      tenant,
      user: { roles: [role.admin] } as accountType,
    });
    expect(cards.map((c) => c.id)).toContain("studio");
  });

  it("returns Finance, Studio, HR, Admissions in that order when both are enterable", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker([
        "payment.view_all",
        "document_template.manage",
      ]),
      tenant,
      user: { roles: [role.admin] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual([
      "finance",
      "studio",
      "hr",
      "admissions",
    ]);
  });

  it("still marks Finance enterable when Unpaid Students canShow fails", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["payment.view_unpaid"]),
      tenant: {
        id: 1,
        transaction_screenshot_strategy: "none",
      } as unknown as organizationType,
      user: { roles: [role.admin] } as accountType,
    });
    expect(cards.find((c) => c.id === "finance")?.status).toBe("enterable");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --run src/config/__tests__/workspaces.test.ts`

Expected: FAIL (module `../workspaces` not found)

- [ ] **Step 3: Write the config**

Create `src/config/workspaces.ts`:

```ts
import type { NavPermissionChecker } from "@/components/nav/nav-visibility";
import { visibleFinanceRecordEntries } from "@/config/finance-record-nav";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type WorkspaceId = "finance" | "studio" | "hr" | "admissions";
export type WorkspaceStatus = "enterable" | "coming_soon";

export type WorkspaceCard = {
  id: WorkspaceId;
  label: string;
  logo: WorkspaceId;
  status: WorkspaceStatus;
  homeHref?: string;
};

export const WORKSPACE_ORDER: WorkspaceId[] = [
  "finance",
  "studio",
  "hr",
  "admissions",
];

const WORKSPACE_LABEL: Record<WorkspaceId, string> = {
  finance: "Finance",
  studio: "Studio",
  hr: "HR",
  admissions: "Admissions",
};

const ENTERABLE_HOME: Record<Extract<WorkspaceId, "finance" | "studio">, string> =
  {
    finance: "/finances",
    studio: "/studio",
  };

export function isFinanceWorkspaceEnterable(args: {
  checker: NavPermissionChecker;
  tenant: organizationType | null | undefined;
  user: accountType | undefined;
}): boolean {
  return (
    visibleFinanceRecordEntries(
      args.user,
      args.tenant ?? null,
      args.checker.canAny,
    ).length > 0
  );
}

export function isStudioWorkspaceEnterable(
  checker: NavPermissionChecker,
): boolean {
  return (
    checker.canAny(["document_template.manage"]) ||
    checker.canAny(["award_title.manage"])
  );
}

export function buildVisibleWorkspaces(args: {
  checker: NavPermissionChecker;
  tenant: organizationType | null | undefined;
  user: accountType | undefined;
}): WorkspaceCard[] {
  const finance = isFinanceWorkspaceEnterable(args);
  const studio = isStudioWorkspaceEnterable(args.checker);
  if (!finance && !studio) return [];

  return WORKSPACE_ORDER.flatMap((id) => {
    if (id === "hr" || id === "admissions") {
      return [
        {
          id,
          label: WORKSPACE_LABEL[id],
          logo: id,
          status: "coming_soon" as const,
        },
      ];
    }
    if (id === "finance" && !finance) return [];
    if (id === "studio" && !studio) return [];
    return [
      {
        id,
        label: WORKSPACE_LABEL[id],
        logo: id,
        status: "enterable" as const,
        homeHref: ENTERABLE_HOME[id],
      },
    ];
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --run src/config/__tests__/workspaces.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/workspaces.ts src/config/__tests__/workspaces.test.ts
git commit -m "feat(workspaces): visibility config for overlay cards"
```

---

### Task 2: WorkspaceLogo + motion CSS

**Files:**
- Create: `src/components/workspaces/workspace-logo.tsx`
- Modify: `src/app/globals.css` (append before the file’s last line, after existing `@keyframes`)

**Interfaces:**
- Consumes: none
- Produces: `WorkspaceName = WorkspaceId`; `WorkspaceLogo({ name, size?: number, mono?: boolean } & SVGProps<SVGSVGElement>)`

Glyph path `d` attributes must be copied **verbatim** from `docs/superpowers/assets/2026-08-17-workspace-logo-fable.tsx` (`glyphs.hr` / `.finance` / `.studio` / `.admissions`). Do not simplify or round path data. Drop `DG`/`PW`/`TM` hex constants, drop `useStyles` / `document.head` injection.

- [ ] **Step 1: Append logo CSS to `globals.css`**

Paste this block at the end of `src/app/globals.css`:

```css
/* Workspace logos — enter + hover. Overlay remounts .sj.sj-{name} to replay. */
.sj-hr .swing{transform-box:view-box;transform-origin:52px 6px;animation:sj-hr-swing 1.4s cubic-bezier(.3,.7,.3,1) both}
.sj-hr:hover .swing{animation:sj-hr-jiggle .9s ease-in-out}
@keyframes sj-hr-swing{0%{transform:rotate(-14deg)}25%{transform:rotate(9deg)}50%{transform:rotate(-5deg)}72%{transform:rotate(2.5deg)}88%{transform:rotate(-1deg)}100%{transform:rotate(0)}}
@keyframes sj-hr-jiggle{0%{transform:rotate(0)}20%{transform:rotate(-6deg)}45%{transform:rotate(4deg)}70%{transform:rotate(-2deg)}100%{transform:rotate(0)}}
@media(prefers-reduced-motion:reduce){.sj-hr *{animation:none!important;transition:none!important}}
.sj-finance .paper{transform-box:view-box;transform-origin:32px 32px;animation:sj-finance-land .5s cubic-bezier(.2,.8,.2,1) both}
.sj-finance .ln{transform-box:fill-box;transform-origin:left center;animation:sj-finance-print .35s cubic-bezier(.2,.8,.2,1) both}
.sj-finance .l1{animation-delay:.35s}.sj-finance .l2{animation-delay:.55s}.sj-finance .l3{animation-delay:.75s}.sj-finance .k{animation-delay:1s;transition:transform .3s}
.sj-finance:hover .k{transform:translate(2px,0)}
@keyframes sj-finance-land{from{opacity:0;transform:translate(0,-8px)}to{opacity:1;transform:none}}
@keyframes sj-finance-print{from{opacity:0;transform:scaleX(0)}to{opacity:1;transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.sj-finance *{animation:none!important;transition:none!important}}
.sj-studio .pen{transform-box:view-box;transform-origin:32px 32px;animation:sj-studio-fall .7s cubic-bezier(.34,1.4,.5,1) both;transition:transform .3s}
.sj-studio .k{transform-box:fill-box;transform-origin:50% 0;animation:sj-studio-drip 1.5s .55s both}
.sj-studio:hover .pen{transform:translate(-1px,2px)}
@keyframes sj-studio-fall{from{opacity:0;transform:translate(6px,-22px) rotate(8deg)}to{opacity:1;transform:none}}
@keyframes sj-studio-drip{0%{transform:scale(.12,.12);animation-timing-function:cubic-bezier(.25,.6,.35,1)}42%{transform:scale(1,1);animation-timing-function:cubic-bezier(.4,0,.6,1)}58%{transform:scale(.96,1.08);animation-timing-function:cubic-bezier(.5,0,.85,.55)}80%{transform:translate(0,4.5px) scale(1,1.02);animation-timing-function:cubic-bezier(.3,0,.5,1)}90%{transform:translate(0,4.5px) scale(1.03,.97);animation-timing-function:cubic-bezier(.3,0,.5,1)}100%{transform:translate(0,4.5px) scale(1,1)}}
.sj-admissions .frame{animation:sj-admissions-fade .3s ease-out both}
.sj-admissions .slab{transform-box:view-box;transform-origin:16.6px 32px;animation:sj-admissions-shut .38s cubic-bezier(.5,0,.8,.4) .55s both}
.sj-admissions .door{transform-box:view-box;transform-origin:16.5px 32px;animation:sj-admissions-open .75s cubic-bezier(.2,.8,.2,1) .9s both;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.sj-admissions:hover .door{transform:scaleX(1.12)}
@keyframes sj-admissions-fade{from{opacity:0}to{opacity:1}}
@keyframes sj-admissions-shut{0%{transform:scaleX(1);opacity:1}99%{transform:scaleX(.04);opacity:1}100%{transform:scaleX(.04);opacity:0}}
@keyframes sj-admissions-open{from{transform:scaleX(.05)}to{transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.sj.sj-hr *,.sj.sj-finance *,.sj.sj-studio *,.sj.sj-admissions *{animation:none!important;transition:none!important}.sj-admissions .slab{opacity:0!important}}
```

- [ ] **Step 2: Create `workspace-logo.tsx`**

- [ ] **Step 2: Create `workspace-logo.tsx`**

Copy `const glyphs = { ... }` from `docs/superpowers/assets/2026-08-17-workspace-logo-fable.tsx` into `src/components/workspaces/workspace-logo.tsx`. Then add the imports and `WorkspaceLogo` below. Do not copy `useStyles`, `CSS`, or the hex constants.

```tsx
import * as React from "react";
import type { WorkspaceId } from "@/config/workspaces";

export type WorkspaceName = WorkspaceId;

const glyphs: Record<WorkspaceName, React.ReactNode> = {
  /* entire glyphs object from docs/superpowers/assets/2026-08-17-workspace-logo-fable.tsx */
};

/** Entry animation runs on mount; remount (change key) to replay. */
export function WorkspaceLogo({
  name,
  size = 64,
  mono = false,
  className,
  ...rest
}: {
  name: WorkspaceName;
  size?: number;
  mono?: boolean;
} & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={["sj", `sj-${name}`, className].filter(Boolean).join(" ")}
      data-name={name}
      role="img"
      aria-hidden={rest["aria-hidden"] ? true : undefined}
      aria-label={rest["aria-hidden"] ? undefined : name}
      style={{
        color: "var(--text-primary)",
        ["--sj-k" as string]: mono ? "currentColor" : "var(--brand)",
      }}
      {...rest}
    >
      {glyphs[name]}
    </svg>
  );
}
```

- [ ] **Step 3: Confirm no style injection**

Grep `workspace-logo.tsx` for `document.head`, `createElement("style")`, `#102C24`, `#60A17E`, `#FCF4E3`. Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add src/components/workspaces/workspace-logo.tsx src/app/globals.css docs/superpowers/assets/2026-08-17-workspace-logo-fable.tsx
git commit -m "feat(workspaces): animated SVG logos with token colors"
```

---

### Task 3: Workspaces overlay (cards, no search)

**Files:**
- Create: `src/components/workspaces/use-workspaces.ts`
- Create: `src/components/workspaces/workspaces-provider.tsx`
- Create: `src/components/workspaces/workspaces-trigger.tsx`
- Create: `src/components/workspaces/workspaces-dialog.tsx`
- Test: `src/components/workspaces/workspaces-trigger.test.tsx`
- Test: `src/components/workspaces/workspaces-dialog.test.tsx`
- Modify: `src/components/shell/app-shell.tsx`
- Modify: `src/components/shell/sidebar-rail.tsx`
- Modify: `src/components/shell/sidebar-mobile.tsx`
- Delete: `src/config/app-launcher.ts`, `src/config/__tests__/app-launcher.test.ts`, `src/components/app-launcher/`
- Modify: `src/components/primitives/empty/empty-copy-presets.ts` — remove `noAppsMatch`

**Interfaces:**
- Consumes: `buildVisibleWorkspaces`, `WorkspaceCard` from Task 1; `WorkspaceLogo` from Task 2
- Produces: `useWorkspaces(): { open: boolean; setOpen: (open: boolean) => void; workspaces: WorkspaceCard[] }`; `WorkspacesProvider`; `WorkspacesTrigger`; `WorkspacesDialog`

- [ ] **Step 1: Write failing overlay tests**

Create `src/components/workspaces/workspaces-trigger.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceCard } from "@/config/workspaces";

const setOpen = vi.fn();
const setOpenMobile = vi.fn();
let workspaces: WorkspaceCard[] = [];

vi.mock("./use-workspaces", () => ({
  useWorkspaces: () => ({ open: false, setOpen, workspaces }),
}));

vi.mock("@/components/shell/sidebar-context", () => ({
  useSidebar: () => ({
    open: true,
    isMobile: false,
    recordMode: false,
    setOpenMobile,
  }),
}));

import { WorkspacesTrigger } from "./workspaces-trigger";

afterEach(() => {
  cleanup();
  setOpen.mockClear();
  setOpenMobile.mockClear();
  workspaces = [];
});

describe("WorkspacesTrigger", () => {
  it("renders nothing when there are no workspaces", () => {
    workspaces = [];
    const { container } = render(<WorkspacesTrigger />);
    expect(container.firstChild).toBeNull();
  });

  it("opens the overlay when Workspaces is clicked", async () => {
    workspaces = [
      {
        id: "studio",
        label: "Studio",
        logo: "studio",
        status: "enterable",
        homeHref: "/studio",
      },
    ];
    const user = userEvent.setup();
    render(<WorkspacesTrigger />);
    await user.click(screen.getByRole("button", { name: "Workspaces" }));
    expect(setOpen).toHaveBeenCalledWith(true);
  });
});
```

Create `src/components/workspaces/workspaces-dialog.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceCard } from "@/config/workspaces";

const push = vi.fn();
const setOpen = vi.fn();
const confirmNavigation = vi.fn(() => true);

let open = true;
let workspaces: WorkspaceCard[] = [
  {
    id: "finance",
    label: "Finance",
    logo: "finance",
    status: "enterable",
    homeHref: "/finances",
  },
  {
    id: "studio",
    label: "Studio",
    logo: "studio",
    status: "enterable",
    homeHref: "/studio",
  },
  {
    id: "hr",
    label: "HR",
    logo: "hr",
    status: "coming_soon",
  },
  {
    id: "admissions",
    label: "Admissions",
    logo: "admissions",
    status: "coming_soon",
  },
];

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/shell/use-navigation-guard", () => ({
  useNavigationGuard: () => ({ confirmNavigation }),
}));

vi.mock("./use-workspaces", () => ({
  useWorkspaces: () => ({ open, setOpen, workspaces }),
}));

import { WorkspacesDialog } from "./workspaces-dialog";

afterEach(() => {
  cleanup();
  push.mockClear();
  setOpen.mockClear();
  confirmNavigation.mockReturnValue(true);
  open = true;
});

describe("WorkspacesDialog", () => {
  it("navigates to Finance home and closes", () => {
    render(<WorkspacesDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Finance" }));
    expect(push).toHaveBeenCalledWith("/finances");
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("navigates to Studio home and closes", () => {
    render(<WorkspacesDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Studio" }));
    expect(push).toHaveBeenCalledWith("/studio");
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("does not close when the navigation guard blocks", () => {
    confirmNavigation.mockReturnValue(false);
    render(<WorkspacesDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Studio" }));
    expect(push).not.toHaveBeenCalled();
    expect(setOpen).not.toHaveBeenCalled();
  });

  it("does not expose coming-soon workspaces as links", () => {
    render(<WorkspacesDialog />);
    expect(screen.queryByRole("link", { name: "HR" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Admissions" })).toBeNull();
    expect(screen.getByText("Coming soon")).toBeTruthy();
  });

  it("has no search field", () => {
    render(<WorkspacesDialog />);
    expect(screen.queryByPlaceholderText("Search apps")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --run src/components/workspaces/workspaces-trigger.test.tsx src/components/workspaces/workspaces-dialog.test.tsx`

Expected: FAIL (modules not found)

- [ ] **Step 3: Implement hook, provider, trigger, dialog**

`src/components/workspaces/use-workspaces.ts`:

```ts
"use client";

import { createContext, useContext } from "react";
import type { WorkspaceCard } from "@/config/workspaces";

export type WorkspacesContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  workspaces: WorkspaceCard[];
};

export const WorkspacesContext = createContext<WorkspacesContextValue | null>(
  null,
);

export function useWorkspaces(): WorkspacesContextValue {
  const ctx = useContext(WorkspacesContext);
  if (!ctx) {
    throw new Error("useWorkspaces must be used within WorkspacesProvider");
  }
  return ctx;
}
```

`src/components/workspaces/workspaces-provider.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildVisibleWorkspaces } from "@/config/workspaces";
import { useFindPage } from "@/components/find-page/use-find-page";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { WorkspacesDialog } from "./workspaces-dialog";
import { WorkspacesContext } from "./use-workspaces";

export function WorkspacesProvider({ children }: { children: ReactNode }) {
  const { user } = useUser(false);
  const checker = usePermissions();
  const { tenant } = useTenant();
  const findPage = useFindPage();
  const [open, setOpenState] = useState(false);

  const workspaces = useMemo(
    () => buildVisibleWorkspaces({ checker, tenant, user }),
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
    () => ({ open, setOpen, workspaces }),
    [open, setOpen, workspaces],
  );

  return (
    <WorkspacesContext.Provider value={value}>
      {children}
      <WorkspacesDialog />
    </WorkspacesContext.Provider>
  );
}
```

`src/components/workspaces/workspaces-trigger.tsx`:

```tsx
"use client";

import { ViewGrid } from "iconoir-react";
import { Tooltip } from "@/components/primitives/tooltip";
import { useSidebar } from "@/components/shell/sidebar-context";
import { cn } from "@/lib/utils";
import { useWorkspaces } from "./use-workspaces";

export function WorkspacesTrigger() {
  const { workspaces, setOpen } = useWorkspaces();
  const { open, isMobile, recordMode, setOpenMobile } = useSidebar();
  const expanded = isMobile ? true : open && !recordMode;

  if (workspaces.length === 0) return null;

  const openWorkspaces = () => {
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
                aria-label="Workspaces"
                onClick={openWorkspaces}
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
              <Tooltip.Popup>Workspaces</Tooltip.Popup>
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
        aria-label="Workspaces"
        onClick={openWorkspaces}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium",
          "text-text-secondary transition-colors duration-[var(--duration-fast)]",
          "hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        <ViewGrid width={16} height={16} className="shrink-0" aria-hidden />
        <span className="truncate text-left">Workspaces</span>
      </button>
    </div>
  );
}
```

`src/components/workspaces/workspaces-dialog.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/primitives/dialog";
import { useNavigationGuard } from "@/components/shell/use-navigation-guard";
import { cn } from "@/lib/utils";
import { WorkspaceLogo } from "./workspace-logo";
import { useWorkspaces } from "./use-workspaces";

export function WorkspacesDialog() {
  const { open, setOpen, workspaces } = useWorkspaces();
  const router = useRouter();
  const { confirmNavigation } = useNavigationGuard();
  const enterable = useMemo(
    () => workspaces.filter((w) => w.status === "enterable" && w.homeHref),
    [workspaces],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!open) setSelectedIndex(0);
  }, [open]);

  const go = (href: string) => {
    if (!confirmNavigation(href)) return;
    router.push(href);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-2xl sm:max-w-2xl gap-5">
          <Dialog.Title>Workspaces</Dialog.Title>
          <Dialog.Description className="sr-only">
            Open a workspace
          </Dialog.Description>
          <div
            key={open ? "open" : "closed"}
            tabIndex={0}
            autoFocus
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                setSelectedIndex((i) =>
                  enterable.length === 0
                    ? 0
                    : Math.min(i + 1, enterable.length - 1),
                );
              } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && enterable[selectedIndex]?.homeHref) {
                e.preventDefault();
                go(enterable[selectedIndex].homeHref);
              }
            }}
          >
            {workspaces.map((ws) => {
              const comingSoon = ws.status === "coming_soon";
              const enterableIndex = enterable.findIndex((w) => w.id === ws.id);
              const selected =
                !comingSoon && enterableIndex === selectedIndex;
              const body = (
                <>
                  <WorkspaceLogo
                    name={ws.logo}
                    size={56}
                    aria-hidden
                    className={comingSoon ? "pointer-events-none" : undefined}
                  />
                  <span className="w-full truncate text-sm text-text-primary">
                    {ws.label}
                  </span>
                  {comingSoon ? (
                    <span className="text-xs text-text-muted">Coming soon</span>
                  ) : null}
                </>
              );
              const cardClass = cn(
                "flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 text-center",
                "transition-colors duration-[var(--duration-fast)]",
                comingSoon
                  ? "cursor-default opacity-50"
                  : "hover:bg-surface-hover",
                selected && "ring-2 ring-[var(--ring)]",
              );
              if (comingSoon) {
                return (
                  <div
                    key={ws.id}
                    className={cardClass}
                    aria-disabled="true"
                  >
                    {body}
                  </div>
                );
              }
              return (
                <Link
                  key={ws.id}
                  href={ws.homeHref!}
                  aria-label={ws.label}
                  onClick={(e) => {
                    e.preventDefault();
                    go(ws.homeHref!);
                  }}
                  className={cardClass}
                >
                  {body}
                </Link>
              );
            })}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Coming-soon cards use `pointer-events-none` on the logo so CSS `:hover` keyframes do not run. The grid `key={open ? "open" : "closed"}` remounts logos when the overlay opens.

On `WorkspaceLogo`, the dialog passes `aria-hidden` which overrides the default `aria-label={name}` via `{...rest}` — keep `aria-label` on the **Link** (`Finance` / `Studio`) so tests use `getByRole("link", { name: "Finance" })`. If `aria-hidden` on the SVG still exposes the name, set `aria-label={undefined}` on the logo in the card.

- [ ] **Step 4: Wire the shell and delete the launcher**

In `app-shell.tsx`: `AppLauncherProvider` → `WorkspacesProvider` from `@/components/workspaces/workspaces-provider`.

In `sidebar-rail.tsx` and `sidebar-mobile.tsx`: `AppLauncherTrigger` → `WorkspacesTrigger` from `@/components/workspaces/workspaces-trigger`.

Delete `src/config/app-launcher.ts`, `src/config/__tests__/app-launcher.test.ts`, and the whole `src/components/app-launcher/` directory.

Remove `noAppsMatch` from `empty-copy-presets.ts`.

- [ ] **Step 5: Run overlay tests**

Run: `npm run test:unit -- --run src/components/workspaces/workspaces-trigger.test.tsx src/components/workspaces/workspaces-dialog.test.tsx src/config/__tests__/workspaces.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/workspaces src/components/shell/app-shell.tsx src/components/shell/sidebar-rail.tsx src/components/shell/sidebar-mobile.tsx src/components/primitives/empty/empty-copy-presets.ts
git add -u src/config/app-launcher.ts src/config/__tests__/app-launcher.test.ts src/components/app-launcher
git commit -m "feat(workspaces): logo-card overlay replacing Applications tiles"
```

---

### Task 4: Studio record-nav + route matcher

**Files:**
- Create: `src/config/studio-record-nav.ts`
- Test: `src/config/__tests__/studio-record-nav.test.ts`
- Create: `src/lib/is-studio-record-route.ts`
- Test: `src/lib/is-studio-record-route.test.ts`

**Interfaces:**
- Consumes: `NavPermissionChecker` pattern (`canAny`)
- Produces:
  - `StudioRecordNavId = "documents" | "award_titles"`
  - `StudioRecordNavEntry = { id: StudioRecordNavId; label: string; href: string; requiredPermissions: string[] }`
  - `STUDIO_CONTEXT_PARENT = { label: "Documents"; href: "/studio" }`
  - `visibleStudioRecordNavEntries(canAny): StudioRecordNavEntry[]`
  - `studioRecordNavActive(entry, pathname): boolean`
  - `isStudioRecordRoute(pathname: string): boolean`

- [ ] **Step 1: Write failing tests**

`src/config/__tests__/studio-record-nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  visibleStudioRecordNavEntries,
  studioRecordNavActive,
} from "../studio-record-nav";

describe("visibleStudioRecordNavEntries", () => {
  it("omits Award titles without award_title.manage", () => {
    const entries = visibleStudioRecordNavEntries((codes) =>
      codes.includes("document_template.manage"),
    );
    expect(entries.map((e) => e.id)).toEqual(["documents"]);
  });

  it("omits Documents without document_template.manage", () => {
    const entries = visibleStudioRecordNavEntries((codes) =>
      codes.includes("award_title.manage"),
    );
    expect(entries.map((e) => e.id)).toEqual(["award_titles"]);
  });

  it("includes both when both permissions are held", () => {
    const entries = visibleStudioRecordNavEntries(() => true);
    expect(entries.map((e) => e.href)).toEqual(["/studio", "/award-titles"]);
  });
});

describe("studioRecordNavActive", () => {
  const docs = {
    id: "documents" as const,
    label: "Documents",
    href: "/studio",
    requiredPermissions: ["document_template.manage"],
  };
  const awards = {
    id: "award_titles" as const,
    label: "Award titles",
    href: "/award-titles",
    requiredPermissions: ["award_title.manage"],
  };

  it("marks Documents only on /studio", () => {
    expect(studioRecordNavActive(docs, "/studio")).toBe(true);
    expect(studioRecordNavActive(docs, "/award-titles")).toBe(false);
  });

  it("marks Award titles on nested award-title routes", () => {
    expect(studioRecordNavActive(awards, "/award-titles")).toBe(true);
    expect(studioRecordNavActive(awards, "/award-titles/3/edit")).toBe(true);
    expect(studioRecordNavActive(awards, "/studio")).toBe(false);
  });
});
```

`src/lib/is-studio-record-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isStudioRecordRoute } from "./is-studio-record-route";

describe("isStudioRecordRoute", () => {
  it("matches studio library and award-title routes", () => {
    expect(isStudioRecordRoute("/studio")).toBe(true);
    expect(isStudioRecordRoute("/award-titles")).toBe(true);
    expect(isStudioRecordRoute("/award-titles/create")).toBe(true);
    expect(isStudioRecordRoute("/award-titles/3/edit")).toBe(true);
  });

  it("rejects the fullscreen document editor and unrelated routes", () => {
    expect(isStudioRecordRoute("/templates/document/1")).toBe(false);
    expect(isStudioRecordRoute("/documents")).toBe(false);
    expect(isStudioRecordRoute("/finances")).toBe(false);
    expect(isStudioRecordRoute("/studiox")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --run src/config/__tests__/studio-record-nav.test.ts src/lib/is-studio-record-route.test.ts`

Expected: FAIL (modules not found)

- [ ] **Step 3: Implement**

`src/config/studio-record-nav.ts`:

```ts
export type StudioRecordNavId = "documents" | "award_titles";

export type StudioRecordNavEntry = {
  id: StudioRecordNavId;
  label: string;
  href: string;
  requiredPermissions: string[];
};

export const STUDIO_CONTEXT_PARENT = {
  label: "Documents",
  href: "/studio",
} as const;

export const STUDIO_RECORD_NAV_ENTRIES: StudioRecordNavEntry[] = [
  {
    id: "documents",
    label: "Documents",
    href: "/studio",
    requiredPermissions: ["document_template.manage"],
  },
  {
    id: "award_titles",
    label: "Award titles",
    href: "/award-titles",
    requiredPermissions: ["award_title.manage"],
  },
];

export function visibleStudioRecordNavEntries(
  canAny: (codes: string[]) => boolean,
): StudioRecordNavEntry[] {
  return STUDIO_RECORD_NAV_ENTRIES.filter((entry) =>
    canAny(entry.requiredPermissions),
  );
}

export function studioRecordNavActive(
  entry: StudioRecordNavEntry,
  pathname: string,
): boolean {
  if (entry.href === "/studio") {
    return pathname === "/studio";
  }
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}
```

`src/lib/is-studio-record-route.ts`:

```ts
const STUDIO_RECORD_ROUTE_PREFIXES = ["/studio", "/award-titles"] as const;

export function isStudioRecordRoute(pathname: string): boolean {
  return STUDIO_RECORD_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --run src/config/__tests__/studio-record-nav.test.ts src/lib/is-studio-record-route.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/studio-record-nav.ts src/config/__tests__/studio-record-nav.test.ts src/lib/is-studio-record-route.ts src/lib/is-studio-record-route.test.ts
git commit -m "feat(studio): record-nav entries and route matcher"
```

---

### Task 5: Studio context rail

**Files:**
- Create: `src/components/studio/record/studio-section-rail.tsx`
- Create: `src/components/studio/record/studio-mobile-sections.tsx`
- Create: `src/components/studio/record/studio-record-rail-provider.tsx`
- Create: `src/app/(internal)/studio/layout.tsx`
- Create: `src/app/(internal)/award-titles/layout.tsx`

**Interfaces:**
- Consumes: Task 4 exports; `useContextRail`; `transition` / `staggerList` / `staggerItem` from `@/lib/sj/motion`; `pageContentInsetClassName`
- Produces: `StudioSectionRail`, `StudioMobileSections`, `StudioRecordRailProvider`

- [ ] **Step 1: Implement `StudioSectionRail`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { NavArrowLeft } from "iconoir-react";
import {
  STUDIO_CONTEXT_PARENT,
  studioRecordNavActive,
  visibleStudioRecordNavEntries,
  type StudioRecordNavEntry,
} from "@/config/studio-record-nav";
import { transition, staggerItem, staggerList } from "@/lib/sj/motion";
import { playClick } from "@/lib/sound/click-sound";
import { cn } from "@/lib/utils";

function StudioNavLink({
  entry,
  pathname,
  onNavigate,
}: {
  entry: StudioRecordNavEntry;
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  const active = studioRecordNavActive(entry, pathname);
  return (
    <motion.div variants={staggerItem}>
      <Link
        href={entry.href}
        onClick={(e) => {
          if (!active) {
            playClick();
            if (!e.metaKey && !e.ctrlKey && e.button === 0) {
              onNavigate(entry.href);
            }
          }
        }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "block rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
          active
            ? "bg-surface-active font-medium text-text-primary"
            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        {entry.label}
      </Link>
    </motion.div>
  );
}

export function StudioSectionRail({
  pathname,
  canAny,
}: {
  pathname: string;
  canAny: (codes: string[]) => boolean;
}) {
  const router = useRouter();
  const entries = visibleStudioRecordNavEntries(canAny);
  const onHome = pathname === "/studio";

  return (
    <motion.aside
      initial={{ width: 0 }}
      animate={{ width: 208 }}
      exit={{ width: 0 }}
      transition={transition.panelWipe}
      className="sj-root relative h-full shrink-0 overflow-hidden bg-surface-sunken"
    >
      <motion.div
        variants={staggerList}
        initial="hidden"
        animate="show"
        className="flex h-full w-52 flex-col"
      >
        {!onHome ? (
          <motion.div variants={staggerItem}>
            <Link
              href={STUDIO_CONTEXT_PARENT.href}
              className="flex items-center gap-1.5 px-3 py-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              <NavArrowLeft width={15} height={15} aria-hidden />
              {STUDIO_CONTEXT_PARENT.label}
            </Link>
          </motion.div>
        ) : null}
        <motion.nav
          variants={staggerList}
          initial="hidden"
          animate="show"
          aria-label="Studio sections"
          className="flex flex-col gap-1 px-2 py-2 pb-4"
        >
          {entries.map((entry) => (
            <StudioNavLink
              key={entry.id}
              entry={entry}
              pathname={pathname}
              onNavigate={router.push}
            />
          ))}
        </motion.nav>
      </motion.div>
    </motion.aside>
  );
}
```

- [ ] **Step 2: Implement mobile picker + provider + layouts**

`src/components/studio/record/studio-mobile-sections.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  studioRecordNavActive,
  visibleStudioRecordNavEntries,
} from "@/config/studio-record-nav";
import { cn } from "@/lib/utils";

export function StudioMobileSections({
  canAny,
}: {
  canAny: (codes: string[]) => boolean;
}) {
  const pathname = usePathname();
  const entries = visibleStudioRecordNavEntries(canAny);

  if (!entries.length) {
    return null;
  }

  return (
    <nav
      aria-label="Studio sections"
      className="sj-root -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden"
    >
      {entries.map((entry) => {
        const active = studioRecordNavActive(entry, pathname);
        return (
          <Link
            key={entry.id}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-text-secondary hover:bg-surface-hover",
            )}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

`studio-record-rail-provider.tsx`:

```tsx
"use client";

import { StudioMobileSections } from "@/components/studio/record/studio-mobile-sections";
import { StudioSectionRail } from "@/components/studio/record/studio-section-rail";
import { useContextRail } from "@/components/shell/use-context-rail";
import { STUDIO_CONTEXT_PARENT } from "@/config/studio-record-nav";
import { pageContentInsetClassName } from "@/components/layout/page-container";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function StudioRecordRailProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canAny } = usePermissions();

  useContextRail(
    StudioSectionRail,
    () => ({ pathname, canAny }),
    STUDIO_CONTEXT_PARENT,
  );

  return (
    <>
      <div className={cn(pageContentInsetClassName(), "pt-4 md:hidden")}>
        <StudioMobileSections canAny={canAny} />
      </div>
      {children}
    </>
  );
}
```

`src/app/(internal)/studio/layout.tsx` and `src/app/(internal)/award-titles/layout.tsx`:

```tsx
"use client";

import { StudioRecordRailProvider } from "@/components/studio/record/studio-record-rail-provider";
import type { ReactNode } from "react";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <StudioRecordRailProvider>{children}</StudioRecordRailProvider>;
}
```

Use the same file body for award-titles layout (default export name can be `AwardTitlesLayout`).

Do **not** wrap `/templates/document`.

- [ ] **Step 3: Commit**

```bash
git add src/components/studio src/app/\(internal\)/studio/layout.tsx src/app/\(internal\)/award-titles/layout.tsx
git commit -m "feat(studio): context rail on studio and award-title routes"
```

---

### Task 6: `/studio` combined library; delete `/documents`

**Files:**
- Create: `src/app/(internal)/studio/page.tsx` (move from documents + award section)
- Test: `src/app/(internal)/studio/page.test.tsx`
- Delete: `src/app/(internal)/documents/`
- Modify: `src/config/route-permissions.ts`
- Modify: `src/config/__tests__/route-permissions.test.ts`

**Interfaces:**
- Consumes: existing `listDocumentTemplates` / `listAwardTitles` APIs; `usePermissions().canAny`
- Produces: `/studio` page; `ruleForPath("/studio")`; no `/documents` rule

- [ ] **Step 1: Write failing tests**

Update the documents assertion in `src/config/__tests__/route-permissions.test.ts`:

```ts
it("resolves studio library to either Studio permission and keeps the editor on document_template.manage", () => {
  expect(ruleForPath("/studio")?.anyOf).toEqual([
    "document_template.manage",
    "award_title.manage",
  ]);
  expect(ruleForPath("/documents")).toBeUndefined();
  expect(ruleForPath("/templates/document/1")?.anyOf).toEqual([
    "document_template.manage",
  ]);
});
```

Delete the old `"resolves document library and editor to document_template.manage"` test (replace, do not keep both).

Create `src/app/(internal)/studio/page.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const canAny = vi.fn();

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canAny }),
}));

vi.mock("@/components/shell/use-page-header", () => ({
  usePageHeader: () => {},
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: () => ({ data: [], isLoading: false, isError: false }),
    useMutation: () => ({ mutate: vi.fn(), isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/primitives", async () => {
  const actual = await vi.importActual<typeof import("@/components/primitives")>(
    "@/components/primitives",
  );
  return { ...actual, useToast: () => ({ add: vi.fn() }) };
});

import StudioPage from "./page";

afterEach(() => {
  cleanup();
  canAny.mockReset();
});

describe("Studio library page", () => {
  it("hides Award titles without award_title.manage", () => {
    canAny.mockImplementation((codes: string[]) =>
      codes.includes("document_template.manage"),
    );
    render(<StudioPage />);
    expect(screen.getByRole("heading", { name: "Documents" })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Award titles" }),
    ).toBeNull();
  });

  it("hides Documents without document_template.manage", () => {
    canAny.mockImplementation((codes: string[]) =>
      codes.includes("award_title.manage"),
    );
    render(<StudioPage />);
    expect(screen.getByRole("heading", { name: "Award titles" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Documents" })).toBeNull();
  });
});
```

If `useQuery` mocking is too coarse (both lists share it), split with `queryKey`: when `queryKey[0] === "award-titles"` vs `"document-templates"`. The assertions only need headings, so empty arrays are enough.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --run src/config/__tests__/route-permissions.test.ts src/app/\(internal\)/studio/page.test.tsx`

Expected: FAIL (`./page` missing and `/documents` still mapped)

- [ ] **Step 3: Move the library and add Award titles**

`git mv src/app/(internal)/documents/page.tsx src/app/(internal)/studio/page.tsx`

Then edit the moved page:

1. Import `usePermissions` and `listAwardTitles` / award table helpers from `src/app/(internal)/award-titles/page.tsx` (`originLabel`, `formatAwardFamily`). Do not delete the award-titles **page** — that route stays.
2. `const { canAny } = usePermissions();`
3. `const canDocuments = canAny(["document_template.manage"]);`
4. `const canAwards = canAny(["award_title.manage"]);`
5. Change the header breadcrumb from `Documents` to `Studio`.
6. Header actions: render **New** only if `canDocuments`; add a **Create award title** `Link` to `/award-titles/create` when `canAwards`.
7. Wrap the org/my template sections + new-document dialog in `canDocuments`.
8. When `canAwards`, render an **Award titles** `<h2>` and the same table markup as `award-titles/page.tsx` (Name / Family / Pinned / Origin / Retired / Edit), using a `useQuery` with `queryKey: ["award-titles"]` and `listAwardTitles`.
9. Remove `src/app/(internal)/documents/` (empty dir).
10. In `route-permissions.ts` replace `{ prefix: "/documents", anyOf: ["document_template.manage"] }` with `{ prefix: "/studio", anyOf: ["document_template.manage", "award_title.manage"] }`.

Award titles `<h2>` must be `Award titles`. Documents block `<h2>` for the org/my sections stay as they are; add a wrapping section heading **Documents** (`<h2>Documents</h2>`) around those two tables so the permission tests can query it. Example:

```tsx
{canDocuments ? (
  <section className="space-y-8">
    <h2 className="font-serif text-lg text-text-primary">Documents</h2>
    <TemplateSection title="Org templates" /* existing props */ />
    <TemplateSection title="My templates" /* existing props */ />
    {/* existing New dialog */}
  </section>
) : null}
{canAwards ? (
  <section className="space-y-3">
    <h2 className="font-serif text-lg text-text-primary">Award titles</h2>
    {/* table from award-titles/page.tsx */}
  </section>
) : null}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- --run src/config/__tests__/route-permissions.test.ts src/app/\(internal\)/studio/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/\(internal\)/studio src/config/route-permissions.ts src/config/__tests__/route-permissions.test.ts
git add -u src/app/\(internal\)/documents
git commit -m "feat(studio): combined library at /studio; remove /documents"
```

---

### Task 7: Editor Back, Find dock, leftover `/documents`

**Files:**
- Modify: `src/components/document-editor/document-editor.tsx`
- Create: `src/components/document-editor/document-editor-back.test.ts`
- Modify: `src/components/find-page/find-page-dialog.tsx`

**Interfaces:**
- Consumes: `isStudioRecordRoute` from Task 4
- Produces: `goBack` → `/studio`; find dock hides on Studio record routes

- [ ] **Step 1: Write the failing Back contract test**

Create `src/components/document-editor/document-editor-back.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("document editor Back href", () => {
  it("routes Back to /studio, not /documents", () => {
    const src = readFileSync(
      "src/components/document-editor/document-editor.tsx",
      "utf8",
    );
    expect(src).toContain('router.push("/studio")');
    expect(src).not.toContain('router.push("/documents")');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --run src/components/document-editor/document-editor-back.test.ts`

Expected: FAIL (`router.push("/studio")` missing)

- [ ] **Step 3: Point Back at `/studio` and hide the Find dock**

In `document-editor.tsx`, change `goBack` to `router.push("/studio")`.

In `find-page-dialog.tsx` import `isStudioRecordRoute` and extend `hideDock`:

```ts
const hideDock =
  (recordMode &&
    (isCourseRecordRoute(pathname) ||
      isFinanceRecordRoute(pathname) ||
      isStudioRecordRoute(pathname))) ||
  overlayActive;
```

Grep the FE tree for `"/documents"` (quotes). Update any leftover hrefs to `"/studio"`. Do not add a Next.js redirect.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- --run src/components/document-editor/document-editor-back.test.ts src/config/__tests__/workspaces.test.ts src/components/workspaces/workspaces-dialog.test.tsx src/config/__tests__/studio-record-nav.test.ts src/app/\(internal\)/studio/page.test.tsx src/config/__tests__/route-permissions.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/document-editor/document-editor.tsx src/components/document-editor/document-editor-back.test.ts src/components/find-page/find-page-dialog.tsx
git commit -m "fix(studio): editor Back and Find dock use studio workspace"
```

---

## Manual smoke (after all tasks)

1. User with finance + studio permissions: Workspaces under the school logo → four cards; Finance and Studio clickable; HR/Admissions say Coming soon and do not navigate.
2. Click Finance → `/finances`, finance rail, overlay closed. Logos replay on next open.
3. Click Studio → `/studio`, Studio rail (Documents + Award titles). Documents and Award titles sections both visible.
4. Award-titles-only user: Studio card present, Finance omitted; `/studio` shows Award titles only; Documents rail item hidden.
5. Teacher with `course.view` only: Workspaces control absent.
6. `/documents` 404. Document editor Back returns to `/studio`. Fullscreen document editor has no Studio rail.
7. `prefers-reduced-motion: reduce`: logos static; Admissions door visible without slab.
