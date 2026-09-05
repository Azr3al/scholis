"use client";

import { useEffect, useState, type RefObject } from "react";

const MIN_HEIGHT = 120;
const HEIGHT_CHANGE_THRESHOLD = 2;

/** Tracks an element's content height via ResizeObserver (min 120px). */
export function useContainerHeight(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
): number {
  const [height, setHeight] = useState(520);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let rafId = 0;

    const measure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const next = Math.floor(el.getBoundingClientRect().height);
        if (next <= 0) return;
        const clamped = Math.max(MIN_HEIGHT, next);
        setHeight((prev) =>
          Math.abs(prev - clamped) < HEIGHT_CHANGE_THRESHOLD ? prev : clamped,
        );
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remeasure when layout deps change
  }, [ref, ...deps]);

  return height;
}
