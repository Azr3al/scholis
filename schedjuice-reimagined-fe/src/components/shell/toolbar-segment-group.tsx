"use client";

import { type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const GROUP_CLASS =
  "inline-flex h-8 items-center rounded-md border border-border bg-surface p-0.5";

const ICON_BTN =
  "inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors " +
  "duration-[var(--duration-fast)] hover:bg-surface-hover hover:text-text-primary " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

export function segmentButtonClassName(
  active: boolean,
  opts?: { icon?: boolean },
) {
  return cn(
    opts?.icon
      ? cn(ICON_BTN, "size-7")
      : "inline-flex h-7 items-center justify-center rounded px-3 text-sm transition-colors",
    active
      ? "bg-surface-active font-medium text-text-primary"
      : "text-text-secondary hover:text-text-primary",
  );
}

type GroupProps = ComponentProps<"div"> & {
  "aria-label"?: string;
  role?: "group" | "tablist";
};

export function ToolbarSegmentGroup({
  className,
  role = "group",
  ...props
}: GroupProps) {
  return (
    <div role={role} className={cn(GROUP_CLASS, className)} {...props} />
  );
}

type SegmentProps = ComponentProps<"button"> & {
  active?: boolean;
  icon?: boolean;
};

export function ToolbarSegment({
  active = false,
  icon = false,
  className,
  type = "button",
  ...props
}: SegmentProps) {
  return (
    <button
      type={type}
      className={cn(segmentButtonClassName(active, { icon }), className)}
      {...props}
    />
  );
}

type ToggleProps = SegmentProps & {
  count?: number | string;
  children: ReactNode;
};

export function ToolbarSegmentToggle({
  active = false,
  count,
  children,
  className,
  ...props
}: ToggleProps) {
  return (
    <ToolbarSegment
      active={active}
      aria-pressed={active}
      className={cn("gap-1 whitespace-nowrap", className)}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="text-xs opacity-80">{count}</span>
      ) : null}
    </ToolbarSegment>
  );
}
