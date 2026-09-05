"use client";

import { type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  crossfade,
  crossfadeInstant,
  crossfadeOpacity,
  staggerItem,
  staggerList,
} from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

export type AsyncPanelState =
  | "idle"
  | "hint"
  | "loading"
  | "empty"
  | "error"
  | "ready";

export type AsyncPanelStableHeight = "none" | "popover" | "inline";

/** Fixed height for combobox popover list regions (12rem). */
export const ASYNC_PANEL_POPOVER_HEIGHT_CLASS = "min-h-48 max-h-48";

/** Fixed height for inline search panels (20rem). */
export const ASYNC_PANEL_INLINE_HEIGHT_CLASS = "min-h-80 max-h-80";

export type DeriveAsyncPanelStateInput = {
  enabled: boolean;
  queryLength: number;
  minLength: number;
  isError: boolean;
  isFetching: boolean;
  resultCount: number;
};

export function deriveAsyncPanelState(input: DeriveAsyncPanelStateInput): AsyncPanelState {
  if (!input.enabled) return "idle";
  if (input.queryLength < input.minLength) return "hint";
  if (input.isError) return "error";
  if (input.isFetching && input.resultCount === 0) return "loading";
  if (input.resultCount === 0) return "empty";
  return "ready";
}

const centeredMuted = "px-4 text-center text-sm text-text-muted";

function stableHeightClass(stableHeight: AsyncPanelStableHeight): string {
  if (stableHeight === "popover") return ASYNC_PANEL_POPOVER_HEIGHT_CLASS;
  if (stableHeight === "inline") return ASYNC_PANEL_INLINE_HEIGHT_CLASS;
  return "";
}

/** Scrollport for stable-height panels — explicit flex shrink, not percentage height. */
function stableScrollRegionClass(isStable: boolean): string {
  return isStable ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "";
}

function StableCentered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain">
      {children}
    </div>
  );
}

export type AsyncContentPanelProps = {
  state: AsyncPanelState;
  ariaBusy?: boolean;
  className?: string;
  stableHeight?: AsyncPanelStableHeight;
  idle?: ReactNode;
  hint?: ReactNode;
  empty?: ReactNode;
  error?: ReactNode;
  loading?: ReactNode;
  children?: ReactNode;
  staggerResults?: boolean;
};

export function AsyncContentPanel({
  state,
  ariaBusy = false,
  className,
  stableHeight = "none",
  idle,
  hint,
  empty,
  error,
  loading,
  children,
  staggerResults = false,
}: AsyncContentPanelProps) {
  const reducedMotion = useReducedMotion();
  const isStable = stableHeight !== "none";
  const stateVariants = reducedMotion
    ? crossfadeInstant
    : isStable
      ? crossfadeOpacity
      : crossfade;
  const resultsContainerVariants = reducedMotion ? crossfadeInstant : staggerList;

  const renderCentered = (content: ReactNode, extraClassName?: string) => {
    const inner =
      typeof content === "string" ? (
        <p className={cn(centeredMuted, extraClassName)}>{content}</p>
      ) : (
        content
      );
    return isStable ? <StableCentered>{inner}</StableCentered> : inner;
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-surface",
        isStable && "flex flex-col",
        stableHeightClass(stableHeight),
        className,
      )}
      aria-busy={ariaBusy}
    >
      <div className={cn(isStable && "flex min-h-0 flex-1 flex-col")}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={state}
            className={cn(isStable && "flex min-h-0 flex-1 flex-col")}
            variants={stateVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {state === "idle" && idle ? renderCentered(idle) : null}
            {state === "hint" && hint ? renderCentered(hint) : null}
            {state === "loading" && loading ? (
              isStable ? (
                <div
                  className={stableScrollRegionClass(isStable)}
                  onWheel={(event) => {
                    event.stopPropagation();
                  }}
                >
                  {loading}
                </div>
              ) : (
                loading
              )
            ) : null}
            {state === "error" && error ? (
              typeof error === "string" ? (
                isStable ? (
                  <StableCentered>
                    <p className={cn(centeredMuted, "text-destructive")} role="alert">
                      {error}
                    </p>
                  </StableCentered>
                ) : (
                  <p className={cn(centeredMuted, "text-destructive")} role="alert">
                    {error}
                  </p>
                )
              ) : isStable ? (
                <StableCentered>{error}</StableCentered>
              ) : (
                error
              )
            ) : null}
            {state === "empty" && empty ? renderCentered(empty) : null}
            {state === "ready" && children ? (
              staggerResults ? (
                <motion.div
                  className={stableScrollRegionClass(isStable)}
                  variants={resultsContainerVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  onWheel={(event) => {
                    event.stopPropagation();
                  }}
                >
                  {children}
                </motion.div>
              ) : (
                <div
                  className={stableScrollRegionClass(isStable)}
                  onWheel={(event) => {
                    event.stopPropagation();
                  }}
                >
                  {children}
                </div>
              )
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function AsyncContentPanelRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const resultRowVariants = reducedMotion ? crossfadeOpacity : staggerItem;

  return (
    <motion.div variants={resultRowVariants} className={className}>
      {children}
    </motion.div>
  );
}
