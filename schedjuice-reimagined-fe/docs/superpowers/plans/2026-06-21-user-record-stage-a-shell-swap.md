# User Record P2b — Stage A: Contextual Swap + Record Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Turn `/users/[id]` into the new-design record shell — entering it collapses the global rail to its icon rail and reveals a record **section rail**; leaving restores global nav. Identity strip + `⋯` actions + section switching land here. Existing tab displays are reused (no inline editing yet; `/edit` still present — those are Stages B and C).

**Architecture:** Extend the P2a shell with a reusable **context-rail slot** (`useContextRail`) and a `recordMode` flag that forces the global rail to icon-only. A nested `users/[id]/layout.tsx` registers the section rail and owns the active section via a `?section=` URL param (`nuqs`). Section content reuses the current page's tab components, moved into section wrappers. Motion via `src/lib/sj/motion.ts`.

**Tech Stack:** Next.js 15 App Router, React 19, Base UI primitives (`src/components/primitives/*`), Iconoir, `nuqs`, `motion/react` + `src/lib/sj/motion.ts`, TanStack Query v4.

**Spec:** `docs/superpowers/specs/2026-06-21-user-record-inline-design.md` (Stage A = §10 stage 1).

---

## File Structure

**Modify (shell):**
- `src/components/shell/sidebar-context.tsx` — add `contextRail`, `setContextRail`, `recordMode`
- `src/components/shell/app-shell.tsx` — render the context-rail slot beside the global rail
- `src/components/shell/sidebar-rail.tsx` — collapse when `recordMode`
- `src/components/shell/tenant-header.tsx`, `sidebar-nav.tsx`, `account-menu.tsx` — `recordMode`-aware `expanded`

**Create (shell):**
- `src/components/shell/use-context-rail.ts` — register/clear a rail node

**Create (record):**
- `src/components/record/record-sections.ts` — section definitions + visibility predicates
- `src/components/record/record-section-rail.tsx` — back link + identity block + section list (the registered node)
- `src/components/record/identity-strip.tsx` — avatar, name, email, role pill, `⋯` menu
- `src/components/record/record-actions-menu.tsx` — destructive `⋯` actions (reuse existing mutations/dialogs)
- `src/components/record/record-mobile-sections.tsx` — in-content section selector (mobile)
- `src/components/record/use-record-section.ts` — `?section=` state via `nuqs`

**Create / replace (route):**
- `src/app/(internal)/users/[id]/layout.tsx` — loads user, registers the section rail, provides record context
- `src/app/(internal)/users/[id]/page.tsx` — **rewritten** to identity strip + active-section content
- `src/components/record/sections/record-overview.tsx`, `record-academic.tsx`, `record-finance.tsx`, `record-records.tsx` — section wrappers embedding existing displays

**Unchanged this stage:** `/users/[id]/edit/**` (removed in Stage C), all editing remains there.

---

## Task 1: Extend the sidebar context with a context-rail slot

**Files:** Modify `src/components/shell/sidebar-context.tsx`; Create `src/components/shell/use-context-rail.ts`

- [ ] **Step 1: Add contextRail + recordMode to the context**

Replace the `SidebarState` type and provider body in `sidebar-context.tsx`:

```tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
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
  /** A record-scoped rail registered by a nested layout (P2b). Null = global nav. */
  contextRail: ReactNode | null;
  setContextRail: (node: ReactNode | null) => void;
  /** True when a context rail is active — collapses the global rail to icons. */
  recordMode: boolean;
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
  const [contextRail, setContextRail] = useState<ReactNode | null>(null);

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
    () => ({
      open, setOpen, openMobile, setOpenMobile, isMobile, toggle,
      contextRail, setContextRail, recordMode: contextRail !== null,
    }),
    [open, setOpen, openMobile, isMobile, toggle, contextRail],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}
```

- [ ] **Step 2: Create the registration hook**

