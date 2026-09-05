"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { crossfadeInstant, crossfadeOpacity } from "@/lib/sj/motion";

export default function CourseStudentInfoTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const variants = reducedMotion ? crossfadeInstant : crossfadeOpacity;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-w-0"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
