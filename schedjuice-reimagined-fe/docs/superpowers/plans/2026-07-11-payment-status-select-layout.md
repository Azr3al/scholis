# Payment status select layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the payment Status select single-line, wide enough for common labels, with a left-aligned menu at least as wide as the trigger.

**Architecture:** Extract tiny pure className helpers (TDD) for the select trigger/value and the status cell floor. Wire them into the shared Select primitive and `UserPaymentStatusInlineForm`. Set Base UI Positioner `align="start"`. No ResourceTable API or Glide popover changes.

**Tech Stack:** React, Base UI Select (`@base-ui/react/select`), Tailwind, Vitest (`npm run test:unit`)

**Spec:** `docs/superpowers/specs/2026-07-11-payment-status-select-layout-design.md`

All commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/ui/select-layout.ts` | Create | Pure helpers: trigger/value classNames + status cell min-width constant |
| `src/lib/ui/select-layout.test.ts` | Create | Unit tests for helpers |
| `src/components/primitives/select.tsx` | Modify | Use helpers; nowrap/truncate value; `align="start"` on Positioner; drop hard `min-w-44` when full-width classes present |
| `src/components/datatable/user-payment-status-inline-form.tsx` | Modify | Apply status cell min-width floor on wrapper |
| `src/components/form/selectors/selector.tsx` | Modify | Pass layout-aware trigger classes for `fullWidth` |

---

### Task 1: Select layout helpers (TDD)

**Files:**
- Create: `src/lib/ui/select-layout.ts`
- Test: `src/lib/ui/select-layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS,
  selectTriggerClassName,
  selectValueClassName,
} from "./select-layout";

describe("selectValueClassName", () => {
  it("keeps the value on one line and truncates when constrained", () => {
    const cls = selectValueClassName();
    expect(cls).toContain("min-w-0");
    expect(cls).toContain("flex-1");
    expect(cls).toContain("truncate");
    expect(cls).toContain("whitespace-nowrap");
  });

  it("keeps placeholder muted styling hook", () => {
    expect(selectValueClassName()).toContain("data-[placeholder]:text-text-muted");
  });
});

describe("selectTriggerClassName", () => {
  it("uses fixed height and shared chrome for default (non-fullWidth)", () => {
    const cls = selectTriggerClassName({ fullWidth: false });
    expect(cls).toContain("h-10");
    expect(cls).toContain("min-w-44");
    expect(cls).toContain("items-center");
    expect(cls).not.toContain("w-full");
  });

  it("drops hard min-w-44 and fills width when fullWidth", () => {
    const cls = selectTriggerClassName({ fullWidth: true });
    expect(cls).toContain("w-full");
    expect(cls).toContain("min-w-0");
    expect(cls).not.toContain("min-w-44");
  });
});

