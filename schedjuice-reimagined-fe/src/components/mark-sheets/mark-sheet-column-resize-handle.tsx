"use client";

import { useCallback } from "react";

import { columnResizeHandleClassName } from "@/components/data-table/table";

const MIN_COLUMN_WIDTH = 60;

type Props = {
  onResize: (width: number) => void;
  getWidth: () => number;
};

export function MarkSheetColumnResizeHandle({ onResize, getWidth }: Props) {
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = getWidth();

      const onPointerMove = (move: PointerEvent) => {
        onResize(Math.max(MIN_COLUMN_WIDTH, startWidth + (move.clientX - startX)));
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [getWidth, onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      className={columnResizeHandleClassName()}
      onPointerDown={onPointerDown}
    />
  );
}
