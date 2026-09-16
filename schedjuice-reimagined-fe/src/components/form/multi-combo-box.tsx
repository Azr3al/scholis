"use client";

import { Spinner } from "@/components/primitives/spinner";
import * as React from "react";
import { Check as CheckIcon, NavArrowDown as ChevronsUpDownIcon } from "iconoir-react";

import { cn } from "@/lib/utils";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { buttonVariants, Popover } from "@/components/primitives";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/misc/command";

export interface MultiComboboxOption {
  value: string;
  label: string;
  keywords?: string[];
  disabled?: boolean;
}

interface MultiComboboxProps {
  options: MultiComboboxOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  triggerLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
}

export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = "Search…",
  triggerLabel = "Add",
  isLoading = false,
  disabled = false,
  triggerClassName,
  contentClassName,
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const listboxId = React.useId();

  const toggle = (optionValue: string, disabled?: boolean) => {
    if (disabled) return;
    const id = String(optionValue);
    onChange(
      value.includes(id)
        ? value.filter((v) => v !== id)
        : [...value, id],
    );
  };

  return (
    <Popover.Root
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
      }}
    >
      <Popover.Trigger
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        className={cn(
          buttonVariants({ size: "sm", variant: "secondary" }),
          "justify-between text-card-foreground bg-card",
          triggerClassName,
        )}
      >
        {triggerLabel}
        {isLoading ? (
          <Spinner className="ml-2 h-4 w-4 shrink-0 " aria-hidden />
        ) : (
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className={dropdownPositionerClassName}
          align="start"
        >
          <Popover.Popup id={listboxId} className={cn(contentClassName ?? "w-[240px]", "p-0")}>
            <Command>
              <CommandInput
                className="bg-card text-card-foreground"
                placeholder={placeholder}
              />
              <CommandList>
                <CommandEmpty>
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner className="h-4 w-4 shrink-0 " />
                      <span>Loading…</span>
                    </span>
                  ) : (
                    "No item found."
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {options.map((op) => {
                    const selected = value.includes(String(op.value));
                    const isDisabled = Boolean(op.disabled);
                    return (
                      <CommandItem
                        key={op.value}
                        value={op.value}
                        keywords={op.keywords ?? [op.label]}
                        onSelect={() => toggle(op.value, isDisabled)}
                        aria-disabled={isDisabled}
                        className={cn(
                          "bg-card text-card-foreground",
                          isDisabled && "pointer-events-none opacity-50",
                        )}
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 h-4 w-4",
                            selected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {op.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
