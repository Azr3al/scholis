"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";

export function ImageShimmer({
  className,
  duration = 2,
  label = "Loading preview",
}: {
  className?: string;
  duration?: number;
  label?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-skeleton",
        className,
      )}
    >
      {reduced ? null : (
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-[length:250%_100%] bg-no-repeat"
          initial={{ backgroundPosition: "100% center" }}
          animate={{ backgroundPosition: "0% center" }}
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent calc(50% - 4rem), var(--color-surface), transparent calc(50% + 4rem))",
          }}
          transition={{
            duration,
            ease: "linear",
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
      )}
    </div>
  );
}
