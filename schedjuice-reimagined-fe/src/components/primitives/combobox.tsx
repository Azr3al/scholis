// src/components/primitives/combobox.tsx
"use client";

import { type ComponentProps } from "react";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Check, NavArrowDown, Xmark } from "iconoir-react";
import { cn } from "@/lib/utils";
import type { ControlSize } from "@/lib/ui/control-sizing";
import { comboboxInputGroupClassName } from "@/lib/ui/control-sizing";
import { useDropdownPositionerClassName } from "@/lib/ui/modal-overlay-context";
import {
  selectPopupMaxHeightClassName,
  comboboxPopupWidthClassName,
  selectPositionerProps,
} from "@/lib/ui/select-layout";

export type ComboboxItem = { label: string; value: string };

export function Combobox({
  items,
  placeholder = "Search…",
  emptyMessage = "No results.",
  className,
  size = "default",
  ...props
}: Omit<ComponentProps<typeof BaseCombobox.Root>, "className"> & {
  items: ComboboxItem[];
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  size?: ControlSize;
}) {
  const positionerClassName = useDropdownPositionerClassName();
  return (
    <BaseCombobox.Root items={items} {...props}>
      <BaseCombobox.InputGroup
        className={cn(comboboxInputGroupClassName(size), className)}
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
        <BaseCombobox.Positioner
          {...selectPositionerProps()}
          className={positionerClassName}
          sideOffset={4}
        >
          <BaseCombobox.Popup
            className={cn(
              comboboxPopupWidthClassName(),
              "rounded-md border border-border bg-surface-elevated text-text-primary shadow-md",
              "outline-none focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
            )}
          >
            <BaseCombobox.Empty className="px-3 py-3 text-sm text-text-muted [&:empty]:hidden">
              {emptyMessage}
            </BaseCombobox.Empty>
            <BaseCombobox.List
              className={cn(
                selectPopupMaxHeightClassName(),
                "py-1 data-empty:p-0",
              )}
            >
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
