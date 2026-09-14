"use client";

import { type ComponentProps, type ReactNode } from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, NavArrowDown, NavArrowUp } from "iconoir-react";
import { cn } from "@/lib/utils";
import { ClearFieldButton } from "@/components/form/clear-field-button";
import { isFieldClearable } from "@/components/form/is-field-clearable";
import { useDropdownPositionerClassName } from "@/lib/ui/modal-overlay-context";
import {
  selectTriggerClassName,
  selectValueClassName,
  selectPopupClassName,
  selectPopupListClassName,
  selectPopupScrollArrowClassName,
  selectPopupItemTextClassName,
  selectPositionerProps,
} from "@/lib/ui/select-layout";
import type { ControlSize } from "@/lib/ui/control-sizing";

type SelectItem = { label: ReactNode; value: string };

/** Coerce controlled value to an item value, or undefined when empty / not in items. */
export function resolveControlledSelectValue(
  value: unknown,
  items: readonly SelectItem[],
): string | undefined {
  if (value == null || value === "") return undefined;
  const str = String(value);
  return items.some((item) => item.value === str) ? str : undefined;
}

function resolveItemLabel(
  items: readonly SelectItem[],
  selectedValue: unknown,
  placeholder: string,
): ReactNode {
  if (selectedValue == null || selectedValue === "") return placeholder;
  const match = items.find((item) => item.value === selectedValue);
  if (match?.label != null) return match.label;
  return typeof selectedValue === "string" ? selectedValue : placeholder;
}

export function Select({
  items,
  placeholder = "Select…",
  className,
  alignItemWithTrigger = false,
  size = "default",
  /** @deprecated Use size="full" */
  fullWidth = false,
  /** Keep the list inside the trigger subtree (e.g. nested in another popover). */
  disablePortal = false,
  onValueChange,
  "aria-label": ariaLabel,
  value: valueProp,
  required,
  clearable,
  ...props
}: Omit<ComponentProps<typeof BaseSelect.Root>, "className" | "onValueChange"> & {
  items: readonly SelectItem[];
  placeholder?: string;
  className?: string;
  alignItemWithTrigger?: boolean;
  /** Table cells: fill width and drop hard min-w-44. */
  fullWidth?: boolean;
  disablePortal?: boolean;
  size?: ControlSize;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
  required?: boolean;
  clearable?: boolean;
}) {
  const resolvedSize: ControlSize = fullWidth ? "full" : size;
  const positionerClassName = useDropdownPositionerClassName("align-start");
  const value = resolveControlledSelectValue(valueProp, items);
  const showClear = isFieldClearable({ clearable, required }) && Boolean(value);
  const popup = (
    <BaseSelect.Positioner
      {...selectPositionerProps()}
      align="start"
      alignItemWithTrigger={alignItemWithTrigger}
      className={cn(positionerClassName)}
      sideOffset={4}
    >
      <BaseSelect.Popup className={cn(selectPopupClassName())}>
        <BaseSelect.ScrollUpArrow
          className={selectPopupScrollArrowClassName("up")}
        >
          <NavArrowUp width={14} height={14} aria-hidden />
        </BaseSelect.ScrollUpArrow>
        <BaseSelect.List className={selectPopupListClassName()}>
          {items.map((item) => (
            <BaseSelect.Item
              key={item.value}
              value={item.value}
              label={
                typeof item.label === "string"
                  ? item.label
                  : item.label != null
                    ? String(item.label)
                    : item.value
              }
              className={cn(
                "grid cursor-default grid-cols-[1.25rem_1fr] items-center gap-2 py-2 pr-4 pl-2 text-base outline-none select-none",
                "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
              )}
            >
              <BaseSelect.ItemIndicator className="col-start-1">
                <Check width={16} height={16} aria-hidden />
              </BaseSelect.ItemIndicator>
              <BaseSelect.ItemText className={selectPopupItemTextClassName()}>
                {item.label}
              </BaseSelect.ItemText>
            </BaseSelect.Item>
          ))}
        </BaseSelect.List>
        <BaseSelect.ScrollDownArrow
          className={selectPopupScrollArrowClassName("down")}
        >
          <NavArrowDown width={14} height={14} aria-hidden />
        </BaseSelect.ScrollDownArrow>
      </BaseSelect.Popup>
    </BaseSelect.Positioner>
  );
  return (
    <div
      className={cn(
        "relative",
        resolvedSize === "default" ? "inline-flex" : "w-full",
      )}
    >
      <BaseSelect.Root
        items={items}
        {...props}
        value={value}
        onValueChange={onValueChange ? (value) => onValueChange(String(value)) : undefined}
      >
        <BaseSelect.Trigger
          aria-label={ariaLabel}
          className={cn(
            selectTriggerClassName({ size: resolvedSize }),
            showClear && "pr-10",
            className,
          )}
        >
          <BaseSelect.Value className={selectValueClassName()} placeholder={placeholder}>
            {(selectedValue) => resolveItemLabel(items, selectedValue, placeholder)}
          </BaseSelect.Value>
          <BaseSelect.Icon className="shrink-0 text-text-muted">
            <NavArrowDown width={16} height={16} aria-hidden />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        {disablePortal ? popup : <BaseSelect.Portal>{popup}</BaseSelect.Portal>}
      </BaseSelect.Root>
      {showClear ? (
        <ClearFieldButton
          label="Clear selection"
          className="right-8"
          onClear={() => onValueChange?.("")}
        />
      ) : null}
    </div>
  );
}
