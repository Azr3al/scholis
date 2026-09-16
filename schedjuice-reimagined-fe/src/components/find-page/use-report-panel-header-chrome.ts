"use client";

import { useContext, useEffect, type RefObject } from "react";
import { FindPageContext } from "./use-find-page";

/** Reports PanelHeader left/right cluster bounds for Find Page dock collision avoidance. */
export function useReportPanelHeaderChrome(
  leftClusterRef: RefObject<HTMLElement | null>,
  rightClusterRef: RefObject<HTMLElement | null>,
) {
  const setHeaderChrome = useContext(FindPageContext)?.setHeaderChrome;

  useEffect(() => {
    if (!setHeaderChrome) return;

    const measure = () => {
      const left = leftClusterRef.current?.getBoundingClientRect();
      const right = rightClusterRef.current?.getBoundingClientRect();
      if (!left || !right) return;
      setHeaderChrome({
        leftChromeRight: left.right,
        rightChromeLeft: right.left,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    const leftEl = leftClusterRef.current;
    const rightEl = rightClusterRef.current;
    if (leftEl) ro.observe(leftEl);
    if (rightEl) ro.observe(rightEl);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      setHeaderChrome(null);
    };
  }, [leftClusterRef, rightClusterRef, setHeaderChrome]);
}
