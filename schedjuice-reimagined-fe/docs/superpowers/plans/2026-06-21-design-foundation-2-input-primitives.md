# Design Foundation — Plan 2: Input Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the form/input primitives on Base UI with Schedjuice tokens — `Button`, `Input`, `Textarea`, `Field`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `NumberField`, `Select`, `Combobox` — and demo them in the `/components` gallery.

**Architecture:** Each primitive is a thin, hand-composed wrapper over a Base UI part (`@base-ui/react/*`) styled exclusively with semantic tokens (`bg-surface`, `text-accent`, `border-border`, `--ring`, …) so it themes via `.sj-root` automatically. Shared class fragments (e.g. the input box) are exported constants to stay DRY. `cva` (already installed) drives `Button` variants. Buttons are text-led; press feedback (`active:scale`) is reserved for buttons only (DESIGN.md §12).

**Tech Stack:** Next.js 15, React 19, Tailwind v4, TypeScript, `@base-ui/react`, `class-variance-authority`, `iconoir-react`, `cn()`.

**Spec:** `docs/superpowers/specs/2026-06-21-design-foundation-phase-1.md` (§10 primitives). **Design source:** `DESIGN.md` §10, §11 (icons), §13 (a11y).
**Depends on:** Plan 1 (`.sj-root` tokens, fonts, `/components` shell + gallery index).

> **Testing approach:** This repo's Vitest runs **node-env, pure-logic** tests only (no RTL/jsdom in
> `package.json`). Per DESIGN.md §15, primitives are validated in the **`/components` gallery** with
> manual **keyboard + focus-visible + light/dark** checks, plus `npx tsc --noEmit`. Pure logic (e.g.
> `cva` variant maps) gets unit tests where it adds value. Adding RTL/jsdom is out of scope for
> Phase 1 (can be a later infra task if desired).

> **Commit policy:** Commits described below follow the repo's `no-git-commits.mdc` — confirm with
> the user before committing (or batch at the end).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json` | Add `@base-ui/react` |
| `src/components/primitives/button.tsx` (NEW) | `Button` + `buttonVariants` (cva) |
| `src/components/primitives/input.tsx` (NEW) | `Input` + exported `inputClassName` |
| `src/components/primitives/textarea.tsx` (NEW) | `Textarea` |
| `src/components/primitives/field.tsx` (NEW) | `Field.*` composition (label/control/description/error) |
| `src/components/primitives/checkbox.tsx` (NEW) | `Checkbox` |
| `src/components/primitives/radio-group.tsx` (NEW) | `RadioGroup` + `Radio` |
| `src/components/primitives/switch.tsx` (NEW) | `Switch` |
| `src/components/primitives/slider.tsx` (NEW) | `Slider` |
| `src/components/primitives/number-field.tsx` (NEW) | `NumberField` |
| `src/components/primitives/select.tsx` (NEW) | `Select` |
| `src/components/primitives/combobox.tsx` (NEW) | `Combobox` |
| `src/components/primitives/index.ts` (NEW) | Barrel export of primitives |
| `src/app/(design)/components/_demos/inputs-demo.tsx` (NEW) | Gallery section for these primitives |
| `src/app/(design)/components/page.tsx` (MODIFY) | Render `<InputsDemo />` |

**Verify a primitive:** `npm run dev` → `/components` (superadmin) → interact + tab through + toggle theme.
**Type-check:** `npx tsc --noEmit`.

---

## Task 1: Install Base UI

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
npm install @base-ui/react --legacy-peer-deps
```

- [ ] **Step 2: Smoke-check the import resolves**

