// src/components/primitives/radio-group.tsx
"use client";

import { type ComponentProps } from "react";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { Radio as BaseRadio } from "@base-ui/react/radio";
import { cn } from "@/lib/utils";

export function RadioGroup({
  className,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof BaseRadioGroup>, "onValueChange"> & {
  onValueChange?: (value: string) => void;
}) {
  return (
    <BaseRadioGroup
      className={cn("flex flex-col gap-2", className)}
      {...props}
      onValueChange={onValueChange ? (value) => onValueChange(String(value)) : undefined}
    />
  );
}

export function Radio({ className, ...props }: ComponentProps<typeof BaseRadio.Root>) {
  return (
    <BaseRadio.Root
      className={cn(
        "flex size-5 items-center justify-center rounded-full border border-border-strong bg-surface",
        "transition-colors duration-[var(--duration-fast)] data-[checked]:border-foreground",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseRadio.Indicator className="size-2.5 rounded-full bg-foreground data-[unchecked]:hidden" />
    </BaseRadio.Root>
  );
}
