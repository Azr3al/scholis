"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export function RequiredMark() {
  return <span className="text-danger"> *</span>;
}

export function OptionalMark() {
  return (
    <span className="text-muted-foreground text-xs font-normal"> · optional</span>
  );
}

const morphEase = [0.22, 1, 0.36, 1] as const;

/** Swaps · optional ↔ * with a short crossfade when `required` toggles. */
export function FieldLabelSuffix({ required }: { required: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="inline-grid align-baseline [grid-template-areas:'stack']">
      <AnimatePresence initial={false}>
        <motion.span
          key={required ? "required" : "optional"}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.1,
            ease: morphEase,
          }}
          className="[grid-area:stack] inline-block"
        >
          {required ? <RequiredMark /> : <OptionalMark />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
