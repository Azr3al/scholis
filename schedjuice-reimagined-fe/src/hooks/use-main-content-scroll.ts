"use client";

import { useEffect, useRef } from "react";

export const COVER_COLLAPSE_DISTANCE = 200;
export const COVER_EXPANDED_HEIGHT_MOBILE = 280;
export const COVER_EXPANDED_HEIGHT_DESKTOP = 320;
export const COVER_COLLAPSED_HEIGHT = 72;

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function applyCoverScrollStyles(
  coverEl: HTMLElement,
  scrollTop: number,
  collapseDistance: number,
  reduceMotion: boolean,
  expandedHeight: number,
) {
  const progress = reduceMotion
    ? 0
    : Math.min(1, Math.max(0, scrollTop / collapseDistance));

  const height = reduceMotion
    ? expandedHeight
    : lerp(expandedHeight, COVER_COLLAPSED_HEIGHT, progress);
  const opacity = reduceMotion ? 1 : 1 - progress;

  coverEl.style.setProperty("--cover-height", `${height}px`);
  coverEl.style.setProperty("--cover-opacity", String(opacity));
}

/** Scroll-linked cover collapse via CSS vars on `coverRef` — no React re-renders during scroll. */
export function useMainContentScroll(collapseDistance = COVER_COLLAPSE_DISTANCE) {
  const coverRef = useRef<HTMLDivElement>(null);
  const reduceMotionRef = useRef(false);
  const expandedHeightRef = useRef(COVER_EXPANDED_HEIGHT_MOBILE);

  useEffect(() => {
    const el = document.getElementById("main-content");
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const smMq = window.matchMedia("(min-width: 640px)");

    const syncExpandedHeight = () => {
      expandedHeightRef.current = smMq.matches
        ? COVER_EXPANDED_HEIGHT_DESKTOP
        : COVER_EXPANDED_HEIGHT_MOBILE;
    };

    const syncCover = () => {
      const cover = coverRef.current;
      if (!cover || !el) return;
      applyCoverScrollStyles(
        cover,
        el.scrollTop,
        collapseDistance,
        reduceMotionRef.current,
        expandedHeightRef.current,
      );
    };

    const onMotionChange = () => {
      reduceMotionRef.current = motionMq.matches;
      syncCover();
    };

    const onBreakpointChange = () => {
      syncExpandedHeight();
      syncCover();
    };

    reduceMotionRef.current = motionMq.matches;
    syncExpandedHeight();
    syncCover();

    motionMq.addEventListener("change", onMotionChange);
    smMq.addEventListener("change", onBreakpointChange);

    if (!el) {
      return () => {
        motionMq.removeEventListener("change", onMotionChange);
        smMq.removeEventListener("change", onBreakpointChange);
      };
    }

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncCover);
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      motionMq.removeEventListener("change", onMotionChange);
      smMq.removeEventListener("change", onBreakpointChange);
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [collapseDistance]);

  return { coverRef };
}