Run: `node -e "require.resolve('@base-ui/react/checkbox'); console.log('ok')"`
Expected: prints `ok` (per-component subpath exports exist).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(design): add @base-ui/react"
```

---

## Task 2: Button

**Files:** Create `src/components/primitives/button.tsx`

- [ ] **Step 1: Implement Button**

```tsx
// src/components/primitives/button.tsx
import { type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-sans font-medium whitespace-nowrap " +
    "transition-[background-color,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] " +
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:bg-[color-mix(in_srgb,var(--accent)_88%,#000)]",
        secondary: "border border-border-strong bg-surface text-text-primary hover:bg-surface-hover",
        ghost: "text-text-primary hover:bg-surface-hover",
        danger: "bg-danger text-white hover:bg-[color-mix(in_srgb,var(--danger)_88%,#000)]",
      },
      size: { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-base", lg: "h-12 px-6 text-lg" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` — Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/primitives/button.tsx
git commit -m "feat(design): add Button primitive"
```

---

## Task 3: Input + Textarea

**Files:** Create `src/components/primitives/input.tsx`, `src/components/primitives/textarea.tsx`

- [ ] **Step 1: Implement Input (shared class exported for Field reuse)**

```tsx
// src/components/primitives/input.tsx
import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const inputClassName =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary " +
  "placeholder:text-text-muted transition-colors duration-[var(--duration-fast)] " +
  "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)] " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(inputClassName, className)} {...props} />;
}
```

- [ ] **Step 2: Implement Textarea**

```tsx
// src/components/primitives/textarea.tsx
import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full rounded-md border border-border bg-surface px-3 py-2 text-base leading-relaxed",
        "text-text-primary placeholder:text-text-muted resize-y",
        "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/input.tsx src/components/primitives/textarea.tsx
git commit -m "feat(design): add Input and Textarea primitives"
```

---

## Task 4: Field (label / control / description / error)

**Files:** Create `src/components/primitives/field.tsx`

Base UI `Field` anatomy: `Field.Root`, `Field.Label`, `Field.Control`, `Field.Description`,
`Field.Error` (with a `match` prop for native validity states). We style each part with tokens and
reuse `inputClassName` for the default control.

- [ ] **Step 1: Implement Field**

```tsx
// src/components/primitives/field.tsx
"use client";

import { type ComponentProps } from "react";
import { Field as BaseField } from "@base-ui/react/field";
import { cn } from "@/lib/utils";
import { inputClassName } from "./input";

function Root({ className, ...props }: ComponentProps<typeof BaseField.Root>) {
  return <BaseField.Root className={cn("flex flex-col items-start gap-1.5", className)} {...props} />;
}

function Label({ className, ...props }: ComponentProps<typeof BaseField.Label>) {
  return (
    <BaseField.Label className={cn("text-sm font-medium text-text-secondary", className)} {...props} />
  );
}

function Control({ className, ...props }: ComponentProps<typeof BaseField.Control>) {
  return <BaseField.Control className={cn(inputClassName, className)} {...props} />;
}

function Description({ className, ...props }: ComponentProps<typeof BaseField.Description>) {
  return <BaseField.Description className={cn("text-sm text-text-muted", className)} {...props} />;
}

function FieldError({ className, ...props }: ComponentProps<typeof BaseField.Error>) {
  return <BaseField.Error className={cn("text-sm text-danger", className)} {...props} />;
}

export const Field = {
  Root,
  Label,
  Control,
  Description,
  Error: FieldError,
};
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/field.tsx
git commit -m "feat(design): add Field composition primitive"
```

---

## Task 5: Checkbox

**Files:** Create `src/components/primitives/checkbox.tsx`

Base UI: `Checkbox.Root` + `Checkbox.Indicator`. Checkmark uses the Iconoir `Check` icon
(accent-on-check per DESIGN.md §5).

- [ ] **Step 1: Implement Checkbox**

```tsx
// src/components/primitives/checkbox.tsx
"use client";

import { type ComponentProps } from "react";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check } from "iconoir-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: ComponentProps<typeof BaseCheckbox.Root>) {
  return (
    <BaseCheckbox.Root
      className={cn(
        "flex size-5 items-center justify-center rounded border border-border-strong bg-surface",
        "transition-colors duration-[var(--duration-fast)]",
        "data-[checked]:border-accent data-[checked]:bg-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator className="flex text-accent-foreground data-[unchecked]:hidden">
        <Check width={14} height={14} strokeWidth={2.5} aria-hidden />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors. (If the `data-[checked]`/`data-[unchecked]`
attribute names differ in the installed version, confirm against `@base-ui/react/checkbox` docs.)

```bash
git add src/components/primitives/checkbox.tsx
git commit -m "feat(design): add Checkbox primitive"
```

---

## Task 6: RadioGroup + Radio

**Files:** Create `src/components/primitives/radio-group.tsx`

Base UI: `RadioGroup` (`@base-ui/react/radio-group`) wraps `Radio.Root` + `Radio.Indicator`
(`@base-ui/react/radio`).

- [ ] **Step 1: Implement RadioGroup + Radio**

```tsx
// src/components/primitives/radio-group.tsx
"use client";

import { type ComponentProps } from "react";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { Radio as BaseRadio } from "@base-ui/react/radio";
import { cn } from "@/lib/utils";

export function RadioGroup({ className, ...props }: ComponentProps<typeof BaseRadioGroup>) {
  return <BaseRadioGroup className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function Radio({ className, ...props }: ComponentProps<typeof BaseRadio.Root>) {
  return (
    <BaseRadio.Root
      className={cn(
        "flex size-5 items-center justify-center rounded-full border border-border-strong bg-surface",
        "transition-colors duration-[var(--duration-fast)] data-[checked]:border-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseRadio.Indicator className="size-2.5 rounded-full bg-accent data-[unchecked]:hidden" />
    </BaseRadio.Root>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/radio-group.tsx
git commit -m "feat(design): add RadioGroup primitive"
```

---

## Task 7: Switch

**Files:** Create `src/components/primitives/switch.tsx`

Base UI: `Switch.Root` + `Switch.Thumb`.

- [ ] **Step 1: Implement Switch**

```tsx
// src/components/primitives/switch.tsx
"use client";

import { type ComponentProps } from "react";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: ComponentProps<typeof BaseSwitch.Root>) {
  return (
    <BaseSwitch.Root
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border-strong",
        "bg-surface-active transition-colors duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        "data-[checked]:border-accent data-[checked]:bg-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          "size-5 rounded-full bg-surface shadow-sm transition-[translate] duration-[var(--duration-normal)] ease-[var(--ease-paper)]",
          "translate-x-0.5 data-[checked]:translate-x-[1.375rem]",
        )}
      />
    </BaseSwitch.Root>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/switch.tsx
git commit -m "feat(design): add Switch primitive"
```

---

## Task 8: Slider

**Files:** Create `src/components/primitives/slider.tsx`

Base UI: `Slider.Root` (`defaultValue`/`value`) → `Slider.Control` → `Slider.Track` →
`Slider.Indicator` + `Slider.Thumb`.

- [ ] **Step 1: Implement Slider**

```tsx
// src/components/primitives/slider.tsx
"use client";

import { type ComponentProps } from "react";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

export function Slider({ className, ...props }: ComponentProps<typeof BaseSlider.Root>) {
  return (
    <BaseSlider.Root className={cn("w-full", className)} {...props}>
      <BaseSlider.Control className="flex w-full touch-none items-center py-3 select-none">
        <BaseSlider.Track className="h-1.5 w-full rounded-full bg-surface-active">
          <BaseSlider.Indicator className="rounded-full bg-accent" />
          <BaseSlider.Thumb
            className={cn(
              "size-4 rounded-full border border-accent bg-surface shadow-sm",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
            )}
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/slider.tsx
git commit -m "feat(design): add Slider primitive"
```

---

## Task 9: NumberField

**Files:** Create `src/components/primitives/number-field.tsx`

Base UI: `NumberField.Root` (`defaultValue`/`value`, `id`) → `NumberField.Group` →
`NumberField.Decrement` + `NumberField.Input` + `NumberField.Increment`. Tabular numerals + mono
for the value (DESIGN.md §6.4).

- [ ] **Step 1: Implement NumberField**

```tsx
// src/components/primitives/number-field.tsx
"use client";

import { type ComponentProps } from "react";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { Minus, Plus } from "iconoir-react";
import { cn } from "@/lib/utils";

const stepper =
  "flex w-9 items-center justify-center border border-border-strong bg-surface text-text-primary " +
  "transition-colors hover:not-data-disabled:bg-surface-hover data-disabled:opacity-50 " +
  "focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]";

export function NumberField({ className, ...props }: ComponentProps<typeof BaseNumberField.Root>) {
  return (
    <BaseNumberField.Root className={cn("inline-flex", className)} {...props}>
      <BaseNumberField.Group className="flex h-10">
        <BaseNumberField.Decrement className={cn(stepper, "rounded-l-md border-r-0")}>
          <Minus width={16} height={16} aria-hidden />
        </BaseNumberField.Decrement>
        <BaseNumberField.Input
          className={cn(
            "h-full w-20 border border-border-strong bg-surface px-3 text-center font-mono text-mono-base tabular-nums text-text-primary",
            "focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
          )}
        />
        <BaseNumberField.Increment className={cn(stepper, "rounded-r-md border-l-0")}>
          <Plus width={16} height={16} aria-hidden />
        </BaseNumberField.Increment>
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/number-field.tsx
git commit -m "feat(design): add NumberField primitive"
```

---

## Task 10: Select

**Files:** Create `src/components/primitives/select.tsx`

Base UI: `Select.Root` (`items`) → `Select.Trigger`/`Select.Value`/`Select.Icon` →
`Select.Portal`/`Select.Positioner`/`Select.Popup` → `Select.List`/`Select.Item`/
`Select.ItemIndicator`/`Select.ItemText`. Popup uses `--anchor-width`, `--transform-origin`,
`--available-height` and `data-starting/ending-style` for motion. The `Positioner` carries the
`sj-root` class so the portaled popup (rendered at `document.body`, outside the layout) resolves the
scoped tokens — see Plan 1's portal note.

- [ ] **Step 1: Implement Select**

```tsx
// src/components/primitives/select.tsx
"use client";

import { type ComponentProps, type ReactNode } from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, NavArrowDown } from "iconoir-react";
import { cn } from "@/lib/utils";

type SelectItem = { label: ReactNode; value: string };

export function Select({
  items,
  placeholder = "Select…",
  className,
  ...props
}: ComponentProps<typeof BaseSelect.Root> & { items: SelectItem[]; placeholder?: string }) {
  return (
    <BaseSelect.Root items={items} {...props}>
      <BaseSelect.Trigger
        className={cn(
          "flex h-10 min-w-44 items-center justify-between gap-3 rounded-md border border-border bg-surface px-3",
          "text-base text-text-primary select-none hover:bg-surface-hover data-[popup-open]:bg-surface-hover",
          "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
          className,
        )}
      >
        <BaseSelect.Value className="data-[placeholder]:text-text-muted" placeholder={placeholder} />
        <BaseSelect.Icon className="text-text-muted">
          <NavArrowDown width={16} height={16} aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="sj-root z-50 outline-none" sideOffset={4}>
          <BaseSelect.Popup
            className={cn(
              "max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)]",
              "overflow-y-auto rounded-md border border-border bg-surface-elevated py-1 text-text-primary shadow-md",
              "transition-[transform,opacity] duration-[var(--duration-fast)]",
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            )}
          >
            <BaseSelect.List>
              {items.map((item) => (
                <BaseSelect.Item
                  key={item.value}
                  value={item.value}
                  className={cn(
                    "grid cursor-default grid-cols-[1.25rem_1fr] items-center gap-2 py-2 pr-4 pl-2 text-base outline-none select-none",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  )}
                >
                  <BaseSelect.ItemIndicator className="col-start-1">
                    <Check width={16} height={16} aria-hidden />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2">{item.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/select.tsx
git commit -m "feat(design): add Select primitive"
```

---

## Task 11: Combobox

**Files:** Create `src/components/primitives/combobox.tsx`

Base UI: `Combobox.Root` (`items`) → `Combobox.InputGroup`/`Combobox.Input`/`Combobox.Clear`/
`Combobox.Trigger` → `Combobox.Portal`/`Combobox.Positioner`/`Combobox.Popup` →
`Combobox.Empty` + `Combobox.List` (render-prop children) → `Combobox.Item`/`Combobox.ItemIndicator`.

- [ ] **Step 1: Implement Combobox**

```tsx
// src/components/primitives/combobox.tsx
"use client";

import { type ComponentProps } from "react";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Check, NavArrowDown, Xmark } from "iconoir-react";
import { cn } from "@/lib/utils";

export type ComboboxItem = { label: string; value: string };

export function Combobox({
  items,
  placeholder = "Search…",
  emptyMessage = "No results.",
  className,
  ...props
}: ComponentProps<typeof BaseCombobox.Root> & {
  items: ComboboxItem[];
  placeholder?: string;
  emptyMessage?: string;
}) {
  return (
    <BaseCombobox.Root items={items} {...props}>
      <BaseCombobox.InputGroup
        className={cn(
          "relative flex h-10 w-64 items-center rounded-md border border-border bg-surface",
          "focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-[var(--ring)]",
          className,
        )}
      >
        <BaseCombobox.Input
          placeholder={placeholder}
          className="h-full w-full rounded-md bg-transparent pr-16 pl-3 text-base text-text-primary outline-none placeholder:text-text-muted"
        />
        <div className="absolute right-0 flex h-full items-center text-text-muted">
          <BaseCombobox.Clear className="flex h-full w-8 items-center justify-center" aria-label="Clear">
            <Xmark width={16} height={16} aria-hidden />
          </BaseCombobox.Clear>
          <BaseCombobox.Trigger className="flex h-full w-8 items-center justify-center" aria-label="Open">
            <NavArrowDown width={16} height={16} aria-hidden />
          </BaseCombobox.Trigger>
        </div>
      </BaseCombobox.InputGroup>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className="sj-root z-50 outline-none" sideOffset={4}>
          <BaseCombobox.Popup
            className={cn(
              "w-[var(--anchor-width)] max-w-[var(--available-width)] origin-[var(--transform-origin)]",
              "rounded-md border border-border bg-surface-elevated text-text-primary shadow-md",
              "transition-[transform,opacity] duration-[var(--duration-fast)]",
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            )}
          >
            <BaseCombobox.Empty className="px-3 py-3 text-sm text-text-muted">
              {emptyMessage}
            </BaseCombobox.Empty>
            <BaseCombobox.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto py-1 data-empty:p-0">
              {(item: ComboboxItem) => (
                <BaseCombobox.Item
                  key={item.value}
                  value={item}
                  className={cn(
                    "grid cursor-default grid-cols-[1.25rem_1fr] items-center gap-2 px-2 py-2 text-base outline-none select-none",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  )}
                >
                  <BaseCombobox.ItemIndicator className="col-start-1">
                    <Check width={16} height={16} aria-hidden />
                  </BaseCombobox.ItemIndicator>
                  <span className="col-start-2">{item.label}</span>
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors. (Combobox is one of the newer Base UI parts;
if `InputGroup`/`Clear` names differ in the installed version, reconcile against the docs.)

```bash
git add src/components/primitives/combobox.tsx
git commit -m "feat(design): add Combobox primitive"
```

---

## Task 12: Primitives barrel export

**Files:** Create `src/components/primitives/index.ts`

- [ ] **Step 1: Re-export the input primitives**

```ts
// src/components/primitives/index.ts
export { Button, buttonVariants, type ButtonProps } from "./button";
export { Input, inputClassName } from "./input";
export { Textarea } from "./textarea";
export { Field } from "./field";
export { Checkbox } from "./checkbox";
export { RadioGroup, Radio } from "./radio-group";
export { Switch } from "./switch";
export { Slider } from "./slider";
export { NumberField } from "./number-field";
export { Select } from "./select";
export { Combobox, type ComboboxItem } from "./combobox";
```

(Plans 3–4 append their primitives to this barrel.)

- [ ] **Step 2: Commit**

```bash
git add src/components/primitives/index.ts
git commit -m "feat(design): add primitives barrel export"
```

---

## Task 13: Input primitives gallery demo

**Files:**
- Create: `src/app/(design)/components/_demos/inputs-demo.tsx`
- Modify: `src/app/(design)/components/page.tsx`

- [ ] **Step 1: Build the demo section (includes a Burmese example per §7)**

```tsx
// src/app/(design)/components/_demos/inputs-demo.tsx
"use client";

import {
  Button,
  Checkbox,
  Combobox,
  Field,
  Input,
  NumberField,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Switch,
  Textarea,
} from "@/components/primitives";

const courses = [
  { label: "အင်္ဂလိပ်စာ — Level 3", value: "eng-3" },
  { label: "သင်္ချာ — Grade 9", value: "math-9" },
  { label: "Physics — Foundation", value: "phys-0" },
];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border py-5 sm:grid-cols-[12rem_1fr]">
      <h3 className="font-mono text-mono-sm text-text-muted">{title}</h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function InputsDemo() {
  return (
    <section>
      <h2 className="mb-2 font-serif text-2xl">Inputs</h2>
      <Row title="Button">
        <Button>Save changes</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="ghost">Skip</Button>
        <Button variant="danger">Delete</Button>
        <Button disabled>Disabled</Button>
      </Row>
      <Row title="Field + Input">
        <Field.Root className="w-64">
          <Field.Label>ကျောင်းသားအမည် (Student name)</Field.Label>
          <Field.Control placeholder="အမည် / Name" required />
          <Field.Description>Shown on the roster.</Field.Description>
          <Field.Error match="valueMissing">Please enter a name.</Field.Error>
        </Field.Root>
      </Row>
      <Row title="Textarea">
        <Textarea className="max-w-sm" placeholder="Notes…" />
      </Row>
      <Row title="Checkbox / Radio / Switch">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox defaultChecked /> Send receipt
        </label>
        <RadioGroup defaultValue="teacher" className="flex-row gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Radio value="teacher" /> Teacher
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Radio value="student" /> Student
          </label>
        </RadioGroup>
        <label className="flex items-center gap-2 text-sm">
          <Switch defaultChecked /> Notifications
        </label>
      </Row>
      <Row title="Slider / NumberField">
        <Slider defaultValue={40} className="max-w-xs" />
        <NumberField defaultValue={12} />
      </Row>
      <Row title="Select / Combobox">
        <Select items={courses} placeholder="Pick a course" />
        <Combobox items={courses} placeholder="Search courses…" />
      </Row>
    </section>
  );
}
```

- [ ] **Step 2: Render it from the gallery index**

In `src/app/(design)/components/page.tsx`, import the demo and render it below the intro callout
(replace the placeholder section grid, or add above it). Add the import:

```tsx
import { InputsDemo } from "./_demos/inputs-demo";
```

And add `<InputsDemo />` inside the returned `<div className="space-y-8">`, after the `<RoughCallout>`:

```tsx
      <RoughCallout>
        <p className="font-hand text-text-hand">
          Build on Base UI. Tokens carry the weight. No shadcn, no Radix.
        </p>
      </RoughCallout>

      <InputsDemo />
```

- [ ] **Step 3: Verify in the browser (keyboard + theme)**

Run `npm run dev`; visit `/components` as a superadmin. Expected: every control renders with warm
tokens; Tab reaches each with a visible focus ring; Select/Combobox open in a portal and are
keyboard-navigable; the Burmese label/placeholder render correctly; toggle dark mode and confirm
all controls remain AA-legible.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(design)/components/_demos/inputs-demo.tsx" "src/app/(design)/components/page.tsx"
git commit -m "feat(design): demo input primitives in the gallery"
```

---

## Done criteria for Plan 2

- All 11 input primitives exist under `src/components/primitives/` and are exported from the barrel.
- `/components` renders the Inputs section; every control is keyboard-operable with a visible focus
  ring and works in both themes.
- Burmese text in the Field label/placeholder and Combobox/Select items renders correctly.
- `npx tsc --noEmit` is clean. Ready for Plan 3 (overlays).