`src/components/shell/use-context-rail.ts`:
```ts
"use client";
import { useEffect, type ReactNode } from "react";
import { useSidebar } from "./sidebar-context";

/** Register a record-scoped rail for the duration the calling component is mounted. */
export function useContextRail(node: ReactNode) {
  const { setContextRail } = useSidebar();
  useEffect(() => {
    setContextRail(node);
    return () => setContextRail(null);
  }, [node, setContextRail]);
}
```

- [ ] **Step 3: Build**

Run: `NEXT_PUBLIC_BASE_API_URL=http://localhost:8000/api/v1 npm run build` (or rely on the dev server).
Expected: compiles; no consumers broken (new fields are additive).

- [ ] **Step 4: Commit**
```bash
git add src/components/shell/sidebar-context.tsx src/components/shell/use-context-rail.ts
git commit -m "feat(shell): context-rail slot + recordMode on sidebar context"
```

---

## Task 2: Render the context-rail slot; collapse the global rail in record mode

**Files:** Modify `src/components/shell/app-shell.tsx`, `sidebar-rail.tsx`, `tenant-header.tsx`, `sidebar-nav.tsx`, `account-menu.tsx`

- [ ] **Step 1: app-shell renders the registered rail beside the global rail**

In `app-shell.tsx`, read `contextRail` and render it after `<SidebarRail/>` (desktop only; hidden in fullscreen). Replace the rail region:

```tsx
function Shell({ children }: { children: React.ReactNode }) {
  const { effectiveFullscreen } = useFullscreen();
  const { contextRail } = useSidebar();
  return (
    <div className="sj-root flex h-svh w-full overflow-hidden bg-surface text-text-primary">
      {/* ...skip link unchanged... */}

      {!effectiveFullscreen ? <SidebarRail /> : null}
      {!effectiveFullscreen && contextRail ? (
        <div className="hidden md:flex">{contextRail}</div>
      ) : null}
      <SidebarMobile />

      {/* ...content column unchanged... */}
    </div>
  );
}
```

Add `import { useSidebar } from "./sidebar-context";` and note `Shell` is already inside `SidebarProvider` (it is — `AppShell` wraps `Shell` in the provider), so `useSidebar()` is valid here.

- [ ] **Step 2: Global rail collapses in record mode**

In `sidebar-rail.tsx`, derive expansion from `open && !recordMode`:
```tsx
export function SidebarRail() {
  const { open, recordMode } = useSidebar();
  const expanded = open && !recordMode;
  return (
    <aside
      data-state={expanded ? "expanded" : "collapsed"}
      className={cn(
        "sj-root relative hidden h-svh shrink-0 flex-col bg-surface md:flex",
        "transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        expanded ? "w-64" : "w-[4rem]",
      )}
    >
      {/* ...unchanged body... */}
    </aside>
  );
}
```

- [ ] **Step 3: Rail child components treat record mode as collapsed (desktop only)**

In `tenant-header.tsx`, `sidebar-nav.tsx`, and `account-menu.tsx`, each currently computes `const expanded = open || isMobile;`. Change each to:
```tsx
const { open, isMobile, recordMode } = useSidebar();
const expanded = isMobile ? true : open && !recordMode;
```
(Mobile drawer always expanded; desktop rail collapses in record mode. `sidebar-nav.tsx` keeps using `setOpen` for the collapsed-section click behavior — leave that untouched.)

- [ ] **Step 4: Verify in dev**

Run the dev server. Add a throwaway probe (temporary) is unnecessary — record mode is exercised in Task 6. For now confirm `npm run build` compiles.
Expected: build OK; global rail still works normally (recordMode is false everywhere until Task 5/6).

- [ ] **Step 5: Commit**
```bash
git add src/components/shell/app-shell.tsx src/components/shell/sidebar-rail.tsx src/components/shell/tenant-header.tsx src/components/shell/sidebar-nav.tsx src/components/shell/account-menu.tsx
git commit -m "feat(shell): render context rail + collapse global rail in record mode"
```

---

## Task 3: Section definitions + `?section=` state

**Files:** Create `src/components/record/record-sections.ts`, `src/components/record/use-record-section.ts`

- [ ] **Step 1: Section model + visibility**

