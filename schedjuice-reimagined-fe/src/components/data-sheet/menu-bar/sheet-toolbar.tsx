"use client";
import { Button } from "@/components/primitives";

import type { ReactNode, Ref } from "react";

import { Undo as Undo2, Redo as Redo2, Copy, PasteClipboard as ClipboardPaste, Search, ViewColumns3 as Columns3, Expand as Maximize2, TableRows as Rows3, Type, CornerBottomRight as CornerDownRight } from "iconoir-react";
import { cn } from "@/lib/utils";

export interface ToolbarAction {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  /** When provided, this node is rendered in place of the default button. */
  node?: ReactNode;
}

export function SheetToolbar({
  actions,
  leading,
  right,
  compact = false,
  containerRef,
  contentRef,
}: {
  actions: ToolbarAction[];
  leading?: ReactNode;
  right?: ReactNode;
  /** When true, hide action text labels (icons + aria-label remain). */
  compact?: boolean;
  containerRef?: Ref<HTMLDivElement>;
  contentRef?: Ref<HTMLDivElement>;
}) {
  if (actions.length === 0 && !right && !leading) return null;
  return (
    <div
      ref={containerRef}
      className="flex h-7 shrink-0 items-center overflow-hidden border-b border-border bg-muted/30 px-1.5 py-0"
    >
      <div
        ref={contentRef}
        className="flex min-w-0 flex-1 items-center gap-0.5"
      >
        {leading}
        {actions.map((a) =>
          a.node ? (
            <span key={a.id}>{a.node}</span>
          ) : (
            <Button
              key={a.id}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 gap-1 text-[11px] text-foreground/70 active:scale-[0.96]",
                compact ? "px-1.5" : "px-2",
              )}
              disabled={a.disabled}
              title={a.label}
              aria-label={a.label}
              onClick={a.onClick}
            >
              {a.icon}
              {!compact ? <span>{a.label}</span> : null}
            </Button>
          ),
        )}
        {right ? (
          <div className={cn("ml-auto flex shrink-0 items-center gap-1.5")}>
            {right}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const TOOLBAR_ICONS = {
  undo: <Undo2 className="size-3.5" aria-hidden />,
  redo: <Redo2 className="size-3.5" aria-hidden />,
  copy: <Copy className="size-3.5" aria-hidden />,
  paste: <ClipboardPaste className="size-3.5" aria-hidden />,
  find: <Search className="size-3.5" aria-hidden />,
  columns: <Columns3 className="size-3.5" aria-hidden />,
  fit: <Maximize2 className="size-3.5" aria-hidden />,
  density: <Rows3 className="size-3.5" aria-hidden />,
  font: <Type className="size-3.5" aria-hidden />,
  goto: <CornerDownRight className="size-3.5" aria-hidden />,
};
