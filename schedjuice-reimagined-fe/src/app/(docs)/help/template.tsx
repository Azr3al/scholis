"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";

import { crossfade } from "@/lib/sj/motion";

export default function HelpTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={crossfade}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-w-0 flex-1"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
