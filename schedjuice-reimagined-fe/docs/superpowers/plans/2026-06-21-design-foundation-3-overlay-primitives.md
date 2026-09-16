# Design Foundation — Plan 3: Overlay Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the overlay primitives on Base UI with Schedjuice tokens — `Dialog`, `AlertDialog`, `Sheet`, `Popover`, `Tooltip`, `Menu`, `Toast` — and demo them in the `/components` gallery.

**Architecture:** Each overlay is a set of pre-styled Base UI parts exported as a namespace object (e.g. `Dialog.Root/Backdrop/Popup/Title/Description/Close`), styled with semantic tokens so they theme via `.sj-root`. Backdrops use `--overlay-scrim`; popups use `--surface-elevated` + `--border` + `--shadow-*`; enter/exit motion uses `data-[starting-style]`/`data-[ending-style]` with `--ease-*`/`--duration-*`. `Sheet` is a side-anchored `Dialog`. `Toast` wraps Base UI's `Toast.Provider`/`useToastManager`. Modal/sheet titles are mandatory for screen readers (DESIGN.md §13).

**Tech Stack:** Next.js 15, React 19, Tailwind v4, TypeScript, `@base-ui/react`, `iconoir-react`, `cn()`.

**Spec:** `docs/superpowers/specs/2026-06-21-design-foundation-phase-1.md` (§10). **Design source:** `DESIGN.md` §10, §13 (a11y: titles, focus).
**Depends on:** Plan 1 (tokens, shell), Plan 2 (`Button`, barrel `index.ts`).

> **Testing approach:** Same as Plan 2 — validated in the `/components` gallery (open/close,
> Esc/outside-click dismissal, focus trap + restore, keyboard nav, both themes) + `npx tsc --noEmit`.
> No RTL/jsdom in this repo.

> **Commit policy:** Follows `no-git-commits.mdc` — confirm before committing.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/primitives/dialog.tsx` (NEW) | `Dialog.*` (+ exported backdrop/popup class fragments) |
| `src/components/primitives/alert-dialog.tsx` (NEW) | `AlertDialog.*` (mandatory title/actions) |
| `src/components/primitives/sheet.tsx` (NEW) | `Sheet.*` (side-anchored dialog) |
| `src/components/primitives/popover.tsx` (NEW) | `Popover.*` |
| `src/components/primitives/tooltip.tsx` (NEW) | `Tooltip.*` (+ `TooltipProvider`) |
| `src/components/primitives/menu.tsx` (NEW) | `Menu.*` |
| `src/components/primitives/toast.tsx` (NEW) | `ToastProvider`, `ToastViewport`, `useToast` |
| `src/components/primitives/index.ts` (MODIFY) | Add overlay exports |
| `src/app/(design)/components/_demos/overlays-demo.tsx` (NEW) | Gallery section |
| `src/app/(design)/components/page.tsx` (MODIFY) | Render `<OverlaysDemo />` |

**Verify:** `npm run dev` → `/components` → open each overlay; Tab/Esc; toggle theme. **Type-check:** `npx tsc --noEmit`.

---

## Task 1: Dialog

**Files:** Create `src/components/primitives/dialog.tsx`

Base UI: `Dialog.Root`/`Trigger`/`Portal`/`Backdrop`/`Popup`/`Title`/`Description`/`Close`.

- [ ] **Step 1: Implement Dialog (export shared class fragments for AlertDialog/Sheet reuse)**

```tsx
// src/components/primitives/dialog.tsx
"use client";

import { type ComponentProps } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

export const backdropClassName =
  "sj-root fixed inset-0 z-50 bg-overlay-scrim transition-opacity duration-[var(--duration-normal)] " +
  "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0";

export const popupClassName =
  "sj-root fixed top-1/2 left-1/2 z-50 flex w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 " +
  "flex-col gap-4 rounded-lg border border-border bg-surface-elevated p-6 text-text-primary shadow-lg " +
  "transition-[transform,opacity] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] " +
  "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 " +
  "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0";

