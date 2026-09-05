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
