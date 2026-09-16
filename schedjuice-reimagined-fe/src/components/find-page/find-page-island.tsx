"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { islandLayoutTransition } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import type { FindPagePanelRect } from "./use-find-page";

export const NOTCH_WIDTH = 208;
export const NOTCH_WIDTH_COMPACT = 160;
export const NOTCH_HEIGHT = 34;
export const SKIRT_SIZE = 28;

/** Matches PanelHeader row height (`h-12`). */
export const PANEL_HEADER_HEIGHT = 48;

/** Approximate width reserved beside notch for Tips + gap (border mask). */
export const TIPS_LINK_RESERVE = 48;

export const FIND_PAGE_TITLE_ID = "find-page-title";
export const FIND_PAGE_DESC_ID = "find-page-desc";

type FindPageIslandProps = {
  open: boolean;
  layout: boolean;
  compact?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Dynamic Island shell — layout-driven morph from docked notch tab to rounded-3xl dialog.
 */
export function FindPageIsland({
  open,
  layout,
  compact = false,
  className,
  children,
}: FindPageIslandProps) {
  return (
    <motion.div
      layout={layout}
      style={{ transformOrigin: "top", originX: 0.5, originY: 0 }}
      transition={islandLayoutTransition}
      className={cn(
        "sj-root relative flex flex-col overflow-hidden",
        "bg-[var(--find-page-ink)] text-[var(--find-page-ink-text)]",
        "border border-[var(--find-page-ink-border)]",
        "px-3 ring-1 ring-inset ring-white/8",
        open ? "py-2.5" : "py-0",
        open
          ? cn(
              "min-w-[min(448px,calc(100vw-48px))] rounded-3xl",
              "shadow-[0_8px_24px_-8px_rgb(16_44_36/0.45)]",
            )
          : cn(
              "min-h-[34px] items-center justify-center",
              compact ? "w-[160px]" : "w-[208px]",
              "rounded-t-none rounded-b-[20px] border-t-0",
              "shadow-[0_4px_14px_-6px_color-mix(in_srgb,var(--text-primary)_22%,transparent)]",
            ),
        className,
      )}
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-labelledby={open ? FIND_PAGE_TITLE_ID : undefined}
      aria-describedby={open ? FIND_PAGE_DESC_ID : undefined}
      aria-label={open ? undefined : "Find a page"}
    >
      {children}
    </motion.div>
  );
}

type FindPageNotchSkirtProps = {
  panelRect: FindPagePanelRect;
  dockCenterX: number;
  notchWidth: number;
};

/**
 * Shoulder grooves — a soft curved gradient where the panel's top edge eases
 * down into each side of the docked notch.
 *
 * The notch and panel share the same surface colour, so a fill-based fillet is
 * invisible. Instead each corner is drawn as a curved groove using
 * `--text-primary` at low opacity: it reads as a shadow on the cream panel
 * (light) and as a highlight on the ink panel (dark), staying visible in both.
 */
export function FindPageNotchSkirt({
  panelRect,
  dockCenterX,
  notchWidth,
}: FindPageNotchSkirtProps) {
  const notchLeft = dockCenterX - notchWidth / 2;
  const notchRight = dockCenterX + notchWidth / 2;
  const shoulderTop = panelRect.top;
  const size = SKIRT_SIZE;

  const groove = (corner: "top right" | "top left") =>
    [
      `radial-gradient(circle at ${corner},`,
      `transparent 0 ${size - 10}px,`,
      `color-mix(in srgb, var(--text-primary) 24%, transparent) ${size - 4}px,`,
      `color-mix(in srgb, var(--text-primary) 6%, transparent) ${size}px,`,
      `transparent ${size + 4}px)`,
    ].join(" ");

  const filletStyle = {
    width: size + 4,
    height: size + 4,
  };

  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none fixed z-[49]"
        style={{
          ...filletStyle,
          top: shoulderTop,
          left: notchLeft - (size + 4),
          background: groove("top right"),
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none fixed z-[49]"
        style={{
          ...filletStyle,
          top: shoulderTop,
          left: notchRight,
          background: groove("top left"),
        }}
      />
    </>
  );
}