function Title({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
  return <BaseDialog.Title className={cn("font-serif text-2xl", className)} {...props} />;
}

function Description({ className, ...props }: ComponentProps<typeof BaseDialog.Description>) {
  return <BaseDialog.Description className={cn("text-base text-text-secondary", className)} {...props} />;
}

function Popup({ className, ...props }: ComponentProps<typeof BaseDialog.Popup>) {
  return <BaseDialog.Popup className={cn(popupClassName, className)} {...props} />;
}

function Backdrop({ className, ...props }: ComponentProps<typeof BaseDialog.Backdrop>) {
  return <BaseDialog.Backdrop className={cn(backdropClassName, className)} {...props} />;
}

export const Dialog = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Portal: BaseDialog.Portal,
  Close: BaseDialog.Close,
  Backdrop,
  Popup,
  Title,
  Description,
};
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/dialog.tsx
git commit -m "feat(design): add Dialog primitive"
```

---

## Task 2: AlertDialog

**Files:** Create `src/components/primitives/alert-dialog.tsx`

Base UI `AlertDialog` mirrors `Dialog` but is non-dismissable by outside click (for confirmations).
Reuses the dialog class fragments.

- [ ] **Step 1: Implement AlertDialog**

```tsx
// src/components/primitives/alert-dialog.tsx
"use client";

import { type ComponentProps } from "react";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";
import { backdropClassName, popupClassName } from "./dialog";

