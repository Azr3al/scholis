import { useEffect, type RefObject } from "react";
import type { DataEditorRef, Item } from "@glideapps/glide-data-grid";

export function useShimmerLoop(
  gridRef: RefObject<DataEditorRef | null>,
  resolvingCells: { cell: Item }[],
) {
  useEffect(() => {
    if (resolvingCells.length === 0) return;
    let raf = 0;
    const tick = () => {
      gridRef.current?.updateCells(resolvingCells);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gridRef, resolvingCells]);
}
