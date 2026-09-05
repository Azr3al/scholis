import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { DataEditorRef } from "@glideapps/glide-data-grid";

import type { MatchAnchorRect } from "./anchored-import-popover";

export const SCROLL_ANCHOR_GAP = 4;

export type ScrollAnchorCell = {
  col: number;
  row: number;
} | null;

type Options = {
  open: boolean;
  anchorCell: ScrollAnchorCell;
  gridRef: RefObject<DataEditorRef | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  fallbackRect?: MatchAnchorRect | null;
};

function positionFromRect(rect: MatchAnchorRect): { x: number; y: number } {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y + rect.height + SCROLL_ANCHOR_GAP),
  };
}

export function useScrollAnchoredOverlayPosition({
  open,
  anchorCell,
  gridRef,
  overlayRef,
  fallbackRect = null,
}: Options): () => void {
  const anchorCellRef = useRef(anchorCell);
  anchorCellRef.current = anchorCell;
  const fallbackRectRef = useRef(fallbackRect);
  fallbackRectRef.current = fallbackRect;

  const syncPosition = useCallback(() => {
    const cell = anchorCellRef.current;
    const el = overlayRef.current;
    if (!cell || !el) return;

    const bounds = gridRef.current?.getBounds(cell.col, cell.row);
    const position =
      bounds && bounds.width > 0
        ? {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y + bounds.height + SCROLL_ANCHOR_GAP),
          }
        : fallbackRectRef.current
          ? positionFromRect(fallbackRectRef.current)
          : null;

    if (!position) return;
    el.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
  }, [gridRef, overlayRef]);

  useEffect(() => {
    if (!open || !anchorCell) return;

    syncPosition();
    let frame = 0;
    const tick = () => {
      syncPosition();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onScroll = () => syncPosition();
    window.addEventListener("scroll", onScroll, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, anchorCell, syncPosition]);

  return syncPosition;
}
