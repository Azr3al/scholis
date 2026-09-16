"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { shouldCompactToolbar } from "@/components/data-sheet/lib/toolbar-compact";

/**
 * Measures a container vs an inner content row.
 * Defaults to expanded (false) until a positive measurement shows overflow.
 * Remembers the last expanded content width so collapsing labels cannot
 * immediately flip back to expanded (oscillation).
 */
export function useContainerOverflowCompact(
  containerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
): boolean {
  const [compact, setCompact] = useState(false);
  const expandedContentWidthRef = useRef(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      const containerW = container.clientWidth;
      const contentW = content.scrollWidth;
      setCompact((prev) => {
        if (!prev) {
          expandedContentWidthRef.current = contentW;
        }
        const needed = expandedContentWidthRef.current || contentW;
        return shouldCompactToolbar(containerW, needed);
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(content);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remeasure when layout deps change
  }, [containerRef, contentRef, ...deps]);

  return compact;
}
