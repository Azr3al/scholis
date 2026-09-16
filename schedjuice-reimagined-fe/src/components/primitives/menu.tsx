// src/components/primitives/menu.tsx
"use client";

import { type ComponentProps } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";
import { useDropdownPositionerClassName } from "@/lib/ui/modal-overlay-context";

function Positioner({ sideOffset = 6, className, ...props }: ComponentProps<typeof BaseMenu.Positioner>) {
  const overlayClassName = useDropdownPositionerClassName();
  return (
    <BaseMenu.Positioner
      sideOffset={sideOffset}
      className={(state) =>
        cn(overlayClassName, typeof className === "function" ? className(state) : className)
      }
      {...props}
    />
  );
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

function CheckboxItem({ className, ...props }: ComponentProps<typeof BaseMenu.CheckboxItem>) {
  return (
    <BaseMenu.CheckboxItem
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
  CheckboxItem,
  Separator,
  GroupLabel,
};
