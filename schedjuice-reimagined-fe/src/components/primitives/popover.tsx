// src/components/primitives/popover.tsx
"use client";

import { type ComponentProps } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import { useDropdownPositionerClassName } from "@/lib/ui/modal-overlay-context";

function Positioner({ sideOffset = 6, className, ...props }: ComponentProps<typeof BasePopover.Positioner>) {
  const overlayClassName = useDropdownPositionerClassName();
  return (
    <BasePopover.Positioner
      sideOffset={sideOffset}
      className={(state) =>
        cn(overlayClassName, typeof className === "function" ? className(state) : className)
      }
      {...props}
    />
  );
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
