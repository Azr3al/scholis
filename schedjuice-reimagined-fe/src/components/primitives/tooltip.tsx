// src/components/primitives/tooltip.tsx
"use client";

import { type ComponentProps } from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";
import { useDropdownPositionerClassName } from "@/lib/ui/modal-overlay-context";

export const TooltipProvider = BaseTooltip.Provider;

function Positioner({ sideOffset = 6, className, ...props }: ComponentProps<typeof BaseTooltip.Positioner>) {
  const overlayClassName = useDropdownPositionerClassName();
  return (
    <BaseTooltip.Positioner
      sideOffset={sideOffset}
      className={(state) =>
        cn(overlayClassName, typeof className === "function" ? className(state) : className)
      }
      {...props}
    />
  );
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
