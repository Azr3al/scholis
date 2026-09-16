"use client";

import type { ReactNode } from "react";
import { RoughUnderline } from "@/components/primitives/decoration/rough-underline";
import { cn } from "@/lib/utils";

export function HandHighlight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-block", className)}>
      {children}
      <RoughUnderline className="pointer-events-none absolute inset-x-0 -bottom-1 text-brand" />
    </span>
  );
}