`src/components/record/record-sections.ts`:
```ts
import type { accountType } from "@/types/user";
import { isStudentOnlyUser } from "@/helpers/authorization";

export type RecordSectionId = "overview" | "academic" | "finance" | "records";

export type RecordSection = {
  id: RecordSectionId;
  label: string;
  /** Whether this section shows for the given subject. */
  visible: (subject: accountType) => boolean;
};

export const RECORD_SECTIONS: RecordSection[] = [
  { id: "overview", label: "Overview", visible: () => true },
  { id: "academic", label: "Academic", visible: () => true },
  { id: "finance", label: "Finance", visible: (s) => !isStudentOnlyUser(s) || true }, // payment info shows for students too
  { id: "records", label: "Records", visible: () => true },
];

export function visibleSections(subject: accountType): RecordSection[] {
  return RECORD_SECTIONS.filter((s) => s.visible(subject));
}

export const DEFAULT_SECTION: RecordSectionId = "overview";
```

> Note: refine `visible` predicates in later stages as sections gain staff/teacher-only content. For Stage A all four show; Finance keeps payment-info which students can have.

- [ ] **Step 2: `?section=` hook**

`src/components/record/use-record-section.ts`:
```ts
"use client";
import { useQueryState } from "nuqs";
import { DEFAULT_SECTION, type RecordSectionId } from "./record-sections";

const VALID: RecordSectionId[] = ["overview", "academic", "finance", "records"];

export function useRecordSection() {
  const [raw, setRaw] = useQueryState("section", { defaultValue: DEFAULT_SECTION });
  const section = (VALID as string[]).includes(raw ?? "")
    ? (raw as RecordSectionId)
    : DEFAULT_SECTION;
  return { section, setSection: (s: RecordSectionId) => setRaw(s) };
}
```

> Confirm `nuqs` `useQueryState` signature against the installed version (`^1.17.0`); if the app already wraps pages in `NuqsAdapter`/`Suspense`, none needed here (App Router supports `nuqs` directly). The app already uses `nuqs` (e.g. fullscreen) so the provider setup is in place.

- [ ] **Step 3: Build** — `npm run build`. Expected: compiles.

- [ ] **Step 4: Commit**
```bash
git add src/components/record/record-sections.ts src/components/record/use-record-section.ts
git commit -m "feat(record): section model + ?section= state"
```

---

## Task 4: Identity strip + destructive `⋯` menu

**Files:** Create `src/components/record/identity-strip.tsx`, `src/components/record/record-actions-menu.tsx`

- [ ] **Step 1: Destructive actions menu (reuse existing mutations/dialogs)**

`record-actions-menu.tsx` — port the actions currently on the edit page (disable/enable, resign, re-send welcome, delete) into a Base UI `Menu`. Reuse existing endpoints: `updateEntity("users", id, { is_active })`, `resignUser`/`resendUserWelcomeEmail` (`@/app/client-api/auth`), and the existing `UserResignDialog`. Gate with `hasAdminCredentials` / `isSuperAdmin` / `isStudentOnlyUser` exactly as the edit page does today.

