"use client";

import { useReducedMotion } from "motion/react";

import {
  crossfade,
  crossfadeInstant,
  staggerItem,
  staggerList,
} from "@/lib/sj/motion";

/** Motion variants for `/home` — DESIGN.md §12, motion.md. */
export function useHomeMotionVariants() {
  const reduced = useReducedMotion();
  return {
    reduced,
    staggerList: reduced ? crossfadeInstant : staggerList,
    staggerItem: reduced ? crossfadeInstant : staggerItem,
    crossfade: reduced ? crossfadeInstant : crossfade,
  };
}
