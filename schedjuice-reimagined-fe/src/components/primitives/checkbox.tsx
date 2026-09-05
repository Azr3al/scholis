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
        // Use --action (not --accent): .sj-content-reset clobbers --accent to near-white
        // for legacy hover surfaces, which makes checked boxes disappear on cream.
        "data-[checked]:border-[var(--action,var(--data-green-strong,#2f6e58))]",
        "data-[checked]:bg-[var(--action,var(--data-green-strong,#2f6e58))]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator className="flex text-[var(--action-foreground,#ffffff)] data-[unchecked]:hidden">
        <Check width={14} height={14} strokeWidth={2.5} aria-hidden />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
