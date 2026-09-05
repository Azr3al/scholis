"use client";

import type { ReactNode } from "react";

import { FullscreenExitButton } from "@/components/layout/fullscreen-exit-button";
import { cn } from "@/lib/utils";

/** Legacy constant — prefer flex layout over manual subtraction when possible. */
export const SHEET_FULLSCREEN_TOP_BAR_HEIGHT_PX = 40;
export const SHEET_FULLSCREEN_CONTROLS_HEIGHT_PX = 40;

interface SheetFullscreenShellProps {
  title: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  controls?: ReactNode;
  main: ReactNode;
  sidePanel?: ReactNode;
  dock?: ReactNode;
  layout?: "split" | "grid-first";
  className?: string;
  /** Override the main+side grid template. Default keeps legacy 16rem side column. */
  sidePanelGridClassName?: string;
}

export function SheetFullscreenShell({
  title,
  summary,
  actions,
  controls,
  main,
  sidePanel,
  dock,
  layout = "split",
  className,
  sidePanelGridClassName,
}: SheetFullscreenShellProps) {
  const useSidePanel = Boolean(sidePanel);
  const isGridFirst = layout === "grid-first" && !useSidePanel;

  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 flex-1 w-full min-w-0 flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background px-3 py-2">
        <div className="flex min-w-0 flex-1 basis-[10rem] items-center gap-2">
          <div className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
            {title}
          </div>
          {summary ? (
            <div className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
              {summary}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </header>

      {controls ? (
        <div className="shrink-0 border-b border-border bg-muted/35">
          <div className="flex min-w-0 items-end gap-3 overflow-x-auto px-3 py-2 [&>*]:shrink-0">
            {controls}
          </div>
        </div>
      ) : null}

      {isGridFirst ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {main}
          </div>
          {dock ? (
            <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col gap-2 [&>*]:pointer-events-auto">
              {dock}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "grid min-h-0 flex-1 overflow-hidden",
            useSidePanel
              ? (sidePanelGridClassName ??
                "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem]")
              : "grid-cols-1",
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            {main}
          </div>
          {sidePanel ? (
            <aside
              className={
                sidePanelGridClassName
                  ? "min-h-0 max-h-64 overflow-hidden lg:max-h-none"
                  : "min-h-0 max-h-64 overflow-auto border-t border-border bg-muted/10 lg:max-h-none lg:border-l lg:border-t-0"
              }
            >
              {sidePanel}
            </aside>
          ) : null}
        </div>
      )}

      <FullscreenExitButton />
    </section>
  );
}