```tsx
"use client";
import { useState } from "react";
import { MoreHoriz } from "iconoir-react";
import { Menu } from "@/components/primitives/menu";
import { AlertDialog } from "@/components/primitives/alert-dialog";
import { Button } from "@/components/primitives/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateEntity } from "@/app/client-api/utils";
import { resendUserWelcomeEmail } from "@/app/client-api/auth";
import { useToast } from "@/components/ui/use-toast";
import { UserResignDialog } from "@/components/users/user-resign-dialog";
import { hasAdminCredentials, isSuperAdmin, isStudentOnlyUser } from "@/helpers/authorization";
import type { accountType } from "@/types/user";

export function RecordActionsMenu({
  subject, viewer, recordQueryKey,
}: { subject: accountType; viewer: accountType; recordQueryKey: unknown[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<null | "disable" | "welcome">(null);
  const [resignOpen, setResignOpen] = useState(false);

  const isAdmin = hasAdminCredentials(viewer);
  const canWelcome = isSuperAdmin(viewer) && !!subject.communication_email;
  const canResign = isAdmin && subject.is_active !== false && !isStudentOnlyUser(subject) && !subject.resigned_at;

  const setActive = useMutation({
    mutationFn: (active: boolean) => updateEntity("users", String(subject.id), { is_active: active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: recordQueryKey }); toast({ title: "Updated" }); },
    onError: () => toast({ variant: "destructive", title: "Could not update user" }),
  });
  const welcome = useMutation({
    mutationFn: () => resendUserWelcomeEmail(String(subject.id)),
    onSuccess: () => toast({ title: "Welcome email sent" }),
    onError: () => toast({ variant: "destructive", title: "Could not send email" }),
  });

  if (!isAdmin) return null;

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          className="inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          aria-label="More actions"
        >
          <MoreHoriz width={18} height={18} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end">
            <Menu.Popup>
              {canWelcome ? <Menu.Item onClick={() => setConfirm("welcome")}>Re-send welcome email</Menu.Item> : null}
              {canResign ? <Menu.Item onClick={() => setResignOpen(true)}>Mark as resigned</Menu.Item> : null}
              <Menu.Separator />
              {subject.is_active === false ? (
                <Menu.Item onClick={() => setActive.mutate(true)}>Re-enable user</Menu.Item>
              ) : (
                <Menu.Item
                  onClick={() => setConfirm("disable")}
                  className="text-danger data-[highlighted]:bg-danger data-[highlighted]:text-white"
                >
                  Disable user
                </Menu.Item>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <AlertDialog.Root open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>{confirm === "disable" ? "Disable this user?" : "Re-send welcome email?"}</AlertDialog.Title>
            <AlertDialog.Description>
              {confirm === "disable" ? "They will lose access until re-enabled." : "A new welcome email will be sent."}
            </AlertDialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button
                variant={confirm === "disable" ? "danger" : "primary"}
                onClick={() => {
                  if (confirm === "disable") setActive.mutate(false);
                  else welcome.mutate();
                  setConfirm(null);
                }}
              >
                Confirm
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <UserResignDialog open={resignOpen} onOpenChange={setResignOpen} userId={subject.id} />
    </>
  );
}
```

> Verify `UserResignDialog` props (`open`/`onOpenChange`/`userId`) against `src/components/users/user-resign-dialog.tsx`; adapt prop names if different. Delete-user moves here in Stage C (with the `/edit` removal) — omit for Stage A or add a `DeleteZone`-equivalent confirm if trivial.

- [ ] **Step 2: Identity strip**

`identity-strip.tsx`:
```tsx
"use client";
import { Avatar } from "@/components/primitives/avatar";
import { maskEmailLocalPart } from "@/helpers/mask-email-local";
import { RecordActionsMenu } from "./record-actions-menu";
import type { accountType } from "@/types/user";

export function IdentityStrip({
  subject, viewer, recordQueryKey,
}: { subject: accountType; viewer: accountType; recordQueryKey: unknown[] }) {
  return (
    <div className="flex items-start gap-4">
      <Avatar src={subject.profile_image} name={subject.name ?? "?"} className="size-16" />
      <div className="min-w-0 flex-1">
        <h1 className="font-serif text-3xl text-text-primary">{subject.name}</h1>
        <p className="truncate text-text-muted">{maskEmailLocalPart(subject.email)}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(subject.roles ?? []).map((r) => (
            <span key={r} className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-medium text-brand">{r}</span>
          ))}
          {subject.resigned_at ? <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs text-danger">Resigned</span> : null}
          {subject.is_active === false ? <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs text-danger">Disabled</span> : null}
        </div>
      </div>
      <RecordActionsMenu subject={subject} viewer={viewer} recordQueryKey={recordQueryKey} />
    </div>
  );
}
```

- [ ] **Step 3: Build** — `npm run build`. Fix any prop mismatches surfaced (resign dialog, auth client names).

- [ ] **Step 4: Commit**
```bash
git add src/components/record/identity-strip.tsx src/components/record/record-actions-menu.tsx
git commit -m "feat(record): identity strip + destructive actions menu"
```

---

## Task 5: Record section rail + mobile selector

