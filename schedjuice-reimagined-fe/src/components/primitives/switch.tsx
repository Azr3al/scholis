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
        "bg-surface-sunken transition-colors duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        "data-[checked]:border-[var(--action,var(--data-green-strong,#2f6e58))]",
        "data-[checked]:bg-[var(--action,var(--data-green-strong,#2f6e58))]",
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
