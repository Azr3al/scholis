"use client";

import { NavArrowDown, NavArrowUp } from "iconoir-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc" | false;

export type SortableHeaderProps = {
  children: ReactNode;
  sorted?: SortDirection;
  onSort?: () => void;
  className?: string;
};

/**
 * Clickable column header with Iconoir sort affordance.
 * Parent owns sort cycle (typically none → asc → desc → none, or toggle).
 */
export function SortableHeader({
  children,
  sorted = false,
  onSort,
  className,
}: SortableHeaderProps) {
  return (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        "inline-flex items-center gap-1 font-sans text-sm font-medium",
        "transition-colors duration-[var(--duration-fast)]",
        sorted
          ? "text-text-primary"
          : "text-text-secondary hover:text-text-primary",
        className,
      )}
    >
      {children}
      {sorted === "asc" ? (
        <NavArrowUp width={14} height={14} aria-hidden className="shrink-0" />
      ) : sorted === "desc" ? (
        <NavArrowDown width={14} height={14} aria-hidden className="shrink-0" />
      ) : (
        <span className="inline-block size-3.5 shrink-0 opacity-0" aria-hidden />
      )}
    </button>
  );
}
