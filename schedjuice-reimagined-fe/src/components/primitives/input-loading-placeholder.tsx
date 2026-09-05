"use client";

import { TextShimmer } from "@/components/misc/text-shimmer";
import { crossfadeInstant, crossfadeOpacity } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/** Matches resting input placeholder typography (`inputClassName`). */
export const inputLoadingPlaceholderClassName =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-text-muted";

export function InputLoadingPlaceholder({
  show,
  children,
  className,
}: {
  show: boolean;
  children: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? crossfadeInstant : crossfadeOpacity;

  return (
    <>
      {show ? (
        <span className="sr-only" role="status">
          {children}
        </span>
      ) : null}
      <AnimatePresence initial={false}>
        {show ? (
          <motion.span
            key="input-loading-placeholder"
            aria-hidden
            className={cn(inputLoadingPlaceholderClassName, className)}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <TextShimmer className="text-base">{children}</TextShimmer>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </>
  );
}
