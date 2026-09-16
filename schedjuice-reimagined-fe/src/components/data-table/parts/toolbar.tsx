import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ToolbarClassNameOptions = {
  sticky?: boolean;
  unified?: boolean;
};

export type ToolbarProps = {
  search?: ReactNode;
  filterSlot?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** When false, toolbar is pinned in a flex column instead of sticky-in-scroll. */
  sticky?: boolean;
  /** Toolbar sits inside unified list chrome — no standalone surface fill. */
  unified?: boolean;
};

export function resourceTableListChromeClassName(): string {
  return "overflow-hidden rounded-md border border-border-subtle bg-surface";
}

export function toolbarClassName(
  stickyOrOptions: boolean | ToolbarClassNameOptions = true,
): string {
  const options: ToolbarClassNameOptions =
    typeof stickyOrOptions === "boolean"
      ? { sticky: stickyOrOptions, unified: false }
      : { sticky: true, unified: false, ...stickyOrOptions };

  const { sticky = true, unified = false } = options;

  return cn(
    "flex flex-wrap items-center gap-3",
    "border-b border-border-subtle py-3",
    unified ? "px-3" : undefined,
    unified ? (sticky ? "bg-surface" : undefined) : "bg-surface",
    sticky ? "sticky top-0 z-10" : "shrink-0",
  );
}

/** Sticky list chrome: search + optional filter chips + trailing actions. */
export function Toolbar({
  search,
  filterSlot,
  actions,
  footer,
  className,
  sticky = true,
  unified = false,
}: ToolbarProps) {
  return (
    <div
      className={cn(
        toolbarClassName({ sticky, unified }),
        footer ? "flex-col items-stretch gap-0" : undefined,
        className,
      )}
    >
      <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
        {search ? <div className="min-w-0 flex-1">{search}</div> : null}
        {filterSlot ? (
          <div className="flex flex-wrap items-center gap-2">{filterSlot}</div>
        ) : null}
        {actions ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {footer ? <div className="w-full pb-3 pt-1">{footer}</div> : null}
    </div>
  );
}
