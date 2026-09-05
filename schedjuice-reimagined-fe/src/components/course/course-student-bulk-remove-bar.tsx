"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/primitives";
import { crossfadeInstant, revealBar } from "@/lib/sj/motion";

export function CourseStudentBulkRemoveBar({
  count,
  disabled,
  onClear,
  onRemove,
}: {
  count: number;
  disabled?: boolean;
  onClear: () => void;
  onRemove: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const variants = reducedMotion ? crossfadeInstant : revealBar;

  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.div
          key="bulk-remove-bar"
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-2 motion-reduce:transition-none"
        >
          <span className="text-sm font-medium">
            {count} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={onClear}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={disabled}
              onClick={onRemove}
            >
              Remove from class
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