**Files:** Create `src/components/record/record-section-rail.tsx`, `src/components/record/record-mobile-sections.tsx`

- [ ] **Step 1: Section rail (the registered node) — uses motion.ts**

`record-section-rail.tsx`:
```tsx
"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { NavArrowLeft } from "iconoir-react";
import { Avatar } from "@/components/primitives/avatar";
import { transition, staggerList, staggerItem } from "@/lib/sj/motion";
import { visibleSections, type RecordSectionId } from "./record-sections";
import { cn } from "@/lib/utils";
import type { accountType } from "@/types/user";

export function RecordSectionRail({
  subject, section, onSelect,
}: { subject: accountType; section: RecordSectionId; onSelect: (s: RecordSectionId) => void }) {
  return (
    <motion.aside
      initial={{ width: 0 }}
      animate={{ width: 208 }}
      exit={{ width: 0 }}
      transition={transition.panelWipe}
      className="sj-root relative h-svh shrink-0 overflow-hidden border-l border-border bg-surface"
    >
      <motion.div variants={staggerList} initial="hidden" animate="show" className="flex h-full w-52 flex-col">
        <motion.div variants={staggerItem}>
          <Link href="/users" className="flex items-center gap-1.5 px-3 py-3 text-sm text-text-secondary hover:text-text-primary">
            <NavArrowLeft width={15} height={15} /> Users
          </Link>
        </motion.div>
        <motion.div variants={staggerItem} className="flex items-center gap-2.5 border-b border-border px-3 pb-3">
          <Avatar src={subject.profile_image} name={subject.name ?? "?"} className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{subject.name}</p>
            <p className="truncate text-xs text-text-muted">{(subject.roles ?? [])[0] ?? ""}</p>
          </div>
        </motion.div>
        <nav className="flex flex-col gap-0.5 px-2 py-2">
          {visibleSections(subject).map((s) => (
            <motion.button
              key={s.id}
              variants={staggerItem}
              onClick={() => onSelect(s.id)}
              aria-current={section === s.id ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-left text-sm transition-colors duration-[var(--duration-fast)]",
                section === s.id
                  ? "bg-surface-active font-medium text-text-primary"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {s.label}
            </motion.button>
          ))}
        </nav>
      </motion.div>
    </motion.aside>
  );
}
```

- [ ] **Step 2: Mobile section selector (in-content)**

