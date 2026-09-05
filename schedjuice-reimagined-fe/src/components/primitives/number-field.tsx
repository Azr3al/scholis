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