function Title({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Title>) {
  return <BaseAlertDialog.Title className={cn("font-serif text-2xl", className)} {...props} />;
}

function Description({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Description>) {
  return (
    <BaseAlertDialog.Description className={cn("text-base text-text-secondary", className)} {...props} />
  );
}

function Popup({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Popup>) {
  return <BaseAlertDialog.Popup className={cn(popupClassName, "w-80", className)} {...props} />;
}

function Backdrop({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Backdrop>) {
  return <BaseAlertDialog.Backdrop className={cn(backdropClassName, className)} {...props} />;
}

export const AlertDialog = {
  Root: BaseAlertDialog.Root,
  Trigger: BaseAlertDialog.Trigger,
  Portal: BaseAlertDialog.Portal,
  Close: BaseAlertDialog.Close,
  Backdrop,
  Popup,
  Title,
  Description,
};
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/alert-dialog.tsx
git commit -m "feat(design): add AlertDialog primitive"
```

---

## Task 3: Sheet (side-anchored dialog)

**Files:** Create `src/components/primitives/sheet.tsx`

A `Sheet` is a `Dialog` whose popup is anchored to an edge and slides in. We implement it on Base UI
`Dialog` with a `side` prop ("right" default | "left"). Title remains mandatory (§13).

- [ ] **Step 1: Implement Sheet**

```tsx
// src/components/primitives/sheet.tsx
"use client";

import { type ComponentProps } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { backdropClassName } from "./dialog";

type Side = "right" | "left";

const sideClasses: Record<Side, string> = {
  right:
    "right-0 border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
  left: "left-0 border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
};

function Popup({
  className,
  side = "right",
  ...props
}: ComponentProps<typeof BaseDialog.Popup> & { side?: Side }) {
  return (
    <BaseDialog.Popup
      className={cn(
        "sj-root fixed inset-y-0 z-50 flex w-96 max-w-[calc(100vw-3rem)] flex-col gap-4 border-border bg-surface-elevated p-6 text-text-primary shadow-lg",
        "transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        sideClasses[side],
        className,
      )}
      {...props}
    />
  );
}

function Backdrop({ className, ...props }: ComponentProps<typeof BaseDialog.Backdrop>) {
  return <BaseDialog.Backdrop className={cn(backdropClassName, className)} {...props} />;
}

function Title({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
  return <BaseDialog.Title className={cn("font-serif text-2xl", className)} {...props} />;
}

export const Sheet = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Portal: BaseDialog.Portal,
  Close: BaseDialog.Close,
  Backdrop,
  Popup,
  Title,
  Description: BaseDialog.Description,
};
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/sheet.tsx
git commit -m "feat(design): add Sheet primitive"
```

---

## Task 4: Popover

**Files:** Create `src/components/primitives/popover.tsx`

Base UI: `Popover.Root`/`Trigger`/`Portal`/`Positioner`/`Popup`/`Arrow`/`Title`/`Description`/`Close`.

- [ ] **Step 1: Implement Popover**

```tsx
// src/components/primitives/popover.tsx
"use client";

import { type ComponentProps } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

function Positioner({ sideOffset = 6, className, ...props }: ComponentProps<typeof BasePopover.Positioner>) {
  return <BasePopover.Positioner sideOffset={sideOffset} className={cn("sj-root z-50 outline-none", className)} {...props} />;
}

function Popup({ className, ...props }: ComponentProps<typeof BasePopover.Popup>) {
  return (
    <BasePopover.Popup
      className={cn(
        "max-w-[var(--available-width)] origin-[var(--transform-origin)] rounded-lg border border-border",
        "bg-surface-elevated p-4 text-text-primary shadow-md",
        "transition-[transform,opacity] duration-[var(--duration-fast)] ease-[var(--ease-out-soft)]",
        "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
        "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function Arrow({ className, ...props }: ComponentProps<typeof BasePopover.Arrow>) {
  return <BasePopover.Arrow className={cn("text-border", className)} {...props} />;
}

export const Popover = {
  Root: BasePopover.Root,
  Trigger: BasePopover.Trigger,
  Portal: BasePopover.Portal,
  Close: BasePopover.Close,
  Title: BasePopover.Title,
  Description: BasePopover.Description,
  Positioner,
  Popup,
  Arrow,
};
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/popover.tsx
git commit -m "feat(design): add Popover primitive"
```

---

## Task 5: Tooltip

**Files:** Create `src/components/primitives/tooltip.tsx`

Base UI: `Tooltip.Provider` (mount once near a subtree) + `Tooltip.Root`/`Trigger`/`Portal`/
`Positioner`/`Popup`/`Arrow`.

- [ ] **Step 1: Implement Tooltip**

```tsx
// src/components/primitives/tooltip.tsx
"use client";

import { type ComponentProps } from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = BaseTooltip.Provider;

function Positioner({ sideOffset = 6, className, ...props }: ComponentProps<typeof BaseTooltip.Positioner>) {
  return <BaseTooltip.Positioner sideOffset={sideOffset} className={cn("sj-root z-50", className)} {...props} />;
}

function Popup({ className, ...props }: ComponentProps<typeof BaseTooltip.Popup>) {
  return (
    <BaseTooltip.Popup
      className={cn(
        "rounded-md bg-surface-inverse px-2.5 py-1.5 text-sm text-text-on-inverse shadow-md",
        "origin-[var(--transform-origin)] transition-[transform,opacity] duration-[var(--duration-fast)]",
        "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
        "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export const Tooltip = {
  Provider: BaseTooltip.Provider,
  Root: BaseTooltip.Root,
  Trigger: BaseTooltip.Trigger,
  Portal: BaseTooltip.Portal,
  Arrow: BaseTooltip.Arrow,
  Positioner,
  Popup,
};
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors. (Mount `<TooltipProvider>` once per subtree —
the gallery demo and, later, the app shell.)

```bash
git add src/components/primitives/tooltip.tsx
git commit -m "feat(design): add Tooltip primitive"
```

---

## Task 6: Menu

**Files:** Create `src/components/primitives/menu.tsx`

Base UI: `Menu.Root`/`Trigger`/`Portal`/`Positioner`/`Popup`/`Item`/`Separator`/`Group`/`GroupLabel`.

- [ ] **Step 1: Implement Menu**

```tsx
// src/components/primitives/menu.tsx
"use client";

import { type ComponentProps } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

function Positioner({ sideOffset = 6, className, ...props }: ComponentProps<typeof BaseMenu.Positioner>) {
  return <BaseMenu.Positioner sideOffset={sideOffset} className={cn("sj-root z-50 outline-none", className)} {...props} />;
}

function Popup({ className, ...props }: ComponentProps<typeof BaseMenu.Popup>) {
  return (
    <BaseMenu.Popup
      className={cn(
        "min-w-48 origin-[var(--transform-origin)] rounded-md border border-border bg-surface-elevated py-1 text-text-primary shadow-md",
        "transition-[transform,opacity] duration-[var(--duration-fast)]",
        "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
        "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function Item({ className, ...props }: ComponentProps<typeof BaseMenu.Item>) {
  return (
    <BaseMenu.Item
      className={cn(
        "flex cursor-default items-center gap-2 px-3 py-2 text-base outline-none select-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Separator({ className, ...props }: ComponentProps<typeof BaseMenu.Separator>) {
  return <BaseMenu.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}

function GroupLabel({ className, ...props }: ComponentProps<typeof BaseMenu.GroupLabel>) {
  return <BaseMenu.GroupLabel className={cn("px-3 py-1 text-sm text-text-muted", className)} {...props} />;
}

export const Menu = {
  Root: BaseMenu.Root,
  Trigger: BaseMenu.Trigger,
  Portal: BaseMenu.Portal,
  Group: BaseMenu.Group,
  Positioner,
  Popup,
  Item,
  Separator,
  GroupLabel,
};
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/menu.tsx
git commit -m "feat(design): add Menu primitive"
```

---

## Task 7: Toast

**Files:** Create `src/components/primitives/toast.tsx`

Base UI: `Toast.Provider` + `Toast.Portal`/`Toast.Viewport` + `Toast.useToastManager()` (`{ toasts, add }`)
+ `Toast.Root`/`Content`/`Title`/`Description`/`Close`. We expose a `ToastProvider` (provider +
viewport + list) and re-export `useToast`. Stacking motion is simplified (no swipe physics).

- [ ] **Step 1: Implement Toast**

```tsx
// src/components/primitives/toast.tsx
"use client";

import { type ReactNode } from "react";
import { Toast as BaseToast } from "@base-ui/react/toast";
import { Xmark } from "iconoir-react";
import { cn } from "@/lib/utils";

export const useToast = BaseToast.useToastManager;

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => (
    <BaseToast.Root
      key={toast.id}
      toast={toast}
      className={cn(
        "absolute right-0 bottom-0 left-0 z-[calc(1000-var(--toast-index))] w-full rounded-md border border-border",
        "bg-surface-elevated p-4 text-text-primary shadow-lg",
        "[transform:translateY(calc(var(--toast-index)*-0.65rem))_scale(calc(max(0,1-(var(--toast-index)*0.05))))]",
        "transition-[transform,opacity] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        "data-[starting-style]:translate-y-full data-[starting-style]:opacity-0",
        "data-[ending-style]:translate-y-full data-[ending-style]:opacity-0",
        "data-expanded:[transform:translateY(calc(var(--toast-offset-y)*-1))]",
      )}
    >
      <BaseToast.Content className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <BaseToast.Title className="font-medium" />
          <BaseToast.Description className="text-sm text-text-secondary" />
        </div>
        <BaseToast.Close
          className="shrink-0 rounded text-text-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          aria-label="Dismiss"
        >
          <Xmark width={16} height={16} aria-hidden />
        </BaseToast.Close>
      </BaseToast.Content>
    </BaseToast.Root>
  ));
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className="sj-root fixed right-4 bottom-4 z-[60] w-[22rem] max-w-[calc(100vw-2rem)]">
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors. (If `toast.add`'s signature or the
`--toast-*` CSS vars differ in the installed version, reconcile against the Toast docs; the swipe
physics from the docs can be layered in later.)

```bash
git add src/components/primitives/toast.tsx
git commit -m "feat(design): add Toast primitive"
```

---

## Task 8: Barrel export + overlays gallery demo

**Files:**
- Modify: `src/components/primitives/index.ts`
- Create: `src/app/(design)/components/_demos/overlays-demo.tsx`
- Modify: `src/app/(design)/components/page.tsx`

- [ ] **Step 1: Add overlay exports to the barrel**

Append to `src/components/primitives/index.ts`:

```ts
export { Dialog, backdropClassName, popupClassName } from "./dialog";
export { AlertDialog } from "./alert-dialog";
export { Sheet } from "./sheet";
export { Popover } from "./popover";
export { Tooltip, TooltipProvider } from "./tooltip";
export { Menu } from "./menu";
export { ToastProvider, useToast } from "./toast";
```

- [ ] **Step 2: Build the overlays demo**

```tsx
// src/app/(design)/components/_demos/overlays-demo.tsx
"use client";

import {
  AlertDialog,
  Button,
  Dialog,
  Menu,
  Popover,
  Sheet,
  ToastProvider,
  Tooltip,
  TooltipProvider,
  useToast,
} from "@/components/primitives";

function ToastDemoButton() {
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      onClick={() => toast.add({ title: "Saved", description: "Your changes were saved." })}
    >
      Show toast
    </Button>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 border-b border-border py-5">{children}</div>;
}

export function OverlaysDemo() {
  return (
    <ToastProvider>
      <TooltipProvider>
        <section>
          <h2 className="mb-2 font-serif text-2xl">Overlays</h2>

          <Row>
            <Dialog.Root>
              <Dialog.Trigger render={<Button>Open dialog</Button>} />
              <Dialog.Portal>
                <Dialog.Backdrop />
                <Dialog.Popup>
                  <Dialog.Title>Edit course</Dialog.Title>
                  <Dialog.Description>Update the course details below.</Dialog.Description>
                  <div className="flex justify-end gap-2">
                    <Dialog.Close render={<Button variant="ghost">Cancel</Button>} />
                    <Dialog.Close render={<Button>Save</Button>} />
                  </div>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>

            <AlertDialog.Root>
              <AlertDialog.Trigger render={<Button variant="danger">Delete</Button>} />
              <AlertDialog.Portal>
                <AlertDialog.Backdrop />
                <AlertDialog.Popup>
                  <AlertDialog.Title>Delete course?</AlertDialog.Title>
                  <AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
                  <div className="flex justify-end gap-2">
                    <AlertDialog.Close render={<Button variant="ghost">Keep</Button>} />
                    <AlertDialog.Close render={<Button variant="danger">Delete</Button>} />
                  </div>
                </AlertDialog.Popup>
              </AlertDialog.Portal>
            </AlertDialog.Root>

            <Sheet.Root>
              <Sheet.Trigger render={<Button variant="secondary">Open sheet</Button>} />
              <Sheet.Portal>
                <Sheet.Backdrop />
                <Sheet.Popup side="right">
                  <Sheet.Title>Filters</Sheet.Title>
                  <Sheet.Description>Refine the roster.</Sheet.Description>
                  <Sheet.Close render={<Button className="mt-auto">Done</Button>} />
                </Sheet.Popup>
              </Sheet.Portal>
            </Sheet.Root>
          </Row>

          <Row>
            <Popover.Root>
              <Popover.Trigger render={<Button variant="secondary">Popover</Button>} />
              <Popover.Portal>
                <Popover.Positioner>
                  <Popover.Popup>
                    <Popover.Title className="font-medium">Quick note</Popover.Title>
                    <Popover.Description className="text-sm text-text-secondary">
                      Popovers anchor to the trigger.
                    </Popover.Description>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            <Tooltip.Root>
              <Tooltip.Trigger render={<Button variant="ghost">Hover me</Button>} />
              <Tooltip.Portal>
                <Tooltip.Positioner>
                  <Tooltip.Popup>Saves automatically</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Menu.Root>
              <Menu.Trigger render={<Button variant="secondary">Menu</Button>} />
              <Menu.Portal>
                <Menu.Positioner>
                  <Menu.Popup>
                    <Menu.Item>Rename</Menu.Item>
                    <Menu.Item>Duplicate</Menu.Item>
                    <Menu.Separator />
                    <Menu.Item>Archive</Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>

            <ToastDemoButton />
          </Row>
        </section>
      </TooltipProvider>
    </ToastProvider>
  );
}
```

(The `render={<Button …/>}` prop is Base UI's composition API — it renders the trigger/close **as**
our Button rather than nesting a `<button>` in a `<button>`. Verify the `render` prop shape against
the installed version; older variants used `render={(props) => <Button {...props} />}`.)

- [ ] **Step 3: Render it from the gallery index**

In `src/app/(design)/components/page.tsx`, add the import and render `<OverlaysDemo />` after
`<InputsDemo />`:

```tsx
import { OverlaysDemo } from "./_demos/overlays-demo";
```

```tsx
      <InputsDemo />
      <OverlaysDemo />
```

- [ ] **Step 4: Verify (focus trap, Esc, theme)**

Run `npm run dev`; visit `/components`. Expected: each overlay opens in a portal; focus is trapped
in dialogs and restored to the trigger on close; Esc and backdrop-click dismiss (AlertDialog ignores
backdrop click); tooltip shows on hover/focus; menu is arrow-key navigable; toast stacks and
dismisses. All legible in both themes.

**Critically — the portal-token check:** confirm the portaled popups render in **cream + data-green**
(and the warm-dark palette when toggled), in Schedjuice fonts — NOT the app's Geist/neutral. That
proves the `sj-root` class on each portaled element (Backdrop/Popup/Positioner/Viewport) resolves the
scoped tokens even though the portal mounts at `document.body`, outside the `.sj-root` layout. If any
overlay looks unstyled/transparent, its portaled element is missing the `sj-root` class.

- [ ] **Step 5: Commit**

```bash
git add src/components/primitives/index.ts "src/app/(design)/components/_demos/overlays-demo.tsx" "src/app/(design)/components/page.tsx"
git commit -m "feat(design): demo overlay primitives in the gallery"
```

---

## Done criteria for Plan 3

- All 7 overlay primitives exist and are exported from the barrel.
- `/components` opens each overlay; focus trap + restore work; Esc/backdrop dismissal behaves
  (AlertDialog stays open on backdrop click); tooltip + menu are keyboard-operable; toasts stack.
- Every overlay surface is AA-legible in light and dark.
- `npx tsc --noEmit` clean. Ready for Plan 4 (structure primitives + gallery finalize).
