"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import {
  crossfadeInstant,
  staggerItem,
  staggerList,
} from "@/lib/sj/motion";

export function TeacherAssignStepContent({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={reduced ? crossfadeInstant : staggerList}
      initial="hidden"
      animate="show"
      exit="exit"
      className="space-y-4"
    >
      {children}
    </motion.div>
  );
}

export function TeacherAssignStepBlock({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div variants={reduced ? crossfadeInstant : staggerItem}>
      {children}
    </motion.div>
  );
}