`record-mobile-sections.tsx`:
```tsx
"use client";
import { visibleSections, type RecordSectionId } from "./record-sections";
import { cn } from "@/lib/utils";
import type { accountType } from "@/types/user";

export function RecordMobileSections({
  subject, section, onSelect,
}: { subject: accountType; section: RecordSectionId; onSelect: (s: RecordSectionId) => void }) {
  return (
    <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden">
      {visibleSections(subject).map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          aria-current={section === s.id ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-sm",
            section === s.id ? "bg-accent text-accent-foreground" : "text-text-secondary",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build** — `npm run build`. Expected: compiles.

- [ ] **Step 4: Commit**
```bash
git add src/components/record/record-section-rail.tsx src/components/record/record-mobile-sections.tsx
git commit -m "feat(record): section rail (motion) + mobile section selector"
```

---

## Task 6: Section wrappers — embed existing displays

**Files:** Create `src/components/record/sections/{record-overview,record-academic,record-finance,record-records}.tsx`

The current page (`src/app/(internal)/users/[id]/page.tsx`) renders each tab's content inside a `<TabsContent value="...">`. **Move** each tab's existing JSX (and the queries/state it needs) into the matching wrapper. Do not redesign the inner components this stage — reuse them as-is. Mapping:

| Wrapper | Move from current tabs | Key components (reused) |
| --- | --- | --- |
| `record-overview.tsx` | "About" + stats | `UserProfileStats`, `AboutSection`, `FormConfigDetail` (read-only) |
| `record-academic.tsx` | "Courses" + "Schedule" + "Course history" + "Assessments" | `DataTable` (user-courses), `UserCalendar`, `CourseHistory`, `UserProfileAssessments` |
| `record-finance.tsx` | "Payment Info" | `UserPaymentInfoTab` |
| `record-records.tsx` | remaining custom groups (Stage A: render `FormConfigDetail` groups not already shown in Overview, or a "coming in inline editing" note if none) | `FormConfigDetail` |

- [ ] **Step 1: Create each wrapper** as a client component taking `{ subject, viewer, tenant }` and rendering the moved JSX. Each wrapper owns the queries that the corresponding tab used (lift them from `page.tsx`). Reproduce the exact query keys/expand and props from `page.tsx` — read that file and carry them over verbatim so behavior is unchanged.

> Because the source blocks live in a 742-line file, this step is a faithful **extract-and-move**, not a redesign. Preserve: query keys, `expand` arrays, `getExcludedColumns` redaction, conditional rendering (e.g. Payment Info only for non-student-only), and the `showAllCourses` filter.

- [ ] **Step 2: Build** — `npm run build`. Expected: compiles; wrappers self-contained.

- [ ] **Step 3: Commit**
```bash
git add src/components/record/sections
git commit -m "feat(record): section wrappers embedding existing displays"
```

---

## Task 7: Record layout + page rewrite (wire the swap)

**Files:** Create `src/app/(internal)/users/[id]/layout.tsx`; Rewrite `src/app/(internal)/users/[id]/page.tsx`

- [ ] **Step 1: Layout registers the section rail + provides record context**

`src/app/(internal)/users/[id]/layout.tsx` (client) loads the subject (reuse the existing `fetchEntity` query + `USER_PROFILE_EXPAND` from the old page), holds the active section via `useRecordSection`, registers `<RecordSectionRail/>` through `useContextRail`, and renders children within a record context that exposes `{ subject, viewer, tenant, section, setSection }`.

```tsx
"use client";
import { createContext, useContext, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchEntity } from "@/app/client-api/utils";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { useContextRail } from "@/components/shell/use-context-rail";
import { RecordSectionRail } from "@/components/record/record-section-rail";
import { useRecordSection } from "@/components/record/use-record-section";
import type { accountType } from "@/types/user";

const EXPAND = ["user_courses", "user_courses.assigned_as_role", "user_courses.course", "visibility", "user_events"];

type RecordCtx = {
  subject: accountType; viewer: accountType | null; tenant: ReturnType<typeof useTenant>["tenant"];
  recordQueryKey: unknown[];
};
const RecordContext = createContext<RecordCtx | null>(null);
export const useRecord = () => {
  const c = useContext(RecordContext);
  if (!c) throw new Error("useRecord must be used within the record layout");
  return c;
};

export default function UserRecordLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const { user: viewer } = useUser();
  const { tenant } = useTenant();
  const { section, setSection } = useRecordSection();
  const recordQueryKey = useMemo(() => [`getUser${id}`, ...EXPAND], [id]);

  const { data: subject } = useQuery({
    queryKey: recordQueryKey,
    queryFn: () => fetchEntity("users", id, EXPAND),
  });

  const rail = subject ? (
    <RecordSectionRail subject={subject} section={section} onSelect={setSection} />
  ) : null;
  useContextRail(rail);

  const value = useMemo(
    () => (subject ? { subject, viewer, tenant, recordQueryKey } : null),
    [subject, viewer, tenant, recordQueryKey],
  );

  if (!value) return <div className="p-6 text-text-muted">Loading…</div>;
  return <RecordContext.Provider value={value}>{children}</RecordContext.Provider>;
}
```

> Confirm `fetchEntity(entity, id, expand)` signature and the exact `expand`/query key the old page used; carry them over verbatim so caching matches. If the old page used a templated key like `` `getUser${id}` `` plus expand, reuse it so existing invalidations keep working.

- [ ] **Step 2: Rewrite the page to identity strip + active section**

`src/app/(internal)/users/[id]/page.tsx`:
```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";
import { crossfade } from "@/lib/sj/motion";
import { useRecord } from "./layout";
import { useRecordSection } from "@/components/record/use-record-section";
import { IdentityStrip } from "@/components/record/identity-strip";
import { RecordMobileSections } from "@/components/record/record-mobile-sections";
import { RecordOverview } from "@/components/record/sections/record-overview";
import { RecordAcademic } from "@/components/record/sections/record-academic";
import { RecordFinance } from "@/components/record/sections/record-finance";
import { RecordRecords } from "@/components/record/sections/record-records";

