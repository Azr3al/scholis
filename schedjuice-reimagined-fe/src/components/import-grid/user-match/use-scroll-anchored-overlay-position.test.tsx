/** @vitest-environment happy-dom */
import { renderHook } from "@testing-library/react";
import type { DataEditorRef } from "@glideapps/glide-data-grid";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SCROLL_ANCHOR_GAP,
  useScrollAnchoredOverlayPosition,
} from "./use-scroll-anchored-overlay-position";

describe("useScrollAnchoredOverlayPosition", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("positions the overlay from fresh grid bounds on each sync", () => {
    const gridRef = createRef<DataEditorRef | null>();
    const overlayRef = createRef<HTMLDivElement | null>();
    const overlay = document.createElement("div");
    overlayRef.current = overlay;

    gridRef.current = {
      getBounds: vi.fn(() => ({ x: 40, y: 80, width: 120, height: 36 })),
    } as unknown as DataEditorRef;

    const { result } = renderHook(() =>
      useScrollAnchoredOverlayPosition({
        open: true,
        anchorCell: { col: 1, row: 2 },
        gridRef,
        overlayRef,
      }),
    );

    result.current();

    expect(gridRef.current?.getBounds).toHaveBeenCalledWith(1, 2);
    expect(overlay.style.transform).toBe(
      `translate3d(40px, ${80 + 36 + SCROLL_ANCHOR_GAP}px, 0)`,
    );
  });

  it("falls back to the open-time rect when grid bounds are unavailable", () => {
    const gridRef = createRef<DataEditorRef | null>();
    const overlayRef = createRef<HTMLDivElement | null>();
    const overlay = document.createElement("div");
    overlayRef.current = overlay;

    gridRef.current = {
      getBounds: vi.fn(() => undefined),
    } as unknown as DataEditorRef;

    const { result } = renderHook(() =>
      useScrollAnchoredOverlayPosition({
        open: true,
        anchorCell: { col: 1, row: 2 },
        gridRef,
        overlayRef,
        fallbackRect: { x: 40, y: 80, width: 120, height: 36 },
      }),
    );

    result.current();

    expect(overlay.style.transform).toBe(
      `translate3d(40px, ${80 + 36 + SCROLL_ANCHOR_GAP}px, 0)`,
    );
  });
});
