"use client";

import { cn } from "@/lib/utils";
import { memo, useMemo } from "react";

export function TextShimmer({
  children,
  className,
  duration = 2,
  spread = 2,
}: {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
}) {
  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread],
  );

  return (
    <span
      className={cn("sj-text-shimmer relative inline-block", className)}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          "--shimmer-duration": `${duration}s`,
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  );
}

export const Shimmer = memo(TextShimmer);
