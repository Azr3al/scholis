"use client";

import { useMemo, useRef, type RefObject } from "react";

import type { DataEditorRef } from "@glideapps/glide-data-grid";
import type { CellResolution } from "@/lib/imports/resolution";

import {
  AnchoredImportPopover,
  type MatchAnchorRect,
} from "./user-match/anchored-import-popover";
import { UserMatchPopoverContent } from "./user-match/user-match-popover-content";
import { useScrollAnchoredOverlayPosition } from "./user-match/use-scroll-anchored-overlay-position";

export type UserMatchTarget = {
  sourceRow: number;
  anchorCol: number;
  anchorRow: number;
  rawEmail: string;
  importedName?: string;
  rect: MatchAnchorRect;
  cell: CellResolution;
};

export function UserMatchPopover({
  target,
  gridRef,
  onResolve,
  onClose,
}: {
  target: UserMatchTarget | null;
  gridRef: RefObject<DataEditorRef | null>;
  onResolve: (next: CellResolution) => void;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const anchorCell = useMemo(
    () =>
      target
        ? { col: target.anchorCol, row: target.anchorRow }
        : null,
    [target],
  );

  useScrollAnchoredOverlayPosition({
    open: Boolean(target),
    anchorCell,
    gridRef,
    overlayRef,
    fallbackRect: target?.rect ?? null,
  });

  return (
    <AnchoredImportPopover
      variant="fixed"
      rect={target?.rect ?? null}
      open={Boolean(target)}
      onClose={onClose}
      overlayRef={overlayRef}
      popupClassName="click-outside-ignore fixed left-0 top-0 z-dropdown w-72 max-w-[min(18rem,calc(100vw-1rem))] rounded-md border border-border bg-surface-elevated p-3 text-text-primary shadow-md"
      popupStyle={{ willChange: "transform" }}
    >
      {target ? (
        <UserMatchPopoverContent
          mode="org"
          cell={target.cell}
          rawEmail={target.rawEmail}
          importedName={target.importedName}
          onResolve={onResolve}
          onClose={onClose}
        />
      ) : null}
    </AnchoredImportPopover>
  );
}