describe("PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS", () => {
  it("floors the status cell around 13.5rem", () => {
    expect(PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS).toBe("min-w-[13.5rem]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/ui/select-layout.test.ts`

Expected: FAIL (module not found / cannot resolve `./select-layout`)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/ui/select-layout.ts

/** Floor for payment Status select cells so common labels fit on one line. */
export const PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS = "min-w-[13.5rem]";

export function selectValueClassName(): string {
  return "min-w-0 flex-1 truncate whitespace-nowrap data-[placeholder]:text-text-muted";
}

export function selectTriggerClassName(opts: { fullWidth?: boolean }): string {
  const fullWidth = Boolean(opts.fullWidth);
  return [
    "flex h-10 items-center justify-between gap-3 rounded-md border border-border bg-surface px-3",
    "text-base text-text-primary select-none hover:bg-surface-hover data-[popup-open]:bg-surface-hover",
    "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
    fullWidth ? "min-w-0 w-full max-w-full" : "min-w-44",
  ].join(" ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/ui/select-layout.test.ts`

Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/select-layout.ts src/lib/ui/select-layout.test.ts
git commit -m "feat(ui): add select layout helpers for single-line triggers"
```

---

### Task 2: Wire Select primitive

**Files:**
- Modify: `src/components/primitives/select.tsx`

- [ ] **Step 1: Update Select to use helpers + start-aligned menu**

Replace the trigger/value/positioner wiring so the file looks like this (keep existing imports for Check/NavArrowDown/cn/BaseSelect; add layout helpers):

```tsx
"use client";

import { type ComponentProps, type ReactNode } from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, NavArrowDown } from "iconoir-react";
import { cn } from "@/lib/utils";
import {
  selectTriggerClassName,
  selectValueClassName,
} from "@/lib/ui/select-layout";

type SelectItem = { label: ReactNode; value: string };

function resolveItemLabel(
  items: readonly SelectItem[],
  selectedValue: unknown,
  placeholder: string,
): ReactNode {
  if (selectedValue == null || selectedValue === "") return placeholder;
  const match = items.find((item) => item.value === selectedValue);
  if (match?.label != null) return match.label;
  return typeof selectedValue === "string" ? selectedValue : placeholder;
}

export function Select({
  items,
  placeholder = "Select…",
  className,
  alignItemWithTrigger = false,
  fullWidth = false,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof BaseSelect.Root>, "className" | "onValueChange"> & {
  items: readonly SelectItem[];
  placeholder?: string;
  className?: string;
  alignItemWithTrigger?: boolean;
  /** Table cells: fill width and drop hard min-w-44. */
  fullWidth?: boolean;
  onValueChange?: (value: string) => void;
}) {
  return (
    <BaseSelect.Root
      items={items}
      {...props}
      onValueChange={onValueChange ? (value) => onValueChange(String(value)) : undefined}
    >
      <BaseSelect.Trigger
        className={cn(selectTriggerClassName({ fullWidth }), className)}
      >
        <BaseSelect.Value className={selectValueClassName()} placeholder={placeholder}>
          {(selectedValue) => resolveItemLabel(items, selectedValue, placeholder)}
        </BaseSelect.Value>
        <BaseSelect.Icon className="shrink-0 text-text-muted">
          <NavArrowDown width={16} height={16} aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          align="start"
          alignItemWithTrigger={alignItemWithTrigger}
          className="sj-root z-50 outline-none"
          sideOffset={4}
        >
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
                  label={
                    typeof item.label === "string"
                      ? item.label
                      : item.label != null
                        ? String(item.label)
                        : item.value
                  }
                  className={cn(
                    "grid cursor-default grid-cols-[1.25rem_1fr] items-center gap-2 py-2 pr-4 pl-2 text-base outline-none select-none",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  )}
                >
                  <BaseSelect.ItemIndicator className="col-start-1">
                    <Check width={16} height={16} aria-hidden />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2 whitespace-nowrap">
                    {item.label}
                  </BaseSelect.ItemText>
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

Notes:
- `align="start"` left-aligns the popup to the trigger.
- Keep `min-w-[var(--anchor-width)]` so the menu is never narrower than the trigger.
- `whitespace-nowrap` on item text keeps option rows single-line (menu can grow wider than trigger).

- [ ] **Step 2: Commit**

```bash
git add src/components/primitives/select.tsx
git commit -m "fix(ui): single-line Select value and start-aligned menu"
```

---

### Task 3: Wire Selector + status inline form

**Files:**
- Modify: `src/components/form/selectors/selector.tsx`
- Modify: `src/components/datatable/user-payment-status-inline-form.tsx`

- [ ] **Step 1: Pass `fullWidth` into Select**

In `selector.tsx`, change the Select usage from width-only `className` to the new prop:

```tsx
          <Select
            value={value || undefined}
            onValueChange={(v) => onChange(String(v ?? ""))}
            disabled={isDisabled}
            fullWidth={fullWidth}
            className={cn(
              fullWidth ? undefined : "w-[180px]",
              className,
            )}
            placeholder={label}
            items={items}
          />
```

Keep the loading placeholder width logic as-is (`w-full` vs `w-[180px]`).

- [ ] **Step 2: Floor the status cell width**

In `user-payment-status-inline-form.tsx`:

```tsx
import { PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS } from "@/lib/ui/select-layout";

// ...

  return (
    <div className={cn(PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS, "w-full max-w-full")}>
      <Selector
        fullWidth
        containerClassName={cn("min-w-0", {
          "border border-success": status === UserPaymentStatus.verified,
          "border border-warning":
            status === UserPaymentStatus.pending_verification,
        })}
        isDisabled={isDisabled || !isUserPaymentStatusManuallyEditable(status)}
        isLoading={updateMutation.isPending}
        options={statusOptions}
        value={status}
        onChange={(v) => updateMutation.mutate(v)}
      />
    </div>
  );
```

Remove the old wrapper `min-w-0 w-full max-w-full` that let the cell collapse; the constant supplies the floor.

- [ ] **Step 3: Run unit tests**

Run: `npm run test:unit -- src/lib/ui/select-layout.test.ts`

Expected: PASS

- [ ] **Step 4: Manual visual check**

On student payments (original ResourceTable) or recent-transactions:

1. Status “Pending Payment” is one line in the trigger.
2. Open menu sits under the left edge of the trigger; menu ≥ trigger width.
3. Narrow the window: table scrolls; label truncates instead of wrapping.

- [ ] **Step 5: Commit**

```bash
git add src/components/form/selectors/selector.tsx src/components/datatable/user-payment-status-inline-form.tsx
git commit -m "fix(finances): widen status select cell and use fullWidth Select"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Single-line trigger + truncate | Task 1–2 (`selectValueClassName`) |
| Drop `min-w-44` for fullWidth | Task 1–3 |
| Status cell ~13.5rem floor | Task 1 + 3 |
| Menu `align=start`, min-width = trigger | Task 2 |
| Full option labels in menu | Task 2 (`whitespace-nowrap` on items) |
| Shared form covers finance/course/recent | Task 3 (shared component) |
| No Glide / ResourceTable API work | Out of scope (intentional) |