export default function UserRecordPage() {
  const { subject, viewer, tenant, recordQueryKey } = useRecord();
  const { section, setSection } = useRecordSection();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-5 md:p-8">
      <IdentityStrip subject={subject} viewer={viewer!} recordQueryKey={recordQueryKey} />
      <RecordMobileSections subject={subject} section={section} onSelect={setSection} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={section} variants={crossfade} initial="initial" animate="animate" exit="exit">
          {section === "overview" && <RecordOverview subject={subject} viewer={viewer!} tenant={tenant} />}
          {section === "academic" && <RecordAcademic subject={subject} viewer={viewer!} tenant={tenant} />}
          {section === "finance" && <RecordFinance subject={subject} viewer={viewer!} tenant={tenant} />}
          {section === "records" && <RecordRecords subject={subject} viewer={viewer!} tenant={tenant} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

> The old page's auth gate (students viewing others → redirect) must be preserved — carry that logic into the layout (before rendering children) so behavior is unchanged.

- [ ] **Step 3: Build + dev verify**

Run dev; log in; open `/users/<id>`.
Expected: global rail collapses to icons, the section rail wipes in (motion), identity strip shows, sections switch via rail and `?section=` updates the URL; leaving `/users/[id]` restores global nav. Mobile: section selector shows in-content, global rail hidden, drawer nav intact.

- [ ] **Step 4: Commit**
```bash
git add "src/app/(internal)/users/[id]/layout.tsx" "src/app/(internal)/users/[id]/page.tsx"
git commit -m "feat(record): record layout + page wiring the contextual swap"
```

---

## Task 8: Validation gate

- [ ] **Step 1: Behavior** — verify: swap in/out + reduced-motion fallback; global nav reachable while in a record; `?section=` deep-links to the right section; student vs staff records show appropriate sections; existing displays render identically (courses/schedule/assessments/payment info); destructive `⋯` actions work; masthead/edit links still function (edit page still exists this stage).
- [ ] **Step 2: Regressions** — open a non-record route: global rail behaves exactly as before (recordMode false). Fullscreen page still hides rails.
- [ ] **Step 3: Gate** — `npm run lint && NEXT_PUBLIC_BASE_API_URL=http://localhost:8000/api/v1 npm run build && npm run test:unit -- --run`. Expected: pass (no new failures vs the pre-existing unrelated ones).
- [ ] **Step 4: Commit** any fixes.

---

## Self-Review (plan author)

**Spec coverage (Stage A scope):** swap mechanism → Tasks 1–2, 5, 7; section IA → Task 3, 6; identity strip + `⋯` → Task 4; reuse displays → Task 6; motion → Tasks 5, 7; access/visibility carried via reused components → Task 6. Inline editing + `/edit` removal correctly deferred (Stages B/C).

**Type consistency:** `useSidebar()` now returns `{ ..., contextRail, setContextRail, recordMode }` (Task 1), consumed in Tasks 2, app-shell, rail children. `useContextRail(node)` (Task 1) used in Task 7. `RecordSectionId` + `visibleSections` (Task 3) used in Tasks 5, 7. `useRecordSection` (Task 3) used in Tasks 7. `useRecord()`/`RecordContext` (Task 7) used by page + sections.

**Flagged for implementation (concrete, verify against source — not placeholders):** `UserResignDialog` prop names; `resendUserWelcomeEmail` import path; the old page's exact query key/`expand` and auth-gate logic (carry over verbatim); `nuqs` `useQueryState` usage in this version; whether Delete-user belongs in Stage A `⋯` or waits for Stage C.

---

## Execution Handoff

Plan complete and saved. Stage B (Overview inline editing) and Stage C (remaining editors + remove `/edit`) get their own plans after Stage A lands. Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between.
2. **Inline Execution** — execute here with checkpoints.
