/** Reset `#main-content` scroll and notify scroll-linked UI (e.g. profile cover). */
export function resetMainContentScroll() {
  const main = document.getElementById("main-content");
  if (!main) return;
  main.scrollTop = 0;
  main.dispatchEvent(new Event("scroll"));
}

export const COMPOSER_TITLE_VIEWPORT_RATIO = 0.3;
/** Award grant title sits lower than the feed composer — below course record chrome. */
export const AWARD_GRANT_TITLE_VIEWPORT_RATIO = 0.4;
export const COMPOSER_TITLE_SCROLL_MIN_DELTA_PX = 48;

/** Scroll delta to align an element's top edge with a viewport ratio (px). */
export function computeScrollDeltaForViewportTarget(
  elementViewportTop: number,
  viewportHeight: number,
  targetRatio = COMPOSER_TITLE_VIEWPORT_RATIO,
  minDelta = COMPOSER_TITLE_SCROLL_MIN_DELTA_PX,
  viewportOffsetTop = 0,
): number | null {
  const targetTop = viewportOffsetTop + viewportHeight * targetRatio;
  const delta = elementViewportTop - targetTop;
  if (Math.abs(delta) < minDelta) return null;
  return delta;
}

/** Smoothly scroll `#main-content` so `element` sits near a viewport ratio. */
export function scrollElementToViewportRatio(
  element: HTMLElement,
  options?: {
    targetRatio?: number;
    minDelta?: number;
    scrollContainer?: HTMLElement | null;
    relativeToContainer?: boolean;
  },
) {
  const main =
    options?.scrollContainer ?? document.getElementById("main-content");
  if (!main) return;

  const relativeToContainer = options?.relativeToContainer === true;
  const mainRect = main.getBoundingClientRect();
  const delta = computeScrollDeltaForViewportTarget(
    element.getBoundingClientRect().top,
    relativeToContainer ? main.clientHeight : window.innerHeight,
    options?.targetRatio,
    options?.minDelta,
    relativeToContainer ? mainRect.top : 0,
  );
  if (delta == null) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  main.scrollTo({
    top: Math.max(0, main.scrollTop + delta),
    behavior: reduceMotion ? "auto" : "smooth",
  });
  main.dispatchEvent(new Event("scroll"));
}

/** Scroll delta to restore an element's viewport Y after in-flow content collapses. */
export function computeScrollDeltaToRestoreViewportAnchor(
  previousViewportTop: number,
  currentViewportTop: number,
): number {
  return currentViewportTop - previousViewportTop;
}

/** Scroll `#main-content` so `element` returns to a saved viewport anchor. */
export function restoreMainContentViewportAnchor(
  previousViewportTop: number,
  element: HTMLElement,
  options?: { scrollContainer?: HTMLElement | null },
): void {
  const main =
    options?.scrollContainer ?? document.getElementById("main-content");
  if (!main) return;

  const delta = computeScrollDeltaToRestoreViewportAnchor(
    previousViewportTop,
    element.getBoundingClientRect().top,
  );
  if (delta === 0) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  main.scrollTo({
    top: Math.max(0, main.scrollTop + delta),
    behavior: reduceMotion ? "auto" : "smooth",
  });
  main.dispatchEvent(new Event("scroll"));
}
