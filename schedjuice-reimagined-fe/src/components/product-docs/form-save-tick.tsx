"use client";

import { Check } from "iconoir-react";
import { AnimatePresence, motion } from "motion/react";

import { savedTick } from "@/lib/sj/motion";

export function FormSaveTick({
  visible,
  label = "Saved",
}: {
  visible: boolean;
  label?: string;
}) {
  return (
    <AnimatePresence mode="popLayout">
      {visible ? (
        <motion.span
          key="saved"
          variants={savedTick}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex items-center gap-1 text-sm text-success motion-reduce:transition-none"
        >
          <Check width={14} height={14} aria-hidden />
          {label}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
