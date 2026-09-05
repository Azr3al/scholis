"use client";

import { Button } from "@/components/primitives";
import { crossfadeInstant, revealBar } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type ScheduleSaveBarProps = {
  changeCount: number;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  className?: string;
};

export function ScheduleSaveBar({
  changeCount,
  isSaving,
  onSave,
  onDiscard,
  className,
}: ScheduleSaveBarProps) {
  const reducedMotion = useReducedMotion();
  const variants = reducedMotion ? crossfadeInstant : revealBar;

  return (
    <AnimatePresence initial={false}>
      {changeCount > 0 ? (
        <motion.div
          key="schedule-save-bar"
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className={cn(
            "-mx-4 overflow-hidden border-t border-border-subtle bg-surface-elevated/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
            "sticky bottom-0 z-sticky motion-reduce:transition-none",
            className,
          )}
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-secondary">
              <span className="font-semibold text-text-primary tabular-nums">
                {changeCount}
              </span>{" "}
              unsaved change{changeCount === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={onDiscard}>
                Discard
              </Button>
              <Button type="button" onClick={onSave} isLoading={isSaving}>
                Save schedule
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
