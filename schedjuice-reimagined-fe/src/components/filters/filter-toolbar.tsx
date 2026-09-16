"use client";

import { dashboardFilterToolbarClassName } from "@/lib/ui-remediation/r7-dashboard-layout-classes";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type FilterFieldLayout = "form" | "toolbar";

export type FilterToolbarFieldWidth = "sm" | "md" | "lg" | "auto";

const FILTER_TOOLBAR_FIELD_WIDTH: Record<FilterToolbarFieldWidth, string> = {
  sm: "min-w-[140px]",
  md: "min-w-[180px]",
  lg: "min-w-[200px]",
  auto: "",
};

type FilterToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function FilterToolbar({ children, className }: FilterToolbarProps) {
  return (
    <div className={cn(dashboardFilterToolbarClassName(), className)}>
      {children}
    </div>
  );
}

type FilterToolbarFieldProps = {
  label: string;
  htmlFor?: string;
  width?: FilterToolbarFieldWidth;
  className?: string;
  children: ReactNode;
};

export function FilterToolbarField({
  label,
  htmlFor,
  width = "md",
  className,
  children,
}: FilterToolbarFieldProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        FILTER_TOOLBAR_FIELD_WIDTH[width],
        className,
      )}
    >
      <label htmlFor={htmlFor} className="text-sm text-text-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}

export function filterToolbarLabelClassName(): string {
  return "text-sm text-text-secondary";
}

export function filterToolbarFieldStackClassName(): string {
  return "flex min-w-0 flex-col gap-1.5";
}

type FilterToolbarActionProps = {
  children: ReactNode;
  className?: string;
};

export function FilterToolbarAction({ children, className }: FilterToolbarActionProps) {
  return (
    <div className={cn(filterToolbarFieldStackClassName(), className)}>
      <span
        className={cn(filterToolbarLabelClassName(), "invisible select-none")}
        aria-hidden="true"
      >
        Action
      </span>
      {children}
    </div>
  );
}
