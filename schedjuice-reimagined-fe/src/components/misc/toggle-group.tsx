"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ToggleGroupProps = {
  type?: "single" | "multiple";
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children?: React.ReactNode;
  /** Accepted for call-site compatibility; ignored. */
  variant?: string;
  /** Accepted for call-site compatibility; ignored. */
  size?: string;
};

type ToggleGroupItemProps = {
  value: string;
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  /** Accepted for call-site compatibility; ignored. */
  variant?: string;
  /** Accepted for call-site compatibility; ignored. */
  size?: string;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "type" | "onClick" | "disabled" | "children" | "className"
>;

const ToggleGroupContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
}>({});

function ToggleGroup({
  type = "single",
  value,
  onValueChange,
  className,
  children,
  variant,
  size,
}: ToggleGroupProps) {
  void type;
  void variant;
  void size;
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange }}>
      <div
        role="group"
        className={cn("flex items-center justify-center gap-1", className)}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

function ToggleGroupItem({
  value,
  className,
  children,
  disabled,
  variant,
  size,
  ...rest
}: ToggleGroupItemProps) {
  void variant;
  void size;
  const ctx = React.useContext(ToggleGroupContext);
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      data-state={selected ? "on" : "off"}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary transition-colors",
        "hover:bg-surface-hover hover:text-text-primary",
        "data-[state=on]:border-accent data-[state=on]:bg-accent/10 data-[state=on]:text-text-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      onClick={() => ctx.onValueChange?.(value)}
      {...rest}
    >
      {children}
    </button>
  );
}

export { ToggleGroup, ToggleGroupItem };
